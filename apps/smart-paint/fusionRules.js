/**
 * smartPaintFusionRule — fusion logic for Smart Paint.
 *
 * Every action that involves color requires BOTH color + voice.
 * Color is "locked in" only after being stable for COLOR_STABLE_MS.
 * This prevents brush/background changing due to background noise.
 *
 * ┌─────────────────┬──────────────────────────────────────────────┐
 * │  INTENT         │  REQUIRED MODALITIES                         │
 * ├─────────────────┼──────────────────────────────────────────────┤
 * │  activateDraw   │  🎨 locked color  +  🗣️ "paint"              │
 * │  setBackground  │  🎨 locked color  +  🗣️ "background"         │
 * │  changeColor    │  🎨 locked color  +  🗣️ "color"              │
 * │  stopDraw       │  🗣️ "stop"  (dismiss — single modality ok)   │
 * │  clear          │  🗣️ "clear" (dismiss — single modality ok)   │
 * └─────────────────┴──────────────────────────────────────────────┘
 *
 * Color lock:
 *   The same color name must be detected for COLOR_STABLE_MS (1500ms)
 *   without changing before it is considered "locked".
 *   Only the locked color is used for intent fusion — not the live feed.
 */
 
const COLOR_STABLE_MS = 1500;
 
// Color stability state
let _lastColorName    = null;
let _colorStableSince = 0;
let _lockedColor      = null; // { name, rgb } — intentionally held color
 
export function smartPaintFusionRule(buffer) {
  const last = (source, type) =>
    [...buffer].reverse().find((e) => e.source === source && e.type === type);
 
  const voiceEvt = last("voice", "command");
  const colorEvt = last("color", "color");
 
  // ── Color stability tracking ───────────────────────────────────────────────
  // Runs every call so the lock builds up over time, independent of voice
  if (colorEvt) {
    const name = colorEvt.payload.name;
    const now  = Date.now();
 
    if (name !== _lastColorName) {
      // Color changed — reset stability timer
      _lastColorName    = name;
      _colorStableSince = now;
    } else if (now - _colorStableSince >= COLOR_STABLE_MS) {
      // Held steady long enough — lock it in
      _lockedColor = colorEvt.payload;
    }
  }
 
  // No voice — nothing to fuse
  if (!voiceEvt) return null;
 
  const cmd = voiceEvt.payload.command;
 
  switch (cmd) {
 
    // Requires: locked color + voice "paint"
    case "paint":
      if (!_lockedColor) return null; // no color locked yet — ignore
      return {
        intent:  "activateDraw",
        color:   _lockedColor,
        trigger: "color + voice",
      };
 
    // Requires: locked color + voice "background"
    case "background":
      if (!_lockedColor) return null;
      return {
        intent:  "setBackground",
        color:   _lockedColor.name,
        rgb:     _lockedColor.rgb,
        trigger: "color + voice",
      };
 
    // Requires: locked color + voice "color"
    case "color":
      if (!_lockedColor) return null;
      return {
        intent:  "changeColor",
        color:   _lockedColor,
        trigger: "color + voice",
      };
 
    // Single modality — dismiss actions don't need color
    case "stop":
      return { intent: "stopDraw", trigger: "voice" };
 
    case "clear":
      return { intent: "clear", trigger: "voice" };
 
    default:
      return null;
  }
}
 
/** Returns the currently locked color — used by main.js for UI feedback. */
export function getLockedColor() {
  return _lockedColor;
}
 
/** Returns lock progress 0–1 — used by main.js to animate the ring. */
export function getColorProgress() {
  if (!_lastColorName || !_colorStableSince) return 0;
  return Math.min((Date.now() - _colorStableSince) / COLOR_STABLE_MS, 1);
}
 