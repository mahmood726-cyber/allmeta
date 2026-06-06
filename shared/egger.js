/* shared/egger.js — Egger's regression test for small-study effects / funnel
 * asymmetry (Egger et al., BMJ 1997;315:629-634).
 *
 * Classic linear-regression form: regress the standard normal deviate
 * SND_i = y_i/se_i on precision_i = 1/se_i. The INTERCEPT is the bias
 * coefficient; an intercept significantly different from 0 indicates funnel
 * asymmetry. Two-sided t-test on the intercept with df = k - 2.
 *
 * Verified vs R `summary(lm(yi/sei ~ 1/sei))` to ~1e-4: for
 *   yi=c(-.42,-.31,-.55,-.18,-.62,-.27,-.10), sei=c(.18,.20,.25,.15,.30,.17,.12)
 *   intercept=-3.1758 se=0.4881 t=-6.506 df=5 p=0.0013.
 * (see tests/test_egger.py). Low power for k<10; asymmetry has many causes
 * besides reporting bias — use as one input, not a verdict.
 */
(function (global) {
  "use strict";

  // self-contained Student-t CDF (Numerical Recipes betai), no external dep.
  function _lnGamma(z) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6];
    var y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t);
    var s = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y++; s += c[j] / y; }
    return -t + Math.log(2.5066282746310005 * s / z);
  }
  function _betacf(a, b, x) {
    var FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FP) d = FP; d = 1 / d; var h = d;
    for (var m = 1; m <= 200; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP;
      d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break;
    }
    return h;
  }
  function _betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(_lnGamma(a + b) - _lnGamma(a) - _lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b;
  }
  function _tcdf(t, df) {
    var x = df / (df + t * t), ib = 0.5 * _betai(df / 2, 0.5, x);
    return t >= 0 ? 1 - ib : ib;
  }

  // rows: [{y, se}, ...]. Returns {intercept, se, t, df, p, k} or null (k<3).
  function eggerTest(rows) {
    var pts = (rows || []).filter(function (r) { return r && isFinite(r.y) && isFinite(r.se) && r.se > 0; });
    var n = pts.length;
    if (n < 3) return null;
    var x = pts.map(function (r) { return 1 / r.se; });
    var y = pts.map(function (r) { return r.y / r.se; });
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
    var det = n * sxx - sx * sx;
    var b1 = (n * sxy - sx * sy) / det;        // slope
    var b0 = (sy - b1 * sx) / n;               // intercept = bias coefficient
    var rss = 0;
    for (i = 0; i < n; i++) { var e = y[i] - (b0 + b1 * x[i]); rss += e * e; }
    var df = n - 2;
    var s2 = rss / df;
    var seB0 = Math.sqrt(s2 * sxx / det);
    var t = b0 / seB0;
    var p = 2 * (1 - _tcdf(Math.abs(t), df));
    return { intercept: b0, se: seB0, t: t, df: df, p: p, k: n };
  }

  var api = { eggerTest: eggerTest, _tcdf: _tcdf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmEgger = api;
})(typeof window !== "undefined" ? window : globalThis);
