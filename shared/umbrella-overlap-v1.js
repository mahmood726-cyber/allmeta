/* shared/umbrella-overlap-v1.js — primary-study overlap for umbrella reviews.
 *
 * Integrated from the UmbrellaEngine project. An umbrella review (a review of
 * reviews) double-counts evidence when the same primary studies appear in
 * several of the included reviews. The Corrected Covered Area (CCA; Pieper et
 * al. 2014) quantifies that overlap from the study×review citation matrix:
 *
 *     CCA = (N − r) / (r·c − r)
 *
 * N = total citations (Σ studies cited across reviews), r = unique primary
 * studies, c = reviews. Pieper's grooves: <5% slight, <10% moderate, <15% high,
 * ≥15% very high. High overlap means the reviews are NOT independent and a naive
 * pool over them inflates precision. No allmeta app quantified this.
 *
 * Pure + dual-mode (node-testable). Browser global: window.AlmUmbrellaOverlap.
 *
 * Input: reviews [{label, study_ids:[...]}]  (study ids: any stable token).
 */
(function (global) {
  "use strict";

  function classifyGroove(cca) {
    if (cca < 0.05) return "Slight";
    if (cca < 0.10) return "Moderate";
    if (cca < 0.15) return "High";
    return "Very High";
  }

  function overlap(reviews) {
    var revs = (reviews || []).filter(function (r) { return r && Array.isArray(r.study_ids); });
    var c = revs.length;
    if (c < 2) return { ok: false, error: "need ≥2 reviews to quantify overlap" };

    var sets = revs.map(function (r) {
      var s = {}; r.study_ids.forEach(function (id) { id = String(id).trim(); if (id) s[id] = true; }); return s;
    });
    var all = {}; sets.forEach(function (s) { for (var k in s) all[k] = true; });
    var r = Object.keys(all).length;
    var nTotal = 0; sets.forEach(function (s) { nTotal += Object.keys(s).length; });
    var denom = r * c - r;
    var cca = denom > 0 ? (nTotal - r) / denom : 0;
    cca = Math.max(0, Math.min(1, cca));

    // pairwise shared-study matrix
    var matrix = [], i, jj, k;
    for (i = 0; i < c; i++) {
      matrix[i] = [];
      for (jj = 0; jj < c; jj++) { var cnt = 0; for (k in sets[jj]) if (sets[i][k]) cnt++; matrix[i][jj] = cnt; }
    }
    // per-study citation frequency + the multiply-cited ones
    var freq = {}; for (k in all) { var f = 0; for (i = 0; i < c; i++) if (sets[i][k]) f++; freq[k] = f; }
    var shared = Object.keys(freq).filter(function (id) { return freq[id] > 1; })
      .sort(function (a, b) { return freq[b] - freq[a]; });

    var groove = classifyGroove(cca);
    var verdict = "CCA " + (cca * 100).toFixed(1) + "% — " + groove + " overlap. " + (
      cca >= 0.15 ? "Very high overlap: the reviews are far from independent — pooling effect sizes across them double-counts the shared primary studies and inflates precision. Use a non-overlapping subset or report a citation-matrix-based correction."
        : cca >= 0.05 ? "Moderate/high overlap: account for the shared studies (e.g. restrict to non-overlapping reviews for any quantitative pool)."
          : "Slight overlap: the reviews are largely independent on their primary studies."
    );

    return {
      ok: true, cca: cca, groove: groove, nTotal: nTotal, nUnique: r, nReviews: c,
      labels: revs.map(function (rr, ix) { return rr.label || ("Review " + (ix + 1)); }),
      matrix: matrix, frequency: freq, sharedCount: shared.length, mostShared: shared.slice(0, 10), verdict: verdict
    };
  }

  var api = { overlap: overlap, classifyGroove: classifyGroove };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmUmbrellaOverlap = api;
})(typeof window !== "undefined" ? window : globalThis);
