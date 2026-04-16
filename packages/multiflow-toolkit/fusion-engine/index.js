import { VoiceModule } from '../modules/voice-module.js';
import { CameraModule } from '../modules/camera.js';
import { ColorDetectionModule } from '../modules/color.js';
import { GestureModule } from '../modules/gesture.js';

export class MultiflowFusionEngine {
    constructor(options = {}) {
        this.voiceModule = new VoiceModule();
        this.cameraModule = new CameraModule();
        this.colorModule = new ColorDetectionModule();
        this.gestureModule = new GestureModule(options);

        this.currentMode = 'idle'; 
        this.detectedColor = 'none'; 
        this.activePaintColor = null;
        this.colorTimestamp = 0;
        
        // Timer window: 3 seconds (3000ms)
        this.FUSION_WINDOW = 3000; 
        this.onCommand = null;
        this.videoElement = null;
    }

    async start(appCallback, videoElem) {
        this.onCommand = appCallback;
        this.videoElement = videoElem;
        this.voiceModule.startListening((cmd) => this.handleSpeechCommand(cmd));
        
        const cameraStarted = await this.cameraModule.startCamera(this.videoElement);
        if (cameraStarted) {
            this.startColorDetectionLoop();
            this.gestureModule.start(this.videoElement, (pt) => this.handleGestureData(pt));
        }
    }

    handleSpeechCommand(command) {
        const lower = command.toLowerCase().trim();
        const now = Date.now();
        
        // RULE: Check if the last color was detected within the last 3 seconds
        const isColorFresh = (now - this.colorTimestamp <= this.FUSION_WINDOW);
        const hasColor = isColorFresh && this.detectedColor !== 'none';

        // RULE 3: STOP / RESET
        if (lower.includes('stop') || lower.includes('reset')) {
            this.currentMode = 'idle';
            this.activePaintColor = null;
            this.emitCommand('stop', 'stop');
            return;
        }

        // IF NO COLOR DETECTED IN THE LAST 3 SECONDS, IGNORE COMMANDS
        if (!hasColor) {
            console.log("Ignored: Color is too old or not detected. (3s limit)");
            return;
        }

        // RULE 1: BACKGROUND (Only if color is fresh)
        if (lower.includes('background')) {
            console.log("Success: Changing background to " + this.detectedColor);
            this.emitCommand('setBackgroundColor', this.detectedColor);
            this.currentMode = 'idle'; 
            return;
        }

        // RULE 2: PAINT (Only if color is fresh)
        if (lower.includes('paint') || lower.includes('draw')) {
            console.log("Success: Painting started with " + this.detectedColor);
            this.activePaintColor = this.detectedColor;
            this.currentMode = 'painting';
            this.emitCommand('startPainting', { color: this.activePaintColor });
            return;
        }
    }

    handleGestureData(point) {
        // Only draw if painting mode is active AND a color is locked
        if (this.currentMode === 'painting' && this.activePaintColor) {
            this.emitCommand('drawPoint', {
                x: point.x,
                y: point.y,
                color: this.activePaintColor
            });
        }
    }

    startColorDetectionLoop() {
        setInterval(() => {
            if (this.videoElement && this.videoElement.readyState >= 2) {
                const centerX = this.videoElement.videoWidth / 2;
                const centerY = this.videoElement.videoHeight / 2;
                const color = this.colorModule.detectColor(this.videoElement, centerX, centerY);
                
                if (color !== 'none') {
                    this.detectedColor = color;
                    this.colorTimestamp = Date.now(); // Reset the 3-second timer
                    this.emitCommand('colorDetected', color);
                }
            }
        }, 200);
    }

    emitCommand(type, data) {
        if (this.onCommand) this.onCommand({ type, data });
    }
}