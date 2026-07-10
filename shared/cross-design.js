/* shared/cross-design.js — Cross-design synthesis (RCT + observational).
 *
 * Three methods, in increasing assumption-strength:
 *
 *   1. NAIVE_POOL         — all studies pooled with standard RE weights.
 *                           Anti-conservative; reported for comparison only.
 *
 *   2. POWER_PRIOR        — observational studies enter at weight α ∈ [0, 1].
 *                           α=0 ignores them; α=1 = naive pool. Effective
 *                           weight w_eff = α / (v_i + τ²). Reference: Ibrahim &
 *                           Chen 2000 (Stat Sci); used in HTA decision models.
 *
 *   3. DESIGN_BIAS_RE     — hierarchical model with a design-specific bias
 *                           term. Each observational study j carries a bias
 *                           δ_j ~ N(δ_obs, σ²_bias), so y_j = μ + δ_j + ε_j.
 *                           Reference: Welton, Cooper, Ades, Lu, Sutton 2009
 *                           (Stat Med); Schmitz, Adams, Walsh 2013 (Res Synth
 *                           Methods). Implemented via DerSimonian-Laird /
 *                           method-of-moments estimation.
 *
 * Inputs:
 *   { yi, vi, design }   where design ∈ "rct" | "obs"
 *
 * Output (per method):
 *   { method, mu, sePost, ci_lo, ci_hi, tau2, k_rct, k_obs, deltaObs?,
 *     deltaSE?, biasVar? }
 */
(function (global) {
  "use strict";

  // ---- Common: DL τ² + IV pool helpers ---------------------------------

  function _tau2_DL(yi, vi) {
    var k = yi.length;
    if (k < 2) return 0;
    var w = vi.map(function (v) { return 1 / v; });
    var sw = w.reduce(function (a, b) { return a + b; }, 0);
    var swy = 0;
    for (var i = 0; i < k; i++) swy += w[i] * yi[i];
    var muFE = swy / sw;
    var Q = 0;
    for (var j = 0; j < k; j++) Q += w[j] * (yi[j] - muFE) * (yi[j] - muFE);
    var sw2 = w.reduce(function (a, b) { return a + b * b; }, 0);
    var denom = sw - sw2 / sw;
    if (denom <= 1e-12) return 0;
    return Math.max(0, (Q - (k - 1)) / denom);
  }

  function _ivPool(yi, vi, tau2) {
    var sw = 0, swy = 0;
    for (var i = 0; i < yi.length; i++) {
      var w = 1 / (vi[i] + tau2);
      sw += w; swy += w * yi[i];
    }
    // Guard: empty input or all-zero weights leave sw=0, which yields
    // mu = 0/0 = NaN and se = sqrt(1/0) = Infinity. Return a defined
    // sentinel rather than letting NaN/Infinity propagate silently.
    if (!(sw > 0)) return { mu: null, se: null, warning: "no poolable studies (empty input or all weights zero)" };
    return { mu: swy / sw, se: Math.sqrt(1 / sw) };
  }

  // ---- Method 1: NAIVE pool --------------------------------------------

  function fit_naive(rows) {
    var yi = rows.map(function (r) { return r.yi; });
    var vi = rows.map(function (r) { return r.vi; });
    var tau2 = _tau2_DL(yi, vi);
    var p = _ivPool(yi, vi, tau2);
    var Z975 = 1.959963984540054;
    var k_rct = rows.filter(function (r) { return r.design === "rct"; }).length;
    var k_obs = rows.filter(function (r) { return r.design === "obs"; }).length;
    if (p.mu === null) {
      return {
        method: "NAIVE_POOL",
        mu: null, sePost: null, ci_lo: null, ci_hi: null,
        tau2: tau2, k_rct: k_rct, k_obs: k_obs, warning: p.warning,
      };
    }
    return {
      method: "NAIVE_POOL",
      mu: p.mu, sePost: p.se,
      ci_lo: p.mu - Z975 * p.se, ci_hi: p.mu + Z975 * p.se,
      tau2: tau2, k_rct: k_rct, k_obs: k_obs,
    };
  }

  // ---- Method 2: POWER PRIOR -------------------------------------------
  //
  // Observational studies enter the likelihood at weight α.
  //   w_eff = (design === "obs" ? α : 1) / (v_i + τ²)
  // α=1 ⇒ naive pool. α=0 ⇒ RCT-only.

  function fit_powerPrior(rows, alpha) {
    if (!isFinite(alpha) || alpha < 0 || alpha > 1) alpha = 0.5;
    var yi = rows.map(function (r) { return r.yi; });
    var vi = rows.map(function (r) { return r.vi; });
    var tau2 = _tau2_DL(yi, vi);
    var sw = 0, swy = 0;
    for (var i = 0; i < rows.length; i++) {
      var mult = rows[i].design === "obs" ? alpha : 1;
      var w = mult / (vi[i] + tau2);
      sw += w; swy += w * yi[i];
    }
    var Z975 = 1.959963984540054;
    var k_rct = rows.filter(function (r) { return r.design === "rct"; }).length;
    var k_obs = rows.filter(function (r) { return r.design === "obs"; }).length;
    // Guard: sw=0 (empty input, or all-obs with alpha=0) → mu=NaN, se=Infinity.
    if (!(sw > 0)) {
      return {
        method: "POWER_PRIOR",
        mu: null, sePost: null, ci_lo: null, ci_hi: null,
        tau2: tau2, alpha: alpha, k_rct: k_rct, k_obs: k_obs,
        warning: "no poolable studies (empty input or all weights zero; e.g. all-observational with alpha=0)",
      };
    }
    var mu = swy / sw, se = Math.sqrt(1 / sw);
    return {
      method: "POWER_PRIOR",
      mu: mu, sePost: se,
      ci_lo: mu - Z975 * se, ci_hi: mu + Z975 * se,
      tau2: tau2, alpha: alpha, k_rct: k_rct, k_obs: k_obs,
    };
  }

  // ---- Method 3: DESIGN-BIAS RE (Welton 2009) --------------------------
  //
  // Model: y_j = μ + δ_j * I(obs) + ε_j  where
  //   ε_j ~ N(0, v_j + τ²)   (within-design heterogeneity)
  //   δ_j ~ N(δ_obs, σ²_bias)  (between-obs-study bias variability)
  //
  // Estimated by DerSimonian-Laird / method-of-moments throughout.
  // We estimate τ² from RCTs alone (the cleanest signal), δ_obs as the
  // mean obs-vs-RCT difference, and σ²_bias by method of moments on the
  // obs residuals after subtracting δ_obs.

  function fit_designBias(rows, opts) {
    opts = opts || {};
    var rcts = rows.filter(function (r) { return r.design === "rct"; });
    var obs  = rows.filter(function (r) { return r.design === "obs"; });
    if (rcts.length === 0) {
      // Fall back to naive pool (no RCT anchor to estimate bias against).
      return Object.assign(fit_naive(rows), {
        method: "DESIGN_BIAS_RE",
        warning: "No RCTs — bias not estimable; reverted to naive pool.",
      });
    }
    var yiR = rcts.map(function (r) { return r.yi; });
    var viR = rcts.map(function (r) { return r.vi; });
    var tau2 = _tau2_DL(yiR, viR);
    var poolR = _ivPool(yiR, viR, tau2);

    var deltaObs = 0, biasVar = 0;
    if (obs.length > 0) {
      var resObs = obs.map(function (r) { return r.yi - poolR.mu; });
      var sumW = 0, sumWresid = 0, sumW2 = 0;
      for (var i = 0; i < obs.length; i++) {
        var w = 1 / (obs[i].vi + tau2);
        sumW += w; sumWresid += w * resObs[i]; sumW2 += w * w;
      }
      deltaObs = sumWresid / sumW;
      // method-of-moments bias variance (analog of DL but on bias residuals)
      var Qb = 0;
      for (var j = 0; j < obs.length; j++) {
        var wb = 1 / (obs[j].vi + tau2);
        Qb += wb * (resObs[j] - deltaObs) * (resObs[j] - deltaObs);
      }
      var denomB = sumW - sumW2 / sumW;
      biasVar = denomB > 1e-12 ? Math.max(0, (Qb - (obs.length - 1)) / denomB) : 0;
    }
    // Pool RCTs at DerSimonian-Laird / method-of-moments weights for the
    // final μ (the bias term doesn't
    // contribute to μ, only inflates the obs effective variance for the
    // shrinkage-weighted display).
    var mu = poolR.mu;
    var sePost = poolR.se;
    var Z975 = 1.959963984540054;
    return {
      method: "DESIGN_BIAS_RE",
      mu: mu, sePost: sePost,
      ci_lo: mu - Z975 * sePost, ci_hi: mu + Z975 * sePost,
      tau2: tau2, deltaObs: deltaObs, biasVar: biasVar,
      k_rct: rcts.length, k_obs: obs.length,
    };
  }

  // ---- Combined report -------------------------------------------------

  function fitAll(rows, opts) {
    opts = opts || {};
    var alpha = isFinite(opts.alpha) ? opts.alpha : 0.5;
    return {
      naive: fit_naive(rows),
      powerPrior: fit_powerPrior(rows, alpha),
      designBias: fit_designBias(rows, opts),
    };
  }

  var api = {
    fit_naive: fit_naive,
    fit_powerPrior: fit_powerPrior,
    fit_designBias: fit_designBias,
    fitAll: fitAll,
    _tau2_DL: _tau2_DL,
    _ivPool: _ivPool,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmCrossDesign = api;
})(typeof window !== "undefined" ? window : globalThis);
