/**
 * ColorDetectionModule detects specific colors from a video stream at a given point.
 */
export class ColorDetectionModule {
    constructor() {
        // Create a hidden canvas to draw video frames for pixel analysis
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d', { willReadFrequently: true }); // optimize for read operations
        this.canvas.style.display = 'none'; // Keep it hidden from view
        document.body.appendChild(this.canvas); // Append to body so it's in the DOM

        console.log("🌈 ColorDetectionModule initialized.");
    }

    /**
     * Analyzes the color at a specific (x, y) coordinate from the video stream.
     * @param {HTMLVideoElement} videoElement - The <video> element containing the stream.
     * @param {number} x - The x-coordinate in the video frame (scaled to video dimensions).
     * @param {number} y - The y-coordinate in the video frame (scaled to video dimensions).
     * @returns {string} - The detected color name ('red', 'yellow', 'green', 'blue', 'black', 'white', or 'none').
     */
    detectColor(videoElement, x, y) {
        if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
            return 'none'; // Not enough video data yet to read pixels
        }

        // Ensure canvas dimensions match video for accurate pixel picking
        // This is important because video dimensions might be different from displayed dimensions
        if (this.canvas.width !== videoElement.videoWidth || this.canvas.height !== videoElement.videoHeight) {
            this.canvas.width = videoElement.videoWidth;
            this.canvas.height = videoElement.videoHeight;
        }

        // Draw the current video frame onto the hidden canvas
        this.context.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);

        // Get pixel data at the specified (x, y) coordinate
        let pixel = this.context.getImageData(x, y, 1, 1).data;
        let r = pixel[0]; // Red component
        let g = pixel[1]; // Green component
        let b = pixel[2]; // Blue component

        // Simple color classification based on RGB ranges
        // These thresholds can be fine-tuned for better accuracy in different lighting conditions
        // Note: 'white' is added as it's common. 'green' and 'yellow' might need careful tuning
        if (r > 150 && g < 80 && b < 80) { // Dominant Red
            return 'red';
        } else if (r > 180 && g > 180 && b < 100 && (r - b > 50) && (g - b > 50)) { // High Red, High Green, Low Blue (Yellowish)
            return 'yellow';
        } else if (g > 150 && r < 80 && b < 80) { // Dominant Green
            return 'green';
        } else if (b > 150 && r < 80 && g < 80) { // Dominant Blue
            return 'blue';
        } else if (r < 60 && g < 60 && b < 60) { // Very Low RGB (Blackish)
            return 'black';
        } else if (r > 200 && g > 200 && b > 200) { // Very High RGB (Whitish)
            return 'white';
        }
        
        return 'none'; // No specific color detected
    }

    /**
     * Removes the hidden canvas from the DOM if it was added.
     * This is important for cleanup when the engine stops.
     */
    destroy() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
