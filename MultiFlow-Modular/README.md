# MultiFlow — Modular Refactoring

## Project Structure

```
MultiFlow-Modular/
├── packages/
│   └── multiflow-toolkit/
│       └── src/
│           ├── IModalityModule.js      ← shared interface (NEW)
│           ├── VoiceModule.js          ← refactored: extends interface
│           ├── GestureModule.js        ← refactored: extends interface
│           ├── ColorDetectionModule.js ← refactored: extends interface
│           ├── FusionEngine.js         ← refactored: generic plugin registry
│           └── index.js               ← public exports
└── apps/
    └── smart-paint/
        ├── index.html       ← UI
        ├── main.js          ← thin wiring layer (imports toolkit, sets up engine)
        ├── fusionRules.js   ← app-specific fusion logic (NEW — moved OUT of engine)
        └── CanvasRenderer.js ← all drawing logic (NEW — separated from main)
```

## Key Architecture Changes

| Before | After |
|--------|-------|
| All logic in `script.js` | Separated into toolkit + app layers |
| FusionEngine hardcoded for Smart Paint | FusionEngine is generic — accepts any module |
| Modules defined inside the app | Modules in `multiflow-toolkit` package |
| Fusion rules mixed into engine | Fusion rules live in the app (`fusionRules.js`) |
| No shared interface | `IModalityModule` base class for all modules |

## How to Run

### Option 1: Simple (recommended for testing)

You need a local HTTP server because the app uses ES modules (`import`/`export`).

**Using Python** (no install needed):
```bash
cd apps/smart-paint
python3 -m http.server 8080
```
Then open: http://localhost:8080

**Using Node.js `npx serve`:**
```bash
npx serve apps/smart-paint -p 8080
```
Then open: http://localhost:8080

**Using VS Code Live Server:**
Right-click `apps/smart-paint/index.html` → Open with Live Server

### Option 2: Direct file (may not work due to CORS on modules)
Modern browsers block ES module imports from `file://`. Use a local server.

## How to Use the App

1. Click **▶ Start** — this requests microphone and camera permissions
2. Say **"paint"** and move your hand in front of the camera → draws on canvas
3. Say **"stop"** → pauses drawing
4. Hold a colored object in front of the camera, then say **"background"** → changes canvas background to detected color
5. Say **"clear"** → clears the canvas
6. Use the **brush color** picker and **size** slider for manual control

## How to Add a New Modality (the whole point!)

1. Create `packages/multiflow-toolkit/src/MyNewModule.js`
2. Extend `IModalityModule`
3. Implement `start()`, `stop()`, and emit events via `this._emit(type, payload)`
4. Export it from `index.js`
5. Register it in your app: `engine.register(new MyNewModule())`
6. Handle its events in your fusion rule

**No changes needed to FusionEngine, VoiceModule, GestureModule, or ColorDetectionModule.**

## Browser Requirements

- Chrome or Edge (Web Speech API support)
- Webcam + microphone
- JavaScript ES modules (all modern browsers)
