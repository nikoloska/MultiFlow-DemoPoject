/**
 * Smart Paint — main application entry point.
 *
 * Structure:
 *   - Modality modules  → multiflow-toolkit (sensor logic)
 *   - Fusion rules      → fusionRules.js (app-specific intent mapping)
 *   - Canvas drawing    → CanvasRenderer.js (UI logic)
 *   - Wiring            → HERE (this file)
 */

import { FusionEngine, VoiceModule, GestureModule, ColorDetectionModule }
  from "../../packages/multiflow-toolkit/src/index.js";

import { smartPaintFusionRule }
  from "./fusionRules.js";

import { CanvasRenderer }
  from "./CanvasRenderer.js";

// ─── 1. Canvas ────────────────────────────────────────────────────────────────
const canvas = new CanvasRenderer(document.getElementById("canvas"));

// ─── 2. Shared video element for camera feed ──────────────────────────────────
const webcamVideo = document.getElementById("webcam-video");

// ─── 3. Modalities ────────────────────────────────────────────────────────────
const voice = new VoiceModule({
  commands: ["paint", "stop", "clear", "background", "color"],
});

const gesture = new GestureModule({
  smoothing: 0.25,
  videoElement: webcamVideo,  // reuse the header video element
});

const color = new ColorDetectionModule({
  intervalMs: 10,
  videoElement: webcamVideo, 
});

// ─── 4. Fusion Engine ─────────────────────────────────────────────────────────
const engine = new FusionEngine({ windowMs: 500 })
  .register(voice)
  .register(gesture)
  .register(color)
  .setFusionRule(smartPaintFusionRule);

// ─── 5. App state ─────────────────────────────────────────────────────────────
let isPainting = false;       // true between "paint" and "stop"
let lastDetectedColor = null; // { name, rgb } — updated continuously

// ─── 6. Continuous drawing via direct gesture listener ────────────────────────
// This is intentionally OUTSIDE the fusion engine so painting never times out.
// The fusion window (3 s) only governs command recognition, not stroke continuity.
gesture.onData((event) => {
  if (event.type === "position" && isPainting) {
    canvas.drawAt(event.payload.x, event.payload.y);
    window.indicatePulse?.("gesture");
  }
});

// ─── 7. Raw event handling ────────────────────────────────────────────────────
engine.onRawEvent((event) => {
  // Debug panel
  const debugEl = document.getElementById("debug");
  if (debugEl) {
    debugEl.textContent = `[${event.source}] ${event.type}: ${JSON.stringify(event.payload).slice(0, 60)}`;
  }

  // Track latest detected color and update indicator
  if (event.source === "color" && event.type === "color") {
    lastDetectedColor = event.payload;
    _updateColorIndicator(event.payload);
    window.indicatePulse?.("color");
  }

  if (event.source === "voice") {
    window.indicatePulse?.("voice");
  }
});

// ─── 8. Intent handling ───────────────────────────────────────────────────────
engine.onIntent(({ intent, ...args }) => {
  switch (intent) {
    case "activateDraw":
      // Apply detected color at the moment "paint" is said (late fusion)
      if (args.color) {
        _applyDetectedColor(args.color);
      } else if (lastDetectedColor) {
        _applyDetectedColor(lastDetectedColor);
      }
      isPainting = true;
      canvas.activateDraw();
      _setModeDisplay("PAINTING");
      break;

    case "stopDraw":
      isPainting = false;
      canvas.stopDraw();
      _setModeDisplay("IDLE");
      break;

    case "changeColor":
      // "color" command while painting → apply currently detected color
      _applyDetectedColor(args.color);
      break;

    case "setBackground":
      canvas.setBackground(args.color, args.rgb);
      break;

    case "clear":
      canvas.clear();
      break;
  }
});

// ─── 9. UI controls ───────────────────────────────────────────────────────────
document.getElementById("btn-start")?.addEventListener("click", async () => {
  document.getElementById("btn-start").disabled = true;
  document.getElementById("status").textContent = "Starting camera & models…";

  await engine.startAll();

  webcamVideo.style.display = "block";

  document.getElementById("btn-start").disabled = false;
  document.getElementById("status").textContent = "Listening…";
  document.getElementById("status").style.color = "#64748b";
});

document.getElementById("btn-stop")?.addEventListener("click", () => {
  isPainting = false;
  engine.stopAll();
  webcamVideo.style.display = "none";
  _setModeDisplay("IDLE");
  document.getElementById("status").textContent = "Stopped.";
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  canvas.clear();
});

// ─── 10. Brush controls ────────────────────────────────────────────────────────
document.getElementById("brush-magic")?.addEventListener("click", () => {
  canvas.setBrushType("magic");
});

document.getElementById("brush-pencil")?.addEventListener("click", () => {
  canvas.setBrushType("pencil");
});

document.getElementById("brush-eraser")?.addEventListener("click", () => {
  canvas.setBrushType("eraser");
});

document.getElementById("brush-color")?.addEventListener("input", (e) => {
  canvas.setBrushColor(e.target.value);
});

document.getElementById("brush-size")?.addEventListener("input", (e) => {
  canvas.setBrushSize(parseInt(e.target.value));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _applyDetectedColor(colorPayload) {
  if (!colorPayload || !colorPayload.rgb) return;
  const { r, g, b } = colorPayload.rgb;
  canvas.setBrushColor(`rgb(${r},${g},${b})`);
  const picker = document.getElementById("brush-color");
  if (picker) picker.value = _rgbToHex(r, g, b);
}

function _updateColorIndicator(colorPayload) {
  const dot   = document.getElementById("color-dot");
  const label = document.getElementById("color-label");
  if (dot && colorPayload.rgb) {
    const { r, g, b } = colorPayload.rgb;
    dot.style.background = `rgb(${r},${g},${b})`;
    dot.style.borderColor = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
  }
  if (label) label.textContent = colorPayload.name.toUpperCase();
}

function _setModeDisplay(mode) {
  const el = document.getElementById("mode-display");
  if (!el) return;
  el.textContent = mode;
  el.classList.toggle("painting", mode === "PAINTING");
}

function _rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
