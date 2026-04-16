/**
 * CanvasRenderer — handles all canvas drawing operations for Smart Paint.
 * Pure UI class — knows nothing about modalities or fusion.
 */
export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._isDrawing = false;
    this._lastX = null;
    this._lastY = null;
    this._brushColor = "#000000";
    this._brushSize = 4;
    this._background = "#ffffff";

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._fillBackground();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Draw a point at normalized coordinates (0-1). */
  drawAt(normX, normY) {
    const x = normX * this._canvas.width;
    const y = normY * this._canvas.height;

    this._ctx.strokeStyle = this._brushColor;
    this._ctx.lineWidth = this._brushSize;
    this._ctx.lineCap = "round";
    this._ctx.lineJoin = "round";

    if (this._lastX !== null && this._isDrawing) {
      this._ctx.beginPath();
      this._ctx.moveTo(this._lastX, this._lastY);
      this._ctx.lineTo(x, y);
      this._ctx.stroke();
    } else {
      // Draw a dot for single-frame touch
      this._ctx.beginPath();
      this._ctx.arc(x, y, this._brushSize / 2, 0, Math.PI * 2);
      this._ctx.fillStyle = this._brushColor;
      this._ctx.fill();
    }

    this._lastX = x;
    this._lastY = y;
    this._isDrawing = true;
  }

  /** Activate drawing mode. */
  activateDraw() {
    this._isDrawing = true;
    this._lastX = null;
    this._lastY = null;
    this._showStatus("Drawing mode ON", "green");
  }

  /** Stop drawing mode. */
  stopDraw() {
    this._isDrawing = false;
    this._lastX = null;
    this._lastY = null;
    this._showStatus("Drawing mode OFF", "gray");
  }

  /** Set background color by name or CSS color. */
  setBackground(colorName, rgb = null) {
    if (rgb) {
      this._background = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    } else {
      this._background = colorName;
    }
    this._fillBackground();
    this._showStatus(`Background: ${colorName}`, "blue");
  }

  /** Clear the canvas. */
  clear() {
    this._fillBackground();
    this._isDrawing = false;
    this._lastX = null;
    this._lastY = null;
    this._showStatus("Canvas cleared", "orange");
  }

  /** Set brush color (CSS color string). */
  setBrushColor(color) {
    this._brushColor = color;
  }

  /** Set brush size in pixels. */
  setBrushSize(size) {
    this._brushSize = Math.max(1, size);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _fillBackground() {
    this._ctx.fillStyle = this._background;
    this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
  }

  _resize() {
    const imageData = this._ctx.getImageData(
      0, 0, this._canvas.width, this._canvas.height
    );
    this._canvas.width  = this._canvas.offsetWidth  || 800;
    this._canvas.height = this._canvas.offsetHeight || 600;
    this._fillBackground();
    // Attempt to restore content (may be imperfect on resize)
    try { this._ctx.putImageData(imageData, 0, 0); } catch (_) {}
  }

  _showStatus(msg, color = "black") {
    const el = document.getElementById("status");
    if (el) {
      el.textContent = msg;
      el.style.color = color;
      clearTimeout(this._statusTimer);
      this._statusTimer = setTimeout(() => {
        el.textContent = "Listening...";
        el.style.color = "gray";
      }, 2000);
    }
  }
}
