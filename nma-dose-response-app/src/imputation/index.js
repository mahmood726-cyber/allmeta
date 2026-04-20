/**
 * NMA Dose Response Studio - Imputation Module
 * Collection of novel imputation methods for missing data in meta-analysis
 */

// Cross-site and distributed imputation
export { CrossSiteImputation, default as CrossSite } from './cross-site-imputation.js';

// Systematic missing data imputation
export { SystematicMissingImputation, default as SystematicMissing } from './systematic-missing-imputation.js';

// Meta-Imputation Balanced framework
export { MetaImputationBalanced, default as MIB } from './meta-imputation-balanced.js';

// StaPLR Multi-View Imputation
export { StaPLRMultiViewImputation, StaPLRImputation, default as StaPLR } from './staplr-imputation.js';

// Meta-Learning for Imputation Selection
export { MetaLearningImputationSelection, MetaLearningSelect, default as ImputationMetaLearning } from './meta-learning-imputation.js';

// ML Imputation Benchmarking
export { MLImputationBenchmarking, benchmarkImputation, default as ImputationBenchmarking } from './ml-imputation-benchmarking.js';

// Network Missing Data Imputation
export { NetworkMissingDataImputation, imputeNetworkMissingData, default as NetworkMissingImputation } from './network-missing-imputation.js';

// Default export
import { CrossSiteImputation } from './cross-site-imputation.js';
import { SystematicMissingImputation } from './systematic-missing-imputation.js';
import { MetaImputationBalanced } from './meta-imputation-balanced.js';
import { StaPLRMultiViewImputation } from './staplr-imputation.js';
import { MetaLearningImputationSelection } from './meta-learning-imputation.js';
import { MLImputationBenchmarking } from './ml-imputation-benchmarking.js';
import { NetworkMissingDataImputation } from './network-missing-imputation.js';

export default {
  CrossSiteImputation,
  SystematicMissingImputation,
  MetaImputationBalanced,
  StaPLRMultiViewImputation,
  MetaLearningImputationSelection,
  MLImputationBenchmarking,
  NetworkMissingDataImputation
};
