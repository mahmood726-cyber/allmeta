/* shared/upper-tail.js -- upper-tail probabilities computed directly, never as 1 - CDF.
 *
 * Why: `1 - cdf(x)` cancels once cdf(x) rounds to 1, i.e. once the true upper tail is
 * below ~1.1e-16, and loses relative accuracy (|err| ~ 1.1e-16 / tail) long before
 * that. A Q-test p-value of 2e-26 was exported as exactly 0 that way. These
 * functions compute the tail itself, so it keeps relative precision down to the
 * double-precision underflow limit (~1e-308), matching R's lower.tail = FALSE.
 *
 *   AlmTail.pnormUpper(z)          == pnorm(z, lower.tail = FALSE)
 *   AlmTail.pchisqUpper(x, df)     == pchisq(x, df, lower.tail = FALSE)
 *   AlmTail.ptUpper(t, df)         == pt(t, df, lower.tail = FALSE)
 *   AlmTail.pfUpper(f, df1, df2)   == pf(f, df1, df2, lower.tail = FALSE)
 *   AlmTail.pgammaUpper(x, shape)  == pgamma(x, shape, lower.tail = FALSE)  (rate 1)
 *   AlmTail.p2norm(z)  two-sided 2 * P(Z > |z|);  AlmTail.p2t(t, df)  two-sided 2 * P(T > |t|)
 *
 * Accuracy (tests/upper-tail.spec.mjs, grid of tails 0.3 .. 1e-300 against R 4.6.0):
 * relative error < 1e-12 on every grid point (measured max 1.5e-13). No dependencies; works as a classic
 * <script> (window.AlmTail) and under Node (module.exports).
 */
(function (global) {
  "use strict";

  // log Gamma, Lanczos (g = 7, n = 9); relative error ~1e-15 for z > 0.
  var LC = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  function lgamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
    z -= 1;
    var x = LC[0];
    for (var i = 1; i < 9; i++) x += LC[i] / (z + i);
    var t = z + 7.5;
    return 0.9189385332046728 + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  var EPS = 1e-15, TINY = 1e-300, MAXIT = 2000;

  // Regularized gamma: returns [P(a,x), Q(a,x)], each computed in the form that
  // keeps relative precision (series for P when x < a + 1, continued fraction for Q otherwise).
  function gammaPQ(a, x) {
    if (!(a > 0) || isNaN(x)) return [NaN, NaN];
    if (x <= 0) return [0, 1];
    if (x === Infinity) return [1, 0];
    var lpre = -x + a * Math.log(x) - lgamma(a);
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < MAXIT; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) break;
      }
      var P = sum * Math.exp(lpre);
      return [P, 1 - P];
    }
    // Lentz continued fraction for Q(a,x)
    var b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (var i = 1; i < MAXIT; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < EPS) break;
    }
    var Q = Math.exp(lpre) * h;
    return [1 - Q, Q];
  }

  // Continued fraction for the incomplete beta (Numerical Recipes betacf, modified Lentz).
  function betacf(a, b, x) {
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < EPS) break;
    }
    return h;
  }

  // I_x(a,b) where the caller supplies x, y = 1 - x and their logs separately, so
  // neither x nor 1 - x is ever formed by subtraction (and x may underflow to 0
  // while lx stays finite). Returns the regularized incomplete beta I_x(a,b).
  function ibetaXY(a, b, x, y, lx, ly) {
    if (x <= 0 && !(lx > -Infinity)) return 0;
    if (y <= 0 && !(ly > -Infinity)) return 1;
    var lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * lx + b * ly;
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(a, b, x) / a;
    return 1 - Math.exp(lbt) * betacf(b, a, y) / b;
  }

  function pgammaUpper(x, shape) { return gammaPQ(shape, x)[1]; }
  function pchisqUpper(x, df) {
    if (!(df > 0) || isNaN(x)) return NaN;
    if (x <= 0) return 1;
    return gammaPQ(df / 2, x / 2)[1];
  }
  function pnormUpper(z) {
    if (isNaN(z)) return NaN;
    if (z === Infinity) return 0;
    if (z === -Infinity) return 1;
    var q = 0.5 * gammaPQ(0.5, 0.5 * z * z)[1];   // P(|Z| > |z|) / 2
    return z >= 0 ? q : 1 - q;
  }
  // P(T > t) for Student t with df degrees of freedom.
  function ptUpper(t, df) {
    if (!(df > 0) || isNaN(t)) return NaN;
    if (t === Infinity) return 0;
    if (t === -Infinity) return 1;
    var at = Math.abs(t);
    if (at === 0) return 0.5;
    // x = df / (df + t^2) = r^2 / (1 + r^2), y = 1 - x = 1 / (1 + r^2), r = sqrt(df) / |t|
    var r = Math.sqrt(df) / at, r2 = r * r;
    var x, y, lx, ly;
    if (r2 < 1e-300 || !(r2 > 0)) {   // r^2 would underflow: work in logs
      lx = 2 * Math.log(r); ly = 0; x = Math.exp(lx); y = 1;
    } else {
      x = r2 / (1 + r2); y = 1 / (1 + r2);
      lx = Math.log(r2) - Math.log1p(r2); ly = -Math.log1p(r2);
    }
    var half = 0.5 * ibetaXY(df / 2, 0.5, x, y, lx, ly);   // P(T > |t|)
    return t > 0 ? half : 1 - half;
  }
  // P(F > f) for F(df1, df2).
  function pfUpper(f, df1, df2) {
    if (!(df1 > 0) || !(df2 > 0) || isNaN(f)) return NaN;
    if (f <= 0) return 1;
    if (f === Infinity) return 0;
    // P(F > f) = I_x(df2/2, df1/2), x = df2 / (df2 + df1 f), y = df1 f / (df2 + df1 f)
    var u = df1 * f / df2;           // y / x
    var x, y, lx, ly;
    if (u > 1e300) { lx = -Math.log(u); ly = 0; x = Math.exp(lx); y = 1; }
    else { x = 1 / (1 + u); y = u / (1 + u); lx = -Math.log1p(u); ly = Math.log(u) - Math.log1p(u); }
    return ibetaXY(df2 / 2, df1 / 2, x, y, lx, ly);
  }
  function p2norm(z) { return isNaN(z) ? NaN : Math.min(1, 2 * pnormUpper(Math.abs(z))); }
  function p2t(t, df) { return isNaN(t) ? NaN : Math.min(1, 2 * ptUpper(Math.abs(t), df)); }

  var api = { pnormUpper: pnormUpper, pchisqUpper: pchisqUpper, ptUpper: ptUpper, pfUpper: pfUpper,
    pgammaUpper: pgammaUpper, p2norm: p2norm, p2t: p2t, _lgamma: lgamma, _gammaPQ: gammaPQ, _ibetaXY: ibetaXY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTail = api;
})(typeof window !== "undefined" ? window : globalThis);
