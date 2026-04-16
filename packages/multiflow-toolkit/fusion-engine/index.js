

import { VoiceModule } from '../modules/voice-module.js';
import { CameraModule } from '../modules/camera.js';
import { ColorDetectionModule } from '../modules/color.js';
import { GestureModule } from '../modules/gesture.js';

/**
 * The MultiflowFusionEngine is responsible for orchestrating
 * multimodal inputs (speech, gestures, color detection) and
 * providing a unified output to the main application.
 * It uses a late fusion strategy for speech and color (for paint),
 * and simplified logic for background.
 */
export class MultiflowFusionEngine {
    constructor(options = {}) {
        console.log("MultiflowFusionEngine constructor: Starting init...");
        
        this.voiceModule = new VoiceModule();
        this.cameraModule = new CameraModule();
        this.colorModule = new ColorDetectionModule();

        // Instantiate GestureModule with smoothing options if provided
        const gestureOptions = {
            alpha: typeof options.gestureAlpha === 'number' ? options.gestureAlpha : 0.25,
            minMove: typeof options.gestureMinMove === 'number' ? options.gestureMinMove : 0.005
        };
        this.gestureModule = new GestureModule(gestureOptions);

        this.currentMode = 'idle'; // 'idle', 'painting', 'background_set'
        this.currentLineWidth = 1;

        // Last detected color + time for late fusion (for paint)
        this.lastDetectedColorEvent = { color: 'none', timestamp: 0 };
        this.FUSION_WINDOW_MS = typeof options.fusionWindowMs === 'number' ? options.fusionWindowMs : 3000; // ms

        this.currentPaintColor = null;
        this.lastHandPoint = null;

        // Behavior: if true, auto-apply detected color when in painting mode
        this.autoApplyColor = !!options.autoApplyColor;

        this.validSpeechCommands = ['paint', 'background', 'one', 'two', 'three', 'stop'];
        this.lineWidthMap = { 'one': 1, 'two': 2, 'three': 3 };

        this.onCommand = null;
        this.videoElement = null;
        this.colorDetectionInterval = null;

        console.log("🚀 MultiflowFusionEngine initialized successfully. gestureOptions:", gestureOptions, "fusionWindowMs:", this.FUSION_WINDOW_MS);
    }

    /**
     * Public: toggle autoApplyColor behavior at runtime.
     * @param {boolean} enabled
     */
    setAutoApplyColor(enabled) {
        this.autoApplyColor = !!enabled;
        console.log("autoApplyColor set to", this.autoApplyColor);
    }

    /**
     * Public: clear last detected color (useful after stop or reset).
     */
    clearLastColor() {
        this.lastDetectedColorEvent = { color: 'none', timestamp: 0 };
    }

    /**
     * Starts listening for multimodal inputs.
     * @param {Function} appCallback
     * @param {HTMLVideoElement} videoElem
     */
    async start(appCallback, videoElem) {
        this.onCommand = appCallback;
        this.videoElement = videoElem;

        console.log("FusionEngine.start: Attempting to start speech module...");
        if (typeof this.handleSpeechCommand === 'function' &&
            this.voiceModule &&
            typeof this.voiceModule.startListening === 'function') {
            this.voiceModule.startListening(this.handleSpeechCommand.bind(this));
        } else {
            console.error("FusionEngine.start: voiceModule not properly initialized or handleSpeechCommand missing.");
            this.emitCommand('error', 'Speech recognition module failed to start.');
        }
        
        // Start camera stream
        const cameraStarted = await this.cameraModule.startCamera(this.videoElement);
        if (cameraStarted) {
            console.log("Camera started within Fusion Engine.");
            this.videoElement.addEventListener('loadeddata', () => {
                this.startColorDetectionLoop();
                this.gestureModule.start(this.videoElement, this.handleGestureData.bind(this));
            }, { once: true }); 
        } else {
            this.emitCommand('error', 'Failed to start camera.');
        }

        console.log("Engine started. Listening for inputs...");
    }

    /**
     * Stops all multimodal input listening.
     */
    stop() {
        this.voiceModule.stopListening();
        this.cameraModule.stopCamera();
        this.stopColorDetectionLoop();
        this.colorModule.destroy();
        this.gestureModule.stop();

        this.currentMode = 'idle';
        this.currentPaintColor = null;
        this.lastHandPoint = null;
        this.lastDetectedColorEvent = { color: 'none', timestamp: 0 };
        console.log("Engine stopped.");
    }

    /**
     * Handles recognized speech commands.
     * @param {string} command
     */
 handleSpeechCommand(command) {
    const lower = command.toLowerCase().trim();
    const currentTime = Date.now();

    console.log('🗣 Raw speech command:', JSON.stringify(lower));

    const saidBackground = lower.includes('background');
    const saidPaint      = lower.includes('paint');
    const saidWait       = lower.includes('wait') || lower.includes('pause');
    const saidStop       = lower.includes('stop');
    const saidOne        = lower.includes('one');
    const saidTwo        = lower.includes('two');
    const saidThree      = lower.includes('three');

    const isColorRecent = (currentTime - this.lastDetectedColorEvent.timestamp <= this.FUSION_WINDOW_MS);
    const fusionColor   = this.lastDetectedColorEvent.color;

    // === WAIT / PAUSE ===
    if (saidWait) {
        // Pause painting without losing currentPaintColor
        if (this.currentMode === 'painting') {
            this.currentMode = 'paused';
            this.emitCommand('modeChange', this.currentMode);
            this.emitCommand('warning', 'Painting paused.');
        } else {
            this.emitCommand('warning', 'Not currently painting.');
        }
        return;
    }

    // === BACKGROUND ===
    if (saidBackground) {
        const bgColor = this.lastDetectedColorEvent.color;
        console.log('BACKGROUND command detected, using color:', bgColor);

        if (bgColor && bgColor !== 'none') {
            this.emitCommand('setBackgroundColor', bgColor);
            this.currentMode = 'background_set';
            this.emitCommand('modeChange', this.currentMode);
        } else {
            console.log('No color available for background.');
            this.emitCommand('warning', 'No color detected for background.');
        }
        return;
    }

    // === PAINT (resume or start) ===
    if (saidPaint) {
        // If we were paused, resume painting with existing currentPaintColor
        if (this.currentMode === 'paused') {
            this.currentMode = 'painting';
            this.emitCommand('modeChange', 'painting');
            this.emitCommand('startPainting', { color: this.currentPaintColor || 'default' });
            console.log('Resumed painting with color:', this.currentPaintColor);
            return;
        }

        // Otherwise start painting (late fusion logic)
        this.currentMode = 'painting';

        if (isColorRecent && fusionColor !== 'none' && fusionColor !== 'white') {
            console.log(`✨ LATE FUSION: Entering painting mode with color ${fusionColor}.`);
            this.currentPaintColor = fusionColor;
            this.emitCommand('startPainting', { color: fusionColor });
            this.lastDetectedColorEvent = { color: 'none', timestamp: 0 };
        } else {
            const reason = isColorRecent ? "color is white" : (fusionColor === 'none' ? "no color detected" : "color too old");
            console.log(`💡 LATE FUSION: Entering painting mode. ${reason}, using default color.`);
            this.currentPaintColor = 'black';
            this.emitCommand('startPainting', { color: this.currentPaintColor });
        }
        this.emitCommand('modeChange', 'painting');
        return;
    }

    // === Line width ===
    if (saidOne) {
        this.currentLineWidth = 1;
        this.emitCommand('lineWidthChange', this.currentLineWidth);
        return;
    }
    if (saidTwo) {
        this.currentLineWidth = 2;
        this.emitCommand('lineWidthChange', this.currentLineWidth);
        return;
    }
    if (saidThree) {
        this.currentLineWidth = 3;
        this.emitCommand('lineWidthChange', this.currentLineWidth);
        return;
    }

    // === STOP ===
    if (saidStop) {
        this.currentMode = 'idle';
        this.currentPaintColor = null;
        this.lastHandPoint = null;
        this.emitCommand('modeChange', 'idle');
        this.emitCommand('setBackgroundColor', 'none');
        return;
    }

    console.log(`❌ Fusion Engine did not match speech command to any action: "${lower}"`);
}


    /**
     * Starts a loop to continuously detect colors from the video feed.
     */
    startColorDetectionLoop() {
        if (!this.videoElement) {
            console.error("Cannot start color detection loop: video element is not set.");
            return;
        }
        if (this.colorDetectionInterval) {
            this.stopColorDetectionLoop();
        }

        if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
            console.warn("Video dimensions not ready for color detection. Retrying in 200ms.");
            setTimeout(() => this.startColorDetectionLoop(), 200);
            return;
        }

        const centerX = this.videoElement.videoWidth / 2;
        const centerY = this.videoElement.videoHeight / 2;

        this.colorDetectionInterval = setInterval(() => {
            const detected = this.colorModule.detectColor(this.videoElement, centerX, centerY);
            this.updateDetectedColor(detected);
        }, 100);
    }

    stopColorDetectionLoop() {
        if (this.colorDetectionInterval) {
            clearInterval(this.colorDetectionInterval);
            this.colorDetectionInterval = null;
            console.log("Color detection loop stopped.");
        }
    }

    /**
     * Update lastDetectedColorEvent + emit for UI.
     * @param {string} color
     */
    updateDetectedColor(color) {
        if (color !== this.lastDetectedColorEvent.color) {
            this.lastDetectedColorEvent = { color: color, timestamp: Date.now() };
            console.log(`🌈 Internal last detected color updated to: ${color} at ${this.lastDetectedColorEvent.timestamp}`);
            this.emitCommand('colorDetected', color); 
        }
    }

    /**
     * Called by GestureModule with normalized { x, y } when a hand is detected.
     * Emits 'drawPoint' ONLY in painting mode and when we have a paint color.
     * @param {{x:number,y:number}} point
     */
    handleGestureData(point) {
        if (this.currentMode !== 'painting' || !this.currentPaintColor) {
            return;
        }

        const { x, y } = point;

        this.emitCommand('drawPoint', {
            x,
            y,
            color: this.currentPaintColor,
            lineWidth: this.currentLineWidth
        });
    }

    /**
     * Emits a processed command/event to the registered application callback.
     * @param {string} eventType
     * @param {*} data
     */
    emitCommand(eventType, data) {
        if (this.onCommand) {
            this.onCommand({ type: eventType, data: data });
        }
    }
}