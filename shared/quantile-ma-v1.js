/* shared/quantile-ma-v1.js — quantile meta-analysis (HTE across the outcome).
 *
 * Integrated from the IPD-QMA project. A single pooled mean difference hides
 * WHO benefits: the treatment effect can differ at the low vs high end of the
 * outcome distribution. Two-stage quantile meta-analysis: stage 1 (done per
 * trial, off-tool) is quantile regression giving a Quantile Treatment Effect
 * (QTE) per quantile τ; stage 2 (here) random-effects pools the QTE at each τ
 * across trials and tests whether the QTE PROFILE is flat (constant effect) via
 * a multivariate Wald test on adjacent-difference contrasts (χ²_{q−1}).
 *
 * Reuses the audited AlmMaCore.pool (DL random effects) per quantile. The Wald
 * test uses a diagonal cross-quantile covariance (the aggregate tool doesn't
 * see the IPD cross-quantile correlation); since adjacent quantiles are usually
 * positively correlated, this OVER-states the contrast variance, so the test is
 * CONSERVATIVE — a significant non-flat result is robust, a null is not definitive.
 *
 * Pure + dual-mode. Browser global: window.AlmQuantileMA.
 *
 * Input: { quantiles:[τ…], studies:[{label, est:[…], se:[…]}] } aligned to quantiles.
 */
(function (global) {
  "use strict";

  function _gammp(a, x) {                       // regularised lower incomplete gamma P(a,x)
    if (x <= 0) return 0;
    if (x < a + 1) {                            // series
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < 200; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
      return sum * Math.exp(-x + a * Math.log(x) - _gln(a));
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;             // continued fraction
    for (var i = 1; i < 200; i++) {
      var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - _gln(a)) * h;
  }
  function _gln(z) {
    var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var x = z, tmp = z + 5.5; tmp -= (z + 0.5) * Math.log(tmp); var ser = 1.000000000190015, j;
    for (j = 0; j < 6; j++) { x += 1; ser += g[j] / x; }
    return -tmp + Math.log(2.5066282746310005 * ser / z);
  }
  function chi2sf(x, k) { return x <= 0 ? 1 : 1 - _gammp(k / 2, x / 2); }

  // invert a small symmetric positive-definite matrix (Gauss-Jordan).
  function _inv(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (!(Math.abs(A[p][c]) > 0)) return null;
      var t = A[c]; A[c] = A[p]; A[p] = t;
      var piv = A[c][c]; for (var k = 0; k < 2 * n; k++) A[c][k] /= piv;
      for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = A[r2][c]; for (var k2 = 0; k2 < 2 * n; k2++) A[r2][k2] -= f * A[c][k2]; }
    }
    return A.map(function (row) { return row.slice(n); });
  }

  function analyze(input) {
    input = input || {};
    var qs = input.quantiles || [];
    var studies = input.studies || [];
    if (!global.AlmMaCore) return { ok: false, error: "AlmMaCore (pooling engine) not loaded" };
    if (qs.length < 2) return { ok: false, error: "need ≥2 quantiles" };
    if (studies.length < 2) return { ok: false, error: "need ≥2 studies" };

    var profile = qs.map(function (q, j) {
      var yi = [], vi = [];
      studies.forEach(function (s) {
        var e = (s.est || [])[j], se = (s.se || [])[j];
        if (isFinite(e) && isFinite(se) && se > 0) { yi.push(e); vi.push(se * se); }
      });
      if (yi.length < 1) return { q: q, est: null, se: null, k: 0 };
      var p = global.AlmMaCore.pool(yi, vi, { method: "DL" });
      return { q: q, est: p.mu, se: p.se, ciLo: p.ciLo, ciHi: p.ciHi, tau2: p.tau2, i2: p.I2, k: yi.length };
    });

    var usable = profile.filter(function (r) { return r.est != null && isFinite(r.se) && r.se > 0; });
    var wald = null;
    if (usable.length >= 2) {
      var theta = usable.map(function (r) { return r.est; });
      var V = usable.map(function (r) { return r.se * r.se; });
      var q = theta.length, m = q - 1;
      var d = []; for (var a = 0; a < m; a++) d.push(theta[a + 1] - theta[a]);   // adjacent diffs
      var M = []; for (var aa = 0; aa < m; aa++) { M[aa] = []; for (var bb = 0; bb < m; bb++) M[aa][bb] = 0; }
      for (aa = 0; aa < m; aa++) {
        M[aa][aa] = V[aa] + V[aa + 1];
        if (aa + 1 < m) { M[aa][aa + 1] = -V[aa + 1]; M[aa + 1][aa] = -V[aa + 1]; }
      }
      var Mi = _inv(M);
      if (Mi) {
        var W = 0;
        for (aa = 0; aa < m; aa++) for (bb = 0; bb < m; bb++) W += d[aa] * Mi[aa][bb] * d[bb];
        wald = { statistic: W, df: m, p: chi2sf(W, m) };
      }
    }

    var hte = wald && wald.p < 0.05;
    var verdict = !wald
      ? "Not enough pooled quantiles to test the profile."
      : hte
        ? "HTE detected: the QTE profile is NOT flat (Wald χ²=" + wald.statistic.toFixed(2) + ", df=" + wald.df + ", p=" + wald.p.toFixed(4) + ") — the treatment effect varies across the outcome distribution; a single pooled effect masks who benefits. (Conservative test: a positive result is robust.)"
        : "No evidence of HTE across quantiles (Wald χ²=" + wald.statistic.toFixed(2) + ", p=" + wald.p.toFixed(4) + ") — the QTE profile is consistent with a constant effect (but the diagonal-covariance test is conservative, so this is not proof of homogeneity).";

    return { ok: true, profile: profile, wald: wald, hte: hte, verdict: verdict };
  }

  var api = { analyze: analyze, _chi2sf: chi2sf, _inv: _inv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmQuantileMA = api;
})(typeof window !== "undefined" ? window : globalThis);
