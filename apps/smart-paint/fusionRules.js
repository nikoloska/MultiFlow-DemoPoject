/**
 * smartPaintFusionRule — the fusion logic for the Smart Paint app.
 *
 * This lives in the APP, not the toolkit.
 * It defines what combinations of modality events mean for THIS application.
 *
 * @param {Array} buffer - array of recent events from the FusionEngine
 * @returns {{ intent: string, ...args } | null}
 */
export function smartPaintFusionRule(buffer) {
  // Helper: get most recent event of a given type from a given source
  const last = (source, type) =>
    [...buffer].reverse().find((e) => e.source === source && e.type === type);

  const voiceCmd  = last("voice",   "command");
  const color     = last("color",   "color");
  const position  = last("gesture", "position");
  const handLost  = last("gesture", "handLost");

  if (!voiceCmd) return null;

  const cmd = voiceCmd.payload.command;

  switch (cmd) {
    case "paint":
      // "paint" + active hand position → draw at that position
      if (position) {
        return { intent: "draw", x: position.payload.x, y: position.payload.y };
      }
      // "paint" alone → just activate drawing mode
      return { intent: "activateDraw" };

    case "background":
      // "background" + detected color → set canvas background
      if (color) {
        return { intent: "setBackground", color: color.payload.name, rgb: color.payload.rgb };
      }
      return null; // need a color to set background

    case "stop":
      return { intent: "stopDraw" };

    case "clear":
      return { intent: "clear" };

    default:
      return null;
  }
}

/**
 * drawingFusionRule — continuously draws while in "paint" state.
 * Used as a secondary rule that runs on every gesture position event.
 *
 * @param {Array} buffer
 * @returns {{ intent: string, ...args } | null}
 */
export function continuousDrawRule(buffer) {
  // Find most recent events
  const last = (source, type) =>
    [...buffer].reverse().find((e) => e.source === source && e.type === type);

  const position = last("gesture", "position");
  const voiceCmd = last("voice",   "command");

  // Only draw if the last voice command was "paint" (not "stop" or "clear")
  if (position && voiceCmd && voiceCmd.payload.command === "paint") {
    return { intent: "continuousDraw", x: position.payload.x, y: position.payload.y };
  }

  return null;
}
