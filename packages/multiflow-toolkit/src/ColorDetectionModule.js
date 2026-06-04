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

  /**
   * Detect the dominant color of the closest object in frame.
   *
   * Strategy:
   *   1. One getImageData call over the full canvas (efficient).
   *   2. Sample every STEP pixels. For each sample compute a weight:
   *        centerWeight  — pixels near the center count more (held objects are
   *                        usually centered and appear larger when close).
   *        satWeight     — vivid/saturated pixels count more (objects held up to
   *                        the camera are more colorful than plain backgrounds).
   *   3. Accumulate weighted sums into per-name color buckets.
   *   4. The bucket with the highest total weight is the dominant color.
   *   5. Emit the actual weighted-average RGB so the indicator shows the real hue.
   */
  _sample() {
    if (!this._videoElement || this._videoElement.readyState < 2) return;

    try {
      const W = this._canvas.width;
      const H = this._canvas.height;

      this._ctx.drawImage(this._videoElement, 0, 0, W, H);

      const imageData = this._ctx.getImageData(0, 0, W, H).data;
      const STEP = 6; // sample every 6 pixels — ~(320/6)*(240/6) ≈ 2100 samples

      const buckets = {}; // name → { weight, r, g, b }
      const cxF = (W - 1) / 2;
      const cyF = (H - 1) / 2;
      const maxDist = Math.hypot(cxF, cyF); // corner distance

      for (let py = 0; py < H; py += STEP) {
        for (let px = 0; px < W; px += STEP) {
          const idx = (py * W + px) * 4;
          const r = imageData[idx];
          const g = imageData[idx + 1];
          const b = imageData[idx + 2];

          // Saturation weight: vivid colors score higher than grey/white/black
          const max = Math.max(r, g, b) / 255;
          const min = Math.min(r, g, b) / 255;
          const sat = max === 0 ? 0 : (max - min) / max; // HSV saturation [0,1]
          const satWeight = 1 + sat * 3; // 1 for grey, 4 for fully saturated

          // Center weight: 2× at center, 1× at corners
          const dist = Math.hypot(px - cxF, py - cyF) / maxDist;
          const centerWeight = 2 - dist;

          const weight = centerWeight * satWeight;

          const name = this._matchColor({ r, g, b });
          if (!buckets[name]) buckets[name] = { weight: 0, r: 0, g: 0, b: 0 };
          buckets[name].weight += weight;
          buckets[name].r += r * weight;
          buckets[name].g += g * weight;
          buckets[name].b += b * weight;
        }
      }

      // Dominant color = highest accumulated weight
      let best = null;
      for (const [name, data] of Object.entries(buckets)) {
        if (!best || data.weight > best.weight) best = { name, ...data };
      }

      if (!best) return;

      const rgb = {
        r: Math.round(best.r / best.weight),
        g: Math.round(best.g / best.weight),
        b: Math.round(best.b / best.weight),
      };

      this._emit("color", { name: best.name, rgb });
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
