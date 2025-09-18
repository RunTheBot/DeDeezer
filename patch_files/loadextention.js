// Enhanced injection wrapper for loading an unpacked extension (uBlock Origin)
// before Deezer's original Electron main process bootstrap runs.

const nodePath = require('path');
const { app, session } = require('electron');

// Set ENV

// Ensure Deezer desktop's internal hasDevTools() gate passes.
// Original code: hasDevTools(){return "yes"===process.env.DZ_DEVTOOLS}
// Set it early so all subsequent requires and menu construction see it.
if (process.env.DZ_DEVTOOLS !== 'yes') {
  process.env.DZ_DEVTOOLS = 'yes';
  console.log('[inject] DZ_DEVTOOLS set to "yes"');
}

if (process.env.DZ_DISABLE_UPDATE !== 'yes') {
  process.env.DZ_DISABLE_UPDATE = 'yes';
  console.log('[inject] DZ_DISABLE_UPDATE set to "yes"');
}

// Original bundled entry (renamed to avoid overwrite)
const ORIGINAL_MAIN = nodePath.join(__dirname, 'main.original.js');
// Source (possibly inside asar) and extracted target directory
const EXTENSION_SRC_DIR = nodePath.join(app.getAppPath(), 'extensions', 'ublock');
const EXTENSION_EXTRACT_BASE = nodePath.join(app.getPath('userData'), 'injected-extensions');
const EXTENSION_DIR = nodePath.join(EXTENSION_EXTRACT_BASE, 'ublock');

// Collect any app.on('ready') listeners the original code registers so we can
// delay firing them until after the extension is loaded.
const originalAppOn = app.on.bind(app);
const readyListeners = [];

app.on = (event, listener) => {
  if (event === 'ready') {
    readyListeners.push(listener);
    return app; // chainable
  }
  return originalAppOn(event, listener);
};

let originalExports;
try {
  originalExports = require(ORIGINAL_MAIN); // This will register its 'ready' handlers.
  console.log('[inject] Loaded original main module');
} catch (e) {
  console.error('[inject] Failed to load original main module:', e);
}

const fs = require('fs');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = nodePath.join(src, entry);
    const d = nodePath.join(dest, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (stat.isFile()) {
      if (!fs.existsSync(d)) {
        fs.copyFileSync(s, d);
      }
    }
  }
}

function ensureExtensionExtracted() {
  try {
    if (!fs.existsSync(EXTENSION_SRC_DIR)) {
      console.warn('[inject] Extension source not found (expected path inside asar):', EXTENSION_SRC_DIR);
      return false;
    }
    const manifestSrc = nodePath.join(EXTENSION_SRC_DIR, 'manifest.json');
    if (!fs.existsSync(manifestSrc)) {
      console.warn('[inject] manifest.json missing in source:', EXTENSION_SRC_DIR);
      return false;
    }
    // If target missing or manifest version changed, (re)copy.
    let needCopy = !fs.existsSync(EXTENSION_DIR);
    if (!needCopy) {
      try {
        const srcManifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'));
        const destManifestPath = nodePath.join(EXTENSION_DIR, 'manifest.json');
        if (!fs.existsSync(destManifestPath)) needCopy = true; else {
          const destManifest = JSON.parse(fs.readFileSync(destManifestPath, 'utf8'));
            if (destManifest.version !== srcManifest.version) needCopy = true;
        }
      } catch (e) {
        needCopy = true;
      }
    }
    if (needCopy) {
      console.log('[inject] Extracting extension to writable path:', EXTENSION_DIR);
      copyDirRecursive(EXTENSION_SRC_DIR, EXTENSION_DIR);
    }
    return true;
  } catch (e) {
    console.warn('[inject] Failed ensuring extension extraction:', e);
    return false;
  }
}

async function loadExtensionSafe() {
  try {
    if (!ensureExtensionExtracted()) return;
    // Use new API if available (Electron >= 28) else fallback.
    const loader = session.extensions?.loadExtension?.bind(session.extensions) || session.defaultSession.loadExtension.bind(session.defaultSession);
    const ext = await loader(EXTENSION_DIR, { allowFileAccess: true });
    console.log('[inject] Extension loaded:', ext.id, ext.name, '(version:', ext.version + ')');
  } catch (e) {
    console.warn('[inject] Failed to load extension from', EXTENSION_DIR, e);
  }
}

async function bootstrap() {
  await app.whenReady();
  await loadExtensionSafe();

  // Replay captured ready listeners in registration order.
  for (const fn of readyListeners) {
    try {
      fn();
    } catch (e) {
      console.error('[inject] Error executing deferred ready listener:', e);
    }
  }

  // Restore original app.on to avoid surprising later code.
  app.on = originalAppOn;
}



bootstrap();

module.exports = originalExports;