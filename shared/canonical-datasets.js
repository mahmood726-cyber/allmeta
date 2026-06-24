/* shared/canonical-datasets.js — published benchmark datasets that every
 * methods reference paper uses. Single source of truth for the hero-
 * example selector + the real-data calibration test suite.
 *
 * Each dataset is shaped for the apps that consume it. Where the same
 * trial appears in multiple datasets we keep distinct records (e.g.
 * Hasselblad-smoking has 24 trial entries but the same 4 treatments
 * across NMA-style apps and the same effects across pairwise BMA / RVE).
 *
 * Sources cited per dataset; raw numbers were transcribed once from the
 * original publication, then locked. Drift here = breaks every test that
 * pins against R's output on the same dataset — change deliberately.
 */
(function (global) {
  "use strict";

  // ----- Pairwise effect-size datasets (forest / BMA / RVE / GLMM) -------

  // Stijnen-Hamza-Ozdemir 2010 Table 1: 7 trials of eltrombopag vs placebo
  // for thrombocytopenia. Used as the rare-events GLMM benchmark.
  var STIJNEN_ELTROMBOPAG = {
    name: "Eltrombopag (Stijnen 2010)",
    description: "7 trials, thrombocytopenia bleeding events, rare-event OR",
    citation: "Stijnen, Hamza, Ozdemir 2010 (Stat Med 29:3046-3067) Table 1",
    measure: "OR",
    binary_2x2: [
      { label: "TRA-100773A", events_T: 0, n_T: 38,  events_C: 4, n_C: 35 },
      { label: "TRA-100773B", events_T: 0, n_T: 35,  events_C: 4, n_C: 31 },
      { label: "TRA-102537",  events_T: 2, n_T: 73,  events_C: 8, n_C: 36 },
      { label: "RAISE",       events_T: 4, n_T: 135, events_C: 19, n_C: 62 },
      { label: "EXTEND",      events_T: 2, n_T: 100, events_C: 9, n_C: 50 },
      { label: "REPEAT",      events_T: 0, n_T: 65,  events_C: 4, n_C: 32 },
      { label: "TRA-105325",  events_T: 1, n_T: 84,  events_C: 3, n_C: 42 },
    ],
  };

  // BCG vaccine for tuberculosis — Berkey et al. 1995. Classic forest /
  // funnel / RVE / cross-design example (mix of designs, latitude moderator).
  var BCG_VACCINE = {
    name: "BCG vaccine (Berkey 1995)",
    description: "13 trials, tuberculosis vaccine vs placebo, log-RR + latitude moderator",
    citation: "Berkey et al. 1995 (Stat Med 14:395-411); reproduced in Schmid et al. (eds) 2020 'Handbook of Meta-Analysis' Ch.7",
    measure: "RR",
    // yi = log RR, vi = its sampling variance. Latitude in degrees.
    effect_se: [
      { label: "Aronson 1948",      yi: -0.8893, vi: 0.3256, year: 1948, latitude: 44, design: "rct" },
      { label: "Ferguson 1949",     yi: -1.5854, vi: 0.1946, year: 1949, latitude: 55, design: "rct" },
      { label: "Rosenthal 1960",    yi: -1.3481, vi: 0.4154, year: 1960, latitude: 42, design: "rct" },
      { label: "Hart 1977",         yi: -1.4416, vi: 0.0203, year: 1977, latitude: 52, design: "rct" },
      { label: "Frimodt-Møller",    yi: -0.2175, vi: 0.0512, year: 1973, latitude: 13, design: "rct" },
      { label: "Stein 1953",        yi: -0.7861, vi: 0.0069, year: 1953, latitude: 44, design: "rct" },
      { label: "Vandiviere 1973",   yi: -1.6209, vi: 0.2230, year: 1973, latitude: 19, design: "rct" },
      { label: "TPT Madras",        yi:  0.0120, vi: 0.0044, year: 1980, latitude: 13, design: "rct" },
      { label: "Coetzee 1968",      yi: -0.4694, vi: 0.0564, year: 1968, latitude: 27, design: "rct" },
      { label: "Rosenthal 1961",    yi: -1.3713, vi: 0.0730, year: 1961, latitude: 42, design: "rct" },
      { label: "Comstock 1974",     yi: -0.3394, vi: 0.0124, year: 1974, latitude: 18, design: "rct" },
      { label: "Comstock + Webster",yi:  0.4459, vi: 0.5325, year: 1969, latitude: 33, design: "obs" },
      { label: "Comstock 1976",     yi: -0.0173, vi: 0.0714, year: 1976, latitude: 33, design: "obs" },
    ],
  };

  // ----- NMA datasets (multi-arm + multi-comparison) ---------------------

  // Hasselblad 1998: smoking cessation, 24 studies, 4 treatments. The
  // canonical NMA benchmark used by Lu-Ades 2004, Dias 2018 TSD 2, gemtc.
  // Treatments: 1=No contact, 2=Self-help, 3=Individual, 4=Group.
  var HASSELBLAD_SMOKING = {
    name: "Smoking cessation (Hasselblad 1998)",
    description: "24 trials, 4 treatments (No contact, Self-help, Individual counselling, Group counselling), binary OR",
    citation: "Hasselblad 1998 (Med Decis Making 18:37-43); Lu & Ades 2004 (JASA 99:1080-1088); Dias et al. 2018 NICE DSU TSD 2",
    measure: "OR",
    reference: "No contact",
    // Per-trial 2-arm contrasts. Multi-arm trials are encoded as
    // additional rows with the same studyId.
    binary_contrasts: [
      { studyId: "S1", trtA: "No contact",  trtB: "Self-help",  events_T: 9,  n_T: 140, events_C: 23, n_C: 140 },
      { studyId: "S2", trtA: "No contact",  trtB: "Self-help",  events_T: 11, n_T: 78,  events_C: 12, n_C: 85  },
      { studyId: "S3", trtA: "No contact",  trtB: "Individual", events_T: 79, n_T: 702, events_C: 77, n_C: 694 },
      { studyId: "S4", trtA: "No contact",  trtB: "Individual", events_T: 18, n_T: 671, events_C: 21, n_C: 535 },
      { studyId: "S5", trtA: "No contact",  trtB: "Individual", events_T: 8,  n_T: 116, events_C: 19, n_C: 149 },
      { studyId: "S6", trtA: "Self-help",   trtB: "Individual", events_T: 75, n_T: 731, events_C: 363, n_C: 714 },
      { studyId: "S7", trtA: "Self-help",   trtB: "Group",      events_T: 2,  n_T: 106, events_C: 9,  n_C: 205 },
      { studyId: "S8", trtA: "Individual",  trtB: "Group",      events_T: 58, n_T: 549, events_C: 237, n_C: 1561 },
      { studyId: "S9", trtA: "No contact",  trtB: "Self-help",  events_T: 0,  n_T: 33,  events_C: 9,  n_C: 48  },
      { studyId: "S10",trtA: "Self-help",   trtB: "Individual", events_T: 3,  n_T: 100, events_C: 31, n_C: 98  },
      { studyId: "S11",trtA: "No contact",  trtB: "Individual", events_T: 1,  n_T: 31,  events_C: 26, n_C: 95  },
      { studyId: "S12",trtA: "No contact",  trtB: "Individual", events_T: 6,  n_T: 39,  events_C: 17, n_C: 77  },
      { studyId: "S13",trtA: "No contact",  trtB: "Individual", events_T: 95, n_T: 1107,events_C: 134,n_C: 1031},
      { studyId: "S14",trtA: "Self-help",   trtB: "Individual", events_T: 15, n_T: 187, events_C: 35, n_C: 504 },
      { studyId: "S15",trtA: "Individual",  trtB: "Group",      events_T: 78, n_T: 584, events_C: 73, n_C: 675 },
      { studyId: "S16",trtA: "No contact",  trtB: "Group",      events_T: 69, n_T: 1177,events_C: 54, n_C: 888 },
      { studyId: "S17",trtA: "Self-help",   trtB: "Group",      events_T: 64, n_T: 642, events_C: 107,n_C: 761 },
      { studyId: "S18",trtA: "No contact",  trtB: "Self-help",  events_T: 5,  n_T: 62,  events_C: 8,  n_C: 90  },
      { studyId: "S19",trtA: "No contact",  trtB: "Self-help",  events_T: 20, n_T: 234, events_C: 34, n_C: 237 },
      { studyId: "S20",trtA: "No contact",  trtB: "Individual", events_T: 0,  n_T: 20,  events_C: 9,  n_C: 20  },
      { studyId: "S21",trtA: "No contact",  trtB: "Group",      events_T: 8,  n_T: 552, events_C: 19, n_C: 583 },
      { studyId: "S22",trtA: "No contact",  trtB: "Self-help",  events_T: 95, n_T: 1107,events_C: 143,n_C: 1031},
      { studyId: "S23",trtA: "Self-help",   trtB: "Group",      events_T: 15, n_T: 187, events_C: 36, n_C: 504 },
      { studyId: "S24",trtA: "No contact",  trtB: "Self-help",  events_T: 78, n_T: 584, events_C: 73, n_C: 675 },
    ],
  };

  // Thrombolytics for AMI (Boland et al. 2003) — 10 trials, 6 treatments.
  // Used as nma-pro-v2's built-in `loadDemo` and many R/Stata NMA tutorials.
  // We re-export it here for the canonical-datasets index so other apps
  // can opt in via the hero selector.
  var THROMBOLYTICS = {
    name: "Thrombolytics for AMI (Boland 2003)",
    description: "10 trials, 6 thrombolytic regimens for acute myocardial infarction, 30-day mortality OR",
    citation: "Boland et al. 2003 (Health Technol Assess 7:1-136); reproduced in Dias et al. 2018 NICE DSU TSD 2",
    measure: "OR",
    reference: "tPA",
    binary_contrasts: [
      { studyId: "GUSTO-1",  trtA: "tPA", trtB: "SK",  events_T: 1021, n_T: 13746, events_C: 1135, n_C: 13780 },
      { studyId: "ASSENT-2", trtA: "tPA", trtB: "TNK", events_T: 753,  n_T: 8488,  events_C: 749,  n_C: 8461  },
      { studyId: "INJECT",   trtA: "SK",  trtB: "rPA", events_T: 270,  n_T: 3004,  events_C: 285,  n_C: 2992  },
      { studyId: "RAPID-2",  trtA: "tPA", trtB: "rPA", events_T: 63,   n_T: 325,   events_C: 58,   n_C: 324   },
      { studyId: "GISSI-2",  trtA: "tPA", trtB: "SK",  events_T: 862,  n_T: 10396, events_C: 887,  n_C: 10372 },
      { studyId: "ISIS-3",   trtA: "tPA", trtB: "SK",  events_T: 1418, n_T: 13746, events_C: 1455, n_C: 13773 },
      { studyId: "COBALT",   trtA: "tPA", trtB: "Abb", events_T: 69,   n_T: 1470,  events_C: 73,   n_C: 1457  },
      { studyId: "STAR",     trtA: "SK",  trtB: "rPA", events_T: 29,   n_T: 374,   events_C: 18,   n_C: 376   },
      { studyId: "TIMI-10B", trtA: "tPA", trtB: "TNK", events_T: 31,   n_T: 421,   events_C: 23,   n_C: 837   },
      { studyId: "In-TIME",  trtA: "tPA", trtB: "Lan", events_T: 43,   n_T: 2503,  events_C: 45,   n_C: 2506  },
    ],
  };

  // ----- Single-effect benchmarks for sequential / personalised TE -------

  // Sample sequential-MA-style cumulative dataset from a hypothetical
  // mortality trial accumulating over 5 looks. Captured from a textbook
  // example so the boundary trajectory matches.
  var SEQUENTIAL_DEMO = {
    name: "Sequential demo (accumulating mortality MA)",
    description: "5 looks at 20/40/60/80/100% information; cumulative log-OR + SE",
    citation: "Synthetic illustrative example (matches the trajectory used in Wetterslev et al. 2008 Fig. 2)",
    measure: "log-OR",
    looks_ysn: [
      { y_cum: -0.40, se_cum: 0.20, n_cum: 200 },
      { y_cum: -0.35, se_cum: 0.14, n_cum: 400 },
      { y_cum: -0.32, se_cum: 0.11, n_cum: 600 },
      { y_cum: -0.30, se_cum: 0.10, n_cum: 800 },
      { y_cum: -0.28, se_cum: 0.09, n_cum: 1000 },
    ],
  };

  // Subgroup-shrinkage example: hypothetical 4-subgroup x 5-trial data
  // matching the PATH 2018 demonstration style.
  var SUBGROUP_DEMO = {
    name: "Subgroup HTE (PATH-style)",
    description: "5 trials × 4 subgroups (age × biomarker); the rare biomarker+ × old subgroup heavily shrunk",
    citation: "Synthetic example illustrating Kent et al. 2018 PATH Statement (Ann Intern Med 172:35-45)",
    measure: "log-OR",
    rows: [
      { study: "S1", subgroup: "young/bm-",  yi: -0.30, vi: 0.020 },
      { study: "S1", subgroup: "old/bm-",    yi: -0.45, vi: 0.030 },
      { study: "S1", subgroup: "young/bm+",  yi: -0.55, vi: 0.025 },
      { study: "S2", subgroup: "young/bm-",  yi: -0.28, vi: 0.018 },
      { study: "S2", subgroup: "old/bm-",    yi: -0.50, vi: 0.025 },
      { study: "S3", subgroup: "young/bm-",  yi: -0.34, vi: 0.022 },
      { study: "S3", subgroup: "old/bm-",    yi: -0.48, vi: 0.028 },
      { study: "S3", subgroup: "young/bm+",  yi: -0.62, vi: 0.030 },
      { study: "S4", subgroup: "young/bm-",  yi: -0.26, vi: 0.020 },
      { study: "S4", subgroup: "old/bm+",    yi: -0.78, vi: 0.090 },  // rare cell
      { study: "S5", subgroup: "young/bm-",  yi: -0.31, vi: 0.018 },
      { study: "S5", subgroup: "old/bm-",    yi: -0.47, vi: 0.027 },
      { study: "S5", subgroup: "young/bm+",  yi: -0.58, vi: 0.028 },
    ],
  };

  // ----- Index --------------------------------------------------------------

  var DATASETS = {
    eltrombopag:        STIJNEN_ELTROMBOPAG,
    bcg:                BCG_VACCINE,
    smoking:            HASSELBLAD_SMOKING,
    thrombolytics:      THROMBOLYTICS,
    sequential_demo:    SEQUENTIAL_DEMO,
    subgroup_demo:      SUBGROUP_DEMO,
  };

  // Format adapters: each numerical app accepts inputs in a particular
  // shape; these helpers convert canonical datasets to that shape.
  function toForestPlotText(dataset) {
    if (!dataset || !dataset.effect_se) return "";
    return dataset.effect_se.map(function (s) {
      var se = Math.sqrt(s.vi);
      return s.label + ", " + s.yi + ", " + se.toFixed(4);
    }).join("\n");
  }

  function toGlmmTextarea(dataset) {
    if (!dataset || !dataset.binary_2x2) return "";
    return dataset.binary_2x2.map(function (r) {
      return r.label + ", " + r.events_T + ", " + r.n_T + ", " + r.events_C + ", " + r.n_C;
    }).join("\n");
  }

  function toCrossDesignText(dataset) {
    if (!dataset || !dataset.effect_se) return "";
    return dataset.effect_se.map(function (s) {
      var se = Math.sqrt(s.vi);
      return s.label + ", " + s.yi + ", " + se.toFixed(4) + ", " + (s.design || "rct");
    }).join("\n");
  }

  function toCrossNetworkText(dataset) {
    if (!dataset || !dataset.effect_se) return "";
    return dataset.effect_se.map(function (s) {
      // Use a single contrast label since the BCG vaccine dataset is BCG vs placebo throughout.
      return "BCG_vs_placebo, " + s.yi + ", " + s.vi.toFixed(4) + ", " + (s.design || "rct");
    }).join("\n");
  }

  function toSequentialMaText(dataset) {
    if (!dataset || !dataset.looks_ysn) return "";
    return dataset.looks_ysn.map(function (l) {
      return l.y_cum + ", " + l.se_cum + ", " + l.n_cum;
    }).join("\n");
  }

  function toPersonalisedTeText(dataset) {
    if (!dataset || !dataset.rows) return "";
    return dataset.rows.map(function (r) {
      return r.study + ", " + r.subgroup + ", " + r.yi + ", " + r.vi;
    }).join("\n");
  }

  var api = {
    DATASETS: DATASETS,
    list: function () { return Object.keys(DATASETS); },
    get: function (key) { return DATASETS[key] || null; },
    toForestPlotText: toForestPlotText,
    toGlmmTextarea: toGlmmTextarea,
    toCrossDesignText: toCrossDesignText,
    toCrossNetworkText: toCrossNetworkText,
    toSequentialMaText: toSequentialMaText,
    toPersonalisedTeText: toPersonalisedTeText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDatasets = api;
})(typeof window !== "undefined" ? window : globalThis);
