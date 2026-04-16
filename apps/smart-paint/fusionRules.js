/**
 * smartPaintFusionRule — the fusion logic for the Smart Paint app.
 *
 * This lives in the APP, not the toolkit.
 * It defines what combinations of modality events mean for THIS application.
 *
 * NOTE: Continuous drawing is NOT handled here — it is managed by a direct
 * gesture listener in main.js that checks `isPainting` app state. This avoids
 * the fusion window expiring mid-stroke and stopping drawing after 3 seconds.
 *
 * @param {Array} buffer - array of recent events from the FusionEngine
 * @returns {{ intent: string, ...args } | null}
 */
export function smartPaintFusionRule(buffer) {
  // Helper: get most recent event of a given type from a given source
  const last = (source, type) =>
    [...buffer].reverse().find((e) => e.source === source && e.type === type);

  const voiceCmd = last("voice", "command");
  const color    = last("color", "color");

  if (!voiceCmd) return null;

  const cmd = voiceCmd.payload.command;

  switch (cmd) {
    case "paint":
      // Activate drawing mode; pass detected color for late fusion (applied in main.js).
      // Continuous drawing is handled by the direct gesture listener in main.js.
      return { intent: "activateDraw", color: color ? color.payload : null };

    case "color":
      // Change brush color to whatever is currently in front of the camera
      if (color) {
        return { intent: "changeColor", color: color.payload };
      }
      return null;

    case "background":
      // "background" + detected color → set canvas background
      if (color) {
        return { intent: "setBackground", color: color.payload.name, rgb: color.payload.rgb };
      }
      return null;

    case "stop":
      return { intent: "stopDraw" };

    case "clear":
      return { intent: "clear" };

    default:
      return null;
  }
}
