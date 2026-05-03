import { IModalityModule } from "./IModalityModule.js";

/**
 * GestureModule — tracks hand position using MediaPipe Hands.
 *
 * Emits events:
 *   - "position"  → { x: number, y: number }           (normalized 0-1, smoothed)
 *   - "handFound" → { landmarks: [...] }                (when hand appears)
 *   - "handLost"  → {}                                  (when hand disappears)
 *
 * Usage:
 *   const gesture = new GestureModule({ smoothing: 0.4, videoElement: videoEl });
 *   gesture.onData(event => console.log(event));
 *   gesture.start();
 */
export class GestureModule extends IModalityModule {
  /**
   * @param {object} config
   * @param {number}      config.smoothing     - EMA smoothing factor 0-1 (default: 0.4)
   * @param {HTMLElement} config.videoElement  - optional: existing <video> element to use
   * @param {number}      config.indexFinger   - landmark index for pointer (default: 8 = index tip)
   */
  constructor(config = {}) {
    super("gesture");
    this._smoothing = config.smoothing ?? 0.4;
    this._videoElement = config.videoElement || null;
    this._fingerIndex = config.indexFinger ?? 8;
    this._smoothed = null;
    this._hands = null;
    this._camera = null;
    this._handPresent = false;
  }

  getCapabilities() {
    return ["position", "handFound", "handLost"];
  }

  async start() {
    if (this._running) return;
    this._running = true;

    // Dynamically load MediaPipe (CDN), so toolkit has no hard dependency
    await this._loadMediaPipe();
    await this._initCamera();
  }

  stop() {
    this._running = false;
    if (this._camera) {
      this._camera.stop();
      this._camera = null;
    }
    if (this._videoElement && !this._externalVideo) {
      const stream = this._videoElement.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
    this._smoothed = null;
    this._handPresent = false;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _applyEMA(raw) {
    if (!this._smoothed) {
      this._smoothed = { x: raw.x, y: raw.y };
    } else {
      const a = this._smoothing;
      this._smoothed = {
        x: a * raw.x + (1 - a) * this._smoothed.x,
        y: a * raw.y + (1 - a) * this._smoothed.y,
      };
    }
    return { ...this._smoothed };
  }

  async _loadMediaPipe() {
    // Only load if not already available globally
    if (window.Hands) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async _initCamera() {
    // Create video element if not provided
    if (!this._videoElement) {
      this._externalVideo = false;
      this._videoElement = document.createElement("video");
      this._videoElement.style.cssText =
        "position:fixed;bottom:10px;right:10px;width:160px;height:90px;border-radius:8px;opacity:0.7;z-index:999;transform:scaleX(-1)";
      document.body.appendChild(this._videoElement);
    } else {
      this._externalVideo = true;
    }

    this._hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results) => {
      if (!this._running) return;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const tip = landmarks[this._fingerIndex];

        if (!this._handPresent) {
          this._handPresent = true;
          this._emit("handFound", { landmarks });
        }

        // Mirror X because the video feed is displayed with scaleX(-1)
        // so drawing follows the finger in the mirrored view
        const smoothed = this._applyEMA({ x: 1 - tip.x, y: tip.y });
        this._emit("position", smoothed);
      } else {
        if (this._handPresent) {
          this._handPresent = false;
          this._smoothed = null;
          this._emit("handLost", {});
        }
      }
    });

    this._camera = new window.Camera(this._videoElement, {
      onFrame: async () => {
        if (this._running && this._hands) {
          await this._hands.send({ image: this._videoElement });
        }
      },
      width: 640,
      height: 480,
    });

    await this._camera.start();
  }
}
