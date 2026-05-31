/* shared/ma-core.js — audited single-source meta-analysis core.
 *
 * The canonical, R-verified pooling routines (τ² estimators, inverse-variance
 * random/fixed-effect pool, Hartung-Knapp-Sidik-Jonkman adjustment, Q, I²) that
 * were previously re-implemented per app. Browser (window.AlmMaCore) and Node
 * (module.exports). Inputs are effect sizes yi with sampling variances vi (pool
 * on the analysis scale — logRR/logOR/logHR/SMD — and back-transform in the app).
 *
 * Verified vs metafor::rma to ≤1e-7 on a heterogeneous k=8 dataset
 * (yi=c(.10,.30,.50,.20,.90,.40,1.10,.05) sei=c(.20,.25,.18,.30,.22,.28,.35,.15)):
 *   DL   τ²=0.0734430866 μ=0.4059483675 se=0.1269421050 I²=59.811091
 *   PM   τ²=0.0740705629 μ=0.4061133078 se=0.1272650356 I²=60.015415
 *   REML τ²=0.0712971154 μ=0.4053720468 se=0.1258303793 I²=59.096236
 *   DL+KNHA se=0.1272434242 ;  FE μ=0.3541625626 se=0.0769232414
 * See ma-core-parity.spec.mjs. τ² gotchas (DL bias for k<10, HKSJ floor, t-df)
 * follow advanced-stats.md; the HKSJ floor is OPT-IN (knhaFloor) since metafor
 * does not floor by default.
 *
 * Reference: DerSimonian & Laird 1986; Paule & Mandel 1982; Viechtbauer 2005
 * (REML); Hartung-Knapp 2001 / Sidik-Jonkman 2002; Higgins-Thompson 2002 (I²).
 */
(function (global) {
  "use strict";

  function _wsums(yi, vi, t2) {
    var sw = 0, swy = 0, k = yi.length;
    for (var i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; swy += w * yi[i]; }
    var mu = swy / sw, Q = 0;
    for (var j = 0; j < k; j++) { var w2 = 1 / (vi[j] + t2); Q += w2 * (yi[j] - mu) * (yi[j] - mu); }
    return { sw: sw, mu: mu, Q: Q };
  }

  // DerSimonian-Laird moment estimator (closed form).
  function tau2DL(yi, vi) {
    var k = yi.length; if (k < 2) return 0;
    var w = vi.map(function (v) { return 1 / v; });
    var sw = 0, sw2 = 0, swy = 0;
    for (var i = 0; i < k; i++) { sw += w[i]; sw2 += w[i] * w[i]; swy += w[i] * yi[i]; }
    var muFE = swy / sw, Q = 0;
    for (var j = 0; j < k; j++) Q += w[j] * (yi[j] - muFE) * (yi[j] - muFE);
    var c = sw - sw2 / sw;
    if (c <= 0) return 0;
    return Math.max(0, (Q - (k - 1)) / c);
  }

  // Paule-Mandel: root of generalised Q(τ²) = k-1 (monotone decreasing).
  function tau2PM(yi, vi) {
    var k = yi.length, df = k - 1; if (df < 1) return 0;
    if (_wsums(yi, vi, 0).Q <= df) return 0;
    var lo = 0, hi = 1, guard = 0;
    while (_wsums(yi, vi, hi).Q > df && guard++ < 200) { hi *= 2; if (hi > 1e9) break; }
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (_wsums(yi, vi, m).Q > df) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  // REML: fixed-point iteration of the restricted-likelihood τ² update
  //   τ²_{n+1} = [ Σ w²((y−μ)² − v) + 1/Σw ] / Σ w² ,  w = 1/(v+τ²).
  function tau2REML(yi, vi) {
    var k = yi.length; if (k < 2) return 0;
    var t2 = tau2DL(yi, vi); // warm start
    for (var it = 0; it < 200; it++) {
      var sw = 0, sw2 = 0, swy = 0, i;
      for (i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; sw2 += w * w; swy += w * yi[i]; }
      var mu = swy / sw, num = 0;
      for (i = 0; i < k; i++) { var w2 = 1 / (vi[i] + t2); num += w2 * w2 * ((yi[i] - mu) * (yi[i] - mu) - vi[i]); }
      var next = num / sw2 + 1 / sw; // REML fixed point (Viechtbauer 2005)
      if (next < 0) next = 0;
      if (Math.abs(next - t2) < 1e-12) { t2 = next; break; }
      t2 = next;
    }
    return t2;
  }

  var _T = { DL: tau2DL, PM: tau2PM, REML: tau2REML };

  // Inverse-variance pool. opts: { method:'PM'|'DL'|'REML'|'FE' (default PM),
  //   knha:false, knhaFloor:false, level:0.95, tau2:<override> }.
  // Returns { k, tau2, mu, se, ciLo, ciHi, Q, I2, method, knha }.
  function pool(yi, vi, opts) {
    opts = opts || {};
    var method = opts.method || "PM";
    var k = yi.length, df = k - 1, level = opts.level || 0.95, alpha = 1 - level;
    var t2 = (typeof opts.tau2 === "number" && opts.tau2 >= 0) ? opts.tau2
           : (method === "FE" ? 0 : (_T[method] || tau2PM)(yi, vi));
    var ws = _wsums(yi, vi, t2), mu = ws.mu, sw = ws.sw;
    var se = Math.sqrt(1 / sw);
    var fe = _wsums(yi, vi, 0), Q = fe.Q;
    // I² uses the τ²-based form (metafor's rma default): 100·τ²/(τ²+s²), where s² is
    // the Higgins-Thompson typical within-study variance. For DL this equals the
    // Q-based (Q−df)/Q; for PM/REML it is method-specific (as metafor reports).
    var sw0 = 0, sw0sq = 0;
    for (var a = 0; a < k; a++) { var w0 = 1 / vi[a]; sw0 += w0; sw0sq += w0 * w0; }
    var s2 = (k - 1) * sw0 / (sw0 * sw0 - sw0sq);
    var I2 = (df > 0 && (t2 + s2) > 0) ? 100 * t2 / (t2 + s2) : 0;

    var knha = !!opts.knha && method !== "FE" && df >= 1;
    if (knha) {
      // HKSJ: se² = q · (1/Σw),  q = (1/df) Σ w (y−μ)²  [= generalised Q / df].
      var q = _wsums(yi, vi, t2).Q / df;
      if (opts.knhaFloor) q = Math.max(1, q); // advanced-stats.md floor (opt-in)
      se = Math.sqrt(q / sw);
    }
    var crit;
    if (knha) crit = _qt(1 - alpha / 2, df);              // t_{k-1} for HKSJ
    else crit = _qnorm(1 - alpha / 2);                    // z otherwise
    return {
      k: k, tau2: t2, mu: mu, se: se,
      ciLo: mu - crit * se, ciHi: mu + crit * se,
      Q: Q, I2: I2, method: method, knha: knha,
    };
  }

  // Standard-normal quantile (Acklam's inverse-CDF approximation, ~1e-9).
  function _qnorm(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // Student-t quantile: prefer the shared AlmStats.qt (exact, Hill 1970) if loaded;
  // otherwise a Cornish-Fisher expansion off the normal quantile (good for df≥3).
  function _qt(p, df) {
    if (global.AlmStats && typeof global.AlmStats.qt === "function") return global.AlmStats.qt(p, df);
    var z = _qnorm(p), z2 = z * z;
    var g1 = (z2 * z + z) / 4;
    var g2 = (5 * z2 * z2 * z + 16 * z2 * z + 3 * z) / 96;
    var g3 = (3 * Math.pow(z, 7) + 19 * Math.pow(z, 5) + 17 * z2 * z - 15 * z) / 384;
    return z + g1 / df + g2 / (df * df) + g3 / (df * df * df);
  }

  var api = {
    tau2DL: tau2DL, tau2PM: tau2PM, tau2REML: tau2REML, pool: pool,
    _qnorm: _qnorm, _qt: _qt,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMaCore = api;
})(typeof window !== "undefined" ? window : globalThis);
