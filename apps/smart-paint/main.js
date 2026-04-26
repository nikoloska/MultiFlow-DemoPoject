/**
 * Smart Paint — main application entry point.
 *
 * Structure:
 *   - Modality modules  → multiflow-toolkit (sensor logic)
 *   - Fusion rules      → fusionRules.js (app-specific intent mapping)
 *   - Canvas drawing    → CanvasRenderer.js (UI logic)
 *   - Wiring            → HERE (this file)
 */

/**
 *
 * Key improvement: color lock.
 *   The brush/background color is only applied when the user has held
 *   a stable color in front of the camera for 1.5s (locked color).
 *   Live color detection updates the indicator but does NOT affect the brush
 *   until intentionally locked.
 */
 
import { FusionEngine, VoiceModule, GestureModule, ColorDetectionModule }
  from "../../packages/multiflow-toolkit/src/index.js";
 
import { smartPaintFusionRule, getLockedColor, getColorProgress }
  from "./fusionRules.js";
 
import { CanvasRenderer } from "./CanvasRenderer.js";
 
// ─── 1. Canvas ────────────────────────────────────────────────────────────────
const canvas = new CanvasRenderer(document.getElementById("canvas"));
 
// ─── 2. Shared video element ──────────────────────────────────────────────────
const webcamVideo = document.getElementById("webcam-video");
 
// ─── 3. Modalities ────────────────────────────────────────────────────────────
const voice = new VoiceModule({
  commands: ["paint", "stop", "clear", "background", "color"],
});
 
const gesture = new GestureModule({
  smoothing:    0.25,
  videoElement: webcamVideo,
});
 
const color = new ColorDetectionModule({
  intervalMs:   80,   // slower than before — reduces flicker, saves CPU
  videoElement: webcamVideo,
});
 
// ─── 4. Fusion Engine ─────────────────────────────────────────────────────────
const engine = new FusionEngine({ windowMs: 3000 })
  .register(voice)
  .register(gesture)
  .register(color)
  .setFusionRule(smartPaintFusionRule);
 
// ─── 5. App state ─────────────────────────────────────────────────────────────
let isPainting = false;
 
// ─── 6. Continuous drawing — direct gesture listener outside fusion ───────────
gesture.onData((event) => {
  if (event.type === "position" && isPainting) {
    canvas.drawAt(event.payload.x, event.payload.y);
    window.indicatePulse?.("gesture");
  }
});
 
// ─── 7. Raw event handling ────────────────────────────────────────────────────
engine.onRawEvent((event) => {
  const debugEl = document.getElementById("debug");
  if (debugEl) {
    debugEl.textContent =
      `[${event.source}] ${event.type}: ${JSON.stringify(event.payload).slice(0, 60)}`;
  }
 
  if (event.source === "color" && event.type === "color") {
    // Update live color indicator (shows what camera sees right now)
    _updateLiveColorIndicator(event.payload);
    window.indicatePulse?.("color");
 
    // Update lock progress ring — calls getColorProgress() from fusionRules
    _updateLockProgress();
  }
 
  if (event.source === "voice") {
    window.indicatePulse?.("voice");
  }
});
 
// ─── 8. Intent handling ───────────────────────────────────────────────────────
engine.onIntent(({ intent, ...args }) => {
  switch (intent) {
 
    case "activateDraw":
      // Use locked color — stable color the user intentionally held up
      if (args.color) {
        _applyColor(args.color);
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
      _applyColor(args.color);
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
  const btn = document.getElementById("btn-start");
  btn.disabled = true;
  document.getElementById("status").textContent = "Starting camera & models…";
 
  await engine.startAll();
 
  webcamVideo.style.display = "block";
  btn.disabled = false;
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
 
document.getElementById("btn-clear")?.addEventListener("click", () => canvas.clear());
 
// Brush controls
document.getElementById("brush-magic")?.addEventListener("click",  () => canvas.setBrushType("magic"));
document.getElementById("brush-pencil")?.addEventListener("click", () => canvas.setBrushType("pencil"));
document.getElementById("brush-eraser")?.addEventListener("click", () => canvas.setBrushType("eraser"));
document.getElementById("brush-color")?.addEventListener("input",  (e) => canvas.setBrushColor(e.target.value));
document.getElementById("brush-size")?.addEventListener("input",   (e) => canvas.setBrushSize(parseInt(e.target.value)));
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function _applyColor(colorPayload) {
  if (!colorPayload?.rgb) return;
  const { r, g, b } = colorPayload.rgb;
  canvas.setBrushColor(`rgb(${r},${g},${b})`);
  const picker = document.getElementById("brush-color");
  if (picker) picker.value = _rgbToHex(r, g, b);
  // Update locked color indicator
  _updateLockedColorIndicator(colorPayload);
}
 
// Live indicator — what the camera sees right now (top dot, dimmer)
function _updateLiveColorIndicator(payload) {
  const dot   = document.getElementById("color-dot-live");
  const label = document.getElementById("color-label-live");
  if (dot && payload.rgb) {
    const { r, g, b } = payload.rgb;
    dot.style.background  = `rgb(${r},${g},${b})`;
    dot.style.borderColor = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
  }
  if (label) label.textContent = payload.name.toUpperCase();
}
 
// Locked indicator — the color that will actually be used (bottom dot, bright)
function _updateLockedColorIndicator(payload) {
  const dot   = document.getElementById("color-dot-locked");
  const label = document.getElementById("color-label-locked");
  if (dot && payload?.rgb) {
    const { r, g, b } = payload.rgb;
    dot.style.background  = `rgb(${r},${g},${b})`;
    dot.style.borderColor = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
    dot.style.boxShadow   = `0 0 8px rgb(${r},${g},${b})`;
  }
  if (label) label.textContent = payload?.name?.toUpperCase() ?? "—";
}
 
// Progress ring — fills as color stabilizes toward lock
function _updateLockProgress() {
  const ring = document.getElementById("lock-progress");
  if (!ring) return;
 
  const progress = getColorProgress(); // 0–1 from fusionRules
  const locked   = getLockedColor();
 
  const circumference = 2 * Math.PI * 14; // r=14
  ring.style.strokeDashoffset = circumference * (1 - progress);
 
  if (progress >= 1 && locked) {
    ring.style.stroke = `rgb(${locked.rgb.r},${locked.rgb.g},${locked.rgb.b})`;
    _updateLockedColorIndicator(locked);
  } else {
    ring.style.stroke = "#0d9488";
  }
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
 