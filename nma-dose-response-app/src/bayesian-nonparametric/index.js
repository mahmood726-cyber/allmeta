/**
 * NMA Dose Response Studio - Bayesian Nonparametric Module
 * Collection of novel Bayesian nonparametric methods from recent research
 */

// Dependent Tail-Free Priors for Clustering
export { DependentTailFreeClustering, default as TailFreeClustering } from './tail-free-clustering.js';

// Nonparametric Dynamic Borrowing
export { NonparametricDynamicBorrowing, default as DynamicBorrowing } from './dynamic-borrowing.js';

// Efficient Prior Sensitivity Analysis
export { PriorSensitivityAnalysis, default as PriorSensitivity } from './prior-sensitivity-analysis.js';

// Bias-Corrected Bayesian Nonparametric
export { BiasCorrectedBNP, default as BiasCorrectedBNPDefault } from './bias-corrected-bnp.js';

// Default export for convenience
import { DependentTailFreeClustering } from './tail-free-clustering.js';
import { NonparametricDynamicBorrowing } from './dynamic-borrowing.js';
import { PriorSensitivityAnalysis } from './prior-sensitivity-analysis.js';
import { BiasCorrectedBNP } from './bias-corrected-bnp.js';

export default {
  DependentTailFreeClustering,
  NonparametricDynamicBorrowing,
  PriorSensitivityAnalysis,
  BiasCorrectedBNP
};
