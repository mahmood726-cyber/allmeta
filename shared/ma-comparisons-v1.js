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

  // Lanczos log-gamma — used for the EXACT Hedges small-sample bias correction
  // J = Γ(m/2) / (√(m/2)·Γ((m-1)/2)) in the SMD contrast (toContrasts). metafor
  // uses the exact gamma form, not the 1−3/(4m−1) approximation; they differ at
  // ~5e-6 in J, enough to break 1e-6 escalc parity.
  function _lngamma(z) {
    var g = 7, c = [0.99999999999980993, 676.5203681218851,
      -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - _lngamma(1 - z);
    z -= 1; var x = c[0];
    for (var i = 1; i < g + 2; i++) x += c[i] / (z + i);
    var t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  // Engine-independent natural log for the binary (OR/RR) contrast effects.
  // ECMAScript leaves Math.log "implementation-approximated", and engines do
  // differ: Math.log(7.105263157894737) — the log-OR of 2.5/9.5 vs 0.5/13.5
  // after the 0.5 zero-cell correction — is 1.960835799271989 in V8 of
  // Chromium 147 / Node 24 but 1.9608357992719891 (one ulp higher) in V8 of
  // Chrome/Edge 155. The same imported study then produced different input
  // text in different browsers. This is a line-for-line port of fdlibm's
  // __ieee754_log (error < 1 ulp) using only IEEE-754 +, -, *, / and bit
  // extraction, which JavaScript requires to be correctly rounded and unfused,
  // so the result is bit-identical in every conforming engine.
  var _logBuf = new DataView(new ArrayBuffer(8));
  var LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10,
    TWO54 = 1.80143985094819840000e+16,
    LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01,
    LG3 = 2.857142874366239149e-01, LG4 = 2.222219843214978396e-01,
    LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
    LG7 = 1.479819860511658591e-01;
  function detLog(x) {
    var hfsq, f, s, z, R, w, t1, t2, dk, i, j, k = 0, hx, lx;
    if (typeof x !== "number") x = Number(x);
    if (x !== x) return x;                        // NaN
    _logBuf.setFloat64(0, x);
    hx = _logBuf.getInt32(0); lx = _logBuf.getUint32(4);
    if (hx < 0x00100000) {                        // x < 2^-1022, zero or negative
      if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54;                        // subnormal: scale up
      _logBuf.setFloat64(0, x); hx = _logBuf.getInt32(0);
    }
    if (hx >= 0x7ff00000) return x + x;           // +Infinity
    k += (hx >> 20) - 1023;
    hx &= 0x000fffff;
    i = (hx + 0x95f64) & 0x100000;
    _logBuf.setInt32(0, hx | (i ^ 0x3ff00000));   // normalize x or x/2
    x = _logBuf.getFloat64(0);
    k += (i >> 20);
    f = x - 1.0;
    if ((0x000fffff & (2 + hx)) < 3) {            // |f| < 2^-20
      if (f === 0) { if (k === 0) return 0; dk = k; return dk * LN2_HI + dk * LN2_LO; }
      R = f * f * (0.5 - 0.33333333333333333 * f);
      if (k === 0) return f - R;
      dk = k; return dk * LN2_HI - ((R - dk * LN2_LO) - f);
    }
    s = f / (2.0 + f);
    dk = k;
    z = s * s;
    i = hx - 0x6147a;
    w = z * z;
    j = 0x6b851 - hx;
    t1 = w * (LG2 + w * (LG4 + w * LG6));
    t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    R = t2 + t1;
    if (i > 0) {
      hfsq = 0.5 * f * f;
      if (k === 0) return f - (hfsq - s * (hfsq + R));
      return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
    }
    if (k === 0) return f - s * (f - R);
    return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
  }

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
      // n is optional in the CONT schema (validate() never requires it), but it
      // is needed to derive an MD/SMD contrast SE — carry it through when present
      // so toContrasts() can emit continuous contrasts.
      if (isFiniteNumber(arm.n)) out.n = Number(arm.n);
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
   * multi-arm trial into separate 2-arm designs.
   *
   * Supported scales: OR, RR (binary, from events/n) and MD, SMD (continuous,
   * from mean/sd/n). HR/RD are NOT derivable from raw arm data here → []. The
   * continuous contrasts match metafor::escalc to 1e-6:
   *   MD  → te = mean1 − mean2,  se = sqrt(sd1²/n1 + sd2²/n2)
   *   SMD → Hedges g = J·(mean1−mean2)/sp, J the EXACT gamma bias correction,
   *         sp the pooled SD; se = sqrt(1/n1 + 1/n2 + g²/(2(n1+n2)))  (escalc LS)
   * `n` is optional in the CONT schema, so a continuous arm pair is emitted only
   * when BOTH arms carry a finite n>0 (else that pair is skipped, like the
   * dose-on-every-arm rule in toDoseResponse).
   */
  function toContrasts(env, opts) {
    return toContrastsDetailed(env, opts).rows;
  }

  /** Same rows as toContrasts, plus named continuous pairs omitted for missing
   * or invalid sample sizes. Storage validation intentionally keeps n optional.
   */
  function toContrastsDetailed(env, opts) {
    opts = opts || {};
    var out = [];
    var result = { rows: out, omissions: [] };
    if (!env || !Array.isArray(env.studies)) return result;
    var measure = nonEmptyString(env.effectMeasure) ? env.effectMeasure : (opts.measure || "OR");
    var isOR = measure === "OR", isRR = measure === "RR";
    var isMD = measure === "MD", isSMD = measure === "SMD";
    if (!isOR && !isRR && !isMD && !isSMD) return result; // HR/RD: not derivable here
    for (var i = 0; i < env.studies.length; i++) {
      var s = env.studies[i];
      if (!s || !Array.isArray(s.arms) || s.arms.length < 2) continue;
      // Design = the study's full arm-set (sorted, ":"-joined), shared by every
      // pairwise contrast of this study so multi-arm trials group correctly.
      var design = s.arms.map(function (ar) { return ar.treatment; }).sort().join(":");

      // ---- Continuous (MD/SMD): mean/sd/n, no continuity correction ----
      if (isMD || isSMD) {
        for (var ca = 0; ca < s.arms.length; ca++) {
          for (var cb = ca + 1; cb < s.arms.length; cb++) {
            var cx = s.arms[ca], cy = s.arms[cb];
            // n is optional in the CONT schema → derive only when both present.
            if (!(isFiniteNumber(cx.n) && cx.n > 0 && isFiniteNumber(cy.n) && cy.n > 0)) {
              result.omissions.push({
                study: s.id, treatment1: cx.treatment, treatment2: cy.treatment,
                reason: "Both arms need a finite sample size (n) greater than 0."
              });
              continue;
            }
            var cte, cse;
            if (isMD) {
              cte = cx.mean - cy.mean;
              cse = Math.sqrt((cx.sd * cx.sd) / cx.n + (cy.sd * cy.sd) / cy.n);
            } else { // SMD — Hedges g, matching metafor::escalc(measure="SMD")
              var dfm = cx.n + cy.n - 2;
              var J = Math.exp(_lngamma(dfm / 2) - 0.5 * Math.log(dfm / 2) - _lngamma((dfm - 1) / 2));
              var sp = Math.sqrt(((cx.n - 1) * cx.sd * cx.sd + (cy.n - 1) * cy.sd * cy.sd) / dfm);
              if (!(sp > 0) || !isFiniteNumber(J) || !(J > 0)) continue;
              var gg = J * ((cx.mean - cy.mean) / sp);
              cte = gg;
              cse = Math.sqrt(1 / cx.n + 1 / cy.n + (gg * gg) / (2 * (cx.n + cy.n)));
            }
            if (!isFiniteNumber(cte) || !isFiniteNumber(cse) || !(cse > 0)) continue;
            out.push({
              study: s.id,
              treatment1: cx.treatment, treatment2: cy.treatment,
              te: cte, se: cse,
              design: design,
            });
          }
        }
        continue; // continuous study handled; skip the binary path below
      }

      // ---- Binary (OR/RR) ----
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
            te = detLog((e1 * ne2) / (e2 * ne1));
            se = Math.sqrt(1 / e1 + 1 / ne1 + 1 / e2 + 1 / ne2);
          } else { // RR
            var n1 = x.n + (cc ? 2 * cc : 0), n2 = y.n + (cc ? 2 * cc : 0);
            te = detLog((e1 / n1) / (e2 / n2));
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
    return result;
  }

  /**
   * Flatten an arm-level comparisons envelope into the per-arm dose-response rows
   * that nma-dose-response-app consumes:
   *
   *   [{ study, treatment, dose, effect, se }, ...]
   *
   * Within each study the lowest-dose arm is the reference: it is emitted as the
   * anchor row (effect 0, se null — the app defaults a missing/zero SE to unit
   * weight). Every other arm is emitted as its log-effect vs that reference:
   *   OR → effect = ln((eX·(nR-eR))/(eR·(nX-eX))), se = sqrt(1/eX+1/(nX-eX)+1/eR+1/(nR-eR))
   *   RR → effect = ln((eX/nX)/(eR/nR)),           se = sqrt(1/eX-1/nX+1/eR-1/nR)
   * with the per-study 0.5 continuity correction on a zero cell. Requirements:
   *   - effectMeasure OR/RR (binary; HR/RD/MD/SMD return []);
   *   - EVERY arm in the study carries a finite `dose` (else that study is
   *     skipped — a dose-response fit is meaningless without doses).
   */
  function toDoseResponse(env, opts) {
    opts = opts || {};
    var out = [];
    if (!env || !Array.isArray(env.studies)) return out;
    var measure = nonEmptyString(env.effectMeasure) ? env.effectMeasure : (opts.measure || "OR");
    var isOR = measure === "OR", isRR = measure === "RR";
    if (!isOR && !isRR) return out;
    for (var i = 0; i < env.studies.length; i++) {
      var s = env.studies[i];
      if (!s || !Array.isArray(s.arms) || s.arms.length < 2) continue;
      // Require a finite dose on every arm.
      var allDosed = true;
      for (var d = 0; d < s.arms.length; d++) {
        if (!isFiniteNumber(s.arms[d].dose)) { allDosed = false; break; }
      }
      if (!allDosed) continue;
      // Reference = lowest-dose arm.
      var ref = s.arms[0];
      for (var r = 1; r < s.arms.length; r++) {
        if (s.arms[r].dose < ref.dose) ref = s.arms[r];
      }
      // Per-study 0.5 correction iff any zero cell.
      var cc = 0;
      for (var z = 0; z < s.arms.length; z++) {
        var az = s.arms[z];
        if (az.events === 0 || (az.n - az.events) === 0) { cc = 0.5; break; }
      }
      var eR = ref.events + cc, neR = (ref.n - ref.events) + cc;
      if (!(eR > 0) || !(neR > 0)) continue;
      // Anchor row: reference arm at effect 0 (se null -> unit weight).
      out.push({ study: s.id, treatment: ref.treatment, dose: ref.dose, effect: 0, se: null });
      for (var a = 0; a < s.arms.length; a++) {
        var x = s.arms[a];
        if (x === ref) continue;
        var eX = x.events + cc, neX = (x.n - x.events) + cc;
        if (!(eX > 0) || !(neX > 0)) continue;
        var effect, se;
        if (isOR) {
          effect = detLog((eX * neR) / (eR * neX));
          se = Math.sqrt(1 / eX + 1 / neX + 1 / eR + 1 / neR);
        } else { // RR
          var nX = x.n + (cc ? 2 * cc : 0), nR = ref.n + (cc ? 2 * cc : 0);
          effect = detLog((eX / nX) / (eR / nR));
          se = Math.sqrt(1 / eX - 1 / nX + 1 / eR - 1 / nR);
        }
        if (!isFiniteNumber(effect) || !isFiniteNumber(se) || !(se > 0)) continue;
        out.push({ study: s.id, treatment: x.treatment, dose: x.dose, effect: effect, se: se });
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
    toContrastsDetailed: toContrastsDetailed,
    toDoseResponse: toDoseResponse,
    detLog: detLog,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MaComparisons = api;
})(typeof window !== "undefined" ? window : globalThis);
