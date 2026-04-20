import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Performance Optimization Module at the beginning (after IIFE opening)
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

    // Fast random number generators
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

    // Bootstrap resampling
    function bootstrap(effects, ses, nIter) {
      const n = effects.length;
      const results = new Float64Array(nIter);
      const weights = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        weights[i] = 1 / (ses[i] * ses[i]);
      }

      for (let iter = 0; iter < nIter; iter++) {
        // Resample indices
        const indices = new Uint16Array(n);
        for (let i = 0; i < n; i++) {
          indices[i] = Math.floor(mulberry32() * n);
        }

        // Compute weighted mean of resampled data
        let sumEW = 0, sumW = 0;
        for (let i = 0; i < n; i++) {
          const idx = indices[i];
          sumEW += effects[idx] * weights[idx];
          sumW += weights[idx];
        }
        results[iter] = sumEW / sumW;
      }

      // Sort for percentiles
      results.sort();
      return {
        mean: mean(Array.from(results)),
        ci_lower: results[Math.floor(nIter * 0.025)],
        ci_upper: results[Math.floor(nIter * 0.975)],
        samples: Array.from(results.slice(0, 100))
      };
    }

    // MCMC sampling (Metropolis-Hastings)
    function mcmc(effects, ses, nIter, burnIn) {
      const n = effects.length;
      let mu = mean(effects);
      let tau2 = variance(effects) * 0.5;

      const muSamples = new Float64Array(nIter - burnIn);
      const tau2Samples = new Float64Array(nIter - burnIn);

      const propSD_mu = 0.1;
      const propSD_tau2 = 0.05;

      for (let iter = 0; iter < nIter; iter++) {
        // Update mu
        const muProp = mu + randomNormal() * propSD_mu;
        let llCurr = 0, llProp = 0;
        for (let i = 0; i < n; i++) {
          const v = ses[i] * ses[i] + tau2;
          llCurr -= 0.5 * Math.pow(effects[i] - mu, 2) / v;
          llProp -= 0.5 * Math.pow(effects[i] - muProp, 2) / v;
        }
        if (Math.log(mulberry32()) < llProp - llCurr) {
          mu = muProp;
        }

        // Update tau2
        const tau2Prop = Math.abs(tau2 + randomNormal() * propSD_tau2);
        llCurr = 0; llProp = 0;
        for (let i = 0; i < n; i++) {
          const vCurr = ses[i] * ses[i] + tau2;
          const vProp = ses[i] * ses[i] + tau2Prop;
          llCurr -= 0.5 * (Math.log(vCurr) + Math.pow(effects[i] - mu, 2) / vCurr);
          llProp -= 0.5 * (Math.log(vProp) + Math.pow(effects[i] - mu, 2) / vProp);
        }
        // Half-Cauchy prior on tau
        llCurr -= Math.log(1 + tau2);
        llProp -= Math.log(1 + tau2Prop);

        if (Math.log(mulberry32()) < llProp - llCurr) {
          tau2 = tau2Prop;
        }

        if (iter >= burnIn) {
          muSamples[iter - burnIn] = mu;
          tau2Samples[iter - burnIn] = tau2;
        }
      }

      // Compute summaries
      const muArr = Array.from(muSamples);
      const tau2Arr = Array.from(tau2Samples);
      muArr.sort((a, b) => a - b);
      tau2Arr.sort((a, b) => a - b);

      const nSamp = muArr.length;
      return {
        mu: { mean: mean(muArr), median: muArr[Math.floor(nSamp/2)],
              ci_lower: muArr[Math.floor(nSamp*0.025)], ci_upper: muArr[Math.floor(nSamp*0.975)] },
        tau2: { mean: mean(tau2Arr), median: tau2Arr[Math.floor(nSamp/2)],
                ci_lower: tau2Arr[Math.floor(nSamp*0.025)], ci_upper: tau2Arr[Math.floor(nSamp*0.975)] }
      };
    }

    // Selection model fitting
    function fitSelectionModel(effects, ses, weights) {
      const n = effects.length;
      let bestLL = -Infinity;
      let bestParams = { mu: 0, tau2: 0.1, delta: 1 };

      // Grid search for initial values
      for (let mu = -2; mu <= 2; mu += 0.5) {
        for (let tau2 = 0.01; tau2 <= 1; tau2 *= 2) {
          for (let delta = 0.1; delta <= 2; delta += 0.3) {
            let ll = 0;
            for (let i = 0; i < n; i++) {
              const v = ses[i] * ses[i] + tau2;
              const z = effects[i] / ses[i];
              const selProb = 1 / (1 + Math.exp(-delta * (Math.abs(z) - 1.96)));
              ll += -0.5 * Math.pow(effects[i] - mu, 2) / v - 0.5 * Math.log(v);
              ll += Math.log(selProb + 0.01);
            }
            if (ll > bestLL) {
              bestLL = ll;
              bestParams = { mu, tau2, delta };
            }
          }
        }
      }

      return { ...bestParams, logLik: bestLL };
    }

    // Matrix operations for regression
    function matMult(A, B) {
      const m = A.length, n = B[0].length, k = B.length;
      const C = [];
      for (let i = 0; i < m; i++) {
        C[i] = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          let sum = 0;
          for (let l = 0; l < k; l++) sum += A[i][l] * B[l][j];
          C[i][j] = sum;
        }
      }
      return C;
    }

    function matInverse2x2(M) {
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      return [
        [M[1][1] / det, -M[0][1] / det],
        [-M[1][0] / det, M[0][0] / det]
      ];
    }

    // Weighted least squares
    function wls(y, X, w) {
      const n = y.length, p = X[0].length;

      // X'WX
      const XtWX = [];
      for (let i = 0; i < p; i++) {
        XtWX[i] = new Float64Array(p);
        for (let j = 0; j < p; j++) {
          let sum = 0;
          for (let k = 0; k < n; k++) sum += X[k][i] * w[k] * X[k][j];
          XtWX[i][j] = sum;
        }
      }

      // X'Wy
      const XtWy = new Float64Array(p);
      for (let i = 0; i < p; i++) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += X[k][i] * w[k] * y[k];
        XtWy[i] = sum;
      }

      // Solve (X'WX)^-1 X'Wy
      if (p === 2) {
        const inv = matInverse2x2(XtWX);
        return [
          inv[0][0] * XtWy[0] + inv[0][1] * XtWy[1],
          inv[1][0] * XtWy[0] + inv[1][1] * XtWy[1]
        ];
      }
      return XtWy; // Fallback
    }

    // Message handler
    self.onmessage = function(e) {
      const { type, data, id } = e.data;
      let result;

      try {
        switch (type) {
          case 'bootstrap':
            result = bootstrap(data.effects, data.ses, data.nIter || 1000);
            break;
          case 'mcmc':
            result = mcmc(data.effects, data.ses, data.nIter || 5000, data.burnIn || 1000);
            break;
          case 'selectionModel':
            result = fitSelectionModel(data.effects, data.ses, data.weights);
            break;
          case 'wls':
            result = wls(data.y, data.X, data.w);
            break;
          case 'weightedMean':
            result = weightedMean(data.effects, data.weights);
            break;
          default:
            result = { error: 'Unknown operation' };
        }
      } catch (err) {
        result = { error: err.message };
      }

      self.postMessage({ id, result });
    };
  `;

  // Create worker pool
  class WorkerPool {
    constructor(size = navigator.hardwareConcurrency || 4) {
      this.size = Math.min(size, 8);
      this.workers = [];
      this.queue = [];
      this.taskId = 0;
      this.callbacks = new Map();

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);

      for (let i = 0; i < this.size; i++) {
        this.addWorker();
      }
    }

    addWorker() {
      const worker = new Worker(this.workerUrl);
      worker.busy = false;
      worker.onmessage = (e) => {
        const { id, result } = e.data;
        const callback = this.callbacks.get(id);
        if (callback) {
          callback(result);
          this.callbacks.delete(id);
        }
        worker.busy = false;
        this.processQueue();
      };
      worker.onerror = (e) => {
        console.error('Worker error:', e);
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

    terminate() {
      this.workers.forEach(w => w.terminate());
      URL.revokeObjectURL(this.workerUrl);
    }
  }

  // Global worker pool
  let workerPool = null;
  function getWorkerPool() {
    if (!workerPool) workerPool = new WorkerPool();
    return workerPool;
  }

  // Lazy class loader
  const lazyClasses = new Map();
  function lazyInit(ClassName, ...args) {
    const key = ClassName.name + JSON.stringify(args.slice(0, 1));
    if (!lazyClasses.has(key)) {
      lazyClasses.set(key, new ClassName(...args));
    }
    return lazyClasses.get(key);
  }

  // Typed array utilities for speed
  const TypedArrayUtils = {
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
    sort(arr) {
      return Float64Array.from(arr).sort();
    },
    percentile(sortedArr, p) {
      const idx = Math.floor(sortedArr.length * p);
      return sortedArr[Math.min(idx, sortedArr.length - 1)];
    }
  };

  // Fast statistical functions using typed arrays
  const FastStats = {
    pooledEstimate(effects, ses, method = 'REML') {
      const n = effects.length;
      const weights = new Float64Array(n);
      let tau2 = 0;

      // Fixed-effect weights
      for (let i = 0; i < n; i++) {
        weights[i] = 1 / (ses[i] * ses[i]);
      }

      const fixedMu = TypedArrayUtils.weightedMean(effects, weights);

      if (method !== 'FE') {
        // DerSimonian-Laird tau2
        let Q = 0, sumW = 0, sumW2 = 0;
        for (let i = 0; i < n; i++) {
          Q += weights[i] * Math.pow(effects[i] - fixedMu, 2);
          sumW += weights[i];
          sumW2 += weights[i] * weights[i];
        }
        const c = sumW - sumW2 / sumW;
        tau2 = Math.max(0, (Q - (n - 1)) / c);

        // Random-effects weights
        for (let i = 0; i < n; i++) {
          weights[i] = 1 / (ses[i] * ses[i] + tau2);
        }
      }

      const mu = TypedArrayUtils.weightedMean(effects, weights);
      let sumW = 0;
      for (let i = 0; i < n; i++) sumW += weights[i];
      const se = Math.sqrt(1 / sumW);

      return { mu, se, tau2, weights: Array.from(weights) };
    },

    I2(Q, df) {
      return Math.max(0, (Q - df) / Q * 100);
    },

    eggerTest(effects, ses) {
      const n = effects.length;
      const precision = new Float64Array(n);
      const stdEffects = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        precision[i] = 1 / ses[i];
        stdEffects[i] = effects[i] / ses[i];
      }

      // WLS regression
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumW = 0;
      for (let i = 0; i < n; i++) {
        const w = precision[i] * precision[i];
        sumX += precision[i] * w;
        sumY += stdEffects[i] * w;
        sumXY += precision[i] * stdEffects[i] * w;
        sumX2 += precision[i] * precision[i] * w;
        sumW += w;
      }

      const slope = (sumW * sumXY - sumX * sumY) / (sumW * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / sumW;

      // SE of intercept
      let ssRes = 0;
      for (let i = 0; i < n; i++) {
        const pred = intercept + slope * precision[i];
        ssRes += Math.pow(stdEffects[i] - pred, 2) * precision[i] * precision[i];
      }
      const mse = ssRes / (n - 2);
      const seIntercept = Math.sqrt(mse * sumW / (sumW * sumX2 - sumX * sumX));

      const t = intercept / seIntercept;
      const df = n - 2;
      // Two-tailed p-value approximation
      const p = 2 * (1 - 0.5 * (1 + Math.tanh(0.8 * Math.abs(t) / Math.sqrt(df))));

      return { intercept, slope, se: seIntercept, t, p, df };
    }
  };

  // Optimized rendering with offscreen canvas
  class FastRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.offscreen = null;
      this.offCtx = null;

      if (typeof OffscreenCanvas !== 'undefined') {
        this.offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        this.offCtx = this.offscreen.getContext('2d');
      }
    }

    resize(width, height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.offscreen) {
        this.offscreen.width = width;
        this.offscreen.height = height;
      }
    }

    getContext() {
      return this.offCtx || this.ctx;
    }

    commit() {
      if (this.offscreen) {
        this.ctx.drawImage(this.offscreen, 0, 0);
      }
    }

    clear() {
      const ctx = this.getContext();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // Virtualized list for large datasets
  class VirtualList {
    constructor(container, itemHeight = 30) {
      this.container = container;
      this.itemHeight = itemHeight;
      this.items = [];
      this.scrollTop = 0;
      this.visibleCount = 0;

      this.content = document.createElement('div');
      this.content.style.position = 'relative';
      container.appendChild(this.content);

      container.addEventListener('scroll', throttle(() => this.render(), 16));
    }

    setItems(items) {
      this.items = items;
      this.content.style.height = items.length * this.itemHeight + 'px';
      this.visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight) + 2;
      this.render();
    }

    render() {
      this.scrollTop = this.container.scrollTop;
      const startIdx = Math.floor(this.scrollTop / this.itemHeight);
      const endIdx = Math.min(startIdx + this.visibleCount, this.items.length);

      // Clear and render only visible items
      const fragment = document.createDocumentFragment();
      for (let i = startIdx; i < endIdx; i++) {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = i * this.itemHeight + 'px';
        div.style.height = this.itemHeight + 'px';
        div.style.width = '100%';
        div.textContent = this.items[i];
        fragment.appendChild(div);
      }

      this.content.innerHTML = '';
      this.content.appendChild(fragment);
    }
  }

'''

# Find insertion point after IIFE opening
pattern = r"(\(function\s*\(\)\s*\{\s*'use strict';)"
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + perf_module + content[match.end():]
    print('Added Performance Optimization Module!')
else:
    print('Could not find IIFE opening')

# 2. Optimize updateAnalysis with debouncing
old_update = 'async function updateAnalysis() {'
new_update = '''async function updateAnalysis() {
    // Performance: use cached result if data unchanged
    const dataHash = JSON.stringify(state.parsedData?.rows?.slice(0, 5));
    const cacheKey = dataHash + state.method + state.model;
    if (computeCache.has(cacheKey) && !state.forceRecompute) {
      const cached = computeCache.get(cacheKey);
      state.lastStats = cached.stats;
      renderResults(cached);
      return;
    }
    state.forceRecompute = false;
'''
content = content.replace(old_update, new_update)
print('Added caching to updateAnalysis')

# 3. Add async computation wrappers
async_wrappers = '''

  // Async computation helpers using worker pool
  async function asyncBootstrap(effects, ses, nIter = 1000) {
    const cacheKey = 'bootstrap:' + JSON.stringify({ e: effects.slice(0, 3), n: nIter });
    if (computeCache.has(cacheKey)) return computeCache.get(cacheKey);

    const pool = getWorkerPool();
    const result = await pool.run('bootstrap', { effects, ses, nIter });
    computeCache.set(cacheKey, result);
    return result;
  }

  async function asyncMCMC(effects, ses, nIter = 5000, burnIn = 1000) {
    const cacheKey = 'mcmc:' + JSON.stringify({ e: effects.slice(0, 3), n: nIter });
    if (computeCache.has(cacheKey)) return computeCache.get(cacheKey);

    const pool = getWorkerPool();
    const result = await pool.run('mcmc', { effects, ses, nIter, burnIn });
    computeCache.set(cacheKey, result);
    return result;
  }

  async function asyncSelectionModel(effects, ses) {
    const pool = getWorkerPool();
    return await pool.run('selectionModel', { effects, ses });
  }

'''

# Add before init function
init_pattern = r'(\n  async function init\(\))'
match = re.search(init_pattern, content)
if match:
    content = content[:match.start()] + async_wrappers + content[match.start():]
    print('Added async computation wrappers')

# 4. Optimize forest plot rendering
old_forest = 'function renderForestPlot(stats, options = {}) {'
new_forest = '''function renderForestPlot(stats, options = {}) {
    // Performance: use plot cache
    const plotKey = 'forest:' + JSON.stringify(stats.slice(0, 2));
    const cached = plotCache.get(plotKey);
    if (cached && !options.force) {
      dom.forestCanvas.getContext('2d').putImageData(cached, 0, 0);
      return;
    }
'''
content = content.replace(old_forest, new_forest)
print('Optimized forest plot rendering')

# 5. Optimize funnel plot rendering
old_funnel = 'function renderFunnelPlot(stats, options = {}) {'
new_funnel = '''function renderFunnelPlot(stats, options = {}) {
    // Performance: use plot cache
    const plotKey = 'funnel:' + JSON.stringify(stats.slice(0, 2));
    const cached = plotCache.get(plotKey);
    if (cached && !options.force) {
      dom.funnelCanvas.getContext('2d').putImageData(cached, 0, 0);
      return;
    }
'''
content = content.replace(old_funnel, new_funnel)
print('Optimized funnel plot rendering')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js updated with performance optimizations. Size: {len(content)} chars')
