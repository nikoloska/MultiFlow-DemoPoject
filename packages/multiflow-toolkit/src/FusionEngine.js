/**
 * FusionEngine — the orchestrator of multimodal fusion.
 *
 * Completely application-agnostic:
 *   - Accepts any IModalityModule via register()
 *   - Fusion logic is injected by the app via setFusionRule() or setFusionConfig()
 *   - Temporal window is configurable
 *
 * Usage (function-based — for complex logic):
 *   const engine = new FusionEngine({ windowMs: 3000 })
 *     .register(new VoiceModule())
 *     .register(new GestureModule())
 *     .register(new ColorDetectionModule())
 *     .setFusionRule(myAppFusionRule);
 *
 * Usage (declarative config — for data-driven rules):
 *   const engine = new FusionEngine({ windowMs: 4000 })
 *     .register(new VoiceModule())
 *     .register(new GestureModule())
 *     .register(new ColorDetectionModule())
 *     .setFusionConfig([
 *       {
 *         id: "next_step",
 *         requires: ["voice", "gesture"],
 *         match: { voice: ["next"], gesture: { direction: "right" } },
 *         intent: "NEXT_STEP",
 *         cooldown: 900,
 *       },
 *     ]);
 *
 *   engine.onIntent(({ intent, trigger, voicePayload, colorPayload, gesturePayload }) => { ... });
 *   engine.startAll();
 */
export class FusionEngine {
  /**
   * @param {object} config
   * @param {number} config.windowMs - temporal fusion window in ms (default: 3000)
   */
  constructor(config = {}) {
    this._windowMs        = config.windowMs ?? 3000;
    this._modules         = new Map();   // name → IModalityModule
    this._buffer          = [];          // recent events within the time window
    this._fusionRule      = null;        // (buffer) => intent | null
    this._intentListeners = [];          // callbacks for resolved intents
    this._rawListeners    = [];          // callbacks for every raw event (useful for debugging)
    this._cooldowns       = new Map();   // ruleId → last fired timestamp (used by setFusionConfig)
  }
 
  // ─── Registration ─────────────────────────────────────────────────────────
 
  /**
   * Register a modality module. Chainable.
   * @param {IModalityModule} module
   */
  register(module) {
    if (this._modules.has(module.name)) {
      console.warn(`[FusionEngine] Module "${module.name}" already registered. Replacing.`);
    }
    module.onData((event) => this._handleEvent(event));
    this._modules.set(module.name, module);
    return this;
  }
 
  /**
   * Set a custom fusion rule function. Chainable.
   * Use this for complex logic that cannot be expressed as declarative config.
   * @param {Function} fn - (buffer: Event[]) => { intent: string, ...args } | null
   */
  setFusionRule(fn) {
    if (typeof fn !== "function") throw new Error("setFusionRule requires a function.");
    this._fusionRule = fn;
    return this;
  }
 
  /**
   * Set fusion rules declaratively. Chainable.
   * Engine handles cooldowns, temporal checks, and matching automatically.
   * Use this instead of setFusionRule() when rules can be expressed as data.
   *
   * @param {Array} rules - array of rule objects:
   *   {
   *     id?:            string       — unique rule id (auto-generated if omitted)
   *     requires:       string[]     — modalities that must ALL be present, e.g. ["voice","gesture"]
   *     match?: {
   *       voice?:       string[]     — accepted voice commands
   *       gesture?:     { direction: "left"|"right"|"center" }
   *       color?:       string[]|"*" — accepted color names, or "*" for any
   *     }
   *     intent:         string       — intent name to emit
   *     cooldown?:      number       — ms before this rule fires again (default: 800)
   *     colorMaxAge?:   number       — max age of color event in ms (default: 4000)
   *     gestureMaxAge?: number       — max age of gesture event in ms (default: 1500)
   *   }
   */
  setFusionConfig(rules) {
    if (!Array.isArray(rules)) throw new Error("setFusionConfig requires an array of rules.");
    rules.forEach((r, i) => { if (!r.id) r.id = `rule_${i}`; });
    this._fusionRule = (buffer) => this._evalConfig(rules, buffer);
    return this;
  }
 
  // ─── Lifecycle ────────────────────────────────────────────────────────────
 
  /** Start all registered modules. */
  async startAll() {
    for (const module of this._modules.values()) {
      await module.start();
    }
  }
 
  /** Stop all registered modules. */
  stopAll() {
    this._modules.forEach((m) => m.stop());
    this._buffer = [];
  }
 
  /** Start a specific module by name. */
  async startModule(name) {
    const m = this._modules.get(name);
    if (!m) throw new Error(`No module named "${name}" registered.`);
    await m.start();
  }
 
  /** Stop a specific module by name. */
  stopModule(name) {
    const m = this._modules.get(name);
    if (!m) throw new Error(`No module named "${name}" registered.`);
    m.stop();
  }
 
  /** Clear the event buffer. Useful after an intent fires to prevent re-triggering. */
  resetBuffer() {
    this._buffer = [];
    return this;
  }
 
  // ─── Event listeners ──────────────────────────────────────────────────────
 
  /**
   * Register a listener for resolved intents.
   * @param {Function} callback - ({ intent, trigger, voicePayload, colorPayload, gesturePayload }) => void
   */
  onIntent(callback) {
    this._intentListeners.push(callback);
    return this;
  }
 
  /**
   * Register a listener for every raw modality event (before fusion).
   * Useful for debugging or building custom visualizations.
   * @param {Function} callback - (event) => void
   */
  onRawEvent(callback) {
    this._rawListeners.push(callback);
    return this;
  }
 
  // ─── State inspection ─────────────────────────────────────────────────────
 
  /** Returns a snapshot of the current event buffer. */
  getBuffer() {
    return [...this._buffer];
  }
 
  /** Returns an array of registered module names. */
  getModuleNames() {
    return [...this._modules.keys()];
  }
 
  // ─── Private ──────────────────────────────────────────────────────────────
 
  _handleEvent(event) {
    // Notify raw listeners
    this._rawListeners.forEach((cb) => cb(event));
 
    // Maintain temporal window
    const now = Date.now();
    this._buffer = this._buffer.filter(
      (e) => now - e.timestamp < this._windowMs
    );
    this._buffer.push(event);
 
    // Run fusion rule
    if (this._fusionRule) {
      try {
        const intent = this._fusionRule([...this._buffer]);
        if (intent) {
          this._intentListeners.forEach((cb) => cb(intent));
        }
      } catch (err) {
        console.error("[FusionEngine] Fusion rule threw an error:", err);
      }
    }
  }
 
  /**
   * Evaluate declarative config rules against the current buffer.
   * Rules are tested in order — first match wins.
   */
  /**
 * Evaluate declarative config rules against the current buffer.
 * Rules are tested in order — first match wins.
 */
_evalConfig(rules, buffer) {
  const now = Date.now();

  const last = (source, type) =>
    [...buffer].reverse().find(e => e.source === source && e.type === type);

  const voiceEvt      = last("voice",   "command");
  const colorEvt      = last("color",   "color");
  const gestureEvt    = last("gesture", "position");
  const drawStartEvt  = last("gesture", "drawStart");
  const drawEndEvt    = last("gesture", "drawEnd");

  for (const rule of rules) {
    const cooldown      = rule.cooldown      ?? 800;
    const colorMaxAge   = rule.colorMaxAge   ?? 4000;
    const gestureMaxAge = rule.gestureMaxAge ?? 1500;

    // Check per-rule cooldown
    const lastFired = this._cooldowns.get(rule.id) ?? 0;
    if (now - lastFired < cooldown) continue;

    // Check all required modalities are present and fresh
    let allPresent = true;

    for (const source of (rule.requires ?? [])) {
      if (source === "voice" && !voiceEvt) {
        allPresent = false;
        break;
      }

      if (
        source === "color" &&
        (!colorEvt || now - colorEvt.timestamp > colorMaxAge)
      ) {
        allPresent = false;
        break;
      }

      if (source === "gesture") {
        const hasFreshGesturePosition =
          gestureEvt && now - gestureEvt.timestamp <= gestureMaxAge;

        const hasFreshDrawStart =
          drawStartEvt && now - drawStartEvt.timestamp <= gestureMaxAge;

        const hasFreshDrawEnd =
          drawEndEvt && now - drawEndEvt.timestamp <= gestureMaxAge;

        if (!hasFreshGesturePosition && !hasFreshDrawStart && !hasFreshDrawEnd) {
          allPresent = false;
          break;
        }
      }
    }

    if (!allPresent) continue;

    // Check match conditions
    const match = rule.match ?? {};

    // Voice: command must be in the allowed list
    if (match.voice) {
      const cmd = voiceEvt?.payload?.command;
      if (!cmd || !match.voice.includes(cmd)) continue;
    }

    // Gesture: supports direction, drawing state, pinch thresholds, and event type.
    if (match.gesture) {
      const gestureMatch = match.gesture;

      // Match explicit gesture event: "position", "drawStart", or "drawEnd"
      if (gestureMatch.event) {
        if (gestureMatch.event === "position") {
          if (!gestureEvt || now - gestureEvt.timestamp > gestureMaxAge) continue;
        } else if (gestureMatch.event === "drawStart") {
          if (!drawStartEvt || now - drawStartEvt.timestamp > gestureMaxAge) continue;
        } else if (gestureMatch.event === "drawEnd") {
          if (!drawEndEvt || now - drawEndEvt.timestamp > gestureMaxAge) continue;
        } else {
          continue;
        }
      }

      // Direction requires a fresh position event.
      if (gestureMatch.direction) {
        if (!gestureEvt || now - gestureEvt.timestamp > gestureMaxAge) continue;

        const x = gestureEvt.payload.x ?? 0.5;
        const dir = x > 0.78 ? "right" : x < 0.22 ? "left" : "center";

        if (dir !== gestureMatch.direction) continue;
      }

      // Drawing state requires a fresh position event.
      if (typeof gestureMatch.drawing === "boolean") {
        if (!gestureEvt || now - gestureEvt.timestamp > gestureMaxAge) continue;

        const drawing = gestureEvt.payload.drawing === true;
        if (drawing !== gestureMatch.drawing) continue;
      }

      // Pinch thresholds require a fresh position event.
      if (typeof gestureMatch.pinchMax === "number") {
        if (!gestureEvt || now - gestureEvt.timestamp > gestureMaxAge) continue;

        const pinchDistance = gestureEvt.payload.pinchDistance ?? Infinity;
        if (pinchDistance > gestureMatch.pinchMax) continue;
      }

      if (typeof gestureMatch.pinchMin === "number") {
        if (!gestureEvt || now - gestureEvt.timestamp > gestureMaxAge) continue;

        const pinchDistance = gestureEvt.payload.pinchDistance ?? Infinity;
        if (pinchDistance < gestureMatch.pinchMin) continue;
      }
    }

    // Color: "*" accepts any detected color, array checks specific names
    if (match.color && colorEvt) {
      if (match.color !== "*" && !match.color.includes(colorEvt.payload.name)) {
        continue;
      }
    }

    // All checks passed — stamp cooldown and fire intent
    this._cooldowns.set(rule.id, now);

    return {
      intent:  rule.intent,
      trigger: (rule.requires ?? []).join(" + "),

      // Attach raw payloads so the app can use them without parsing the buffer
      ...(voiceEvt     && { voicePayload:   voiceEvt.payload }),
      ...(colorEvt     && { colorPayload:   colorEvt.payload }),
      ...(gestureEvt   && { gesturePayload: gestureEvt.payload }),
      ...(drawStartEvt && { drawStartPayload: drawStartEvt.payload }),
      ...(drawEndEvt   && { drawEndPayload:   drawEndEvt.payload }),
    };
  }

  return null;
}
}
 