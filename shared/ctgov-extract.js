/* ctgov-extract.js — offline parser for ClinicalTrials.gov API v2 results JSON.
 *
 * Vendored and hardened from the user's `ctgov-v2-extractor` (extractor.js). The
 * original coupled a live fetch to clinicaltrials.gov with parsing; this splits them:
 *   parseResults(json)  — PURE, offline, testable (the primary path: the user pastes
 *                         or uploads the study JSON downloaded from the API).
 *   getTrialResults()   — optional online convenience (kept for parity; not used by
 *                         the offline-first studio, which never makes external calls).
 *
 * Returns: { nctId, outcomes: [{ title, type, paramType, unit, timeFrame,
 *            groups: [{ group, value, lower, upper }] }], note? , error? }
 */
(function (global) {
  "use strict";

  function nctOf(data) {
    try { return data.protocolSection.identificationModule.nctId; } catch (e) { return null; }
  }

  function parseResults(data) {
    if (!data || typeof data !== "object" || !data.protocolSection) {
      return { error: "Not a ClinicalTrials.gov API v2 study object (no protocolSection)." };
    }
    var nctId = nctOf(data);
    if (!data.resultsSection) {
      return { nctId: nctId, outcomes: [], note: "This record has no posted results." };
    }
    var oms = (data.resultsSection.outcomeMeasuresModule
      && data.resultsSection.outcomeMeasuresModule.outcomeMeasures) || [];
    var outcomes = oms.map(function (o) {
      // group id -> human title (measurements reference groups by id)
      var titleById = {};
      (o.groups || []).forEach(function (g) { if (g && g.id != null) titleById[g.id] = g.title; });
      // measurements live under classes[].categories[].measurements[]
      var cls = (o.classes && o.classes[0]) || {};
      var cat = (cls.categories && cls.categories[0]) || {};
      var meas = cat.measurements || [];
      var groups = meas.map(function (m, i) {
        return {
          group: titleById[m.groupId] || m.groupId || ("group " + (i + 1)),
          value: m.value != null ? m.value : null,
          lower: m.lowerLimit != null ? m.lowerLimit : null,
          upper: m.upperLimit != null ? m.upperLimit : null
        };
      });
      return {
        title: o.title || "(untitled outcome)",
        type: o.type || "",
        paramType: o.paramType || "",
        unit: o.unitOfMeasure || "",
        timeFrame: o.timeFrame || "",
        groups: groups
      };
    });
    return { nctId: nctId, outcomes: outcomes };
  }

  // Optional online convenience — NOT used by the offline studio. Pass a fetch impl
  // for testing; defaults to global fetch where available.
  function getTrialResults(nctId, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("no fetch available"));
    return f("https://clinicaltrials.gov/api/v2/studies/" + encodeURIComponent(nctId) + "?format=json")
      .then(function (r) { return r.json(); })
      .then(parseResults);
  }

  var api = { parseResults: parseResults, getTrialResults: getTrialResults };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CtgovExtract = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
