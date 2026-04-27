/**
 * Smart Paint — main application entry point.
 *
 * Structure:
 *   - Modality modules  → multiflow-toolkit (sensor logic)
 *   - Fusion rules      → fusionRules.js (app-specific intent mapping)
 *   - Canvas drawing    → CanvasRenderer.js (UI logic)
 *   - Wiring            → HERE (this file)
 */

// New Changes:
// The gesture module no longer creates a camera stream when the videoElement is passed and the colordetection module also assumes
// That the externally provided video element is already running.


import { FusionEngine, VoiceModule, GestureModule, ColorDetectionModule }
  from "../../packages/multiflow-toolkit/src/index.js";

import { smartPaintFusionRule, getLockedColor, getColorProgress }
  from "./fusionRules.js";

import { CanvasRenderer } from "./CanvasRenderer.js";

// ─── 1. Canvas ────────────────────────────────────────────────────────────────
const canvasElement = document.getElementById("canvas");
const canvas = new CanvasRenderer(canvasElement);

// ─── 2. Shared video element ──────────────────────────────────────────────────
const webcamVideo = document.getElementById("webcam-video");

let webcamStream = null;

async function startSharedWebcam() {
  if (webcamStream) return webcamStream;

  webcamStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, max: 60 },
    },
    audio: false,
  });

  webcamVideo.srcObject = webcamStream;
  webcamVideo.muted = true;
  webcamVideo.playsInline = true;
  webcamVideo.autoplay = true;

  await webcamVideo.play();

  return webcamStream;
}

function stopSharedWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((track) => track.stop());
    webcamStream = null;
  }

  webcamVideo.srcObject = null;
}

// ─── 3. Modalities ────────────────────────────────────────────────────────────
const voice = new VoiceModule({
  commands: ["paint", "draw", "start", "stop", "pause", "clear", "background", "color"],
});

const gesture = new GestureModule({
  videoElement: webcamVideo,
  targetElement: canvasElement,
  resolution: "high",
  smoothing: 0.65,
  pinchStartThreshold: 0.07,
  pinchEndThreshold: 0.11,
  maxJumpDistance: 0.16,
  emitLandmarks: false,
  debug: true,
});

const color = new ColorDetectionModule({
  intervalMs: 80,
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

// ─── 6.direct gesture listener outside fusion. No longer continuous. ───────────
let isGestureDrawing = false;

gesture.onData((event) => {
  if (!isPainting) return;

  if (event.type === "drawStart") {
    isGestureDrawing = true;
    canvas.beginStroke();
    window.indicatePulse?.("gesture");
    return;
  }

  if (event.type === "drawEnd") {
    isGestureDrawing = false;
    canvas.endStroke();
    window.indicatePulse?.("gesture");
    return;
  }

  if (event.type === "position") {
    const { x, y, drawing } = event.payload;

    if (!drawing && !isGestureDrawing) {
      return;
    }

    canvas.drawAt(x, y);
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
    _updateLiveColorIndicator(event.payload);
    window.indicatePulse?.("color");
    _updateLockProgress();
  }

  if (event.source === "voice") {
    window.indicatePulse?.("voice");
  }

  if (event.source === "gesture") {
    window.indicatePulse?.("gesture");
  }
});

// ─── 8. Intent handling ───────────────────────────────────────────────────────
engine.onIntent(({ intent, ...args }) => {
  switch (intent) {
    case "activateDraw":
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
  const stopBtn = document.getElementById("btn-stop");
  const status = document.getElementById("status");

  try {
    btn.disabled = true;
    status.textContent = "Starting camera…";
    status.style.color = "#64748b";

    await startSharedWebcam();

    status.textContent = "Starting models & microphone…";

    await engine.startAll();

    webcamVideo.style.display = "block";

    btn.style.display = "none";
    stopBtn.style.display = "inline-block";

    status.textContent = "Listening…";
    status.style.color = "#64748b";
  } catch (err) {
    console.error("[Smart Paint] Startup failed:", err);

    status.textContent = `Startup failed: ${err?.message ?? err}`;
    status.style.color = "#e11d48";

    isPainting = false;
    engine.stopAll();
    stopSharedWebcam();
    webcamVideo.style.display = "none";
    _setModeDisplay("IDLE");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-stop")?.addEventListener("click", () => {
  const btn = document.getElementById("btn-start");
  const stopBtn = document.getElementById("btn-stop");
  const status = document.getElementById("status");

  isPainting = false;

  engine.stopAll();
  stopSharedWebcam();

  webcamVideo.style.display = "none";

  btn.style.display = "inline-block";
  stopBtn.style.display = "none";

  _setModeDisplay("IDLE");

  status.textContent = "Stopped.";
  status.style.color = "#64748b";
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  canvas.clear();
});

// Brush controls
document.getElementById("brush-magic")?.addEventListener("click", () => {
  canvas.setBrushType("magic");
  _setActiveBrushButton("brush-magic");
});

document.getElementById("brush-pencil")?.addEventListener("click", () => {
  canvas.setBrushType("pencil");
  _setActiveBrushButton("brush-pencil");
});

document.getElementById("brush-eraser")?.addEventListener("click", () => {
  canvas.setBrushType("eraser");
  _setActiveBrushButton("brush-eraser");
});

document.getElementById("brush-color")?.addEventListener("input", (e) => {
  canvas.setBrushColor(e.target.value);
});

document.getElementById("brush-size")?.addEventListener("input", (e) => {
  const size = parseInt(e.target.value, 10);
  canvas.setBrushSize(size);

  const label = document.getElementById("brush-size-label");
  if (label) label.textContent = String(size);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _applyColor(colorPayload) {
  if (!colorPayload?.rgb) return;

  const { r, g, b } = colorPayload.rgb;

  canvas.setBrushColor(`rgb(${r},${g},${b})`);

  const picker = document.getElementById("brush-color");
  if (picker) picker.value = _rgbToHex(r, g, b);

  _updateLockedColorIndicator(colorPayload);
}

function _updateLiveColorIndicator(payload) {
  const dot = document.getElementById("color-dot-live");
  const label = document.getElementById("color-label-live");

  if (dot && payload.rgb) {
    const { r, g, b } = payload.rgb;

    dot.style.background = `rgb(${r},${g},${b})`;
    dot.style.borderColor =
      `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
  }

  if (label) {
    label.textContent = payload.name.toUpperCase();
  }
}

function _updateLockedColorIndicator(payload) {
  const dot = document.getElementById("color-dot-locked");
  const label = document.getElementById("color-label-locked");

  if (dot && payload?.rgb) {
    const { r, g, b } = payload.rgb;

    dot.style.background = `rgb(${r},${g},${b})`;
    dot.style.borderColor =
      `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
    dot.style.boxShadow = `0 0 8px rgb(${r},${g},${b})`;
  }

  if (label) {
    label.textContent = payload?.name?.toUpperCase() ?? "—";
  }
}

function _updateLockProgress() {
  const ring = document.getElementById("lock-progress");
  if (!ring) return;

  const progress = getColorProgress();
  const circumference = 87.96;

  ring.style.strokeDashoffset =
    String(circumference * (1 - Math.max(0, Math.min(1, progress))));

  const locked = getLockedColor();
  if (locked?.rgb) {
    const { r, g, b } = locked.rgb;
    ring.style.stroke = `rgb(${r},${g},${b})`;
    _updateLockedColorIndicator(locked);
  }
}

function _setModeDisplay(mode) {
  const el = document.getElementById("mode-display");
  if (!el) return;

  el.textContent = mode;

  if (mode === "PAINTING") {
    el.classList.add("painting");
  } else {
    el.classList.remove("painting");
  }
}

function _setActiveBrushButton(activeId) {
  for (const id of ["brush-magic", "brush-pencil", "brush-eraser"]) {
    const el = document.getElementById(id);
    if (!el) continue;

    if (id === activeId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }
}

function _rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) => {
        const hex = Math.max(0, Math.min(255, v)).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}