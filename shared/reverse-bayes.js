/*
 * shared/reverse-bayes.js — Reverse-Bayes "Analysis of Credibility" (AnCred).
 *
 * Closed-form reverse-Bayes robustness assessment of a pooled effect on its
 * analysis (log) scale, under the same normal approximation the rest of the
 * suite uses for pooling. Sits alongside evalue / spec-collapse / fragility as
 * a robustness-sensitivity tool.
 *
 *   Input: thetaHat (point estimate), s (standard error), alpha (two-sided).
 *
 * (1) Matthews (2018, R Soc Open Sci 5:171047) sceptical prior / critical
 *     prior interval — the LEAST-informative sceptic prior N(0, tauS^2) whose
 *     posterior (1-alpha) credible interval JUST touches zero. Combining the
 *     N(0,tauS^2) prior with the N(thetaHat, s^2) likelihood, the posterior is
 *     N(muPost, sPost^2) with muPost = thetaHat·tauS^2/(s^2+tauS^2) and
 *     sPost^2 = s^2 tauS^2/(s^2+tauS^2). Requiring muPost = za·sPost and solving:
 *         tauS^2 = za^2 s^4 / (thetaHat^2 - za^2 s^2),   za = Phi^{-1}(1-alpha/2).
 *     Exists (tauS^2 > 0) iff |thetaHat| > za·s, i.e. the finding is significant.
 *     A SMALL tauS (narrow critical-prior interval) => robust: a sceptic needs an
 *     implausibly sharp prior at 0 to overturn it. A large tauS => fragile.
 *
 * (2) Held (2019, R Soc Open Sci 6:181534) intrinsic credibility. Using the
 *     critical sceptical prior above, the prior-predictive of thetaHat is
 *     N(0, tauS^2 + s^2); its two-sided z is zpp = sqrt(z^2 - za^2) (algebra
 *     below). The finding is intrinsically credible at level alpha iff that
 *     predictive result is itself significant, zpp >= za, i.e.
 *         |z| >= zI := sqrt(2)·za.
 *     For alpha=0.05, zI = sqrt(2)·1.959964 = 2.77164, two-sided pI = 0.005610.
 *     Sceptical p-value pS = 2(1 - Phi(|z|/sqrt(2))); pS = alpha exactly at |z|=zI.
 *
 * Derivation of tauS^2 + s^2 = s^2·thetaHat^2/(thetaHat^2 - za^2 s^2), hence
 * |thetaHat|/sqrt(tauS^2+s^2) = sqrt(thetaHat^2 - za^2 s^2)/s = sqrt(z^2 - za^2).
 *
 * All closed form, offline, deterministic — no MCMC.
 */
(function (global) {
  "use strict";

  // --- self-contained standard-normal CDF/quantile via a double-precision erfc.
  // erfccheb: Numerical Recipes 3rd ed. Chebyshev fit, accurate to ~1e-13. ---
  var _COF = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6,
    1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9,
    -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
    8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15,
    -9.4e-17, 1.21e-16, -2.8e-17];
  function _erfccheb(z) { // z >= 0
    var d = 0, dd = 0, t = 2 / (2 + z), ty = 4 * t - 2, tmp;
    for (var j = _COF.length - 1; j > 0; j--) { tmp = d; d = ty * d - dd + _COF[j]; dd = tmp; }
    return t * Math.exp(-z * z + 0.5 * (_COF[0] + ty * d) - dd);
  }
  function _erfc(x) { return x >= 0 ? _erfccheb(x) : 2 - _erfccheb(-x); }
  function _phi(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
  function _Q(z) { return 0.5 * _erfc(z / Math.SQRT2); }   // upper tail 1-Phi(z)
  function _Phi(z) { return 1 - _Q(z); }
  function _twoSidedP(z) { return 2 * _Q(Math.abs(z)); }
  // inverse standard-normal (Acklam) + one Halley step using _Q/_phi
  function _qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, x;
    if (p < pl) { var q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { var q2 = p - 0.5, r = q2 * q2; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q2 / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { var q3 = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q3 + c[1]) * q3 + c[2]) * q3 + c[3]) * q3 + c[4]) * q3 + c[5]) / ((((d[0] * q3 + d[1]) * q3 + d[2]) * q3 + d[3]) * q3 + 1); }
    // Halley refinement
    var e = (x < 0 ? _Q(-x) : 1 - _Q(x)) - p;
    var u = e / _phi(x);
    x = x - u / (1 + x * u / 2);
    return x;
  }

  // Main: analyse a pooled estimate (thetaHat) with standard error s.
  function analyze(thetaHat, s, opts) {
    opts = opts || {};
    var alpha = (opts.alpha != null) ? opts.alpha : 0.05;
    if (!(s > 0) || !isFinite(thetaHat)) return { error: "need finite thetaHat and s>0" };
    var za = _qnorm(1 - alpha / 2);          // significance critical value
    var z95 = 1.959963984540054;             // for the prior's own 95% interval
    var z = thetaHat / s;
    var pObs = _twoSidedP(z);
    var significant = Math.abs(z) > za;

    var out = {
      thetaHat: thetaHat, se: s, alpha: alpha, z: z, pObs: pObs,
      za: za, significant: significant,
    };

    // (1) Matthews sceptical (critical) prior — only exists if significant.
    if (significant) {
      var tauS2 = (za * za * Math.pow(s, 4)) / (thetaHat * thetaHat - za * za * s * s);
      var tauS = Math.sqrt(tauS2);
      out.sceptical = {
        exists: true,
        priorSD: tauS,
        priorVar: tauS2,
        // the sceptical prior's own 95% interval (centred at 0)
        priorInterval95: [-z95 * tauS, z95 * tauS],
        // relative sharpness: prior SD as a fraction of the point estimate
        priorSDoverEffect: tauS / Math.abs(thetaHat),
      };
    } else {
      out.sceptical = { exists: false, message: "no sceptical prior exists — result is not significant at alpha, already fragile" };
    }

    // (2) Held intrinsic credibility.
    var zI = Math.SQRT2 * za;
    var pS = 2 * _Q(Math.abs(z) / Math.SQRT2);   // sceptical (intrinsic) p-value
    out.intrinsic = {
      zLimit: zI,
      pLimit: _twoSidedP(zI),                    // two-sided intrinsic-credibility threshold
      scepticalP: pS,
      credible: Math.abs(z) >= zI,
      // prior-predictive z at the critical sceptical prior (undefined if not significant)
      predictiveZ: significant ? Math.sqrt(Math.max(0, z * z - za * za)) : null,
    };

    out.statement = _statement(out);
    return out;
  }

  function _statement(o) {
    if (!o.significant) {
      return "The pooled effect is not significant at the " + (100 * (1 - o.alpha)).toFixed(0) +
        "% level (two-sided p=" + o.pObs.toPrecision(3) + "); no sceptical prior is needed to overturn it.";
    }
    var pct = (o.sceptical.priorSDoverEffect * 100).toFixed(0);
    var cred = o.intrinsic.credible
      ? "It IS intrinsically credible (|z|=" + Math.abs(o.z).toFixed(2) + " ≥ " + o.intrinsic.zLimit.toFixed(2) +
        "): significant even against a prior derived from the finding itself."
      : "It is NOT intrinsically credible (|z|=" + Math.abs(o.z).toFixed(2) + " < " + o.intrinsic.zLimit.toFixed(2) +
        ", sceptical p=" + o.intrinsic.scepticalP.toPrecision(3) + "): a like-sized sceptic would not be convinced.";
    return "To overturn this result a sceptic must hold, before seeing the data, a prior centred on no effect with 95% interval within ±" +
      Math.abs(o.sceptical.priorInterval95[1]).toPrecision(3) + " (SD ≈ " + (o.sceptical.priorSDoverEffect * 100 < 1000 ? pct + "% of the effect" : "≪ the effect") +
      "). " + cred;
  }

  var api = { analyze: analyze, _Phi: _Phi, _Q: _Q, _qnorm: _qnorm, _twoSidedP: _twoSidedP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmReverseBayes = api;
})(typeof window !== "undefined" ? window : globalThis);
