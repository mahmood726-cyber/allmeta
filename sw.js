// allmeta hub service worker. Cycle 6.1, updated Cycle 6.3.
// Cache-first for the self-hosted Shinylive / WebR runtime.
//
// Cycle 6.3 fix: webr-studio and webr-validator now also pull from the local
// r-shiny/shinylive/webr/ tree (via baseUrl), so the same SW now covers them.
//
// Versioned cache name: bump the version suffix when the shinylive bundle
// changes (e.g. alm-runtime-v3) to bust the old cache cleanly.

const CACHE = 'alm-runtime-v2';

// Paths we cache aggressively (cache-first). Everything under
// r-shiny/shinylive/ is stable per Shinylive's own bundling, so
// caching indefinitely between cache-name bumps is safe.
const RUNTIME_PREFIXES = [
  '/r-shiny/shinylive/',
];

// Also handle the case where the site is served from a sub-path
// (GitHub Pages: /allmeta/r-shiny/shinylive/...).
// We match by `pathname.includes` as a fallback to cover both root and
// sub-path deployments.
function isRuntime(url) {
  try {
    const p = new URL(url).pathname;
    return RUNTIME_PREFIXES.some(
      (prefix) => p.startsWith(prefix) || p.includes(prefix)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Install — activate immediately so the very first page load is intercepted
// on subsequent navigations without waiting for the old SW to be released.
// skipWaiting is safe here because our SW is purely additive (no breaking
// changes to in-flight requests; it only caches static assets).
// ---------------------------------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — prune stale alm-runtime-* caches so old bundles do not occupy
// disk quota after a version bump.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== CACHE && n.startsWith('alm-runtime-'))
          .map((n) => caches.delete(n))
      );
      // Claim existing clients so the SW activates without requiring a
      // full page reload on first install.
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for runtime paths; pass everything else through.
//
// Deliberately NOT intercepted:
//   - triage.json / runtime-health.json  (dynamic, network-first by design)
//   - app HTML files (should pick up updates normally)
//   - CDN assets (webr.r-wasm.org) — cross-origin, out of scope
//   - POST / non-GET requests
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET. POSTs and others pass through to browser default.
  if (req.method !== 'GET') return;

  // Non-runtime URLs: let the browser handle with its normal cache headers.
  if (!isRuntime(req.url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      // Cache miss: fetch from network, cache on success.
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          // clone() before put() — Response body can only be consumed once.
          cache.put(req, fresh.clone()).catch(() => {
            // Quota exceeded or other storage error — silently ignore.
            // The page still gets the response; caching is best-effort.
          });
        }
        return fresh;
      } catch (err) {
        // Network failure with no cached fallback — surface to the page.
        throw err;
      }
    })()
  );
});
