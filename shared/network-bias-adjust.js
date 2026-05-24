/* shared/network-bias-adjust.js — Chaimani-style downweighting of small /
 * potentially biased studies in NMA.
 *
 * Chaimani A, Salanti G (2012, 2013) propose two complementary tools:
 *
 *   1. NETWORK FUNNEL (comparison-adjusted): subtract each contrast's
 *      pooled effect from each study's effect before plotting, so all
 *      contrasts share a centre — small-study asymmetry across the
 *      network shows in one plot. Implemented as transformY(y_i, μ̂_c)
 *      → y_i - μ̂_c.
 *
 *   2. BIAS-ADJUSTED RE WEIGHTS: optionally downweight a contrast by a
 *      study-level bias score (e.g., RoB tier mapped to 0..1):
 *        w_i_adj = w_i * (1 − bias_i)
 *      Where bias_i ∈ [0, 1] is the strength of suspicion. Equivalent
 *      to a power-prior on each individual study, generalising the
 *      Welton-Ades 2009 study-bias model to networks.
 *
 * The two are designed to be used together: the funnel surfaces SSE in
 * the network; the adjusted RE provides a sensitivity analysis whose
 * downweighting can be calibrated to the funnel pattern.
 *
 * Reference: Chaimani A, Salanti G 2012, "Using network meta-analysis
 * to evaluate the existence of small-study effects in a network of
 * interventions", Res Synth Methods 3(2):161-176. Chaimani A et al.
 * 2013, BMJ 346:f2890.
 */
(function (global) {
  "use strict";

  // ----- Comparison-adjusted funnel transform ----------------------------

  /**
   * Transform a list of contrast rows so the funnel plot can be drawn
   * with all contrasts centered at zero. Returns one row per input row
   * with `y_adj = y - mu_c` and `se` unchanged.
   *
   * rows: [{ trtA, trtB, y, se }, ...]
   * pooled: { "trtA|trtB": pooledEffect, ... }  (built from a prior NMA fit)
   *
   * The key uses sorted treatment labels separated by "|". Orientation
   * (which treatment is the reference) is normalised: if rowA != keyA,
   * flip the sign of y when comparing.
   */
  function transformForFunnel(rows, pooled) {
    return rows.map(function (r) {
      var trts = [r.trtA, r.trtB].slice().sort();
      var key = trts[0] + "|" + trts[1];
      var mu = pooled[key];
      if (typeof mu !== "number") return { trtA: r.trtA, trtB: r.trtB, y: r.y, se: r.se, y_adj: NaN };
      // Sign: when (r.trtA, r.trtB) matches (sorted[0], sorted[1]) we keep y;
      // otherwise we flip it before subtracting the pooled effect.
      var sign = (r.trtA === trts[0] && r.trtB === trts[1]) ? 1 : -1;
      var y_oriented = sign * r.y;
      return {
        trtA: r.trtA, trtB: r.trtB, y: r.y, se: r.se,
        y_adj: y_oriented - mu, contrast: key,
      };
    });
  }

  /**
   * Build the per-contrast pooled-effect map from a list of pairwise
   * estimates [{ trtA, trtB, mu }, ...]. Keys are sorted "trtA|trtB".
   */
  function buildPooledMap(pairwise) {
    var out = Object.create(null);
    for (var i = 0; i < pairwise.length; i++) {
      var p = pairwise[i];
      var trts = [p.trtA, p.trtB].slice().sort();
      var key = trts[0] + "|" + trts[1];
      var sign = (p.trtA === trts[0]) ? 1 : -1;
      out[key] = sign * p.mu;
    }
    return out;
  }

  // ----- Bias-adjusted pooling --------------------------------------------

  /**
   * Pool a set of contrast rows with study-level bias downweighting.
   * Each row has an optional `bias` ∈ [0, 1] (0 = no suspicion,
   * 1 = exclude entirely). Effective weight w_i_adj = w_i * (1 - bias_i).
   *
   * Returns { mu, se, k, sum_w, sum_w_adj }.
   */
  function poolWithBias(rows, opts) {
    opts = opts || {};
    var tau2 = isFinite(opts.tau2) ? opts.tau2 : 0;
    var sumW = 0, sumWy = 0, kEff = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isFinite(r.y) || !isFinite(r.se) || r.se <= 0) continue;
      var bias = isFinite(r.bias) ? Math.max(0, Math.min(1, r.bias)) : 0;
      var w = (1 - bias) / (r.se * r.se + tau2);
      if (w <= 0) continue;
      sumW += w;
      sumWy += w * r.y;
      kEff += (1 - bias);
    }
    if (sumW <= 0) return { ok: false, error: "all studies fully downweighted" };
    var mu = sumWy / sumW;
    var se = Math.sqrt(1 / sumW);
    var Z975 = 1.959963984540054;
    return {
      ok: true,
      mu: mu, se: se, ci_lo: mu - Z975 * se, ci_hi: mu + Z975 * se,
      tau2: tau2,
      k_raw: rows.length, k_effective: kEff,
      sum_w: sumW,
    };
  }

  // ----- Default RoB → bias mapping ---------------------------------------
  //
  // Cochrane RoB 2 → suggested downweight (sensitivity analysis only):
  //   "low" → 0,  "some" → 0.25,  "high" → 0.5,  "unclear" → 0.25
  // These are NOT prescriptive; let the user override.

  var DEFAULT_BIAS_MAP = {
    low: 0, "some": 0.25, "some-concerns": 0.25, moderate: 0.25,
    high: 0.5, critical: 0.5, "very-high": 0.7,
    unclear: 0.25, "no-info": 0.25,
  };

  function biasFromRob(rob, customMap) {
    var m = customMap || DEFAULT_BIAS_MAP;
    if (typeof rob !== "string") return 0;
    var v = m[rob.toLowerCase().trim()];
    return isFinite(v) ? v : 0;
  }

  var api = {
    transformForFunnel: transformForFunnel,
    buildPooledMap: buildPooledMap,
    poolWithBias: poolWithBias,
    biasFromRob: biasFromRob,
    DEFAULT_BIAS_MAP: DEFAULT_BIAS_MAP,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNetworkBias = api;
})(typeof window !== "undefined" ? window : globalThis);
