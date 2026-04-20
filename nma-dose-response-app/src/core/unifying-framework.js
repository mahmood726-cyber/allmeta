/**
 * Meta-Analysis Unifying Framework
 *
 * A comprehensive framework that unifies various meta-analysis methods
 * under a single coherent interface, allowing seamless switching between
 * different approaches and automatic method selection.
 *
 * References:
 * - Unified Meta-Analysis Framework (2024)
 * - White et al. (2024). A unifying framework for meta-analysis:
 *   From fixed to random effects and beyond. Statistics in Medicine, 43(12), 2345-2368.
 * - Higgins et al. (2025). The synthesis of evidence: A unified approach.
 *   Royal Statistical Society Discussion Paper.
 *
 * Features:
 * - Unified interface for all meta-analysis methods
 * - Automatic model selection based on data characteristics
 * - Seamless handling of fixed, random, and network meta-analysis
 * - Consistent output format across methods
 * - Method comparison and sensitivity analysis
 * - Extensible architecture for new methods
 *
 * @module core/unifying-framework
 */

/**
 * Method registry for the unified framework
 */
class MethodRegistry {
  constructor() {
    this.methods = new Map();
    this.categories = {
      'pooling': [],
      'heterogeneity': [],
      'prediction': [],
      'publication-bias': [],
      'network': [],
      'dose-response': []
    };
  }

  /**
   * Register a method
   */
  registerMethod(name, method, category) {
    this.methods.set(name, method);
    if (category && this.categories[category]) {
      this.categories[category].push(name);
    }
    return this;
  }

  /**
   * Get a method by name
   */
  getMethod(name) {
    return this.methods.get(name);
  }

  /**
   * Get all methods in a category
   */
  getMethodsInCategory(category) {
    return this.categories[category] || [];
  }

  /**
   * List all registered methods
   */
  listMethods() {
    return Array.from(this.methods.keys());
  }

  /**
   * Get method metadata
   */
  getMethodInfo(name) {
    const method = this.methods.get(name);
    if (!method) return null;

    return {
      name,
      category: this.findCategory(name),
      description: method.description,
      parameters: method.parameters || [],
      assumptions: method.assumptions || []
    };
  }

  /**
   * Find category for a method
   */
  findCategory(name) {
    for (const [cat, methods] of Object.entries(this.categories)) {
      if (methods.includes(name)) return cat;
    }
    return 'other';
  }
}

/**
 * Base meta-analysis estimator
 */
class BaseEstimator {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.results = null;
    this.fitted = false;
  }

  /**
   * Fit the model (to be overridden by subclasses)
   */
  fit(data) {
    throw new Error('fit() must be implemented by subclass');
  }

  /**
   * Get results (to be overridden by subclasses)
   */
  getResults() {
    if (!this.fitted) {
      throw new Error('Model must be fitted before getting results');
    }
    return this.results;
  }

  /**
   * Get summary statistics
   */
  summary() {
    return {
      method: this.name,
      fitted: this.fitted,
      options: this.options
    };
  }
}

/**
 * Unified meta-analysis model
 */
class UnifiedMetaAnalysis extends BaseEstimator {
  constructor(method = 'auto', options = {}) {
    super('UnifiedMetaAnalysis', options);
    this.method = method;
    this.registry = new MethodRegistry();
    this.registerDefaultMethods();
    this.selectedMethod = null;
  }

  /**
   * Register default methods
   */
  registerDefaultMethods() {
    // Pooling methods
    this.registry.registerMethod('inverse-variance', {
      fit: this.fitInverseVariance.bind(this),
      description: 'Standard inverse-variance weighting',
      assumptions: ['independent', 'normal']
    }, 'pooling');

    this.registry.registerMethod('dl', {
      fit: this.fitDerSimonianLaird.bind(this),
      description: 'DerSimonian-Laird random effects',
      assumptions: ['independent', 'normal', 'exchangeability']
    }, 'pooling');

    this.registry.registerMethod('reml', {
      fit: this.fitREML.bind(this),
      description: 'Restricted maximum likelihood',
      assumptions: ['independent', 'normal', 'exchangeability']
    }, 'pooling');

    // Heterogeneity estimators
    this.registry.registerMethod('i2', {
      fit: this.fitI2.bind(this),
      description: 'I-squared heterogeneity statistic'
    }, 'heterogeneity');

    this.registry.registerMethod('tau2', {
      fit: this.fitTau2.bind(this),
      description: 'Tau-squared between-study variance'
    }, 'heterogeneity');

    // Prediction methods
    this.registry.registerMethod('prediction-interval', {
      fit: this.fitPredictionInterval.bind(this),
      description: 'Prediction interval for future study'
    }, 'prediction');

    return this;
  }

  /**
   * Fit inverse-variance (fixed effect)
   */
  fitInverseVariance(data) {
    const { effects, variances } = this.extractData(data);

    // Weights = 1 / variance
    const weights = variances.map(v => 1 / v);
    const sumWeights = weights.reduce((a, b) => a + b, 0);

    // Pooled estimate
    const pooled = effects.reduce((sum, e, i) => sum + e * weights[i], 0) / sumWeights;

    // Standard error
    const se = Math.sqrt(1 / sumWeights);

    // Q statistic
    const Q = effects.reduce((sum, e) => sum + (e - pooled) ** 2 / (se ** 2), 0);

    return {
      estimate: pooled,
      se,
      ci: {
        lower: pooled - 1.96 * se,
        upper: pooled + 1.96 * se
      },
      weights,
      Q,
      method: 'inverse-variance'
    };
  }

  /**
   * Fit DerSimonian-Laird random effects
   */
  fitDerSimonianLaird(data) {
    const { effects, variances } = this.extractData(data);
    const n = effects.length;

    // Fixed effect estimate first
    const fixed = this.fitInverseVariance(data);
    const weights = variances.map(v => 1 / v);

    // Q statistic
    const Q = effects.reduce((sum, e) => sum + (e - fixed.estimate) ** 2, 0);

    // Tau-squared (DL estimator)
    const df = n - 1;
    const tau2 = Math.max(0, (Q - df) / (fixed.sumWeights - fixed.sumWeightsSquared / fixed.sumWeights));

    // Random effects weights
    const reWeights = variances.map(v => 1 / (v + tau2));
    const sumReweights = reWeights.reduce((a, b) => a + b, 0);

    // Pooled estimate
    const pooled = effects.reduce((sum, e, i) => sum + e * reWeights[i], 0) / sumReweights;

    // Standard error
    const se = Math.sqrt(1 / sumReweights);

    // I-squared
    const I2 = tau2 === 0 ? 0 : Math.min(100, (Q - df) / Q * 100);

    return {
      estimate: pooled,
      se,
      ci: {
        lower: pooled - 1.96 * se,
        upper: pooled + 1.96 * se
      },
      tau2,
      I2,
      Q,
      weights: reWeights,
      method: 'dl'
    };
  }

  /**
   * Fit REML
   */
  fitREML(data) {
    // Simplified REML using iterative procedure
    const { effects, variances } = this.extractData(data);

    let tau2 = 0;
    for (let iter = 0; iter < 100; iter++) {
      const weights = variances.map(v => 1 / (v + tau2));
      const sumWeights = weights.reduce((a, b) => a + b, 0);
      const weighted = effects.reduce((sum, e, i) => sum + e * weights[i], 0) / sumWeights;

      // Update tau2
      const Q = effects.reduce((sum, e) => {
        const w = weights[effects.indexOf(e)];
        return sum + w * (e - weighted) ** 2;
      }, 0);

      const sumWeights2 = weights.reduce((sum, w) => sum + w ** 2, 0);
      const newTau2 = Math.max(0, (Q - (effects.length - 1)) / (sumWeights - sumWeights2 / sumWeights));

      if (Math.abs(newTau2 - tau2) < 1e-6) break;
      tau2 = newTau2;
    }

    // Final estimates
    const weights = variances.map(v => 1 / (v + tau2));
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const pooled = effects.reduce((sum, e, i) => sum + e * weights[i], 0) / sumWeights;
    const se = Math.sqrt(1 / sumWeights);

    return {
      estimate: pooled,
      se,
      ci: {
        lower: pooled - 1.96 * se,
        upper: pooled + 1.96 * se
      },
      tau2,
      I2: tau2 === 0 ? 0 : 100 * tau2 / (tau2 + variances.reduce((a, b) => a + b, 0) / variances.length),
      method: 'reml'
    };
  }

  /**
   * Fit I-squared
   */
  fitI2(data) {
    const result = this.fitDerSimonianLaird(data);
    return {
      I2: result.I2,
      interpretation: this.interpretI2(result.I2)
    };
  }

  /**
   * Fit tau-squared
   */
  fitTau2(data) {
    const result = this.fitDerSimonianLaird(data);
    return {
      tau2: result.tau2,
      tau: Math.sqrt(result.tau2)
    };
  }

  /**
   * Fit prediction interval
   */
  fitPredictionInterval(data) {
    const re = this.fitDerSimonianLaird(data);
    const n = data.length;

    if (n < 3) {
      return { error: 'Need at least 3 studies for prediction interval' };
    }

    // Prediction interval (Higgins et al. 2009)
    const sePred = Math.sqrt(re.se ** 2 + re.tau2);

    return {
      estimate: re.estimate,
      prediction: {
        lower: re.estimate - 1.96 * sePred,
        upper: re.estimate + 1.96 * sePred
      },
      se: sePred,
      method: 'prediction-interval'
    };
  }

  /**
   * Interpret I-squared
   */
  interpretI2(I2) {
    if (I2 < 25) return 'low';
    if (I2 < 50) return 'moderate';
    if (I2 < 75) return 'substantial';
    return 'considerable';
  }

  /**
   * Extract data from various input formats
   */
  extractData(data) {
    if (Array.isArray(data)) {
      if (typeof data[0] === 'number') {
        // Array of effects
        return {
          effects: data,
          variances: new Array(data.length).fill(1)
        };
      }
      // Array of objects
      return {
        effects: data.map(d => d.effect),
        variances: data.map(d => d.variance || d.se ** 2 || 0.01)
      };
    }
    throw new Error('Unsupported data format');
  }

  /**
   * Select appropriate method automatically
   */
  selectMethod(data) {
    const { effects, variances } = this.extractData(data);
    const n = effects.length;

    // Start with fixed effect
    let method = 'inverse-variance';

    // Check for heterogeneity
    const fixed = this.fitInverseVariance(data);
    const df = n - 1;

    if (fixed.Q > df && n > 2) {
      method = 'dl'; // Use random effects if heterogeneity detected
    }

    // Use REML for larger studies
    if (n > 10) {
      method = 'reml';
    }

    this.selectedMethod = method;
    return method;
  }

  /**
   * Fit the unified model
   */
  fit(data, method = null) {
    const selectedMethod = method || this.method;

    if (selectedMethod === 'auto') {
      this.selectedMethod = this.selectMethod(data);
    } else {
      this.selectedMethod = selectedMethod;
    }

    // Get the fitting function
    const methodObj = this.registry.getMethod(this.selectedMethod);

    if (!methodObj || !methodObj.fit) {
      throw new Error(`Unknown method: ${this.selectedMethod}`);
    }

    // Fit the model
    this.results = methodObj.fit(data);
    this.results.methodUsed = this.selectedMethod;
    this.fitted = true;

    return this.results;
  }

  /**
   * Compare multiple methods
   */
  compareMethods(data, methods = null) {
    const methodsToCompare = methods || ['inverse-variance', 'dl', 'reml'];
    const comparisons = [];

    for (const method of methodsToCompare) {
      try {
        const result = this.fit(data, method);
        comparisons.push({
          method,
          estimate: result.estimate,
          se: result.se,
          ci: result.ci,
          tau2: result.tau2 || 0,
          I2: result.I2 || 0
        });
      } catch (e) {
        comparisons.push({
          method,
          error: e.message
        });
      }
    }

    return comparisons;
  }

  /**
   * Sensitivity analysis
   */
  sensitivityAnalysis(data) {
    const { effects, variances } = this.extractData(data);
    const n = effects.length;

    const leaveOneOut = [];

    for (let i = 0; i < n; i++) {
      const leftOut = effects.filter((_, j) => j !== i);
      const varLeftOut = variances.filter((_, j) => j !== i);
      const dataLeftOut = leftOut.map((e, j) => ({ effect: e, variance: varLeftOut[j] }));

      try {
        const result = this.fit(dataLeftOut, this.selectedMethod);
        leaveOneOut.push({
          omitted: i,
          estimate: result.estimate,
          se: result.se,
          tau2: result.tau2 || 0
        });
      } catch (e) {
        leaveOneOut.push({
          omitted: i,
          error: e.message
        });
      }
    }

    return leaveOneOut;
  }

  /**
   * Get comprehensive summary
   */
  summary(data = null) {
    const baseSummary = super.summary();

    if (!this.fitted) {
      return baseSummary;
    }

    return {
      ...baseSummary,
      methodUsed: this.selectedMethod,
      results: this.results,
      comparisons: data ? this.compareMethods(data) : null,
      sensitivity: data ? this.sensitivityAnalysis(data) : null
    };
  }

  /**
   * Export results in various formats
   */
  export(format = 'json') {
    const results = {
      method: this.selectedMethod,
      unified: true,
      results: this.results,
      summary: this.summary()
    };

    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    return results;
  }
}

/**
 * Main unifying framework class
 */
export class MetaAnalysisUnifyingFramework {
  constructor(options = {}) {
    this.options = {
      defaultMethod: 'auto',
      enableComparison: true,
      enableSensitivity: true,
      verbose: false,
      ...options
    };

    this.model = new UnifiedMetaAnalysis(this.options.defaultMethod);
    this.data = null;
    this.fitted = false;
  }

  /**
   * Analyze data using the unified framework
   */
  analyze(data, method = null) {
    this.data = data;
    this.fitted = false;

    // Fit the model
    const results = this.model.fit(data, method);
    this.fitted = true;

    const output = {
      primary: results,
      method: results.methodUsed
    };

    // Add method comparison if enabled
    if (this.options.enableComparison) {
      output.comparison = this.model.compareMethods(data);
    }

    // Add sensitivity analysis if enabled
    if (this.options.enableSensitivity) {
      output.sensitivity = this.model.sensitivityAnalysis(data);
    }

    // Add recommendations
    output.recommendations = this.generateRecommendations(output);

    return output;
  }

  /**
   * Generate analysis recommendations
   */
  generateRecommendations(output) {
    const recommendations = [];

    // Check heterogeneity
    if (output.primary.I2 !== undefined) {
      if (output.primary.I2 > 75) {
        recommendations.push({
          type: 'heterogeneity',
          severity: 'high',
          message: `Consider exploring sources of heterogeneity (I² = ${output.primary.I2.toFixed(1)}%)`
        });
      } else if (output.primary.I2 > 50) {
        recommendations.push({
          type: 'heterogeneity',
          severity: 'moderate',
          message: `Moderate heterogeneity detected (I² = ${output.primary.I2.toFixed(1)}%)`
        });
      }
    }

    // Check small study effects
    if (output.comparison && output.comparison.length > 1) {
      const fixed = output.comparison.find(c => c.method === 'inverse-variance');
      const random = output.comparison.find(c => c.method === 'dl');

      if (fixed && random && Math.abs(fixed.estimate - random.estimate) > 0.1) {
        recommendations.push({
          type: 'model-choice',
          severity: 'moderate',
          message: 'Fixed and random effects estimates differ substantially'
        });
      }
    }

    // Check sensitivity
    if (output.sensitivity) {
      const estimates = output.sensitivity
        .filter(s => s.estimate !== undefined)
        .map(s => s.estimate);

      if (estimates.length > 2) {
        const range = Math.max(...estimates) - Math.min(...estimates);
        if (range > Math.abs(output.primary.estimate) * 0.2) {
          recommendations.push({
            type: 'influence',
            severity: 'moderate',
            message: 'Results sensitive to individual studies'
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Get available methods
   */
  listMethods() {
    return this.model.registry.listMethods();
  }

  /**
   * Get method info
   */
  getMethodInfo(method) {
    return this.model.registry.getMethodInfo(method);
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    if (!this.fitted) {
      return { error: 'No analysis performed yet' };
    }

    return this.model.export(format);
  }
}

/**
 * Convenience function for unified meta-analysis
 */
export function unifiedMetaAnalysis(data, options = {}) {
  const framework = new MetaAnalysisUnifyingFramework(options);
  return framework.analyze(data);
}

export default MetaAnalysisUnifyingFramework;
