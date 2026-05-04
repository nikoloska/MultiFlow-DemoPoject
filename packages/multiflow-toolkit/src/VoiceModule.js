import { IModalityModule } from "./IModalityModule.js";

/**
 * VoiceModule — captures speech input using the Web Speech API.
 *
 * Emits:
 *   - "command" → {
 *        command: string,
 *        transcript: string,
 *        confidence: number,
 *        isFinal: boolean
 *     }
 */
export class VoiceModule extends IModalityModule {
  constructor(config = {}) {
    super("voice");

    this._commands = config.commands || ["paint", "stop", "clear", "background"];
    this._lang = config.lang || "en-US";

    this._recognition = null;

    // Restart handling.
    this._restartTimer = null;
    this._restartDelayMs = config.restartDelayMs ?? 250;
    this._manualStop = false;

    // Prevent duplicate command spam from interim/final recognition.
    this._lastCommand = null;
    this._lastCommandTime = 0;
    this._dedupeMs = config.dedupeMs ?? 900;

    // Debug option.
    this._debug = config.debug ?? false;
  }

  getCapabilities() {
    return ["command"];
  }

  start() {
    if (this._running) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[VoiceModule] Web Speech API not supported in this browser.");
      return;
    }

    this._running = true;
    this._manualStop = false;

    this._recognition = new SpeechRecognition();

    this._recognition.continuous = true;
    this._recognition.interimResults = true;
    this._recognition.maxAlternatives = 5;
    this._recognition.lang = this._lang;

    this._recognition.onstart = () => {
      if (this._debug) {
        console.log("[VoiceModule] recognition started");
      }
    };

    this._recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const alternatives = Array.from(result);

      for (const alt of alternatives) {
        const transcript = alt.transcript.trim().toLowerCase();
        const confidence = alt.confidence ?? 1;

        const matched = this._commands.find((cmd) => {
          const pattern = new RegExp(`\\b${this._escapeRegExp(cmd)}\\b`, "i");
          return pattern.test(transcript);
        });

        if (!matched) continue;

        const now = Date.now();

        // Avoid firing the same command twice from interim + final results.
        if (
          matched === this._lastCommand &&
          now - this._lastCommandTime < this._dedupeMs
        ) {
          return;
        }

        this._lastCommand = matched;
        this._lastCommandTime = now;

        if (this._debug) {
          console.log("[VoiceModule] command", {
            command: matched,
            transcript,
            confidence,
            isFinal: result.isFinal,
          });
        }

        this._emit("command", {
          command: matched,
          transcript,
          confidence,
          isFinal: result.isFinal,
        });

        return;
      }
    };

    this._recognition.onerror = (event) => {
      if (this._debug) {
        console.warn("[VoiceModule] recognition error:", event.error);
      }

      // Do not restart immediately here. Let onend do it safely.
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        this._running = false;
      }
    };

    this._recognition.onend = () => {
      if (this._debug) {
        console.log("[VoiceModule] recognition ended");
      }

      if (!this._running || this._manualStop) return;

      this._scheduleRestart();
    };

    this._safeStart();
  }

  stop() {
    this._running = false;
    this._manualStop = true;

    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }

    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch (_) {}

      this._recognition = null;
    }

    this._lastCommand = null;
    this._lastCommandTime = 0;
  }

  _scheduleRestart() {
    if (this._restartTimer) return;

    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;

      if (!this._running || this._manualStop || !this._recognition) return;

      this._safeStart();
    }, this._restartDelayMs);
  }

  _safeStart() {
    if (!this._recognition || !this._running) return;

    try {
      this._recognition.start();
    } catch (err) {
      if (this._debug) {
        console.warn("[VoiceModule] start failed, retrying:", err);
      }

      this._scheduleRestart();
    }
  }

  _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
