/* GOSH exact streaming all-subsets engine (FE and DerSimonian-Laird).
 *
 * Enumerates every non-empty subset of k studies (2^k - 1 subsets, singletons included, as metafor::gosh does
 * when it enumerates) WITHOUT storing them, and streams each subset fit into fixed-size accumulators:
 *   - exact count, sum (mean), min and max of the pooled estimate, I2, Q and (DL) tau2;
 *   - a fixed-grid 2-D density (estimate x I2) with counts per cell;
 *   - exact per-study with/without counts and means of the estimate and I2;
 *   - optional exact Type-7 quartiles (q25, median, q75) of the estimate and I2 by a second pass.
 *
 * Enumeration order. Studies 0..m-1 form the LOW block (m = min(k, 12)) and m..k-1 the HIGH block. The
 * sufficient sums (sum w, sum w*y, sum w*y^2, sum w^2, count) of every low subset and every high subset are tabulated
 * once (2^m + 2^(k-m) entries), each entry built from a smaller entry plus one study. A subset (H, L) then costs ONE
 * addition per sum. Unlike a Gray-code walk, no running sum is carried across subsets, so there is no rounding drift
 * after millions of add/remove steps, and the result for a subset does not depend on enumeration order.
 * FE is O(1) per subset. DL is not: the DL estimate needs sum 1/(v_i + tau2) and sum y_i/(v_i + tau2) with a
 * subset-specific tau2, so each DL subset with tau2 > 0 costs O(|subset|) (a loop over its members); subsets with
 * tau2 = 0 reuse the FE estimate (identical weights).
 *
 * Numerics. y is centred at the plain mean of the inputs before tabulating, so Q = sum w*yc^2 - (sum w*yc)^2/sum w
 * suffers far less cancellation; Q is clamped at 0 and is exactly 0 for singletons. I2 = 100*(Q-df)/Q when Q > df,
 * else 0 (for DL this equals metafor's I2). DL tau2 = max(0, (Q - df)/(sum w - sum w^2/sum w)).
 *
 * Grid. Every subset estimate is a convex combination of the inputs, so it lies in [min y, max y]: the x range is
 * known before enumeration (no extra pass). Cell ix = floor((est - x0) * (GX / (x1 - x0))), iy = floor(I2 * (GY / 100)),
 * both clamped to the grid. The R reference uses the identical expression; see gosh/validate/exact/README.md for ties.
 *
 * Usable as a browser global (window.AlmGoshExactEngine), as a Web Worker script (postMessage protocol below)
 * and as a CommonJS module (node tests).
 */
(function (root) {
  'use strict';

  var LOW_MAX = 12;
  var QBINS = 65536;
  var COLLECT_CAP = 4000000;
  var MAX_K = 30;

  function validateInput(te, se, model) {
    if (!Array.isArray(te) && !(te && typeof te.length === 'number')) throw new Error('te must be an array');
    var k = te.length;
    if (!Number.isInteger(k) || k < 1 || k > MAX_K) throw new Error('exact enumeration supports 1..' + MAX_K + ' studies');
    if (!se || se.length !== k) throw new Error('se must have the same length as te');
    for (var i = 0; i < k; i++) {
      if (typeof te[i] !== 'number' || !Number.isFinite(te[i])) throw new Error('non-finite effect at row ' + (i + 1));
      if (typeof se[i] !== 'number' || !Number.isFinite(se[i]) || !(se[i] > 0)) throw new Error('invalid SE at row ' + (i + 1));
    }
    if (model !== 'FE' && model !== 'DL') throw new Error('model must be FE or DL');
  }

  function table(values) {
    // values: array of {w, wy, wy2, w2}; returns tables over all 2^n masks.
    var n = values.length, size = 1 << n;
    var sw = new Float64Array(size), swy = new Float64Array(size), swy2 = new Float64Array(size), sw2 = new Float64Array(size);
    var cnt = new Uint8Array(size);
    for (var mask = 1; mask < size; mask++) {
      var low = mask & -mask, i = 31 - Math.clz32(low), rest = mask ^ low, e = values[i];
      sw[mask] = sw[rest] + e.w; swy[mask] = swy[rest] + e.wy; swy2[mask] = swy2[rest] + e.wy2; sw2[mask] = sw2[rest] + e.w2;
      cnt[mask] = cnt[rest] + 1;
    }
    return { sw: sw, swy: swy, swy2: swy2, sw2: sw2, cnt: cnt, size: size };
  }

  function createEngine(te, se, model, options) {
    validateInput(te, se, model);
    options = options || {};
    var k = te.length;
    var GX = options.gridX || 100, GY = options.gridY || 100;
    if (!Number.isInteger(GX) || !Number.isInteger(GY) || GX < 1 || GY < 1 || GX * GY > 1000000) throw new Error('invalid grid dimensions');
    var m = Math.min(k, LOW_MAX), h = k - m;
    var c = 0;
    for (var i = 0; i < k; i++) c += te[i];
    c /= k;
    var v = new Float64Array(k), yc = new Float64Array(k), elems = [];
    for (i = 0; i < k; i++) {
      v[i] = se[i] * se[i]; yc[i] = te[i] - c;
      var w = 1 / v[i];
      if (!(v[i] > 0) || !(w > 0) || ![c, v[i], yc[i], w, w * yc[i], w * yc[i] * yc[i], w * w].every(Number.isFinite)) throw new Error('inputs exceed the representable numeric range');
      elems.push({ w: w, wy: w * yc[i], wy2: w * yc[i] * yc[i], w2: w * w });
    }
    var LT = table(elems.slice(0, m)), HT = table(elems.slice(m));
    if (![LT, HT].every(function (t) { return ['sw','swy','swy2','sw2'].every(function (q) { return Number.isFinite(t[q][t.size - 1]); }); })) throw new Error('subset sums exceed the representable numeric range');
    var x0 = Infinity, x1 = -Infinity;
    for (i = 0; i < k; i++) { if (te[i] < x0) x0 = te[i]; if (te[i] > x1) x1 = te[i]; }
    if (!(x1 > x0)) { x0 = x0 - 0.5; x1 = x1 + 0.5; }
    if (!(x1 > x0) || !Number.isFinite(x1 - x0) || !Number.isFinite(QBINS / (x1 - x0))) throw new Error('plot range is not representable');
    var gxScale = GX / (x1 - x0), gyScale = GY / 100;
    var qxScale = QBINS / (x1 - x0), qyScale = QBINS / 100;
    var isDL = model === 'DL';
    var total = Math.pow(2, k) - 1;

    var st = {
      k: k, model: model, m: m, h: h, centre: c, x0: x0, x1: x1, GX: GX, GY: GY, total: total,
      n: 0,
      sum: { est: 0, I2: 0, Q: 0, tau2: 0 },
      min: { est: Infinity, I2: Infinity, Q: Infinity, tau2: Infinity },
      max: { est: -Infinity, I2: -Infinity, Q: -Infinity, tau2: -Infinity },
      grid: new Uint32Array(GX * GY),
      accL: { est: new Float64Array(LT.size), I2: new Float64Array(LT.size) },
      accH: { est: new Float64Array(HT.size), I2: new Float64Array(HT.size) },
      qEst: new Uint32Array(QBINS), qI2: new Uint32Array(QBINS), zeroI2: 0,
      tau2Positive: 0,
      hNext: 0
    };

    // Per-subset fit, written out once and used by every pass so all passes do identical arithmetic.
    // mode 0 = main accumulation pass, mode 1 = quantile collection pass.
    var Lsw = LT.sw, Lswy = LT.swy, Lswy2 = LT.swy2, Lsw2 = LT.sw2, Lcnt = LT.cnt, Lsize = LT.size;
    var Hsw = HT.sw, Hswy = HT.swy, Hswy2 = HT.swy2, Hsw2 = HT.sw2, Hcnt = HT.cnt;
    var out = new Float64Array(4);
    var slotE = null, slotI = null, bufE = null, bufI = null, fillE = null, fillI = null;
    function fitOne(H, L) {
      var sw = Hsw[H] + Lsw[L], swy = Hswy[H] + Lswy[L], swy2 = Hswy2[H] + Lswy2[L];
      var n = Hcnt[H] + Lcnt[L];
      var muc = swy / sw;
      var Q = n === 1 ? 0 : swy2 - swy * muc;
      if (Q < 0) Q = 0;
      var df = n - 1;
      var I2 = (df > 0 && Q > df) ? 100 * (Q - df) / Q : 0;
      var est = c + muc, tau2 = 0;
      if (isDL && df > 0) {
        var sw2 = Hsw2[H] + Lsw2[L];
        tau2 = (Q - df) / (sw - sw2 / sw);
        if (tau2 > 0) {
          var a = 0, b = 0, bits = L, t, j, u;
          while (bits) { t = bits & -bits; j = 31 - Math.clz32(t); u = 1 / (v[j] + tau2); a += u * yc[j]; b += u; bits ^= t; }
          bits = H;
          while (bits) { t = bits & -bits; j = m + 31 - Math.clz32(t); u = 1 / (v[j] + tau2); a += u * yc[j]; b += u; bits ^= t; }
          est = c + a / b;
        } else tau2 = 0;
      }
      out[0] = est; out[1] = I2; out[2] = Q; out[3] = tau2;
    }

    function sweep(from, to, mode) {
      var grid = st.grid, accLe = st.accL.est, accLi = st.accL.I2, accHe = st.accH.est, accHi = st.accH.I2;
      var qE = st.qEst, qI = st.qI2;
      var mnE = st.min.est, mxE = st.max.est, mnI = st.min.I2, mxI = st.max.I2, mnQ = st.min.Q, mxQ = st.max.Q, mnT = st.min.tau2, mxT = st.max.tau2;
      var zero = st.zeroI2, tpos = st.tau2Positive, count = st.n;
      var totE = st.sum.est, totI = st.sum.I2, totQ = st.sum.Q, totT = st.sum.tau2;
      for (var H = from; H < to; H++) {
        var sE = 0, sI = 0, sQ = 0, sT = 0;
        for (var L = H === 0 ? 1 : 0; L < Lsize; L++) {
          fitOne(H, L);
          var est = out[0], I2 = out[1];
          var be = Math.floor((est - x0) * qxScale); if (be < 0) be = 0; else if (be >= QBINS) be = QBINS - 1;
          var bi = -1;
          if (I2 !== 0) { bi = Math.floor(I2 * qyScale); if (bi < 0) bi = 0; else if (bi >= QBINS) bi = QBINS - 1; }
          if (mode === 1) {
            var se_ = slotE[be]; if (se_ >= 0) bufE[se_][fillE[se_]++] = est;
            if (bi >= 0) { var si_ = slotI[bi]; if (si_ >= 0) bufI[si_][fillI[si_]++] = I2; }
            continue;
          }
          var Q = out[2], tau2 = out[3];
          sE += est; sI += I2; sQ += Q; sT += tau2;
          accLe[L] += est; accLi[L] += I2;
          if (est < mnE) mnE = est; if (est > mxE) mxE = est;
          if (I2 < mnI) mnI = I2; if (I2 > mxI) mxI = I2;
          if (Q < mnQ) mnQ = Q; if (Q > mxQ) mxQ = Q;
          if (tau2 < mnT) mnT = tau2; if (tau2 > mxT) mxT = tau2;
          if (tau2 > 0) tpos++;
          var ix = Math.floor((est - x0) * gxScale); if (ix < 0) ix = 0; else if (ix >= GX) ix = GX - 1;
          var iy = Math.floor(I2 * gyScale); if (iy < 0) iy = 0; else if (iy >= GY) iy = GY - 1;
          grid[iy * GX + ix]++;
          qE[be]++;
          if (bi < 0) zero++; else qI[bi]++;
          count++;
        }
        if (mode === 1) continue;
        accHe[H] = sE; accHi[H] = sI;
        totE += sE; totI += sI; totQ += sQ; totT += sT;
      }
      if (mode === 1) return;
      st.sum.est = totE; st.sum.I2 = totI; st.sum.Q = totQ; st.sum.tau2 = totT;
      st.min.est = mnE; st.max.est = mxE; st.min.I2 = mnI; st.max.I2 = mxI; st.min.Q = mnQ; st.max.Q = mxQ; st.min.tau2 = mnT; st.max.tau2 = mxT;
      st.zeroI2 = zero; st.tau2Positive = tpos; st.n = count;
    }
    function mainPass(from, to) { sweep(from, to, 0); }

    // ---- exact quantiles (Type 7) by histogram + collection pass ----
    var quantilePlan = null;
    function orderStats(N) {
      var ranks = [];
      [0.25, 0.5, 0.75].forEach(function (p) {
        var hh = (N - 1) * p, lo = Math.floor(hh);
        ranks.push(lo); if (lo + 1 < N) ranks.push(lo + 1);
      });
      return ranks.filter(function (r, i, a) { return a.indexOf(r) === i; });
    }
    function locate(hist, below, ranks) {
      // rank -> {bin, offset}: offset is the 0-based rank within the bin; bin -1 means the rank falls in the
      // separately counted exact zeros (I2) below the histogram.
      var res = {}, cum = below, b = 0;
      var sorted = ranks.slice().sort(function (a, z) { return a - z; });
      for (var r = 0; r < sorted.length; r++) {
        var rank = sorted[r];
        if (rank < below) { res[rank] = { bin: -1, offset: rank }; continue; }
        while (b < hist.length && cum + hist[b] <= rank) { cum += hist[b]; b++; }
        res[rank] = { bin: b, offset: rank - cum };
      }
      return res;
    }
    function planQuantiles() {
      var N = st.n, ranks = orderStats(N);
      var locE = locate(st.qEst, 0, ranks), locI = locate(st.qI2, st.zeroI2, ranks);
      slotE = new Int32Array(QBINS).fill(-1); slotI = new Int32Array(QBINS).fill(-1);
      bufE = []; bufI = []; var binsE = [], binsI = [], cnt = 0;
      ranks.forEach(function (r) {
        var b = locE[r].bin;
        if (b >= 0 && slotE[b] < 0) { slotE[b] = binsE.length; binsE.push(b); cnt += st.qEst[b]; }
        b = locI[r].bin;
        if (b >= 0 && slotI[b] < 0) { slotI[b] = binsI.length; binsI.push(b); cnt += st.qI2[b]; }
      });
      if (cnt > COLLECT_CAP) throw new Error('quantile collection would exceed ' + COLLECT_CAP + ' values');
      bufE = binsE.map(function (b) { return new Float64Array(st.qEst[b]); });
      bufI = binsI.map(function (b) { return new Float64Array(st.qI2[b]); });
      fillE = new Int32Array(bufE.length); fillI = new Int32Array(bufI.length);
      quantilePlan = { ranks: ranks, locE: locE, locI: locI, binsE: binsE, binsI: binsI };
      return quantilePlan;
    }
    function collectPass(from, to) { sweep(from, to, 1); }
    function finishQuantiles() {
      var P = quantilePlan, N = st.n;
      bufE.forEach(function (a, i) { if (fillE[i] !== a.length) throw new Error('quantile bin count mismatch'); a.sort(); });
      bufI.forEach(function (a, i) { if (fillI[i] !== a.length) throw new Error('quantile bin count mismatch'); a.sort(); });
      function stat(loc, slot, buf, r) {
        var l = loc[r];
        if (l.bin < 0) return 0; // exact-zero I2 block
        return buf[slot[l.bin]][l.offset];
      }
      function q7(loc, slot, buf, p) {
        if (N === 1) return stat(loc, slot, buf, 0);
        var hh = (N - 1) * p, lo = Math.floor(hh), frac = hh - lo;
        var a = stat(loc, slot, buf, lo);
        if (lo + 1 >= N) return a;
        var b = stat(loc, slot, buf, lo + 1);
        return a + frac * (b - a);
      }
      return {
        q25_est: q7(P.locE, slotE, bufE, 0.25), median_est: q7(P.locE, slotE, bufE, 0.5), q75_est: q7(P.locE, slotE, bufE, 0.75),
        q25_i2: q7(P.locI, slotI, bufI, 0.25), median_i2: q7(P.locI, slotI, bufI, 0.5), q75_i2: q7(P.locI, slotI, bufI, 0.75)
      };
    }

    function perStudy() {
      var rows = [], half = Math.pow(2, k - 1);
      for (var s = 0; s < k; s++) {
        var acc = s < m ? st.accL : st.accH, bit = s < m ? (1 << s) : (1 << (s - m)), size = s < m ? LT.size : HT.size;
        var wE = 0, wI = 0, oE = 0, oI = 0;
        for (var x = 0; x < size; x++) {
          if (x & bit) { wE += acc.est[x]; wI += acc.I2[x]; } else { oE += acc.est[x]; oI += acc.I2[x]; }
        }
        var withN = half, withoutN = half - 1;
        var row = { study: s + 1, with_n: withN, without_n: withoutN,
          with_mean: wE / withN, with_i2: wI / withN,
          without_mean: withoutN ? oE / withoutN : NaN, without_i2: withoutN ? oI / withoutN : NaN };
        row.diff_mean = row.with_mean - row.without_mean; row.diff_i2 = row.with_i2 - row.without_i2;
        rows.push(row);
      }
      return rows;
    }

    function summary(quant) {
      var N = st.n, gridCounts = Array.prototype.slice.call(st.grid);
      var res = {
        _schema: 'gosh-exact-v1', k: k, model: model, exact: true, n_subsets: N, expected_subsets: total,
        mean_est: st.sum.est / N, min_est: st.min.est, max_est: st.max.est,
        mean_i2: st.sum.I2 / N, min_i2: st.min.I2, max_i2: st.max.I2,
        mean_q: st.sum.Q / N, min_q: st.min.Q, max_q: st.max.Q,
        zero_i2: st.zeroI2,
        grid: { nx: GX, ny: GY, x0: x0, x1: x1, y0: 0, y1: 100, counts: gridCounts },
        per_study: perStudy()
      };
      if (isDL) { res.mean_tau2 = st.sum.tau2 / N; res.min_tau2 = st.min.tau2; res.max_tau2 = st.max.tau2; res.tau2_positive = st.tau2Positive; }
      if (quant) Object.keys(quant).forEach(function (q) { res[q] = quant[q]; });
      return res;
    }

    return {
      k: k, model: model, highCount: HT.size, lowCount: LT.size, state: st,
      mainPass: mainPass, planQuantiles: planQuantiles, collectPass: collectPass, finishQuantiles: finishQuantiles,
      summary: summary, fit: function (mask) { var L = mask & (LT.size - 1), H = Math.floor(mask / LT.size); fitOne(H, L); return Array.prototype.slice.call(out); }
    };
  }

  // Synchronous full run (node tests, worker). onProgress(fraction) is called between high-mask chunks; shouldCancel()
  // returning true aborts with an Error('cancelled').
  function run(te, se, model, options) {
    options = options || {};
    var e = createEngine(te, se, model, options), Hn = e.highCount;
    var passes = options.quantiles === false ? 1 : 2;
    var chunk = Math.max(1, Math.floor(Hn / 200));
    function loop(fn, passIndex) {
      for (var H = 0; H < Hn; H += chunk) {
        if (options.shouldCancel && options.shouldCancel()) throw new Error('cancelled');
        fn(H, Math.min(Hn, H + chunk));
        if (options.onProgress) options.onProgress((passIndex + Math.min(Hn, H + chunk) / Hn) / passes);
      }
    }
    var t0 = Date.now();
    loop(e.mainPass, 0);
    var t1 = Date.now();
    if (e.state.n !== e.state.total) throw new Error('enumerated ' + e.state.n + ' of ' + e.state.total + ' subsets');
    var quant = null;
    if (passes === 2) { e.planQuantiles(); loop(e.collectPass, 1); quant = e.finishQuantiles(); }
    var res = e.summary(quant);
    res.timing = { main_ms: t1 - t0, quantile_ms: Date.now() - t1 };
    return res;
  }

  var api = { createEngine: createEngine, run: run, LOW_MAX: LOW_MAX, QBINS: QBINS, MAX_K: MAX_K, version: 1 };

  // Worker protocol: {cmd:'run', id, te, se, model, quantiles} -> {type:'progress', id, fraction} ... {type:'done', id, result}
  // or {type:'error', id, message}. Cancellation is Worker.terminate() from the page.
  var isWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
  if (isWorker) {
    self.onmessage = function (ev) {
      var d = ev.data || {};
      if (d.cmd !== 'run') return;
      var last = 0;
      try {
        var result = run(d.te, d.se, d.model, {
          quantiles: d.quantiles !== false, gridX: d.gridX, gridY: d.gridY,
          onProgress: function (f) { var now = Date.now(); if (now - last > 100 || f === 1) { last = now; self.postMessage({ type: 'progress', id: d.id, fraction: f }); } }
        });
        self.postMessage({ type: 'done', id: d.id, result: result });
      } catch (err) {
        self.postMessage({ type: 'error', id: d.id, message: String(err && err.message || err) });
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!isWorker && root) root.AlmGoshExactEngine = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
