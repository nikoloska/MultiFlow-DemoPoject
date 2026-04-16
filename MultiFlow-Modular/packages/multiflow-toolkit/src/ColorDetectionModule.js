import { IModalityModule } from "./IModalityModule.js";

/**
 * ColorDetectionModule — samples the center of a webcam frame and maps
 * the RGB value to the nearest named color.
 *
 * Emits events of type "color" with payload: { name: string, rgb: {r,g,b} }
 *
 * Usage:
 *   const color = new ColorDetectionModule();
 *   color.onData(event => console.log(event.payload.name));
 *   color.start();
 */
export class ColorDetectionModule extends IModalityModule {
  /**
   * @param {object} config
   * @param {number}  config.intervalMs   - sampling rate in ms (default: 200)
   * @param {object}  config.colorMap     - custom { "name": [r,g,b] } map (optional)
   * @param {HTMLVideoElement} config.videoElement - reuse an existing video (optional)
   */
  constructor(config = {}) {
    super("color");
    this._intervalMs = config.intervalMs ?? 200;
    this._videoElement = config.videoElement || null;
    this._externalVideo = !!config.videoElement;
    this._canvas = null;
    this._ctx = null;
    this._intervalId = null;
    this._stream = null;

    // Default color map: name → [R, G, B]
    this._colorMap = config.colorMap || {
      red:     [220, 50,  50],
      green:   [50,  180, 50],
      blue:    [50,  50,  220],
      yellow:  [230, 220, 30],
      orange:  [230, 130, 30],
      purple:  [140, 50,  200],
      pink:    [230, 100, 170],
      cyan:    [30,  210, 210],
      white:   [240, 240, 240],
      black:   [20,  20,  20],
    };
  }

  getCapabilities() {
    return ["color"];
  }

  async start() {
    if (this._running) return;
    this._running = true;

    // Set up hidden canvas for pixel sampling
    this._canvas = document.createElement("canvas");
    this._canvas.width = 320;
    this._canvas.height = 240;
    this._ctx = this._canvas.getContext("2d");

    if (!this._videoElement) {
      this._videoElement = document.createElement("video");
      this._videoElement.style.display = "none";
      this._videoElement.autoplay = true;
      this._videoElement.playsInline = true;
      document.body.appendChild(this._videoElement);

      try {
        this._stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this._videoElement.srcObject = this._stream;
        await this._videoElement.play();
      } catch (err) {
        console.warn("[ColorDetectionModule] Camera access denied:", err);
        this._running = false;
        return;
      }
    }

    this._intervalId = setInterval(() => this._sample(), this._intervalMs);
  }

  stop() {
    this._running = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (!this._externalVideo && this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _sample() {
    if (!this._videoElement || this._videoElement.readyState < 2) return;

    try {
      this._ctx.drawImage(
        this._videoElement,
        0, 0,
        this._canvas.width,
        this._canvas.height
      );

      const cx = Math.floor(this._canvas.width / 2);
      const cy = Math.floor(this._canvas.height / 2);
      const pixel = this._ctx.getImageData(cx, cy, 1, 1).data;
      const rgb = { r: pixel[0], g: pixel[1], b: pixel[2] };
      const name = this._matchColor(rgb);

      this._emit("color", { name, rgb });
    } catch (e) {
      // Canvas tainted or video not ready — skip this frame
    }
  }

  _matchColor(rgb) {
    let best = null;
    let bestDist = Infinity;

    for (const [name, [r, g, b]] of Object.entries(this._colorMap)) {
      const dist =
        Math.pow(rgb.r - r, 2) +
        Math.pow(rgb.g - g, 2) +
        Math.pow(rgb.b - b, 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    return best;
  }
}
