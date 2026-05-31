/* shared/heterogeneity-ci.js — Q-profile 95% CI for I² and τ² (Viechtbauer 2007).
 *
 * The method metafor::confint.rma.uni uses, and what advanced-stats.md prescribes for
 * small k. Profiles the generalised Q-statistic Q_gen(τ²) = Σ wᵢ(τ²)(yᵢ−μ̂(τ²))²
 * (monotone decreasing in τ²) against the χ²_{k−1} quantiles, then maps the τ² bounds
 * to I² via the Higgins-Thompson typical within-study variance s².
 *
 * Verified vs metafor::confint(rma(method="DL")) to within metafor's own uniroot
 * tolerance (exact on τ², ≤0.05pp on the I² mapping):
 *   k=8 yi=c(.10,.30,.50,.20,.90,.40,1.10,.05) sei=c(.20,.25,.18,.30,.22,.28,.35,.15)
 *     → metafor τ² CI [0.0038, 0.5144], I² CI [7.09, 91.25]
 *     → this module τ² CI [0.0038, 0.5144], I² CI [7.12, 91.25]
 *   homogeneous data clamps the lower bounds to τ²=0 / I²=0%.
 *
 * Single source of truth for the Q-profile CI shown by heterogeneity, forest-plot,
 * workbench, … (previously duplicated). Pure JS — runs in the browser (window.AlmHetCI)
 * and Node (module.exports). Input: studies = [{est, v}] or [{est, se}].
 */
(function (global) {
  "use strict";

  function _lnGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6];
    var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    var s = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y++; s += c[j] / y; }
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function _lowerIncGamma(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      var sum = 1 / a, term = sum;
      for (var n = 1; n < 300; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-14) break; }
      return sum * Math.exp(-x + a * Math.log(x) - _lnGamma(a));
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (var i = 1; i < 300; i++) {
      var an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - _lnGamma(a)) * h;
  }
  function chiSqCDF(x, df) { return x <= 0 ? 0 : _lowerIncGamma(df / 2, x / 2); }
  function chiSqQuantile(p, df) {
    var lo = 0, hi = df + 10 * Math.sqrt(2 * df) + 10, guard = 0;
    while (chiSqCDF(hi, df) < p && guard++ < 100) hi *= 2;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (chiSqCDF(m, df) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  function _v(s) { return (s.v != null) ? s.v : (s.se * s.se); }

  // Generalised Q at a given τ².
  function _genQ(studies, t2) {
    var sw = 0, swy = 0, i;
    for (i = 0; i < studies.length; i++) { var w = 1 / (_v(studies[i]) + t2); sw += w; swy += w * studies[i].est; }
    var mu = swy / sw, Q = 0;
    for (i = 0; i < studies.length; i++) { var w2 = 1 / (_v(studies[i]) + t2); Q += w2 * (studies[i].est - mu) * (studies[i].est - mu); }
    return Q;
  }

  // 95% Q-profile CI for τ² and I². Returns {tau2Lo, tau2Hi, I2Lo, I2Hi, s2} or null (k<2).
  function qProfileCI(studies, alpha) {
    alpha = alpha || 0.05;
    var k = studies.length, df = k - 1;
    if (df < 1) return null;
    var w0 = studies.map(function (s) { return 1 / _v(s); });
    var sw0 = w0.reduce(function (a, b) { return a + b; }, 0);
    var sw0sq = w0.reduce(function (a, b) { return a + b * b; }, 0);
    var s2 = (k - 1) * sw0 / (sw0 * sw0 - sw0sq); // Higgins-Thompson typical within-study variance
    var Q0 = _genQ(studies, 0);
    var qLo = chiSqQuantile(alpha / 2, df);       // small target → large τ² (upper bound)
    var qHi = chiSqQuantile(1 - alpha / 2, df);   // large target → small τ² (lower bound)
    function solve(target) {
      if (Q0 <= target) return 0;
      var lo = 0, hi = 1, guard = 0;
      while (_genQ(studies, hi) > target && guard++ < 200) { hi *= 2; if (hi > 1e9) break; }
      for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (_genQ(studies, m) > target) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    var tau2Hi = solve(qLo), tau2Lo = solve(qHi);
    var i2 = function (t) { return (t + s2) > 0 ? 100 * t / (t + s2) : 0; };
    return { tau2Lo: tau2Lo, tau2Hi: tau2Hi, I2Lo: i2(tau2Lo), I2Hi: i2(tau2Hi), s2: s2 };
  }

  var api = { qProfileCI: qProfileCI, chiSqCDF: chiSqCDF, chiSqQuantile: chiSqQuantile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmHetCI = api;
})(typeof window !== "undefined" ? window : globalThis);
