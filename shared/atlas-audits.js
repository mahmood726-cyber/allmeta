/* atlas-audits.js — per-meta-analysis AUDITS from the author's corpus-scale
 * "atlas" projects, ported so a single review can be checked against the same
 * lens that was run across the whole Pairwise70 / CDSR corpus. Each audit takes
 * one MA's studies and returns its own verdict; the corpus headline (run across
 * thousands of MAs) is shown alongside for context, never recomputed here.
 *
 * These DELEGATE the actual pooling to the R-verified shared/ma-core.js — they
 * add only the floored-vs-unfloored / reproduce-vs-published comparison logic,
 * so there is no second copy of tau^2/HKSJ math to drift (see allmeta-ma-core).
 *
 *   hksjQFloorAudit — hksj-q-floor-atlas: in the I^2=0 regime (Q < k-1), raw
 *                     (un-floored) HKSJ shrinks the SE below the REML+Wald SE,
 *                     manufacturing precision the data don't support. RevMan-2025
 *                     floors it at max(1, Q/(k-1)) == max(HKSJ_SE, Wald_SE). This
 *                     reports, for THIS MA, how much the floor matters.
 */
(function (global) {
  "use strict";

  function resolvePool(pool) {
    if (typeof pool === "function") return pool;
    var C = global.AlmMaCore;
    return C && typeof C.pool === "function" ? C.pool : null;
  }
  function ciExcludesNull(lo, hi) { return lo > 0 || hi < 0; }

  // ---- HKSJ Q-floor audit (hksj-q-floor-atlas) ----
  // floored   = REML + HKSJ with the max(1, Q/(k-1)) clamp (RevMan-2025 default).
  // unfloored = REML + raw HKSJ (no clamp); SE can fall below the Wald SE when
  //             Q < k-1, and reaches 0 when Q = 0 (zero-width CI = false precision).
  // The width ratio (floored / unfloored) is >= 1 by construction, and infinite
  // when Q = 0. A flip from significant (unfloored) to non-significant (floored)
  // is the honest, conservative direction; the reverse is mathematically impossible.
  function hksjQFloorAudit(yi, vi, pool) {
    pool = resolvePool(pool);
    if (!pool || !yi || yi.length < 2) return null;
    var fl, un;
    try {
      fl = pool(yi, vi, { method: "REML", knha: true, knhaFloor: true });
      un = pool(yi, vi, { method: "REML", knha: true, knhaFloor: false });
    } catch (e) { return null; }
    if (!fl || !un) return null;
    var wFloored = fl.ciHi - fl.ciLo, wUnfloored = un.ciHi - un.ciLo;
    var qZero = wUnfloored <= 1e-12;
    var widthRatio = qZero ? Infinity : wFloored / wUnfloored;
    // Q < k-1 (the I^2=0 regime) is exactly where the floor binds — i.e. the
    // floored CI is strictly wider than the raw one.
    var floorBinds = qZero || widthRatio > 1 + 1e-9;
    var sigUnfloored = ciExcludesNull(un.ciLo, un.ciHi);
    var sigFloored = ciExcludesNull(fl.ciLo, fl.ciHi);
    return {
      k: fl.k, tau2: fl.tau2, i2: fl.I2, estimate: fl.mu,
      seFloored: fl.se, seUnfloored: un.se,
      ciFlooredLo: fl.ciLo, ciFlooredHi: fl.ciHi,
      ciUnflooredLo: un.ciLo, ciUnflooredHi: un.ciHi,
      widthFloored: wFloored, widthUnfloored: wUnfloored,
      widthRatio: widthRatio, qZero: qZero, floorBinds: floorBinds,
      sigUnfloored: sigUnfloored, sigFloored: sigFloored,
      sigLoss: sigUnfloored && !sigFloored,   // honest direction
      Q: fl.Q
    };
  }

  var api = { hksjQFloorAudit: hksjQFloorAudit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AtlasAudits = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
