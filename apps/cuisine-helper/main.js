/**
 * Cuisine Helper — main entry point.
 *
 * Fusion rules (all require AT LEAST 2 modalities):
 *   color + voice(cuisine)              → FILTER_CUISINE
 *   color + voice "open/cook" + gesture → OPEN_RECIPE
 *   voice "next"  + gesture swipe →     → NEXT_STEP
 *   voice "prev"  + gesture swipe ←     → PREV_STEP
 *   voice "stop"  + gesture swipe ←     → STOP
 */
 
import {
  FusionEngine,
  VoiceModule,
  GestureModule,
  ColorDetectionModule,
} from "../../packages/multiflow-toolkit/src/index.js";
 
import { fusionConfig } from "./fusionRules.js";
 
// ─── 1. Recipe Data ───────────────────────────────────────────────────────────
const RECIPES = [
  {
    cuisine: "French", color: "blue", emoji: "🇫🇷",
    title: "Coq au Vin",
    steps: [
      "Season chicken pieces with salt and pepper.",
      "Brown chicken in butter over medium-high heat, then set aside.",
      "Sauté onions, garlic and mushrooms in the same pan.",
      "Add red wine and chicken stock, return chicken to pan.",
      "Simmer covered for 45 minutes until tender. Serve hot.",
    ],
  },
  {
    cuisine: "Italian", color: "red", emoji: "🇮🇹",
    title: "Pasta Carbonara",
    steps: [
      "Cook spaghetti in well-salted boiling water until al dente.",
      "Fry pancetta until crispy, set aside.",
      "Whisk eggs with Pecorino Romano and black pepper.",
      "Toss hot pasta with pancetta, then egg mixture off heat.",
      "Serve immediately with extra cheese and pepper.",
    ],
  },
  {
    cuisine: "Japanese", color: "white", emoji: "🇯🇵",
    title: "Chicken Ramen",
    steps: [
      "Simmer chicken bones with ginger and green onion for 2 hours.",
      "Strain broth, season with soy sauce and mirin.",
      "Cook ramen noodles separately according to package.",
      "Slice chashu pork or poached chicken for topping.",
      "Assemble: broth → noodles → toppings. Serve immediately.",
    ],
  },
  {
    cuisine: "Mexican", color: "orange", emoji: "🇲🇽",
    title: "Chicken Tacos",
    steps: [
      "Marinate chicken in lime juice, cumin, chilli powder, garlic.",
      "Grill chicken over high heat for 6–7 minutes each side.",
      "Rest chicken 5 minutes, then slice thinly.",
      "Warm tortillas on a dry pan.",
      "Assemble with chicken, salsa, avocado, and coriander.",
    ],
  },
  {
    cuisine: "Greek", color: "yellow", emoji: "🇬🇷",
    title: "Moussaka",
    steps: [
      "Slice and salt eggplant, let rest 20 min, then fry until golden.",
      "Brown minced lamb with onion, garlic, cinnamon, and tomato.",
      "Make béchamel: butter + flour + warm milk + nutmeg.",
      "Layer: eggplant → meat → béchamel in a baking dish.",
      "Bake at 180°C for 45 minutes until top is golden.",
    ],
  },
];
 
// ─── Cuisine keyword → display name map ──────────────────────────────────────
const CUISINE_MAP = {
  french: "French", italian: "Italian", japanese: "Japanese",
  mexican: "Mexican", greek: "Greek",
};
 
// ─── 2. App State ─────────────────────────────────────────────────────────────
let activeRecipes = [...RECIPES];
let currentIndex  = 0;
let currentStep   = 0;
 
// Tracks detected modalities waiting to complete a combo
const pending = { voice: null, color: null, gesture: null };
 
// ─── 3. DOM Refs ──────────────────────────────────────────────────────────────
const webcamVideo       = document.getElementById("webcam-video");
const recipeTitleEl     = document.getElementById("recipe-title");
const recipeCuisineEl   = document.getElementById("recipe-cuisine");
const recipeStepEl      = document.getElementById("recipe-step");
const stepCounterEl     = document.getElementById("step-counter");
const colorDotEl        = document.getElementById("color-dot");
const colorLabelEl      = document.getElementById("color-label");
const statusBarEl       = document.getElementById("status-bar");
const comboStatusEl     = document.getElementById("combo-status");
const filterBadgeEl     = document.getElementById("filter-badge");
const filterBadgeTextEl = document.getElementById("filter-badge-text");
 
// ─── 4. Modality Modules ──────────────────────────────────────────────────────
const voice = new VoiceModule({
  commands: ["next", "previous", "back", "stop", "open", "cook",
             "french", "italian", "japanese", "mexican", "greek"],
});
 
const gesture = new GestureModule({
  smoothing:    0.2,
  videoElement: webcamVideo,
});
 
const color = new ColorDetectionModule({
  intervalMs:   150,
  videoElement: webcamVideo,
});
 
// ─── 5. Fusion Engine — declarative config ────────────────────────────────────
// setFusionConfig() instead of setFusionRule() — no fusion logic in the app
const engine = new FusionEngine({ windowMs: 4000 })
  .register(voice)
  .register(gesture)
  .register(color)
  .setFusionConfig(fusionConfig);
 
// ─── 6. Raw Events — update pending state for UI feedback ────────────────────
engine.onRawEvent((event) => {
  if (event.source === "color" && event.type === "color") {
    pending.color = event.payload;
    _updateColorIndicator(event.payload);
    window.indicatePulse?.("color");
  }
 
  if (event.source === "voice" && event.type === "command") {
    pending.voice = event.payload.command;
    window.indicatePulse?.("voice");
    _setStatus(`Heard: "${event.payload.command}" — waiting for matching modality…`, "#C8A96E");
  }
 
  if (event.source === "gesture" && event.type === "position") {
    pending.gesture = event.payload;
    window.indicatePulse?.("gesture");
  }
 
  _updateComboStatus();
});
 
// ─── 7. Intent Handling ───────────────────────────────────────────────────────
// FusionEngine (setFusionConfig) emits: { intent, trigger, voicePayload, colorPayload, gesturePayload }
engine.onIntent(({ intent, trigger, voicePayload, colorPayload }) => {
  _setStatus(`✓ ${intent}  ·  triggered by: ${trigger}`, "#3B7A6B");
 
  switch (intent) {
 
    case "FILTER_CUISINE": {
      // Derive cuisine display name from the voice command
      const cuisine  = CUISINE_MAP[voicePayload?.command];
      const filtered = cuisine ? RECIPES.filter(r => r.cuisine === cuisine) : [];
      if (filtered.length) {
        activeRecipes = filtered;
        currentIndex  = 0;
        currentStep   = 0;
        _updateUI();
        _showFilterBadge(cuisine, colorPayload);
        _flashCard("green");
      }
      break;
    }
 
    case "OPEN_RECIPE": {
      // Match recipe by the detected color name
      const matched = RECIPES.find(r => r.color === colorPayload?.name);
      if (matched) {
        activeRecipes = [matched];
        currentIndex  = 0;
        currentStep   = 0;
        _updateUI();
        _showFilterBadge(matched.cuisine, colorPayload);
        _flashCard("green");
      }
      break;
    }
 
    case "NEXT_STEP": {
      window.showGestureHint?.("next");
      const recipe = activeRecipes[currentIndex];
      if (currentStep < recipe.steps.length - 1) {
        currentStep++;
      } else if (currentIndex < activeRecipes.length - 1) {
        currentIndex++;
        currentStep = 0;
      }
      _updateUI();
      _flashCard("blue");
      break;
    }
 
    case "PREV_STEP": {
      window.showGestureHint?.("prev");
      if (currentStep > 0) {
        currentStep--;
      } else if (currentIndex > 0) {
        currentIndex--;
        currentStep = activeRecipes[currentIndex].steps.length - 1;
      }
      _updateUI();
      _flashCard("blue");
      break;
    }
 
    case "STOP": {
      activeRecipes = [...RECIPES];
      currentIndex  = 0;
      currentStep   = 0;
      _updateUI();
      _hideFilterBadge();
      _flashCard("neutral");
      break;
    }
  }
 
  // Clear pending modalities after a successful intent
  pending.voice   = null;
  pending.gesture = null;
  _updateComboStatus();
});
 
// ─── 8. UI Controls ───────────────────────────────────────────────────────────
document.getElementById("btn-start")?.addEventListener("click", async () => {
  const btn = document.getElementById("btn-start");
  btn.disabled = true;
  _setStatus("Starting camera & speech…");
  await engine.startAll();
  webcamVideo.style.display = "block";
  btn.style.display  = "none";
  document.getElementById("btn-stop").style.display = "inline-block";
  _setStatus("Ready — use 2+ modalities together to trigger actions");
});
 
document.getElementById("btn-stop")?.addEventListener("click", () => {
  engine.stopAll();
  webcamVideo.style.display = "none";
  document.getElementById("btn-stop").style.display  = "none";
  document.getElementById("btn-start").style.display = "inline-block";
  document.getElementById("btn-start").disabled      = false;
  _setStatus("Stopped.");
});
 
// Manual fallback navigation buttons
document.getElementById("btn-prev")?.addEventListener("click", () => {
  if (currentStep > 0) { currentStep--; }
  else if (currentIndex > 0) { currentIndex--; currentStep = activeRecipes[currentIndex].steps.length - 1; }
  _updateUI();
});
 
document.getElementById("btn-next")?.addEventListener("click", () => {
  const r = activeRecipes[currentIndex];
  if (currentStep < r.steps.length - 1) { currentStep++; }
  else if (currentIndex < activeRecipes.length - 1) { currentIndex++; currentStep = 0; }
  _updateUI();
});
 
// Sidebar cuisine chip clicks (manual filter, no fusion required)
document.querySelectorAll("[data-cuisine]").forEach(btn => {
  btn.addEventListener("click", () => {
    const cuisine = btn.dataset.cuisine;
    document.querySelectorAll("[data-cuisine]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeRecipes = cuisine === "all" ? [...RECIPES] : RECIPES.filter(r => r.cuisine === cuisine);
    currentIndex  = 0;
    currentStep   = 0;
    _updateUI();
    cuisine === "all" ? _hideFilterBadge() : _showFilterBadge(cuisine, null);
  });
});
 
document.getElementById("btn-clear-filter")?.addEventListener("click", () => {
  activeRecipes = [...RECIPES];
  currentIndex  = 0;
  currentStep   = 0;
  _updateUI();
  _hideFilterBadge();
  document.querySelectorAll("[data-cuisine]").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-cuisine="all"]')?.classList.add("active");
});
 
// ─── 9. UI Helpers ────────────────────────────────────────────────────────────
function _updateUI() {
  const recipe = activeRecipes[currentIndex];
  recipeTitleEl.textContent   = recipe.title;
  recipeCuisineEl.textContent = `${recipe.emoji} ${recipe.cuisine}`;
  recipeStepEl.textContent    = recipe.steps[currentStep];
  stepCounterEl.textContent   =
    `Step ${currentStep + 1} of ${recipe.steps.length}  ·  Recipe ${currentIndex + 1} of ${activeRecipes.length}`;
 
  const badge = document.getElementById("step-badge");
  if (badge) badge.textContent = `Step ${String(currentStep + 1).padStart(2, "0")}`;
 
  // Trigger re-animation on step change
  recipeStepEl.classList.remove("step-animate");
  void recipeStepEl.offsetWidth;
  recipeStepEl.classList.add("step-animate");
 
  _renderStepDots(recipe.steps.length, currentStep);
  _syncCuisineChips(recipe.cuisine);
}
 
function _renderStepDots(total, active) {
  const container = document.getElementById("step-dots");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = "step-dot" + (i === active ? " active" : "");
    container.appendChild(dot);
  }
}
 
function _syncCuisineChips(activeCuisine) {
  document.querySelectorAll("[data-cuisine]").forEach(btn => {
    btn.classList.toggle("active",
      btn.dataset.cuisine === activeCuisine ||
      (activeRecipes.length === RECIPES.length && btn.dataset.cuisine === "all")
    );
  });
}
 
function _updateColorIndicator(payload) {
  if (colorDotEl && payload.rgb) {
    const { r, g, b } = payload.rgb;
    colorDotEl.style.background = `rgb(${r},${g},${b})`;
  }
  if (colorLabelEl) colorLabelEl.textContent = payload.name.toUpperCase();
}
 
// Shows which modalities are currently detected, toward completing a combo
function _updateComboStatus() {
  if (!comboStatusEl) return;
  const parts = [];
  if (pending.color)   parts.push(`🎨 ${pending.color.name}`);
  if (pending.voice)   parts.push(`🗣️ "${pending.voice}"`);
  if (pending.gesture) {
    const x = pending.gesture.x;
    parts.push(`👋 ${x > 0.78 ? "→" : x < 0.22 ? "←" : "·"}`);
  }
  comboStatusEl.textContent = parts.length
    ? `Detected: ${parts.join("  +  ")}`
    : "Waiting for input…";
}
 
function _setStatus(msg, color = "#8A8278") {
  if (statusBarEl) { statusBarEl.textContent = msg; statusBarEl.style.color = color; }
}
 
function _showFilterBadge(cuisine, colorPayload) {
  if (!filterBadgeEl) return;
  filterBadgeTextEl.textContent = cuisine;
  if (colorPayload?.rgb) {
    const { r, g, b } = colorPayload.rgb;
    filterBadgeEl.style.background = `rgb(${r},${g},${b})`;
    // Ensure readable text contrast over any background color
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    filterBadgeEl.style.color = brightness > 128 ? "#1A1612" : "#fff";
  } else {
    filterBadgeEl.style.background = "var(--accent)";
    filterBadgeEl.style.color      = "#fff";
  }
  filterBadgeEl.style.display = "flex";
}
 
function _hideFilterBadge() {
  if (filterBadgeEl) filterBadgeEl.style.display = "none";
}
 
// Flash the recipe card border to confirm a triggered intent
function _flashCard(type) {
  const card = document.getElementById("recipe-card");
  if (!card) return;
  const colors = { green: "#3B7A6B", blue: "#4A7FA5", neutral: "#C8A96E" };
  card.style.borderColor = colors[type] || colors.neutral;
  setTimeout(() => card.style.borderColor = "transparent", 500);
}
 
// ─── Init ─────────────────────────────────────────────────────────────────────
_updateUI();