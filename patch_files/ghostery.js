// Injection wrapper: enable Ghostery's Electron ad blocker BEFORE Deezer's
// original main bootstrap so BrowserWindows created in 'ready' handlers are
// protected immediately.

const nodePath = require('path');
const { app, session } = require('electron');

// Ghostery Electron Adblocker (CommonJS requires)
let ElectronBlocker; // lazy require to allow app.getPath usage for cache path
let fetchFn; // cross-fetch

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

// --- Ghostery Electron Adblocker integration ---------------------------------

// Add timeout wrapper for async operations
function withTimeout(promise, timeoutMs, operation) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Manual ad blocking using webRequest API for older Electron versions
function setupManualAdBlocking(targetSession) {
  console.log('[adblock] Setting up manual ad blocking using webRequest API...');
  
  // Common ad/tracking domains and patterns
  const adBlockPatterns = [
    '*://*.doubleclick.net/*',
    '*://*.googleadservices.com/*',
    '*://*.googlesyndication.com/*',
    '*://*.google-analytics.com/*',
    '*://*.googletagmanager.com/*',
    '*://*.facebook.com/tr/*',
    '*://*.facebook.net/*',
    '*://connect.facebook.net/*',
    '*://*.amazon-adsystem.com/*',
    '*://*.adsystem.amazon.com/*',
    '*://*.outbrain.com/*',
    '*://*.taboola.com/*',
    '*://*.criteo.com/*',
    '*://*.adsystem.amazon.com/*',
    '*://*.ads.yahoo.com/*',
    '*://*.advertising.com/*',
    '*://*.adsystem.amazon.de/*',
    '*://*.adsystem.amazon.co.uk/*',
    '*://pagead2.googlesyndication.com/*',
    '*://tpc.googlesyndication.com/*',
    '*://googleads.g.doubleclick.net/*',
    '*://stats.g.doubleclick.net/*',
    '*://cm.g.doubleclick.net/*',
    '*://ad.doubleclick.net/*',
    '*://static.doubleclick.net/*',
    '*://m.doubleclick.net/*',
    '*://mediavisor.doubleclick.net/*'
  ];

  const filter = {
    urls: adBlockPatterns
  };

  // Block requests to ad domains
  targetSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    console.log(`[adblock] Blocked: ${details.url}`);
    callback({ cancel: true });
  });

  // Also block based on resource type
  targetSession.webRequest.onBeforeRequest({
    urls: ['*://*/*']
  }, (details, callback) => {
    const url = details.url.toLowerCase();
    
    // Block common ad-related paths and parameters
    if (url.includes('/ads/') || 
        url.includes('/advertisement') ||
        url.includes('googleads') ||
        url.includes('doubleclick') ||
        url.includes('adsystem') ||
        url.includes('googlesyndication') ||
        url.includes('googleadservices') ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.com/tr') ||
        url.includes('connect.facebook.net') ||
        url.includes('outbrain') ||
        url.includes('taboola') ||
        url.includes('criteo')) {
      console.log(`[adblock] Blocked by pattern: ${details.url}`);
      callback({ cancel: true });
      return;
    }
    
    callback({});
  });

  console.log('[adblock] Manual ad blocking rules applied');
}

async function initAdblocker() {
  console.log('[adblock] Starting initialization...');
  
  try {
    // Check if dependencies are available
    if (!ElectronBlocker) {
      console.log('[adblock] Loading Ghostery adblocker module...');
      try {
        ({ ElectronBlocker } = require('@ghostery/adblocker-electron'));
        fetchFn = require('cross-fetch');
        console.log('[adblock] Dependencies loaded successfully');
      } catch (depError) {
        console.error('[adblock] Failed to load dependencies:', depError);
        throw new Error(`Dependency loading failed: ${depError.message}`);
      }
    }

    const cacheFile = nodePath.join(app.getPath('userData'), 'adblocker-engine.bin');
    console.log('[adblock] Cache file path:', cacheFile);
    
    const { promises: fsp } = fs;

    let blocker;
    
    // First attempt: try with cache (with timeout)
    try {
      console.log('[adblock] Attempting to load with cache (30s timeout)...');
      const cachePromise = ElectronBlocker.fromPrebuiltAdsAndTracking(fetchFn, {
        path: cacheFile,
        read: fsp.readFile,
        write: fsp.writeFile,
      });
      
      blocker = await withTimeout(cachePromise, 30000, 'Cache loading');
      console.log('[adblock] Successfully loaded prebuilt engine with cache');
    } catch (cacheError) {
      console.warn('[adblock] Cache loading failed, trying without cache:', cacheError.message);
      
      // Second attempt: without cache (with timeout)
      try {
        console.log('[adblock] Loading without cache (30s timeout)...');
        const noCachePromise = ElectronBlocker.fromPrebuiltAdsAndTracking(fetchFn);
        blocker = await withTimeout(noCachePromise, 30000, 'No-cache loading');
        console.log('[adblock] Successfully loaded prebuilt engine without cache');
      } catch (noCacheError) {
        console.error('[adblock] Failed to load without cache:', noCacheError.message);
        throw new Error(`Both cache and no-cache loading failed: ${noCacheError.message}`);
      }
    }

    if (!blocker) {
      throw new Error('Blocker instance is null or undefined');
    }

    // Try to enable blocking in the default session with Ghostery
    console.log('[adblock] Enabling blocking in default session...');
    try {
      // Use the lower-level API that's compatible with older Electron versions
      const { webRequest } = session.defaultSession;
      
      // Set up request blocking using Ghostery's engine but with webRequest API
      webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
        try {
          const { url, resourceType } = details;
          
          // Use Ghostery's match method directly on the blocker instance
          const request = {
            url,
            type: resourceType || 'other',
            sourceUrl: details.referrer || '',
          };
          
          // Check if blocker has the match method
          if (blocker && typeof blocker.match === 'function') {
            const result = blocker.match(request);
            
            if (result && result.match === true) {
              console.log(`[adblock] Ghostery blocked: ${url}`);
              callback({ cancel: true });
              return;
            } else if (result && result.redirect) {
              console.log(`[adblock] Ghostery redirected: ${url} -> ${result.redirect}`);
              callback({ redirectURL: result.redirect });
              return;
            }
          }
          
          callback({});
        } catch (err) {
          // If there's any error in blocking logic, allow the request
          console.warn(`[adblock] Error in Ghostery blocking: ${err.message}`);
          callback({});
        }
      });
      
      console.log('[adblock] ✓ Ghostery ad blocking successfully enabled using webRequest API!');
    } catch (ghosteryError) {
      console.warn('[adblock] Ghostery blocking failed (likely Electron compatibility issue):', ghosteryError.message);
      console.log('[adblock] Falling back to manual ad blocking...');
      
      // Fallback to manual blocking
      setupManualAdBlocking(session.defaultSession);
      
      // Set up manual blocking for new sessions
      app.on('session-created', (newSession) => {
        console.log('[adblock] New session created, applying manual blocking...');
        setupManualAdBlocking(newSession);
      });

      // Set up manual blocking for webContents as they're created
      app.on('web-contents-created', (event, webContents) => {
        console.log('[adblock] New webContents created, applying manual blocking...');
        if (webContents.session) {
          setupManualAdBlocking(webContents.session);
        }
      });
      
      console.log('[adblock] ✓ Manual ad blocking successfully enabled!');
      return { manual: true }; // Return indicator that manual blocking is used
    }
    
    // If Ghostery worked, also set up for new sessions
    app.on('session-created', (newSession) => {
      console.log('[adblock] New session created, enabling Ghostery blocking...');
      try {
        const { webRequest } = newSession;
        webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
          try {
            const { url, resourceType } = details;
            const request = {
              url,
              type: resourceType || 'other',
              sourceUrl: details.referrer || '',
            };
            
            if (blocker && typeof blocker.match === 'function') {
              const result = blocker.match(request);
              if (result && result.match === true) {
                console.log(`[adblock] Ghostery blocked (new session): ${url}`);
                callback({ cancel: true });
                return;
              } else if (result && result.redirect) {
                callback({ redirectURL: result.redirect });
                return;
              }
            }
            
            callback({});
          } catch (err) {
            console.warn(`[adblock] Error in Ghostery blocking (new session): ${err.message}`);
            callback({});
          }
        });
        console.log('[adblock] Ghostery blocking enabled for new session');
      } catch (err) {
        console.warn('[adblock] Ghostery failed for new session, using manual blocking:', err.message);
        setupManualAdBlocking(newSession);
      }
    });

    // Set up blocking for webContents as they're created
    app.on('web-contents-created', (event, webContents) => {
      console.log('[adblock] New webContents created, applying Ghostery blocking...');
      try {
        if (webContents.session && webContents.session.webRequest) {
          const { webRequest } = webContents.session;
          webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
            try {
              const { url, resourceType } = details;
              const request = {
                url,
                type: resourceType || 'other',
                sourceUrl: details.referrer || '',
              };
              
              if (blocker && typeof blocker.match === 'function') {
                const result = blocker.match(request);
                if (result && result.match === true) {
                  console.log(`[adblock] Ghostery blocked (webContents): ${url}`);
                  callback({ cancel: true });
                  return;
                } else if (result && result.redirect) {
                  callback({ redirectURL: result.redirect });
                  return;
                }
              }
              
              callback({});
            } catch (err) {
              console.warn(`[adblock] Error in Ghostery blocking (webContents): ${err.message}`);
              callback({});
            }
          });
          console.log('[adblock] Ghostery blocking applied to webContents session');
        }
      } catch (err) {
        console.warn('[adblock] Ghostery failed for webContents, using manual blocking:', err.message);
        if (webContents.session) {
          setupManualAdBlocking(webContents.session);
        }
      }
    });

    // Log some stats if available
    if (blocker.engine && blocker.engine.size) {
      console.log(`[adblock] Loaded ${blocker.engine.size} blocking rules`);
    }

    return blocker;
  } catch (err) {
    console.error('[adblock] ✗ Ghostery initialization failed:', err.message);
    console.log('[adblock] Falling back to manual ad blocking...');
    
    // Complete fallback to manual blocking
    try {
      setupManualAdBlocking(session.defaultSession);
      
      app.on('session-created', (newSession) => {
        console.log('[adblock] New session created, applying manual blocking...');
        setupManualAdBlocking(newSession);
      });

      app.on('web-contents-created', (event, webContents) => {
        console.log('[adblock] New webContents created, applying manual blocking...');
        if (webContents.session) {
          setupManualAdBlocking(webContents.session);
        }
      });
      
      console.log('[adblock] ✓ Manual ad blocking successfully enabled as fallback!');
      return { manual: true };
    } catch (manualError) {
      console.error('[adblock] ✗ Even manual ad blocking failed:', manualError.message);
      console.error('[adblock] ========================================');
      console.error('[adblock] AD BLOCKER FAILED TO INITIALIZE!');
      console.error('[adblock] The app will continue without ad blocking.');
      console.error('[adblock] ========================================');
      return null;
    }
  }
}

async function bootstrap() {
  console.log('[inject] Starting bootstrap process...');
  
  await app.whenReady();
  console.log('[inject] App is ready, initializing ad blocker...');
  
  // Initialize adblocker BEFORE running original 'ready' handlers so new
  // BrowserWindows get filtering applied immediately.
  const blocker = await initAdblocker();
  
  if (blocker) {
    console.log('[inject] Ad blocker initialized successfully');
  } else {
    console.warn('[inject] Continuing without ad blocker');
  }

  console.log('[inject] Executing deferred ready listeners...');
  // Replay captured ready listeners in registration order.
  for (let i = 0; i < readyListeners.length; i++) {
    try {
      console.log(`[inject] Executing ready listener ${i + 1}/${readyListeners.length}`);
      readyListeners[i]();
    } catch (e) {
      console.error(`[inject] Error executing deferred ready listener ${i + 1}:`, e);
    }
  }

  // Restore original app.on to avoid surprising later code.
  app.on = originalAppOn;
  console.log('[inject] Bootstrap completed');
}

bootstrap().catch(err => {
  console.error('[inject] Bootstrap failed:', err);
  // Continue anyway to ensure the app starts
});

module.exports = originalExports;