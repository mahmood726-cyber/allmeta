/**
 * NMA Dose Response Studio - Dose-Response Module
 * Collection of novel dose-response methods from recent research
 */

// Semi-parametric BMD with monotone additive models
export { SemiParametricBMD, default as SemiparametricBMD } from './semiparametric-bmd.js';

// Bayesian Model Averaged BMD
export { BayesianModelAveragedBMD, default as BMABMD } from './bma-bmd.js';

// BMD Uncertainty Reduction
export { BMDUncertaintyReduction, default as BMDUncertainty } from './bmd-uncertainty-reduction.js';

// Gene-Set BMD Estimation
export { GeneSetBMDEstimation, estimateGeneSetBMD, default as GeneSetBMD } from './gene-set-bmd.js';

// Multi-Omics BMD Integration
export { MultiOmicsBMDIntegration, integrateMultiOmicsBMD, default as MultiOmicsBMD } from './multi-omics-bmd.js';

// Default export for convenience
import { SemiParametricBMD } from './semiparametric-bmd.js';
import { BayesianModelAveragedBMD } from './bma-bmd.js';
import { BMDUncertaintyReduction } from './bmd-uncertainty-reduction.js';
import { GeneSetBMDEstimation } from './gene-set-bmd.js';
import { MultiOmicsBMDIntegration } from './multi-omics-bmd.js';

export default {
  SemiParametricBMD,
  BayesianModelAveragedBMD,
  BMDUncertaintyReduction,
  GeneSetBMDEstimation,
  MultiOmicsBMDIntegration
};
