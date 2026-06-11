/* experimental-ma.js — EXPERIMENTAL meta-analysis estimators ported from the
 * user's own method repos. These are research methods, NOT established/validated
 * pooling — surface them only behind an explicit "experimental" label.
 *
 *   GRMA       — Grey Relational Meta-Analysis with a redescending (Tukey-bisquare)
 *                effect guard. Robust, outlier-downweighting point estimate.
 *                Ported from grma/grey_meta_v8.py (GRMA._core), verified to 1e-6.
 *   conformalPI— distribution-free conformal prediction interval for the next
 *                study's effect (guaranteed marginal coverage, no normality
 *                assumption). Ported from conformal-ma/pipeline.py, verified to 1e-6.
 *
 * All operate on standard arrays: yi (effects, analysis scale), vi (variances) or
 * sei (standard errors). Pure closed-form — no solver, no network.
 */
(function (global) {
  "use strict";

  // numpy-compatible linear-interpolation quantile (q in [0,1]).
  function quantile(arr, q) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var n = a.length; if (n === 1) return a[0];
    var idx = q * (n - 1), lo = Math.floor(idx), frac = idx - lo;
    if (lo + 1 >= n) return a[n - 1];
    return a[lo] + (a[lo + 1] - a[lo]) * frac;
  }
  function median(arr) { return quantile(arr, 0.5); }
  function clip01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  // ---- GRMA: grey-relational robust pool with Tukey-bisquare effect guard ----
  function grma(yi, vi, opts) {
    opts = opts || {};
    var zeta = opts.zeta || 0.5, precCap = opts.precCap || 1e6, tukeyC = opts.tukeyC || 4.685;
    var n = yi.length;
    if (n < 2) return null;
    var prec = vi.map(function (v) { return Math.min(1 / v, precCap); });
    var logPrec = prec.map(function (p) { return Math.log(p + 1); });
    function fit(x) { var lo = quantile(x, 0.05), hi = quantile(x, 0.95), rng = hi - lo; return [lo, rng >= 1e-12 ? rng : 1.0]; }
    var fe = fit(yi), fp = fit(logPrec);
    var effLo = fe[0], effRng = fe[1], preLo = fp[0], preRng = fp[1];
    var xEff = yi.map(function (y) { return clip01((y - effLo) / effRng); });
    var xPre = logPrec.map(function (p) { return clip01((p - preLo) / preRng); });
    var aY = median(yi), aP = Math.max.apply(null, prec);
    var aEff = clip01((aY - effLo) / effRng), aPre = clip01((Math.log(aP + 1) - preLo) / preRng);
    var dE = xEff.map(function (x) { return Math.abs(x - aEff); });
    var dP = xPre.map(function (x) { return Math.abs(x - aPre); });
    var all = dE.concat(dP), dMin = Math.min.apply(null, all), dMax = Math.max.apply(null, all);
    var grade;
    if (dMax < 1e-15) { grade = yi.map(function () { return 1; }); }
    else {
      grade = dE.map(function (de, i) {
        var ge = (dMin + zeta * dMax) / (de + zeta * dMax);
        var gp = (dMin + zeta * dMax) / (dP[i] + zeta * dMax);
        return (ge + gp) / 2;
      });
    }
    var mad = median(yi.map(function (y) { return Math.abs(y - aY); })); if (mad < 1e-12) mad = 1e-12;
    var raw = grade.map(function (g, i) {
      var u = Math.abs(yi[i] - aY) / mad;
      var h = u < tukeyC ? Math.pow(1 - Math.pow(u / tukeyC, 2), 2) : 0;
      return g * h;
    });
    var sw = raw.reduce(function (a, b) { return a + b; }, 0);
    var w = sw >= 1e-15 ? raw.map(function (r) { return r / sw; }) : raw.map(function () { return 1 / n; });
    var est = w.reduce(function (acc, wi, i) { return acc + wi * yi[i]; }, 0);
    return { estimate: est, weights: w };
  }

  // ---- Conformal prediction interval (distribution-free) ----
  function conformalPI(yi, sei, alpha) {
    alpha = alpha || 0.05;
    var k = yi.length;
    if (k < 4) return null;
    function dl(ys, ss, dfAdjust) {
      var wi = ss.map(function (s) { return 1 / (s * s); });
      var sw = wi.reduce(function (a, b) { return a + b; }, 0);
      var tfe = ys.reduce(function (a, y, i) { return a + wi[i] * y; }, 0) / sw;
      var Q = ys.reduce(function (a, y, i) { return a + wi[i] * (y - tfe) * (y - tfe); }, 0);
      var sw2 = wi.reduce(function (a, b) { return a + b * b; }, 0);
      var C = sw - sw2 / sw;
      var tau2 = C > 0 ? Math.max(0, (Q - dfAdjust) / C) : 0;
      var ws = ss.map(function (s) { return 1 / (s * s + tau2); });
      var sws = ws.reduce(function (a, b) { return a + b; }, 0);
      var theta = ys.reduce(function (a, y, i) { return a + ws[i] * y; }, 0) / sws;
      return { theta: theta, tau2: tau2 };
    }
    var scores = [];
    for (var i = 0; i < k; i++) {
      var yl = yi.filter(function (_, j) { return j !== i; });
      var sl = sei.filter(function (_, j) { return j !== i; });
      var loo = dl(yl, sl, k - 2);   // df = (k-1) - 1
      scores.push(Math.abs(yi[i] - loo.theta) / Math.sqrt(sei[i] * sei[i] + loo.tau2));
    }
    var ql = Math.min(Math.ceil((1 - alpha) * (k + 1)) / k, 1.0);
    var thr = quantile(scores, ql);
    var full = dl(yi, sei, k - 1);
    var seNew = median(sei), sp = Math.sqrt(seNew * seNew + full.tau2);
    return { theta: full.theta, lo: full.theta - thr * sp, hi: full.theta + thr * sp, threshold: thr, tau2: full.tau2 };
  }

  // ---- Student-t CDF (regularized incomplete beta, Numerical Recipes) ----
  function _gammaln(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y++; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function _betacf(a, b, x) {
    var FPMIN = 1e-300, EPS = 3e-12, qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d;
    for (var m = 1; m <= 300; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function _betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(_gammaln(a + b) - _gammaln(a) - _gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b;
  }
  function tcdf(t, df) {
    var p = 0.5 * _betai(df / 2, 0.5, df / (df + t * t));
    return t > 0 ? 1 - p : p;
  }

  // ---- Spec-collapse: honestly combine S analysis specifications of ONE dataset.
  // Mixture-of-scaled-t (df=k-1); CI from the mixture quantiles (law of total
  // variance) so it is NEVER narrower than a single spec — unlike naive IV-RE
  // pooling, which collapses the CI by ~S. Ported from spec_collapse/aggregators.py. ----
  function specCollapse(specs, cl) {
    cl = cl || 0.95;
    var n = specs.length; if (n < 2) return null;
    var p = specs.map(function () { return 1 / n; });
    var th = specs.map(function (s) { return s.theta; });
    var sd = specs.map(function (s) { return Math.sqrt(s.var); });
    var dfs = specs.map(function (s) { return Math.max(1, (s.k | 0) - 1); });
    var mean = 0; for (var i = 0; i < n; i++) mean += p[i] * th[i];
    var within = 0, between = 0;
    for (i = 0; i < n; i++) {
      var df = dfs[i], scale = df > 2 ? df / (df - 2) : 1.0;
      within += p[i] * specs[i].var * scale;
      between += p[i] * (th[i] - mean) * (th[i] - mean);
    }
    var alpha = (1 - cl) / 2;
    function mixcdf(x) { var s = 0; for (var j = 0; j < n; j++) s += p[j] * tcdf((x - th[j]) / sd[j], dfs[j]); return s; }
    var maxsd = Math.max.apply(null, sd), tmin = Math.min.apply(null, th), tmax = Math.max.apply(null, th);
    var pad = maxsd * 400 + 10, lo0 = tmin - pad, hi0 = tmax + pad;
    function solve(target) {
      var a = lo0, b = hi0;
      for (var it = 0; it < 200; it++) {
        var mid = (a + b) / 2, f = mixcdf(mid) - target;
        if (Math.abs(f) < 1e-12 || (b - a) < 1e-10) return mid;
        if (f < 0) a = mid; else b = mid;
      }
      return (a + b) / 2;
    }
    var lo = solve(alpha), hi = solve(1 - alpha);
    return { theta: mean, withinVar: within, betweenVar: between, totalVar: within + between,
      ciLo: lo, ciHi: hi, verdict: (lo > 0 || hi < 0) ? "robust" : "fragile", k: n };
  }

  var api = { grma: grma, conformalPI: conformalPI, specCollapse: specCollapse, tcdf: tcdf, _quantile: quantile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ExperimentalMA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
