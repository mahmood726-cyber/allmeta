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

  // Consensus screening decision for a record under the sr-records-v1 schema
  // (two fixed reviewers r1/r2 + a `resolved` override; `dup` marks duplicates).
  // Returns { decision: "include"|"exclude"|"maybe"|"", confirmed: bool, reason }.
  function decisionOf(r) {
    if (!r) return { decision: "", confirmed: false, reason: "" };
    var d1 = r.r1 && r.r1.d, d2 = r.r2 && r.r2.d, res = r.resolved;
    var reason = (r.r1 && r.r1.reason) || (r.r2 && r.r2.reason) || "";
    if (res) return { decision: res, confirmed: true, reason: reason };
    if (d1 && d2) {
      if (d1 === d2) return { decision: d1, confirmed: true, reason: reason };
      return { decision: "maybe", confirmed: false, reason: reason }; // unreconciled conflict
    }
    var only = d1 || d2 || "";
    return { decision: only, confirmed: false, reason: reason };
  }
  function includedRecords(recs) {
    return (recs || []).filter(function (r) {
      return r && !r.dup && decisionOf(r).decision === "include";
    });
  }

  // Join key between an sr-records record and an ma-studies-v1 study row. The
  // Extract app writes each study with label = clean(record.title, 80) (see
  // extract/index.html toMaStudy), so the record title's normalized 80-char prefix
  // is the reliable identity link — NOT array position, which silently mismatched
  // per-record effects whenever extraction order/count differed from screening.
  function normKey(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();
  }
  function buildStudyIndex(studies) {
    var byLabel = {};
    (studies || []).forEach(function (st, i) {
      if (!st) return;
      var k = normKey(st.label);
      if (k && byLabel[k] == null) byLabel[k] = i; // first wins; collisions are rare
    });
    return byLabel;
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

    var studyIdx = buildStudyIndex(studies);
    // Consensus-included records become trials, each carrying its screening status and
    // the full per-record fields the paper writer + transparency appendix need. Per-record
    // extracted effects are matched to ma-studies rows by IDENTITY (record title ==
    // study label, the key the Extract app writes) — NOT by array position, which
    // silently mismatched effects whenever extraction order/count differed from
    // screening. Positional fallback applies ONLY when no label matches at all AND the
    // counts line up exactly (legacy / analysis-only flows), and never fabricates data.
    var anyLabelMatch = false;
    included.forEach(function (r) { if (studyIdx[normKey(r.title)] != null) anyLabelMatch = true; });
    var positionalOk = !anyLabelMatch && included.length === studies.length && studies.length > 0;

    function trialFromRecord(r, inclPos) {
      var dec = decisionOf(r);
      var nct = (r.ids && r.ids.nctid) || r.nct || (function () { var m = String(r.id || "").match(/NCT\d{8}/i); return m ? m[0].toUpperCase() : ""; })();
      var st = null;
      var li = studyIdx[normKey(r.title)];
      if (li != null) st = studies[li];
      else if (positionalOk && inclPos >= 0) st = studies[inclPos] || null;
      var ctUrl = r.ctgovUrl || (nct ? "https://clinicaltrials.gov/study/" + nct : (/clinicaltrials\.gov/i.test(r.url || "") ? r.url : ""));
      return {
        id: nct || r.id || "",
        title: r.title || (st && st.label) || "",
        authors: Array.isArray(r.authors) ? r.authors.join("; ") : (r.authors || ""),
        year: r.year || (st && st.year) || null,
        journal: r.journal || "",
        source: r.source || "",
        status: dec.decision || "screened",
        reason: dec.reason || "",
        screenReview: { confirmed: !!dec.confirmed, decision: dec.decision || "" },
        pmid: r.pmid || "",
        doi: r.doi || "",
        nct: nct,
        abstract: r.abstract || "",
        abstractSource: r.abstractSource || "",
        ctgovUrl: ctUrl,
        sourceUrl: r.url || "",
        n: (r.n != null ? r.n : null),
        rob: (r.rob || (r.r1 && r.r1.rob) || null),
        effect: (st && st.est != null && st.se != null) ? { est: st.est, se: st.se } : null,
        extractMissing: !(st && st.est != null && st.se != null),
        data: { name: r.title || (st && st.label) || "", abstract: r.abstract || "" }
      };
    }

    var trials = included.map(function (r, i) { return trialFromRecord(r, i); });

    // Fall back to ma-studies as trials when no sr-records exist yet (analysis-only flow).
    if (!trials.length && studies.length) {
      trials = studies.map(function (st, i) {
        return {
          id: "", title: st.label || ("Study " + (i + 1)), authors: "", year: st.year || null,
          journal: "", source: "", status: "include", reason: "",
          screenReview: { confirmed: false, decision: "include" },
          pmid: "", doi: "", nct: "", abstract: "", abstractSource: "", ctgovUrl: "", sourceUrl: "",
          n: null, rob: null, effect: { est: st.est, se: st.se }, extractMissing: false,
          data: { name: st.label || ("Study " + (i + 1)), abstract: "" }
        };
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
      k: pooled.k != null ? pooled.k : (included.length || studies.length)
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
