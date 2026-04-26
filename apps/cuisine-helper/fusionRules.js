/**
 * Cuisine Helper — fusion configuration.
 *
 * Declarative rules only — no logic here.
 * FusionEngine processes cooldowns, temporal checks, and matching automatically.
 *
 * Every rule requires AT LEAST 2 modalities.
 *
 * Color note:
 *   "color" is only in requires[] for color-based rules.
 *   Navigation rules (NEXT/PREV/STOP) do NOT list "color",
 *   so a detected color never blocks gesture + voice navigation.
 */
 
export const fusionConfig = [
  {
    // Filter by cuisine: hold colored object + say cuisine name
    id:       "filter_cuisine",
    requires: ["color", "voice"],
    match: {
      color: "*",
      voice: ["french", "italian", "japanese", "mexican", "greek"],
    },
    intent:   "FILTER_CUISINE",
    cooldown: 1000,
  },
 
  {
    // Open recipe by color: color + say "open/cook" + point center
    id:       "open_recipe",
    requires: ["color", "voice", "gesture"],
    match: {
      color:   "*",
      voice:   ["open", "cook"],
      gesture: { direction: "center" },
    },
    intent:   "OPEN_RECIPE",
    cooldown: 1000,
  },
 
  {
    // Advance step: say "next" AND swipe right
    // "color" is NOT in requires — detected color never blocks this rule
    id:       "next_step",
    requires: ["voice", "gesture"],
    match: {
      voice:   ["next"],
      gesture: { direction: "right" },
    },
    intent:   "NEXT_STEP",
    cooldown: 900,
  },
 
  {
    // Go back: say "previous/back" AND swipe left
    id:       "prev_step",
    requires: ["voice", "gesture"],
    match: {
      voice:   ["previous", "back"],
      gesture: { direction: "left" },
    },
    intent:   "PREV_STEP",
    cooldown: 900,
  },
 
  {
    // Clear filter: say "stop" AND swipe left
    id:       "stop",
    requires: ["voice", "gesture"],
    match: {
      voice:   ["stop"],
      gesture: { direction: "left" },
    },
    intent:   "STOP",
    cooldown: 1000,
  },
];
 