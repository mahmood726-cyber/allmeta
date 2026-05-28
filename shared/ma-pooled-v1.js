/* shared/ma-pooled-v1.js — pooled-result channel for the allmeta cross-tool bus.
 *
 * Carries ONE pooled meta-analytic effect (the result a pooling app just
 * computed), so a downstream consumer (e.g. grade-sof) can drop the SAME number
 * the user saw into a Summary-of-Findings row WITHOUT re-pooling. Re-pooling in
 * the consumer would silently disagree with the producer (different tau2 method,
 * different model), so the contract is: the producer pools, writes the finished
 * estimate here; the consumer reads it verbatim.
 *
 * Drop-in: <script src="../shared/ma-pooled-v1.js"></script>
 *   write:  MaPooled.write({ pointEstimate, ciLo, ciHi, scale, measure, k, ... })
 *   read:   const r = MaPooled.read();   // result object or null
 *   helper: MaPooled.fromEstSE(est, se, { scale:"ratio", measure:"RR", k:5 })
 *
 * Schema (envelope):
 *   { _schema:"ma-pooled-v1", _savedAt:ISO, result: {
 *       pointEstimate, ciLo, ciHi,      // NATURAL scale (ratio already exp'd)
 *       scale:"ratio"|"linear",         // ratio => null value 1; linear => 0
 *       measure?:string,                // "OR"/"RR"/"HR"/"MD"/"SMD"/"RD" hint
 *       k:int>=1,                       // number of studies pooled
 *       nTotal?:int>0,                  // total participants, if known
 *       model?:"random"|"fixed",
 *       label?:string                   // outcome name, if known
 *   } }
 */
(function (global) {
  "use strict";

  var KEY = "ma-pooled-v1";
  var SCHEMA = "ma-pooled-v1";
  var Z975 = 1.959963984540054; // 2-sided 95% normal quantile

  function isFiniteNumber(x) { return typeof x === "number" && Number.isFinite(x); }
  function isInt(x) { return isFiniteNumber(x) && Math.floor(x) === x; }

  // ----- Validation -------------------------------------------------------

  function validateResult(r) {
    var errs = [];
    if (r === null || typeof r !== "object") return ["result: not an object"];
    if (!isFiniteNumber(r.pointEstimate)) errs.push("result.pointEstimate must be finite");
    if (!isFiniteNumber(r.ciLo)) errs.push("result.ciLo must be finite");
    if (!isFiniteNumber(r.ciHi)) errs.push("result.ciHi must be finite");
    if (isFiniteNumber(r.ciLo) && isFiniteNumber(r.ciHi) && r.ciLo > r.ciHi) {
      errs.push("result.ciLo must be <= ciHi");
    }
    if (isFiniteNumber(r.pointEstimate) && isFiniteNumber(r.ciLo) && isFiniteNumber(r.ciHi)
        && (r.pointEstimate < r.ciLo || r.pointEstimate > r.ciHi)) {
      errs.push("result.pointEstimate must lie within [ciLo, ciHi]");
    }
    if (r.scale !== "ratio" && r.scale !== "linear") {
      errs.push('result.scale must be "ratio" or "linear"');
    }
    if (r.scale === "ratio" && (!(r.pointEstimate > 0) || !(r.ciLo > 0))) {
      errs.push("result.pointEstimate and ciLo must be > 0 on a ratio scale");
    }
    if (!isInt(r.k) || r.k < 1) errs.push("result.k must be an integer >= 1");
    if (r.nTotal != null && (!isInt(r.nTotal) || r.nTotal <= 0)) {
      errs.push("result.nTotal, if present, must be an integer > 0");
    }
    if (r.measure != null && typeof r.measure !== "string") errs.push("result.measure must be a string");
    if (r.model != null && r.model !== "random" && r.model !== "fixed") {
      errs.push('result.model, if present, must be "random" or "fixed"');
    }
    if (r.label != null && typeof r.label !== "string") errs.push("result.label must be a string");
    return errs;
  }

  function validate(payload) {
    var errors = [];
    if (payload === null || typeof payload !== "object") {
      return { ok: false, errors: ["payload is not an object"] };
    }
    if (payload._schema !== SCHEMA) errors.push("_schema must equal " + JSON.stringify(SCHEMA));
    if (typeof payload._savedAt !== "string") errors.push("_savedAt must be an ISO 8601 string");
    errors = errors.concat(validateResult(payload.result));
    return { ok: errors.length === 0, errors: errors };
  }

  // ----- Normalisation ----------------------------------------------------

  function normalizeResult(r) {
    var out = {
      pointEstimate: Number(r.pointEstimate),
      ciLo: Number(r.ciLo),
      ciHi: Number(r.ciHi),
      scale: r.scale === "ratio" ? "ratio" : "linear",
      k: Math.floor(Number(r.k)),
    };
    if (typeof r.measure === "string" && r.measure.length) out.measure = r.measure;
    if (isInt(r.nTotal) && r.nTotal > 0) out.nTotal = r.nTotal;
    if (r.model === "random" || r.model === "fixed") out.model = r.model;
    if (typeof r.label === "string" && r.label.length) out.label = r.label;
    return out;
  }

  function buildEnvelope(result) {
    return { _schema: SCHEMA, _savedAt: new Date().toISOString(), result: normalizeResult(result) };
  }

  // ----- Storage I/O ------------------------------------------------------

  function _hasStorage() {
    try { return typeof global.localStorage !== "undefined" && global.localStorage !== null; }
    catch (_) { return false; }
  }

  function read() {
    if (!_hasStorage()) return null;
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (p && p._schema === SCHEMA && validate(p).ok) return p.result;
    } catch (_) { /* malformed bus = empty */ }
    return null;
  }

  function write(result) {
    if (!_hasStorage()) return false;
    var env = buildEnvelope(result);
    if (!validate(env).ok) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(env));
      return true;
    } catch (_) { return false; }
  }

  function clear() {
    if (!_hasStorage()) return;
    try { global.localStorage.removeItem(KEY); } catch (_) {}
  }

  // ----- Helper: build a result from analysis-scale est + SE --------------
  // For ratio scales, est/se are on the LOG scale and are back-transformed to
  // the natural scale (point = exp(est), CI = exp(est +/- 1.96 se)). For linear
  // scales they are used directly. Returns a result object ready for write().
  function fromEstSE(est, se, opts) {
    opts = opts || {};
    var scale = opts.scale === "ratio" ? "ratio" : "linear";
    var lo = est - Z975 * se, hi = est + Z975 * se;
    var out = {
      scale: scale,
      pointEstimate: scale === "ratio" ? Math.exp(est) : est,
      ciLo: scale === "ratio" ? Math.exp(lo) : lo,
      ciHi: scale === "ratio" ? Math.exp(hi) : hi,
      k: opts.k,
    };
    if (opts.measure) out.measure = opts.measure;
    if (opts.nTotal != null) out.nTotal = opts.nTotal;
    if (opts.model) out.model = opts.model;
    if (opts.label) out.label = opts.label;
    return out;
  }

  var api = {
    KEY: KEY, SCHEMA: SCHEMA,
    validate: validate, read: read, write: write, clear: clear,
    buildEnvelope: buildEnvelope, fromEstSE: fromEstSE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MaPooled = api;
})(typeof window !== "undefined" ? window : globalThis);
