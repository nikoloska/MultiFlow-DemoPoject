/**
 * Cuisine Helper — fusion configuration.
 *
 * Declarative rules only — no logic here.
 * FusionEngine processes cooldowns, temporal checks, and matching automatically.
 *
 * Every rule requires AT LEAST 2 modalities.
 *
 * Strict color-to-cuisine mapping:
 *   blue   → french
 *   red    → italian
 *   white  → japanese
 *   orange → mexican
 *   yellow → greek
 *
 * Wrong color + correct cuisine = no action.
 * No color shown + correct cuisine = no action (colorMaxAge: 1200ms).
 *
 * Navigation rules (NEXT/PREV/STOP) do NOT include "color" in requires[],
 * so a detected color never blocks gesture + voice navigation.
 */

export const fusionConfig = [
  {
    // blue + "french" → French cuisine
    id:          "filter_french",
    requires:    ["color", "voice"],
    match:       { color: ["blue"],   voice: ["french"] },
    intent:      "FILTER_CUISINE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },
  {
    // red + "italian" → Italian cuisine
    id:          "filter_italian",
    requires:    ["color", "voice"],
    match:       { color: ["red"],    voice: ["italian"] },
    intent:      "FILTER_CUISINE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },
  {
    // white + "japanese" → Japanese cuisine
    id:          "filter_japanese",
    requires:    ["color", "voice"],
    match:       { color: ["white"],  voice: ["japanese"] },
    intent:      "FILTER_CUISINE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },
  {
    // orange + "mexican" → Mexican cuisine
    id:          "filter_mexican",
    requires:    ["color", "voice"],
    match:       { color: ["orange"], voice: ["mexican"] },
    intent:      "FILTER_CUISINE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },
  {
    // yellow + "greek" → Greek cuisine
    id:          "filter_greek",
    requires:    ["color", "voice"],
    match:       { color: ["yellow"], voice: ["greek"] },
    intent:      "FILTER_CUISINE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },

  {
    // Specific color + "open/cook" + point center → open that recipe
    id:          "open_recipe",
    requires:    ["color", "voice", "gesture"],
    match: {
      color:   ["blue", "red", "white", "orange", "yellow"],
      voice:   ["open", "cook"],
      gesture: { direction: "center" },
    },
    intent:      "OPEN_RECIPE",
    cooldown:    1000,
    colorMaxAge: 1200,
  },

  {
    // Say "next" AND swipe right → advance step
    id:       "next_step",
    requires: ["voice", "gesture"],
    match:    { voice: ["next"], gesture: { direction: "right" } },
    intent:   "NEXT_STEP",
    cooldown: 900,
  },

  {
    // Say "previous/back" AND swipe left → go back
    id:       "prev_step",
    requires: ["voice", "gesture"],
    match:    { voice: ["previous", "back"], gesture: { direction: "left" } },
    intent:   "PREV_STEP",
    cooldown: 900,
  },

  {
    // Say "stop" AND swipe left → clear filter
    id:       "stop",
    requires: ["voice", "gesture"],
    match:    { voice: ["stop"], gesture: { direction: "left" } },
    intent:   "STOP",
    cooldown: 1000,
  },
];