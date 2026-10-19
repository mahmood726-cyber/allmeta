/* shared/poth.js — Precision Of Treatment Hierarchy (Wigle et al. 2025).
 *
 * A single [0,1] number quantifying how CERTAIN a treatment hierarchy from a
 * network meta-analysis actually is. SUCRA/P-score point rankings ("X ranked
 * best") hide their own uncertainty; POTH summarises it. Computed purely from
 * the SUCRA (or P-score) values of the n treatments:
 *
 *   S2(n)    = (1/n) Σ_i (SUCRA_i − 0.5)^2            (SUCRAs are centred at 0.5)
 *   S2max(n) = (n+1) / (12 (n−1))                     (max, SUCRAs evenly spread)
 *   POTH(n)  = S2(n) / S2max(n) = [12(n−1)/(n+1)] · S2(n),   0 ≤ POTH ≤ 1
 *
 * POTH = 1: a fully certain hierarchy (SUCRAs maximally spread). POTH = 0: all
 * SUCRA = 0.5, treatments indistinguishable. Median ≈ 0.671 across 267 published
 * networks. advanced-stats rule: a low POTH means the hierarchy is
 * non-informative — do NOT write "X ranked best".
 *
 * Verified vs the CRAN `poth` package (poth::poth) — see tests/test_poth.py.
 * Reference: Wigle A, Béliveau A, Salanti G, et al. Precision of Treatment
 * Hierarchy. Stat Med. 2025;44:e70176. doi:10.1002/sim.70176.
 */
(function (global) {
  "use strict";

  // sucras: array of SUCRA or P-score values in [0,1] (one per treatment).
  // Returns { poth, n, s2, s2max, meanSucra } or null if n < 2 / invalid.
  function poth(sucras) {
    // A complete connected NMA ranking must contain one finite SUCRA/P-score
    // in [0,1] per treatment, and the values must average 0.5.
    if (!Array.isArray(sucras) || sucras.length < 2) return null;
    var n = sucras.length, sum = 0, sumSq = 0, i, v;
    for (i = 0; i < n; i++) {
      v = sucras[i];
      if (typeof v !== "number" || !isFinite(v) || v < 0 || v > 1) return null;
      sum += v;
    }
    var mean = sum / n;
    // Allow half a percentage point due to rounded NMA reporting.
    if (Math.abs(mean - 0.5) > 0.0050000001) return null;
    for (i = 0; i < n; i++) {
      v = sucras[i] - 0.5;
      sumSq += v * v;
    }
    var s2 = sumSq / n;
    var s2max = (n + 1) / (12 * (n - 1));
    var val = s2 / s2max;
    // Never clamp mathematically impossible rankings to certain POTH=1.
    if (!isFinite(val) || val < 0 || val > 1 + 1e-12) return null;
    if (val > 1) val = 1; // Floating-point boundary only.
    return { poth: val, n: n, s2: s2, s2max: s2max, meanSucra: mean };
  }

  // SUCRA from a rank-probability matrix P (treatments × ranks; P[i][r] =
  // prob treatment i has rank r+1). SUCRA_i = (1/(n-1)) Σ_{r<n-1} cumⱼ≤r P[i][j].
  // Provided so POTH can be computed from raw rank probabilities too.
  function sucraFromRankProbs(P) {
    var n = P.length;
    return P.map(function (row) {
      var cum = 0, acc = 0;
      for (var r = 0; r < n - 1; r++) { cum += row[r]; acc += cum; }
      return acc / (n - 1);
    });
  }

  var api = { poth: poth, sucraFromRankProbs: sucraFromRankProbs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmPOTH = api;
})(typeof window !== "undefined" ? window : globalThis);
