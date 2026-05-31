/* shared/permutest.js — permutation test for a meta-regression slope.
 *
 * Robust significance test for a single moderator when k is small and the normal/t
 * reference is unreliable (Higgins-Thompson 2004; the metafor::permutest idea):
 * permute the moderator across studies, refit, and rank the observed test statistic
 * among the permutation distribution. Exact (enumerate all k! permutations) for small
 * k; Monte-Carlo (fixed, deterministic permutations) otherwise.
 *
 * Matches metafor::permutest on a model fit with method="PM", test="knha": each
 * permutation refits the PM meta-regression and recomputes the HKSJ t-statistic for the
 * slope; p = #{|t_perm| ≥ |t_obs|} / nperm (the observed/identity permutation included).
 *
 * Verified vs metafor::permutest(rma(method="PM", test="knha"), exact=TRUE).
 * Reference: Higgins JPT, Thompson SG (2004), Stat Med 23:1663-1682.
 */
(function (global) {
  "use strict";

  function _fit(yi, vi, xi, tau2) {
    var sw = 0, swx = 0, swxx = 0, swy = 0, swxy = 0, n = yi.length;
    for (var i = 0; i < n; i++) { var w = 1 / (vi[i] + tau2); sw += w; swx += w * xi[i]; swxx += w * xi[i] * xi[i]; swy += w * yi[i]; swxy += w * xi[i] * yi[i]; }
    var det = sw * swxx - swx * swx;
    if (!(det > 0)) return null;
    var b0 = (swxx * swy - swx * swxy) / det, b1 = (sw * swxy - swx * swy) / det, rss = 0;
    for (var j = 0; j < n; j++) { var w2 = 1 / (vi[j] + tau2); var r = yi[j] - b0 - b1 * xi[j]; rss += w2 * r * r; }
    return { b0: b0, b1: b1, rss: rss, sw: sw, swx: swx, swxx: swxx, det: det };
  }
  function _tau2PM(yi, vi, xi) {
    var k = yi.length, target = k - 2;
    if (k < 3) return 0;
    var f0 = _fit(yi, vi, xi, 0); if (!f0 || f0.rss <= target) return 0;
    var lo = 0, hi = 1, g = 0;
    while (g++ < 80) { var fh = _fit(yi, vi, xi, hi); if (!fh || fh.rss <= target) break; hi *= 2; if (hi > 1e9) break; }
    for (var i = 0; i < 100; i++) { var m = (lo + hi) / 2; var fm = _fit(yi, vi, xi, m); if (!fm) break; if (fm.rss > target) lo = m; else hi = m; if (hi - lo < 1e-12) break; }
    return (lo + hi) / 2;
  }
  // HKSJ slope t-statistic for the meta-regression (PM τ², q floored at 1).
  function _slopeT(yi, vi, xi) {
    var k = yi.length, tau2 = _tau2PM(yi, vi, xi), f = _fit(yi, vi, xi, tau2);
    if (!f) return null;
    var q = Math.max(1, f.rss / (k - 2));
    var varB1 = q * f.sw / f.det;
    return varB1 > 0 ? f.b1 / Math.sqrt(varB1) : 0;
  }

  // Heap's algorithm: call cb on each permutation of arr (in place).
  function _permute(arr, cb) {
    var n = arr.length, c = new Array(n).fill(0), i = 0;
    cb(arr);
    while (i < n) {
      if (c[i] < i) {
        var s = (i % 2 === 0) ? 0 : c[i];
        var t = arr[s]; arr[s] = arr[i]; arr[i] = t;
        cb(arr); c[i]++; i = 0;
      } else { c[i] = 0; i++; }
    }
  }
  // Deterministic LCG for Monte-Carlo permutations (no Math.random → reproducible).
  function _shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }

  // permTestSlope(yi, vi, xi, {exactMax, nperm, seed}) → {p, tObs, nperm, exact}
  function permTestSlope(yi, vi, xi, opts) {
    opts = opts || {};
    var k = yi.length;
    var tObs = _slopeT(yi, vi, xi);
    if (tObs == null) return { p: NaN, tObs: NaN, nperm: 0, exact: false };
    var aTObs = Math.abs(tObs) - 1e-10;
    var ge = 0, total = 0;
    var exactMax = opts.exactMax || 8; // k! permutations (8! = 40320)
    if (k <= exactMax) {
      _permute(xi.slice(), function (perm) {
        var t = _slopeT(yi, vi, perm);
        if (t != null) { total++; if (Math.abs(t) >= aTObs) ge++; }
      });
      return { p: ge / total, tObs: tObs, nperm: total, exact: true };
    }
    // Monte-Carlo with a fixed seed (includes the observed permutation).
    var nperm = opts.nperm || 5000, seed = opts.seed || 12345;
    var st = seed >>> 0; var rng = function () { st = (1103515245 * st + 12345) >>> 0; return st / 4294967296; };
    total = 1; ge = 1; // observed
    var base = xi.slice();
    for (var p = 1; p < nperm; p++) { var perm = base.slice(); _shuffle(perm, rng); var t = _slopeT(yi, vi, perm); if (t != null) { total++; if (Math.abs(t) >= aTObs) ge++; } }
    return { p: ge / total, tObs: tObs, nperm: total, exact: false };
  }

  var api = { permTestSlope: permTestSlope, _slopeT: _slopeT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmPermTest = api;
})(typeof window !== "undefined" ? window : globalThis);
