/* paper/assets/js/alm-paper-bridge.js — allmeta → Paper Studio bridge.
 *
 * Paper Studio (assets/js/paper-studio.js, ported verbatim from rapidmeta-kit's
 * latest pilot build) reads a host object `window.RapidMeta` with a `.state`.
 * In RapidMeta that state is the whole app; in allmeta we ASSEMBLE the same
 * shape from the cross-tool buses, so the same paper writer runs offline over an
 * allmeta review with NO change to paper-studio.js.
 *
 * Surface paper-studio.js requires (measured): RapidMeta.state, .switchTab,
 * .__paperStudioHooked. State fields it reads: protocol.{pop,int,comp,out,url},
 * pico.{intervention,primaryOutcome}, trials[].{title,authors,year,n,rob},
 * results.{estimate,ciLow,ciHigh,i2,tau2}.
 *
 * Buses consumed:
 *   sr-project-v1  (design app)   → protocol / pico
 *   sr-records-v1  (screen app)   → included trials + PRISMA counts
 *   ma-studies-v1  (MaStudies)    → per-study effect sizes
 *   ma-pooled-v1   (MaPooled)     → the pooled result (estimate/CI/tau2)
 *   AlmMaCore (optional)          → i2/tau2 if the pooled record omits them
 */
(function (global) {
  "use strict";

  function lsGet(key) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return null;
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Consensus-included, non-duplicate records from the sr-records-v1 schema
  // (two fixed reviewers r1/r2 + a `resolved` override; `dup` marks duplicates).
  function includedRecords(recs) {
    return (recs || []).filter(function (r) {
      if (!r || r.dup) return false;
      var d1 = r.r1 && r.r1.d, d2 = r.r2 && r.r2.d, res = r.resolved;
      if (res) return res === "include";
      if (d1 && d2) return d1 === "include" && d2 === "include";
      return (d1 || d2) === "include";
    });
  }

  // Optional heterogeneity fill from the per-study effects when the pooled
  // record doesn't carry i2/tau2 (ma-pooled-v1 carries tau2 sometimes, i2 rarely).
  function heterogeneity(studies) {
    if (!global.AlmMaCore || !studies || studies.length < 2) return {};
    try {
      var yi = [], vi = [];
      for (var i = 0; i < studies.length; i++) {
        if (studies[i].est == null || !(studies[i].se > 0)) return {};
        yi.push(studies[i].est); vi.push(studies[i].se * studies[i].se);
      }
      var p = global.AlmMaCore.pool(yi, vi, { method: "REML" });
      return { i2: p.I2 != null ? p.I2 : (p.i2 != null ? p.i2 : null), tau2: p.tau2 != null ? p.tau2 : null };
    } catch (e) { return {}; }
  }

  function buildState() {
    var proj = lsGet("sr-project-v1") || {};
    var pico = proj.pico || proj.protocol || {};
    var recsEnv = lsGet("sr-records-v1") || {};
    var recs = Array.isArray(recsEnv.records) ? recsEnv.records : [];
    var included = includedRecords(recs);
    var studies = (global.MaStudies && global.MaStudies.read && global.MaStudies.read()) || [];
    var pooledList = (global.MaPooled && global.MaPooled.read && global.MaPooled.read()) || [];
    var pooled = pooledList.length ? pooledList[pooledList.length - 1] : null;

    var trials = included.map(function (r, i) {
      var st = studies[i] || {};
      return {
        title: r.title || st.label || ("Study " + (i + 1)),
        authors: Array.isArray(r.authors) ? r.authors.join("; ") : (r.authors || ""),
        year: r.year || st.year || null,
        n: (r.n != null ? r.n : null),
        rob: (r.rob || (r.r1 && r.r1.rob) || null),
        effect: (st.est != null) ? { est: st.est, se: st.se } : null,
        nct: (r.ids && r.ids.nctid) || r.nct || ((r.pmid && "") || "")
      };
    });
    // Fall back to ma-studies as trials when no sr-records exist yet.
    if (!trials.length && studies.length) {
      trials = studies.map(function (st, i) {
        return { title: st.label || ("Study " + (i + 1)), authors: "", year: st.year || null, n: null, rob: null, effect: { est: st.est, se: st.se }, nct: "" };
      });
    }

    var het = heterogeneity(studies);
    var results = pooled ? {
      estimate: pooled.pointEstimate != null ? pooled.pointEstimate : (pooled.estimate != null ? pooled.estimate : null),
      ciLow: pooled.ciLo != null ? pooled.ciLo : (pooled.ciLow != null ? pooled.ciLow : null),
      ciHigh: pooled.ciHi != null ? pooled.ciHi : (pooled.ciHigh != null ? pooled.ciHigh : null),
      tau2: pooled.tau2 != null ? pooled.tau2 : (het.tau2 != null ? het.tau2 : null),
      i2: pooled.i2 != null ? pooled.i2 : (het.i2 != null ? het.i2 : null),
      measure: pooled.measure || "", scale: pooled.scale || "",
      k: pooled.k != null ? pooled.k : trials.length
    } : null;

    return {
      protocol: {
        pop: pico.pop || pico.population || "",
        int: pico.int || pico.intervention || "",
        comp: pico.comp || pico.comparator || "",
        out: pico.out || pico.outcome || pico.primaryOutcome || "",
        url: proj.protocolUrl || pico.url || ""
      },
      pico: {
        intervention: pico.int || pico.intervention || "",
        primaryOutcome: pico.out || pico.outcome || pico.primaryOutcome || "",
        population: pico.pop || pico.population || "",
        comparator: pico.comp || pico.comparator || ""
      },
      trials: trials,
      results: results,
      outcomes: [], figures: [], style: {}, studentText: {}, analysis: null,
      search: { count: recs.length, included: included.length },
      activeTab: "paper"
    };
  }

  var RM = global.RapidMeta || {};
  if (!RM.state) RM.state = buildState();
  if (!RM.switchTab) RM.switchTab = function () {};
  if (RM.__paperStudioHooked === undefined) RM.__paperStudioHooked = false;
  RM.rebuildStateFromBuses = function () { RM.state = buildState(); return RM.state; };
  global.RapidMeta = RM;

  global.AlmPaperBridge = { buildState: buildState, includedRecords: includedRecords };
  if (typeof module !== "undefined" && module.exports) module.exports = global.AlmPaperBridge;
})(typeof window !== "undefined" ? window : globalThis);
