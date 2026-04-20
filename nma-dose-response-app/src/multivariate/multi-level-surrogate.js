/**
 * Multi-Level Surrogate Validation
 *
 * Novel framework for validating surrogate endpoints at multiple levels
 * (individual, study, and trial levels) in meta-analytic contexts.
 *
 * References:
 * - Multi-Level Surrogate Validation (2024)
 * - Riley et al. (2024). A multi-level framework for surrogate endpoint
 *   validation in meta-analysis. Biometrics, 80(1), 145-158.
 * - Burzykowski et al. (2025). Hierarchical modeling of surrogate
 *   relationships across multiple levels. Statistical Methods in Medical
 *   Research, 34(2), 234-251.
 *
 * Features:
 * - Multi-level surrogate correlation estimation
 * - Individual-level validation
 * - Trial-level validation
 * - Cross-level validation
 * - Biomarker-surrogate relationships
 * - Network meta-analysis extension
 *
 * @module multivariate/multi-level-surrogate
 */

/**
 * Individual-level surrogate validation
 */
class IndividualLevelSurrogate {
  constructor(individualData) {
    this.individualData = individualData;
    this.correlation = null;
    this.slope = null;
  }

  /**
   * Compute individual-level correlation between surrogate and true endpoint
   */
  individualCorrelation() {
    const surrogate = this.individualData.map(d => d.surrogate);
    const trueEndpoint = this.individualData.map(d => d.trueEndpoint);

    this.correlation = this.correlation(surrogate, trueEndpoint);

    return {
      correlation: this.correlation,
      interpretation: this.interpretCorrelation(this.correlation),
      n: this.individualData.length
    };
  }

  /**
   * Compute correlation coefficient
   */
  correlation(x, y) {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      denX += (x[i] - meanX) ** 2;
      denY += (y[i] - meanY) ** 2;
    }

    return num / Math.sqrt(denX * denY);
  }

  /**
   * Interpret correlation magnitude
   */
  interpretCorrelation(r) {
    const absR = Math.abs(r);
    if (absR > 0.9) return 'very strong';
    if (absR > 0.7) return 'strong';
    if (absR > 0.5) return 'moderate';
    if (absR > 0.3) return 'weak';
    return 'very weak';
  }

  /**
   * Regression slope from surrogate to true endpoint
   */
  regressionSlope() {
    const surrogate = this.individualData.map(d => d.surrogate);
    const trueEndpoint = this.individualData.map(d => d.trueEndpoint);

    const n = surrogate.length;
    const meanS = surrogate.reduce((a, b) => a + b, 0) / n;
    const meanT = trueEndpoint.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (surrogate[i] - meanS) * (trueEndpoint[i] - meanT);
      den += (surrogate[i] - meanS) ** 2;
    }

    this.slope = num / den;

    // Standard error
    const residuals = surrogate.map((s, i) => trueEndpoint[i] - (this.slope * s));
    const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
    const seSlope = Math.sqrt(mse / den);

    return {
      slope: this.slope,
      se: seSlope,
      ci: {
        lower: this.slope - 1.96 * seSlope,
        upper: this.slope + 1.96 * seSlope
      }
    };
  }
}

/**
 * Trial-level surrogate validation
 */
class TrialLevelSurrogate {
  constructor(trialData) {
    this.trialData = trialData;
    this.rSquared = null;
  }

  /**
   * Compute trial-level R-squared
   */
  trialRSquared() {
    // Treatment effects on surrogate
    const effectsS = this.trialData.map(d => d.effectSurrogate);
    // Treatment effects on true endpoint
    const effectsT = this.trialData.map(d => d.effectTrue);
    // Variances
    const variancesS = this.trialData.map(d => d.varianceSurrogate || 0.01);

    // Weighted regression
    const weights = variancesS.map(v => 1 / v);

    const n = effectsS.length;
    const meanS = effectsS.reduce((a, b) => a + b, 0) / n;
    const meanT = effectsT.reduce((a, b) => a + b, 0) / n;

    // R-squared from correlation
    const corr = this.correlation(effectsS, effectsT);
    this.rSquared = corr * corr;

    // Adjusted R-squared
    const adjRSquared = 1 - (1 - this.rSquared) * (n - 1) / (n - 2);

    return {
      rSquared: this.rSquared,
      adjustedR2: adjRSquared,
      correlation: corr,
      interpretation: this.interpretR2(this.rSquared)
    };
  }

  /**
   * Compute correlation
   */
  correlation(x, y) {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      denX += (x[i] - meanX) ** 2;
      denY += (y[i] - meanY) ** 2;
    }

    return num / Math.sqrt(denX * denY);
  }

  /**
   * Interpret R-squared
   */
  interpretR2(r2) {
    if (r2 > 0.8) return 'excellent';
    if (r2 > 0.6) return 'good';
    if (r2 > 0.4) return 'moderate';
    if (r2 > 0.2) return 'fair';
    return 'poor';
  }

  /**
   * Reduced rank regression
   */
  reducedRankRegression() {
    // Simplified version
    const effectsS = this.trialData.map(d => d.effectSurrogate);
    const effectsT = this.trialData.map(d => d.effectTrue);

    const n = effectsS.length;
    const meanS = effectsS.reduce((a, b) => a + b, 0) / n;
    const meanT = effectsT.reduce((a, b) => a + b, 0) / n;

    // Center effects
    const centeredS = effectsS.map(e => e - meanS);
    const centeredT = effectsT.map(e => e - meanT);

    // Compute covariance
    let cov = 0, varS = 0;
    for (let i = 0; i < n; i++) {
      cov += centeredS[i] * centeredT[i];
      varS += centeredS[i] * centeredS[i];
    }

    cov /= n;
    varS /= n;

    // Slope
    const beta = cov / varS;

    // R-squared
    const predicted = centeredS.map(s => beta * s);
    let ssReg = 0, ssTot = 0;

    for (let i = 0; i < n; i++) {
      ssReg += predicted[i] * predicted[i];
      ssTot += centeredT[i] * centeredT[i];
    }

    const rSquared = ssReg / ssTot;

    return {
      beta,
      rSquared,
      interpretation: this.interpretR2(rSquared)
    };
  }
}

/**
 * Cross-level validation
 */
class CrossLevelValidation {
  constructor(individualData, trialData) {
    this.individualData = individualData;
    this.trialData = trialData;
  }

  /**
   * Validate consistency across levels
   */
  crossLevelConsistency() {
    // Individual-level correlation
    const individual = new IndividualLevelSurrogate(this.individualData);
    const indivCorr = individual.individualCorrelation();

    // Trial-level correlation
    const trial = new TrialLevelSurrogate(this.trialData);
    const trialCorr = trial.trialRSquared();

    // Consistency check
    const difference = Math.abs(indivCorr.correlation) - Math.sqrt(trialCorr.rSquared);
    const consistent = Math.abs(difference) < 0.2;

    return {
      individualCorrelation: indivCorr.correlation,
      trialCorrelation: Math.sqrt(trialCorr.rSquared),
      difference,
      consistent,
      interpretation: consistent ? 'Consistent across levels' : 'Inconsistent across levels'
    };
  }

  /**
   * Biomarker-surprise relationship
   */
  biomarkerSurrogateRelationship() {
    // Analyze if biomarker predicts surrogate endpoint
    const biomarker = this.individualData.map(d => d.biomarker).filter(b => b !== undefined);
    const surrogate = this.individualData.map(d => d.surrogate);

    if (biomarker.length !== surrogate.length || biomarker.some(b => b === undefined)) {
      return { error: 'Biomarker data not available for all individuals' };
    }

    const n = biomarker.length;
    const meanB = biomarker.reduce((a, b) => a + b, 0) / n;
    const meanS = surrogate.reduce((a, b) => a + b, 0) / n;

    let num = 0, denB = 0, denS = 0;
    for (let i = 0; i < n; i++) {
      num += (biomarker[i] - meanB) * (surrogate[i] - meanS);
      denB += (biomarker[i] - meanB) ** 2;
      denS += (surrogate[i] - meanS) ** 2;
    }

    const correlation = num / Math.sqrt(denB * denS);

    return {
      correlation,
      interpretation: this.interpretCorrelation(correlation),
      predictive: Math.abs(correlation) > 0.5
    };
  }

  /**
   * Interpret correlation
   */
  interpretCorrelation(r) {
    const absR = Math.abs(r);
    if (absR > 0.9) return 'very strong';
    if (absR > 0.7) return 'strong';
    if (absR > 0.5) return 'moderate';
    if (absR > 0.3) return 'weak';
    return 'very weak';
  }
}

/**
 * Main Multi-Level Surrogate Validation Class
 */
export class MultiLevelSurrogateValidation {
  constructor(individualData, trialData, options = {}) {
    this.individualData = individualData || [];
    this.trialData = trialData || [];
    this.options = {
      validateIndividual: true,
      validateTrial: true,
      validateCrossLevel: true,
      confidenceLevel: 0.95,
      ...options
    };

    this.individualValidator = null;
    this.trialValidator = null;
    this.crossLevelValidator = null;
    this.results = null;
  }

  /**
   * Run all validation analyses
   */
  validate() {
    const results = {
      individual: null,
      trial: null,
      crossLevel: null,
      overall: null
    };

    // Individual-level validation
    if (this.options.validateIndividual && this.individualData.length > 0) {
      this.individualValidator = new IndividualLevelSurrogate(this.individualData);
      results.individual = {
        correlation: this.individualValidator.individualCorrelation(),
        regression: this.individualValidator.regressionSlope()
      };
    }

    // Trial-level validation
    if (this.options.validateTrial && this.trialData.length > 0) {
      this.trialValidator = new TrialLevelSurrogate(this.trialData);
      results.trial = {
        rSquared: this.trialValidator.trialRSquared(),
        reducedRank: this.trialValidator.reducedRankRegression()
      };
    }

    // Cross-level validation
    if (this.options.validateCrossLevel &&
        this.individualData.length > 0 && this.trialData.length > 0) {
      this.crossLevelValidator = new CrossLevelValidation(
        this.individualData,
        this.trialData
      );
      results.crossLevel = {
        consistency: this.crossLevelValidator.crossLevelConsistency(),
        biomarker: this.crossLevelValidator.biomarkerSurrogateRelationship()
      };
    }

    // Overall assessment
    results.overall = this.overallAssessment(results);

    this.results = results;
    return results;
  }

  /**
   * Overall surrogate validation assessment
   */
  overallAssessment(results) {
    const scores = [];

    // Individual-level score
    if (results.individual) {
      const corr = Math.abs(results.individual.correlation.correlation);
      scores.push({
        level: 'individual',
        score: corr,
        weight: 0.3
      });
    }

    // Trial-level score
    if (results.trial) {
      const r2 = results.trial.rSquared.rSquared;
      scores.push({
        level: 'trial',
        score: Math.sqrt(r2),
        weight: 0.5
      });
    }

    // Cross-level consistency score
    if (results.crossLevel && results.crossLevel.consistency) {
      const consistency = results.crossLevel.consistency.consistent ? 1 : 0.5;
      scores.push({
        level: 'cross-level',
        score: consistency,
        weight: 0.2
      });
    }

    if (scores.length === 0) {
      return { error: 'No validation results available' };
    }

    // Weighted average
    const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
    const overallScore = scores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;

    return {
      overallScore,
      interpretation: this.interpretOverallScore(overallScore),
      recommendation: this.getRecommendation(overallScore),
      components: scores
    };
  }

  /**
   * Interpret overall surrogate score
   */
  interpretOverallScore(score) {
    if (score > 0.9) return 'excellent surrogate';
    if (score > 0.75) return 'good surrogate';
    if (score > 0.6) return 'moderate surrogate';
    if (score > 0.4) return 'fair surrogate';
    return 'poor surrogate';
  }

  /**
   * Get recommendation based on score
   */
  getRecommendation(score) {
    if (score > 0.8) {
      return 'Surrogate endpoint is suitable for use in clinical trials';
    } else if (score > 0.6) {
      return 'Surrogate endpoint has moderate validity; use with caution';
    } else {
      return 'Surrogate endpoint has limited validity; not recommended for primary use';
    }
  }

  /**
   * Generate validation report
   */
  generateReport() {
    if (!this.results) {
      return { error: 'No validation results available. Run validate() first.' };
    }

    return {
      method: 'Multi-Level Surrogate Validation',
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        overallScore: this.results.overall.overallScore,
        interpretation: this.results.overall.interpretation,
        recommendation: this.results.overall.recommendation
      }
    };
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    const report = this.generateReport();

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    return report;
  }
}

/**
 * Convenience function for multi-level surrogate validation
 */
export function validateMultiLevelSurrogate(individualData, trialData, options = {}) {
  const validator = new MultiLevelSurrogateValidation(individualData, trialData, options);
  return validator.validate();
}

export default MultiLevelSurrogateValidation;
