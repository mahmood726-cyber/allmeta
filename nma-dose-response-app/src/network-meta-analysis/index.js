/**
 * NMA Dose Response Studio - Network Meta-Analysis Module
 * Collection of novel NMA methods from recent research
 */

// One-step exact likelihood NMA
export { OneStepExactLikelihoodNMA, default as ExactLikelihoodNMA } from './exact-likelihood-nma.js';

// Composite likelihood NMA
export { CompositeLikelihoodNMA, default as CompositeNMA } from './composite-likelihood-nma.js';

// Bayesian outlier detection for NMA
export { BayesianOutlierDetectionNMA, default as OutlierDetectionNMA } from './bayesian-outlier-detection.js';

// Node typology for NMA
export { NodeTypologyNMA, default as NodeTypology } from './node-typology.js';

// NMA Assumptions Visualization
export { NMAAssumptionsVisualization, visualizeNMAAssumptions, default as NMAVisualization } from './nma-assumptions-visualization.js';

// NMA Treatment Effect Calibration
export { NMATreatmentEffectCalibration, calibrateTreatmentEffects, default as EffectCalibration } from './treatment-effect-calibration.js';

// NMA with Baseline Risk Regression
export { NMABaselineRiskRegression, baselineRiskRegression, default as BaselineRiskRegression } from './baseline-risk-regression.js';

// Default export for convenience
import { OneStepExactLikelihoodNMA } from './exact-likelihood-nma.js';
import { CompositeLikelihoodNMA } from './composite-likelihood-nma.js';
import { BayesianOutlierDetectionNMA } from './bayesian-outlier-detection.js';
import { NodeTypologyNMA } from './node-typology.js';
import { NMAAssumptionsVisualization } from './nma-assumptions-visualization.js';
import { NMATreatmentEffectCalibration } from './treatment-effect-calibration.js';
import { NMABaselineRiskRegression } from './baseline-risk-regression.js';

export default {
  OneStepExactLikelihoodNMA,
  CompositeLikelihoodNMA,
  BayesianOutlierDetectionNMA,
  NodeTypologyNMA,
  NMAAssumptionsVisualization,
  NMATreatmentEffectCalibration,
  NMABaselineRiskRegression
};
