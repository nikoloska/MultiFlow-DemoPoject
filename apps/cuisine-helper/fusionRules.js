/**
 * cuisineFusionRule — Strict multi-modal late fusion for Cuisine Helper.
 *
 * Every action requires AT LEAST 2 modalities simultaneously.
 * A single modality alone never triggers an intent.
 *
 * ┌──────────────────┬─────────────────────────────────────────────┐
 * │  INTENT          │  REQUIRED MODALITIES                        │
 * ├──────────────────┼─────────────────────────────────────────────┤
 * │  FILTER_CUISINE  │  color + voice (cuisine keyword)            │
 * │  NEXT_STEP       │  voice "next"  + gesture swipe right        │
 * │  PREV_STEP       │  voice "prev"  + gesture swipe left         │
 * │  OPEN_RECIPE     │  color + voice "open/cook" + gesture center │
 * │  STOP            │  voice "stop"  + gesture swipe left         │
 * └──────────────────┴─────────────────────────────────────────────┘
 *
 * Time window:  engine windowMs = 4000ms
 * Cooldown:     900ms after each fired intent
 */
 
const CUISINE_KEYWORDS = {
  french:   "French",
  italian:  "Italian",
  japanese: "Japanese",
  mexican:  "Mexican",
  greek:    "Greek",
};
 
const COOLDOWN_MS        = 900;
const COLOR_MAX_AGE_MS   = 4000;
const GESTURE_MAX_AGE_MS = 1500;
 
let lastFiredAt = 0;
 
export function cuisineFusionRule(buffer) {
  const now = Date.now();
 
  // Global cooldown — prevents multiple intents from the same burst
  if (now - lastFiredAt < COOLDOWN_MS) return null;
 
  // Get most recent event of a given source + type
  const last = (source, type) =>
    [...buffer].reverse().find(e => e.source === source && e.type === type);
 
  const voiceEvt   = last("voice",   "command");
  const colorEvt   = last("color",   "color");
  const gestureEvt = last("gesture", "position");
 
  // Extract values and check freshness
  const voiceCmd   = voiceEvt?.payload?.command ?? null;
  const colorAge   = colorEvt   ? now - colorEvt.timestamp   : Infinity;
  const gestureAge = gestureEvt ? now - gestureEvt.timestamp : Infinity;
 
  const hasVoice   = !!voiceCmd;
  const hasColor   = colorAge   < COLOR_MAX_AGE_MS;
  const hasGesture = gestureAge < GESTURE_MAX_AGE_MS;
 
  const gestureX    = gestureEvt?.payload?.x ?? 0.5;
  const swipeRight  = hasGesture && gestureX > 0.78;
  const swipeLeft   = hasGesture && gestureX < 0.22;
  const pointCenter = hasGesture && gestureX >= 0.3 && gestureX <= 0.7;
 
  // Stamp timestamp and return the intent object
  function fire(intent) {
    lastFiredAt = now;
    return intent;
  }
 
  // Rule 1: color + voice cuisine keyword → filter recipes
  if (hasColor && hasVoice) {
    const cuisine = CUISINE_KEYWORDS[voiceCmd];
    if (cuisine) {
      return fire({
        intent:  "FILTER_CUISINE",
        cuisine,
        color:   colorEvt.payload,
        trigger: "color + voice",
      });
    }
  }
 
  // Rule 2: voice "next" + swipe right → advance step
  if (hasVoice && voiceCmd === "next" && swipeRight) {
    return fire({ intent: "NEXT_STEP", trigger: "voice + gesture" });
  }
 
  // Rule 3: voice "previous/back" + swipe left → go back
  if (hasVoice && (voiceCmd === "previous" || voiceCmd === "back") && swipeLeft) {
    return fire({ intent: "PREV_STEP", trigger: "voice + gesture" });
  }
 
  // Rule 4: color + voice "open/cook" + point center → open matching recipe
  if (hasColor && hasVoice && (voiceCmd === "open" || voiceCmd === "cook") && pointCenter) {
    return fire({ intent: "OPEN_RECIPE", color: colorEvt.payload, trigger: "color + voice + gesture" });
  }
 
  // Rule 5: voice "stop" + swipe left → clear filter
  if (hasVoice && voiceCmd === "stop" && swipeLeft) {
    return fire({ intent: "STOP", trigger: "voice + gesture" });
  }
 
  return null;
}