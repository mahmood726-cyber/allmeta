/* shared/doi-lfk.js — Doi plot & LFK index (Furuya-Kanamori, Barendregt & Doi 2018).
 *
 * A small-study / publication-bias diagnostic that replaces the funnel plot: studies are
 * placed by effect size against a precision-weighted |Z-score|, and the LFK index measures
 * the asymmetry of the resulting "doi" shape. |LFK| ≤ 1 = no asymmetry, 1–2 = minor, > 2 =
 * major. More sensitive than Egger's test when the number of studies is small.
 *
 * Algorithm (matches metasens::lfkindex exactly):
 *   sort by TE; Nᵢ = 100·max(var)/varᵢ; mid-ranks cumulate (N₁/2, then +(Nᵢ₋₁+Nᵢ)/2);
 *   percentileᵢ = (midRankᵢ − 0.5)/ΣN; zᵢ = Φ⁻¹(percentileᵢ); TE.j = TE at min|z|;
 *   LFK = 5/(2K) · Σ[ zᵢ + ((max z − min z)/(max(TE−TE.j) − min(TE−TE.j)))·(TEᵢ − TE.j) ].
 *
 * Verified vs metasens::lfkindex to ~1e-6 (strong-asymmetry set → 6.68755816 "major";
 * near-symmetric set → 0.63617512 "no asymmetry").
 *
 * Reference: Furuya-Kanamori L, Barendregt JJ, Doi SAR (2018), Int J Evid Based Healthc
 * 16(4):195-203.
 */
(function (global) {
  "use strict";

  function _qnorm(p) {
    if (global.AlmMaCore && global.AlmMaCore._qnorm) return global.AlmMaCore._qnorm(p);
    // Acklam fallback
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // lfk(TE, seTE) → { lfk, interpretation, points:[{te,z}], TEj }.
  function lfk(TE, seTE) {
    var K = TE.length;
    var ord = TE.map(function (_, i) { return i; }).sort(function (a, b) { return TE[a] - TE[b]; });
    var te = ord.map(function (i) { return TE[i]; }), se = ord.map(function (i) { return seTE[i]; });
    var varTE = se.map(function (s) { return s * s; });
    var maxVar = Math.max.apply(null, varTE);
    var N = varTE.map(function (v) { return 100 * maxVar / v; });
    var mid = new Array(K); mid[0] = N[0] / 2;
    for (var i = 1; i < K; i++) mid[i] = mid[i - 1] + (N[i - 1] + N[i]) / 2;
    var sumN = N.reduce(function (a, b) { return a + b; }, 0);
    var z = mid.map(function (m) { return _qnorm((m - 0.5) / sumN); });
    var jmin = 0; for (var j = 1; j < K; j++) if (Math.abs(z[j]) < Math.abs(z[jmin])) jmin = j;
    var TEj = te[jmin];
    var zmax = Math.max.apply(null, z), zmin = Math.min.apply(null, z);
    var dte = te.map(function (t) { return t - TEj; });
    var dteSpread = Math.max.apply(null, dte) - Math.min.apply(null, dte);
    if (dteSpread === 0) {
      var pts0 = te.map(function (t, i) { return { te: t, z: z[i], absz: Math.abs(z[i]) }; });
      return { lfk: 0, interpretation: "no asymmetry (degenerate: all effects equal)", points: pts0, TEj: TEj };
    }
    var slope = (zmax - zmin) / dteSpread;
    var s = 0; for (var k = 0; k < K; k++) s += z[k] + slope * (te[k] - TEj);
    var index = 5 / (2 * K) * s;
    var ax = Math.abs(index);
    var interp = ax <= 1 ? "no asymmetry" : ax <= 2 ? "minor asymmetry" : "major asymmetry";
    var points = te.map(function (t, i) { return { te: t, z: z[i], absz: Math.abs(z[i]) }; });
    return { lfk: index, interpretation: interp, points: points, TEj: TEj };
  }

  var api = { lfk: lfk };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDoiLFK = api;
})(typeof window !== "undefined" ? window : globalThis);
