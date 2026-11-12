/* shared/transportability-v1.js — transport a meta-analytic effect to a target
 * population via effect-modifier standardisation.
 *
 * Standard meta-analysis answers "what was the average effect ACROSS the
 * trials". Transportability answers "what effect should we expect in OUR
 * population", when an effect modifier (e.g. baseline risk, mean age, % with
 * diabetes) differs between the trials and the target. This is an aggregate,
 * IPD-free, one-covariate version of the ML-NMR / one-step-NMR transport idea:
 * fit a random-effects meta-regression on the modifier, then PREDICT the mean
 * effect at the target population's modifier value, propagating uncertainty.
 *
 * No mainstream systematic-review tool offers transport — it is a frontier
 * generalisability method. It is also strongly assumption-laden, so this module
 * also returns an unmeasured-modifier sensitivity (how much residual modifier
 * shift would nullify the transported effect) and the caller MUST surface the
 * transport assumptions. τ² is Paule-Mandel (not DL — k is usually < 10), CIs
 * are Knapp-Hartung t_{k-2} with the HKSJ q = max(1, RSS/(k-2)) floor, matching
 * the meta-regression app's conventions.
 *
 * Pure + dual-mode (node-testable; needs shared/ma-core.js for the t-quantile).
 * Browser global: window.AlmTransport.
 *
 * Inputs: studies [{est, se, x}] on the ANALYSIS scale (log for ratios);
 *         target = the target population's modifier value x*.
 */
(function (global) {
  "use strict";

  function qt(p, df) {
    if (global.AlmMaCore && global.AlmMaCore._qt) return global.AlmMaCore._qt(p, df);
    // crude fallback (normal) — only hit if ma-core is absent
    var z = Math.sqrt(2) * _erfinv(2 * p - 1); return z;
  }
  function _erfinv(x) { var a = 0.147, ln = Math.log(1 - x * x), t = 2 / (Math.PI * a) + ln / 2; return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t); }

  // 2x2 weighted normal equations for y ~ 1 + x with weights w.
  function _fit(y, x, w) {
    var s00 = 0, s01 = 0, s11 = 0, t0 = 0, t1 = 0, i;
    for (i = 0; i < y.length; i++) {
      s00 += w[i]; s01 += w[i] * x[i]; s11 += w[i] * x[i] * x[i];
      t0 += w[i] * y[i]; t1 += w[i] * x[i] * y[i];
    }
    var det = s00 * s11 - s01 * s01;
    if (!(Math.abs(det) > 0)) return null;                 // collinear x (all equal) — no slope identifiable
    var inv = [[s11 / det, -s01 / det], [-s01 / det, s00 / det]]; // (XᵀWX)⁻¹
    var b0 = inv[0][0] * t0 + inv[0][1] * t1;
    var b1 = inv[1][0] * t0 + inv[1][1] * t1;
    return { beta: [b0, b1], cov: inv };
  }
  function _rss(y, x, w, beta) {
    var r = 0, i; for (i = 0; i < y.length; i++) { var e = y[i] - (beta[0] + beta[1] * x[i]); r += w[i] * e * e; } return r;
  }

  // Paule-Mandel residual τ²: find τ² with Σ w_i(τ²)·resid² = k - 2.
  function _tau2PM(y, x, se2) {
    var k = y.length, dfree = k - 2;
    if (dfree < 1) return 0;
    function rssAt(t2) {
      var w = se2.map(function (v) { return 1 / (v + t2); });
      var f = _fit(y, x, w); if (!f) return null;
      return _rss(y, x, w, f.beta);
    }
    var r0 = rssAt(0); if (r0 == null) return 0;
    if (r0 <= dfree) return 0;                              // no excess residual heterogeneity
    var lo = 0, hi = 1;
    for (var g = 0; g < 60 && rssAt(hi) > dfree; g++) hi *= 2; // bracket
    for (var it = 0; it < 200; it++) {
      var m = (lo + hi) / 2, rm = rssAt(m);
      if (rm == null) break;
      if (rm > dfree) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function transport(input) {
    input = input || {};
    var rows = (input.studies || []).filter(function (s) { return s && isFinite(s.est) && isFinite(s.se) && s.se > 0 && isFinite(s.x); });
    var k = rows.length;
    if (k < 3) return { ok: false, error: "transport needs ≥3 studies with a modifier value" };
    var xs = rows.map(function (s) { return s.x; });
    if (Math.max.apply(null, xs) === Math.min.apply(null, xs)) return { ok: false, error: "the modifier is constant across studies — effect modification is not identifiable" };
    var target = input.target;
    if (!isFinite(target)) return { ok: false, error: "target modifier value (x*) is required" };

    var y = rows.map(function (s) { return s.est; });
    var se2 = rows.map(function (s) { return s.se * s.se; });
    var tau2 = _tau2PM(y, xs, se2);
    var w = se2.map(function (v) { return 1 / (v + tau2); });
    var fit = _fit(y, xs, w);
    if (!fit) return { ok: false, error: "design is singular" };

    var df = k - 2;
    var rss = _rss(y, xs, w, fit.beta);
    var q = Math.max(1, rss / df);                          // HKSJ scaling, floored at 1
    var tcrit = qt(0.975, df);
    var sumw = w.reduce(function (a, b) { return a + b; }, 0);
    var sumwx = 0, i; for (i = 0; i < k; i++) sumwx += w[i] * xs[i];
    var xbar = sumwx / sumw;

    function predict(xstar) {
      var est = fit.beta[0] + fit.beta[1] * xstar;
      var v = q * (fit.cov[0][0] + 2 * xstar * fit.cov[0][1] + xstar * xstar * fit.cov[1][1]);
      var se = Math.sqrt(Math.max(0, v));
      return { x: xstar, est: est, se: se, ciLo: est - tcrit * se, ciHi: est + tcrit * se };
    }

    var slopeSE = Math.sqrt(q * fit.cov[1][1]);
    var tSlope = fit.beta[1] / slopeSE;
    var pSlope = _tsf2(tSlope, df);
    var atTrial = predict(xbar);
    var trans = predict(target);

    // Unmeasured-modifier sensitivity: the residual transported-effect shift
    // that would move the nearer CI bound to the null (analysis scale).
    var nearBound = Math.abs(trans.ciLo) < Math.abs(trans.ciHi) ? trans.ciLo : trans.ciHi;
    var biasToNull = (trans.ciLo > 0 || trans.ciHi < 0) ? Math.abs(nearBound) : 0;

    return {
      ok: true, k: k, tau2: tau2, q: q, df: df, trialMean: xbar,
      slope: { est: fit.beta[1], se: slopeSE, ciLo: fit.beta[1] - tcrit * slopeSE, ciHi: fit.beta[1] + tcrit * slopeSE, t: tSlope, p: pSlope },
      atTrialMean: atTrial,
      transported: trans,
      shift: fit.beta[1] * (target - xbar),
      sensitivity: { biasToNull: biasToNull, significant: biasToNull > 0 }
    };
  }

  // Student-t CDF (regularised incomplete beta) — local so the module is self-contained.
  function _tcdf(t, df) {
    var x = df / (df + t * t), a = df / 2, b = 0.5, ib = _betai(a, b, x);
    return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
  }
  // Two-sided P(|T| > |t|) = I_x(df/2, 1/2), x = df/(df + t^2): the tail itself, so it keeps
  // relative precision where 2 * (1 - tcdf(|t|)) would cancel to 0 (R: 2 * pt(-|t|, df)).
  function _tsf2(t, df) { return _betai(df / 2, 0.5, df / (df + t * t)); }
  function _betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(_gln(a + b) - _gln(a) - _gln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b;
  }
  function _betacf(a, b, x) {
    // P58: converge to double precision (was 3e-7 / 200 iterations, which left slope p-values off by up to ~4e-9)
    var fpmin = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < fpmin) d = fpmin; d = 1 / d; var h = d, m;
    for (m = 1; m <= 300; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < fpmin) d = fpmin; c = 1 + aa / c; if (Math.abs(c) < fpmin) c = fpmin; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < fpmin) d = fpmin; c = 1 + aa / c; if (Math.abs(c) < fpmin) c = fpmin; d = 1 / d; var del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  // log-gamma, Lanczos g = 7, n = 9 (relative error ~1e-15; the previous 6-term version was ~2e-10). z > 0.
  var _LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function _gln(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - _gln(1 - z);
    z -= 1; var x = _LG[0], j;
    for (j = 1; j < 9; j++) x += _LG[j] / (z + j);
    var t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  var api = { transport: transport, _tau2PM: _tau2PM, _fit: _fit, _tcdf: _tcdf, _tsf2: _tsf2 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTransport = api;
})(typeof window !== "undefined" ? window : globalThis);
