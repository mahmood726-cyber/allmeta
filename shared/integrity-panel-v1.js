/* shared/integrity-panel-v1.js — integrity-by-default trustworthiness panel.
 *
 * Auto-runs allmeta's frontier integrity methods on a completed synthesis and
 * returns one structured verdict set, so a finished pool ships with a one-click
 * trustworthiness read instead of leaving those checks as optional extra apps.
 * This is the moat: no competitor bundles multiverse-robustness + small-study +
 * E-value verdicts into the certainty step.
 *
 * Reuses the audited shared engines (AlmSpecCollapse, AlmEgger, AlmEValue) — it
 * computes nothing itself, only orchestrates + interprets. Pure + dual-mode so
 * it is node-testable. Browser global: window.AlmIntegrityPanel.
 *
 * Inputs:
 *   studies: [{est, se, label?}]  — ANALYSIS scale (log for ratios; null = 0)
 *   pooled:  {pointEstimate, ciLo, ciHi, measure, scale, k}  — NATURAL scale
 */
(function (global) {
  "use strict";

  function num(x) { return typeof x === "number" && isFinite(x); }

  function specCollapseCheck(studies) {
    var base = { key: "spec-collapse", label: "Multiverse robustness", app: "../spec-collapse/" };
    if (!global.AlmSpecCollapse || !global.AlmMaCore || !global.AlmTrimFill)
      return Object.assign(base, { status: "na", verdict: "engine unavailable" });
    if (studies.length < 4)
      return Object.assign(base, { status: "na", verdict: "needs ≥4 studies for a multiverse grid" });
    try {
      var sc = global.AlmSpecCollapse.analyze(studies.map(function (s) { return { est: s.est, se: s.se }; }));
      var naive = sc.naive, wl = sc.weighted;
      var falseRobust = naive.verdict === "robust" && wl.verdict === "fragile";
      return Object.assign(base, {
        status: falseRobust ? "flag" : (naive.verdict === "robust" ? "ok" : "warn"),
        verdict: falseRobust ? "FALSE-ROBUST — nominal significance collapses under multiverse correction"
          : naive.verdict === "robust" ? "Robust — significance survives the multiverse-corrected pool"
            : "Not nominally significant in the naive pool",
        detail: "naive IV-RE " + naive.verdict + " vs weighted-likelihood " + wl.verdict
          + "; spec-concordance " + sc.concordance.verdict
      });
    } catch (e) { return Object.assign(base, { status: "na", verdict: "could not run (" + e.message + ")" }); }
  }

  function eggerCheck(studies) {
    var base = { key: "egger", label: "Small-study effects (Egger)", app: "../reporting-bias/" };
    if (!global.AlmEgger) return Object.assign(base, { status: "na", verdict: "engine unavailable" });
    var eg = global.AlmEgger.eggerTest(studies.map(function (s) { return { y: s.est, se: s.se }; }));
    if (!eg) return Object.assign(base, { status: "na", verdict: "needs ≥3 studies with varying SE" });
    var asym = eg.p < 0.10;
    return Object.assign(base, {
      status: asym ? "flag" : "ok",
      verdict: asym ? "Funnel asymmetry detected (p=" + eg.p.toFixed(3) + ") — possible reporting/small-study bias"
        : "No funnel asymmetry (p=" + eg.p.toFixed(3) + ")",
      detail: "bias intercept " + eg.intercept.toFixed(2) + ", k=" + eg.k
        + (eg.k < 10 ? " — low power (k<10), interpret cautiously" : "")
    });
  }

  function eValueCheck(pooled) {
    var base = { key: "evalue", label: "E-value (unmeasured confounding)", app: "../evalue/" };
    if (!global.AlmEValue) return Object.assign(base, { status: "na", verdict: "engine unavailable" });
    if (!pooled || !num(pooled.pointEstimate)) return Object.assign(base, { status: "na", verdict: "no pooled estimate" });
    var meas = String(pooled.measure || "").toUpperCase();
    if (["HR", "OR", "RR", "SMD"].indexOf(meas) < 0)
      return Object.assign(base, { status: "na", verdict: "applies to ratio / SMD measures" });
    try {
      var ev = global.AlmEValue.eValues(meas, pooled.pointEstimate, pooled.ciLo, pooled.ciHi, {});
      return Object.assign(base, {
        status: "ok",
        verdict: "E-value " + ev.point.toFixed(2) + " (nearest-CI-bound " + ev.ci.toFixed(2) + ")",
        detail: ev.ci <= 1
          ? "the CI already includes the null — confounding robustness is undefined"
          : "an unmeasured confounder would need RR ≥ " + ev.ci.toFixed(2) + " with both exposure and outcome to move the CI to the null"
      });
    } catch (e) { return Object.assign(base, { status: "na", verdict: "could not run (" + e.message + ")" }); }
  }

  function assess(input) {
    input = input || {};
    var studies = (input.studies || []).filter(function (s) { return s && num(s.est) && num(s.se) && s.se > 0; });
    var pooled = input.pooled || null;

    var checks = [specCollapseCheck(studies), eggerCheck(studies), eValueCheck(pooled)];

    // checklist-based methods that genuinely need reviewer input — link, don't fake.
    var pointers = [
      { key: "inspect-sr", label: "INSPECT-SR trustworthiness", app: "../inspect-sr/", note: "21-item trustworthiness checklist + would-survive re-pool" },
      { key: "rob-me", label: "ROB-ME missing evidence", app: "../reporting-bias/", note: "Cochrane ROB-ME structured reporting-bias judgement" }
    ];

    var flags = checks.filter(function (c) { return c.status === "flag"; }).length;
    var warns = checks.filter(function (c) { return c.status === "warn"; }).length;
    var ran = checks.filter(function (c) { return c.status !== "na"; }).length;
    var summary = {
      flags: flags, warns: warns, ran: ran, k: studies.length,
      verdict: flags
        ? (flags + " integrity flag" + (flags === 1 ? "" : "s") + " — scrutinise before trusting the pooled result")
        : (ran ? "No flags from the auto-run checks — still complete the INSPECT-SR + ROB-ME checklists"
          : "Not enough data to auto-run integrity checks (need study-level effects)")
    };
    return { checks: checks, pointers: pointers, summary: summary };
  }

  var api = { assess: assess, specCollapseCheck: specCollapseCheck, eggerCheck: eggerCheck, eValueCheck: eValueCheck };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmIntegrityPanel = api;
})(typeof window !== "undefined" ? window : globalThis);
