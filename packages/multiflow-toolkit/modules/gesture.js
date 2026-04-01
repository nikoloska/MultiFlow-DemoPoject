// packages/multiflow-toolkit/modules/gesture.js

/**
 * GestureModule uses MediaPipe Hands to track the index fingertip position.
 * It calls the provided callback with normalized coordinates { x, y } in [0, 1].
 * It REUSES the existing webcam video (started by CameraModule) and does NOT
 * create a second camera stream.
 */
export class GestureModule {
    constructor() {
        this.hands = null;
        this.onHandData = null;
        this.videoElement = null;
        this.animationFrameId = null;
        console.log("🤚 GestureModule initialized.");
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
     */
    handleResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8]; // index fingertip

        // Normalized coordinates [0,1], (0,0) top-left.
        // Our video is mirrored (scaleX(-1)), so mirror x:
        const x = 1 - indexTip.x;
        const y = indexTip.y;

        // console.log('Gesture raw indexTip:', indexTip, 'mapped:', { x, y });

        if (this.onHandData) {
            this.onHandData({ x, y });
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
        console.log("🤚 Gesture tracking stopped.");
    }
}
