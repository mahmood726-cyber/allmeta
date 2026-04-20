/**
 * NMA Dose Response Studio - Meta-Analysis Module
 * Collection of novel meta-analysis methods not available in R
 */

// Robust Meta-Analysis Methods
export { RobustTMetaAnalysis, default as RobustTDistribution } from './robust-t-distribution.js';
export { ARFISMetaAnalysis, default as ARFISRobust } from './arfis-robust.js';
export { ComprehensivePIEvaluation, default as PredictionIntervals } from './prediction-intervals.js';
export { EdgingtonMethod, default as EdgingtonPI } from './edgington-method.js';
export { NonNormalRandomEffects, default as NonNormalRE } from './non-normal-random-effects.js';

// Default export for convenience
import { RobustTMetaAnalysis } from './robust-t-distribution.js';
import { ARFISMetaAnalysis } from './arfis-robust.js';
import { ComprehensivePIEvaluation } from './prediction-intervals.js';
import { EdgingtonMethod } from './edgington-method.js';
import { NonNormalRandomEffects } from './non-normal-random-effects.js';

export default {
  RobustTMetaAnalysis,
  ARFISMetaAnalysis,
  ComprehensivePIEvaluation,
  EdgingtonMethod,
  NonNormalRandomEffects
};
