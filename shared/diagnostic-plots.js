/* shared/diagnostic-plots.js — coordinate engines for three standard meta-analysis
 * diagnostic plots, matching metafor exactly:
 *   baujat(yi, vi)  — Baujat et al. (2002): x = contribution to (generalised) Q =
 *                     (yi−μ̂)²/(vi+τ²); y = leave-one-out influence on the pooled
 *                     estimate = (μ̂₍₋ᵢ₎−μ̂)²/se₍₋ᵢ₎². Uses a DL random-effects fit
 *                     (refit without each study for y). Matches metafor::baujat.
 *   labbe(rows)     — L'Abbé plot: per-study control vs treatment event proportions
 *                     (pc, pt) for 2×2 data, plus the pooled-effect reference curve
 *                     (constant OR or RR). Matches metafor::labbe coordinates.
 *   radial(yi, vi)  — Galbraith/radial plot: x = 1/se, z = yi/se; the through-origin
 *                     slope equals the fixed-effect estimate Σ(yi/vi)/Σ(1/vi). A point
 *                     with |z − slope·x| > 2 is a (≈95%) outlier. Matches metafor::radial.
 *
 * Self-contained (inline DL/FE pooling); no external dependency, no network.
 */
(function (global) {
  "use strict";

  function _dl(yi, vi) {
    var k = yi.length, i, sw0 = 0, sw0y = 0, sw0sq = 0;
    for (i = 0; i < k; i++) { var w = 1 / vi[i]; sw0 += w; sw0sq += w * w; sw0y += w * yi[i]; }
    var muFE = sw0y / sw0, Q = 0;
    for (i = 0; i < k; i++) Q += (1 / vi[i]) * (yi[i] - muFE) * (yi[i] - muFE);
    var c = sw0 - sw0sq / sw0, tau2 = c > 0 ? Math.max(0, (Q - (k - 1)) / c) : 0;
    var sw = 0, swy = 0;
    for (i = 0; i < k; i++) { var wr = 1 / (vi[i] + tau2); sw += wr; swy += wr * yi[i]; }
    return { mu: swy / sw, se: Math.sqrt(1 / sw), tau2: tau2, muFE: muFE, Q: Q, k: k };
  }

  // Baujat plot coordinates (RE / DL fit, matching metafor::baujat default for rma DL).
  function baujat(yi, vi) {
    var k = yi.length, fit = _dl(yi, vi), x = [], y = [], i, j;
    for (i = 0; i < k; i++) {
      x.push((yi[i] - fit.mu) * (yi[i] - fit.mu) / (vi[i] + fit.tau2));
      var yLoo = [], vLoo = [];
      for (j = 0; j < k; j++) if (j !== i) { yLoo.push(yi[j]); vLoo.push(vi[j]); }
      var f2 = _dl(yLoo, vLoo);
      y.push((f2.mu - fit.mu) * (f2.mu - fit.mu) / (f2.se * f2.se));
    }
    return { x: x, y: y, mu: fit.mu, tau2: fit.tau2, k: k };
  }

  // L'Abbé plot. rows: {ai (events, treat), bi (non-events, treat), ci (events, ctrl),
  // di (non-events, ctrl)}. measure: "OR" (default) | "RR". Returns per-study (pc, pt)
  // proportions, the pooled log-effect (FE or RE via method), and a reference curve of
  // (pc, pt) implied by holding the pooled effect constant across the control-risk range.
  function labbe(rows, opts) {
    opts = opts || {};
    var measure = opts.measure || "OR", method = opts.method || "FE";
    var pts = [], yi = [], vi = [];
    rows.forEach(function (r) {
      var a = r.ai, b = r.bi, c = r.ci, d = r.di;
      pts.push({ pc: c / (c + d), pt: a / (a + b), n: a + b + c + d });
      // 0.5 correction only if any zero cell (advanced-stats.md), for the effect estimate.
      var aa = a, bb = b, cc = c, dd = d;
      if (a === 0 || b === 0 || c === 0 || d === 0) { aa += 0.5; bb += 0.5; cc += 0.5; dd += 0.5; }
      if (measure === "RR") { yi.push(Math.log((aa / (aa + bb)) / (cc / (cc + dd)))); vi.push(1 / aa - 1 / (aa + bb) + 1 / cc - 1 / (cc + dd)); }
      else { yi.push(Math.log((aa * dd) / (bb * cc))); vi.push(1 / aa + 1 / bb + 1 / cc + 1 / dd); }
    });
    var pooled = method === "FE"
      ? (function () { var sw = 0, swy = 0; for (var i = 0; i < yi.length; i++) { var w = 1 / vi[i]; sw += w; swy += w * yi[i]; } return { logEff: swy / sw }; })()
      : (function () { var f = _dl(yi, vi); return { logEff: f.mu }; })();
    var eff = Math.exp(pooled.logEff);
    var curve = [];
    for (var p = 0.001; p <= 0.999; p += 0.01) {
      var pt = measure === "RR" ? eff * p : (function () { var oc = (p / (1 - p)) * eff; return oc / (1 + oc); })();
      if (pt >= 0 && pt <= 1) curve.push({ pc: p, pt: pt });
    }
    return { points: pts, curve: curve, logEff: pooled.logEff, eff: eff, measure: measure };
  }

  // Radial (Galbraith) plot. Returns per-study (x=1/se, z=yi/se), the FE slope, and the
  // ±2 outlier band (z = slope·x ± 2). Standardised residual = z − slope·x.
  function radial(yi, vi) {
    var k = yi.length, x = [], z = [], sxz = 0, sxx = 0, i;
    for (i = 0; i < k; i++) { var se = Math.sqrt(vi[i]), xi = 1 / se, zi = yi[i] / se; x.push(xi); z.push(zi); sxz += xi * zi; sxx += xi * xi; }
    var slope = sxz / sxx; // = Σ(yi/vi)/Σ(1/vi) = fixed-effect estimate
    var resid = z.map(function (zi, j) { return zi - slope * x[j]; });
    return { x: x, z: z, slope: slope, resid: resid, k: k };
  }

  var api = { baujat: baujat, labbe: labbe, radial: radial, _dl: _dl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDiagPlots = api;
})(typeof window !== "undefined" ? window : globalThis);
