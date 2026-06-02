/* shared/ma-comparisons-v1.js — sister bus to ma-studies-v1 for
 * multi-arm contrast data. Spec: shared/ma-comparisons-v1.md
 *
 * Use this when your app speaks arms-and-studies (NMA, dose-response,
 * Bucher, mh-peto). Use ma-studies-v1.js for single-arm-or-pairwise
 * {label, est, se} rows.
 *
 * Additive: existing pairwise apps continue to read/write the
 * ma-studies-v1 bus; new NMA apps can opt into this richer envelope.
 */
(function (global) {
  "use strict";

  var KEY = "ma-comparisons-v1";
  var SCHEMA = "ma-comparisons-v1";
  var BINARY = { OR: true, RR: true, HR: true, RD: true };
  var CONT   = { MD: true, SMD: true };
  var ALL_SCALES = { OR:true, RR:true, HR:true, RD:true, MD:true, SMD:true };

  function isFiniteNumber(x) { return typeof x === "number" && Number.isFinite(x); }
  function nonEmptyString(x) { return typeof x === "string" && x.length > 0; }

  // ----- Validation -------------------------------------------------------

  function validateArm(arm, effectMeasure, prefix) {
    var errs = [];
    if (!arm || typeof arm !== "object") return [prefix + ": not an object"];
    if (!nonEmptyString(arm.treatment)) errs.push(prefix + ": treatment must be a non-empty string");
    if (BINARY[effectMeasure]) {
      if (!isFiniteNumber(arm.events) || arm.events < 0) errs.push(prefix + ": events required and >= 0");
      if (!isFiniteNumber(arm.n) || arm.n <= 0) errs.push(prefix + ": n required and > 0");
      if (isFiniteNumber(arm.events) && isFiniteNumber(arm.n) && arm.events > arm.n) {
        errs.push(prefix + ": events (" + arm.events + ") > n (" + arm.n + ")");
      }
    } else if (CONT[effectMeasure]) {
      if (!isFiniteNumber(arm.mean)) errs.push(prefix + ": mean required");
      if (!isFiniteNumber(arm.sd) || arm.sd <= 0) errs.push(prefix + ": sd required and > 0");
    }
    return errs;
  }

  function validateStudy(study, effectMeasure, i) {
    var prefix = "study[" + i + "]";
    var errs = [];
    if (!study || typeof study !== "object") return [prefix + ": not an object"];
    if (!nonEmptyString(study.id)) errs.push(prefix + ": id must be a non-empty string");
    if (!Array.isArray(study.arms) || study.arms.length < 2) {
      errs.push(prefix + ": arms must be an array with >= 2 entries");
      return errs;
    }
    for (var a = 0; a < study.arms.length; a++) {
      errs = errs.concat(validateArm(study.arms[a], effectMeasure, prefix + ".arm[" + a + "]"));
    }
    return errs;
  }

  function validate(env) {
    var errors = [];
    if (env === null || typeof env !== "object") {
      return { ok: false, errors: ["envelope is not an object"] };
    }
    if (env._schema !== SCHEMA) errors.push("_schema must equal " + JSON.stringify(SCHEMA));
    if (typeof env._savedAt !== "string") errors.push("_savedAt must be an ISO 8601 string");
    if (!nonEmptyString(env.effectMeasure) || !ALL_SCALES[env.effectMeasure]) {
      errors.push("effectMeasure must be one of OR/RR/HR/RD/MD/SMD");
    }
    if (!Array.isArray(env.studies)) {
      errors.push("studies must be an array");
      return { ok: false, errors: errors };
    }
    for (var i = 0; i < env.studies.length; i++) {
      var e = validateStudy(env.studies[i], env.effectMeasure, i);
      for (var j = 0; j < e.length; j++) errors.push(e[j]);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ----- Normalisation ----------------------------------------------------

  function normalizeArm(arm, effectMeasure) {
    var out = { treatment: String(arm.treatment).trim() };
    if (BINARY[effectMeasure]) {
      out.events = Number(arm.events);
      out.n = Number(arm.n);
    } else if (CONT[effectMeasure]) {
      out.mean = Number(arm.mean);
      out.sd = Number(arm.sd);
    }
    if (isFiniteNumber(arm.dose)) out.dose = arm.dose;
    return out;
  }

  function normalizeStudy(study, effectMeasure) {
    var arms = (Array.isArray(study.arms) ? study.arms : [])
      .map(function (a) { return normalizeArm(a, effectMeasure); })
      .filter(function (a) {
        // Must match validateArm exactly, so buildEnvelope output always passes
        // validate(): a single impossible row (events>n, events<0, sd<=0) must be
        // dropped per-row here, NOT survive to make validate reject the whole
        // envelope and lose every other (good) study.
        if (!nonEmptyString(a.treatment)) return false;
        if (BINARY[effectMeasure]) {
          return isFiniteNumber(a.events) && a.events >= 0 &&
                 isFiniteNumber(a.n) && a.n > 0 && a.events <= a.n;
        }
        if (CONT[effectMeasure]) return isFiniteNumber(a.mean) && isFiniteNumber(a.sd) && a.sd > 0;
        return false;
      });
    if (arms.length < 2) return null;
    var out = { id: String(study.id).trim(), arms: arms };
    if (isFiniteNumber(study.year)) out.year = study.year;
    if (nonEmptyString(study.rob)) out.rob = study.rob;
    return out;
  }

  function buildEnvelope(studies, effectMeasure) {
    var clean = (studies || [])
      .map(function (s) { return normalizeStudy(s, effectMeasure); })
      .filter(function (s) { return !!s && nonEmptyString(s.id); });
    return {
      _schema: SCHEMA,
      _savedAt: new Date().toISOString(),
      effectMeasure: effectMeasure,
      studies: clean,
    };
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
      if (p && p._schema === SCHEMA && Array.isArray(p.studies)) return p;
    } catch (_) { /* fall through */ }
    return null;
  }

  function write(envOrStudies, effectMeasure) {
    if (!_hasStorage()) return false;
    var env;
    if (envOrStudies && envOrStudies._schema === SCHEMA && Array.isArray(envOrStudies.studies)) {
      env = buildEnvelope(envOrStudies.studies, envOrStudies.effectMeasure || effectMeasure);
    } else if (Array.isArray(envOrStudies) && nonEmptyString(effectMeasure)) {
      env = buildEnvelope(envOrStudies, effectMeasure);
    } else {
      return false;
    }
    var v = validate(env);
    if (!v.ok) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(env));
      return true;
    } catch (_) { return false; }
  }

  function merge(envOrStudies, effectMeasure) {
    var existing = read();
    var em = effectMeasure
      || (envOrStudies && envOrStudies.effectMeasure)
      || (existing && existing.effectMeasure);
    if (!nonEmptyString(em)) return false;
    var newStudies = Array.isArray(envOrStudies)
      ? envOrStudies
      : (envOrStudies && Array.isArray(envOrStudies.studies) ? envOrStudies.studies : []);
    var oldStudies = existing && Array.isArray(existing.studies) ? existing.studies : [];
    // Merge by id: later entries (newStudies) override earlier (oldStudies).
    var byId = Object.create(null);
    for (var i = 0; i < oldStudies.length; i++) {
      if (oldStudies[i] && nonEmptyString(oldStudies[i].id)) byId[String(oldStudies[i].id).trim()] = oldStudies[i];
    }
    for (var j = 0; j < newStudies.length; j++) {
      if (newStudies[j] && nonEmptyString(newStudies[j].id)) byId[String(newStudies[j].id).trim()] = newStudies[j];
    }
    var merged = Object.keys(byId).map(function (k) { return byId[k]; });
    return write(merged, em);
  }

  function clear() {
    if (!_hasStorage()) return;
    try { global.localStorage.removeItem(KEY); } catch (_) {}
  }

  // ----- Interop with the pairwise binary shape used by nma-pro-v2 -------

  /**
   * Convert nma-pro-v2's per-row binary shape into a comparisons envelope.
   * Input row example:
   *   { name: "GUSTO-1", treatment1: "SK", events1: 1135, n1: 13780,
   *                       treatment2: "tPA", events2: 1021, n2: 13746,
   *                       year: 1993, rob: "low" }
   * Rows sharing the same `name` (case-sensitive, trimmed) become arms of
   * the same multi-arm study — the canonical multi-arm correction signal.
   */
  function fromBinaryTriplets(rows, effectMeasure) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (!nonEmptyString(effectMeasure)) effectMeasure = "OR";
    var byId = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var id = nonEmptyString(r.name) ? String(r.name).trim() : "study_" + (i + 1);
      if (!byId[id]) byId[id] = { id: id, year: isFiniteNumber(r.year) ? r.year : null,
                                    rob: nonEmptyString(r.rob) ? r.rob : null, arms: [] };
      function addArm(trt, ev, n) {
        if (!nonEmptyString(trt)) return;
        if (!isFiniteNumber(ev) || !isFiniteNumber(n) || n <= 0) return;
        var t = String(trt).trim();
        for (var k = 0; k < byId[id].arms.length; k++) {
          if (byId[id].arms[k].treatment === t) return;   // dedup within study
        }
        byId[id].arms.push({ treatment: t, events: ev, n: n });
      }
      addArm(r.treatment1, r.events1, r.n1);
      addArm(r.treatment2, r.events2, r.n2);
    }
    var studies = Object.keys(byId).map(function (k) { return byId[k]; });
    return buildEnvelope(studies, effectMeasure);
  }

  /** Convenience alias matching the spec table. */
  function fromPairwise(rows, effectMeasure) {
    return fromBinaryTriplets(rows, effectMeasure);
  }

  /**
   * Inverse: flatten a comparisons envelope back to nma-pro-v2's per-row
   * pairwise binary shape. Multi-arm studies emit C(k,2) pairs (one per arm
   * pair) — consumers that handle multi-arm sampling cov can reconstruct it
   * by grouping on `name`.
   */
  function toNmaProStudies(env) {
    var out = [];
    if (!env || !Array.isArray(env.studies)) return out;
    for (var i = 0; i < env.studies.length; i++) {
      var s = env.studies[i];
      if (!s || !Array.isArray(s.arms)) continue;
      for (var a = 0; a < s.arms.length; a++) {
        for (var b = a + 1; b < s.arms.length; b++) {
          var x = s.arms[a], y = s.arms[b];
          out.push({
            name: s.id,
            treatment1: x.treatment, events1: x.events, n1: x.n,
            treatment2: y.treatment, events2: y.events, n2: y.n,
            year: s.year || null,
            rob: s.rob || null,
          });
        }
      }
    }
    return out;
  }

  /**
   * Flatten an arm-level comparisons envelope into pairwise CONTRAST rows that
   * the contrast-level NMA apps (bayesian-nma, nma-inconsistency, …) consume:
   *
   *   [{ study, treatment1, treatment2, te, se, design }, ...]
   *
   * `te`/`se` are on the analysis scale of `env.effectMeasure`:
   *   OR → te = ln( (e1·(n2-e2)) / (e2·(n1-e1)) ),  se = sqrt(1/e1 + 1/(n1-e1) + 1/e2 + 1/(n2-e2))
   *   RR → te = ln( (e1/n1) / (e2/n2) ),            se = sqrt(1/e1 - 1/n1 + 1/e2 - 1/n2)
   * `te` is the effect of `treatment1` relative to `treatment2` (arm order in the
   * study). A 0.5 continuity correction is applied ONLY when a study has a zero
   * cell (per advanced-stats.md: unconditional correction biases toward 1).
   * Multi-arm studies emit every pairwise contrast, all tagged with the same
   * `study` id AND the same `design` — the study's full arm-set, sorted and
   * joined by ":" (e.g. a 3-arm A/B/C trial → design "A:B:C" on all three of its
   * contrasts). This is the design-by-treatment grouping key the global /
   * node-split inconsistency apps need; a per-pair tag would wrongly split a
   * multi-arm trial into separate 2-arm designs. Only OR/RR are supported: HR/RD and
   * the continuous measures (MD/SMD) are NOT derivable from the bus here — the
   * arm contract carries `n` for binary arms only (see ma-comparisons-v1.md),
   * so a mean-difference SE cannot be reconstructed. Returns [] for those.
   */
  function toContrasts(env, opts) {
    opts = opts || {};
    var out = [];
    if (!env || !Array.isArray(env.studies)) return out;
    var measure = nonEmptyString(env.effectMeasure) ? env.effectMeasure : (opts.measure || "OR");
    var isOR = measure === "OR", isRR = measure === "RR";
    if (!isOR && !isRR) return out; // HR/RD/MD/SMD: not derivable from binary arm counts
    for (var i = 0; i < env.studies.length; i++) {
      var s = env.studies[i];
      if (!s || !Array.isArray(s.arms) || s.arms.length < 2) continue;
      // Design = the study's full arm-set (sorted, ":"-joined), shared by every
      // pairwise contrast of this study so multi-arm trials group correctly.
      var design = s.arms.map(function (ar) { return ar.treatment; }).sort().join(":");
      // Decide the per-study 0.5 correction once: apply iff ANY arm in the study
      // has a zero event or zero non-event cell.
      var cc = 0;
      for (var z = 0; z < s.arms.length; z++) {
        var az = s.arms[z];
        if (az.events === 0 || (az.n - az.events) === 0) { cc = 0.5; break; }
      }
      for (var a = 0; a < s.arms.length; a++) {
        for (var b = a + 1; b < s.arms.length; b++) {
          var x = s.arms[a], y = s.arms[b], te, se;
          var e1 = x.events + cc, ne1 = (x.n - x.events) + cc;
          var e2 = y.events + cc, ne2 = (y.n - y.events) + cc;
          if (!(e1 > 0) || !(ne1 > 0) || !(e2 > 0) || !(ne2 > 0)) continue;
          if (isOR) {
            te = Math.log((e1 * ne2) / (e2 * ne1));
            se = Math.sqrt(1 / e1 + 1 / ne1 + 1 / e2 + 1 / ne2);
          } else { // RR
            var n1 = x.n + (cc ? 2 * cc : 0), n2 = y.n + (cc ? 2 * cc : 0);
            te = Math.log((e1 / n1) / (e2 / n2));
            se = Math.sqrt(1 / e1 - 1 / n1 + 1 / e2 - 1 / n2);
          }
          if (!isFiniteNumber(te) || !isFiniteNumber(se) || !(se > 0)) continue;
          out.push({
            study: s.id,
            treatment1: x.treatment, treatment2: y.treatment,
            te: te, se: se,
            design: design,
          });
        }
      }
    }
    return out;
  }

  // ----- Public API -------------------------------------------------------

  var api = {
    KEY: KEY,
    SCHEMA: SCHEMA,
    read: read,
    write: write,
    merge: merge,
    clear: clear,
    validate: validate,
    buildEnvelope: buildEnvelope,
    normalizeStudy: normalizeStudy,
    normalizeArm: normalizeArm,
    fromPairwise: fromPairwise,
    fromBinaryTriplets: fromBinaryTriplets,
    toNmaProStudies: toNmaProStudies,
    toContrasts: toContrasts,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MaComparisons = api;
})(typeof window !== "undefined" ? window : globalThis);
