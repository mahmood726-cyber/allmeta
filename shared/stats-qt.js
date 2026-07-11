/* shared/stats-qt.js — accurate inverse-Student-t (qt) for the browser.
 *
 * Hill's algorithm (1970, Comm. ACM 13(10):619-620) — closed-form
 * approximation accurate to ≤ 1e-6 for df ≥ 2, used by Numerical Recipes
 * and R's pt/qt implementation. No external dependencies.
 *
 * Replaces the old lookup-table fallback (df ∈ [1, 30] only, z=1.96 above)
 * which silently introduced ~4% error for k>31 in HKSJ CIs. Per
 * advanced-stats.md "HKSJ df: Use qt(alpha/2, k-1) NOT qnorm".
 *
 * Use:
 *   AlmStats.qt(0.975, 28)  →  2.048407
 *   AlmStats.qnorm(0.975)   →  1.959963984540054
 */
(function (global) {
  "use strict";

  // ----- qnorm via Beasley-Springer-Moro (Wichura AS241 short form) -------
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      // AS241 central region: r = 0.180625 − q²  (0.180625 = 0.425²). Using
      // r = q² here silently returned wrong quantiles for central p∈(0.075,0.925)
      // — e.g. qnorm(0.90) gave 1.025 instead of 1.281552. Tails (|q|>0.425,
      // incl. the common 0.975→1.96) were unaffected, which masked the bug.
      var r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
        / (((((((5226.495278852854561 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    var rr = q < 0 ? p : 1 - p;
    var u = Math.sqrt(-Math.log(rr));
    var z;
    if (u <= 5) {
      u -= 1.6;
      z = (((((((0.00077454501427834140764 * u + 0.0227238449892691845833) * u + 0.24178072517745061177) * u + 1.27045825245236838258) * u + 3.64784832476320460504) * u + 5.7694972214606914055) * u + 4.6303378461565452959) * u + 1.42343711074968357734)
        / (((((((1.05075007164441684324e-9 * u + 0.0005475938084995344946) * u + 0.0151986665636164571966) * u + 0.14810397642748007459) * u + 0.68976733498510000455) * u + 1.6763848301838038494) * u + 2.05319162663775882187) * u + 1);
    } else {
      u -= 5;
      z = (((((((2.01033439929228813265e-7 * u + 0.0000271155556874348757815) * u + 0.0012426609473880784386) * u + 0.026532189526576123093) * u + 0.29656057182850489123) * u + 1.7848265399172913358) * u + 5.4637849111641143699) * u + 6.6579046435011037772)
        / (((((((2.04426310338993978564e-15 * u + 1.4215117583164458887e-7) * u + 1.8463183175100546818e-5) * u + 0.0007868691311456132591) * u + 0.0148753612908506148525) * u + 0.13692988092273580531) * u + 0.59983220655588793769) * u + 1);
    }
    return q < 0 ? -z : z;
  }

  // ----- pt (Student-t CDF) via incomplete beta -------------------------
  function _logGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, t = x + 5.5;
    t -= (x + 0.5) * Math.log(t);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
    return -t + Math.log(2.5066282746310005 * ser / x);
  }
  function _betacf(a, b, x) {
    var MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function _ibeta(a, b, x) {
    if (x === 0) return 0;
    if (x === 1) return 1;
    var bt = Math.exp(_logGamma(a + b) - _logGamma(a) - _logGamma(b)
                       + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * _betacf(a, b, x) / a;
    return 1 - bt * _betacf(b, a, 1 - x) / b;
  }
  function pt(t, df) {
    // Two-sided expression via incomplete beta: P(T ≤ t) for t real.
    if (df <= 0) return NaN;
    if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
    var x = df / (df + t * t);
    var p = 0.5 * _ibeta(df / 2, 0.5, x);
    return t > 0 ? 1 - p : p;
  }

  // ----- qt via Hill (1970) -----------------------------------------------
  function qt(p, df) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    if (df < 1) return NaN;
    if (df === 1) return Math.tan(Math.PI * (p - 0.5));
    if (df === 2) {
      var alpha = 4 * p * (1 - p);
      return Math.sign(2 * p - 1) * Math.sqrt(2 / alpha - 2);
    }

    // Hill's algorithm — translated from R's qt.c (AS 396), good to ~1e-6
    // for df ≥ 2. Refines via Newton step against pt for high precision.
    var a = 1 / (df - 0.5);
    var b = 48 / (a * a);
    var c = ((20700 * a / b - 98) * a - 16) * a + 96.36;
    var d = ((94.5 / (b + c) - 3) / b + 1) * Math.sqrt(a * Math.PI * 0.5) * df;
    var x = d * (1 - 2 * p > 0 ? 1 - 2 * p : 2 * p - 1);
    var y = Math.pow(x, 2 / df);
    if (y > 0.05 + a) {
      var z = qnorm(0.5 + (p > 0.5 ? 0.5 - p : p - 0.5));   // |qnorm(p) for symmetric|
      // For p > 0.5 we want |z| of the (1-p) tail since the above expression
      // yields the negative branch; mirror at the end.
      z = Math.abs(qnorm(p));
      y = z * z;
      if (df < 5) c = c + 0.3 * (df - 4.5) * (z + 0.6);
      c = (((0.05 * d * z - 5) * z - 7) * z - 2) * z + b + c;
      y = (((((0.4 * y + 6.3) * y + 36) * y + 94.5) / c - y - 3) / b + 1) * z;
      y = a * y * y;
      y = y > 0.002 ? Math.exp(y) - 1 : 0.5 * y * y + y;
    } else {
      y = ((1 / (((df + 6) / (df * y) - 0.089 * d - 0.822) * (df + 2) * 3) + 0.5 / (df + 4)) * y - 1)
          * (df + 1) / (df + 2) + 1 / y;
    }
    var target = p > 0.5 ? p : 1 - p;    // upper-tail prob in (0.5, 1)
    var t0 = Math.sqrt(df * y);
    if (!(t0 > 0) || !isFinite(t0)) t0 = Math.abs(qnorm(target));
    // Safeguarded Newton-bisection on the monotone pt(.,df). A bare Hill+single-
    // Newton step overshoots catastrophically at small df / extreme tails (the
    // step is unbounded when the density is tiny), so keep a bracket [lo,hi] and
    // fall back to bisection whenever a Newton step would leave it. Always
    // converges; standard cases still hit ~1e-13 in a few iterations.
    var lo = 0, hi = t0 > 1 ? t0 : 1;
    while (pt(hi, df) < target && hi < 1e15) hi *= 2;
    var t = (t0 > lo && t0 < hi) ? t0 : 0.5 * (lo + hi);
    for (var _i = 0; _i < 80; _i++) {
      var f = pt(t, df) - target;
      if (f > 0) hi = t; else lo = t;
      var dens = Math.exp(_logGamma((df + 1) / 2) - _logGamma(df / 2)
                          - 0.5 * Math.log(df * Math.PI)
                          - ((df + 1) / 2) * Math.log(1 + t * t / df));
      var tn = dens > 1e-300 ? t - f / dens : NaN;
      if (!(tn > lo && tn < hi) || !isFinite(tn)) tn = 0.5 * (lo + hi);    // bisect
      if (Math.abs(tn - t) <= 1e-13 * (Math.abs(t) + 1e-13)) { t = tn; break; }
      t = tn;
    }
    return p > 0.5 ? t : -t;
  }

  // ----- pchisq / qchisq via incomplete gamma -----------------------------
  function _gammaln(x) { return _logGamma(x); }
  function _gammap(a, x) {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 0;
    if (x < a + 1) {
      // series
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 1; n <= 200; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 3e-7) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - _gammaln(a));
    } else {
      // continued fraction (1 - Q)
      var FPMIN = 1e-30;
      var bp = x + 1 - a, c = 1 / FPMIN, d = 1 / bp, h = d;
      for (var i = 1; i <= 200; i++) {
        var an = -i * (i - a);
        bp += 2;
        d = an * d + bp; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = bp + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        var delc = d * c; h *= delc;
        if (Math.abs(delc - 1) < 3e-7) break;
      }
      return 1 - Math.exp(-x + a * Math.log(x) - _gammaln(a)) * h;
    }
  }
  function pchisq(x, df) { return _gammap(df / 2, x / 2); }

  var api = { qnorm: qnorm, qt: qt, pt: pt, pchisq: pchisq };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmStats = api;
})(typeof window !== "undefined" ? window : globalThis);
