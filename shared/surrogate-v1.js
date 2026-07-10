/* shared/surrogate-v1.js — meta-analytic trial-level surrogate validation.
 *
 * Integrated idea from the glp1-obesity-mbnma surrogate arm (extend_surrogate).
 * Is a treatment's effect on a SURROGATE outcome (e.g. weight loss, HbA1c) a
 * valid stand-in for its effect on the FINAL outcome (e.g. MACE / log-HR)?
 * Trial-level surrogacy regresses the final-outcome effects on the surrogate
 * effects across trials and reports R². Crucially it also returns the
 * ESTIMATION-ERROR-ADJUSTED R² (Daniels-Hughes / van Houwelingen: strip the
 * within-trial sampling variance off the noisy final-effect side) and refuses
 * to report it when there is too little between-trial final-effect signal to
 * estimate it stably — the failure mode a naive R² hides. Plus leave-one-out
 * robustness and a surrogate threshold effect.
 *
 * Pure + dual-mode (node-testable). Browser global: window.AlmSurrogate.
 *
 * Input: pairs [{label, s, f, seF}] — s = surrogate effect, f = final-outcome
 *        effect (e.g. log HR), seF = SE of the final effect (the noisy side).
 */
(function (global) {
  "use strict";

  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function varS(a) { var m = mean(a), n = a.length; return a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (n - 1); }
  function cov(a, b) { var ma = mean(a), mb = mean(b), n = a.length, s = 0; for (var i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb); return s / (n - 1); }
  function _pearson(s, f) { var vs = varS(s), vf = varS(f); return (vs > 0 && vf > 0) ? cov(s, f) / Math.sqrt(vs * vf) : null; }

  // weighted OLS of f ~ 1 + s  (weights w); returns {a,b,cov,sigma2,wrss}
  function _wls(s, f, w) {
    var n = s.length, s00 = 0, s01 = 0, s11 = 0, t0 = 0, t1 = 0, i;
    for (i = 0; i < n; i++) { s00 += w[i]; s01 += w[i] * s[i]; s11 += w[i] * s[i] * s[i]; t0 += w[i] * f[i]; t1 += w[i] * s[i] * f[i]; }
    var det = s00 * s11 - s01 * s01;
    if (!(Math.abs(det) > 0)) return null;
    var inv = [[s11 / det, -s01 / det], [-s01 / det, s00 / det]];
    var a = inv[0][0] * t0 + inv[0][1] * t1, b = inv[1][0] * t0 + inv[1][1] * t1;
    var wrss = 0; for (i = 0; i < n; i++) { var e = f[i] - (a + b * s[i]); wrss += w[i] * e * e; }
    var sigma2 = n > 2 ? wrss / (n - 2) : 0;
    return { a: a, b: b, cov: inv, sigma2: sigma2, wrss: wrss };
  }

  function _naiveR2(s, f, w) {
    var fit = _wls(s, f, w); if (!fit) return { r2: null, fit: null };
    var sw = w.reduce(function (x, y) { return x + y; }, 0), fbar = 0, i;
    for (i = 0; i < f.length; i++) fbar += w[i] * f[i]; fbar /= sw;
    var tot = 0; for (i = 0; i < f.length; i++) tot += w[i] * (f[i] - fbar) * (f[i] - fbar);
    return { r2: tot > 0 ? 1 - fit.wrss / tot : null, fit: fit, fbar: fbar };
  }

  function analyze(input) {
    input = input || {};
    var pairs = (input.pairs || []).filter(function (p) { return p && isFinite(p.s) && isFinite(p.f) && isFinite(p.seF) && p.seF > 0; });
    var k = pairs.length;
    if (k < 3) return { ok: false, error: "trial-level surrogacy needs ≥3 trials with (surrogate, final, SE)" };
    var s = pairs.map(function (p) { return p.s; });
    var f = pairs.map(function (p) { return p.f; });
    var seF = pairs.map(function (p) { return p.seF; });
    var w = seF.map(function (e) { return 1 / (e * e); });

    var nv = _naiveR2(s, f, w);
    var pearson = _pearson(s, f);

    // heterogeneity of the FINAL effects (is there between-trial signal at all?)
    var sw = w.reduce(function (a, b) { return a + b; }, 0), fbarW = 0, i;
    for (i = 0; i < k; i++) fbarW += w[i] * f[i]; fbarW /= sw;
    var Q = 0; for (i = 0; i < k; i++) Q += w[i] * (f[i] - fbarW) * (f[i] - fbarW);
    var dfQ = k - 1, i2 = Q > 0 ? Math.max(0, (Q - dfQ) / Q) : 0;

    // estimation-error-adjusted trial-level R² (strip within-trial variance)
    var varFobs = varS(f), withinF = mean(seF.map(function (e) { return e * e; }));
    var varFadj = varFobs - withinF;
    var degenerate = (Q <= dfQ) || (varFadj <= 0.25 * varFobs) || (varS(s) <= 0);
    var r2adj = null, adjReason = null;
    if (degenerate) {
      adjReason = "after removing within-trial sampling variance, the between-trial variance of the TRUE final effect is ~0 — too little signal (or k too small) to estimate a stable adjusted R²; it would explode/clip at 1.0 and is not interpretable.";
    } else {
      var covSF = cov(s, f);
      r2adj = Math.min(covSF * covSF / (varS(s) * varFadj), 1.0);
    }

    // surrogate threshold effect: surrogate value predicting a null final effect (point)
    var ste = (nv.fit && Math.abs(nv.fit.b) > 1e-12) ? -nv.fit.a / nv.fit.b : null;

    // leave-one-out naive R²
    var loo = pairs.map(function (_, drop) {
      var ss = [], ff = [], ww = [];
      for (var j = 0; j < k; j++) if (j !== drop) { ss.push(s[j]); ff.push(f[j]); ww.push(w[j]); }
      return { left_out: pairs[drop].label || ("trial " + (drop + 1)), r2: _naiveR2(ss, ff, ww).r2 };
    });
    var looVals = loo.map(function (l) { return l.r2; }).filter(function (x) { return x != null && isFinite(x); });
    var looMin = looVals.length ? Math.min.apply(null, looVals) : null;
    var looMax = looVals.length ? Math.max.apply(null, looVals) : null;

    var strong = r2adj != null && r2adj >= 0.7;
    var verdict;
    if (degenerate) verdict = "Surrogacy is UNDETERMINED — the final-outcome effects barely vary across trials (I² " + (i2 * 100).toFixed(0) + "%), so a trial-level R² cannot be estimated. A naive R² of " + (nv.r2 != null ? nv.r2.toFixed(2) : "—") + " here is an artefact, not evidence of surrogacy.";
    else if (strong) verdict = "Adjusted trial-level R² = " + r2adj.toFixed(2) + " — reasonable trial-level surrogacy, but validate the slope is consistent (leave-one-out) and beware small k.";
    else verdict = "Adjusted trial-level R² = " + r2adj.toFixed(2) + " — weak/uncertain surrogacy; the surrogate does not reliably predict the final-outcome effect.";

    return {
      ok: true, k: k,
      slope: nv.fit ? nv.fit.b : null, intercept: nv.fit ? nv.fit.a : null,
      r2_naive: nv.r2, pearson: pearson,
      Q: Q, df: dfQ, i2: i2,
      r2_adj: r2adj, adj_degenerate: degenerate, adj_reason: adjReason,
      ste: ste, loo: loo, loo_min: looMin, loo_max: looMax,
      verdict: verdict
    };
  }

  var api = { analyze: analyze, _wls: _wls };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmSurrogate = api;
})(typeof window !== "undefined" ? window : globalThis);
