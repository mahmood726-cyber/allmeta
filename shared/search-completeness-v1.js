/* shared/search-completeness-v1.js — registry-vs-literature search completeness.
 *
 * Integrated idea from the glp1-obesity-mbnma literature arm (run_medline_compare):
 * a literature-only search (e.g. MEDLINE) systematically MISSES registered trials —
 * because they were never published (ghosts), or their paper is indexed elsewhere
 * (e.g. a T2D trial not under "obesity"). Given a registry cohort, the papers a
 * search returned, and the trial→publication linkage, this quantifies the miss
 * rate, the trial-to-publication linkage rate (~63.6% in the literature), and the
 * denominator-bias factor (a search of N papers represents ≈N/sensitivity actual
 * registered trials). No SR tool reports retrieval completeness this way.
 *
 * Pure + dual-mode. Browser global: window.AlmSearchCompleteness.
 *
 * Inputs:
 *   cohort:     [nctId]            — registered trials (the denominator)
 *   searchHits: [pmid]             — publications a literature search returned
 *   linkage:    {nctId:[pmid,...]} — each trial's known publication(s)
 *   ghosts:     [nctId]            — trials known to be unpublished (optional)
 */
(function (global) {
  "use strict";

  function norm(x) { return String(x == null ? "" : x).trim(); }
  function toSet(arr) { var s = {}; (arr || []).forEach(function (x) { var k = norm(x); if (k) s[k] = true; }); return s; }

  function assess(input) {
    input = input || {};
    var cohort = (input.cohort || []).map(norm).filter(Boolean);
    // de-dup cohort
    var seen = {}, uniq = [];
    cohort.forEach(function (n) { if (!seen[n]) { seen[n] = true; uniq.push(n); } });
    cohort = uniq;
    var hits = toSet(input.searchHits);
    var linkage = input.linkage || {};
    var ghostSet = toSet(input.ghosts);
    if (!cohort.length) return { ok: false, error: "registry cohort is empty" };

    var perTrial = cohort.map(function (nct) {
      var pmids = (linkage[nct] || []).map(norm).filter(Boolean);
      var found = pmids.some(function (p) { return hits[p]; });
      var category;
      if (found) category = "found";
      else if (ghostSet[nct] || pmids.length === 0) category = ghostSet[nct] ? "ghost" : "no-link";
      else category = "published-not-found";
      return { nct: nct, linkedPmids: pmids.length, found: found, category: category };
    });

    var n = cohort.length;
    var found = perTrial.filter(function (t) { return t.found; }).length;
    var linked = perTrial.filter(function (t) { return t.linkedPmids > 0; }).length;
    var breakdown = {
      ghost: perTrial.filter(function (t) { return t.category === "ghost"; }).length,
      publishedNotFound: perTrial.filter(function (t) { return t.category === "published-not-found"; }).length,
      noLink: perTrial.filter(function (t) { return t.category === "no-link"; }).length
    };
    var sensitivity = found / n;            // share of registered trials a search finds
    var missed = n - found;
    var linkageRate = linked / n;           // trial-to-publication linkage (~0.636 lit. baseline)
    var denominatorFactor = sensitivity > 0 ? 1 / sensitivity : null;

    var verdict;
    if (missed === 0) verdict = "The literature search retrieved every registered trial in the cohort — no registry-only evidence on this cohort.";
    else verdict = "A literature-only search misses " + missed + "/" + n + " registered trials ("
      + (100 * (1 - sensitivity)).toFixed(0) + "%): " + breakdown.ghost + " unpublished ghost(s), "
      + breakdown.publishedNotFound + " published-but-not-retrieved, " + breakdown.noLink + " with no publication link"
      + (denominatorFactor ? ". A search of N papers represents ≈ " + denominatorFactor.toFixed(2) + "×N registered trials — report this as a denominator-bias term, never \"all trials\"." : ".");

    return {
      ok: true, n: n, found: found, missed: missed,
      sensitivity: sensitivity, linkageRate: linkageRate, denominatorFactor: denominatorFactor,
      breakdown: breakdown, perTrial: perTrial, verdict: verdict
    };
  }

  var api = { assess: assess };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmSearchCompleteness = api;
})(typeof window !== "undefined" ? window : globalThis);
