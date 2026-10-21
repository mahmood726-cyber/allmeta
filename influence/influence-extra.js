/* Influence v2 helpers: full-model / leave-one-out summary statistics and accurate tails.
 * Pure functions; no DOM. Used by influence/index.html (summary line, LOO columns, exclusion re-pool)
 * and influence/r-script.js. Does not change any value computed by shared/ma-core.js.
 *
 * Definitions follow metafor::rma.uni for an intercept-only model with test="z":
 *   z = mu/se, p = 2*P(Z > |z|), CI = mu -/+ qnorm(.975)*se,
 *   s2 = (k-1)*sum(w)/(sum(w)^2 - sum(w^2)) with w = 1/vi ("typical" within-study variance),
 *   I2 = 100*tau2/(s2+tau2), H2 = tau2/s2 + 1, Qp = P(chi2_{k-1} > Q).
 */
(function (global) {
  'use strict';
  var Z975 = 1.959963984540054;
  var LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    var a = LANCZOS[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Regularized upper incomplete gamma Q(a, x) (series for x < a+1, Lentz continued fraction otherwise).
  function gammaQ(a, x) {
    if (!(a > 0) || !(x >= 0) || !Number.isFinite(x)) return x === Infinity ? 0 : NaN;
    if (x === 0) return 1;
    var gln = lgamma(a), n, sum, del, ap;
    if (x < a + 1) {
      ap = a; sum = del = 1 / a;
      for (n = 0; n < 100000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    var tiny = 1e-300, b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d, an;
    for (n = 1; n < 100000; n++) {
      an = -n * (n - a); b += 2;
      d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-17) break;
    }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  }

  function pnormUpper(z) { // P(Z > z)
    if (!Number.isFinite(z)) return z === Infinity ? 0 : (z === -Infinity ? 1 : NaN);
    var q = 0.5 * gammaQ(0.5, z * z / 2);
    return z >= 0 ? q : 1 - q;
  }
  function pchisqUpper(x, df) { return df > 0 ? gammaQ(df / 2, x / 2) : null; }

  // p: pooled object {mu, seMu, tau2, Q, df}; vi: sampling variances of the same studies.
  function summarize(p, vi) {
    var k = vi.length, sw = 0, sw2 = 0;
    for (var i = 0; i < k; i++) { var w = 1 / vi[i]; sw += w; sw2 += w * w; }
    var s2 = k > 1 ? (k - 1) * sw / (sw * sw - sw2) : null;
    var z = p.mu / p.seMu;
    return {
      k: k, z: z, p: 2 * pnormUpper(Math.abs(z)),
      ciLo: p.mu - Z975 * p.seMu, ciHi: p.mu + Z975 * p.seMu,
      I2: s2 === null ? null : 100 * p.tau2 / (s2 + p.tau2),
      H2: s2 === null ? null : p.tau2 / s2 + 1,
      Qp: p.df > 0 ? pchisqUpper(p.Q, p.df) : null
    };
  }

  var api = { Z975: Z975, lgamma: lgamma, gammaQ: gammaQ, pnormUpper: pnormUpper, pchisqUpper: pchisqUpper, summarize: summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.AlmInfluenceExtra = api;
})(typeof window !== 'undefined' ? window : globalThis);
