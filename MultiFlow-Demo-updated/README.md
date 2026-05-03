# MultiFlow — A Modular Multimodal Toolkit

> Voice · Gesture · Color — fused in real time.
> Built as an application-agnostic library: plug in any modality, define your own fusion logic.

**Group 2** — Henri Kangas · Allizha Theiventhiram · Charalampos Filis · Boris Verdecia Echarte · Sandra Nikoloska

---

## What is MultiFlow?

MultiFlow is an interactive toolkit that combines **voice**, **gesture**, and **color** input modalities into a seamless multimodal experience. It is designed as a reusable, extensible library — any application can import it, register the modalities it needs, and define its own fusion rules without touching the toolkit code.

---

## Project Structure

```
MultiFlow-DemoPoject/
├── packages/
│   └── multiflow-toolkit/          ← core library (application-agnostic)
│       └── src/
│           ├── IModalityModule.js  ← shared interface all modules implement
│           ├── VoiceModule.js      ← Web Speech API
│           ├── GestureModule.js    ← MediaPipe Hands + EMA smoothing
│           ├── ColorDetectionModule.js  ← RGB sampling + color mapping
│           ├── FusionEngine.js     ← generic plugin registry + late fusion
│           └── index.js            ← public exports
└── apps/
    └── smart-paint/                ← demo application
        ├── index.html              ← UI
        ├── main.js                 ← thin wiring layer
        ├── fusionRules.js          ← Smart Paint fusion logic
        └── CanvasRenderer.js       ← all drawing logic
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                       │
│   index.html · styles.css · CanvasRenderer.js                  │
│   drawAt() · setBackground() · clear() · Event Listeners       │
└────────────────────────────┬────────────────────────────────────┘
                             │ intents
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ORCHESTRATION LAYER                       │
│                        FusionEngine                             │
│   register(module) · setFusionRule(fn) · onIntent(cb)          │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│   │ Event Buffer │  │ Temporal     │  │ Pluggable Fusion    │  │
│   │ (all events) │  │ Window (3s)  │  │ Rule (per app)      │  │
│   └──────────────┘  └──────────────┘  └─────────────────────┘  │
└──────────┬───────────────────┬────────────────────┬─────────────┘
           │                   │                    │
           ▼                   ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│   VoiceModule    │ │  GestureModule   │ │ ColorDetectionModule │
│                  │ │                  │ │                      │
│ Web Speech API   │ │ MediaPipe Hands  │ │ Canvas 2D Context    │
│ Continuous rec.  │ │ EMA Smoothing    │ │ RGB Sampling         │
│ Commands:        │ │ Coordinate       │ │ Color Mapping        │
│  "paint"         │ │ Tracking         │ │ Real-time Update     │
│  "background"    │ │ Movement         │ │ Center Point         │
│  "stop"          │ │ Detection        │ │ Detection            │
│  "clear"         │ │                  │ │                      │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
         All extend IModalityModule: start() · stop() · onData(cb)
```

---

## Fusion Strategy

MultiFlow uses **Late Fusion** (decision-level):

1. Each modality is processed **independently** — no cross-module dependencies
2. All events are buffered in a **3-second temporal window**
3. A **pluggable fusion rule** (defined by the app, not the toolkit) inspects the buffer and resolves a user intent
4. Multimodal validation: certain commands (e.g. `"background"`) require at least two modalities active simultaneously

```
Speech → "background"  ┐
                        ├─ FusionEngine ──→ { intent: "setBackground", color: "red" }
Color  → "red"         ┘
```

---

## How to Run

You need a local HTTP server (ES modules don't work from `file://`).

**Python** (no install needed):
```bash
cd apps/smart-paint
python3 -m http.server 8080
```
Open: **http://localhost:8080**

**Node.js:**
```bash
npx serve apps/smart-paint -p 8080
```

**VS Code:** right-click `apps/smart-paint/index.html` → Open with Live Server

---

## Voice Commands (Smart Paint)

| Command | Action |
|---------|--------|
| `"paint"` + hand gesture | Draw on canvas using hand position |
| `"stop"` | Pause drawing |
| `"background"` + color in frame | Set canvas background to detected color |
| `"clear"` | Wipe the canvas |

---

## How to Add a New Modality

The toolkit is fully plugin-based. To add eye tracking, EEG, touchpad, or any other input:

1. Create `packages/multiflow-toolkit/src/EyeTrackingModule.js`
2. Extend `IModalityModule`
3. Implement `start()`, `stop()`, emit events via `this._emit(type, payload)`
4. Export it from `index.js`
5. In your app: `engine.register(new EyeTrackingModule())`
6. Handle it in your fusion rule

**Zero changes to the toolkit or other modules.**

---

## Tech Stack

- **Web Speech API** — voice recognition
- **MediaPipe Hands** — hand landmark tracking
- **Canvas 2D API** — color detection + drawing
- **Vanilla JS ES Modules** — no build step, runs in the browser
