/* shared/sr-records-v1.js — canonical schema for the cross-tool record bus.
 *
 * `sr-records-v1` is the envelope that Search -> Screen -> Extract pass records
 * through. Each app historically re-declared the key and its own normalize();
 * they interoperate via the common {records:[]} envelope, but nothing guarded
 * against drift. This module is the single source of truth for:
 *   - the localStorage KEY and envelope _schema,
 *   - the canonical record shape (normalizeRecord, mirroring screen's
 *     normalizeImported — the richest producer),
 *   - envelope read/write helpers.
 *
 * Apps adopt it incrementally (extract first). A contract test pins the shape
 * and asserts every app still uses this exact key + envelope field.
 *
 * Browser global: window.SrRecords. Node: module.exports.
 */
(function (global) {
  "use strict";

  var KEY = "sr-records-v1";
  var SCHEMA = "sr-records-v1";
  var _autoId = 0;

  function clean(s, cap) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    cap = cap || 4000;
    return s.length > cap ? s.slice(0, cap) : s;
  }
  function splitAuthors(s) {
    if (!s) return [];
    return String(s).split(/;| and |&/).map(function (a) { return a.trim(); }).filter(Boolean);
  }
  function freshId() { return "rec" + (++_autoId); }

  var DECISIONS = ["include", "exclude", "maybe"];

  // Canonical record. Byte-for-byte the shape screen's normalizeImported emits,
  // so adopting this module never changes what Screen produces or consumes.
  function normalizeRecord(r) {
    r = r || {};
    return {
      id: (r.id && String(r.id).trim()) || freshId(),
      title: clean(r.title), abstract: clean(r.abstract, 8000),
      authors: Array.isArray(r.authors) ? r.authors.map(function (a) { return clean(a, 200); }).filter(Boolean) : splitAuthors(r.authors),
      journal: clean(r.journal, 300),
      year: r.year ? (String(r.year).match(/\d{4}/) || [""])[0] : "",
      doi: clean(r.doi, 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""),
      pmid: clean(r.pmid, 30),
      keywords: Array.isArray(r.keywords) ? r.keywords.map(function (k) { return clean(k, 120); }).filter(Boolean) : [],
      source: clean(r.source, 40) || "import",
      r1: r.r1 && typeof r.r1 === "object" ? { d: r.r1.d || "", reason: r.r1.reason || "" } : { d: "", reason: "" },
      r2: r.r2 && typeof r.r2 === "object" ? { d: r.r2.d || "", reason: r.r2.reason || "" } : { d: "", reason: "" },
      resolved: r.resolved || "",
      labels: Array.isArray(r.labels) ? r.labels.slice() : [],
      dup: !!r.dup, dupManual: !!r.dupManual, dupOf: r.dupOf || null, score: null,
      mlScore: null,
      aiSuggestion: DECISIONS.indexOf(r.aiSuggestion) >= 0 ? r.aiSuggestion : "",
      aiRationale: clean(r.aiRationale, 400),
      aiConfidence: (typeof r.aiConfidence === "number") ? r.aiConfidence : null
    };
  }

  function buildEnvelope(records, nowIso) {
    var arr = Array.isArray(records) ? records : [];
    return { _schema: SCHEMA, _savedAt: nowIso || (typeof Date !== "undefined" ? new Date().toISOString() : null), records: arr.map(normalizeRecord) };
  }

  // True if `obj` is a usable sr-records-v1 envelope ({records:[]}). The legacy
  // apps wrote records without stamping _schema, so the schema tag is optional.
  function isEnvelope(obj) { return !!(obj && typeof obj === "object" && Array.isArray(obj.records)); }

  function _hasStorage() { try { return typeof global.localStorage !== "undefined" && !!global.localStorage; } catch (e) { return false; } }

  // Read the bus and return NORMALIZED records (empty array on miss/malformed).
  function read() {
    if (!_hasStorage()) return [];
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      if (isEnvelope(p)) return p.records.map(normalizeRecord);
    } catch (e) { /* malformed bus = empty */ }
    return [];
  }

  function write(records) {
    if (!_hasStorage()) return false;
    try { global.localStorage.setItem(KEY, JSON.stringify(buildEnvelope(records))); return true; } catch (e) { return false; }
  }

  var api = {
    KEY: KEY, SCHEMA: SCHEMA,
    normalizeRecord: normalizeRecord, buildEnvelope: buildEnvelope, isEnvelope: isEnvelope,
    read: read, write: write
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SrRecords = api;
})(typeof window !== "undefined" ? window : globalThis);
