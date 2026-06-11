/* shared/km-fusion-v1.js — NAR (number-at-risk) fusion for KM reconstruction.
 *
 * Idea integrated from the registry-ipd project's central finding: two survival
 * reconstruction inputs are mirror images —
 *   - a DIGITIZED figure gives a noisy curve BUT the printed at-risk table;
 *   - registry (CT.gov/AACT) posts EXACT KM-estimate anchors BUT no at-risk table.
 * Each one's weakness is the other's strength, so FUSING them (exact anchors +
 * at-risk table) beats either alone. On registry-ipd's 42 true-IPD gold standard:
 * within-20% HR recovery is ~25-53% anchor-only, ~59-85% figure-only, and
 * ~69-92% fused (~72-93% with Titman-QP) — measured, not asserted.
 *
 * This module (a) fuses exact registry anchors into a digitized curve (anchors
 * are authoritative — zero digitization error), and (b) classifies the input
 * regime into a reliability tier with the honest benchmark bands. The actual
 * Guyot reconstruction stays in km-reconstructor; this only conditions its input
 * and labels provenance. Pure + dual-mode. Browser global: window.AlmKmFusion.
 */
(function (global) {
  "use strict";

  // Parse "time, survival" rows; survival in 0..1 or 0..100 (→ normalised 0..1).
  function parsePoints(text) {
    var out = [];
    String(text == null ? "" : text).split(/\r?\n/).forEach(function (ln) {
      ln = ln.trim(); if (!ln || ln[0] === "#") return;
      var c = ln.split(/[,\s]+/).map(parseFloat);
      if (c.length >= 2 && isFinite(c[0]) && isFinite(c[1])) {
        var s = c[1] > 1 ? c[1] / 100 : c[1];
        if (c[0] >= 0 && s >= 0 && s <= 1.0001) out.push({ t: c[0], s: Math.min(1, s) });
      }
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  // Fuse exact registry anchors with a digitized curve. Anchors win at their own
  // times (zero digitization error); digitized points are kept only BETWEEN
  // anchors (they add shape). The result is clamped monotone non-increasing.
  function fuseCurve(digitized, anchors) {
    var EPS = 1e-9;
    var anc = (anchors || []).slice().sort(function (a, b) { return a.t - b.t; });
    var dig = (digitized || []).slice().sort(function (a, b) { return a.t - b.t; });
    var ancTimes = anc.map(function (p) { return p.t; });
    function nearAnchor(t) { for (var i = 0; i < ancTimes.length; i++) if (Math.abs(ancTimes[i] - t) < EPS) return true; return false; }
    var merged = anc.map(function (p) { return { t: p.t, s: p.s, src: "anchor" }; });
    dig.forEach(function (p) { if (!nearAnchor(p.t)) merged.push({ t: p.t, s: p.s, src: "digitized" }); });
    merged.sort(function (a, b) { return a.t - b.t; });
    // Enforce monotone non-increasing survival, ANCHOR-AWARE: anchors are exact
    // (zero digitization error) and must never be pulled down to a noisy earlier
    // digitized point — instead clamp the preceding digitized point(s) DOWN to
    // the anchor. Forward pass clamps digitized; a backward pass forces any
    // digitized point above a later anchor down to it.
    var i;
    for (i = 1; i < merged.length; i++) {
      if (merged[i].s > merged[i - 1].s) {
        if (merged[i].src === "anchor") { /* keep the anchor; fix predecessors below */ }
        else merged[i].s = merged[i - 1].s;
      }
    }
    for (i = merged.length - 2; i >= 0; i--) {
      if (merged[i].src !== "anchor" && merged[i].s < merged[i + 1].s) merged[i].s = merged[i + 1].s;
    }
    return { curve: merged, nAnchors: anc.length, nDigitized: dig.length, nFused: merged.length };
  }

  // Provenance-aware reliability tier (registry-ipd NAR-fusion benchmark bands).
  function tier(opts) {
    opts = opts || {};
    var src = opts.curveSource || "digitized";   // 'digitized' | 'registry' | 'fusion'
    var hasAtRisk = !!opts.hasAtRisk;
    if ((src === "fusion" || src === "registry") && hasAtRisk)
      return {
        tier: "A", severity: "ok", label: "FUSION — exact anchors + at-risk table",
        verdict: "Exact registry KM anchors fused with the at-risk table — the strongest input regime. Registry-IPD benchmark: ~69–92% of HRs within 20% (vs ~59–85% figure-only, ~25–53% anchor-only)."
      };
    if (src === "digitized" && hasAtRisk)
      return {
        tier: "B", severity: "ok", label: "figure-only — digitized curve + at-risk table",
        verdict: "Digitized curve + at-risk table (the classic Guyot input). Registry-IPD benchmark: ~59–85% of HRs within 20%. Supplying exact registry anchors would push this higher."
      };
    if ((src === "registry" || src === "fusion") && !hasAtRisk)
      return {
        tier: "C", severity: "flag", label: "anchor-only — NO at-risk table (censoring unidentified)",
        verdict: "Exact anchors but no number-at-risk → censoring is unidentified and the HR can attenuate or explode. Registry-IPD benchmark: only ~25–53% of HRs within 20%. Add the at-risk table."
      };
    return {
      tier: "C", severity: "warn", label: "digitized curve, no at-risk table",
      verdict: "No number-at-risk → censoring unidentified; reconstruction is unreliable. Add the at-risk table."
    };
  }

  var api = { parsePoints: parsePoints, fuseCurve: fuseCurve, tier: tier };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmKmFusion = api;
})(typeof window !== "undefined" ? window : globalThis);
