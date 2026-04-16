/**
 * Smart Paint — main application entry point.
 *
 * This file is intentionally thin: it imports from the toolkit,
 * wires everything together, and delegates all logic to the right place.
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

// ─── 1. Canvas & Shared Video Source ──────────────────────────────────────────
const canvas = new CanvasRenderer(document.getElementById("canvas"));
const sharedVideo = document.getElementById("webcamVideo");

// ─── 2. Modalities (Shared Video to prevent multiple cameras) ─────────────────
const voice = new VoiceModule({
  commands: ["paint", "stop", "clear", "background"],
});

const gesture = new GestureModule({
  smoothing: 0.4,
  videoElement: sharedVideo, 
});

const color = new ColorDetectionModule({
  intervalMs: 150,
  videoElement: sharedVideo, 
});

// ─── 3. Fusion Engine ─────────────────────────────────────────────────────────
// The engine knows nothing about Smart Paint — it just routes events.
// The fusion rule (injected below) defines what combinations mean.
const engine = new FusionEngine({ windowMs: 3000 })
  .register(voice)
  .register(gesture)
  .register(color)
  .setFusionRule(smartPaintFusionRule);

// ─── 4. Raw Event Feedback (Fixes Color Indicator & Debug) ────────────────────
engine.onRawEvent((event) => {
  if (event.type === "color") {
    const indicator = document.getElementById("colorIndicator");
    const label = document.getElementById("colorLabel");
    if (indicator) {
      indicator.style.backgroundColor = `rgb(${event.payload.rgb.r},${event.payload.rgb.g},${event.payload.rgb.b})`;
    }
    if (label) {
      label.textContent = event.payload.name.toUpperCase();
    }
  }

  // Debug панел (опционално)
  const debugEl = document.getElementById("debug");
  if (debugEl) {
    debugEl.textContent = `[${event.source}] ${event.type}: ${JSON.stringify(event.payload).slice(0, 40)}`;
  }
});

// ─── 4. Intent handling ───────────────────────────────────────────────────────
// Map resolved intents → canvas actions.
// This is the ONLY place that connects the toolkit output to the UI.
engine.onIntent(({ intent, ...args }) => {
  const modeDisplay = document.getElementById("modeDisplay");

  switch (intent) {
    case "draw":
      canvas.drawAt(args.x, args.y);
      if (modeDisplay) {
        modeDisplay.textContent = "PAINTING";
        modeDisplay.classList.add("is-painting");
      }
      break;

    case "activateDraw":
      canvas.activateDraw();
      if (modeDisplay) {
        modeDisplay.textContent = "PAINTING";
        modeDisplay.classList.add("is-painting");
      }
      break;

    case "stopDraw":
      canvas.stopDraw();
      if (modeDisplay) {
        modeDisplay.textContent = "IDLE";
        modeDisplay.classList.remove("is-painting");
      }
      break;

    case "setBackground":
      canvas.setBackground(args.color, args.rgb);
      break;

    case "clear":
      canvas.clear();
      if (modeDisplay) {
        modeDisplay.textContent = "IDLE";
        modeDisplay.classList.remove("is-painting");
      }
      break;
  }
});

// ─── 6. UI Controls ───────────────────────────────────────────────────────────
document.getElementById("btn-start")?.addEventListener("click", async () => {
  document.getElementById("btn-start").disabled = true;
  document.getElementById("btn-stop").disabled  = false;
  await engine.startAll();
  
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "Listening...";
    statusEl.style.color = "green";
  }
});

document.getElementById("btn-stop")?.addEventListener("click", () => {
  engine.stopAll();
  document.getElementById("btn-start").disabled = false;
  document.getElementById("btn-stop").disabled  = true;
  
  const modeDisplay = document.getElementById("modeDisplay");
  if (modeDisplay) {
    modeDisplay.textContent = "STOPPED";
    modeDisplay.classList.remove("is-painting");
  }
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  canvas.clear();
});

document.getElementById("brush-color")?.addEventListener("input", (e) => {
  canvas.setBrushColor(e.target.value);
});

document.getElementById("brush-size")?.addEventListener("input", (e) => {
  canvas.setBrushSize(parseInt(e.target.value));
});