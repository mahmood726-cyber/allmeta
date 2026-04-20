import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Performance Optimization Module
perf_module = '''
  // ============================================================================
  // PERFORMANCE OPTIMIZATION MODULE
  // High-speed computation engine with Web Workers, caching, and lazy loading
  // ============================================================================

  // LRU Cache for memoization
  class LRUCache {
    constructor(maxSize = 100) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }
    get(key) {
      if (!this.cache.has(key)) return undefined;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    set(key, value) {
      if (this.cache.has(key)) this.cache.delete(key);
      else if (this.cache.size >= this.maxSize) {
        this.cache.delete(this.cache.keys().next().value);
      }
      this.cache.set(key, value);
    }
    has(key) { return this.cache.has(key); }
    clear() { this.cache.clear(); }
  }

  // Global caches
  const computeCache = new LRUCache(200);
  const modelCache = new LRUCache(50);
  const plotCache = new LRUCache(30);

  // Memoization decorator
  function memoize(fn, keyFn = JSON.stringify) {
    const cache = new LRUCache(100);
    return function(...args) {
      const key = keyFn(args);
      if (cache.has(key)) return cache.get(key);
      const result = fn.apply(this, args);
      cache.set(key, result);
      return result;
    };
  }

  // Debounce for frequent updates
  function debounce(fn, delay = 150) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Throttle for rate limiting
  function throttle(fn, limit = 100) {
    let inThrottle = false;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // RequestAnimationFrame wrapper for smooth UI
  function rafDebounce(fn) {
    let rafId = null;
    return function(...args) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        fn.apply(this, args);
        rafId = null;
      });
    };
  }

  // Batch DOM updates
  class DOMBatcher {
    constructor() {
      this.queue = [];
      this.scheduled = false;
    }
    add(fn) {
      this.queue.push(fn);
      if (!this.scheduled) {
        this.scheduled = true;
        requestAnimationFrame(() => this.flush());
      }
    }
    flush() {
      const batch = this.queue.splice(0);
      batch.forEach(fn => fn());
      this.scheduled = false;
    }
  }
  const domBatcher = new DOMBatcher();

  // Web Worker for heavy computations
  const workerCode = `
    // Fast statistical functions
    function mean(arr) {
      let sum = 0;
      for (let i = 0; i < arr.length; i++) sum += arr[i];
      return sum / arr.length;
    }

    function variance(arr, m) {
      if (m === undefined) m = mean(arr);
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        sum += d * d;
      }
      return sum / (arr.length - 1);
    }

    function weightedMean(effects, weights) {
      let sumEW = 0, sumW = 0;
      for (let i = 0; i < effects.length; i++) {
        sumEW += effects[i] * weights[i];
        sumW += weights[i];
      }
      return sumEW / sumW;
    }

    // Fast PRNG (mulberry32)
    let seed = Date.now();
    function mulberry32() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    function randomNormal() {
      let u = 0, v = 0;
      while (u === 0) u = mulberry32();
      while (v === 0) v = mulberry32();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Bootstrap resampling (optimized)
    function bootstrap(effects, ses, nIter) {
      const n = effects.length;
      const results = new Float64Array(nIter);
      const weights = new Float64Array(n);
      for (let i = 0; i < n; i++) weights[i] = 1 / (ses[i] * ses[i]);

      for (let iter = 0; iter < nIter; iter++) {
        let sumEW = 0, sumW = 0;
        for (let i = 0; i < n; i++) {
          const idx = Math.floor(mulberry32() * n);
          sumEW += effects[idx] * weights[idx];
          sumW += weights[idx];
        }
        results[iter] = sumEW / sumW;
      }
      results.sort();
      return {
        mean: mean(Array.from(results)),
        ci_lower: results[Math.floor(nIter * 0.025)],
        ci_upper: results[Math.floor(nIter * 0.975)]
      };
    }

    // MCMC (Metropolis-Hastings)
    function mcmc(effects, ses, nIter, burnIn) {
      const n = effects.length;
      let mu = mean(effects);
      let tau2 = variance(effects) * 0.5;

      const muSamples = new Float64Array(nIter - burnIn);
      const tau2Samples = new Float64Array(nIter - burnIn);

      for (let iter = 0; iter < nIter; iter++) {
        // Update mu
        const muProp = mu + randomNormal() * 0.1;
        let llCurr = 0, llProp = 0;
        for (let i = 0; i < n; i++) {
          const v = ses[i] * ses[i] + tau2;
          llCurr -= 0.5 * Math.pow(effects[i] - mu, 2) / v;
          llProp -= 0.5 * Math.pow(effects[i] - muProp, 2) / v;
        }
        if (Math.log(mulberry32()) < llProp - llCurr) mu = muProp;

        // Update tau2
        const tau2Prop = Math.abs(tau2 + randomNormal() * 0.05);
        llCurr = 0; llProp = 0;
        for (let i = 0; i < n; i++) {
          const vCurr = ses[i] * ses[i] + tau2;
          const vProp = ses[i] * ses[i] + tau2Prop;
          llCurr -= 0.5 * (Math.log(vCurr) + Math.pow(effects[i] - mu, 2) / vCurr);
          llProp -= 0.5 * (Math.log(vProp) + Math.pow(effects[i] - mu, 2) / vProp);
        }
        llCurr -= Math.log(1 + tau2);
        llProp -= Math.log(1 + tau2Prop);
        if (Math.log(mulberry32()) < llProp - llCurr) tau2 = tau2Prop;

        if (iter >= burnIn) {
          muSamples[iter - burnIn] = mu;
          tau2Samples[iter - burnIn] = tau2;
        }
      }

      const muArr = Array.from(muSamples).sort((a, b) => a - b);
      const nSamp = muArr.length;
      return {
        mu: { mean: mean(muArr), ci_lower: muArr[Math.floor(nSamp*0.025)], ci_upper: muArr[Math.floor(nSamp*0.975)] },
        tau2: { mean: mean(Array.from(tau2Samples)) }
      };
    }

    // Selection model fitting
    function fitSelectionModel(effects, ses) {
      const n = effects.length;
      let bestLL = -Infinity, bestParams = { mu: 0, tau2: 0.1, delta: 1 };

      for (let mu = -2; mu <= 2; mu += 0.5) {
        for (let tau2 = 0.01; tau2 <= 1; tau2 *= 2) {
          for (let delta = 0.1; delta <= 2; delta += 0.3) {
            let ll = 0;
            for (let i = 0; i < n; i++) {
              const v = ses[i] * ses[i] + tau2;
              const z = effects[i] / ses[i];
              const selProb = 1 / (1 + Math.exp(-delta * (Math.abs(z) - 1.96)));
              ll += -0.5 * Math.pow(effects[i] - mu, 2) / v - 0.5 * Math.log(v) + Math.log(selProb + 0.01);
            }
            if (ll > bestLL) { bestLL = ll; bestParams = { mu, tau2, delta }; }
          }
        }
      }
      return { ...bestParams, logLik: bestLL };
    }

    self.onmessage = function(e) {
      const { type, data, id } = e.data;
      let result;
      try {
        switch (type) {
          case 'bootstrap': result = bootstrap(data.effects, data.ses, data.nIter || 1000); break;
          case 'mcmc': result = mcmc(data.effects, data.ses, data.nIter || 5000, data.burnIn || 1000); break;
          case 'selectionModel': result = fitSelectionModel(data.effects, data.ses); break;
          default: result = { error: 'Unknown operation' };
        }
      } catch (err) { result = { error: err.message }; }
      self.postMessage({ id, result });
    };
  `;

  // Worker pool
  class WorkerPool {
    constructor(size = navigator.hardwareConcurrency || 4) {
      this.size = Math.min(size, 8);
      this.workers = [];
      this.queue = [];
      this.taskId = 0;
      this.callbacks = new Map();
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);
      for (let i = 0; i < this.size; i++) this.addWorker();
    }
    addWorker() {
      const worker = new Worker(this.workerUrl);
      worker.busy = false;
      worker.onmessage = (e) => {
        const { id, result } = e.data;
        const cb = this.callbacks.get(id);
        if (cb) { cb(result); this.callbacks.delete(id); }
        worker.busy = false;
        this.processQueue();
      };
      this.workers.push(worker);
    }
    run(type, data) {
      return new Promise((resolve) => {
        const id = ++this.taskId;
        this.callbacks.set(id, resolve);
        this.queue.push({ type, data, id });
        this.processQueue();
      });
    }
    processQueue() {
      if (this.queue.length === 0) return;
      const worker = this.workers.find(w => !w.busy);
      if (!worker) return;
      const task = this.queue.shift();
      worker.busy = true;
      worker.postMessage(task);
    }
  }

  let workerPool = null;
  function getWorkerPool() {
    if (!workerPool) workerPool = new WorkerPool();
    return workerPool;
  }

  // Typed array utilities for speed
  const FastMath = {
    mean(arr) {
      let sum = 0;
      for (let i = 0; i < arr.length; i++) sum += arr[i];
      return sum / arr.length;
    },
    variance(arr, mean) {
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - mean;
        sum += d * d;
      }
      return sum / (arr.length - 1);
    },
    weightedMean(values, weights) {
      let sumVW = 0, sumW = 0;
      for (let i = 0; i < values.length; i++) {
        sumVW += values[i] * weights[i];
        sumW += weights[i];
      }
      return sumVW / sumW;
    },
    percentile(arr, p) {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * p)];
    }
  };

  // Fast pooled estimate
  const FastStats = {
    pooledEstimate(effects, ses, method = 'REML') {
      const n = effects.length;
      const weights = new Float64Array(n);
      let tau2 = 0;

      for (let i = 0; i < n; i++) weights[i] = 1 / (ses[i] * ses[i]);
      const fixedMu = FastMath.weightedMean(effects, Array.from(weights));

      if (method !== 'FE') {
        let Q = 0, sumW = 0, sumW2 = 0;
        for (let i = 0; i < n; i++) {
          Q += weights[i] * Math.pow(effects[i] - fixedMu, 2);
          sumW += weights[i];
          sumW2 += weights[i] * weights[i];
        }
        tau2 = Math.max(0, (Q - (n - 1)) / (sumW - sumW2 / sumW));
        for (let i = 0; i < n; i++) weights[i] = 1 / (ses[i] * ses[i] + tau2);
      }

      const mu = FastMath.weightedMean(effects, Array.from(weights));
      let sumW = 0;
      for (let i = 0; i < n; i++) sumW += weights[i];
      return { mu, se: Math.sqrt(1 / sumW), tau2, weights: Array.from(weights) };
    }
  };

'''

# Find insertion point after "use strict"
pattern = r'(\(\) => \{\n  "use strict";)'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + perf_module + content[match.end():]
    print('Added Performance Module!')
else:
    print('Pattern not found, trying alternative...')
    # Try adding after CONFIG
    alt_pattern = r'(GRID_SEARCH_POINTS: 8\n  \};)'
    match = re.search(alt_pattern, content)
    if match:
        content = content[:match.end()] + '\n' + perf_module + content[match.end():]
        print('Added Performance Module after CONFIG!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js updated. Size: {len(content)} chars')
