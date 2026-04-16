// packages/multiflow-toolkit/modules/voice.js

export class VoiceModule {
    constructor() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        // Add an 'isSupported' flag to indicate if the browser API is available.
        this.isSupported = !!SpeechRecognition; 
        this.recognition = null; // Initialize to null

        if (!this.isSupported) {
            console.error("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
            // IMPORTANT: Remove the 'return;' statement.
            // If we return here, `this.speechModule` in the FusionEngine would be 'undefined',
            // leading to the `TypeError: Cannot read properties of undefined (reading 'bind')`.
            // We'll handle the 'not supported' case gracefully within the methods.
        } else {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true; // Keep listening continuously, not just once
            this.recognition.interimResults = false; // Return only final results, not interim ones
            this.recognition.lang = 'en-US'; // Set the language for recognition
            this.onCommand = null; // This will store the callback function to handle recognized words
        }
        console.log("🎤 VoiceModule initialized. Supported:", this.isSupported);
    }

    /**
     * Starts the speech recognition process.
     * @param {Function} callback - The function to be called when a word is recognized.
     *                              It receives the recognized word as an argument.
     */
    startListening(callback) {
        if (!this.isSupported || !this.recognition) {
            console.error("Voice Recognition is not supported by this browser or not initialized. Cannot start listening.");
            return; // Gracefully exit if not supported or not properly initialized
        }

        this.onCommand = callback;

        this.recognition.onresult = (event) => {
            // Get the latest recognized word/phrase
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript.trim().toLowerCase();
            
            console.log("🗣 Recognized:", transcript);

            // If a callback is set, invoke it with the recognized word
            if (this.onCommand) {
                this.onCommand(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Speech error:", event.error);
            // Handle specific errors if needed, e.g., 'not-allowed' for microphone access issues
        };

        this.recognition.onend = () => {
            // This event fires when the speech recognition service has disconnected.
            // If continuous is true, it might restart automatically, but sometimes needs explicit restart.
            console.log("Speech recognition ended.");
            // You might want to add logic to restart if continuous mode is expected
            // if (this.recognition.continuous) {
            //     this.recognition.start();
            // }
        };

        this.recognition.start();
        console.log("🎤 Voice module is active and listening...");
    }

    /**
     * Stops the speech recognition process.
     */
    stopListening() {
        if (this.isSupported && this.recognition) {
            this.recognition.stop();
            console.log("🔇 Voice module is turned off.");
        }
    }
}
