/**
 * Service Worker for HTA Artifact Standard
 * Enables offline functionality and performance optimizations
 *
 * Features:
 * - Offline cache for core files
 * - Runtime caching for API calls
 * - Background sync for collaborative features
 * - Push notifications support
 * - Cache management strategies
 */

const CACHE_NAME = 'hta-pro-v1.0.0';
const RUNTIME_CACHE = 'hta-pro-runtime-v1.0.0';

// Core files to cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'
];

// ============================================================
// INSTALL EVENT
// ============================================================

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        // Force activation
        return self.skipWaiting();
      })
  );
});

// ============================================================
// ACTIVATE EVENT
// ============================================================

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control immediately
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH EVENT
// ============================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different request types
  if (url.origin === location.origin) {
    // Same-origin requests
    event.respondWith(handleSameOriginRequest(request));
  } else if (request.method === 'GET') {
    // Cross-origin GET requests (CDN, API, etc.)
    event.respondWith(handleCrossOriginRequest(request));
  } else {
    // Other requests
    event.respondWith(fetch(request));
  }
});

// ============================================================
// REQUEST HANDLERS
// ============================================================

/**
 * Handle same-origin requests
 */
async function handleSameOriginRequest(request) {
  const url = new URL(request.url);

  // For HTML pages, use network-first strategy
  if (request.headers.get('accept')?.includes('text/html')) {
    return networkFirst(request, CACHE_NAME);
  }

  // For JavaScript and CSS, use cache-first strategy
  if (request.url.match(/\.(js|css)$/)) {
    return cacheFirst(request, CACHE_NAME);
  }

  // For images, use cache-first with runtime cache
  if (request.url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
    return cacheFirst(request, RUNTIME_CACHE);
  }

  // For API calls, use network-first with runtime cache
  if (url.pathname.startsWith('/api/')) {
    return networkFirst(request, RUNTIME_CACHE);
  }

  // Default to network-first
  return networkFirst(request, CACHE_NAME);
}

/**
 * Handle cross-origin requests (CDN, external APIs)
 */
async function handleCrossOriginRequest(request) {
  const url = new URL(request.url);

  // CDN resources - cache-first
  if (url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'cdnjs.cloudflare.com' ||
      url.hostname === 'unpkg.com') {
    return cacheFirst(request, RUNTIME_CACHE);
  }

  // External data sources - network-first
  if (request.url.match(/\.(json|csv|txt)$/)) {
    return networkFirst(request, RUNTIME_CACHE);
  }

  // Default to network-only
  return fetch(request);
}

// ============================================================
// CACHING STRATEGIES
// ============================================================

/**
 * Cache First Strategy
 * Try cache first, fallback to network
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Update cache in background
    fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
    });

    return cached;
  }

  // Not in cache, fetch from network
  const networkResponse = await fetch(request);

  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

/**
 * Network First Strategy
 * Try network first, fallback to cache
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, falling back to cache:', request.url);

    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return new Response(
        '<html><body><h1>Offline</h1><p>The app is currently offline. Please check your connection.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    throw error;
  }
}

/**
 * Stale While Revalidate Strategy
 * Return cache immediately, update in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  // Return cached version if available, otherwise wait for network
  return cached || fetchPromise;
}

// ============================================================
// BACKGROUND SYNC
// ============================================================

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-session') {
    event.waitUntil(syncSessionData());
  }

  if (event.tag === 'sync-analysis') {
    event.waitUntil(syncAnalysisResults());
  }
});

/**
 * Sync session data to server
 */
async function syncSessionData() {
  try {
    const sessionData = await getSessionDataFromIndexedDB();

    for (const session of sessionData) {
      await fetch('/api/sessions/sync', {
        method: 'POST',
        body: JSON.stringify(session)
      });
    }

    console.log('[Service Worker] Session sync completed');
  } catch (error) {
    console.error('[Service Worker] Session sync failed:', error);
  }
}

/**
 * Sync analysis results to server
 */
async function syncAnalysisResults() {
  try {
    const results = await getAnalysisResultsFromIndexedDB();

    for (const result of results) {
      await fetch('/api/analyses/sync', {
        method: 'POST',
        body: JSON.stringify(result)
      });
    }

    console.log('[Service Worker] Analysis sync completed');
  } catch (error) {
    console.error('[Service Worker] Analysis sync failed:', error);
  }
}

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push message received');

  let data = {
    title: 'HTA Pro',
    body: 'New notification',
    icon: 'icons/icon-192x192.png'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (error) {
      console.error('[Service Worker] Failed to parse push data:', error);
    }
  }

  const options = {
    ...data,
    badge: 'icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || './'
    },
    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || './')
    );
  }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================

self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  switch (event.data.action) {
    case 'skipWaiting':
      self.skipWaiting();
      break;

    case 'cache-update':
      event.waitUntil(updateCache(event.data.url));
      break;

    case 'cache-clear':
      event.waitUntil(clearCache());
      break;

    default:
      console.log('[Service Worker] Unknown action:', event.data.action);
  }
});

/**
 * Update specific cache entry
 */
async function updateCache(url) {
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.add(url);
  console.log('[Service Worker] Cache updated:', url);
}

/**
 * Clear all caches
 */
async function clearCache() {
  const cacheNames = await caches.keys();

  for (const cacheName of cacheNames) {
    await caches.delete(cacheName);
  }

  console.log('[Service Worker] All caches cleared');
}

// ============================================================
// CACHE STATISTICS
// ============================================================

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const stats = {
    caches: {},
    totalSize: 0
  };

  const cacheNames = await caches.keys();

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    let size = 0;
    for (const request of keys) {
      const response = await cache.match(request);
      const blob = await response.blob();
      size += blob.size;
    }

    stats.caches[cacheName] = {
      entries: keys.length,
      size
    };
    stats.totalSize += size;
  }

  return stats;
}

// ============================================================
// INDEXEDDB HELPERS
// ============================================================

/**
 * Get session data from IndexedDB
 */
async function getSessionDataFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HTAPro', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const getAll = store.getAll();

      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get analysis results from IndexedDB
 */
async function getAnalysisResultsFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HTAPro', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['analyses'], 'readonly');
      const store = transaction.objectStore('analyses');
      const getAll = store.getAll();

      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    };

    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// PERIODIC SYNC
// ============================================================

self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync:', event.tag);

  if (event.tag === 'update-data') {
    event.waitUntil(updateExternalData());
  }
});

/**
 * Update external data sources
 */
async function updateExternalData() {
  try {
    // Update model library
    await fetch('/api/models/update', { method: 'POST' });

    // Update dataset catalog
    await fetch('/api/datasets/update', { method: 'POST' });

    console.log('[Service Worker] External data updated');
  } catch (error) {
    console.error('[Service Worker] Failed to update external data:', error);
  }
}

// ============================================================
// CONTAINER CLAIM
// ============================================================

self.addEventListener('controllerchange', () => {
  console.log('[Service Worker] Controller changed');
  // Notify all clients to reload
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ action: 'reload' });
    });
  });
});
