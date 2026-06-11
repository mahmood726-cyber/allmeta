/* shared/registry-pubbias-v1.js — registry-aware publication bias.
 *
 * Integrated idea from the glp1-obesity-mbnma registry-pubbias arm. Ordinary
 * publication-bias methods (Egger / trim-fill / Copas) can only INFER missing
 * evidence from the published funnel — low power, and they cannot tell true
 * suppression from look-alike small-study heterogeneity. The trial registry
 * turns this into a MEASUREMENT problem: the posted-but-unpublished "ghost"
 * trials are OBSERVED, so the bias is measured directly (published-only pool vs
 * registry-complete pool), and that ground truth DISAMBIGUATES the inference —
 * catching both missed bias and SPURIOUS trim-fill "corrections".
 *
 * Reuses the audited engines: AlmMaCore.pool (Paule-Mandel RE) + AlmEgger. It
 * computes nothing new — it measures, then compares to what inference concludes.
 * Pure + dual-mode. Browser global: window.AlmRegistryPubbias.
 *
 * Inputs: published / ghosts = [{label, est, se}] on the analysis scale.
 */
(function (global) {
  "use strict";

  function clean(rows) { return (rows || []).filter(function (r) { return r && isFinite(r.est) && isFinite(r.se) && r.se > 0; }); }
  function pool(rows) {
    if (!global.AlmMaCore || rows.length < 1) return null;
    return global.AlmMaCore.pool(rows.map(function (r) { return r.est; }), rows.map(function (r) { return r.se * r.se; }), { method: "PM" });
  }
  function summ(p, k) { return p ? { mu: p.mu, se: p.se, ciLo: p.ciLo, ciHi: p.ciHi, tau2: p.tau2, i2: p.I2, k: k } : null; }

  function assess(input) {
    input = input || {};
    var published = clean(input.published), ghosts = clean(input.ghosts);
    if (published.length < 2) return { ok: false, error: "need ≥2 published studies" };
    var pub = pool(published);
    var complete = pool(published.concat(ghosts));
    if (!pub) return { ok: false, error: "AlmMaCore (pooling engine) not loaded" };

    var hasGhostData = ghosts.length > 0;
    var measuredShift = (hasGhostData && complete) ? complete.mu - pub.mu : 0;
    // a shift is "meaningful" if the registry-complete mean leaves the published 95% CI
    var meaningfulShift = Math.abs(measuredShift) > 1.96 * pub.se;

    var eg = global.AlmEgger ? global.AlmEgger.eggerTest(published.map(function (r) { return { y: r.est, se: r.se }; })) : null;
    var eggerAsym = !!(eg && eg.p < 0.10);

    var classification, verdict;
    if (!hasGhostData) {
      classification = "inference-only";
      verdict = eggerAsym
        ? "No observed ghost trials supplied — only Egger inference is available; it flags asymmetry (p=" + eg.p.toFixed(3) + ") but cannot separate true suppression from small-study heterogeneity. Add the registry's posted-but-unpublished trials to MEASURE the bias directly."
        : "No observed ghosts; Egger shows no asymmetry (p=" + (eg ? eg.p.toFixed(3) : "n/a") + "). Whether unpublished trials exist is unknown — check the registry (CT.gov) for completed-but-unreported trials.";
    } else if (meaningfulShift) {
      classification = "measured-bias";
      verdict = "MEASURED reporting bias: adding the observed ghost trial(s) shifts the pool from " + pub.mu.toFixed(2) + " to " + complete.mu.toFixed(2) + " (" + (measuredShift > 0 ? "+" : "") + measuredShift.toFixed(2) + "), beyond the published-set precision. A real missing-evidence effect — measured, not inferred.";
    } else if (eggerAsym) {
      classification = "spurious-asymmetry";
      verdict = "Egger flags funnel asymmetry (p=" + eg.p.toFixed(3) + ") on the published set — but the registry OBSERVES the ghost trial(s), whose pooled contribution is negligible (shift " + (measuredShift > 0 ? "+" : "") + measuredShift.toFixed(2) + ", within published precision). The asymmetry is small-study HETEROGENEITY, not suppression: a trim-and-fill correction here would be SPURIOUS. The registry prevents a wrong 'correction'.";
    } else {
      classification = "no-bias";
      verdict = "No meaningful reporting bias: the observed ghost trial(s) barely move the pool (shift " + (measuredShift > 0 ? "+" : "") + measuredShift.toFixed(2) + ") and Egger shows no asymmetry (p=" + (eg ? eg.p.toFixed(3) : "n/a") + ").";
    }

    return {
      ok: true,
      published: summ(pub, published.length),
      complete: summ(complete, published.length + ghosts.length),
      measuredShift: measuredShift, meaningfulShift: meaningfulShift, hasGhostData: hasGhostData,
      egger: eg ? { intercept: eg.intercept, p: eg.p, k: eg.k } : null, eggerAsymmetry: eggerAsym,
      classification: classification, verdict: verdict
    };
  }

  var api = { assess: assess };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRegistryPubbias = api;
})(typeof window !== "undefined" ? window : globalThis);
