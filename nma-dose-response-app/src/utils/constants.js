/**
 * NMA Dose Response Studio - Constants Module
 * Centralized configuration and constants
 */

// Application configuration limits
export const CONFIG = {
  MAX_ROWS: 10000,
  MAX_TREATMENTS: 100,
  MAX_STUDIES: 500,
  MAX_BOOTSTRAP_ITER: 2000,
  MAX_STRING_LENGTH: 200,
  MAX_NUMERIC_VALUE: 1e12,
  MIN_NUMERIC_VALUE: -1e12,
  OPTIMIZATION_MAX_ITER: 500,
  OPTIMIZATION_TOLERANCE: 1e-8,
  GRID_SEARCH_POINTS: 8
};

// Error code constants for error handling
export const ERROR_CODES = {
  PARSE_ERROR: "PARSE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  OPTIMIZATION_ERROR: "OPTIMIZATION_ERROR",
  WASM_ERROR: "WASM_ERROR",
  DATA_ERROR: "DATA_ERROR",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED"
};

// Colorblind-safe palette (Wong palette + extensions)
// Suitable for publication-quality figures
export const PALETTE = [
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#999999"  // gray
];

// Statistical significance thresholds
export const SIGNIFICANCE_LEVELS = {
  VERY_HIGH: 0.001,
  HIGH: 0.01,
  MODERATE: 0.05,
  MARGINAL: 0.10,
  NONE: 1.0
};

// Default values for model parameters
export const DEFAULTS = {
  BOOTSTRAP_ITERATIONS: 200,
  BOOTSTRAP_SEED: null,
  ALPHA_LEVEL: 0.05,
  TAU2_METHOD: "dl",
  HKSJ_ENABLED: false,
  CONFIDENCE_INTERVAL: 0.95
};

// Method references for documentation
export const REFERENCES = {
  DER_SIMONIAN_LAIRD: "DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188.",
  REML: "Viechtbauer W. Bias and efficiency of meta-analytic variance estimators in the random-effects model. Stat Med. 2005;24(23):3685-3700.",
  PAULE_MANDEL: "Paule RC, Mandel J. Combining unrelated experiments. Biometrics. 1982;38(1):193-201.",
  SIDIK_JONKMAN: "Sidik K, Jonkman JN. A simple confidence interval for the ratio of two binomial proportions. Stat Med. 2002;21(21):3153-3159.",
  HARTUNG_KNAPP: "Hartung J, Knapp G. A refined method for the meta-analysis of controlled randomized clinical trials. Stat Med. 2001;20(24):3855-3867.",
  ORSINI_RCS: "Orsini N, et al. Multivariate dose-response meta-analysis: a description of available methods. Stata J. 2012;12(2):241-257.",
  HIGGINS_I2: "Higgins JP, et al. Measuring inconsistency in meta-analyses. BMJ. 2003;327(7414):557-560.",
  DIAS_NODESPLIT: "Dias S, et al. Checking consistency in mixed treatment comparison meta-analysis. Stat Med. 2010;29(7-8):932-943."
};

export default {
  CONFIG,
  ERROR_CODES,
  PALETTE,
  SIGNIFICANCE_LEVELS,
  DEFAULTS,
  REFERENCES
};
