/*
 * shared/maif.js — Meta-Analysis Interchange Format (MAIF) v1.0 adapter.
 *
 * Maps allmeta's internal study objects to/from the MAIF interchange JSON
 * (schema/ma-interchange.schema.json), so allmeta can exchange study-level data
 * with the methodssuite tool ecosystem. Only {id, yi, sei} are required per
 * study; everything else is additive/optional.
 *
 * allmeta study objects appear in several shapes across the engines; this reads
 * the effect from yi|te|est|effect and the SE from sei|se, or derives it from
 * a variance vi|var. Round-trips: toStudies(fromStudies(s)) preserves yi/sei.
 */
(function (global) {
  "use strict";

  var VERSION = "1.0";

  function _num(x) { return (typeof x === "number" && isFinite(x)) ? x : null; }

  function _effect(s) {
    return _num(s.yi != null ? s.yi : s.te != null ? s.te : s.est != null ? s.est : s.effect);
  }
  function _se(s) {
    var se = _num(s.sei != null ? s.sei : s.se);
    if (se != null) return se;
    var v = _num(s.vi != null ? s.vi : s.var);
    return (v != null && v >= 0) ? Math.sqrt(v) : null;
  }

  // Build a MAIF document from allmeta studies. `meta` (optional) → metadata.
  // Studies missing a finite effect+SE are dropped (MAIF requires yi/sei).
  function fromStudies(studies, meta) {
    var out = [];
    (studies || []).forEach(function (s, i) {
      var yi = _effect(s), se = _se(s);
      if (yi == null || se == null || !(se > 0)) return;
      var row = { id: String(s.id != null ? s.id : s.label != null ? s.label : "study" + (i + 1)), yi: yi, sei: se };
      if (Number.isInteger(s.ni) && s.ni >= 1) row.ni = s.ni;
      if (Number.isInteger(s.year)) row.year = s.year;
      if (s.moderators && typeof s.moderators === "object") row.moderators = s.moderators;
      if (s.arm1 != null) row.arm1 = String(s.arm1);
      if (s.arm2 != null) row.arm2 = String(s.arm2);
      if (Array.isArray(s.components)) row.components = s.components.map(String);
      out.push(row);
    });
    var doc = { version: VERSION, studies: out };
    if (meta && typeof meta === "object") doc.metadata = meta;
    return doc;
  }

  // Parse a MAIF document → allmeta study objects ({id, yi, sei, vi, ...}).
  function toStudies(maif) {
    if (!maif || !Array.isArray(maif.studies)) throw new Error("MAIF: missing studies[]");
    return maif.studies.map(function (r) {
      var s = { id: r.id, yi: r.yi, sei: r.sei, vi: r.sei * r.sei };
      if (r.ni != null) s.ni = r.ni;
      if (r.year != null) s.year = r.year;
      if (r.moderators) s.moderators = r.moderators;
      if (r.arm1 != null) s.arm1 = r.arm1;
      if (r.arm2 != null) s.arm2 = r.arm2;
      if (r.components) s.components = r.components;
      return s;
    });
  }

  // Lightweight structural check (not a full JSON-schema validator — the pytest
  // validates emitted docs against schema/ma-interchange.schema.json).
  function validate(maif) {
    var errs = [];
    if (!maif || typeof maif !== "object") return ["not an object"];
    if (maif.version !== VERSION) errs.push("version must be '" + VERSION + "'");
    if (!Array.isArray(maif.studies) || maif.studies.length < 1) errs.push("studies must be a non-empty array");
    else maif.studies.forEach(function (r, i) {
      if (typeof r.id !== "string") errs.push("study[" + i + "].id must be a string");
      if (_num(r.yi) == null) errs.push("study[" + i + "].yi must be a number");
      if (!(_num(r.sei) > 0)) errs.push("study[" + i + "].sei must be a positive number");
    });
    return errs;
  }

  var api = { VERSION: VERSION, fromStudies: fromStudies, toStudies: toStudies, validate: validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMAIF = api;
})(typeof window !== "undefined" ? window : globalThis);
