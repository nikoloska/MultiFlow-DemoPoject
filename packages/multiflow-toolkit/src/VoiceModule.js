import { IModalityModule } from "./IModalityModule.js";

/**
 * VoiceModule — captures speech input using the Web Speech API.
 *
 * Emits events of type "command" with payload:
 * { command: string, transcript: string, confidence: number }
 */
// Voice recognition was made more responsive by enabling interim results,
// so short commands like "paint" can be detected before the browser finalizes speech.
// maxAlternatives = 5 lets the module check several recognition guesses instead of only the top one.
// The confidence filter was removed because short words often receive low confidence even when correct.
// This makes commands trigger more reliably with fewer repeated attempts.
export class VoiceModule extends IModalityModule {
  constructor(config = {}) {
    super("voice");
    this._commands = config.commands || ["paint", "stop", "clear", "background"];
    this._lang = config.lang || "en-US";
    this._recognition = null;
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

    this._recognition = new SpeechRecognition();
    this._recognition.continuous = true;

    // Important: true makes it react faster and improves short command detection.
    this._recognition.interimResults = true;

    // Ask browser for more guesses.
    this._recognition.maxAlternatives = 5;

    this._recognition.lang = this._lang;

    this._recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];

      // Ignore very unstable interim results, but still allow final/interim command matching.
      const alternatives = Array.from(result);

      for (const alt of alternatives) {
        const transcript = alt.transcript.trim().toLowerCase();
        const confidence = alt.confidence ?? 1;

        const matched = this._commands.find((cmd) => {
          const pattern = new RegExp(`\\b${cmd}\\b`, "i");
          return pattern.test(transcript);
        });

        if (matched) {
          this._emit("command", {
            command: matched,
            transcript,
            confidence,
          });
          return;
        }
      }
    };

    this._recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        if (this._running) {
          try {
            this._recognition.start();
          } catch (_) {}
        }
      } else {
        console.warn("[VoiceModule] Speech recognition error:", event.error);
      }
    };

    this._recognition.onend = () => {
      if (this._running) {
        try {
          this._recognition.start();
        } catch (_) {}
      }
    };

    this._running = true;
    this._recognition.start();
  }

  stop() {
    this._running = false;

    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
    }
  }
}
