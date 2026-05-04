import { IModalityModule } from "./IModalityModule.js";

/**
 * GestureModule — tracks hand position using MediaPipe Tasks Vision HandLandmarker.
 *
 * Emits events:
 *   - "position"  → {
 *        x: number,
 *        y: number,
 *        clientX: number,
 *        clientY: number,
 *        targetX?: number,
 *        targetY?: number,
 *        targetNormX?: number,
 *        targetNormY?: number,
 *        isInsideTarget?: boolean,
 *        drawing: boolean,
 *        pinchDistance: number,
 *        velocity: number,
 *        landmarks?: [...]
 *     }
 *
 *   - "drawStart" → { pinchDistance: number }
 *   - "drawEnd"   → { pinchDistance: number, reason?: string }
 *   - "handFound" → { landmarks: [...] }
 *   - "handLost"  → {}
 */
export class GestureModule extends IModalityModule {
  constructor(config = {}) {
    super("gesture");

    this._videoElement = config.videoElement || null;
    this._externalVideo = !!config.videoElement;

    // New: optional target element for automatic coordinate mapping.
    this._targetElement = config.targetElement || null;
    this._coordinateMode = config.coordinateMode ?? "viewport";

    this._resolution = config.resolution ?? "high";
    this._debug = config.debug ?? false;
    this._emitLandmarks = config.emitLandmarks ?? false;

    this._delegate = config.delegate ?? "GPU";

    this._wasmBaseUrl =
      config.wasmBaseUrl ??
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";

    this._modelAssetPath =
      config.modelAssetPath ??
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

    this._numHands = config.numHands ?? 1;
    this._minHandDetectionConfidence =
      config.minHandDetectionConfidence ?? 0.65;
    this._minHandPresenceConfidence =
      config.minHandPresenceConfidence ?? 0.5;
    this._minTrackingConfidence =
      config.minTrackingConfidence ?? 0.5;

    this._fingerIndex = config.indexFinger ?? 8;
    this._pinchStartThreshold = config.pinchStartThreshold ?? 0.045;
    this._pinchEndThreshold = config.pinchEndThreshold ?? 0.075;
    this._drawStateCooldownMs = config.drawStateCooldownMs ?? 80;
    this._lastDrawStateChange = 0;

    this._smoothing = config.smoothing ?? 0.65;
    this._maxJumpDistance = config.maxJumpDistance ?? 0.16;
    this._smoothed = null;
    this._lastVelocity = 0;

    this._vision = null;
    this._handLandmarker = null;

    this._stream = null;
    this._handPresent = false;
    this._isDrawing = false;

    this._processingFrame = false;
    this._frameLoopActive = false;
    this._lastVideoTime = -1;
    this._droppedFrames = 0;
    this._processedFrames = 0;

    this._lastDebugLog = 0;
    this._debugLogIntervalMs = config.debugLogIntervalMs ?? 500;
  }

  getCapabilities() {
    return ["position", "handFound", "handLost", "drawStart", "drawEnd"];
  }

  async start() {
    if (this._running) return;

    this._running = true;

    try {
      await this._loadMediaPipeTasks();
      await this._initVideo();
      await this._initHandLandmarker();
      this._startFrameLoop();
    } catch (err) {
      console.warn("[GestureModule] Failed to start:", err);
      this._running = false;
      this.stop();
    }
  }

  stop() {
    this._running = false;
    this._frameLoopActive = false;
    this._processingFrame = false;

    if (this._handLandmarker && typeof this._handLandmarker.close === "function") {
      this._handLandmarker.close();
    }

    this._handLandmarker = null;
    this._vision = null;

    if (this._stream && !this._externalVideo) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }

    if (this._videoElement && !this._externalVideo) {
      if (this._videoElement.parentNode) {
        this._videoElement.parentNode.removeChild(this._videoElement);
      }
      this._videoElement = null;
    }

    this._smoothed = null;
    this._lastVelocity = 0;
    this._handPresent = false;
    this._isDrawing = false;
    this._lastVideoTime = -1;
    this._droppedFrames = 0;
    this._processedFrames = 0;
  }

  async _loadMediaPipeTasks() {
    if (window.FilesetResolver && window.HandLandmarker) return;

    await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18"
    ).then((module) => {
      window.FilesetResolver = module.FilesetResolver;
      window.HandLandmarker = module.HandLandmarker;
    });
  }

  async _initHandLandmarker() {
    this._vision = await window.FilesetResolver.forVisionTasks(
      this._wasmBaseUrl
    );

    this._handLandmarker = await window.HandLandmarker.createFromOptions(
      this._vision,
      {
        baseOptions: {
          modelAssetPath: this._modelAssetPath,
          delegate: this._delegate,
        },
        runningMode: "VIDEO",
        numHands: this._numHands,
        minHandDetectionConfidence: this._minHandDetectionConfidence,
        minHandPresenceConfidence: this._minHandPresenceConfidence,
        minTrackingConfidence: this._minTrackingConfidence,
      }
    );

    if (this._debug) {
      console.log("[GestureModule] HandLandmarker initialized", {
        delegate: this._delegate,
        runningMode: "VIDEO",
        numHands: this._numHands,
      });
    }
  }

  async _initVideo() {
    if (!this._videoElement) {
      this._externalVideo = false;

      this._videoElement = document.createElement("video");
      this._videoElement.autoplay = true;
      this._videoElement.playsInline = true;
      this._videoElement.muted = true;

      this._videoElement.style.cssText = [
        "position:fixed",
        "bottom:10px",
        "right:10px",
        "width:180px",
        "height:101px",
        "border-radius:8px",
        "opacity:0.75",
        "z-index:999",
        "object-fit:cover",
        "transform:scaleX(-1)",
      ].join(";");

      document.body.appendChild(this._videoElement);
    } else {
      this._externalVideo = true;
    }

    if (!this._externalVideo) {
      const { width, height } = this._getResolution();

      this._stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      });

      this._videoElement.srcObject = this._stream;
    }

    await this._videoElement.play();

    if (this._debug) {
      const track = this._videoElement.srcObject?.getVideoTracks?.()[0];
      console.log("[GestureModule] video started", {
        requestedResolution: this._resolution,
        actualSettings: track?.getSettings?.(),
      });
    }
  }

  _getResolution() {
    switch (this._resolution) {
      case "low":
        return { width: 640, height: 480 };

      case "medium":
        return { width: 960, height: 540 };

      case "ultra":
        return { width: 1920, height: 1080 };

      case "high":
      default:
        return { width: 1280, height: 720 };
    }
  }

  _startFrameLoop() {
    if (this._frameLoopActive) return;

    this._frameLoopActive = true;

    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      this._videoElement.requestVideoFrameCallback((now, metadata) => {
        this._onVideoFrame(now, metadata);
      });

      if (this._debug) {
        console.log("[GestureModule] using requestVideoFrameCallback pipeline");
      }
    } else {
      requestAnimationFrame((time) => {
        this._onAnimationFrame(time);
      });

      if (this._debug) {
        console.log("[GestureModule] using requestAnimationFrame fallback");
      }
    }
  }

  async _onVideoFrame(now, metadata) {
    if (!this._running || !this._frameLoopActive) return;

    await this._processFrame(metadata?.mediaTime);

    if (this._running && this._frameLoopActive && this._videoElement) {
      this._videoElement.requestVideoFrameCallback((nextNow, nextMetadata) => {
        this._onVideoFrame(nextNow, nextMetadata);
      });
    }
  }

  async _onAnimationFrame(time) {
    if (!this._running || !this._frameLoopActive) return;

    await this._processFrame(this._videoElement?.currentTime);

    if (this._running && this._frameLoopActive) {
      requestAnimationFrame((nextTime) => {
        this._onAnimationFrame(nextTime);
      });
    }
  }

  async _processFrame(videoTime) {
    if (!this._running || !this._handLandmarker || !this._videoElement) return;

    if (this._videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    if (videoTime != null && videoTime === this._lastVideoTime) {
      return;
    }

    this._lastVideoTime = videoTime;

    if (this._processingFrame) {
      this._droppedFrames++;
      return;
    }

    this._processingFrame = true;

    try {
      const timestampMs = performance.now();

      const results = this._handLandmarker.detectForVideo(
        this._videoElement,
        timestampMs
      );

      this._processedFrames++;
      this._handleResults(results);
    } catch (err) {
      if (this._debug) {
        console.warn("[GestureModule] detectForVideo failed:", err);
      }
    } finally {
      this._processingFrame = false;
    }
  }

  _handleResults(results) {
    if (!this._running) return;

    const landmarksList = results?.landmarks;
    const hasHand = landmarksList && landmarksList.length > 0;

    if (!hasHand) {
      this._handleNoHand();
      return;
    }

    const landmarks = landmarksList[0];

    if (!this._handPresent) {
      this._handPresent = true;
      this._emit("handFound", { landmarks });

      if (this._debug) {
        console.log("[GestureModule] handFound");
      }
    }

    const pointer = this._getPointer(landmarks);
    const pinchDistance = this._getPinchDistance(landmarks);

    const rawPoint = {
      x: 1 - pointer.x,
      y: pointer.y,
    };

    if (this._isOutlier(rawPoint)) {
      this._debugLog("[GestureModule] rejected outlier frame", {
        rawX: rawPoint.x.toFixed(3),
        rawY: rawPoint.y.toFixed(3),
        smoothedX: this._smoothed?.x?.toFixed(3),
        smoothedY: this._smoothed?.y?.toFixed(3),
        maxJumpDistance: this._maxJumpDistance,
      });

      return;
    }

    this._updateDrawingState(pinchDistance);

    const smoothed = this._applyAdaptiveEMA(rawPoint);
    const coords = this._mapCoordinates(smoothed.x, smoothed.y);

    const payload = {
      ...coords,
      velocity: smoothed.velocity,
      drawing: this._isDrawing,
      pinchDistance,
    };

    if (this._emitLandmarks) {
      payload.landmarks = landmarks;
    }

    this._emit("position", payload);

    this._debugLog("[GestureModule] position", {
      x: smoothed.x.toFixed(3),
      y: smoothed.y.toFixed(3),
      clientX: Math.round(coords.clientX),
      clientY: Math.round(coords.clientY),
      targetNormX: coords.targetNormX?.toFixed?.(3),
      targetNormY: coords.targetNormY?.toFixed?.(3),
      insideTarget: coords.isInsideTarget,
      drawing: this._isDrawing,
      pinchDistance: Number.isFinite(pinchDistance)
        ? pinchDistance.toFixed(4)
        : pinchDistance,
      velocity: smoothed.velocity.toFixed(4),
      processedFrames: this._processedFrames,
      droppedFrames: this._droppedFrames,
    });
  }

  _handleNoHand() {
    if (!this._handPresent) return;

    this._handPresent = false;
    this._smoothed = null;

    if (this._isDrawing) {
      this._isDrawing = false;
      this._emit("drawEnd", {
        pinchDistance: Infinity,
        reason: "handLost",
      });
    }

    this._emit("handLost", {});

    if (this._debug) {
      console.log("[GestureModule] handLost");
    }
  }

  _getPointer(landmarks) {
    const tip = landmarks[this._fingerIndex] || landmarks[8];
    const base = landmarks[5];

    if (!tip || !base) {
      return tip || { x: 0.5, y: 0.5, z: 0 };
    }

    return {
      x: tip.x * 0.85 + base.x * 0.15,
      y: tip.y * 0.85 + base.y * 0.15,
      z: (tip.z ?? 0) * 0.85 + (base.z ?? 0) * 0.15,
    };
  }

  _getPinchDistance(landmarks) {
    const thumb = landmarks[4];
    const index = landmarks[8];

    if (!thumb || !index) return Infinity;

    return Math.hypot(
      thumb.x - index.x,
      thumb.y - index.y,
      (thumb.z ?? 0) - (index.z ?? 0)
    );
  }

  _isOutlier(raw) {
    if (!this._smoothed) return false;

    const dx = raw.x - this._smoothed.x;
    const dy = raw.y - this._smoothed.y;
    const distance = Math.hypot(dx, dy);

    return distance > this._maxJumpDistance;
  }

  _applyAdaptiveEMA(raw) {
    if (!this._smoothed) {
      this._smoothed = { x: raw.x, y: raw.y };
      this._lastVelocity = 0;
      return { ...this._smoothed, velocity: 0 };
    }

    const dx = raw.x - this._smoothed.x;
    const dy = raw.y - this._smoothed.y;
    const velocity = Math.hypot(dx, dy);

    let alpha;

    if (velocity > 0.04) {
      alpha = 0.85;
    } else if (velocity > 0.018) {
      alpha = 0.7;
    } else {
      alpha = 0.45;
    }

    this._smoothed = {
      x: alpha * raw.x + (1 - alpha) * this._smoothed.x,
      y: alpha * raw.y + (1 - alpha) * this._smoothed.y,
    };

    this._lastVelocity = velocity;

    return {
      ...this._smoothed,
      velocity,
    };
  }

  _mapCoordinates(normX, normY) {
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth || 1;

    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 1;

    const clientX = normX * viewportWidth;
    const clientY = normY * viewportHeight;

    const mapped = {
      x: normX,
      y: normY,
      clientX,
      clientY,
    };

    if (this._targetElement) {
      const rect = this._targetElement.getBoundingClientRect();

      const targetX = clientX - rect.left;
      const targetY = clientY - rect.top;

      mapped.targetX = targetX;
      mapped.targetY = targetY;
      mapped.targetNormX = rect.width > 0 ? targetX / rect.width : 0;
      mapped.targetNormY = rect.height > 0 ? targetY / rect.height : 0;
      mapped.isInsideTarget =
        targetX >= 0 &&
        targetY >= 0 &&
        targetX <= rect.width &&
        targetY <= rect.height;
    }

    return mapped;
  }

  _updateDrawingState(pinchDistance) {
    const now = Date.now();

    if (now - this._lastDrawStateChange < this._drawStateCooldownMs) {
      return;
    }

    let nextDrawing = this._isDrawing;

    if (!this._isDrawing && pinchDistance < this._pinchStartThreshold) {
      nextDrawing = true;
    } else if (this._isDrawing && pinchDistance > this._pinchEndThreshold) {
      nextDrawing = false;
    }

    if (nextDrawing !== this._isDrawing) {
      this._isDrawing = nextDrawing;
      this._lastDrawStateChange = now;

      this._emit(this._isDrawing ? "drawStart" : "drawEnd", {
        pinchDistance,
      });

      if (this._debug) {
        console.log(
          `[GestureModule] ${this._isDrawing ? "drawStart" : "drawEnd"}`,
          { pinchDistance }
        );
      }
    }
  }

  _debugLog(label, data) {
    if (!this._debug) return;

    const now = Date.now();
    if (now - this._lastDebugLog < this._debugLogIntervalMs) return;

    this._lastDebugLog = now;
    console.log(label, data);
  }
}