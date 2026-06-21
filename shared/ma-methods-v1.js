/* shared/ma-methods-v1.js — Cochrane Handbook methods + assess() guardrail.
 *
 * The methods layer that the rest of the suite was missing: a single,
 * audited place that encodes the *choices* a meta-analysis forces on you
 * (which effect measure? which model? when NOT to pool? how to handle
 * multi-arm trials?) as machine-checkable rules, each tagged with the
 * Cochrane Handbook (v6.5, Higgins et al. eds, 2024) section it comes from.
 *
 * This is ADDITIVE and back-compatible:
 *   - It computes nothing numerical itself — pooling stays in ma-core.js,
 *     contrasts stay in ma-comparisons-v1.js. This module only *judges*.
 *   - Unknown-measure legacy rows WARN, they never BLOCK — old buses keep
 *     flowing.
 *   - assess(input) returns { ok, block:[], warn:[], info:[], recommend:{} };
 *     callers decide whether a non-empty `block` is fatal. `ok` is
 *     `block.length === 0`.
 *
 * Browser (window.AlmMaMethods) and Node (module.exports).
 *
 * Findings carry { code, msg, section } where `section` is the Handbook
 * reference. Codes are stable strings so tests/UI can assert on them.
 *
 * References: Cochrane Handbook for Systematic Reviews of Interventions
 * v6.5 (2024), chapters 6 (choosing effect measures), 10 (meta-analysis),
 * 11 & 23 (multi-arm / network meta-analysis). Statistical gotchas mirror
 * .claude/rules/advanced-stats.md.
 */
(function (global) {
  "use strict";

  var BINARY  = { OR: true, RR: true, RD: true };       // 2x2 count outcomes
  var TTE     = { HR: true };                            // time-to-event
  var CONT    = { MD: true, SMD: true };                 // continuous
  var ALL     = { OR:true, RR:true, RD:true, HR:true, MD:true, SMD:true };

  // Which raw data type each measure is legitimately computed from (ch.6).
  //   binary    → OR/RR/RD       (Handbook 6.4)
  //   continuous→ MD/SMD         (Handbook 6.5)
  //   tte       → HR             (Handbook 6.8.1)
  function measureDataType(m) {
    if (BINARY[m]) return "binary";
    if (CONT[m]) return "continuous";
    if (TTE[m]) return "tte";
    return null;
  }

  function isFiniteNumber(x) { return typeof x === "number" && Number.isFinite(x); }
  function nonEmptyString(x) { return typeof x === "string" && x.length > 0; }

  function finding(code, msg, section) {
    return { code: code, msg: msg, section: section };
  }

  // ----- Effect-measure selection (Handbook ch.6) ------------------------

  // chooseMeasure(dataType, opts) → recommended measure + rationale.
  //   binary    → "RR" by default (6.4.1.2: ratio measures more consistent
  //               across baseline risks than RD; RR more interpretable than OR
  //               for cohort/RCT data). Use OR only for case-control / when a
  //               logistic model is the basis (opts.caseControl).
  //   continuous→ "MD" when all studies use the SAME scale (6.5.1.1),
  //               "SMD" when scales differ (6.5.1.2). Pass opts.sameScale.
  //   tte       → "HR" (6.8.1).
  function chooseMeasure(dataType, opts) {
    opts = opts || {};
    if (dataType === "binary") {
      if (opts.caseControl) return { measure: "OR", section: "6.4.1",
        why: "Case-control data: OR is the valid measure (RR needs cohort/RCT)." };
      return { measure: "RR", section: "6.4.1.2",
        why: "Binary RCT/cohort data: RR is more interpretable and more consistent across baseline risks than OR; RD is baseline-risk-dependent." };
    }
    if (dataType === "continuous") {
      if (opts.sameScale === false) return { measure: "SMD", section: "6.5.1.2",
        why: "Continuous outcomes measured on DIFFERENT scales: standardise to SMD (Hedges' g)." };
      return { measure: "MD", section: "6.5.1.1",
        why: "Continuous outcomes on the SAME scale: pool the mean difference (MD); it keeps clinical units." };
    }
    if (dataType === "tte") {
      return { measure: "HR", section: "6.8.1",
        why: "Time-to-event outcome: pool the log hazard ratio (HR)." };
    }
    return { measure: null, section: "6.3", why: "Unknown data type — cannot recommend a measure." };
  }

  // ----- Model / pooling selection (Handbook ch.10) ----------------------

  // chooseModel({ k, expectClinicalDiversity }) → FE vs RE + estimator.
  //   Default RE (10.10.4.1: clinical/methodological diversity is the norm in
  //   reviews; FE assumes a single true effect). τ² estimator: REML default,
  //   PM acceptable; DerSimonian-Laird is biased for small k and discouraged
  //   (10.10.4.1 note; advanced-stats.md "Never use DL for k<10").
  //   HKSJ (Hartung-Knapp-Sidik-Jonkman) for the RE CI when k is small
  //   (10.10.4.1: better coverage than the Wald/normal interval).
  function chooseModel(opts) {
    opts = opts || {};
    var k = isFiniteNumber(opts.k) ? opts.k : null;
    var rec = {
      model: "RE",
      estimator: "REML",
      knha: true,
      pi: true,
      section: "10.10.4.1",
      why: "Random-effects (REML τ², Hartung-Knapp CI) is the Handbook default; clinical/methodological diversity between studies is expected.",
    };
    if (k != null && k < 5) {
      rec.note = "Few studies (k<5): τ² is poorly estimated. Prefer REML/PM (never DL), use Hartung-Knapp, and interpret the τ²/I² with great caution (10.10.4.1).";
    }
    return rec;
  }

  // ----- The guardrail: assess(input) ------------------------------------

  /**
   * assess(input) — run every applicable Handbook rule over a described
   * analysis and return structured findings. NOTHING here mutates input or
   * computes a pooled estimate; it only judges the setup.
   *
   * input fields (all optional — rules fire only when their inputs are present):
   *   measure      string  the chosen effect measure (OR/RR/RD/HR/MD/SMD)
   *   measures     array   per-study measures (to detect silent mixing)
   *   dataType     string  "binary" | "continuous" | "tte"
   *   model        string  "FE" | "RE"
   *   estimator    string  τ² estimator if RE ("REML"/"PM"/"DL"/...)
   *   k            number  number of studies/contrasts being pooled
   *   knha         boolean Hartung-Knapp CI in use
   *   hasPI        boolean a prediction interval is reported
   *   I2           number  heterogeneity I² (0-100), if known
   *   studies      array   ma-comparisons-v1 arm-level studies (multi-arm detect)
   *   contrasts    array   {study, treatment1, treatment2, design} contrast rows
   *   multiArmCorrected boolean  consumer applies a shared-control correction
   *   estimates    array   raw effect estimates for plausibility (natural OR/RR/HR or log?)
   *   estimatesAreLog boolean  whether `estimates` are already on the log scale
   *
   * Returns { ok, block, warn, info, recommend }.
   */
  function assess(input) {
    input = input || {};
    var block = [], warn = [], info = [];
    var recommend = {};

    var measure = nonEmptyString(input.measure) ? input.measure : null;
    var dataType = nonEmptyString(input.dataType) ? input.dataType
                 : (measure ? measureDataType(measure) : null);

    // --- 1. Effect-measure validity (ch.6) ---------------------------------
    if (measure && !ALL[measure]) {
      // Unknown / legacy measure: WARN, never BLOCK (back-compat with old buses).
      warn.push(finding("unknown-measure",
        "Effect measure '" + measure + "' is not recognised (expected OR/RR/RD/HR/MD/SMD). " +
        "Treating as legacy data — confirm the analysis scale manually.", "6.3"));
    } else if (measure && dataType) {
      var natural = measureDataType(measure);
      // Wrong measure for the data type → BLOCK (ch.6.4/6.5/6.8).
      if (input.dataType && natural && natural !== dataType) {
        block.push(finding("measure-datatype-mismatch",
          "Effect measure '" + measure + "' (a " + natural + " measure) does not match the declared " +
          dataType + " data. " + describeMeasureFix(dataType), sectionForDataType(dataType)));
      }
    }

    // --- 2. Silent mixing of effect measures (ch.10.2; the §10.4 guard) ----
    if (Array.isArray(input.measures) && input.measures.length) {
      var seen = {};
      for (var mi = 0; mi < input.measures.length; mi++) {
        var mm = input.measures[mi];
        if (nonEmptyString(mm)) seen[mm] = true;
      }
      var distinct = Object.keys(seen);
      // Treat measures that share a scale family as poolable only if identical.
      if (distinct.length > 1) {
        // RR and OR (and RD) are DIFFERENT analysis scales — pooling them
        // together is a category error, not a back-transform.
        block.push(finding("mixed-measures",
          "Pooling studies that report different effect measures (" + distinct.sort().join(", ") +
          ") in one synthesis. This silently mixes scales (e.g. log-OR with log-RR) and is invalid. " +
          "Convert all studies to a single measure first, or analyse separately.", "10.2"));
      }
    }

    // --- 3. When NOT to pool / unit-of-analysis (ch.10.2, 10.10.4.1) -------
    var k = isFiniteNumber(input.k) ? input.k : null;
    if (k != null) {
      if (k < 1) {
        block.push(finding("no-studies", "No studies to pool.", "10.2"));
      } else if (k < 2) {
        block.push(finding("k-too-small",
          "Only 1 study — a meta-analysis needs at least 2. Report the single study's estimate directly; " +
          "do not present it as a pooled result.", "10.2"));
      }
    }

    // --- 4. Random-effects estimator + CI + PI (ch.10.10.4) ----------------
    var model = nonEmptyString(input.model) ? input.model.toUpperCase() : null;
    var isRE = model === "RE" || model === "RANDOM";
    if (isRE) {
      var est = nonEmptyString(input.estimator) ? input.estimator.toUpperCase() : null;
      // DL for small k → WARN (advanced-stats.md: never DL for k<10; biased τ²).
      if (est === "DL" && k != null && k < 10) {
        warn.push(finding("dl-small-k",
          "DerSimonian-Laird τ² with k=" + k + " (<10) is biased downward. Use REML or Paule-Mandel.",
          "10.10.4.1"));
      }
      // RE & k≥3 with no prediction interval → WARN (10.10.4.3).
      if (k != null && k >= 3 && input.hasPI === false) {
        warn.push(finding("no-prediction-interval",
          "Random-effects model with k=" + k + " but no prediction interval. The Handbook recommends a " +
          "prediction interval to express the spread of true effects across settings, alongside the CI of the mean.",
          "10.10.4.3"));
      }
      // Small k without Hartung-Knapp → INFO (better coverage).
      if (k != null && k < 10 && input.knha === false) {
        info.push(finding("consider-knha",
          "Consider the Hartung-Knapp CI for the random-effects mean at this k — it has better coverage than the " +
          "normal/Wald interval when the number of studies is small.", "10.10.4.1"));
      }
    }

    // --- 5. Heterogeneity magnitude (ch.10.10.2) ---------------------------
    if (isFiniteNumber(input.I2)) {
      if (input.I2 >= 75) {
        warn.push(finding("high-heterogeneity",
          "I²=" + input.I2.toFixed(0) + "% indicates considerable heterogeneity. A single pooled effect may be " +
          "misleading; investigate sources (subgroups/meta-regression) and consider whether pooling is appropriate.",
          "10.10.2"));
      }
    }

    // --- 6. Multi-arm / shared-control unit-of-analysis (ch.23.3.4) --------
    var multiArm = detectMultiArm(input);
    if (multiArm.count > 0) {
      info.push(finding("multi-arm-present",
        multiArm.count + " multi-arm " + (multiArm.count === 1 ? "study" : "studies") +
        " detected (" + multiArm.designs.join("; ") + ").", "23.3.4"));
      // A multi-arm trial emits correlated contrasts sharing a common comparator.
      // Treating them as independent double-counts the shared arm — a
      // unit-of-analysis error (23.3.4). BLOCK unless the consumer corrects it.
      if (input.multiArmCorrected !== true) {
        block.push(finding("multi-arm-uncorrected",
          "Multi-arm studies contribute correlated contrasts that share a common comparator. Pooling them as if " +
          "independent double-counts the shared-control arm (a unit-of-analysis error). Apply the within-study " +
          "covariance correction (off-diagonal cov, +τ²/2 for RE) before interpreting.", "23.3.4"));
      }
    }

    // --- 7. Implausible effect sizes (data-integrity) ----------------------
    if (Array.isArray(input.estimates) && measure) {
      var imp = checkPlausibility(input.estimates, measure, input.estimatesAreLog);
      if (imp) block.push(imp);
    }

    return {
      ok: block.length === 0,
      block: block,
      warn: warn,
      info: info,
      recommend: recommend,
    };
  }

  // ----- helpers ---------------------------------------------------------

  function sectionForDataType(dt) {
    if (dt === "binary") return "6.4";
    if (dt === "continuous") return "6.5";
    if (dt === "tte") return "6.8.1";
    return "6.3";
  }
  function describeMeasureFix(dt) {
    if (dt === "binary") return "Use OR, RR or RD for binary count data.";
    if (dt === "continuous") return "Use MD (same scale) or SMD (different scales) for continuous data.";
    if (dt === "tte") return "Use HR for time-to-event data.";
    return "";
  }

  // Detect multi-arm studies from either arm-level studies (>2 arms) or from
  // contrast rows that share a `design` with >2 treatments.
  function detectMultiArm(input) {
    var designs = [], count = 0;
    if (Array.isArray(input.studies)) {
      for (var i = 0; i < input.studies.length; i++) {
        var s = input.studies[i];
        if (s && Array.isArray(s.arms) && s.arms.length > 2) {
          count++;
          designs.push(String(s.id || ("study" + i)) + " [" +
            s.arms.map(function (a) { return a.treatment; }).join("/") + "]");
        }
      }
    }
    if (count === 0 && Array.isArray(input.contrasts)) {
      // A design tag like "A:B:C" with >2 colon-separated arms is multi-arm.
      var seenDesign = {};
      for (var c = 0; c < input.contrasts.length; c++) {
        var d = input.contrasts[c] && input.contrasts[c].design;
        if (nonEmptyString(d) && !seenDesign[d]) {
          seenDesign[d] = true;
          if (d.split(":").length > 2) { count++; designs.push(d); }
        }
      }
    }
    return { count: count, designs: designs };
  }

  // Flag clearly impossible effect sizes. Ratio measures (OR/RR/HR) must be
  // > 0 on the natural scale; log-scale inputs are unbounded but should be
  // finite. We flag NaN/Inf and natural-scale ratios ≤ 0.
  function checkPlausibility(estimates, measure, areLog) {
    var ratio = (measure === "OR" || measure === "RR" || measure === "HR");
    for (var i = 0; i < estimates.length; i++) {
      var e = estimates[i];
      if (!isFiniteNumber(e)) {
        return finding("implausible-estimate",
          "Non-finite effect estimate at position " + i + " (" + e + ").", "10.2");
      }
      if (ratio && !areLog && e <= 0) {
        return finding("implausible-estimate",
          "Ratio measure '" + measure + "' with a non-positive value (" + e + ") at position " + i +
          " — ratios must be > 0 on the natural scale. Are these meant to be log-scale?", "6.4");
      }
    }
    return null;
  }

  var api = {
    measureDataType: measureDataType,
    chooseMeasure: chooseMeasure,
    chooseModel: chooseModel,
    assess: assess,
    // exposed for tests / advanced callers
    _detectMultiArm: detectMultiArm,
    _checkPlausibility: checkPlausibility,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMaMethods = api;
})(typeof window !== "undefined" ? window : globalThis);
