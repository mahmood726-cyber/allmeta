/* rapidmeta-import.js — bridge a RapidMeta dashboard/config (rapidmeta-kit) into
 * the allmeta cross-tool buses so its extracted trials flow into the synthesis
 * tools (synthesis-journal PDF, review-project). Maps each RapidMeta `trial` to a
 * study effect on the analysis (log) scale:
 *   1. published effect + CI  (publishedHR / hrLCI / hrUCI)  -> log-HR + SE
 *   2. else 2x2 counts        (tE, tN, cE, cN)               -> log-OR + SE
 *   3. else the trial is skipped (surfaced in the return, never invented)
 * It writes ONLY ma-studies (per-trial effects). The pooled estimate is left for
 * the consumer to compute + label, since the config carries no producer pooling.
 */
(function (global) {
  "use strict";
  var Z = 1.959963984540054;

  function logFromPublished(t) {
    var hr = t.publishedHR, lo = t.hrLCI, hi = t.hrUCI;
    if (!(isFinite(hr) && hr > 0)) return null;
    var est = Math.log(hr);
    if (isFinite(lo) && isFinite(hi) && lo > 0 && hi > 0) {
      return { est: est, se: (Math.log(hi) - Math.log(lo)) / (2 * Z), measure: t.effectMeasure || "HR" };
    }
    return null;   // a point estimate with no interval can't yield an SE
  }
  function logFromCounts(t) {
    var a = t.tE, n1 = t.tN, c = t.cE, n0 = t.cN;
    if (![a, n1, c, n0].every(function (x) { return isFinite(x) && x >= 0; })) return null;
    var b = n1 - a, d = n0 - c;
    if (b < 0 || d < 0) return null;
    // 0.5 continuity correction ONLY when a cell is zero (advanced-stats rule).
    if (a === 0 || b === 0 || c === 0 || d === 0) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; }
    var est = Math.log((a * d) / (b * c));
    var se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
    return { est: est, se: se, measure: "OR" };
  }

  // Map a RapidMeta config/export -> { studies, skipped, measure, title }.
  function toStudies(config) {
    config = config || {};
    var trials = config.trials || config.studies || [];
    var studies = [], skipped = [], measure = null;
    trials.forEach(function (t) {
      var label = t.name || t.author || t.label || t.nct || "Study";
      if (t.year) label += " " + t.year;
      var m = logFromPublished(t) || logFromCounts(t);
      if (m && isFinite(m.est) && isFinite(m.se) && m.se > 0) {
        studies.push({ label: label, est: m.est, se: m.se });
        if (!measure) measure = m.measure;
      } else {
        skipped.push({ label: label, reason: "no usable effect (need publishedHR+CI or 2x2 counts)" });
      }
    });
    var title = config.title || (config.pico && config.pico.out) ||
      (config.drug && config.condition ? config.drug + " for " + config.condition : "Evidence synthesis");
    return { studies: studies, skipped: skipped, measure: measure || "OR", title: title };
  }

  // Write the mapped trials onto the ma-studies bus (effects are on the log scale,
  // matching the bus convention for ratio measures), and — so the consumer knows
  // the scale/measure — a ma-pooled entry computed here via ma-core (REML+HKSJ),
  // with a `model` string that DISCLOSES it was pooled by this bridge (the config
  // carries no producer pooling). Returns the mapping summary.
  function loadToBus(config) {
    var mapped = toStudies(config);
    if (!global.MaStudies) throw new Error("MaStudies bus not loaded");
    global.MaStudies.write(mapped.studies.map(function (s) { return { label: s.label, est: s.est, se: s.se }; }));
    if (global.MaPooled && mapped.studies.length) {
      try { global.MaPooled.clear(); } catch (_) {}
      var pooled = computePool(mapped.studies);
      if (pooled && global.MaPooled.add) {
        // The bridge IS the producer in this flow: it pools the imported trials
        // (REML+HKSJ) and publishes the finished estimate, per the ma-pooled contract.
        // model is the bus enum ("random"); the import banner names the source.
        global.MaPooled.add({
          pointEstimate: Math.exp(pooled.mu), ciLo: Math.exp(pooled.lo), ciHi: Math.exp(pooled.hi),
          scale: "ratio", measure: mapped.measure, k: mapped.studies.length, label: mapped.title,
          model: "random"
        });
      }
    }
    return mapped;
  }
  function computePool(studies) {
    var yi = studies.map(function (s) { return s.est; }), vi = studies.map(function (s) { return s.se * s.se; });
    if (global.AlmMaCore && global.AlmMaCore.pool) {
      try { var r = global.AlmMaCore.pool(yi, vi, { method: "REML", knha: true, knhaFloor: true }); return { mu: r.mu, lo: r.ciLo, hi: r.ciHi }; } catch (_) {}
    }
    var sw = 0, swy = 0; for (var i = 0; i < yi.length; i++) { var w = 1 / vi[i]; sw += w; swy += w * yi[i]; }
    var mu = swy / sw, se = Math.sqrt(1 / sw); return { mu: mu, lo: mu - Z * se, hi: mu + Z * se };
  }

  var api = { toStudies: toStudies, loadToBus: loadToBus, _logFromPublished: logFromPublished, _logFromCounts: logFromCounts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RapidMetaImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
