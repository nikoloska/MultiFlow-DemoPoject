/**
 * IModalityModule — abstract base class for all input modalities.
 * Every module (Voice, Gesture, Color, or any future modality) must extend this.
 *
 * Contract:
 *   - start()            → begin capturing from sensor
 *   - stop()             → stop capturing, release resources
 *   - onData(callback)   → register a listener; callback receives { source, type, payload, timestamp }
 *   - getCapabilities()  → return array of event type strings this module can emit
 */
export class IModalityModule {
  constructor(name) {
    if (new.target === IModalityModule) {
      throw new Error("IModalityModule is abstract and cannot be instantiated directly.");
    }
    this.name = name;
    this._callbacks = [];
    this._running = false;
  }

  /** Start the modality (must be overridden) */
  start() {
    throw new Error(`${this.name}.start() is not implemented.`);
  }

  /** Stop the modality (must be overridden) */
  stop() {
    throw new Error(`${this.name}.stop() is not implemented.`);
  }

  /**
   * Register a data listener.
   * @param {Function} callback - called with { source, type, payload, timestamp }
   */
  onData(callback) {
    if (typeof callback !== "function") throw new Error("onData requires a function.");
    this._callbacks.push(callback);
    return this; // fluent
  }

  /**
   * Returns the list of event types this module can emit.
   * Override in subclass.
   * @returns {string[]}
   */
  getCapabilities() {
    return [];
  }

  /**
   * Internal: emit a typed event to all registered listeners.
   * Called by subclasses when sensor data is ready.
   */
  _emit(type, payload) {
    const event = {
      source: this.name,
      type,
      payload,
      timestamp: Date.now(),
    };
    this._callbacks.forEach((cb) => cb(event));
  }
}
