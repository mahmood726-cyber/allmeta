/**
 * TaskScheduler — Higher-level scheduler for PSA batching, progress reporting,
 * and task cancellation, built on top of WorkerPool.
 *
 * Usage:
 *   const pool = new WorkerPool({ poolSize: 4 });
 *   const scheduler = new TaskScheduler(pool);
 *   const result = await scheduler.schedulePSA('psa', config, 10000, (done, total) => {
 *       console.log(`${done}/${total}`);
 *   });
 *   scheduler.cancelAll();
 */

'use strict';

// ============ TASK ID GENERATION ============

let _nextTaskId = 1;

function generateTaskId() {
    return `task-${_nextTaskId++}`;
}

// ============ TASK SCHEDULER ============

class TaskScheduler {
    /**
     * @param {import('./workerPool').WorkerPool} workerPool - The worker pool to dispatch tasks to
     */
    constructor(workerPool) {
        if (!workerPool) {
            throw new Error('TaskScheduler requires a WorkerPool instance');
        }
        this.pool = workerPool;
        this.running = new Map();  // taskId -> { promise, cancelled }
    }

    // ──────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────

    /**
     * Schedule a PSA run split across workers.
     *
     * Divides nIterations into batches (one per pool thread), dispatches them
     * in parallel, merges the results, and reports progress via callback.
     *
     * @param {string} engineName - Engine to use (e.g., 'psa', 'correlatedPSA')
     * @param {Object} config - Configuration to pass to the engine's runBatch method
     * @param {number} nIterations - Total number of PSA iterations
     * @param {Function} [onProgress] - Callback: (completedIterations, totalIterations) => void
     * @returns {Promise<{taskId: string, iterations: Array, summary: Object}>}
     */
    async schedulePSA(engineName, config, nIterations, onProgress) {
        if (!engineName || typeof engineName !== 'string') {
            throw new Error('engineName must be a non-empty string');
        }
        if (!Number.isFinite(nIterations) || nIterations < 1) {
            throw new Error('nIterations must be a positive integer');
        }

        const taskId = generateTaskId();
        const batchSize = Math.ceil(nIterations / this.pool.poolSize);

        // Build task list — one batch per pool slot
        const tasks = [];
        for (let i = 0; i < this.pool.poolSize; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, nIterations);
            if (start >= nIterations) break;
            tasks.push({
                engine: engineName,
                method: 'runBatch',
                args: [config, end - start, i * 1000]  // different seed offset per batch
            });
        }

        // Track cancellation state
        let cancelled = false;
        const taskEntry = {
            promise: null,
            cancelled: false,
            cancel: () => { cancelled = true; taskEntry.cancelled = true; }
        };
        this.running.set(taskId, taskEntry);

        // Execute batches with progress tracking
        let completed = 0;
        const total = nIterations;

        const batchPromises = tasks.map(async (task, idx) => {
            const result = await this.pool.run(task.engine, task.method, task.args);

            if (cancelled) {
                throw new Error(`Task ${taskId} was cancelled`);
            }

            // Update progress
            const batchCount = (idx < tasks.length - 1)
                ? batchSize
                : (nIterations - idx * batchSize);
            completed += batchCount;

            if (typeof onProgress === 'function') {
                try {
                    onProgress(Math.min(completed, total), total);
                } catch (_) {
                    // Progress callback errors should not crash the pipeline
                }
            }

            return result;
        });

        const wrappedPromise = Promise.all(batchPromises)
            .then(results => {
                this.running.delete(taskId);
                const merged = this._mergeResults(results);
                return { taskId, ...merged };
            })
            .catch(err => {
                this.running.delete(taskId);
                throw err;
            });

        taskEntry.promise = wrappedPromise;
        return wrappedPromise;
    }

    /**
     * Schedule a single task (non-PSA) with cancellation support.
     *
     * @param {string} engineName
     * @param {string} methodName
     * @param {Array} args
     * @returns {Promise<{taskId: string, result: any}>}
     */
    async scheduleTask(engineName, methodName, args) {
        const taskId = generateTaskId();
        let cancelled = false;
        const taskEntry = {
            promise: null,
            cancelled: false,
            cancel: () => { cancelled = true; taskEntry.cancelled = true; }
        };
        this.running.set(taskId, taskEntry);

        const promise = this.pool.run(engineName, methodName, args)
            .then(result => {
                this.running.delete(taskId);
                if (cancelled) {
                    throw new Error(`Task ${taskId} was cancelled`);
                }
                return { taskId, result };
            })
            .catch(err => {
                this.running.delete(taskId);
                throw err;
            });

        taskEntry.promise = promise;
        return promise;
    }

    /**
     * Cancel a running task by ID.
     * Note: cancellation is cooperative — the engine method will complete,
     * but the result will be discarded and the promise rejected.
     *
     * @param {string} taskId
     * @returns {boolean} true if the task was found and cancelled
     */
    cancel(taskId) {
        const entry = this.running.get(taskId);
        if (!entry) return false;
        entry.cancelled = true;
        if (typeof entry.cancel === 'function') {
            entry.cancel();
        }
        this.running.delete(taskId);
        return true;
    }

    /**
     * Cancel all running tasks.
     * @returns {number} Number of tasks cancelled
     */
    cancelAll() {
        let count = 0;
        for (const [taskId] of this.running) {
            if (this.cancel(taskId)) count++;
        }
        return count;
    }

    /**
     * Get the number of currently running tasks.
     * @returns {number}
     */
    get activeTaskCount() {
        return this.running.size;
    }

    /**
     * Check if a specific task is still running.
     * @param {string} taskId
     * @returns {boolean}
     */
    isRunning(taskId) {
        return this.running.has(taskId);
    }

    // ──────────────────────────────────────────────
    // RESULT MERGING
    // ──────────────────────────────────────────────

    /**
     * Merge PSA batch results into a single combined result.
     *
     * Expects each batch result to be either:
     *   - An object with { iterations: [...], summary: {...} }
     *   - An array of iteration objects
     *   - A primitive/other (collected as-is)
     *
     * @param {Array} results - Array of batch results
     * @returns {{ iterations: Array, summary: Object }}
     * @private
     */
    _mergeResults(results) {
        if (!results || results.length === 0) {
            return { iterations: [], summary: {} };
        }

        const allIterations = [];
        const summaries = [];

        for (const r of results) {
            if (r == null) continue;

            if (Array.isArray(r)) {
                // Result is a raw array of iterations
                allIterations.push(...r);
            } else if (typeof r === 'object' && Array.isArray(r.iterations)) {
                // Result has { iterations, summary } structure
                allIterations.push(...r.iterations);
                if (r.summary) summaries.push(r.summary);
            } else {
                // Single result — wrap it
                allIterations.push(r);
            }
        }

        // Merge summaries: average numeric fields, concatenate arrays
        const mergedSummary = this._mergeSummaries(summaries);

        return {
            iterations: allIterations,
            summary: mergedSummary
        };
    }

    /**
     * Merge summary objects from multiple batches.
     * Numeric fields are averaged; arrays are concatenated; other fields
     * take the value from the last batch.
     *
     * @param {Array<Object>} summaries
     * @returns {Object}
     * @private
     */
    _mergeSummaries(summaries) {
        if (summaries.length === 0) return {};
        if (summaries.length === 1) return { ...summaries[0] };

        const merged = {};
        const allKeys = new Set();
        for (const s of summaries) {
            for (const key of Object.keys(s)) {
                allKeys.add(key);
            }
        }

        for (const key of allKeys) {
            const values = summaries.map(s => s[key]).filter(v => v !== undefined);

            if (values.length === 0) continue;

            if (values.every(v => typeof v === 'number' && Number.isFinite(v))) {
                // Average numeric fields
                merged[key] = values.reduce((a, b) => a + b, 0) / values.length;
            } else if (values.every(v => Array.isArray(v))) {
                // Concatenate arrays
                merged[key] = [].concat(...values);
            } else {
                // Take last value
                merged[key] = values[values.length - 1];
            }
        }

        return merged;
    }
}

// ============ EXPORTS ============

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TaskScheduler };
}

if (typeof globalThis !== 'undefined') {
    globalThis.TaskScheduler = TaskScheduler;
}
