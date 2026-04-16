import { IModalityModule } from "./IModalityModule.js";

/**
 * VoiceModule — captures speech input using the Web Speech API.
 *
 * Emits events of type "command" with payload: { command: string, transcript: string }
 *
 * Usage:
 *   const voice = new VoiceModule({ commands: ["paint", "stop", "clear", "background"] });
 *   voice.onData(event => console.log(event));
 *   voice.start();
 */
export class VoiceModule extends IModalityModule {
  /**
   * @param {object} config
   * @param {string[]} config.commands - list of commands to listen for
   * @param {string}   config.lang     - language code (default: "en-US")
   */
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
    this._recognition.interimResults = false;
    this._recognition.lang = this._lang;

    this._recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript
        .trim()
        .toLowerCase();

      const matched = this._commands.find((cmd) => transcript.includes(cmd));
      if (matched) {
        this._emit("command", { command: matched, transcript });
      }
    };

    this._recognition.onerror = (event) => {
      // Auto-restart on recoverable errors
      if (event.error === "no-speech" || event.error === "aborted") {
        if (this._running) this._recognition.start();
      } else {
        console.warn("[VoiceModule] Speech recognition error:", event.error);
      }
    };

    this._recognition.onend = () => {
      // Keep listening unless explicitly stopped
      if (this._running) this._recognition.start();
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
