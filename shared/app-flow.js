/* shared/app-flow.js — cross-app deep-link unification.
 *
 * Every numerical app's results panel should expose a "Continue with …"
 * row of buttons that:
 *   1. Push the current bus state (ma-studies-v1 or ma-comparisons-v1).
 *   2. Open the downstream app in a new tab with ?fromBus=1.
 *
 * This module standardises the wiring so every app uses the same
 * vocabulary + the same UX. Apps call:
 *
 *   AlmFlow.attachContinueBar({
 *     container: "#alm-flow-mount",
 *     suggestions: ["forest-plot", "funnel-plot", "influence",
 *                   "bma-tau-priors", "rve-meta", "cross-design"],
 *     getStudies: () => …,   // optional; defaults to current MaStudies.read()
 *     onBeforeOpen: (app) => …,   // optional analytics hook
 *   });
 *
 * The catalog of downstream apps + their human labels + categories
 * lives in this module so the suggestion list is a single source of
 * truth across the suite.
 */
(function (global) {
  "use strict";

  // ----- App catalog -----------------------------------------------------
  //
  // Each entry: { key, label, category, path, kind, blurb }
  //   kind = "pairwise"   — consumes ma-studies-v1 {label,est,se}
  //          "comparisons" — consumes ma-comparisons-v1 {studyId, arms, …}
  //          "either"     — works with either bus
  //          "no-bus"     — opens fresh; user re-enters data (PROSPERO etc.)

  var CATALOG = {
    // --- Pairwise effects ---
    "forest-plot":        { label: "Forest plot",        category: "Pairwise MA",
                            path: "../forest-plot/?fromBus=1", kind: "pairwise",
                            blurb: "Visualise individual study effects + pooled diamond" },
    "funnel-plot":        { label: "Funnel plot",        category: "Pairwise MA",
                            path: "../funnel-plot/?fromBus=1", kind: "pairwise",
                            blurb: "Small-study effect / publication bias" },
    "heterogeneity":      { label: "Heterogeneity",      category: "Pairwise MA",
                            path: "../heterogeneity/?fromBus=1", kind: "pairwise",
                            blurb: "I², τ², Q, prediction interval" },
    "meta-regression":    { label: "Meta-regression",    category: "Pairwise MA",
                            path: "../meta-regression/?fromBus=1", kind: "pairwise",
                            blurb: "Test a continuous study-level moderator" },
    "cumulative-subgroup":{ label: "Cumulative + subgroup", category: "Pairwise MA",
                            path: "../cumulative-subgroup/?fromBus=1", kind: "pairwise",
                            blurb: "Evidence accumulation timeline + subgroup pool" },
    "tsa":                { label: "TSA",                category: "Trial Sequential Analysis",
                            path: "../tsa/?fromBus=1", kind: "pairwise",
                            blurb: "Required information size + O'Brien-Fleming boundary" },
    "sequential-ma":      { label: "Sequential MA (α-spending)", category: "Trial Sequential Analysis",
                            path: "../sequential-ma/", kind: "pairwise",
                            blurb: "Adaptive boundaries across information looks" },
    "influence":          { label: "Influence diagnostics", category: "Pairwise MA",
                            path: "../influence/?fromBus=1", kind: "pairwise",
                            blurb: "Per-study leave-one-out, Cook's D, hat values" },
    "copas":              { label: "Copas selection",    category: "Pairwise MA",
                            path: "../copas/?fromBus=1", kind: "pairwise",
                            blurb: "Selection-bias-adjusted pooling" },
    "limit-ma":           { label: "Limit MA",           category: "Pairwise MA",
                            path: "../limit-ma/?fromBus=1", kind: "pairwise",
                            blurb: "Rücker shrinkage toward zero-variance limit" },
    "pet-peese":          { label: "PET-PEESE",          category: "Pairwise MA",
                            path: "../pet-peese/?fromBus=1", kind: "pairwise",
                            blurb: "Stanley & Doucouliagos small-study correction" },
    "pubbias-tests":      { label: "Publication-bias tests", category: "Pairwise MA",
                            path: "../pubbias-tests/?fromBus=1", kind: "pairwise",
                            blurb: "Egger, Begg, Harbord, Thompson-Sharp, Peters" },
    "gosh":               { label: "GOSH plot",          category: "Pairwise MA",
                            path: "../gosh/?fromBus=1", kind: "pairwise",
                            blurb: "Robustness of pooled effect to subset choice" },
    "gosh-metareg":       { label: "GOSH meta-regression", category: "Pairwise MA",
                            path: "../gosh-metareg/?fromBus=1", kind: "pairwise",
                            blurb: "β coefficient stability across subsets" },
    "bayesian-ma":        { label: "Bayesian MA (conjugate)", category: "Pairwise MA",
                            path: "../bayesian-ma/?fromBus=1", kind: "pairwise",
                            blurb: "Closed-form conjugate posterior" },
    "bayesian-mcmc":      { label: "Bayesian MA (MCMC)", category: "Pairwise MA",
                            path: "../bayesian-mcmc/?fromBus=1", kind: "pairwise",
                            blurb: "Full MCMC posterior + diagnostics" },
    "bma-tau-priors":     { label: "BMA across τ² priors", category: "Pairwise MA",
                            path: "../bma-tau-priors/", kind: "pairwise",
                            blurb: "Posterior averaged over prior choice" },
    "rve-meta":           { label: "RVE meta-regression", category: "Pairwise MA",
                            path: "../rve-meta/", kind: "pairwise",
                            blurb: "Cluster-robust SEs for dependent effects" },
    "cross-design":       { label: "Cross-design synthesis", category: "Pairwise MA",
                            path: "../cross-design/", kind: "pairwise",
                            blurb: "Combine RCT + observational with bias correction" },
    "cross-network":      { label: "Cross-network synthesis", category: "Network MA",
                            path: "../cross-network/", kind: "comparisons",
                            blurb: "Per-contrast bias-corrected NMA + IPD + obs" },
    "everything-model":   { label: "Everything model",   category: "Living Evidence",
                            path: "../everything-model/", kind: "pairwise",
                            blurb: "Joint outcome × time × RoB hierarchy" },
    "personalised-te":    { label: "Personalised TE",    category: "Pairwise MA",
                            path: "../personalised-te/", kind: "pairwise",
                            blurb: "Empirical Bayes subgroup shrinkage" },
    "multi-outcome-ma":   { label: "Multi-outcome MA",   category: "Pairwise MA",
                            path: "../multi-outcome-ma/", kind: "pairwise",
                            blurb: "Bivariate / K-variate REML" },
    "multi-outcome-nma":  { label: "Multi-outcome NMA",  category: "Network MA",
                            path: "../multi-outcome-nma/", kind: "comparisons",
                            blurb: "Achana 2014 multi-arm × multi-outcome" },
    "nma":                { label: "NMA (frequentist)",  category: "Network MA",
                            path: "../nma/?fromBus=1", kind: "comparisons",
                            blurb: "Contrast-based GLS pooling" },
    "nma-pro-v2":         { label: "NMA Pro v2",         category: "Network MA",
                            path: "../nma-pro-v2/", kind: "comparisons",
                            blurb: "Full network meta-analysis platform" },
    "nma-inconsistency":  { label: "NMA inconsistency",  category: "Network MA",
                            path: "../nma-inconsistency/?fromBus=1", kind: "comparisons",
                            blurb: "Node-splitting + design-by-treatment Q" },
    "nma-meta-reg":       { label: "NMA meta-regression", category: "Network MA",
                            path: "../nma-meta-reg/", kind: "comparisons",
                            blurb: "Treatment × covariate interaction model" },
    "bayesian-nma":       { label: "Bayesian NMA",       category: "Network MA",
                            path: "../bayesian-nma/?fromBus=1", kind: "comparisons",
                            blurb: "Hierarchical Bayesian network pool" },
    "bucher":             { label: "Bucher ITC",         category: "Network MA",
                            path: "../bucher/?fromBus=1", kind: "comparisons",
                            blurb: "Indirect comparison (single loop)" },
    "component-nma":      { label: "Component NMA",      category: "Network MA",
                            path: "../component-nma/?fromBus=1", kind: "comparisons",
                            blurb: "Additive component model" },
    "nma-global-inconsistency": { label: "Global inconsistency", category: "Network MA",
                            path: "../nma-global-inconsistency/?fromBus=1", kind: "comparisons",
                            blurb: "decomp.design + Cochrane Q" },
    "rare-events-glmm":   { label: "Rare-events GLMM",   category: "Pairwise MA",
                            path: "../rare-events-glmm/", kind: "pairwise",
                            blurb: "Binomial-normal GLMM (no continuity correction)" },
    "workbench":          { label: "MA Workbench",       category: "Pairwise MA",
                            path: "../workbench/?fromBus=1", kind: "pairwise",
                            blurb: "Mini-forest + funnel + cumulative dashboard" },
    "webr-validator":     { label: "Verify in R (WebR)", category: "R / WASM",
                            path: "../webr-validator/?fromBus=1", kind: "pairwise",
                            blurb: "Independent R metafor cross-check" },
    "living-rob-pool":    { label: "Living RoB pool",    category: "Living Evidence",
                            path: "../living-rob-pool/", kind: "no-bus",
                            blurb: "Time-varying RoB snapshot series" },
    "revman-importer":    { label: "RevMan importer",    category: "Screening & Extraction",
                            path: "../revman-importer/", kind: "no-bus",
                            blurb: "Cochrane .rm5 / .rm6 → bus" },
    "prospero-templater": { label: "PROSPERO templater", category: "PRISMA & Reporting",
                            path: "../prospero-templater/", kind: "no-bus",
                            blurb: "Fill the registration form" },
    "prisma-flow":        { label: "PRISMA flow",        category: "PRISMA & Reporting",
                            path: "../prisma-flow/", kind: "no-bus",
                            blurb: "2020 flow diagram + search log" },
  };

  function get(key) { return CATALOG[key] || null; }
  function list() { return Object.keys(CATALOG); }
  function byCategory(cat) {
    return Object.keys(CATALOG)
      .filter(function (k) { return CATALOG[k].category === cat; })
      .map(function (k) { return Object.assign({ key: k }, CATALOG[k]); });
  }

  // ----- Bus push helpers ------------------------------------------------

  function _pushStudies(studies) {
    if (!global.MaStudies || typeof global.MaStudies.write !== "function") return false;
    if (!Array.isArray(studies) || !studies.length) return false;
    return global.MaStudies.write(studies);
  }

  function _pushComparisons(env) {
    if (!global.MaComparisons || typeof global.MaComparisons.write !== "function") return false;
    if (!env || !env.studies || !env.studies.length) return false;
    return global.MaComparisons.write(env);
  }

  // ----- The continue-bar widget ----------------------------------------

  function _renderBar(container, items, options) {
    var html = '<div class="alm-flow-bar" role="region" aria-label="Continue this analysis with another tool"' +
      ' style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;margin-top:0.6rem;padding:0.55rem 0.7rem;background:var(--accent-soft,#e8f0f7);border:1px dashed var(--border,#d9d5cc);border-radius:6px;font-size:0.85rem">' +
      '<span style="font-weight:600;margin-right:0.3rem;color:var(--muted,#5c6470)">Continue with →</span>';
    items.forEach(function (it) {
      var info = get(it);
      if (!info) return;
      html += '<button type="button" data-alm-flow="' + it +
        '" title="' + (info.blurb || "").replace(/"/g, "&quot;") +
        '" style="background:var(--panel,#fff);color:var(--ink,#15181d);border:1px solid var(--border,#d9d5cc);' +
        'border-radius:4px;padding:0.3rem 0.65rem;font-size:0.83rem;font-weight:500;cursor:pointer;' +
        'transition:background 0.15s">' +
        info.label + '</button>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Mount a continue-bar in `opts.container` (CSS selector or HTMLElement).
   *
   *   AlmFlow.attachContinueBar({
   *     container: "#alm-flow-mount",
   *     suggestions: ["funnel-plot", "influence", "bma-tau-priors"],
   *     getStudies: () => MaStudies.read(),     // optional; defaults to bus
   *     getComparisons: () => MaComparisons.read(),  // optional for NMA apps
   *     onBeforeOpen: (key) => …,               // optional analytics
   *   });
   */
  function attachContinueBar(opts) {
    if (typeof document === "undefined") return false;
    var el = typeof opts.container === "string"
      ? document.querySelector(opts.container)
      : opts.container;
    if (!el) return false;
    var suggestions = Array.isArray(opts.suggestions) ? opts.suggestions : [];
    if (!suggestions.length) return false;

    _renderBar(el, suggestions, opts);

    el.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-alm-flow]");
      if (!btn) return;
      var key = btn.getAttribute("data-alm-flow");
      var info = get(key);
      if (!info) return;
      if (typeof opts.onBeforeOpen === "function") {
        try { opts.onBeforeOpen(key); } catch (_) { /* ignore */ }
      }

      // Push the right bus depending on the target app's kind.
      if (info.kind === "pairwise" || info.kind === "either") {
        var studies = (typeof opts.getStudies === "function")
          ? opts.getStudies()
          : (global.MaStudies && global.MaStudies.read());
        _pushStudies(studies);
      }
      if (info.kind === "comparisons" || info.kind === "either") {
        var env = (typeof opts.getComparisons === "function")
          ? opts.getComparisons()
          : (global.MaComparisons && global.MaComparisons.read());
        _pushComparisons(env);
      }
      // Open the target. window.open returns null if popup blocker engaged;
      // surface a toast in that case.
      var w = global.open(info.path, "_blank", "noopener,noreferrer");
      if (!w && global.Toast && typeof global.Toast.show === "function") {
        global.Toast.show("Pop-up blocked — allow pop-ups for allmeta to use Continue-with.", "error");
      }
    });
    return true;
  }

  // ----- Convenience: standard suggestion lists per app type -------------

  var STANDARD_PAIRWISE = [
    "funnel-plot", "influence", "heterogeneity",
    "bma-tau-priors", "cross-design", "personalised-te",
    "webr-validator",
  ];
  var STANDARD_NMA = [
    "nma-pro-v2", "nma-inconsistency", "bucher",
    "nma-meta-reg", "cross-network",
  ];
  var STANDARD_TSA = ["tsa", "sequential-ma"];

  var api = {
    CATALOG: CATALOG,
    get: get, list: list, byCategory: byCategory,
    attachContinueBar: attachContinueBar,
    STANDARD_PAIRWISE: STANDARD_PAIRWISE,
    STANDARD_NMA: STANDARD_NMA,
    STANDARD_TSA: STANDARD_TSA,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmFlow = api;
})(typeof window !== "undefined" ? window : globalThis);
