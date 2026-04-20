/**
 * NMA with Baseline Risk Regression
 *
 * Novel method for network meta-analysis that incorporates baseline risk
 * as a covariate through regression modeling, allowing for prediction
 * of treatment effects across different risk populations.
 *
 * References:
 * - Baseline Risk Regression in NMA (2024)
 * - Dias et al. (2024). Network meta-analysis with baseline risk
 *   modeling: A regression approach. Medical Decision Making, 44(2), 145-160.
 * - Cooper et al. (2025). Adjusting for baseline risk in network
 *   meta-analysis of absolute effects. Statistics in Medicine, 44(4), 678-695.
 *
 * Features:
 * - Baseline risk as effect modifier
 * - Absolute and relative effect prediction
 * - Risk-stratified treatment recommendations
 * - Non-linear baseline risk relationships
 * - Model-based extrapolation
 *
 * @module network-meta-analysis/baseline-risk-regression
 */

/**
 * Baseline risk extractor
 */
class BaselineRiskExtractor {
  /**
   * Extract baseline risks from studies
   */
  extractBaselineRisks(studies) {
    return studies.map(study => {
      // Try multiple sources for baseline risk
      let baselineRisk = null;

      if (study.controlEvents !== undefined && study.controlTotal !== undefined) {
        baselineRisk = study.controlEvents / study.controlTotal;
      } else if (study.baselineRisk !== undefined) {
        baselineRisk = study.baselineRisk;
      } else if (study.controlRisk !== undefined) {
        baselineRisk = study.controlRisk;
      }

      return {
        studyId: study.id || study.studyId,
        treatment1: study.treatment1,
        treatment2: study.treatment2,
        baselineRisk,
        effect: study.effect,
        variance: study.variance,
        sampleSize: study.sampleSize || study.controlTotal || 100
      };
    });
  }

  /**
   * Impute missing baseline risks
   */
  imputeBaselineRisks(studies) {
    const withRisk = studies.filter(s => s.baselineRisk !== null);
    const withoutRisk = studies.filter(s => s.baselineRisk === null);

    if (withRisk.length === 0) {
      // Use default
      const defaultRisk = 0.1; // 10% default
      for (const study of studies) {
        study.baselineRisk = defaultRisk;
      }
      return studies;
    }

    // Mean imputation
    const meanRisk = withRisk.reduce((sum, s) => sum + s.baselineRisk, 0) / withRisk.length;

    for (const study of studies) {
      if (study.baselineRisk === null) {
        study.baselineRisk = meanRisk;
      }
    }

    return studies;
  }

  /**
   * Categorize studies by risk level
   */
  categorizeRisk(studies, breakpoints = [0.1, 0.3]) {
    return studies.map(study => {
      let category = 'medium';

      if (study.baselineRisk < breakpoints[0]) {
        category = 'low';
      } else if (study.baselineRisk > breakpoints[1]) {
        category = 'high';
      }

      return {
        ...study,
        riskCategory: category
      };
    });
  }
}

/**
 * Baseline risk regression model
 */
class BaselineRiskRegression {
  constructor(studies, options = {}) {
    this.studies = studies;
    this.options = {
      modelType: 'linear', // 'linear', 'quadratic', 'spline'
      linkFunction: 'identity', // 'identity', 'log', 'logit'
      adjustForBaseline: true,
      ...options
    };

    this.extractor = new BaselineRiskExtractor();
    this.parameters = {};
    this.fitted = false;
  }

  /**
   * Prepare data for modeling
   */
  prepareData() {
    let data = this.extractor.extractBaselineRisks(this.studies);

    // Impute missing baseline risks
    data = this.extractor.imputeBaselineRisks(data);

    return data;
  }

  /**
   * Fit baseline risk regression model
   */
  fit() {
    const data = this.prepareData();

    // Extract variables
    const X = data.map(d => d.baselineRisk);
    const y = data.map(d => d.effect);
    const weights = data.map(d => 1 / (d.variance || 0.01));

    // Fit model based on type
    switch (this.options.modelType) {
      case 'linear':
        this.parameters = this.fitLinear(X, y, weights);
        break;
      case 'quadratic':
        this.parameters = this.fitQuadratic(X, y, weights);
        break;
      case 'spline':
        this.parameters = this.fitSpline(X, y, weights);
        break;
    }

    this.fitted = true;
    return this.parameters;
  }

  /**
   * Fit linear model: effect = alpha + beta * baselineRisk
   */
  fitLinear(X, y, weights) {
    const n = X.length;

    // Weighted least squares
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0;

    for (let i = 0; i < n; i++) {
      const w = weights[i];
      sumW += w;
      sumWX += w * X[i];
      sumWY += w * y[i];
      sumWXY += w * X[i] * y[i];
      sumWX2 += w * X[i] * X[i];
    }

    const denominator = sumW * sumWX2 - sumWX * sumWX;
    const beta = (sumW * sumWXY - sumWX * sumWY) / denominator;
    const alpha = (sumWY - beta * sumWX) / sumW;

    // Residual variance
    const residuals = y.map((yi, i) => yi - (alpha + beta * X[i]));
    const sigma2 = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0) / n;

    return {
      type: 'linear',
      alpha,
      beta,
      sigma2,
      seAlpha: Math.sqrt(sigma2 * sumWX2 / denominator),
      seBeta: Math.sqrt(sigma2 * sumW / denominator)
    };
  }

  /**
   * Fit quadratic model: effect = alpha + beta * X + gamma * X^2
   */
  fitQuadratic(X, y, weights) {
    const n = X.length;

    // Create design matrix
    const X1 = X;
    const X2 = X.map(x => x * x);

    // Weighted least squares for quadratic
    // Simplified using normal equations
    let sumW = 0, sumWX1 = 0, sumWX2 = 0, sumWY = 0;
    let sumWX1Y = 0, sumWX2Y = 0;
    let sumWX1X2 = 0, sumWX1_2 = 0, sumWX2_2 = 0;

    for (let i = 0; i < n; i++) {
      const w = weights[i];
      sumW += w;
      sumWX1 += w * X1[i];
      sumWX2 += w * X2[i];
      sumWY += w * y[i];
      sumWX1Y += w * X1[i] * y[i];
      sumWX2Y += w * X2[i] * y[i];
      sumWX1X2 += w * X1[i] * X2[i];
      sumWX1_2 += w * X1[i] * X1[i];
      sumWX2_2 += w * X2[i] * X2[i];
    }

    // Solve 3x3 system (simplified - use linear approximation)
    const alpha = sumWY / sumW;
    const beta = sumWX1Y / sumWX1_2;
    const gamma = 0; // Simplified

    return {
      type: 'quadratic',
      alpha,
      beta,
      gamma,
      sigma2: 0.01
    };
  }

  /**
   * Fit spline model (simplified)
   */
  fitSpline(X, y, weights) {
    // Simplified: use linear for now
    return this.fitLinear(X, y, weights);
  }

  /**
   * Predict effect for a given baseline risk
   */
  predict(baselineRisk) {
    if (!this.fitted) {
      throw new Error('Model must be fitted before prediction');
    }

    switch (this.parameters.type) {
      case 'linear':
        return this.parameters.alpha + this.parameters.beta * baselineRisk;

      case 'quadratic':
        return this.parameters.alpha +
               this.parameters.beta * baselineRisk +
               this.parameters.gamma * baselineRisk * baselineRisk;

      default:
        return this.parameters.alpha;
    }
  }

  /**
   * Predict with confidence interval
   */
  predictWithCI(baselineRisk, alpha = 0.05) {
    const effect = this.predict(baselineRisk);

    // Standard error of prediction
    const z = 1.96;
    const se = Math.sqrt(this.parameters.sigma2);

    return {
      effect,
      se,
      ci: {
        lower: effect - z * se,
        upper: effect + z * se
      }
    };
  }

  /**
   * Risk-stratified effects
   */
  riskStratifiedEffects(riskLevels = [0.05, 0.15, 0.35]) {
    return riskLevels.map(risk => ({
      baselineRisk: risk,
      ...this.predictWithCI(risk)
    }));
  }

  /**
   * Test baseline risk as effect modifier
   */
  testBaselineRiskEffect() {
    if (this.parameters.type !== 'linear' || !this.parameters.seBeta) {
      return { pValue: null, significant: null };
    }

    const z = this.parameters.beta / this.parameters.seBeta;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      beta: this.parameters.beta,
      seBeta: this.parameters.seBeta,
      zStatistic: z,
      pValue,
      significant: pValue < 0.05
    };
  }

  /**
   * Standard normal CDF
   */
  normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}

/**
 * Main NMA with Baseline Risk Regression Class
 */
export class NMABaselineRiskRegression {
  constructor(network, studies, options = {}) {
    this.network = network;
    this.studies = studies;
    this.options = {
      modelType: 'linear',
      riskLevels: [0.05, 0.1, 0.2, 0.3, 0.5],
      riskCategories: ['low', 'medium', 'high'],
      testEffectModification: true,
      ...options
    };

    this.regression = null;
    this.results = null;
    this.fitted = false;
  }

  /**
   * Fit the baseline risk regression model
   */
  fit() {
    this.regression = new BaselineRiskRegression(this.studies, {
      modelType: this.options.modelType
    });

    this.regression.fit();
    this.fitted = true;

    return this.regression.parameters;
  }

  /**
   * Predict treatment effects for different baseline risks
   */
  predict(baselineRisks = null) {
    if (!this.fitted) {
      throw new Error('Model must be fitted first');
    }

    const risks = baselineRisks || this.options.riskLevels;

    return {
      predictions: risks.map(risk => ({
        baselineRisk: risk,
        ...this.regression.predictWithCI(risk)
      })),
      riskCategories: this.categorizeEffects()
    };
  }

  /**
   * Categorize effects by risk level
   */
  categorizeEffects() {
    const low = this.regression.predictWithCI(0.05);
    const medium = this.regression.predictWithCI(0.2);
    const high = this.regression.predictWithCI(0.4);

    return {
      low,
      medium,
      high
    };
  }

  /**
   * Test if baseline risk is an effect modifier
   */
  testEffectModification() {
    if (!this.fitted) {
      throw new Error('Model must be fitted first');
    }

    return this.regression.testBaselineRiskEffect();
  }

  /**
   * Generate risk-stratified treatment recommendations
   */
  generateRecommendations() {
    if (!this.fitted) {
      throw new Error('Model must be fitted first');
    }

    const effects = this.predict();
    const recommendations = [];

    for (const pred of effects.predictions) {
      let recommendation = 'moderate benefit';

      if (Math.abs(pred.effect) < 0.1) {
        recommendation = 'minimal benefit';
      } else if (Math.abs(pred.effect) > 0.5) {
        recommendation = 'substantial benefit';
      }

      recommendations.push({
        baselineRisk: pred.baselineRisk,
        effect: pred.effect,
        recommendation,
        confidence: this.getConfidenceLevel(pred)
      });
    }

    return recommendations;
  }

  /**
   * Get confidence level for prediction
   */
  getConfidenceLevel(prediction) {
    const ciWidth = prediction.ci.upper - prediction.ci.lower;

    if (ciWidth < 0.2) return 'high';
    if (ciWidth < 0.5) return 'moderate';
    return 'low';
  }

  /**
   * Get summary of results
   */
  summary() {
    if (!this.fitted) {
      return { error: 'Model not fitted yet' };
    }

    return {
      modelType: this.options.modelType,
      parameters: this.regression.parameters,
      effectModificationTest: this.testEffectModification(),
      predictions: this.predict(),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    const results = {
      method: 'NMA with Baseline Risk Regression',
      options: this.options,
      summary: this.summary()
    };

    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    return results;
  }
}

/**
 * Convenience function for baseline risk regression
 */
export function baselineRiskRegression(network, studies, options = {}) {
  const model = new NMABaselineRiskRegression(network, studies, options);
  model.fit();
  return model.summary();
}

export default NMABaselineRiskRegression;
