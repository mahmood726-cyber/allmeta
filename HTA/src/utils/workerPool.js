/**
 * WorkerPool — Generic Web Worker pool for offloading heavy computation.
 *
 * In browser mode: Creates actual Web Workers using Blob URLs.
 * In Node.js/test mode: Falls back to synchronous execution (jsdom lacks Workers).
 *
 * Usage:
 *   const pool = new WorkerPool({ poolSize: 4 });
 *   const result = await pool.run('markov', 'run', [projectConfig]);
 *   pool.terminate();
 */

'use strict';

// ============ ENGINE REGISTRY (sync fallback) ============

/**
 * Lazy-loading registry mapping engine names to their require paths and
 * primary exported class names. Each entry is { path, className }.
 * The className is the first class exported by the module.
 */
const ENGINE_REGISTRY = {
    psa:              { path: '../engine/psa',              className: 'PSAEngine' },
    nma:              { path: '../engine/nma',              className: 'NetworkMetaAnalysis' },
    markov:           { path: '../engine/markov',           className: 'MarkovEngine' },
    budgetImpact:     { path: '../engine/budgetImpact',     className: 'BudgetImpactEngine' },
    mcda:             { path: '../engine/mcda',             className: 'MCDAEngine' },
    correlatedPSA:    { path: '../engine/correlatedPSA',    className: 'CorrelatedPSAEngine' },
    cureModels:       { path: '../engine/cureModels',       className: 'CureFractionModels' },
    semiMarkov:       { path: '../engine/semiMarkov',       className: 'SemiMarkovEngine' },
    modelAveraging:   { path: '../engine/modelAveraging',   className: 'ModelAveragingEngine' },
    competingRisks:   { path: '../engine/competingRisks',   className: 'CompetingRisksEngine' },
    decisionTree:     { path: '../engine/decisionTree',     className: 'DecisionTreeEngine' },
    calibration:      { path: '../engine/calibration',      className: 'CalibrationEngine' },
    partitionedSurvival: { path: '../engine/partitioned_survival', className: 'PartitionedSurvivalEngine' },
    scenarioAnalysis: { path: '../engine/scenarioAnalysis', className: 'ScenarioAnalysisEngine' },
    thresholdAnalysis:{ path: '../engine/thresholdAnalysis', className: 'ThresholdAnalysisEngine' },
    evppi:            { path: '../engine/evppi',            className: 'EVPPICalculator' },
    evsi:             { path: '../engine/evsi',             className: 'EVSIEngine' },
    microsimulation:  { path: '../engine/microsimulation',  className: 'MicrosimulationEngine' },
    des:              { path: '../engine/des',              className: 'DESEngine' },
    reporting:        { path: '../engine/reporting',        className: 'ReportingStandards' },
    metaMethods:      { path: '../engine/metaMethods',      className: 'MetaAnalysisMethods' }
};

// ============ WORKER ID GENERATION ============

let _nextWorkerId = 1;

function generateWorkerId() {
    return `worker-${_nextWorkerId++}`;
}

// ============ WORKER WRAPPER ============

/**
 * Wraps a single Web Worker with queue management.
 */
class WorkerHandle {
    constructor(blob) {
        this.id = generateWorkerId();
        this.busy = false;
        this.worker = null;
        this._blob = blob;
        this._blobUrl = null;
    }

    /**
     * Lazily create the underlying Worker on first use.
     */
    _ensureWorker() {
        if (this.worker) return;
        this._blobUrl = URL.createObjectURL(this._blob);
        this.worker = new Worker(this._blobUrl);
    }

    /**
     * Send a task to the worker and return a promise for the result.
     * @param {Object} message - { engineName, methodName, args, scripts }
     * @returns {Promise<any>}
     */
    execute(message) {
        this._ensureWorker();
        this.busy = true;

        return new Promise((resolve, reject) => {
            const onMessage = (e) => {
                this.busy = false;
                this.worker.removeEventListener('message', onMessage);
                this.worker.removeEventListener('error', onError);
                if (e.data.ok) {
                    resolve(e.data.result);
                } else {
                    reject(new Error(e.data.error || 'Worker execution failed'));
                }
            };

            const onError = (err) => {
                this.busy = false;
                this.worker.removeEventListener('message', onMessage);
                this.worker.removeEventListener('error', onError);
                reject(new Error(err.message || 'Worker error'));
            };

            this.worker.addEventListener('message', onMessage);
            this.worker.addEventListener('error', onError);
            this.worker.postMessage(message);
        });
    }

    /**
     * Terminate the worker and revoke the Blob URL.
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this._blobUrl) {
            URL.revokeObjectURL(this._blobUrl);
            this._blobUrl = null;
        }
        this.busy = false;
    }
}

// ============ MAIN POOL CLASS ============

class WorkerPool {
    /**
     * @param {Object} options
     * @param {number} [options.poolSize] - Number of worker threads (defaults to hardwareConcurrency or 4)
     * @param {Object} [options.scripts] - Map of engineName to script URLs for importScripts in browser
     * @param {Object} [options.engineRegistry] - Override engine registry for testing
     */
    constructor(options = {}) {
        this.poolSize = options.poolSize ??
            (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4);
        this.workers = [];
        this.queue = [];
        this.isBrowser = typeof window !== 'undefined' &&
                         typeof window.Worker !== 'undefined' &&
                         typeof URL !== 'undefined' &&
                         typeof URL.createObjectURL === 'function' &&
                         typeof Blob !== 'undefined';
        this._scripts = options.scripts || {};
        this._engineRegistry = options.engineRegistry || ENGINE_REGISTRY;
        this._blob = null;
        this._terminated = false;
        this._activeTaskCount = 0;
    }

    // ──────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────

    /**
     * Run a function in a worker thread (browser) or synchronously (Node/test).
     * @param {string} engineName - Name of the engine module (e.g., 'psa', 'nma')
     * @param {string} methodName - Method to call on the engine instance
     * @param {Array} args - Arguments to pass to the method
     * @returns {Promise<any>} Result from the engine method
     */
    async run(engineName, methodName, args) {
        if (this._terminated) {
            throw new Error('WorkerPool has been terminated');
        }
        if (!this.isBrowser) {
            return this._runSync(engineName, methodName, args);
        }
        return this._runInWorker(engineName, methodName, args);
    }

    /**
     * Run multiple tasks in parallel across the pool.
     * Results are returned in the same order as the input tasks.
     *
     * @param {Array<{engine: string, method: string, args: Array}>} tasks
     * @returns {Promise<Array>} Results in input order
     */
    async runBatch(tasks) {
        if (!Array.isArray(tasks)) {
            throw new Error('runBatch expects an array of tasks');
        }
        if (tasks.length === 0) {
            return [];
        }
        return Promise.all(
            tasks.map(t => this.run(t.engine, t.method, t.args))
        );
    }

    /**
     * Terminate all workers and clean up resources.
     * Safe to call multiple times (idempotent).
     */
    terminate() {
        this._terminated = true;
        for (const handle of this.workers) {
            handle.terminate();
        }
        this.workers = [];
        this.queue = [];
        if (this._blob) {
            this._blob = null;
        }
    }

    /**
     * Return the list of registered engine names.
     * @returns {string[]}
     */
    get registeredEngines() {
        return Object.keys(this._engineRegistry);
    }

    /**
     * Check whether the pool is in synchronous (fallback) mode.
     * @returns {boolean}
     */
    get isSyncMode() {
        return !this.isBrowser;
    }

    /**
     * Return pool statistics.
     * @returns {{ poolSize: number, activeWorkers: number, queueLength: number, terminated: boolean }}
     */
    get stats() {
        return {
            poolSize: this.poolSize,
            activeWorkers: this.workers.filter(w => w.busy).length,
            queueLength: this.queue.length,
            terminated: this._terminated
        };
    }

    // ──────────────────────────────────────────────
    // SYNCHRONOUS FALLBACK (Node.js / jsdom tests)
    // ──────────────────────────────────────────────

    /**
     * Synchronous execution for non-browser environments.
     * Loads the engine module via require(), instantiates the primary class,
     * and calls the requested method.
     *
     * @param {string} engineName
     * @param {string} methodName
     * @param {Array} args
     * @returns {*} Result from the engine method
     * @private
     */
    _runSync(engineName, methodName, args) {
        const entry = this._engineRegistry[engineName];
        if (!entry) {
            const available = Object.keys(this._engineRegistry).join(', ');
            throw new Error(
                `Unknown engine "${engineName}". Available engines: ${available}`
            );
        }

        let mod;
        try {
            mod = require(entry.path);
        } catch (err) {
            throw new Error(
                `Failed to load engine "${engineName}" from ${entry.path}: ${err.message}`
            );
        }

        // Resolve the class: try explicit className, then first exported value
        let EngineClass = mod[entry.className];
        if (!EngineClass) {
            // Fallback: use first exported value that is a function/class
            const exportedValues = Object.values(mod);
            EngineClass = exportedValues.find(v => typeof v === 'function');
        }
        if (!EngineClass) {
            throw new Error(
                `Engine "${engineName}" module does not export class "${entry.className}" or any callable`
            );
        }

        let instance;
        try {
            instance = new EngineClass();
        } catch (err) {
            throw new Error(
                `Failed to instantiate engine "${engineName}" (${entry.className}): ${err.message}`
            );
        }

        if (typeof instance[methodName] !== 'function') {
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance))
                .filter(m => m !== 'constructor' && typeof instance[m] === 'function');
            throw new Error(
                `Engine "${engineName}" has no method "${methodName}". ` +
                `Available methods: ${methods.join(', ')}`
            );
        }

        return instance[methodName](...(args || []));
    }

    // ──────────────────────────────────────────────
    // BROWSER WORKER EXECUTION
    // ──────────────────────────────────────────────

    /**
     * Create the Blob containing the worker script.
     * The worker loads engine scripts via importScripts and executes the method.
     * @returns {Blob}
     * @private
     */
    _createWorkerBlob() {
        if (this._blob) return this._blob;

        const code = [
            'self.onmessage = function(e) {',
            '    var data = e.data;',
            '    var engineName = data.engineName;',
            '    var methodName = data.methodName;',
            '    var args = data.args || [];',
            '    var scripts = data.scripts || [];',
            '    try {',
            '        if (scripts.length > 0) {',
            '            importScripts.apply(self, scripts);',
            '        }',
            '        var Engine = self[engineName];',
            '        if (!Engine) {',
            '            throw new Error("Engine \\"" + engineName + "\\" not found on worker global scope after importScripts");',
            '        }',
            '        var instance = new Engine();',
            '        if (typeof instance[methodName] !== "function") {',
            '            throw new Error("Method \\"" + methodName + "\\" not found on engine \\"" + engineName + "\\"");',
            '        }',
            '        var result = instance[methodName].apply(instance, args);',
            '        if (result && typeof result.then === "function") {',
            '            result.then(function(r) {',
            '                self.postMessage({ ok: true, result: r });',
            '            }).catch(function(err) {',
            '                self.postMessage({ ok: false, error: err.message || String(err) });',
            '            });',
            '        } else {',
            '            self.postMessage({ ok: true, result: result });',
            '        }',
            '    } catch(err) {',
            '        self.postMessage({ ok: false, error: err.message || String(err) });',
            '    }',
            '};'
        ].join('\n');

        this._blob = new Blob([code], { type: 'application/javascript' });
        return this._blob;
    }

    /**
     * Get an idle WorkerHandle, or create one if below poolSize.
     * If all workers are busy, returns null (caller should queue).
     * @returns {WorkerHandle|null}
     * @private
     */
    _getIdleWorker() {
        // Find existing idle worker
        for (const handle of this.workers) {
            if (!handle.busy) return handle;
        }
        // Create new worker if under limit
        if (this.workers.length < this.poolSize) {
            const blob = this._createWorkerBlob();
            const handle = new WorkerHandle(blob);
            this.workers.push(handle);
            return handle;
        }
        return null;
    }

    /**
     * Process the next item in the queue if a worker is available.
     * @private
     */
    _processQueue() {
        if (this.queue.length === 0) return;
        const worker = this._getIdleWorker();
        if (!worker) return;

        const { message, resolve, reject } = this.queue.shift();
        worker.execute(message)
            .then(result => {
                this._activeTaskCount--;
                resolve(result);
                this._processQueue();
            })
            .catch(err => {
                this._activeTaskCount--;
                reject(err);
                this._processQueue();
            });
    }

    /**
     * Run a task in a browser Web Worker.
     * @param {string} engineName
     * @param {string} methodName
     * @param {Array} args
     * @returns {Promise<any>}
     * @private
     */
    _runInWorker(engineName, methodName, args) {
        const scripts = this._scripts[engineName] || [];
        const message = {
            engineName,
            methodName,
            args: args || [],
            scripts: Array.isArray(scripts) ? scripts : [scripts]
        };

        this._activeTaskCount++;

        const worker = this._getIdleWorker();
        if (worker) {
            const promise = worker.execute(message)
                .then(result => {
                    this._activeTaskCount--;
                    this._processQueue();
                    return result;
                })
                .catch(err => {
                    this._activeTaskCount--;
                    this._processQueue();
                    throw err;
                });
            return promise;
        }

        // All workers busy — queue the task
        return new Promise((resolve, reject) => {
            this.queue.push({ message, resolve, reject });
        });
    }
}

// ============ EXPORTS ============

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkerPool, WorkerHandle, ENGINE_REGISTRY };
}

if (typeof globalThis !== 'undefined') {
    globalThis.WorkerPool = WorkerPool;
}
