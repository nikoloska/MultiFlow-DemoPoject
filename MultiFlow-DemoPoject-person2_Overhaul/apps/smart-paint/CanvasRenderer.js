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
    this._brushType = "magic"; // 'magic' | 'pencil' | 'eraser'
    this._background = "#ffffff";
    this._strokeHistory = []; // pixel coords for current stroke (circle detection)

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._fillBackground();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Begin a new stroke without changing global paint mode. */
beginStroke() {
  this._isDrawing = false;
  this._lastX = null;
  this._lastY = null;
  this._strokeHistory = [];
}

/** End the current stroke without leaving painting mode. */
endStroke() {
  this._checkAndDrawSun(this._strokeHistory);
  this._isDrawing = false;
  this._lastX = null;
  this._lastY = null;
  this._strokeHistory = [];
}

  /** Draw a point at normalized coordinates (0-1). */
  drawAt(normX, normY) {
    const x = normX * this._canvas.width;
    const y = normY * this._canvas.height;
    const ctx = this._ctx;

    // Track stroke history for shape detection (not for eraser)
    if (this._brushType !== "eraser") {
      this._strokeHistory.push({ x, y });
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this._brushType === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 60;
      ctx.shadowBlur = 0;
    } else if (this._brushType === "magic") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = this._brushColor;
      ctx.shadowBlur = 15;
      ctx.shadowColor = this._brushColor;
      ctx.lineWidth = 8 + Math.random() * 5;
    } else {
      // pencil
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = this._brushColor;
      ctx.shadowBlur = 0;
      ctx.lineWidth = this._brushSize;
    }

    if (this._lastX !== null && this._isDrawing) {
      ctx.beginPath();
      ctx.moveTo(this._lastX, this._lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // Draw a dot for single-frame touch
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.arc(x, y, (ctx.lineWidth || this._brushSize) / 2, 0, Math.PI * 2);
      ctx.fillStyle = this._brushType === "eraser" ? "rgba(0,0,0,1)" : this._brushColor;
      ctx.fill();
    }

    // Reset composite/shadow so other drawing isn't affected
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;

    this._lastX = x;
    this._lastY = y;
    this._isDrawing = true;
  }

  /** Activate drawing mode. */
  activateDraw() {
    this._isDrawing = true;
    this._lastX = null;
    this._lastY = null;
    this._strokeHistory = [];
    this._showStatus("Drawing mode ON", "#2ecc71");
  }

  /** Stop drawing mode — check for circle and draw golden sun if detected. */
  stopDraw() {
    this._checkAndDrawSun(this._strokeHistory);
    this._isDrawing = false;
    this._lastX = null;
    this._lastY = null;
    this._strokeHistory = [];
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
    this._showStatus(`Background: ${colorName}`, "#3498db");
  }

  /** Clear the canvas. */
  clear() {
    this._strokeHistory = [];
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

  /** Set brush type: 'magic' | 'pencil' | 'eraser' */
  setBrushType(type) {
    this._brushType = type;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * If the stroke looks like a closed circle, draw a golden sun at its center.
   * Matches baseDemo logic exactly.
   */
  _checkAndDrawSun(points) {
    if (points.length < 15) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;
    const dist = Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].y - points[points.length - 1].y
    );

    // Closed-ish circle: start/end close together, width/height similar, not too small
    if (dist < 120 && Math.abs(w - h) < 100 && w > 40) {
      const cx = minX + w / 2;
      const cy = minY + h / 2;
      const r = w / 3;
      const ctx = this._ctx;

      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;

      // Sun body
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#FFD700";
      ctx.fill();
      ctx.strokeStyle = "#FFA500";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Sun rays
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * (r + 20), cy + Math.sin(a) * (r + 20));
        ctx.stroke();
      }
    }
  }

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
