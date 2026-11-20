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
 * Checked against the CRAN `poth` package 0.3-0 (poth::poth) on every netmeta 3.7-0 dataset netmeta can rank
 * (P-scores, NMA-engine P-scores and rankogram rank matrices) and edge probes, within 1e-9 — validation archive
 * poth-reproducible (paper 23). tests/test_poth.py holds closed-form unit tests.
 * poth::poth() uses the uncentred form 3[(1−n)/(n+1) + 4(n−1)/(n(n+1)) Σ SUCRAᵢ²]; it equals the centred form
 * below whenever Σ SUCRAᵢ = n/2 (exact SUCRAs / P-scores). For rounded inputs that do not sum to n/2 the two differ
 * by 12(n−1)/(n(n+1))·(Σ SUCRAᵢ − n/2); the page warns when the mean is off 0.5.
 * Reference: Wigle A, Béliveau A, Salanti G, et al. Precision of Treatment
 * Hierarchy. Stat Med. 2025;44:e70176. doi:10.1002/sim.70176.
 */
(function (global) {
  "use strict";

  // sucras: array of SUCRA or P-score values in [0,1] (one per treatment).
  // Returns { poth, n, s2, s2max, meanSucra } or null if n < 2 / invalid.
  function poth(sucras) {
    // LIM-P23 F05: refuse the whole vector when any entry is not a number in [0, 1]; dropping
    // it would silently change n (and so S2max), and a hole or a string is not a score.
    if (!Array.isArray(sucras)) return null;
    for (var k = 0; k < sucras.length; k++) {
      var x = sucras[k];
      if (!(k in sucras) || typeof x !== "number" || !isFinite(x) || x < 0 || x > 1) return null;
    }
    var s = sucras.slice();
    var n = s.length;
    if (n < 2) return null;
    var sumSq = 0, sum = 0;
    for (var i = 0; i < n; i++) { sumSq += (s[i] - 0.5) * (s[i] - 0.5); sum += s[i]; }
    var s2 = sumSq / n;
    var s2max = (n + 1) / (12 * (n - 1));
    var val = s2 / s2max;            // == 12(n-1)/(n+1) * s2
    if (val < 0) val = 0; if (val > 1) val = 1; // guard tiny float overshoot
    return { poth: val, n: n, s2: s2, s2max: s2max, meanSucra: sum / n };
  }

  // SUCRA from a rank-probability matrix P (treatments × ranks; P[i][r] =
  // prob treatment i has rank r+1). SUCRA_i = (1/(n-1)) Σ_{r<n-1} cumⱼ≤r P[i][j].
  // Provided so POTH can be computed from raw rank probabilities too.
  function sucraFromRankProbs(P) {
    // LIM-P23 F07: the formula ignores the last column, so a malformed matrix would still
    // give plausible-looking SUCRAs. Require an n x n (n >= 2) matrix of finite, nonnegative
    // probabilities whose rows (treatments) and columns (ranks) each sum to 1.
    var TOL = 1e-6;
    if (!Array.isArray(P) || P.length < 2) throw new RangeError("rank-probability matrix must have at least 2 treatments");
    var n = P.length, col = [];
    for (var c = 0; c < n; c++) col.push(0);
    P.forEach(function (row, i) {
      if (!Array.isArray(row) || row.length !== n) throw new RangeError("rank-probability matrix must be square (row " + (i + 1) + ")");
      var sum = 0;
      row.forEach(function (v, j) {
        if (typeof v !== "number" || !isFinite(v) || v < 0) throw new RangeError("rank probabilities must be finite and nonnegative (row " + (i + 1) + ")");
        sum += v; col[j] += v;
      });
      if (Math.abs(sum - 1) > TOL) throw new RangeError("rank probabilities of treatment " + (i + 1) + " must sum to 1");
    });
    col.forEach(function (v, j) { if (Math.abs(v - 1) > TOL) throw new RangeError("probabilities of rank " + (j + 1) + " must sum to 1 over treatments"); });
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
