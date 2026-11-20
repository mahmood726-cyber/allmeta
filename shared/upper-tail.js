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
 * relative error < 1e-12 on every grid point (measured max 1.5e-13). Large degrees of freedom (df 150 .. 1e10,
 * chi-square shapes to 5e7, F df2 to 1e7; fixrev2 check against R): relative error < 1e-10 for t with df <= 1e6
 * (measured max 7.3e-11, F with df2 = 1e7). KNOWN LIMIT: Student t with df >= 1e8 -- the beta argument
 * x = df / (df + t^2) rounds within 1e-16 of 1 and the continued fraction sees only x -- relative error up to
 * 3e-9 at df = 1e8 and 7e-7 at df = 1e10 (R's TOMS 708 bgrat avoids this). No dependencies; works as a classic
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

  // log Gamma(1 + a) for |a| <= 0.5 by its Taylor series -gamma*a + sum_k zeta(k) (-a)^k / k,
  // so that a tiny shape keeps relative precision (Lanczos gives only ~1e-16 absolute here).
  var ZETA = [0, 0, 1.6449340668482264, 1.2020569031595943, 1.0823232337111382, 1.0369277551433699,
    1.0173430619844491, 1.0083492773819228, 1.0040773561979443, 1.0020083928260822];
  function zeta(k) {
    if (k < ZETA.length) return ZETA[k];
    var s = 1;
    for (var n = 2; n <= 60; n++) { var t = Math.pow(n, -k); s += t; if (t < 1e-18) break; }
    return s;
  }
  function lgamma1p(a) {
    var s = -0.5772156649015329 * a, p = -a;
    for (var k = 2; k < 400; k++) {
      p *= -a;
      var t = zeta(k) * p / k;
      s += t;
      if (Math.abs(t) <= 1e-17 * Math.abs(s)) break;
    }
    return s;
  }
  // log(sqrt(2 pi) Gamma(n + 1) / (n^(n + 1/2) e^-n)) (Stirling error) and the deviance term
  // bd0(x, np) = x log(x / np) + np - x, both as Loader (2000) / R's stirlerr.c and bd0.c, so that the
  // prefactors x^a e^-x / Gamma(a) and x^a y^b / B(a, b) keep relative precision when a and x are large.
  // (Reconciled with lane ipdmore 2a30d893: same stirlerr, bd0, prefactor and iteration cap.)
  function stirlerr(n) {
    if (n <= 15) return lgamma(n + 1) - (n + 0.5) * Math.log(n) + n - 0.9189385332046728;
    var nn = n * n, S0 = 1 / 12, S1 = 1 / 360, S2 = 1 / 1260, S3 = 1 / 1680, S4 = 1 / 1188;
    if (n > 500) return (S0 - S1 / nn) / n;
    if (n > 80) return (S0 - (S1 - S2 / nn) / nn) / n;
    if (n > 35) return (S0 - (S1 - (S2 - S3 / nn) / nn) / nn) / n;
    return (S0 - (S1 - (S2 - (S3 - S4 / nn) / nn) / nn) / nn) / n;
  }
  function bd0(x, np) {
    if (Math.abs(x - np) < 0.1 * (x + np)) {
      var v = (x - np) / (x + np), s = (x - np) * v;
      var ej = 2 * x * v; v = v * v;
      for (var j = 1; j < 1000; j++) {
        ej *= v; var s1 = s + ej / (2 * j + 1);
        if (s1 === s) return s1;
        s = s1;
      }
    }
    return x * Math.log(x / np) + np - x;
  }
  // Series and continued fractions need O(sqrt(shape)) terms near the mean; capped at 2e6 (beyond: NaN).
  function maxIter(a) { return Math.min(MAXIT + Math.ceil(20 * Math.sqrt(a)), 2e6); }

  // Regularized gamma: returns [P(a,x), Q(a,x)], each computed in the form that
  // keeps relative precision (series for P when x < a + 1, continued fraction for Q otherwise;
  // for a < 0.5 on the series side Q is computed directly, since there it can be tiny).
  // A series or fraction that fails to converge returns NaN rather than an unconverged value.
  function gammaPQ(a, x) {
    if (!(a > 0) || isNaN(x)) return [NaN, NaN];
    if (x <= 0) return [0, 1];
    if (x === Infinity) return [1, 0];
    // For a >= 100 the prefactor is sqrt(a / (2 pi)) exp(-stirlerr(a) - bd0(a, x)) instead of
    // exp(-x + a log x - lgamma(a)), whose terms cancel to ~1e-16 * a log a.
    var pre = a >= 100 ? Math.sqrt(a / (2 * Math.PI)) * Math.exp(-stirlerr(a) - bd0(a, x))
                       : Math.exp(-x + a * Math.log(x) - lgamma(a));
    var lim = maxIter(a), ok = false;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < lim; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) { ok = true; break; }
      }
      if (!ok) return [NaN, NaN];
      var P = sum * pre;
      if (a < 0.5) return [P, smallShapeQ(a, x)];
      return [P, 1 - P];
    }
    // Lentz continued fraction for Q(a,x)
    var b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (var i = 1; i < lim; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < EPS) { ok = true; break; }
    }
    if (!ok) return [NaN, NaN];
    var Q = pre * h;
    return [1 - Q, Q];
  }
  // Q(a,x) for 0 < a < 0.5, 0 < x < a + 1, without forming 1 - P:
  //   Q = -expm1(u) - e^u * a * T,  u = a log x - log Gamma(1 + a),  T = sum_{n>=1} (-x)^n / (n! (a + n)).
  function smallShapeQ(a, x) {
    var u = a * Math.log(x) - lgamma1p(a), T = 0, term = 1;
    for (var n = 1; n < MAXIT; n++) {
      term *= -x / n;
      var t = term / (a + n);
      T += t;
      if (Math.abs(t) < Math.abs(T) * EPS) break;
    }
    return -Math.expm1(u) - Math.exp(u) * a * T;
  }

  // Continued fraction for the incomplete beta (Numerical Recipes betacf, modified Lentz). Like the gamma
  // routines it needs O(sqrt(a + b)) terms near the mean, and returns NaN rather than an unconverged value.
  function betacf(a, b, x) {
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, lim = maxIter(a + b);
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= lim; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < EPS) return h;
    }
    return NaN;
  }

  // lgamma(A + s) - lgamma(A) for A >= 100 by Stirling, so the two ~A log A terms never cancel.
  function lgammaRatio(A, s) {
    return (A - 0.5) * Math.log1p(s / A) + s * Math.log(A + s) - s + stirlerr(A + s) - stirlerr(A);
  }
  // log of x^a y^b / B(a, b). Below 100 for both shapes this is the plain Lanczos form; above, the
  // lgamma terms (absolute error ~1e-16 * a log a) are replaced by Stirling forms, and when both shapes are
  // large the whole expression is -bd0(a, n x) - bd0(b, n y) + log sqrt(a b / (2 pi n)) - stirlerr terms
  // (x + y = 1), which keeps relative precision for df in the millions.
  function logBetaPrefactor(a, b, x, y, lx, ly) {
    var big = Math.max(a, b), small = Math.min(a, b);
    if (big < 100) return lgamma(a + b) - lgamma(a) - lgamma(b) + a * lx + b * ly;
    if (small < 100) return lgammaRatio(big, small) - lgamma(small) + a * lx + b * ly;
    var n = a + b;
    if (!(x > 0 && y > 0)) return a * lx + b * ly + 0.5 * Math.log(a * b / (2 * Math.PI * n)) +
      a * Math.log(n / a) + b * Math.log(n / b) - stirlerr(a) - stirlerr(b) + stirlerr(n);
    return -bd0(a, n * x) - bd0(b, n * y) + 0.5 * Math.log(a * b / (2 * Math.PI * n)) - stirlerr(a) - stirlerr(b) + stirlerr(n);
  }

  // I_x(a,b) where the caller supplies x, y = 1 - x and their logs separately, so
  // neither x nor 1 - x is ever formed by subtraction (and x may underflow to 0
  // while lx stays finite). Returns the regularized incomplete beta I_x(a,b).
  function ibetaXY(a, b, x, y, lx, ly) {
    if (x <= 0 && !(lx > -Infinity)) return 0;
    if (y <= 0 && !(ly > -Infinity)) return 1;
    var lbt = logBetaPrefactor(a, b, x, y, lx, ly);
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(a, b, x) / a;
    return 1 - Math.exp(lbt) * betacf(b, a, y) / b;
  }

  function pgammaUpper(x, shape) { return gammaPQ(shape, x)[1]; }
  function pchisqUpper(x, df) {
    // df = 0 is the point mass at 0, as R: pchisq(x, 0, lower.tail = FALSE) = 0 for x > 0, 1 for x <= 0
    if (!(df >= 0) || isNaN(x)) return NaN;
    if (x <= 0) return 1;
    if (df === 0) return 0;
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
    if (df === Infinity) return pnormUpper(t);
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
      // log x = -log1p(1 / r2): log(r2) - log1p(r2) cancels when r2 is large (df >> t^2), and a * log x then
      // carries an absolute error ~1e-16 * a * log r2 (rel 1.5e-7 at pt(3, 1e8)).
      lx = r2 > 1 ? -Math.log1p(1 / r2) : Math.log(r2) - Math.log1p(r2); ly = -Math.log1p(r2);
    }
    var half = 0.5 * ibetaXY(df / 2, 0.5, x, y, lx, ly);   // P(T > |t|)
    return t > 0 ? half : 1 - half;
  }
  // P(F > f) for F(df1, df2).
  function pfUpper(f, df1, df2) {
    if (!(df1 > 0) || !(df2 > 0) || isNaN(f)) return NaN;
    if (f <= 0) return 1;
    if (f === Infinity) return 0;
    // infinite degrees of freedom, in R's order (pf.c): df1 = Inf first, then df2 = Inf
    if (df1 === Infinity) {
      if (df2 === Infinity) return f < 1 ? 1 : f === 1 ? 0.5 : 0;
      return gammaPQ(df2 / 2, df2 / (2 * f))[0];   // pchisq(df2 / f, df2, lower.tail = TRUE)
    }
    if (df2 === Infinity) return pchisqUpper(f * df1, df1);
    // P(F > f) = I_x(df2/2, df1/2), x = df2 / (df2 + df1 f), y = df1 f / (df2 + df1 f)
    var u = df1 * f / df2;           // y / x
    var x, y, lx, ly;
    if (u > 1e300) { lx = -Math.log(u); ly = 0; x = Math.exp(lx); y = 1; }
    else { x = 1 / (1 + u); y = u / (1 + u); lx = -Math.log1p(u); ly = u > 1 ? -Math.log1p(1 / u) : Math.log(u) - Math.log1p(u); }
    return ibetaXY(df2 / 2, df1 / 2, x, y, lx, ly);
  }
  function p2norm(z) { return isNaN(z) ? NaN : Math.min(1, 2 * pnormUpper(Math.abs(z))); }
  function p2t(t, df) { return isNaN(t) ? NaN : Math.min(1, 2 * ptUpper(Math.abs(t), df)); }

  var api = { pnormUpper: pnormUpper, pchisqUpper: pchisqUpper, ptUpper: ptUpper, pfUpper: pfUpper,
    pgammaUpper: pgammaUpper, p2norm: p2norm, p2t: p2t, _lgamma: lgamma, _gammaPQ: gammaPQ, _ibetaXY: ibetaXY, _logBetaPrefactor: logBetaPrefactor, _betacf: betacf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTail = api;
})(typeof window !== "undefined" ? window : globalThis);
