/* shared/transitivity-v1.js — transitivity screening + representativeness map.
 *
 * Integrated idea from the glp1-obesity-mbnma workstreams C (transitivity) and
 * I (representativeness). Two generalisability checks rarely automated in SR
 * tools:
 *   1. TRANSITIVITY — the core NMA validity assumption. Tabulates each effect
 *      modifier across the network's nodes/comparisons and flags modifiers
 *      whose distribution differs substantially (those comparisons are not
 *      exchangeable). A SCREEN, not a hypothesis test.
 *   2. REPRESENTATIVENESS — compares the trial population to a target
 *      population per modifier (over/under-representation), so external
 *      validity (and whether effects need transporting) is explicit.
 *
 * Pure + dual-mode (node-testable). Browser global: window.AlmTransitivity.
 */
(function (global) {
  "use strict";

  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  // trials: [{node, mods:{modId:value}}]; modifiers: [{id,name}].
  // For each modifier, the spread of its NODE means across the network. A large
  // coefficient of variation = the modifier differs across comparisons →
  // transitivity threat. `flagThreshold` is the relative-spread (CV) cut.
  function assessTransitivity(input) {
    input = input || {};
    var trials = input.trials || [];
    var modifiers = input.modifiers || [];
    var thr = input.flagThreshold != null ? input.flagThreshold : 0.15;
    var nodes = {};
    trials.forEach(function (t) { if (!t || t.node == null) return; (nodes[t.node] = nodes[t.node] || []).push(t); });
    var nodeNames = Object.keys(nodes);

    var rows = modifiers.map(function (mod) {
      var nodeMeans = {};
      nodeNames.forEach(function (n) {
        var vals = nodes[n].map(function (t) { return (t.mods || {})[mod.id]; }).filter(isNum);
        if (vals.length) nodeMeans[n] = mean(vals);
      });
      var ms = Object.keys(nodeMeans).map(function (n) { return nodeMeans[n]; });
      if (ms.length < 2) return { id: mod.id, name: mod.name, nodeMeans: nodeMeans, nNodes: ms.length, status: "na", note: "<2 nodes with data" };
      var mn = Math.min.apply(null, ms), mx = Math.max.apply(null, ms), overall = mean(ms), spread = sd(ms);
      var cv = overall !== 0 ? spread / Math.abs(overall) : (spread > 0 ? Infinity : 0);
      return {
        id: mod.id, name: mod.name, nodeMeans: nodeMeans, nNodes: ms.length,
        min: mn, max: mx, range: mx - mn, overallMean: overall, spread: spread, cv: cv,
        status: cv > thr ? "flag" : "ok"
      };
    });
    var flags = rows.filter(function (r) { return r.status === "flag"; }).length;
    var assessed = rows.filter(function (r) { return r.status !== "na"; }).length;
    return {
      modifiers: rows, nodes: nodeNames, nNodes: nodeNames.length, flags: flags, assessed: assessed,
      verdict: flags
        ? (flags + " modifier" + (flags === 1 ? "" : "s") + " vary substantially across the network — transitivity is questionable; consider network meta-regression, subgrouping, or restricting the network.")
        : (assessed
          ? "No assessed modifier varies substantially across nodes — transitivity is plausible on these modifiers (a screen, not proof; unmeasured modifiers may still differ)."
          : "Not enough node-level data to screen transitivity.")
    };
  }

  // trial/target: {modId:{mean, sd?}}; modifiers: [{id,name}].
  // Standardised difference (diff / target SD when available, else relative
  // diff) flags modifiers where the trial population is over/under-represented.
  function assessRepresentativeness(input) {
    input = input || {};
    var modifiers = input.modifiers || [], trial = input.trial || {}, target = input.target || {};
    var z = input.flagZ != null ? input.flagZ : 0.5;
    var rel = input.flagRel != null ? input.flagRel : 0.15;
    var rows = modifiers.map(function (mod) {
      var tv = trial[mod.id], gv = target[mod.id];
      if (!tv || !gv || !isNum(tv.mean) || !isNum(gv.mean)) return { id: mod.id, name: mod.name, status: "na", note: "missing value" };
      var diff = tv.mean - gv.mean;
      var sdRef = isNum(gv.sd) && gv.sd > 0 ? gv.sd : (isNum(tv.sd) && tv.sd > 0 ? tv.sd : null);
      var stdDiff = sdRef ? diff / sdRef : null;
      var relDiff = gv.mean !== 0 ? diff / Math.abs(gv.mean) : null;
      var big = stdDiff != null ? Math.abs(stdDiff) > z : (relDiff != null ? Math.abs(relDiff) > rel : false);
      return {
        id: mod.id, name: mod.name, trialMean: tv.mean, targetMean: gv.mean, diff: diff,
        stdDiff: stdDiff, relDiff: relDiff, direction: diff > 0 ? "over" : "under", status: big ? "flag" : "ok"
      };
    });
    var flags = rows.filter(function (r) { return r.status === "flag"; }).length;
    var assessed = rows.filter(function (r) { return r.status !== "na"; }).length;
    return {
      modifiers: rows, flags: flags, assessed: assessed,
      verdict: flags
        ? (flags + " modifier" + (flags === 1 ? "" : "s") + " differ substantially from the target — the evidence may not be representative; effects may not transport without adjustment (see the Transportability app).")
        : (assessed
          ? "The trial population matches the target on the assessed modifiers — the evidence is broadly representative."
          : "Not enough paired modifier data to assess representativeness.")
    };
  }

  var api = { assessTransitivity: assessTransitivity, assessRepresentativeness: assessRepresentativeness, _sd: sd, _mean: mean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTransitivity = api;
})(typeof window !== "undefined" ? window : globalThis);
