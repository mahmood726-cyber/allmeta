/* shared/evalue.js — E-value (VanderWeele & Ding 2017).
 *
 * Sensitivity of an observational pooled estimate to unmeasured confounding: the minimum
 * strength of association (on the risk-ratio scale) that an unmeasured confounder would
 * need with BOTH treatment and outcome to fully explain away the observed effect (point),
 * or to shift the CI bound closest to the null to 1.
 *
 * E-value(RR) = RR + √(RR·(RR−1)) for RR ≥ 1 (use 1/RR for RR < 1). The CI E-value uses
 * the bound nearest the null (lower if RR>1, upper if RR<1); = 1 if that bound crosses 1.
 * Non-RR measures are mapped to an approximate RR (VanderWeele-Ding / Chinn):
 *   OR  → √OR (common outcome) or OR (rare);
 *   HR  → (1−0.5^√HR)/(1−0.5^√(1/HR)) (common) or HR (rare);
 *   SMD/d (continuous) → exp(0.91·d).
 *
 * Verified vs the EValue R package (evalues.RR/OR/HR) to ~1e-6:
 *   RR=2.0 [1.5,2.7] → E=3.414214 (CI 2.366025); OR=2.0 common → E=2.179580 (CI 1.749392);
 *   HR=1.6 common → E=2.112944 (CI 1.525531); RR=0.6 [0.4,0.9] → E=2.720759 (CI 1.462475).
 *
 * Reference: VanderWeele TJ, Ding P (2017), Ann Intern Med 167(4):268-274.
 */
(function (global) {
  "use strict";

  function _e(rr) {
    if (!(rr > 0)) return NaN;
    var r = rr >= 1 ? rr : 1 / rr;
    return r + Math.sqrt(r * (r - 1));
  }
  // Map any supported measure to an approximate risk ratio.
  function approxRR(measure, est, rare) {
    measure = (measure || "RR").toUpperCase();
    if (!isFinite(est)) return NaN;
    // SMD/d are on the DIFFERENCE scale — any sign is valid (negative = protective).
    // Chinn 2000: d → exp(0.91·d). (Only valid for a STANDARDISED difference.)
    if (measure === "SMD" || measure === "D") return Math.exp(0.91 * est);
    if (!(est > 0)) return NaN; // ratio measures (RR/OR/HR) must be positive
    if (measure === "RR") return est;
    if (measure === "OR") return rare ? est : Math.sqrt(est);
    if (measure === "HR") return rare ? est : (1 - Math.pow(0.5, Math.sqrt(est))) / (1 - Math.pow(0.5, Math.sqrt(1 / est)));
    return est;
  }

  // eValues(measure, point, lo, hi, {rare}) → { rr:{point,lo,hi}, point, ci }.
  // `ci` is the E-value for the CI bound nearest the null (1 if the CI crosses the null).
  // Impossible complete intervals throw RangeError before any scale conversion.
  function eValues(measure, point, lo, hi, opts) {
    opts = opts || {};
    // Non-null true value or an SMD standard error: EValue's evalues.RR/OR/HR/MD
    // semantics (eValuesTrue below). Without either, the legacy path is unchanged.
    if (opts["true"] != null || opts.se != null) return eValuesTrue(measure, point, lo, hi, opts);
    if (lo != null && hi != null) {
      var scale = (measure || "RR").toUpperCase();
      if (!Number.isFinite(point) || !Number.isFinite(lo) || !Number.isFinite(hi))
        throw new RangeError("Invalid confidence interval: estimate and bounds must be finite numbers.");
      if (scale !== "SMD" && scale !== "D" && !(point > 0 && lo > 0 && hi > 0))
        throw new RangeError("Invalid confidence interval: ratio estimates and bounds must be positive.");
      if (lo > hi)
        throw new RangeError("Invalid confidence interval: lower bound must not exceed upper bound.");
      if (point < lo || point > hi)
        throw new RangeError("Invalid confidence interval: bounds must contain the point estimate.");
    }
    var rare = !!opts.rare;
    var rr = approxRR(measure, point, rare);
    var rrLo = (lo != null && isFinite(lo)) ? approxRR(measure, lo, rare) : null;
    var rrHi = (hi != null && isFinite(hi)) ? approxRR(measure, hi, rare) : null;
    var ePoint = _e(rr);
    var eCI = 1;
    if (rr >= 1) { // effect above null → the lower CI bound is nearest the null
      if (rrLo != null) eCI = (rrLo <= 1) ? 1 : _e(rrLo);
    } else {       // effect below null → the upper CI bound is nearest the null
      if (rrHi != null) eCI = (rrHi >= 1) ? 1 : _e(rrHi);
    }
    return { rr: { point: rr, lo: rrLo, hi: rrHi }, point: ePoint, ci: eCI };
  }

  // EValue::threshold(x, true): E-value for moving a risk ratio x to `true`.
  function threshold(x, trueRR) {
    if (trueRR == null) trueRR = 1;
    if (x == null || x !== x) return null;
    if (x <= 1) { x = 1 / x; trueRR = 1 / trueRR; }
    if (trueRR <= x) return (x + Math.sqrt(x * (x - trueRR))) / trueRR;
    var rat = trueRR / x;
    return rat + Math.sqrt(rat * (rat - 1));
  }

  // Port of EValue::evalues.RR on the risk-ratio scale. Returns the E-values for
  // the estimate and for the limit nearest the true value (null when absent).
  function evaluesRR(est, lo, hi, trueRR) {
    if (!(est >= 0)) throw new RangeError("RR cannot be negative.");
    if (!(trueRR >= 0)) throw new RangeError("True value is impossible.");
    if (lo != null && hi != null && lo > hi) throw new RangeError("Lower confidence limit should be less than upper confidence limit.");
    if ((lo != null && est < lo) || (hi != null && est > hi)) throw new RangeError("Point estimate should be inside confidence interval.");
    var nullCI = null;
    if (est > trueRR && lo != null) nullCI = lo < trueRR;
    if (est < trueRR && hi != null) nullCI = hi > trueRR;
    var E = [threshold(est, trueRR), threshold(lo, trueRR), threshold(hi, trueRR)];
    if (nullCI === true) { E[1] = 1; E[2] = 1; }
    if (lo != null || hi != null) {
      if (est > trueRR) E[2] = null;
      if (est < trueRR) E[1] = null;
      if (est === trueRR) { E[1] = 1; E[2] = null; }
    } else { E[1] = null; E[2] = null; }
    return { point: E[0], lower: E[1], upper: E[2], ci: E[1] != null ? E[1] : E[2] };
  }

  // E-values with a non-null true value (on the measure's own scale: a ratio for
  // RR/OR/HR, d for SMD) and, for SMD, an optional standard error used as in
  // EValue's evalues.MD: risk-ratio limits exp(0.91*d -/+ 1.78*se).
  function eValuesTrue(measure, point, lo, hi, opts) {
    var m = (measure || "RR").toUpperCase(), smd = (m === "SMD" || m === "D");
    var rare = !!opts.rare, se = opts.se, tv = opts["true"];
    if (["RR", "OR", "HR", "SMD", "D"].indexOf(m) < 0) throw new RangeError("Unsupported measure.");
    if (!Number.isFinite(point)) throw new RangeError("Estimate must be a finite number.");
    if (tv == null) tv = smd ? 0 : 1;
    if (!Number.isFinite(tv)) throw new RangeError("True value must be a finite number.");
    if (!smd && !(tv > 0)) throw new RangeError("True value is impossible: a ratio must be positive.");
    if (se != null) {
      if (!smd) throw new RangeError("A standard error is used only for a standardised mean difference.");
      if (!Number.isFinite(se) || se < 0) throw new RangeError("Standard error cannot be negative.");
      if (lo != null || hi != null) throw new RangeError("Give either a confidence interval or a standard error, not both.");
    }
    if ((lo == null) !== (hi == null)) throw new RangeError("Give both confidence limits or neither.");
    if (lo != null && !(Number.isFinite(lo) && Number.isFinite(hi))) throw new RangeError("Confidence limits must be finite numbers.");
    if (!smd && !(point > 0 && (lo == null || (lo > 0 && hi > 0)))) throw new RangeError("Ratio estimates and limits must be positive.");
    // Order checks on the measure's own scale, BEFORE conversion: exp(0.91*d) and the
    // OR/HR maps can round distinct limits to the same risk ratio (d = 1e-20 and -1e-20
    // both give RR 1), so checking only after conversion (in evaluesRR) would accept
    // reversed limits or limits that exclude the estimate. The maps are increasing, so
    // these are the same conditions EValue's evalues.RR applies on the RR scale.
    if (lo != null && lo > hi) throw new RangeError("Lower confidence limit should be less than upper confidence limit.");
    if (lo != null && (point < lo || point > hi)) throw new RangeError("Point estimate should be inside confidence interval.");
    var rr = approxRR(m, point, rare), rrTrue = approxRR(m, tv, rare), rrLo = null, rrHi = null;
    if (se != null) { rrLo = Math.exp(0.91 * point - 1.78 * se); rrHi = Math.exp(0.91 * point + 1.78 * se); }
    else if (lo != null) { rrLo = approxRR(m, lo, rare); rrHi = approxRR(m, hi, rare); }
    var e = evaluesRR(rr, rrLo, rrHi, rrTrue);
    return { rr: { point: rr, lo: rrLo, hi: rrHi, "true": rrTrue }, point: e.point, ci: e.ci, lower: e.lower, upper: e.upper };
  }

  // Port of EValue::evalues.OLS: a linear-regression coefficient `est` (SE `se`,
  // optional) for an outcome with standard deviation `sd`, per `delta` units of
  // the exposure, becomes d = est*|delta|/sd (SE se*|delta|/sd), then
  // evalues.MD. `opts.true` is on the d scale (default 0).
  function eValuesOLS(est, se, sd, delta, opts) {
    opts = opts || {};
    if (!Number.isFinite(est)) throw new RangeError("Coefficient must be a finite number.");
    if (!(Number.isFinite(sd) && sd > 0)) throw new RangeError("Outcome standard deviation must be positive.");
    if (delta == null) delta = 1;
    if (!Number.isFinite(delta)) throw new RangeError("Contrast (delta) must be a finite number.");
    delta = Math.abs(delta);
    if (se != null && !(Number.isFinite(se) && se >= 0)) throw new RangeError("Standard error cannot be negative.");
    var d = est * delta / sd, seD = se == null ? null : se * delta / sd;
    var r = eValuesTrue("SMD", d, null, null, { se: seD, "true": opts["true"] == null ? 0 : opts["true"] });
    r.d = d; r.seD = seD;
    return r;
  }

  // Number of elements of R's seq(from, to, by) for by > 0 (seq.default).
  function seqLength(from, to, by) {
    var del = to - from;
    if (Math.abs(del) / Math.max(Math.abs(to), Math.abs(from)) < 100 * 2.220446049250313e-16) return 1;
    return Math.floor(del / by + 1e-10) + 1;
  }

  // Port of EValue::evalues.RD (Ding & VanderWeele 2016) for a 2x2 table:
  // n11 exposed with the outcome, n10 exposed without, n01 unexposed with,
  // n00 unexposed without. The lower-limit E-value uses EValue's own grid
  // search (grid 1e-4, alpha 0.05), so it reproduces EValue's value exactly.
  function eValuesRD(n11, n10, n01, n00, opts) {
    opts = opts || {};
    var tv = opts["true"] == null ? 0 : opts["true"], grid = opts.grid == null ? 1e-4 : opts.grid;
    // R's seq(1, est.BF, grid) stops on a non-positive or non-finite step ("wrong sign in
    // 'by' argument" / "invalid '(to - from)/by'"); refuse it here rather than letting the
    // loop below run zero times and report the CI E-value as null.
    if (!(Number.isFinite(grid) && grid > 0)) throw new RangeError("The grid step must be a positive finite number (EValue's evalues.RD grid argument).");
    var Z = 1.959963984540054; // qnorm(1 - 0.05/2)
    [n11, n10, n01, n00].forEach(function (n) { if (!Number.isFinite(n)) throw new RangeError("All four cell counts are required."); });
    if (n11 < 0 || n10 < 0 || n01 < 0 || n00 < 0) throw new RangeError("Negative cell counts are impossible.");
    if (!Number.isFinite(tv)) throw new RangeError("True value must be a finite number.");
    var N = n10 + n11 + n01 + n00, N1 = n10 + n11, N0 = n00 + n01;
    if (!(N1 > 0 && N0 > 0)) throw new RangeError("Both exposure groups need at least one participant.");
    var f = N1 / N, p1 = n11 / N1, p0 = n01 / N0;
    if (p1 < p0) throw new RangeError("RD < 0: relabel the exposure so that the risk difference is positive (as EValue requires).");
    var se1 = Math.sqrt(p1 * (1 - p1) / N1), se0 = Math.sqrt(p0 * (1 - p0) / N0);
    var s2f = f * (1 - f) / N, s2p1 = se1 * se1, s2p0 = se0 * se0;
    var diff = p0 * (1 - f) - p1 * f;
    var estBF = (Math.sqrt((tv + diff) * (tv + diff) + 4 * p1 * p0 * f * (1 - f)) - (tv + diff)) / (2 * p0 * f);
    var estE = threshold(estBF);
    if (p1 - p0 <= tv) throw new RangeError("For a risk difference the true value must be below the estimate.");
    var half = Z * Math.sqrt(s2p1 + s2p0), lowerCI = p1 - p0 - half;
    var out = { rd: p1 - p0, rdLo: lowerCI, rdHi: p1 - p0 + half, biasFactor: estBF,
      point: estE, ci: 1, rr: { point: estBF, lo: null, hi: null } };
    if (lowerCI <= tv) return out;
    if (!Number.isFinite(estBF)) { out.ci = null; return out; }
    var maxGrid = opts.maxGrid == null ? 5e7 : opts.maxGrid;
    if ((estBF - 1) / grid > 2147483647) throw new RangeError("'by' argument is much too small (as R's seq() reports): the bias factor is too large for EValue's grid search.");
    var n = seqLength(1, estBF, grid), found = null;
    if (n > maxGrid) throw new RangeError("the grid search would need " + n + " steps (bias factor " + estBF.toPrecision(6) + "); this browser page stops at " + maxGrid + ". Use EValue::evalues.RD in R.");
    for (var i = 0; i < n; i++) {
      var bf = Math.min(1 + i * grid, estBF);
      var rdS = p1 - p0 * bf, fS = f + (1 - f) / bf, a = 1 - 1 / bf;
      var low = rdS * fS - Z * Math.sqrt((s2p1 + s2p0 * (bf * bf)) * (fS * fS) + (rdS * rdS) * (a * a) * s2f);
      if (low <= tv) { found = bf; break; }
    }
    out.ci = threshold(found);
    return out;
  }

  var api = { eValues: eValues, approxRR: approxRR, eValue: _e, threshold: threshold,
    eValuesOLS: eValuesOLS, eValuesRD: eValuesRD };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmEValue = api;
})(typeof window !== "undefined" ? window : globalThis);
