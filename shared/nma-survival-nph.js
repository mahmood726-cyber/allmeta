/*
 * shared/nma-survival-nph.js — piecewise-exponential non-proportional-hazards
 * network meta-analysis.
 *
 * Ported from the author's advanced-nma-pooling (survival_nph.py) into allmeta.
 * For time-to-event networks where the hazard ratio is NOT constant over time,
 * the follow-up is split into intervals; within each interval the log-hazard of
 * an arm is log((events + cc)/person-time) and the log-HR of one arm vs another
 * is the difference (Poisson/piecewise-exponential approximation, Var ~ 1/events).
 * Each interval is then an independent contrast-based NMA — delegated to the
 * netmeta-verified shared/nma-multiarm-v1.js — giving an INTERVAL-SPECIFIC set
 * of relative effects (the non-PH signal). An optional inverse-variance pool
 * across intervals gives an overall (time-averaged) log-HR per treatment.
 *
 * allmeta has KM reconstruction (survival-reconstruction.js) and pairwise
 * survival tools, but no interval-stratified survival NMA — this fills that gap.
 * Verified: per-interval effects match netmeta::netmeta() on the same interval's
 * log-HR contrasts (see tests/test_nma_survival_nph.py).
 */
(function (global) {
  "use strict";

  // In node, ensure the GLS engine is loaded (browser provides it via <script>).
  if (typeof global.AlmNmaMultiarm === "undefined" && typeof require === "function") {
    try { require("./nma-multiarm-v1.js"); } catch (e) { /* other loader */ }
  }

  function _logHazard(events, ptime, cc) { return Math.log((events + cc) / ptime); }

  // Build per-interval within-study log-HR contrasts (vs each study's base arm).
  // rows: [{study, treatment, interval, events, ptime}]
  function buildContrasts(rows, cc) {
    cc = cc == null ? 0.5 : cc;
    // group by study -> interval -> [{treatment, events, ptime}]
    var byStudy = {};
    rows.forEach(function (r) {
      var s = String(r.study), iv = String(r.interval);
      (byStudy[s] = byStudy[s] || {});
      (byStudy[s][iv] = byStudy[s][iv] || []).push(r);
    });
    var perInterval = {}; // intervalId -> contrast rows for AlmNmaMultiarm
    Object.keys(byStudy).forEach(function (s) {
      Object.keys(byStudy[s]).forEach(function (iv) {
        var arms = byStudy[s][iv].slice().sort(function (a, b) {
          return String(a.treatment) < String(b.treatment) ? -1 : 1;
        });
        if (arms.length < 2) return;               // need >=2 arms in the interval
        // Every pairwise comparison (i < j): a multi-arm study must supply all m(m-1)/2 of them
        // (AlmNmaMultiarm, like netmeta's chkmultiarm, refuses an incomplete set). The pairwise
        // variances are sums of independent arm variances, so the GLS recovers the shared-arm
        // covariance Var(base) exactly. For 2 arms this is the single base contrast, as before.
        for (var i = 0; i < arms.length; i++) {
          var b = arms[i], lhB = _logHazard(b.events, b.ptime, cc);
          for (var j = i + 1; j < arms.length; j++) {
            var a = arms[j];
            var est = _logHazard(a.events, a.ptime, cc) - lhB;
            var se = Math.sqrt(1 / (a.events + cc) + 1 / (b.events + cc));
            (perInterval[iv] = perInterval[iv] || []).push({
              study: s + "|" + iv, t1: String(b.treatment), t2: String(a.treatment),
              est: est, se: se
            });
          }
        }
      });
    });
    return perInterval;
  }

  /**
   * fit(rows, {cc=0.5, model='fe'|'re'})
   * rows: [{study, treatment, interval, events, ptime}] (arm-level, per interval).
   * Returns { intervalIds, intervals:{ id:{ refTreat, treatments, effects:{t:{logHR,se}} } },
   *           pooled:{ t:{logHR,se} } (IV across intervals), warnings }.
   */
  function fit(rows, opts) {
    opts = opts || {};
    var cc = opts.cc == null ? 0.5 : opts.cc, model = opts.model || "fe";
    if (typeof global.AlmNmaMultiarm === "undefined") throw new Error("nma-survival-nph: AlmNmaMultiarm not loaded");
    var perInterval = buildContrasts(rows, cc);
    // Time order: numeric labels sort numerically ("2" before "10"); otherwise the string order as before.
    var NUM = /^\s*-?\d+(\.\d+)?\s*$/;
    var intervalIds = Object.keys(perInterval).sort(function (a, b) {
      if (NUM.test(a) && NUM.test(b) && +a !== +b) return +a - +b;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var intervals = {}, warnings = [];
    var pool = {}; // treatment -> {sw, swy}
    // Network-wide reference: the pooled table averages log-HRs across intervals, which is only
    // meaningful against ONE comparator. An interval without it is reported but not pooled.
    var globalRef = rows.map(function (r) { return String(r.treatment); }).sort()[0];
    intervalIds.forEach(function (iv) {
      var res = global.AlmNmaMultiarm.fit(perInterval[iv], { model: model, ref: globalRef });
      if (!res.ok) { warnings.push("interval " + iv + ": " + res.error); return; }
      var poolThis = res.refTreat === globalRef;
      if (!poolThis) warnings.push("interval " + iv + ": reference " + globalRef + " absent (effects vs " + res.refTreat + "); not pooled");
      var eff = {};
      for (var k = 0; k < res.nonref.length; k++) {
        var t = res.nonref[k], lhr = res.d[k], se = Math.sqrt(res.cov[k][k]);
        eff[t] = { logHR: lhr, se: se };
        if (poolThis && isFinite(lhr) && isFinite(se) && se > 0) {
          var w = 1 / (se * se);
          pool[t] = pool[t] || { sw: 0, swy: 0 };
          pool[t].sw += w; pool[t].swy += w * lhr;
        }
      }
      intervals[iv] = { refTreat: res.refTreat, treatments: res.treatments, effects: eff, tau2: res.tau2 };
    });
    var pooled = {};
    Object.keys(pool).forEach(function (t) {
      if (pool[t].sw > 0) pooled[t] = { logHR: pool[t].swy / pool[t].sw, se: Math.sqrt(1 / pool[t].sw) };
    });
    return { intervalIds: intervalIds, intervals: intervals, pooled: pooled, warnings: warnings };
  }

  var api = { fit: fit, buildContrasts: buildContrasts, _logHazard: _logHazard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNmaSurvivalNPH = api;
})(typeof window !== "undefined" ? window : globalThis);
