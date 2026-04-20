/**
 * NMA Dose Response Studio - Multivariate Meta-Analysis Module
 * Collection of novel multivariate meta-analysis methods
 */

// Daniels and Hughes Surrogate Evaluation
export { DanielsHughesSurrogateEvaluation, default as SurrogateEvaluation } from './surrogate-evaluation.js';

// fastMETA Fast Multivariate MA
export { fastMETA, default as FastMETA } from './fast-meta.js';

// High-Dimensional MVMA
export { HighDimensionalMVMA, highDimensionalMVMA, default as HighDimMVMA } from './high-dimensional-mvma.js';

// Multi-Level Surrogate Validation
export { MultiLevelSurrogateValidation, validateMultiLevelSurrogate, default as MultiLevelSurrogate } from './multi-level-surrogate.js';

// Default export for convenience
import { DanielsHughesSurrogateEvaluation } from './surrogate-evaluation.js';
import { fastMETA } from './fast-meta.js';
import { HighDimensionalMVMA } from './high-dimensional-mvma.js';
import { MultiLevelSurrogateValidation } from './multi-level-surrogate.js';

export default {
  DanielsHughesSurrogateEvaluation,
  fastMETA,
  HighDimensionalMVMA,
  MultiLevelSurrogateValidation
};
