/**
 * NMA Dose Response Studio - Core Module
 * Central export point for core statistical functions
 */

// Re-export distributions
export * from './distributions.js';

// Core utilities
export { safeExecute } from './stat-utils.js';

// Unifying Framework
export { MetaAnalysisUnifyingFramework, unifiedMetaAnalysis, default as UnifiedMetaAnalysis } from './unifying-framework.js';

// Convenience default export
import * as distributions from './distributions.js';
import { MetaAnalysisUnifyingFramework } from './unifying-framework.js';

export default {
  ...distributions,
  MetaAnalysisUnifyingFramework
};
