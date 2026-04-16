/**
 * FusionEngine — the orchestrator of multimodal fusion.
 *
 * Completely application-agnostic:
 *   - Accepts any IModalityModule via register()
 *   - Fusion logic is injected by the app via setFusionRule()
 *   - Temporal window is configurable
 *
 * Usage:
 *   const engine = new FusionEngine({ windowMs: 3000 })
 *     .register(new VoiceModule())
 *     .register(new GestureModule())
 *     .register(new ColorDetectionModule())
 *     .setFusionRule(myAppFusionRule);
 *
 *   engine.onIntent(({ intent, ...args }) => { ... });
 *   engine.startAll();
 */
export class FusionEngine {
  /**
   * @param {object} config
   * @param {number} config.windowMs - temporal fusion window in ms (default: 3000)
   */
  constructor(config = {}) {
    this._windowMs = config.windowMs ?? 3000;
    this._modules = new Map();    // name → IModalityModule
    this._buffer = [];            // recent events within the time window
    this._fusionRule = null;      // (buffer) => intent | null
    this._intentListeners = [];   // callbacks for resolved intents
    this._rawListeners = [];      // callbacks for every raw event (useful for debugging)
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
    return this; // fluent
  }

  /**
   * Set (or replace) the fusion rule function. Chainable.
   * The rule receives the current event buffer and returns an intent object or null.
   * @param {Function} fn - (buffer: Event[]) => { intent: string, ...args } | null
   */
  setFusionRule(fn) {
    if (typeof fn !== "function") throw new Error("setFusionRule requires a function.");
    this._fusionRule = fn;
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

  // ─── Event listeners ──────────────────────────────────────────────────────

  /**
   * Register a listener for resolved intents.
   * @param {Function} callback - ({ intent, ...args }) => void
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
}
