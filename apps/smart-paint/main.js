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

import { smartPaintFusionRule, continuousDrawRule }
  from "./fusionRules.js";

import { CanvasRenderer }
  from "./CanvasRenderer.js";

// ─── 1. Canvas ────────────────────────────────────────────────────────────────
const canvas = new CanvasRenderer(document.getElementById("canvas"));

// ─── 2. Modalities ────────────────────────────────────────────────────────────
const voice = new VoiceModule({
  commands: ["paint", "stop", "clear", "background"],
});

const gesture = new GestureModule({
  smoothing: 0.4,
});

const color = new ColorDetectionModule({
  intervalMs: 150,
});

// ─── 3. Fusion Engine ─────────────────────────────────────────────────────────
// The engine knows nothing about Smart Paint — it just routes events.
// The fusion rule (injected below) defines what combinations mean.
const engine = new FusionEngine({ windowMs: 3000 })
  .register(voice)
  .register(gesture)
  .register(color)
  .setFusionRule(smartPaintFusionRule);

// Optional: also log raw events to the debug panel
engine.onRawEvent((event) => {
  const debugEl = document.getElementById("debug");
  if (debugEl) {
    debugEl.textContent = `[${event.source}] ${event.type}: ${JSON.stringify(event.payload).slice(0, 60)}`;
  }
});

// ─── 4. Intent handling ───────────────────────────────────────────────────────
// Map resolved intents → canvas actions.
// This is the ONLY place that connects the toolkit output to the UI.
engine.onIntent(({ intent, ...args }) => {
  switch (intent) {
    case "draw":
    case "continuousDraw":
      canvas.drawAt(args.x, args.y);
      break;

    case "activateDraw":
      canvas.activateDraw();
      break;

    case "stopDraw":
      canvas.stopDraw();
      break;

    case "setBackground":
      canvas.setBackground(args.color, args.rgb);
      break;

    case "clear":
      canvas.clear();
      break;
  }
});

// ─── 5. Also handle continuous gesture drawing directly ───────────────────────
// Run the continuous draw rule too, so gestures draw in real time once "paint" spoken
const continuousEngine = new FusionEngine({ windowMs: 3000 })
  .register(voice)
  .register(gesture)
  .setFusionRule(continuousDrawRule);

continuousEngine.onIntent(({ intent, ...args }) => {
  if (intent === "continuousDraw") canvas.drawAt(args.x, args.y);
});

// ─── 6. UI controls ───────────────────────────────────────────────────────────
document.getElementById("btn-start")?.addEventListener("click", async () => {
  document.getElementById("btn-start").disabled = true;
  document.getElementById("btn-stop").disabled  = false;
  await engine.startAll();
  document.getElementById("status").textContent = "Listening...";
  document.getElementById("status").style.color = "gray";
});

document.getElementById("btn-stop")?.addEventListener("click", () => {
  engine.stopAll();
  document.getElementById("btn-start").disabled = false;
  document.getElementById("btn-stop").disabled  = true;
  document.getElementById("status").textContent = "Stopped.";
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
