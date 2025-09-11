// Enhanced injection wrapper (Strategy D) ensuring the extension (MV2) loads
// before any original app ready handlers or app.whenReady().then(...) chains run.
// 1. Patch app.whenReady to insert extension load.
// 2. Wrap 'ready' listeners (on/once) so they execute only after extension loads.
// 3. Require original main so it registers its handlers against the patched API.
// 4. Support idempotent extension loading & safe fallback if loading fails.

const path = require('path');
const { app, session } = require('electron');
const electron = require('electron');

const ORIGINAL_MAIN = path.join(__dirname, 'main.original.js');
const EXTENSION_DIR = path.join(app.getAppPath(), 'extensions', 'ublock');

// DevTools & supplemental logging removed.

let extensionLoadPromise = null;
let extensionLoaded = false;

async function loadUblockInternal() {
  try {
    const ext = await session.defaultSession.loadExtension(EXTENSION_DIR, { allowFileAccess: true });
    console.log('[inject] uBlock Origin loaded:', ext?.id, ext?.name, 'version:', ext?.version);
  } catch (e) {
    console.warn('[inject] Failed to load uBlock Origin:', e?.message || e);
  } finally {
    extensionLoaded = true;
  }
}

function ensureExtension() {
  if (extensionLoaded) return Promise.resolve();
  if (!extensionLoadPromise) extensionLoadPromise = loadUblockInternal();
  return extensionLoadPromise;
}

// Patch app.whenReady so any original code using promises waits for extension.
const originalWhenReady = app.whenReady.bind(app);
app.whenReady = () => originalWhenReady().then(() => ensureExtension());

// Wrap ready listeners so extension loads first for event-based initialization.
const originalOn = app.on.bind(app);
const originalOnce = app.once.bind(app);

function wrapReadyListener(fn) {
  return async (...args) => {
    if (!extensionLoaded) await ensureExtension();
    try { fn(...args); } catch (err) { console.error('[inject] ready listener error:', err); }
  };
}

app.on = (event, listener) => {
  if (event === 'ready') {
    return originalOn('ready', wrapReadyListener(listener));
  }
  return originalOn(event, listener);
};

app.once = (event, listener) => {
  if (event === 'ready') {
    return originalOnce('ready', wrapReadyListener(listener));
  }
  return originalOnce(event, listener);
};

// Defensive: in case original code accesses app.isReady immediately and it's already ready
// we schedule immediate extension load to avoid race with synchronous window creation.
if (app.isReady()) {
  ensureExtension();
} else {
  // Also trigger ensureExtension as soon as native ready fires (before wrapped listeners execute).
  originalOnce('ready', () => ensureExtension());
}

// Require original bundled logic AFTER patching.

try {
  require(ORIGINAL_MAIN);
  console.log('[inject] Original main required successfully.');
} catch (e) {
  console.error('[inject] Failed to require original main:', e);
}

// Optional: expose a minimal API for diagnostics (can be removed if undesired).
module.exports = {
  ensureExtension,
  extensionLoaded: () => extensionLoaded,
  EXTENSION_DIR,
  ORIGINAL_MAIN
};