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

  // ---- Reproduction-floor audit (repro-floor-atlas, Scenario B) ----
  // A Cochrane reader reconstructs each trial's log-effect and SE from the forest
  // plot, which shows them to ~2 dp. Re-pooling those rounded values (fixed-effect
  // inverse-variance) should land within the declared precision of the pool built
  // from machine-precision inputs. When it doesn't, the published 2-dp result is
  // not reproducible from what the paper actually prints. Scenario B is the lens
  // that matches a studies bus (forest-plot-extractable yi/se), not raw counts.
  //
  // numpy half-even rounding (np.round) is replicated exactly: ties round to the
  // even digit (0.125 -> 0.12, 0.135 -> 0.14), so the JS floor matches the atlas.
  function roundHalfEven(x, dp) {
    if (!isFinite(x)) return x;
    var f = Math.pow(10, dp), y = x * f, fl = Math.floor(y), diff = y - fl, r;
    if (Math.abs(diff - 0.5) < 1e-9) r = (fl % 2 === 0) ? fl : fl + 1;
    else r = Math.round(y);
    return r / f;
  }
  function _poolFE(yi, vi) {
    var eps = 2.220446049250313e-16, sw = 0, swy = 0;
    for (var i = 0; i < yi.length; i++) { var v = vi[i] > 0 ? vi[i] : eps, w = 1 / v; sw += w; swy += w * yi[i]; }
    return swy / sw;
  }
  function reproFloorAudit(yi, sei, dp) {
    dp = dp == null ? 2 : dp;
    if (!yi || !sei || yi.length < 1 || sei.length !== yi.length) return null;
    var vi = sei.map(function (s) { return s * s; });
    var truth = _poolFE(yi, vi);
    var yiR = yi.map(function (y) { return roundHalfEven(y, dp); });
    var seR = sei.map(function (s) { return roundHalfEven(s, dp); });
    var rounded = _poolFE(yiR, seR.map(function (s) { return s * s; }));
    var delta = rounded - truth, absDelta = Math.abs(delta);
    var adaptiveThreshold = 0.5 * Math.pow(10, -dp);
    return {
      k: yi.length, declaredDp: dp,
      truthPooled: truth, roundedPooled: rounded,
      delta: delta, absDelta: absDelta,
      exceedsFixed: absDelta >= 0.005,            // Cochrane 2-dp CI half-width
      exceedsAdaptive: absDelta >= adaptiveThreshold,
      adaptiveThreshold: adaptiveThreshold,
      reproducible: absDelta < adaptiveThreshold
    };
  }

  // ---- Fragility robustness (fragility-atlas) ----
  // Re-analyse one MA across a grid of defensible analytical choices and score how
  // often the conclusion (effect direction AND significance) survives, relative to
  // the standard DL-Wald reference. classifyRobustness is the atlas's classifier
  // (src/classifier.py) ported verbatim — the agreement rule, the robustness % and
  // the Robust/Moderate/Fragile/Unstable bins. fragilityRobustness runs the grid on
  // the R-verified ma-core (a BROWSER SUBSET: 4 variance estimators x 2 CI methods
  // + leave-one-out; the full atlas adds SJ/HS/HE, t-dist CIs and trim-and-fill /
  // PET-PEESE bias corrections in R, so the % here is not the atlas's published
  // number — same lens, audited engine, smaller grid).
  function classifyRobustness(specs, refDir, refSig) {
    var total = specs.length;
    if (!total) return null;
    var agree = 0, reversed = 0, sig = 0;
    for (var i = 0; i < total; i++) {
      var s = specs[i];
      if (s.direction === refDir && s.isSignificant === refSig) agree++;
      if (s.isSignificant && s.direction !== refDir) reversed++;
      if (s.isSignificant) sig++;
    }
    var robustness = agree / total * 100;
    var classification = robustness >= 90 ? "Robust"
      : robustness >= 70 ? "Moderate"
      : robustness >= 50 ? "Fragile" : "Unstable";
    return {
      totalSpecs: total, agreeingSpecs: agree,
      robustnessScore: robustness, classification: classification,
      fracReversed: reversed / total, fracSignificant: sig / total
    };
  }
  function fragilityRobustness(yi, vi, pool) {
    pool = resolvePool(pool);
    if (!pool || !yi || yi.length < 3) return null;   // LOO needs k>=3 to be meaningful
    var ESTS = ["FE", "DL", "REML", "PM"], CIS = [false, true];
    function specOf(r) { return { theta: r.mu, direction: r.mu >= 0 ? 1 : -1, isSignificant: (r.ciLo > 0 || r.ciHi < 0) }; }
    var specs = [], ref = null;
    try {
      for (var a = 0; a < ESTS.length; a++) {
        for (var b = 0; b < CIS.length; b++) {
          var r = pool(yi, vi, { method: ESTS[a], knha: CIS[b], knhaFloor: true });
          var sp = specOf(r); specs.push(sp);
          if (ESTS[a] === "DL" && CIS[b] === false) ref = sp;   // the reference conclusion
        }
      }
      for (var i = 0; i < yi.length; i++) {
        var yl = yi.filter(function (_, j) { return j !== i; });
        var vl = vi.filter(function (_, j) { return j !== i; });
        specs.push(specOf(pool(yl, vl, { method: "DL", knha: false })));
      }
    } catch (e) { return null; }
    if (!ref) return null;
    var out = classifyRobustness(specs, ref.direction, ref.isSignificant);
    out.k = yi.length;
    out.refDirection = ref.direction;
    out.refSignificant = ref.isSignificant;
    out.grid = ESTS.length + " estimators × " + CIS.length + " CI methods + leave-one-out";
    return out;
  }

  var api = { hksjQFloorAudit: hksjQFloorAudit, reproFloorAudit: reproFloorAudit,
    fragilityRobustness: fragilityRobustness, classifyRobustness: classifyRobustness,
    _roundHalfEven: roundHalfEven };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AtlasAudits = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
