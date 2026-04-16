/**
 * CameraModule handles accessing and streaming video from the user's webcam.
 */
export class CameraModule {
    constructor() {
        this.videoElement = null; // Will store the HTML <video> element
        this.stream = null;       // Will store the MediaStream object
        console.log("📸 CameraModule initialized.");
    }

    /**
     * Starts the webcam stream and displays it in the provided video element.
     * @param {HTMLVideoElement} videoElem - The HTML <video> element to display the stream.
     * @returns {Promise<boolean>} - Resolves to true if camera started successfully, false otherwise.
     */
    async startCamera(videoElem) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("Browser API navigator.mediaDevices.getUserMedia not available.");
            alert("Your browser does not support webcam access. Please use a modern browser like Chrome, Firefox, or Edge.");
            return false;
        }

        this.videoElement = videoElem;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.videoElement.srcObject = this.stream;
            // Play video to ensure it's rendering
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => { // Wait for video metadata to load
                    this.videoElement.play(); // Start playing the video
                    resolve();
                };
            });
            console.log("✅ Camera stream started successfully.");
            return true;
        } catch (error) {
            console.error("Error accessing webcam:", error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                alert("Permission to access webcam was denied. Please allow camera access in your browser settings.");
            } else if (error.name === 'NotFoundError') {
                alert("No webcam found. Please ensure a webcam is connected and properly configured.");
            } else {
                alert(`Could not start camera: ${error.message}`);
            }
            return false;
        }
    }

    /**
     * Stops the webcam stream.
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop()); // Stop all tracks (video, audio if any)
            this.stream = null;
            if (this.videoElement) {
                this.videoElement.srcObject = null; // Disconnect the stream from the video element
            }
            console.log("🔇 Camera stream stopped.");
        }
    }

    /**
     * Returns the video element currently linked to the camera stream.
     * @returns {HTMLVideoElement|null}
     */
    getVideoElement() {
        return this.videoElement;
    }
}