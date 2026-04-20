/**
 * HTA Artifact Standard - Advanced Performance Module
 * Version: 0.6.0
 *
 * High-performance computing optimizations:
 * - SharedArrayBuffer for parallel computation
 * - IndexedDB for persistent caching
 * - Lazy loading and code splitting
 * - Service Worker for offline support
 * - Memory pool management
 * - SIMD-style batch operations
 */

'use strict';

// =============================================================================
// SHARED MEMORY MANAGER
// =============================================================================

class SharedMemoryManager {
    constructor(options = {}) {
        this.options = {
            defaultBufferSize: 1024 * 1024, // 1MB
            maxBuffers: 10,
            ...options
        };

        this.buffers = new Map();
        this.workers = [];
        this.crossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    }

    /**
     * Check if SharedArrayBuffer is available
     */
    isAvailable() {
        return this.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
    }

    /**
     * Allocate shared buffer
     */
    allocate(name, size) {
        if (!this.isAvailable()) {
            // Fallback to regular ArrayBuffer
            const buffer = new ArrayBuffer(size);
            this.buffers.set(name, { buffer, shared: false });
            return new Float64Array(buffer);
        }

        const sab = new SharedArrayBuffer(size);
        this.buffers.set(name, { buffer: sab, shared: true });
        return new Float64Array(sab);
    }

    /**
     * Get shared view of buffer
     */
    getView(name, TypedArrayConstructor = Float64Array) {
        const entry = this.buffers.get(name);
        if (!entry) return null;
        return new TypedArrayConstructor(entry.buffer);
    }

    /**
     * Create worker with shared memory access
     */
    createWorker(workerScript) {
        if (!this.isAvailable()) {
            // SharedArrayBuffer not available, using message-based transfer
        }

        const worker = new Worker(workerScript);
        this.workers.push(worker);
        return worker;
    }

    /**
     * Parallel map operation using shared memory
     */
    async parallelMap(data, fn, numWorkers = navigator.hardwareConcurrency || 4) {
        const n = data.length;
        const chunkSize = Math.ceil(n / numWorkers);

        if (!this.isAvailable()) {
            // Fallback: single-threaded
            return data.map(fn);
        }

        // Allocate shared buffers
        const inputBuffer = this.allocate('parallelInput', n * 8);
        const outputBuffer = this.allocate('parallelOutput', n * 8);

        // Copy input data
        inputBuffer.set(data);

        // Create inline worker
        const workerCode = `
            self.onmessage = function(e) {
                const { input, output, start, end, fnStr } = e.data;
                const fn = new Function('x', 'return ' + fnStr);
                const inputView = new Float64Array(input);
                const outputView = new Float64Array(output);

                for (let i = start; i < end; i++) {
                    outputView[i] = fn(inputView[i]);
                }

                self.postMessage({ done: true, start, end });
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        const promises = [];
        for (let i = 0; i < numWorkers; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, n);

            if (start >= n) break;

            const worker = new Worker(workerUrl);
            const promise = new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    worker.terminate();
                    resolve(e.data);
                };
                worker.onerror = reject;
            });

            worker.postMessage({
                input: this.buffers.get('parallelInput').buffer,
                output: this.buffers.get('parallelOutput').buffer,
                start,
                end,
                fnStr: fn.toString()
            });

            promises.push(promise);
        }

        await Promise.all(promises);
        URL.revokeObjectURL(workerUrl);

        return Array.from(outputBuffer.slice(0, n));
    }

    /**
     * Atomic operations for thread-safe updates
     */
    atomicAdd(name, index, value) {
        const entry = this.buffers.get(name);
        if (!entry || !entry.shared) {
            const view = this.getView(name);
            if (view) view[index] += value;
            return;
        }

        const view = new Int32Array(entry.buffer);
        Atomics.add(view, index, value);
    }

    /**
     * Barrier synchronization
     */
    async barrier(name, index, expectedValue, timeout = 5000) {
        const entry = this.buffers.get(name);
        if (!entry || !entry.shared) return;

        const view = new Int32Array(entry.buffer);
        const result = Atomics.wait(view, index, expectedValue, timeout);
        return result !== 'timed-out';
    }

    /**
     * Release all buffers
     */
    dispose() {
        this.buffers.clear();
        this.workers.forEach(w => w.terminate());
        this.workers = [];
    }
}


// =============================================================================
// INDEXEDDB CACHE
// =============================================================================

class IndexedDBCache {
    constructor(dbName = 'hta-cache', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.stores = {
            models: 'models',
            results: 'results',
            parameters: 'parameters',
            assets: 'assets'
        };
    }

    /**
     * Initialize database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains(this.stores.models)) {
                    const modelStore = db.createObjectStore(this.stores.models, { keyPath: 'id' });
                    modelStore.createIndex('name', 'name', { unique: false });
                    modelStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.results)) {
                    const resultsStore = db.createObjectStore(this.stores.results, { keyPath: 'id' });
                    resultsStore.createIndex('modelId', 'modelId', { unique: false });
                    resultsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.parameters)) {
                    const paramsStore = db.createObjectStore(this.stores.parameters, { keyPath: 'id' });
                    paramsStore.createIndex('category', 'category', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.assets)) {
                    const assetsStore = db.createObjectStore(this.stores.assets, { keyPath: 'url' });
                    assetsStore.createIndex('type', 'type', { unique: false });
                }
            };
        });
    }

    /**
     * Store item
     */
    async set(storeName, item) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            item.timestamp = Date.now();
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get item by key
     */
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all items from store
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete item
     */
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear entire store
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Query by index
     */
    async queryByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Cache simulation results with expiry
     */
    async cacheResult(modelId, params, result, ttlMs = 3600000) {
        const cacheKey = this.generateCacheKey(modelId, params);

        await this.set(this.stores.results, {
            id: cacheKey,
            modelId: modelId,
            params: params,
            result: result,
            expires: Date.now() + ttlMs
        });

        return cacheKey;
    }

    /**
     * Get cached result if valid
     */
    async getCachedResult(modelId, params) {
        const cacheKey = this.generateCacheKey(modelId, params);
        const cached = await this.get(this.stores.results, cacheKey);

        if (!cached) return null;
        if (cached.expires && cached.expires < Date.now()) {
            await this.delete(this.stores.results, cacheKey);
            return null;
        }

        return cached.result;
    }

    /**
     * Generate deterministic cache key from params
     */
    generateCacheKey(modelId, params) {
        const paramsStr = JSON.stringify(params, Object.keys(params).sort());
        let hash = 0;
        for (let i = 0; i < paramsStr.length; i++) {
            const chr = paramsStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return `${modelId}_${hash}`;
    }

    /**
     * Clean expired entries
     */
    async cleanExpired() {
        const results = await this.getAll(this.stores.results);
        const now = Date.now();
        let cleaned = 0;

        for (const result of results) {
            if (result.expires && result.expires < now) {
                await this.delete(this.stores.results, result.id);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        const stats = {};

        for (const [name, store] of Object.entries(this.stores)) {
            const items = await this.getAll(store);
            stats[name] = {
                count: items.length,
                totalSize: JSON.stringify(items).length
            };
        }

        return stats;
    }
}


// =============================================================================
// LAZY LOADER
// =============================================================================

class LazyLoader {
    constructor() {
        this.loaded = new Set();
        this.loading = new Map();
        this.modules = new Map();
    }

    /**
     * Register module for lazy loading
     */
    register(name, loader) {
        this.modules.set(name, { loader, instance: null });
    }

    /**
     * Load module on demand
     */
    async load(name) {
        // Already loaded
        if (this.loaded.has(name)) {
            return this.modules.get(name).instance;
        }

        // Currently loading
        if (this.loading.has(name)) {
            return this.loading.get(name);
        }

        const module = this.modules.get(name);
        if (!module) {
            throw new Error(`Module '${name}' not registered`);
        }

        // Start loading
        const loadPromise = (async () => {
            try {
                const instance = await module.loader();
                module.instance = instance;
                this.loaded.add(name);
                this.loading.delete(name);
                return instance;
            } catch (error) {
                this.loading.delete(name);
                throw error;
            }
        })();

        this.loading.set(name, loadPromise);
        return loadPromise;
    }

    /**
     * Preload modules in background
     */
    preload(names) {
        const promises = names.map(name => this.load(name).catch(() => null));
        return Promise.all(promises);
    }

    /**
     * Unload module to free memory
     */
    unload(name) {
        const module = this.modules.get(name);
        if (module) {
            module.instance = null;
            this.loaded.delete(name);
        }
    }

    /**
     * Get loaded modules list
     */
    getLoaded() {
        return Array.from(this.loaded);
    }
}


// =============================================================================
// SERVICE WORKER MANAGER
// =============================================================================

class ServiceWorkerManager {
    constructor(swPath = '/sw.js') {
        this.swPath = swPath;
        this.registration = null;
    }

    /**
     * Register service worker
     */
    async register() {
        if (!('serviceWorker' in navigator)) {
            return null;
        }

        try {
            this.registration = await navigator.serviceWorker.register(this.swPath, {
                scope: '/'
            });

            this.registration.addEventListener('updatefound', () => {
                const newWorker = this.registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        this.onUpdateAvailable();
                    }
                });
            });

            return this.registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            return null;
        }
    }

    /**
     * Generate service worker script
     */
    generateSWScript() {
        return `
const CACHE_NAME = 'hta-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/engine/markov.js',
    '/js/engine/psa.js'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone response for caching
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// Background sync for offline operations
self.addEventListener('sync', event => {
    if (event.tag === 'sync-models') {
        event.waitUntil(syncModels());
    }
});

async function syncModels() {
    const pending = await getPendingSync();
    for (const item of pending) {
        try {
            await fetch('/api/sync', {
                method: 'POST',
                body: JSON.stringify(item),
                headers: { 'Content-Type': 'application/json' }
            });
            await removePendingSync(item.id);
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
}
`;
    }

    /**
     * Update available callback (override in subclass)
     */
    onUpdateAvailable() {
        // Override in subclass to handle update notification
    }

    /**
     * Skip waiting and reload
     */
    async update() {
        if (this.registration && this.registration.waiting) {
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
        }
    }

    /**
     * Unregister service worker
     */
    async unregister() {
        if (this.registration) {
            await this.registration.unregister();
            this.registration = null;
        }
    }
}


// =============================================================================
// MEMORY POOL
// =============================================================================

class MemoryPool {
    constructor(options = {}) {
        this.options = {
            initialSize: 1000,
            growFactor: 2,
            maxSize: 100000,
            ...options
        };

        this.pools = new Map();
    }

    /**
     * Create typed array pool
     */
    createPool(name, TypedArrayConstructor, elementCount) {
        const buffer = new ArrayBuffer(elementCount * TypedArrayConstructor.BYTES_PER_ELEMENT);
        const array = new TypedArrayConstructor(buffer);

        this.pools.set(name, {
            buffer: buffer,
            array: array,
            type: TypedArrayConstructor,
            size: elementCount,
            inUse: 0,
            freeList: []
        });

        return array;
    }

    /**
     * Acquire chunk from pool
     */
    acquire(name, size) {
        const pool = this.pools.get(name);
        if (!pool) return null;

        // Check free list first
        for (let i = 0; i < pool.freeList.length; i++) {
            const chunk = pool.freeList[i];
            if (chunk.size >= size) {
                pool.freeList.splice(i, 1);
                pool.inUse += chunk.size;
                return {
                    view: new pool.type(pool.buffer, chunk.offset, size),
                    offset: chunk.offset,
                    size: size,
                    pool: name
                };
            }
        }

        // Allocate new chunk
        if (pool.inUse + size > pool.size) {
            // Need to grow pool
            this.growPool(name);
        }

        const offset = pool.inUse * pool.type.BYTES_PER_ELEMENT;
        pool.inUse += size;

        return {
            view: new pool.type(pool.buffer, offset, size),
            offset: offset,
            size: size,
            pool: name
        };
    }

    /**
     * Release chunk back to pool
     */
    release(chunk) {
        const pool = this.pools.get(chunk.pool);
        if (!pool) return;

        // Clear data
        chunk.view.fill(0);

        // Add to free list
        pool.freeList.push({
            offset: chunk.offset,
            size: chunk.size
        });

        // Merge adjacent free chunks
        this.mergeFreeChunks(pool);
    }

    /**
     * Grow pool size
     */
    growPool(name) {
        const pool = this.pools.get(name);
        if (!pool) return;

        const newSize = Math.min(pool.size * this.options.growFactor, this.options.maxSize);
        if (newSize === pool.size) return;

        const newBuffer = new ArrayBuffer(newSize * pool.type.BYTES_PER_ELEMENT);
        const newArray = new pool.type(newBuffer);

        // Copy existing data
        newArray.set(pool.array);

        pool.buffer = newBuffer;
        pool.array = newArray;
        pool.size = newSize;
    }

    /**
     * Merge adjacent free chunks
     */
    mergeFreeChunks(pool) {
        pool.freeList.sort((a, b) => a.offset - b.offset);

        for (let i = 0; i < pool.freeList.length - 1; i++) {
            const current = pool.freeList[i];
            const next = pool.freeList[i + 1];

            if (current.offset + current.size * pool.type.BYTES_PER_ELEMENT === next.offset) {
                current.size += next.size;
                pool.freeList.splice(i + 1, 1);
                i--;
            }
        }
    }

    /**
     * Get pool statistics
     */
    getStats(name) {
        const pool = this.pools.get(name);
        if (!pool) return null;

        return {
            totalSize: pool.size,
            inUse: pool.inUse,
            available: pool.size - pool.inUse,
            utilization: pool.inUse / pool.size,
            freeChunks: pool.freeList.length
        };
    }

    /**
     * Reset all pools
     */
    reset() {
        for (const pool of this.pools.values()) {
            pool.array.fill(0);
            pool.inUse = 0;
            pool.freeList = [];
        }
    }
}


// =============================================================================
// BATCH OPERATIONS (SIMD-STYLE)
// =============================================================================

class BatchOperations {
    /**
     * Vectorized addition
     */
    static add(a, b, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        for (let i = 0; i < n; i++) {
            out[i] = a[i] + b[i];
        }

        return out;
    }

    /**
     * Vectorized multiplication
     */
    static multiply(a, b, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        for (let i = 0; i < n; i++) {
            out[i] = a[i] * b[i];
        }

        return out;
    }

    /**
     * Scalar multiplication
     */
    static scale(a, scalar, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        for (let i = 0; i < n; i++) {
            out[i] = a[i] * scalar;
        }

        return out;
    }

    /**
     * Dot product
     */
    static dot(a, b) {
        const n = a.length;
        let sum = 0;
        let c = 0; // Kahan summation

        for (let i = 0; i < n; i++) {
            const y = a[i] * b[i] - c;
            const t = sum + y;
            c = (t - sum) - y;
            sum = t;
        }

        return sum;
    }

    /**
     * Element-wise exponential
     */
    static exp(a, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        for (let i = 0; i < n; i++) {
            out[i] = Math.exp(a[i]);
        }

        return out;
    }

    /**
     * Element-wise logarithm
     */
    static log(a, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        for (let i = 0; i < n; i++) {
            out[i] = a[i] > 0 ? Math.log(a[i]) : -Infinity;
        }

        return out;
    }

    /**
     * Cumulative sum
     */
    static cumsum(a, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        out[0] = a[0];
        for (let i = 1; i < n; i++) {
            out[i] = out[i - 1] + a[i];
        }

        return out;
    }

    /**
     * Moving average
     */
    static movingAverage(a, window, out = null) {
        const n = a.length;
        out = out || new Float64Array(n);

        let sum = 0;
        for (let i = 0; i < Math.min(window, n); i++) {
            sum += a[i];
            out[i] = sum / (i + 1);
        }

        for (let i = window; i < n; i++) {
            sum = sum - a[i - window] + a[i];
            out[i] = sum / window;
        }

        return out;
    }

    /**
     * Matrix-vector multiplication
     */
    static matVec(mat, vec, out = null) {
        const m = mat.length;
        const n = vec.length;
        out = out || new Float64Array(m);

        for (let i = 0; i < m; i++) {
            let sum = 0;
            for (let j = 0; j < n; j++) {
                sum += mat[i][j] * vec[j];
            }
            out[i] = sum;
        }

        return out;
    }

    /**
     * Batch discount calculation
     */
    static batchDiscount(values, rate, out = null) {
        const n = values.length;
        out = out || new Float64Array(n);

        const factor = 1 / (1 + rate);
        let discount = 1;

        for (let i = 0; i < n; i++) {
            out[i] = values[i] * discount;
            discount *= factor;
        }

        return out;
    }

    /**
     * Weighted sum
     */
    static weightedSum(values, weights) {
        return this.dot(values, weights);
    }

    /**
     * Normalize to sum to 1
     */
    static normalize(a, out = null) {
        const sum = a.reduce((s, v) => s + v, 0);
        if (Math.abs(sum) < 1e-15) return a;

        out = out || new Float64Array(a.length);
        for (let i = 0; i < a.length; i++) {
            out[i] = a[i] / sum;
        }
        return out;
    }
}


// =============================================================================
// COMPUTATION SCHEDULER
// =============================================================================

class ComputationScheduler {
    constructor(options = {}) {
        this.options = {
            maxConcurrent: navigator.hardwareConcurrency || 4,
            taskTimeout: 30000,
            priorityLevels: 3,
            ...options
        };

        this.queues = Array.from({ length: this.options.priorityLevels }, () => []);
        this.running = new Map();
        this.completed = new Map();
        this.idCounter = 0;
    }

    /**
     * Schedule task
     */
    schedule(fn, priority = 1, options = {}) {
        const id = ++this.idCounter;
        const task = {
            id,
            fn,
            priority,
            options,
            status: 'pending',
            createdAt: Date.now()
        };

        this.queues[Math.min(priority, this.options.priorityLevels - 1)].push(task);
        this.process();

        return new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;
        });
    }

    /**
     * Process queued tasks
     */
    async process() {
        while (this.running.size < this.options.maxConcurrent) {
            const task = this.getNextTask();
            if (!task) break;

            this.running.set(task.id, task);
            task.status = 'running';
            task.startedAt = Date.now();

            // Execute with timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Task timeout')), this.options.taskTimeout);
            });

            try {
                const result = await Promise.race([task.fn(), timeoutPromise]);
                task.status = 'completed';
                task.result = result;
                task.resolve(result);
            } catch (error) {
                task.status = 'failed';
                task.error = error;
                task.reject(error);
            } finally {
                task.completedAt = Date.now();
                this.running.delete(task.id);
                this.completed.set(task.id, task);
                this.process(); // Continue processing
            }
        }
    }

    /**
     * Get next task (highest priority first)
     */
    getNextTask() {
        for (const queue of this.queues) {
            if (queue.length > 0) {
                return queue.shift();
            }
        }
        return null;
    }

    /**
     * Cancel task
     */
    cancel(id) {
        for (const queue of this.queues) {
            const idx = queue.findIndex(t => t.id === id);
            if (idx !== -1) {
                const task = queue.splice(idx, 1)[0];
                task.status = 'cancelled';
                task.reject(new Error('Task cancelled'));
                return true;
            }
        }
        return false;
    }

    /**
     * Get task status
     */
    getStatus(id) {
        for (const queue of this.queues) {
            const task = queue.find(t => t.id === id);
            if (task) return task.status;
        }

        if (this.running.has(id)) return 'running';
        if (this.completed.has(id)) return this.completed.get(id).status;

        return 'unknown';
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            pending: this.queues.reduce((sum, q) => sum + q.length, 0),
            running: this.running.size,
            completed: this.completed.size,
            maxConcurrent: this.options.maxConcurrent
        };
    }

    /**
     * Clear completed tasks
     */
    clearCompleted() {
        this.completed.clear();
    }
}


// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.timers = new Map();
    }

    /**
     * Start timer
     */
    startTimer(name) {
        this.timers.set(name, performance.now());
    }

    /**
     * End timer and record metric
     */
    endTimer(name) {
        const start = this.timers.get(name);
        if (start === undefined) return 0;

        const duration = performance.now() - start;
        this.timers.delete(name);

        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                count: 0,
                total: 0,
                min: Infinity,
                max: -Infinity,
                values: []
            });
        }

        const metric = this.metrics.get(name);
        metric.count++;
        metric.total += duration;
        metric.min = Math.min(metric.min, duration);
        metric.max = Math.max(metric.max, duration);
        metric.values.push(duration);

        // Keep only last 100 values
        if (metric.values.length > 100) {
            metric.values.shift();
        }

        return duration;
    }

    /**
     * Record custom metric
     */
    record(name, value) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                count: 0,
                total: 0,
                min: Infinity,
                max: -Infinity,
                values: []
            });
        }

        const metric = this.metrics.get(name);
        metric.count++;
        metric.total += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        metric.values.push(value);

        if (metric.values.length > 100) {
            metric.values.shift();
        }
    }

    /**
     * Get metric summary
     */
    getSummary(name) {
        const metric = this.metrics.get(name);
        if (!metric) return null;

        const mean = metric.total / metric.count;
        const sorted = [...metric.values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

        return {
            count: metric.count,
            mean: mean,
            min: metric.min,
            max: metric.max,
            p50: p50,
            p95: p95,
            p99: p99
        };
    }

    /**
     * Get all summaries
     */
    getAllSummaries() {
        const summaries = {};
        for (const name of this.metrics.keys()) {
            summaries[name] = this.getSummary(name);
        }
        return summaries;
    }

    /**
     * Get memory usage
     */
    getMemoryUsage() {
        if (performance.memory) {
            return {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                utilizationPercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
            };
        }
        return null;
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics.clear();
        this.timers.clear();
    }
}


// =============================================================================
// EXPORTS
// =============================================================================

// Browser environment
if (typeof window !== 'undefined') {
    window.HTA = window.HTA || {};
    window.HTA.SharedMemoryManager = SharedMemoryManager;
    window.HTA.IndexedDBCache = IndexedDBCache;
    window.HTA.LazyLoader = LazyLoader;
    window.HTA.ServiceWorkerManager = ServiceWorkerManager;
    window.HTA.MemoryPool = MemoryPool;
    window.HTA.BatchOperations = BatchOperations;
    window.HTA.ComputationScheduler = ComputationScheduler;
    window.HTA.PerformanceMonitor = PerformanceMonitor;
}

// Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SharedMemoryManager,
        IndexedDBCache,
        LazyLoader,
        ServiceWorkerManager,
        MemoryPool,
        BatchOperations,
        ComputationScheduler,
        PerformanceMonitor
    };
}
