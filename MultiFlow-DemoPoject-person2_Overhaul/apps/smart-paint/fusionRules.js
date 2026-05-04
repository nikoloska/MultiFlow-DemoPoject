/**
 * smartPaintFusionRule — fusion logic for Smart Paint.
 *
Previous:
"paint" + locked color → activate drawing

Current:
"paint" + pinch gesture → activate drawing
"clear" + pinch gesture → clear canvas
"background" + locked color → set background
"color" + locked color → change brush color
"stop" → stop drawing
 
Say "paint" while pinching → enter painting mode
Pinch                      → draw stroke
Release pinch              → pause/end stroke
Pinch again                → start another stroke
Say "stop"                 → leave painting mode
Say "clear" while pinching → clear canvas
 *
 * Color lock:
 *   The same color name must be detected for COLOR_STABLE_MS (1500ms)
 *   without changing before it is considered "locked".
 *   Only the locked color is used for intent fusion — not the live feed.
 */
 
const COLOR_STABLE_MS = 1500;

const VOICE_MAX_AGE_MS = 2500;
const GESTURE_MAX_AGE_MS = 1200;

// Color stability state
let _lastColorName = null;
let _colorStableSince = 0;
let _lockedColor = null; // { name, rgb }

export function smartPaintFusionRule(buffer) {
  const now = Date.now();

  const last = (source, type) =>
    [...buffer].reverse().find((e) => e.source === source && e.type === type);

  const voiceEvt = last("voice", "command");
  const colorEvt = last("color", "color");

  // New gesture events from GestureModule
  const gestureEvt = last("gesture", "position");
  const drawStartEvt = last("gesture", "drawStart");
  const drawEndEvt = last("gesture", "drawEnd");

  // ── Color stability tracking ───────────────────────────────────────────────
  // Runs on every fusion call so the lock builds over time.
  if (colorEvt) {
    const name = colorEvt.payload.name;

    if (name !== _lastColorName) {
      _lastColorName = name;
      _colorStableSince = now;
    } else if (now - _colorStableSince >= COLOR_STABLE_MS) {
      _lockedColor = colorEvt.payload;
    }
  }

  // No recent voice command → no command intent.
  if (!voiceEvt || now - voiceEvt.timestamp > VOICE_MAX_AGE_MS) {
    return null;
  }

  const cmd = voiceEvt.payload.command;

  const hasFreshGesture =
    gestureEvt && now - gestureEvt.timestamp <= GESTURE_MAX_AGE_MS;

  const hasFreshDrawStart =
    drawStartEvt && now - drawStartEvt.timestamp <= GESTURE_MAX_AGE_MS;

  const hasFreshDrawEnd =
    drawEndEvt && now - drawEndEvt.timestamp <= GESTURE_MAX_AGE_MS;

  const isPinching =
    hasFreshGesture && gestureEvt.payload.drawing === true;

  const gesturePayload = gestureEvt?.payload ?? null;

  switch (cmd) {
    /**
     * Requires voice + gesture.
     *
     * User must say "paint" while pinching, or pinch very close to the command.
     * This prevents accidental activation from voice alone.
     */
    case "paint":
    case "draw":
    case "start":
      if (!isPinching && !hasFreshDrawStart) return null;

      return {
        intent: "activateDraw",
        color: _lockedColor,
        gesturePayload,
        trigger: "voice + gesture",
      };

    /**
     * Voice-only stop is fine because it is a safe dismiss action.
     * If drawEnd happened nearby, record it as voice + gesture.
     */
    case "stop":
    case "pause":
      return {
        intent: "stopDraw",
        gesturePayload,
        trigger: hasFreshDrawEnd ? "voice + gesture" : "voice",
      };

    /**
     * Clear is destructive, so require voice + pinch.
     */
    case "clear":
      if (!isPinching && !hasFreshDrawStart) return null;

      return {
        intent: "clear",
        gesturePayload,
        trigger: "voice + gesture",
      };

    /**
     * Color-based commands still use locked color.
     */
    case "background":
      if (!_lockedColor) return null;

      return {
        intent: "setBackground",
        color: _lockedColor.name,
        rgb: _lockedColor.rgb,
        trigger: "voice + color",
      };

    case "color":
      if (!_lockedColor) return null;

      return {
        intent: "changeColor",
        color: _lockedColor,
        trigger: "voice + color",
      };

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
 