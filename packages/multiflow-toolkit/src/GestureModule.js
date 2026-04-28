import { IModalityModule } from "./IModalityModule.js";

/**
 * GestureModule — tracks one hand using MediaPipe Tasks Vision HandLandmarker.
 *
 * This class is part of the reusable toolkit layer. It does not know anything
 * about a specific app such as Smart Paint. Instead, it emits generic gesture
 * events that applications can interpret however they want.
 *
 * Main responsibilities:
 *   1. Start or reuse a webcam/video source.
 *   2. Load and initialize MediaPipe HandLandmarker.
 *   3. Process video frames efficiently.
 *   4. Convert hand landmarks into pointer coordinates.
 *   5. Detect pinch-based drawing state.
 *   6. Emit normalized, viewport, and target-element coordinates.
 *
 * Emits events:
 *   - "position"  → {
 *        x: number,                    // normalized viewport X, 0–1
 *        y: number,                    // normalized viewport Y, 0–1
 *        clientX: number,              // viewport pixel X
 *        clientY: number,              // viewport pixel Y
 *        targetX?: number,             // pixel X inside targetElement
 *        targetY?: number,             // pixel Y inside targetElement
 *        targetNormX?: number,         // normalized X inside targetElement, 0–1
 *        targetNormY?: number,         // normalized Y inside targetElement, 0–1
 *        isInsideTarget?: boolean,     // true if pointer is inside targetElement
 *        drawing: boolean,             // true while pinch gesture is active
 *        pinchDistance: number,        // distance between thumb tip and index tip
 *        velocity: number,             // approximate pointer movement speed
 *        landmarks?: [...]             // optional full MediaPipe landmarks
 *     }
 *
 *   - "drawStart" → { pinchDistance: number }
 *   - "drawEnd"   → { pinchDistance: number, reason?: string }
 *   - "handFound" → { landmarks: [...] }
 *   - "handLost"  → {}
 *
 * Important design note:
 *   Hand visible does not automatically mean "draw".
 *   Hand visible means "track position".
 *   Pinch gesture means "drawing intent".
 */
export class GestureModule extends IModalityModule {
  constructor(config = {}) {
    super("gesture");

    /**
     * Optional externally managed <video> element.
     *
     * If the application passes a video element, this module assumes the app is
     * responsible for starting the camera stream. This is useful when multiple
     * modules, such as gesture tracking and color detection, share one webcam.
     *
     * If no video element is provided, this module creates its own hidden/small
     * preview video and opens the camera itself.
     */
    this._videoElement = config.videoElement || null;
    this._externalVideo = !!config.videoElement;

    /**
     * Optional DOM element used for automatic coordinate mapping.
     *
     * Example:
     *   targetElement: document.getElementById("canvas")
     *
     * When provided, every "position" event includes coordinates relative to
     * that element:
     *   - targetX / targetY in pixels
     *   - targetNormX / targetNormY normalized to 0–1
     *   - isInsideTarget boolean
     *
     * This makes the toolkit more reusable because each web app can pass its
     * own interaction surface without writing custom coordinate conversion.
     */
    this._targetElement = config.targetElement || null;

    /**
     * Reserved for future coordinate strategies.
     *
     * Currently the implementation maps normalized hand coordinates to viewport
     * coordinates and then optionally into a target element.
     */
    this._coordinateMode = config.coordinateMode ?? "viewport";

    /**
     * Camera resolution preset.
     *
     * "high" is the default because 1280×720 is usually a good balance between
     * tracking accuracy and browser performance.
     */
    this._resolution = config.resolution ?? "high";

    /**
     * Debug mode prints throttled diagnostic logs.
     *
     * Keep false in normal use because console logging can cause frame stutters
     * in real-time browser applications.
     */
    this._debug = config.debug ?? false;

    /**
     * Full landmark arrays are useful for debugging and advanced apps, but they
     * are relatively heavy to emit every frame. By default, "position" events
     * stay lightweight and do not include landmarks.
     */
    this._emitLandmarks = config.emitLandmarks ?? false;

    /**
     * MediaPipe delegate.
     *
     * "GPU" asks MediaPipe Tasks Vision to use GPU acceleration where available.
     * Browsers may still choose their own internal implementation depending on
     * platform support.
     */
    this._delegate = config.delegate ?? "GPU";

    /**
     * MediaPipe WASM files location.
     *
     * FilesetResolver uses this to load the runtime files required by
     * @mediapipe/tasks-vision.
     */
    this._wasmBaseUrl =
      config.wasmBaseUrl ??
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";

    /**
     * HandLandmarker model file.
     *
     * This is the float16 hand landmark model hosted by Google. Applications can
     * override this if they want to self-host the model.
     */
    this._modelAssetPath =
      config.modelAssetPath ??
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

    /**
     * MediaPipe tracking configuration.
     *
     * numHands:
     *   One hand is enough for this interaction model and is cheaper to process.
     *
     * confidence values:
     *   These defaults are intentionally moderate. Setting them too high can make
     *   tracking drop out more often in imperfect lighting or motion blur.
     */
    this._numHands = config.numHands ?? 1;
    this._minHandDetectionConfidence =
      config.minHandDetectionConfidence ?? 0.65;
    this._minHandPresenceConfidence =
      config.minHandPresenceConfidence ?? 0.5;
    this._minTrackingConfidence =
      config.minTrackingConfidence ?? 0.5;

    /**
     * Pointer landmark configuration.
     *
     * Landmark 8 is the index fingertip. It is the most natural drawing point.
     * The implementation later blends it with landmark 5, the index knuckle, to
     * reduce fingertip jitter.
     */
    this._fingerIndex = config.indexFinger ?? 8;

    /**
     * Pinch thresholds.
     *
     * A pinch is detected by measuring the distance between:
     *   - landmark 4: thumb tip
     *   - landmark 8: index fingertip
     *
     * Two thresholds are used instead of one:
     *   - pinchStartThreshold: starts drawing
     *   - pinchEndThreshold: stops drawing
     *
     * This is called hysteresis. It prevents rapid flickering when the fingers
     * hover near a single threshold.
     */
    this._pinchStartThreshold = config.pinchStartThreshold ?? 0.045;
    this._pinchEndThreshold = config.pinchEndThreshold ?? 0.075;

    /**
     * Small cooldown for drawStart/drawEnd transitions.
     *
     * This prevents noisy frames from causing repeated start/end events in very
     * quick succession.
     */
    this._drawStateCooldownMs = config.drawStateCooldownMs ?? 80;
    this._lastDrawStateChange = 0;

    /**
     * Smoothing and anti-jitter state.
     *
     * _smoothing is kept as a configurable base value, but the actual smoothing
     * function below uses adaptive smoothing based on movement speed.
     *
     * _maxJumpDistance rejects sudden one-frame teleports, which are usually bad
     * landmark estimates rather than real hand movement.
     */
    this._smoothing = config.smoothing ?? 0.65;
    this._maxJumpDistance = config.maxJumpDistance ?? 0.16;
    this._smoothed = null;
    this._lastVelocity = 0;

    /**
     * MediaPipe Tasks objects.
     *
     * _vision is the resolved runtime fileset.
     * _handLandmarker is the actual model instance used for detectForVideo().
     */
    this._vision = null;
    this._handLandmarker = null;

    /**
     * Runtime tracking state.
     */
    this._stream = null;
    this._handPresent = false;
    this._isDrawing = false;

    /**
     * Frame scheduling and backpressure state.
     *
     * _processingFrame prevents overlapping inference calls.
     * _lastVideoTime avoids processing the same video frame twice.
     * _droppedFrames and _processedFrames are useful diagnostics.
     */
    this._processingFrame = false;
    this._frameLoopActive = false;
    this._lastVideoTime = -1;
    this._droppedFrames = 0;
    this._processedFrames = 0;

    /**
     * Debug logging state.
     *
     * Logs are throttled so debug mode does not spam the console every frame.
     */
    this._lastDebugLog = 0;
    this._debugLogIntervalMs = config.debugLogIntervalMs ?? 500;
  }

  /**
   * Describes the event types this module can emit.
   *
   * The FusionEngine or applications can inspect this if they want to understand
   * what a modality module supports.
   */
  getCapabilities() {
    return ["position", "handFound", "handLost", "drawStart", "drawEnd"];
  }

  /**
   * Starts the gesture module.
   *
   * Startup order matters:
   *   1. Load MediaPipe Tasks Vision runtime.
   *   2. Initialize or reuse the video source.
   *   3. Create the HandLandmarker model.
   *   4. Start the video frame processing loop.
   */
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

  /**
   * Stops tracking and releases owned resources.
   *
   * If the video element was provided by the application, this module does not
   * remove it and does not stop the stream. That prevents one module from
   * accidentally killing a shared webcam used by another module.
   */
  stop() {
    this._running = false;
    this._frameLoopActive = false;
    this._processingFrame = false;

    // Close the MediaPipe model if the API exposes a close method.
    if (this._handLandmarker && typeof this._handLandmarker.close === "function") {
      this._handLandmarker.close();
    }

    this._handLandmarker = null;
    this._vision = null;

    // Stop camera tracks only if this module created the stream itself.
    if (this._stream && !this._externalVideo) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }

    // Remove the internally created video preview if this module created it.
    if (this._videoElement && !this._externalVideo) {
      if (this._videoElement.parentNode) {
        this._videoElement.parentNode.removeChild(this._videoElement);
      }
      this._videoElement = null;
    }

    // Reset all per-run tracking state.
    this._smoothed = null;
    this._lastVelocity = 0;
    this._handPresent = false;
    this._isDrawing = false;
    this._lastVideoTime = -1;
    this._droppedFrames = 0;
    this._processedFrames = 0;
  }

  /**
   * Dynamically imports MediaPipe Tasks Vision.
   *
   * This keeps the toolkit lightweight until gesture tracking is actually used.
   * The loaded constructors are stored on window so repeated GestureModule
   * instances do not import the same library again.
   */
  async _loadMediaPipeTasks() {
    if (window.FilesetResolver && window.HandLandmarker) return;

    await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18"
    ).then((module) => {
      window.FilesetResolver = module.FilesetResolver;
      window.HandLandmarker = module.HandLandmarker;
    });
  }

  /**
   * Initializes MediaPipe HandLandmarker.
   *
   * runningMode: "VIDEO" is required because we call detectForVideo() on a live
   * video stream instead of analyzing independent still images.
   */
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

  /**
   * Initializes the video source.
   *
   * If no video element was supplied, this module creates one and opens the
   * camera. If a video element was supplied, the app is expected to have already
   * attached a stream to it.
   */
  async _initVideo() {
    if (!this._videoElement) {
      this._externalVideo = false;

      this._videoElement = document.createElement("video");
      this._videoElement.autoplay = true;
      this._videoElement.playsInline = true;
      this._videoElement.muted = true;

      /**
       * Small mirrored preview.
       *
       * The video preview is mirrored with scaleX(-1), which matches common
       * webcam UX. The tracking coordinates are mirrored later as well so the
       * pointer follows what the user sees.
       */
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

    /**
     * Only open the webcam if this module owns the video.
     *
     * In apps with multiple camera-based modules, such as color detection and
     * gesture tracking, a shared video stream should usually be created by the
     * application and passed into each module.
     */
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

  /**
   * Converts a named resolution preset into camera constraints.
   *
   * Higher resolution can improve landmark precision, but can also increase
   * browser pipeline latency. 1280×720 is usually the best default.
   */
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

  /**
   * Starts the frame loop.
   *
   * requestVideoFrameCallback is preferred because it runs when the browser has
   * an actual new video frame. This avoids unnecessary inference calls when the
   * screen refreshes but the webcam frame has not changed.
   *
   * requestAnimationFrame is used as a compatibility fallback.
   */
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

  /**
   * Handles a browser video-frame callback.
   *
   * metadata.mediaTime identifies the video frame, allowing _processFrame() to
   * skip duplicate frames.
   */
  async _onVideoFrame(now, metadata) {
    if (!this._running || !this._frameLoopActive) return;

    await this._processFrame(metadata?.mediaTime);

    // Schedule the next video-frame callback only after this one completes.
    if (this._running && this._frameLoopActive && this._videoElement) {
      this._videoElement.requestVideoFrameCallback((nextNow, nextMetadata) => {
        this._onVideoFrame(nextNow, nextMetadata);
      });
    }
  }

  /**
   * Fallback frame loop for browsers without requestVideoFrameCallback.
   */
  async _onAnimationFrame(time) {
    if (!this._running || !this._frameLoopActive) return;

    await this._processFrame(this._videoElement?.currentTime);

    if (this._running && this._frameLoopActive) {
      requestAnimationFrame((nextTime) => {
        this._onAnimationFrame(nextTime);
      });
    }
  }

  /**
   * Runs hand detection on one video frame.
   *
   * This method includes two important real-time safeguards:
   *
   *   1. Duplicate-frame skipping:
   *      If the video timestamp has not changed, do not run inference again.
   *
   *   2. Backpressure:
   *      If the previous inference is still running, skip this frame instead of
   *      queueing work. Dropping a late frame is better than processing stale
   *      frames and causing visible jumps.
   */
  async _processFrame(videoTime) {
    if (!this._running || !this._handLandmarker || !this._videoElement) return;

    // Wait until the video has current frame data.
    if (this._videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    // Avoid processing the same camera frame more than once.
    if (videoTime != null && videoTime === this._lastVideoTime) {
      return;
    }

    this._lastVideoTime = videoTime;

    // Do not allow overlapping detectForVideo calls.
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

  /**
   * Converts raw MediaPipe results into toolkit events.
   *
   * This is the main interpretation step:
   *   - detect whether a hand is present
   *   - compute pointer position
   *   - compute pinch distance
   *   - reject outlier frames
   *   - smooth the pointer
   *   - map coordinates to viewport/target
   *   - emit a "position" event
   */
  _handleResults(results) {
    if (!this._running) return;

    const landmarksList = results?.landmarks;
    const hasHand = landmarksList && landmarksList.length > 0;

    if (!hasHand) {
      this._handleNoHand();
      return;
    }

    const landmarks = landmarksList[0];

    /**
     * Emit handFound only once when the hand appears.
     *
     * We do not emit handFound on every frame, otherwise consumers would receive
     * repeated presence events instead of a clean state transition.
     */
    if (!this._handPresent) {
      this._handPresent = true;
      this._emit("handFound", { landmarks });

      if (this._debug) {
        console.log("[GestureModule] handFound");
      }
    }

    const pointer = this._getPointer(landmarks);
    const pinchDistance = this._getPinchDistance(landmarks);

    /**
     * Mirror X so the pointer follows the mirrored webcam preview.
     *
     * MediaPipe landmarks are reported in camera image coordinates. Since the
     * preview is shown with scaleX(-1), we invert X here.
     */
    const rawPoint = {
      x: 1 - pointer.x,
      y: pointer.y,
    };

    /**
     * Reject improbable one-frame jumps before they affect smoothing or drawing.
     *
     * This handles occasional bad landmark estimates where the fingertip appears
     * to teleport.
     */
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

    // Update pinch/drawing state before emitting the current position.
    this._updateDrawingState(pinchDistance);

    // Smooth raw coordinates and map them into useful coordinate spaces.
    const smoothed = this._applyAdaptiveEMA(rawPoint);
    const coords = this._mapCoordinates(smoothed.x, smoothed.y);

    /**
     * Final position payload.
     *
     * The payload intentionally contains several coordinate formats so different
     * applications can choose the most convenient one.
     */
    const payload = {
      ...coords,
      velocity: smoothed.velocity,
      drawing: this._isDrawing,
      pinchDistance,
    };

    // Optional heavy debug/advanced data.
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

  /**
   * Handles transition from "hand present" to "no hand".
   *
   * If the user was drawing when the hand disappeared, the module emits drawEnd
   * first so consumers can safely close the current stroke.
   */
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

  /**
   * Returns a stabilized pointer position from hand landmarks.
   *
   * Pure fingertip tracking can be jittery. To reduce jitter while keeping the
   * pointer close to the fingertip, this blends:
   *
   *   - 85% index fingertip, landmark 8
   *   - 15% index base/knuckle, landmark 5
   */
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

  /**
   * Calculates pinch distance.
   *
   * MediaPipe hand landmark indices:
   *   - 4 = thumb tip
   *   - 8 = index fingertip
   *
   * Smaller distance means stronger pinch. Z is included when available so the
   * value also responds to some depth changes.
   */
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

  /**
   * Detects impossible pointer jumps.
   *
   * The coordinates are normalized, so a jump of 0.16 means about 16% of the
   * viewport in one frame. That is usually more likely to be a bad detection
   * frame than intentional hand movement.
   */
  _isOutlier(raw) {
    if (!this._smoothed) return false;

    const dx = raw.x - this._smoothed.x;
    const dy = raw.y - this._smoothed.y;
    const distance = Math.hypot(dx, dy);

    return distance > this._maxJumpDistance;
  }

  /**
   * Adaptive exponential moving average.
   *
   * The filter changes responsiveness depending on pointer speed:
   *
   *   - Fast movement:
   *       higher alpha, follows hand more closely
   *
   *   - Slow movement:
   *       lower alpha, smooths small jitter
   *
   * This gives better drawing feel than one fixed smoothing value.
   */
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
      alpha = 0.85; // Fast hand movement: prioritize responsiveness.
    } else if (velocity > 0.018) {
      alpha = 0.7; // Normal drawing movement.
    } else {
      alpha = 0.45; // Near-still hand: prioritize stability.
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

  /**
   * Maps normalized pointer coordinates to viewport and target-element spaces.
   *
   * Returned coordinate formats:
   *
   *   x, y:
   *     Normalized viewport coordinates in the range 0–1.
   *
   *   clientX, clientY:
   *     Pixel coordinates relative to the browser viewport.
   *
   *   targetX, targetY:
   *     Pixel coordinates inside the configured targetElement.
   *
   *   targetNormX, targetNormY:
   *     Normalized 0–1 coordinates inside targetElement.
   *
   *   isInsideTarget:
   *     Whether the pointer is currently inside targetElement.
   *
   * This lets the same gesture module work across different applications and
   * layouts without app-specific coordinate math inside the toolkit.
   */
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

  /**
   * Updates drawing state from pinch distance.
   *
   * Uses hysteresis:
   *   - closed enough → drawStart
   *   - open enough   → drawEnd
   *
   * The gap between thresholds prevents flicker when fingers are near the
   * boundary.
   */
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

  /**
   * Throttled debug logger.
   *
   * Realtime modules can run 30–60 times per second. Logging every frame can
   * cause visible stutter, so debug output is rate-limited.
   */
  _debugLog(label, data) {
    if (!this._debug) return;

    const now = Date.now();
    if (now - this._lastDebugLog < this._debugLogIntervalMs) return;

    this._lastDebugLog = now;
    console.log(label, data);
  }
}
