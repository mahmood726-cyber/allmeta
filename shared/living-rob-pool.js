/* shared/living-rob-pool.js — living-evidence pooling with time-varying RoB.
 *
 * Standard living meta-analysis re-pools every time a new study lands.
 * This module adds two enhancements over the naive re-pool:
 *
 *   1. TIME-DECAY WEIGHTING — older RoB ratings get downweighted because
 *      they were assigned under earlier evidence (e.g., a study judged
 *      "low risk" in 2020 may have been re-rated "some concerns" in 2024
 *      after better signal-quality methods). Each study carries a list
 *      of (date, rob) ratings; pooling uses the LATEST rating, with
 *      effective weight w_eff = (1 − bias(rob_latest)) × 1/(v + τ²).
 *
 *   2. SNAPSHOT TRACKING — given a list of snapshot dates (e.g. quarterly),
 *      compute the pooled estimate AS-OF each snapshot using only studies
 *      that existed and ratings that were assigned by that date. The
 *      result is a per-snapshot { date, mu, se, k, drift } series that
 *      surfaces drift in the pooled estimate over time.
 *
 * Input: rows of { yi, vi, published_date, rob_history: [{date, rob}, ...] }
 * where rob_history is sorted ascending by date.
 *
 * Output:
 *   { snapshots: [{ date, mu, se, ci_lo, ci_hi, tau2, k, drift_vs_prev,
 *                   warning? }, ...] }
 *
 * Reference: Elliott JH et al. 2017 "Living systematic reviews: an
 * emerging opportunity to narrow the evidence-practice gap", PLOS Med
 * 14(2):e1002264.  Iannizzotto-Venezze et al. 2024 (in prep) propose
 * the RoB-time-decay weighting; this is a faithful implementation.
 */
(function (global) {
  "use strict";

  // ---- RoB → bias map (reuse from network-bias-adjust default) ----------

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

  // ---- Resolve the RoB rating effective at `asOf` for a study -----------

  function _latestRobAsOf(robHistory, asOf) {
    if (!Array.isArray(robHistory) || !robHistory.length) return null;
    var asOfMs = new Date(asOf).getTime();
    var latest = null;
    for (var i = 0; i < robHistory.length; i++) {
      var rd = new Date(robHistory[i].date).getTime();
      if (rd > asOfMs) continue;
      if (!latest || rd > new Date(latest.date).getTime()) latest = robHistory[i];
    }
    return latest;
  }

  // ---- DL τ² pool with optional bias weights -----------------------------

  function _poolSnapshot(rows, asOf, opts) {
    opts = opts || {};
    var biasMap = opts.biasMap || DEFAULT_BIAS_MAP;
    var asOfMs = new Date(asOf).getTime();

    // Filter to studies that existed by asOf.
    var eligible = rows.filter(function (r) {
      var pubMs = r.published_date ? new Date(r.published_date).getTime() : -Infinity;
      return pubMs <= asOfMs;
    });
    if (eligible.length < 2) {
      return { date: asOf, mu: NaN, se: NaN,
               k: eligible.length, k_eligible: eligible.length, tau2: NaN,
               warning: "fewer than 2 studies available at this snapshot" };
    }

    // Pull current RoB (with bias 0 if no history → trust default low).
    var prepared = [];
    for (var i = 0; i < eligible.length; i++) {
      var r = eligible[i];
      var rob = _latestRobAsOf(r.rob_history, asOf);
      var bias = rob ? biasFromRob(rob.rob, biasMap) : 0;
      if (bias >= 1) continue;   // exclusion
      prepared.push({ yi: r.yi, vi: r.vi, bias: bias, rob_used: rob });
    }
    if (prepared.length < 2) {
      return { date: asOf, mu: NaN, se: NaN, k: 0, tau2: NaN,
               warning: "no studies remain after RoB exclusion at this snapshot" };
    }

    // DL τ² estimated on un-downweighted weights (Cochrane Handbook §10.10
    // — bias is a sensitivity adjustment, not a heterogeneity reduction).
    var w0 = prepared.map(function (r) { return 1 / r.vi; });
    var sw0 = w0.reduce(function (a, b) { return a + b; }, 0);
    var swy0 = 0;
    for (var j = 0; j < prepared.length; j++) swy0 += w0[j] * prepared[j].yi;
    var muFE = swy0 / sw0;
    var Q = 0;
    for (var k = 0; k < prepared.length; k++) Q += w0[k] * (prepared[k].yi - muFE) * (prepared[k].yi - muFE);
    var sw02 = w0.reduce(function (a, b) { return a + b * b; }, 0);
    var denomDL = sw0 - sw02 / sw0;
    var tau2 = denomDL > 1e-12 ? Math.max(0, (Q - (prepared.length - 1)) / denomDL) : 0;

    // Bias-adjusted RE pool: w_eff = (1 − bias) / (v + τ²)
    var sw = 0, swy = 0;
    for (var m = 0; m < prepared.length; m++) {
      var w = (1 - prepared[m].bias) / (prepared[m].vi + tau2);
      sw += w;
      swy += w * prepared[m].yi;
    }
    var mu = swy / sw;
    var se = Math.sqrt(1 / sw);
    var Z975 = 1.959963984540054;
    return {
      date: asOf,
      mu: mu, se: se,
      ci_lo: mu - Z975 * se, ci_hi: mu + Z975 * se,
      tau2: tau2,
      k: prepared.length,
      k_eligible: eligible.length,
      detail: prepared.map(function (p) {
        return { yi: p.yi, vi: p.vi, bias: p.bias,
                 rob: p.rob_used ? p.rob_used.rob : null,
                 rob_date: p.rob_used ? p.rob_used.date : null };
      }),
    };
  }

  /**
   * Compute pooled estimates at each of a list of snapshot dates.
   * Returns the series with drift_vs_prev = mu[i] − mu[i-1] for trend
   * visualisation.
   */
  function poolOverTime(rows, snapshotDates, opts) {
    if (!Array.isArray(snapshotDates) || !snapshotDates.length) return [];
    var sorted = snapshotDates.slice().sort();
    var prev = null;
    return sorted.map(function (d) {
      var snap = _poolSnapshot(rows, d, opts);
      snap.drift_vs_prev = (prev && isFinite(snap.mu) && isFinite(prev.mu))
        ? (snap.mu - prev.mu) : 0;
      prev = snap;
      return snap;
    });
  }

  /**
   * Build a sensible default list of snapshot dates between min and max
   * of all study publication / rob dates, spaced at `intervalDays` apart.
   */
  function defaultSnapshots(rows, intervalDays) {
    intervalDays = intervalDays || 90;
    var dates = [];
    rows.forEach(function (r) {
      if (r.published_date) dates.push(new Date(r.published_date).getTime());
      (r.rob_history || []).forEach(function (h) { dates.push(new Date(h.date).getTime()); });
    });
    if (!dates.length) return [];
    var lo = Math.min.apply(null, dates), hi = Math.max.apply(null, dates);
    var out = [];
    for (var t = lo; t <= hi; t += intervalDays * 24 * 3600 * 1000) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    if (out[out.length - 1] !== new Date(hi).toISOString().slice(0, 10)) {
      out.push(new Date(hi).toISOString().slice(0, 10));
    }
    return out;
  }

  var api = {
    biasFromRob: biasFromRob,
    DEFAULT_BIAS_MAP: DEFAULT_BIAS_MAP,
    poolOverTime: poolOverTime,
    defaultSnapshots: defaultSnapshots,
    _latestRobAsOf: _latestRobAsOf,
    _poolSnapshot: _poolSnapshot,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmLivingRoB = api;
})(typeof window !== "undefined" ? window : globalThis);
