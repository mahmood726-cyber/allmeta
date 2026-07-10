/* shared/fragility.js — fragility index for a binary-outcome meta-analysis.
 *
 * The minimum number of single-patient event-status modifications (added greedily across
 * studies) needed to flip the pooled result's statistical significance — a transparency
 * metric for how robust a significant (or non-significant) meta-analysis is.
 *
 * Greedy procedure (matches the `fragility` R package, frag.ma, for a SIGNIFICANT result):
 * with the effect below the null (CI upper < 0 on the log scale, "less"=TRUE) each step
 * tries, in every modifiable study, a single ±1 event change in the toward-null direction
 * — control events −1 or treatment events +1 — recomputes the DerSimonian-Laird pooled CI,
 * and permanently applies the modification that pushes the watched CI bound (upper, for
 * "less") furthest toward the null; it stops when that bound reaches the null. FI = number
 * of modifications (the flipping one included). Mirror logic for an effect above the null.
 *
 * Pooling reproduces metafor::rma.uni(measure, method="DL", test="z") incl. escalc's
 * add=1/2-to-zero-cell-studies and drop00 conventions; the DL pool delegates to ma-core.
 *
 * Verified vs fragility::frag.ma(measure="OR", method="DL"): a 5-study set with pooled
 * OR<1 (p=0.00115) → FI = 13.
 *
 * Reference: Atal I, Porcher R, Boutron I, Ravaud P (2019), J Clin Epidemiol 111:58-67;
 * Lin L (2021), R package `fragility`.
 */
(function (global) {
  "use strict";

  var Z975 = 1.959963984540054;

  // escalc for one study (measure OR/RR/RD) with metafor add=1/2/to="only0"/drop00.
  // rows: {a:e1, b:ne1, c:e0, d:ne0}. Returns {yi, vi} or null if dropped.
  function _escalc(a, b, c, d, measure) {
    if ((a === 0 && c === 0) || (b === 0 && d === 0)) return null; // drop00
    var aa = a, bb = b, cc = c, dd = d;
    if (a === 0 || b === 0 || c === 0 || d === 0) { aa += 0.5; bb += 0.5; cc += 0.5; dd += 0.5; }
    if (measure === "RD") {
      var p1 = aa / (aa + bb), p0 = cc / (cc + dd);
      return { yi: p1 - p0, vi: aa * bb / Math.pow(aa + bb, 3) + cc * dd / Math.pow(cc + dd, 3) };
    }
    if (measure === "RR") {
      return { yi: Math.log((aa / (aa + bb)) / (cc / (cc + dd))), vi: 1 / aa - 1 / (aa + bb) + 1 / cc - 1 / (cc + dd) };
    }
    return { yi: Math.log((aa * dd) / (bb * cc)), vi: 1 / aa + 1 / bb + 1 / cc + 1 / dd }; // OR
  }

  // DL pooled CI (z) on the kept studies. data: arrays a,b,c,d. → {mu, ciLo, ciHi} or null.
  function _pool(a, b, c, d, measure) {
    var yi = [], vi = [];
    for (var i = 0; i < a.length; i++) {
      var e = _escalc(a[i], b[i], c[i], d[i], measure);
      if (e) { yi.push(e.yi); vi.push(e.vi); }
    }
    if (yi.length < 1) return null;
    if (yi.length === 1) { var se1 = Math.sqrt(vi[0]); return { mu: yi[0], ciLo: yi[0] - Z975 * se1, ciHi: yi[0] + Z975 * se1 }; }
    var r = global.AlmMaCore.pool(yi, vi, { method: "DL" });
    return { mu: r.mu, ciLo: r.ciLo, ciHi: r.ciHi };
  }

  // fragility(studies, {measure}) — studies: [{e1,n1,e0,n0}]. null.val = 0 (log) / 0 (RD).
  // Returns { FI, FQ, dir, pooled:{est,lo,hi}, modifications:[{study,arm,dir}] }.
  function fragility(studies, opts) {
    opts = opts || {};
    var measure = opts.measure || "OR";
    var a = studies.map(function (s) { return s.e1; });          // treatment events
    var b = studies.map(function (s) { return s.n1 - s.e1; });   // treatment non-events
    var c = studies.map(function (s) { return s.e0; });          // control events
    var d = studies.map(function (s) { return s.n0 - s.e0; });   // control non-events
    var totalN = studies.reduce(function (t, s) { return t + s.n1 + s.n0; }, 0);

    var ori = _pool(a, b, c, d, measure);
    if (!ori) return { FI: NaN, dir: "undefined" };
    var sig = (ori.ciHi < 0) || (ori.ciLo > 0);
    if (!sig) return { FI: NaN, FQ: NaN, dir: "result is not significant (non-sig FI not computed)", pooled: { est: ori.mu, lo: ori.ciLo, hi: ori.ciHi } };
    var less = ori.ciHi < 0; // effect below null → move CI upper up toward 0
    var mods = [], moremod = true, guard = 0;

    while (sig && moremod && guard++ < 100000) {
      // modifiable candidates this step
      var cand = [];
      for (var i = 0; i < a.length; i++) {
        if (less ? (c[i] > 0) : (d[i] > 0)) cand.push({ s: i, grp: 0 });       // control arm
        if (less ? (a[i] < a[i] + b[i]) : (a[i] > 0)) cand.push({ s: i, grp: 1 }); // treatment arm has room
      }
      // (treatment room check uses n1=a+b)
      cand = cand.filter(function (k) { return k.grp === 0 ? true : (less ? (a[k.s] < studies[k.s].n1) : (a[k.s] > 0)); });
      if (!cand.length) { moremod = false; break; }
      var best = null;
      for (var j = 0; j < cand.length; j++) {
        var k = cand[j];
        var aT = a.slice(), bT = b.slice(), cT = c.slice(), dT = d.slice();
        if (k.grp === 0) { var m0 = less ? -1 : 1; cT[k.s] += m0; dT[k.s] -= m0; }
        else { var m1 = less ? 1 : -1; aT[k.s] += m1; bT[k.s] -= m1; }
        var p = _pool(aT, bT, cT, dT, measure);
        var bound = less ? p.ciHi : p.ciLo;
        var flip = less ? (p.ciHi >= 0) : (p.ciLo <= 0);
        // choose furthest toward null: max ciHi (less) / min ciLo (!less)
        if (best === null || (less ? bound > best.bound : bound < best.bound)) best = { k: k, bound: bound, flip: flip, aT: aT, bT: bT, cT: cT, dT: dT };
        if (flip) { best = { k: k, bound: bound, flip: true, aT: aT, bT: bT, cT: cT, dT: dT }; break; }
      }
      a = best.aT; b = best.bT; c = best.cT; d = best.dT;
      mods.push({ study: best.k.s + 1, arm: best.k.grp === 0 ? "control" : "treatment", dir: best.k.grp === 0 ? (less ? -1 : 1) : (less ? 1 : -1) });
      if (best.flip) sig = false;
    }
    var FI = sig ? NaN : mods.length;
    return {
      FI: FI, FQ: sig ? NaN : FI / totalN, dir: sig ? "significance cannot be altered" : "significance altered to non-significance",
      pooled: { est: ori.mu, lo: ori.ciLo, hi: ori.ciHi }, modifications: mods,
    };
  }

  var api = { fragility: fragility, _pool: _pool, _escalc: _escalc };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmFragility = api;
})(typeof window !== "undefined" ? window : globalThis);
