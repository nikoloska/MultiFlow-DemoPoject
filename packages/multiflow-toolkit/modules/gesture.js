// packages/multiflow-toolkit/modules/gesture.js

/**
 * GestureModule uses MediaPipe Hands to track the index fingertip position.
 * It calls the provided callback with normalized coordinates { x, y } in [0, 1].
 * It REUSES the existing webcam video (started by CameraModule) and does NOT
 * create a second camera stream.
 *
 * Includes smoothing (exponential moving average) and jitter reduction (minMove).
 */
export class GestureModule {
    constructor(options = {}) {
        this.hands = null;
        this.onHandData = null;
        this.videoElement = null;
        this.animationFrameId = null;

        // Smoothing params (alpha for EMA). Lower alpha = more smoothing.
        this.alpha = typeof options.alpha === 'number' ? options.alpha : 0.25;
        // Minimum normalized distance to emit a new point (to avoid jitter)
        this.minMove = typeof options.minMove === 'number' ? options.minMove : 0.005;

        // Internal state for smoothing
        this.smoothedX = null;
        this.smoothedY = null;

        // Emit at least every N frames even if movement small
        this.forceEmitFrames = typeof options.forceEmitFrames === 'number' ? options.forceEmitFrames : 3;
        this.frameCounter = 0;

        console.log("🤚 GestureModule initialized. alpha:", this.alpha, "minMove:", this.minMove);
    }

    /**
     * Update smoothing parameters at runtime.
     * @param {object|number} aOrObj - alpha or { alpha, minMove }
     * @param {number} [minMove] - minimum movement threshold (optional)
     */
    setParams(aOrObj, minMove) {
        if (typeof aOrObj === 'object' && aOrObj !== null) {
            if (typeof aOrObj.alpha === 'number') this.alpha = aOrObj.alpha;
            if (typeof aOrObj.minMove === 'number') this.minMove = aOrObj.minMove;
            if (typeof aOrObj.forceEmitFrames === 'number') this.forceEmitFrames = aOrObj.forceEmitFrames;
        } else {
            if (typeof aOrObj === 'number') this.alpha = aOrObj;
            if (typeof minMove === 'number') this.minMove = minMove;
        }
        console.log('GestureModule params updated: alpha=', this.alpha, 'minMove=', this.minMove, 'forceEmitFrames=', this.forceEmitFrames);
    }

    /**
     * Starts hand tracking on the given video element.
     * @param {HTMLVideoElement} videoElem - Video element with a running webcam stream.
     * @param {Function} callback - Called with { x, y } when a hand is detected.
     */
    async start(videoElem, callback) {
        this.videoElement = videoElem;
        this.onHandData = callback;

        if (typeof Hands === 'undefined') {
            console.error("MediaPipe Hands is not loaded. Include its <script> tags in index.html.");
            return;
        }

        this.hands = new Hands({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7,
        });

        this.hands.onResults(this.handleResults.bind(this));

        // IMPORTANT: we DO NOT create a second Camera here.
        // We just read frames from the already running video via requestAnimationFrame.

        const loop = async () => {
            if (!this.videoElement || this.videoElement.readyState < 2 || !this.hands) {
                this.animationFrameId = requestAnimationFrame(loop);
                return;
            }

            try {
                await this.hands.send({ image: this.videoElement });
            } catch (e) {
                console.error("Error sending frame to MediaPipe Hands:", e);
            }

            this.animationFrameId = requestAnimationFrame(loop);
        };

        this.animationFrameId = requestAnimationFrame(loop);
        console.log("🤚 Gesture tracking started (using existing video stream).");
    }

    /**
     * MediaPipe callback with hand landmarks.
     * Applies smoothing and jitter reduction before invoking onHandData.
     */
    handleResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            // No hand detected; reset frameCounter so next detection will emit immediately
            this.frameCounter = 0;
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8]; // index fingertip

        // Normalized coordinates [0,1], (0,0) top-left.
        // Our video is mirrored (scaleX(-1)), so mirror x:
        const rawX = 1 - indexTip.x;
        const rawY = indexTip.y;

        // Initialize smoothed values if null
        if (this.smoothedX === null || this.smoothedY === null) {
            this.smoothedX = rawX;
            this.smoothedY = rawY;
        } else {
            // Exponential moving average
            const a = this.alpha;
            this.smoothedX = this.smoothedX + a * (rawX - this.smoothedX);
            this.smoothedY = this.smoothedY + a * (rawY - this.smoothedY);
        }

        // Compute distance between raw and smoothed (use smoothed for emit)
        const dx = rawX - this.smoothedX;
        const dy = rawY - this.smoothedY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.frameCounter = (this.frameCounter + 1) % this.forceEmitFrames;

        // Emit if movement above threshold or periodically to avoid freeze
        if (dist >= this.minMove || this.frameCounter === 0) {
            if (this.onHandData) {
                // Clamp values to [0,1]
                const emitX = Math.min(1, Math.max(0, this.smoothedX));
                const emitY = Math.min(1, Math.max(0, this.smoothedY));
                this.onHandData({ x: emitX, y: emitY });
            }
        }
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.hands) {
            this.hands.close();
            this.hands = null;
        }
        this.videoElement = null;
        this.smoothedX = null;
        this.smoothedY = null;
        this.frameCounter = 0;
        console.log("🤚 Gesture tracking stopped.");
    }
}
