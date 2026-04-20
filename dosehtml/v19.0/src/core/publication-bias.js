/**
 * Dose Response Pro v19.0 - Publication Bias Assessment Module
 *
 * Comprehensive publication bias detection and adjustment methods
 * for dose-response meta-analysis.
 *
 * References:
 * - Egger et al. (1997). Bias in meta-analysis detected by a simple graphical test.
 * - Sterne et al. (2011). Recommendations for examining and interpreting funnel plot asymmetry.
 * - Duval & Tweedie (2000). Trim and fill: A simple funnel plot-based method.
 * - Begg & Mazumdar (1994). Operating characteristics of a rank correlation test.
 *
 * @module PublicationBias
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

import { Stats } from '../math/stats.js';
import { Plots } from '../visualization/plots.js';

/**
 * Publication Bias Assessment Class
 */
export class PublicationBias {
  constructor(options = {}) {
    this.options = {
      alpha: 0.05,
      method: 'auto', // 'auto', 'egger', 'begg', 'trim-fill'
      plotType: 'contour', // 'standard', 'contour', 'radial'
      ...options
    };

    this.results = null;
    this.data = null;
  }

  /**
   * Run comprehensive publication bias assessment
   *
   * @param {Array} studies - Study data with effect sizes and variances
   * @returns {Object} Assessment results
   */
  assess(studies) {
    this.data = studies;

    // Prepare data: effect sizes and precisions
    const effects = studies.map(s => s.effect || s.rr || s.or || s.logEffect);
    const variances = studies.map(s => s.variance || s.se ** 2);
    const precisions = variances.map(v => 1 / Math.sqrt(v));
    const sampleSizes = studies.map(s => s.n || s.sampleSize || s.cases + s.controls);
    const standardErrors = variances.map(v => Math.sqrt(v));

    // Run all tests
    const egger = this._eggerTest(effects, standardErrors, precisions, sampleSizes);
    const begg = this._beggTest(effects, precisions);
    const trimFill = this._trimAndFill(effects, variances, standardErrors, precisions);
    const rosenthal = this._rosenthalMethod(effects, variances);
    const thompson = this._thompsonTest(effects, variances, sampleSizes);

    // Funnel plot asymmetry assessment
    const asymmetry = this._assessAsymmetry(effects, precisions, standardErrors);

    // Small study effects
    const smallStudyEffects = this._assessSmallStudyEffects(effects, sampleSizes);

    // Overall risk assessment
    const risk = this._assessRisk(egger, begg, asymmetry, smallStudyEffects);

    this.results = {
      studies: studies.length,
      overallRisk: risk.level,
      riskReasoning: risk.reasoning,
      egger,
      begg,
      trimFill,
      rosenthal,
      thompson,
      asymmetry,
      smallStudyEffects,
      recommendation: this._generateRecommendation(risk, egger, trimFill)
    };

    return this.results;
  }

  /**
   * Egger's regression test for funnel plot asymmetry
   *
   * Tests whether the intercept of precision vs effect size differs from zero
   *
   * @private
   */
  _eggerTest(effects, se, precision, n) {
    // Regression: effect = b0 + b1 * precision
    // Null hypothesis: b0 = 0 (symmetry)

    const nStudies = effects.length;
    if (nStudies < 3) {
      return {
        applicable: false,
        reason: 'Need at least 3 studies'
      };
    }

    // Simple linear regression
    const sumX = Stats.sum(precision);
    const sumY = Stats.sum(effects);
    const sumXY = Stats.sum(effects.map((y, i) => y * precision[i]));
    const sumX2 = Stats.sum(precision.map(x => x * x));
    const sumY2 = Stats.sum(effects.map(y => y * y));

    const b1 = (nStudies * sumXY - sumX * sumY) /
              (nStudies * sumX2 - sumX * sumX);
    const b0 = (sumY - b1 * sumX) / nStudies;

    // Standard errors
    const yPred = effects.map((_, i) => b0 + b1 * precision[i]);
    const residuals = effects.map((y, i) => y - yPred[i]);
    const ssResidual = Stats.sum(residuals.map(r => r * r));
    const mse = ssResidual / (nStudies - 2);

    const se_b0 = Math.sqrt(mse * (1 / nStudies + sumX * sumX /
        (nStudies * (nStudies * sumX2 - sumX * sumX))));
    const se_b1 = Math.sqrt(mse / (nStudies * sumX2 - sumX * sumX));

    // t-test for intercept
    const t_b0 = b0 / se_b0;
    const df = nStudies - 2;
    const p_b0 = 2 * (1 - Stats.studentTCDF(Math.abs(t_b0), df));

    // t-test for slope
    const t_b1 = b1 / se_b1;
    const p_b1 = 2 * (1 - Stats.studentTCDF(Math.abs(t_b1), df));

    // R-squared
    const ssTotal = Stats.sum(effects.map(y => (y - sumY / nStudies) ** 2));
    const r2 = 1 - ssResidual / ssTotal;

    // Confidence interval for intercept
    const tCrit = Stats.studentTQuantile(1 - this.options.alpha / 2, df);
    const ci_b0 = [b0 - tCrit * se_b0, b0 + tCrit * se_b0];

    return {
      applicable: true,
      intercept: {
        estimate: b0,
        se: se_b0,
        ci: ci_b0,
        t: t_b0,
        p: p_b0,
        significant: p_b0 < this.options.alpha
      },
      slope: {
        estimate: b1,
        se: se_b1,
        t: t_b1,
        p: p_b1
      },
      r2,
      test: 'Egger regression test',
      interpretation: p_b0 < this.options.alpha ?
        'Significant asymmetry detected (p < ' + this.options.alpha + ')' :
        'No significant asymmetry detected'
    };
  }

  /**
   * Begg's rank correlation test
   *
   * Tests correlation between effect size and variance (Kendall's tau)
   *
   * @private
   */
  _beggTest(effects, precision) {
    const n = effects.length;
    if (n < 4) {
      return {
        applicable: false,
        reason: 'Need at least 4 studies for Begg test'
      };
    }

    // Rank effect sizes and precisions
    const rankedEffects = Stats.rank(effects);
    const rankedPrecision = Stats.rank(precision);

    // Calculate Kendall's tau
    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const diffEffect = rankedEffects[i] - rankedEffects[j];
        const diffPrec = rankedPrecision[i] - rankedPrecision[j];

        if (diffEffect * diffPrec > 0) {
          concordant++;
        } else if (diffEffect * diffPrec < 0) {
          discordant++;
        }
      }
    }

    const tau = (concordant - discordant) / (concordant + discordant);

    // Standard error and z-score
    const se = Math.sqrt((2 * (2 * n + 5)) / (9 * n * (n - 1)));
    const z = tau / se;
    const p = 2 * (1 - Stats.normalCDF(Math.abs(z)));

    return {
      applicable: true,
      tau,
      se,
      z,
      p,
      significant: p < this.options.alpha,
      test: 'Begg rank correlation test',
      interpretation: p < this.options.alpha ?
        'Significant asymmetry detected' :
        'No significant asymmetry detected'
    };
  }

  /**
   * Trim and Fill method
   *
   * Imputes missing studies to correct for publication bias
   *
   * @private
   */
  _trimAndFill(effects, variances, se, precision) {
    const n = effects.length;
    if (n < 3) {
      return {
        applicable: false,
        reason: 'Need at least 3 studies'
      };
    }

    // Calculate pooled effect
    const weights = variances.map(v => 1 / v);
    const sumWeights = Stats.sum(weights);
    const pooledEffect = Stats.sum(effects.map((y, i) => y * weights[i])) / sumWeights;

    // Rank studies by precision (standard error)
    const ranked = Array.from({ length: n }, (_, i) => ({
      effect: effects[i],
      se: se[i],
      variance: variances[i],
      precision: precision[i],
      rank: i
    })).sort((a, b) => a.se - b.se);

    // Iterative trimming
    let iterations = 0;
    const maxIterations = 20;
    let kL = 0; // Number of studies trimmed from left
    let kR = 0; // Number of studies trimmed from right
    let converged = false;
    let finalEffect = pooledEffect;
    let trimmedStudies = [];

    while (!converged && iterations < maxIterations) {
      // Calculate current pooled effect
      const currentWeights = variances.map(v => 1 / v);
      const currentSumWeights = Stats.sum(currentWeights);
      const currentEffect = Stats.sum(effects.map((y, i) => y * currentWeights[i])) / currentSumWeights;

      // Check for asymmetry
      const ranksAbove = ranked.filter(s => s.effect > currentEffect);
      const ranksBelow = ranked.filter(s => s.effect < currentEffect);

      if (ranksAbove.length > ranksBelow.length) {
        // Trim from right
        kR++;
        ranked.pop();
      } else if (ranksBelow.length > ranksAbove.length) {
        // Trim from left
        kL++;
        ranked.shift();
      } else {
        converged = true;
        finalEffect = currentEffect;
      }

      iterations++;
    }

    // Fill in imputed studies
    const k0 = kL + kR;
    const imputed = [];

    for (let i = 0; i < k0; i++) {
      // Mirror trimmed studies around the pooled effect
      const mirrorIdx = i % 2 === 0 ? kL - 1 - Math.floor(i / 2) : ranked.length - kR + Math.floor(i / 2);

      if (ranked[mirrorIdx]) {
        imputed.push({
          effect: 2 * finalEffect - ranked[mirrorIdx].effect,
          se: ranked[mirrorIdx].se,
          variance: ranked[mirrorIdx].variance,
          imputed: true,
          mirrorOf: mirrorIdx
        });
      }
    }

    // Recalculate effect with imputed studies
    const allEffects = [...effects, ...imputed.map(s => s.effect)];
    const allVariances = [...variances, ...imputed.map(s => s.variance)];
    const allWeights = allVariances.map(v => 1 / v);
    const adjustedEffect = Stats.sum(allEffects.map((y, i) => y * allWeights[i])) /
                         Stats.sum(allWeights);

    // Standard error of adjusted effect
    const seAdjusted = Math.sqrt(1 / Stats.sum(allWeights));

    return {
      applicable: true,
      k0,
      kL,
      kR,
      iterations,
      converged,
      originalEffect: pooledEffect,
      adjustedEffect,
      seAdjusted,
      ciOriginal: [
        pooledEffect - 1.96 * Math.sqrt(1 / sumWeights),
        pooledEffect + 1.96 * Math.sqrt(1 / sumWeights)
      ],
      ciAdjusted: [
        adjustedEffect - 1.96 * seAdjusted,
        adjustedEffect + 1.96 * seAdjusted
      ],
      imputed,
      imputedCount: imputed.length,
      test: 'Trim and Fill',
      interpretation: k0 > 0 ?
        `Imputed ${k0} missing studies. Adjusted effect: ${adjustedEffect.toFixed(3)}` :
        'No asymmetry detected, no imputation needed'
    };
  }

  /**
   * Rosenthal's fail-safe N
   *
   * Calculates how many studies with null effect needed to overturn significance
   *
   * @private
   */
  _rosenthalMethod(effects, variances) {
    const n = effects.length;
    const zValues = effects.map((y, i) => y / Math.sqrt(variances[i]));
    const sumZ = Stats.sum(zValues);

    // Fail-safe N (Rosenthal)
    const k0 = Math.pow(sumZ, 2) / n - n;

    // Orwin's fail-safe N for effect size
    const pooledEffect = Stats.sum(effects.map((y, i) => y / variances[i])) /
                       Stats.sum(variances.map(v => 1 / v));
    const criterion = pooledEffect / 5; // 20% of effect size
    const orwinK0 = Math.abs(sumZ / Math.abs(criterion));

    return {
      applicable: true,
      rosenthalN: Math.max(0, Math.ceil(k0)),
      orwinN: Math.max(0, Math.ceil(orwinK0)),
      interpretation: k0 > 0 ?
        `Need ${Math.ceil(k0)} null studies to overturn significance` :
        'Already not significant',
      test: 'Fail-safe N'
    };
  }

  /**
   * Thompson-Severe test for small study effects
   *
   * @private
   */
  _thompsonTest(effects, variances, n) {
    // Weighted regression of effect on sqrt(n)
    const sqrtN = n.map(s => Math.sqrt(s));
    const weights = variances.map(v => 1 / v);

    // Weighted regression
    const sumW = Stats.sum(weights);
    const sumWX = Stats.sum(weights.map((w, i) => w * sqrtN[i]));
    const sumWY = Stats.sum(weights.map((w, i) => w * effects[i]));
    const sumWXY = Stats.sum(weights.map((w, i) => w * sqrtN[i] * effects[i]));
    const sumWX2 = Stats.sum(weights.map((w, i) => w * sqrtN[i] * sqrtN[i]));

    const b1 = (sumW * sumWXY - sumWX * sumWY) /
              (sumW * sumWX2 - sumWX * sumWX);
    const b0 = (sumWY - b1 * sumWX) / sumW;

    // Test if slope is significant
    const yPred = sqrtN.map(x => b0 + b1 * x);
    const residuals = effects.map((y, i) => y - yPred[i]);
    const mse = Stats.sum(weights.map((w, i) => w * residuals[i] ** 2)) / (effects.length - 2);

    const se_b1 = Math.sqrt(mse / (sumWX2 - sumWX * sumWX / sumW));
    const t = b1 / se_b1;
    const df = effects.length - 2;
    const p = 2 * (1 - Stats.studentTCDF(Math.abs(t), df));

    return {
      applicable: true,
      slope: b1,
      se: se_b1,
      t,
      p,
      significant: p < this.options.alpha,
      test: 'Thompson-Severe test',
      interpretation: p < this.options.alpha ?
        'Significant small study effects detected' :
        'No significant small study effects'
    };
  }

  /**
   * Assess funnel plot asymmetry visually
   *
   * @private
   */
  _assessAsymmetry(effects, precision, se) {
    // Calculate asymmetry metrics
    const n = effects.length;

    // Doi plot asymmetry
    const sortedByPrecision = Array.from({ length: n }, (_, i) => ({
      effect: effects[i],
      precision: precision[i]
    })).sort((a, b) => a.precision - b.precision);

    // Compare top vs bottom precision halves
    const half = Math.floor(n / 2);
    const lowPrec = sortedByPrecision.slice(0, half).map(s => s.effect);
    const highPrec = sortedByPrecision.slice(n - half).map(s => s.effect);

    const meanLow = Stats.mean(lowPrec);
    const meanHigh = Stats.mean(highPrec);
    const asymmetryIndex = meanLow - meanHigh;

    // Standard error difference
    const seLow = Stats.sd(lowPrec) / Math.sqrt(half);
    const seHigh = Stats.sd(highPrec) / Math.sqrt(half);
    const seDiff = Math.sqrt(seLow * seLow + seHigh * seHigh);
    const zAsym = asymmetryIndex / seDiff;
    const pAsym = 2 * (1 - Stats.normalCDF(Math.abs(zAsym)));

    return {
      asymmetryIndex,
      seDifference: seDiff,
      zScore: zAsym,
      pValue: pAsym,
      significant: pAsym < this.options.alpha,
      interpretation: asymmetryIndex > 0 ?
        `Low precision studies show ${asymmetryIndex.toFixed(3)} higher effects` :
        `Low precision studies show ${Math.abs(asymmetryIndex).toFixed(3)} lower effects`
    };
  }

  /**
   * Assess small study effects
   *
   * @private
   */
  _assessSmallStudyEffects(effects, sampleSizes) {
    const n = effects.length;
    const medianN = Stats.median(sampleSizes);

    // Split by sample size
    const small = [];
    const large = [];

    effects.forEach((effect, i) => {
      if (sampleSizes[i] < medianN) {
        small.push(effect);
      } else {
        large.push(effect);
      }
    });

    const meanSmall = Stats.mean(small);
    const meanLarge = Stats.mean(large);
    const diff = meanSmall - meanLarge;

    // t-test
    const varSmall = Stats.variance(small);
    const varLarge = Stats.variance(large);
    const seDiff = Math.sqrt(varSmall / small.length + varLarge / large.length);
    const t = diff / seDiff;
    const df = small.length + large.length - 2;
    const p = 2 * (1 - Stats.studentTCDF(Math.abs(t), df));

    return {
      medianSampleSize: medianN,
      nSmall: small.length,
      nLarge: large.length,
      meanSmall,
      meanLarge,
      difference: diff,
      seDifference: seDiff,
      t,
      df,
      p,
      significant: p < this.options.alpha,
      interpretation: p < this.options.alpha ?
        `Small studies show significantly ${diff > 0 ? 'higher' : 'lower'} effects` :
        'No significant difference between small and large studies'
    };
  }

  /**
   * Assess overall risk of publication bias
   *
   * @private
   */
  _assessRisk(egger, begg, asymmetry, smallStudy) {
    const indicators = [];

    if (egger.applicable && egger.intercept.significant) {
      indicators.push('Egger test');
    }

    if (begg.applicable && begg.significant) {
      indicators.push('Begg test');
    }

    if (asymmetry.significant) {
      indicators.push('Funnel asymmetry');
    }

    if (smallStudy.significant) {
      indicators.push('Small study effects');
    }

    const nIndicators = indicators.length;

    let level, reasoning;

    if (nIndicators === 0) {
      level = 'low';
      reasoning = 'No significant indicators of publication bias detected.';
    } else if (nIndicators === 1) {
      level = 'low_moderate';
      reasoning = `One significant indicator detected (${indicators[0]}). Publication bias possible but not definitively present.`;
    } else if (nIndicators === 2) {
      level = 'moderate';
      reasoning = `Two significant indicators detected (${indicators.join(' and ')}). Moderate concern for publication bias.`;
    } else {
      level = 'high';
      reasoning = `${nIndicators} significant indicators detected (${indicators.join(', ')}). High concern for publication bias. Consider trim-and-fill adjustment.`;
    }

    return { level, reasoning, nIndicators, indicators };
  }

  /**
   * Generate recommendation based on risk assessment
   *
   * @private
   */
  _generateRecommendation(risk, egger, trimFill) {
    const recs = [];

    if (risk.level === 'low') {
      recs.push('✅ No evidence of publication bias. Results likely robust.');
    } else if (risk.level === 'low_moderate') {
      recs.push('⚠️ Possible publication bias. Interpret with caution.');
      recs.push('Consider reporting both adjusted and unadjusted estimates.');
    } else if (risk.level === 'moderate') {
      recs.push('⚠️ Moderate publication bias detected.');
      recs.push('Recommend reporting trim-and-fill adjusted estimates.');
      if (trimFill.applicable) {
        recs.push(`Original effect: ${trimFill.originalEffect.toFixed(3)}, Adjusted: ${trimFill.adjustedEffect.toFixed(3)}`);
      }
    } else {
      recs.push('❌ High risk of publication bias.');
      recs.push('Strongly recommend using trim-and-fill adjusted estimates.');
      recs.push('Consider searching for unpublished studies or contacting authors.');
      if (trimFill.applicable && trimFill.imputedCount > 0) {
        recs.push(`${trimFill.imputedCount} studies may be missing.`);
      }
    }

    return recs;
  }

  /**
   * Create funnel plot
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   * @returns {Object} Plotly plot object
   */
  plotFunnel(elementId, options = {}) {
    if (!this.data) {
      throw new Error('Run assessment first using assess()');
    }

    const plotOptions = {
      type: this.options.plotType,
      showContours: true,
      showTrimFill: this.results?.trimFill?.imputedCount > 0,
      showEggerLine: true,
      ...options
    };

    return Plots.funnelPlot(this.data, this.results, elementId, plotOptions);
  }

  /**
   * Create contour-enhanced funnel plot
   *
   * Shows significance regions within funnel plot
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotContourFunnel(elementId, options = {}) {
    if (!this.data) {
      throw new Error('Run assessment first using assess()');
    }

    return Plots.contourFunnelPlot(this.data, elementId, {
      alpha: this.options.alpha,
      ...options
    });
  }

  /**
   * Create radial plot (Galbraith plot)
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotRadial(elementId, options = {}) {
    if (!this.data) {
      throw new Error('Run assessment first using assess()');
    }

    return Plots.radialPlot(this.data, elementId, options);
  }

  /**
   * Create Doi plot
   *
   * Alternative to funnel plot using Doi's method
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotDoi(elementId, options = {}) {
    if (!this.data) {
      throw new Error('Run assessment first using assess()');
    }

    return Plots.doiPlot(this.data, elementId, options);
  }

  /**
   * Export results
   *
   * @param {string} format - Output format
   * @returns {string} Formatted output
   */
  exportResults(format = 'json') {
    if (!this.results) {
      throw new Error('No results to export. Run assess() first.');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(this.results, null, 2);

      case 'csv':
        return this._exportCSV();

      case 'r':
        return this._exportRCode();

      case 'stata':
        return this._exportStataCode();

      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Export results as CSV
   * @private
   */
  _exportCSV() {
    const { egger, begg, trimFill, overallRisk } = this.results;

    let csv = 'Test,Statistic,P-value,Significant,Interpretation\n';
    csv += `Egger Test,${egger.intercept.t.toFixed(4)},${egger.intercept.p.toFixed(4)},${egger.intercept.significant},"${egger.interpretation}"\n`;
    csv += `Begg Test,${begg.z.toFixed(4)},${begg.p.toFixed(4)},${begg.significant},"${begg.interpretation}"\n`;
    csv += `Overall Risk,,,,"${overallRisk}"\n`;

    return csv;
  }

  /**
   * Export R code
   * @private
   */
  _exportRCode() {
    return `
# Publication Bias Assessment with R
# Generated by Dose Response Pro v19.0

library(metafor)
library(metagear)

# Load your data
# dat <- read.csv("your_data.csv")

# Egger's regression test
egger_result <- regtest(dat$effect, dat$se)
print(egger_result)

# Begg's rank correlation test
begg_result <- ranktest(dat$effect, dat$variance)
print(begg_result)

# Trim and Fill
tf_result <- trimfill(dat$effect, dat$se)
print(tf_result)

# Funnel plot
funnel(dat$effect, dat$se, main = "Funnel Plot")

# Contour-enhanced funnel plot
funnel(dat$effect, dat$se, level = c(90, 95, 99),
       shade = c("white", "gray55", "gray75"),
       refline = 0, main = "Contour-Enhanced Funnel Plot")

# Radial plot (Galbraith plot)
radial(dat$effect, dat$se, main = "Radial Plot")

# Fail-safe N (Rosenthal)
fsn <- fsn(yi = dat$effect, vi = dat$variance)
print(fsn)

# Orwin's fail-safe N
fsn_orwin <- orwinfs(dat$effect, dat$variance)
print(fsn_orwin)
`.trim();
  }

  /**
   * Export Stata code
   * @private
   */
  _exportStataCode() {
    return `
* Publication Bias Assessment with Stata
* Generated by Dose Response Pro v19.0

* Load data
* use "your_data.dta", clear

* Set up meta-analysis data
* meta set effect se

* Funnel plot
meta funnel

* Egger's regression test
meta bias, egger

* Begg's rank correlation test
meta bias, begg

* Trim and fill
meta trimfill

* Cumulative meta-analysis
meta summarize, cumulative

* Small study effects
meta bias, harbord
`.trim();
  }

  /**
   * Generate report
   *
   * @returns {Object} Report sections
   */
  generateReport() {
    if (!this.results) {
      throw new Error('Run assessment first using assess()');
    }

    const { overallRisk, egger, begg, trimFill, asymmetry,
            smallStudyEffects, recommendation } = this.results;

    return {
      title: 'Publication Bias Assessment Report',
      sections: [
        {
          heading: 'Overall Risk Assessment',
          content: `**Risk Level:** ${this._formatRisk(overallRisk)}\n\n` +
                   overallRisk
        },
        {
          heading: 'Statistical Tests',
          content: this._formatTests(egger, begg)
        },
        {
          heading: 'Trim and Fill Analysis',
          content: this._formatTrimFill(trimFill)
        },
        {
          heading: 'Asymmetry Assessment',
          content: this._formatAsymmetry(asymmetry)
        },
        {
          heading: 'Small Study Effects',
          content: this._formatSmallStudy(smallStudyEffects)
        },
        {
          heading: 'Recommendations',
          content: recommendation.join('\n\n')
        }
      ]
    };
  }

  /**
   * Format risk level for display
   * @private
   */
  _formatRisk(level) {
    const formats = {
      low: '🟢 **Low Risk**',
      low_moderate: '🟡 **Low-Moderate Risk**',
      moderate: '🟠 **Moderate Risk**',
      high: '🔴 **High Risk**'
    };
    return formats[level] || level;
  }

  /**
   * Format test results
   * @private
   */
  _formatTests(egger, begg) {
    let text = '';

    if (egger.applicable) {
      text += `**Egger's Test**\n`;
      text += `- Intercept: ${egger.intercept.estimate.toFixed(4)} ` +
              `(${egger.intercept.ci[0].toFixed(4)}, ${egger.intercept.ci[1].toFixed(4)})\n`;
      text += `- t-statistic: ${egger.intercept.t.toFixed(4)}\n`;
      text += `- p-value: ${egger.intercept.p.toFixed(4)}\n`;
      text += `- ${egger.intercept.significant ? '✅' : '❌'} Significant asymmetry detected\n\n`;
    }

    if (begg.applicable) {
      text += `**Begg's Test**\n`;
      text += `- Kendall's tau: ${begg.tau.toFixed(4)}\n`;
      text += `- z-statistic: ${begg.z.toFixed(4)}\n`;
      text += `- p-value: ${begg.p.toFixed(4)}\n`;
      text += `- ${begg.significant ? '✅' : '❌'} Significant asymmetry detected\n`;
    }

    return text;
  }

  /**
   * Format trim and fill results
   * @private
   */
  _formatTrimFill(trimFill) {
    if (!trimFill.applicable) {
      return `Trim and Fill: ${trimFill.reason}`;
    }

    return `**Trim and Fill Analysis**\n` +
           `- Studies trimmed from left: ${trimFill.kL}\n` +
           `- Studies trimmed from right: ${trimFill.kR}\n` +
           `- Total imputed: ${trimFill.imputedCount}\n` +
           `- Original effect: ${trimFill.originalEffect.toFixed(4)} ` +
           `(${trimFill.ciOriginal.map(v => v.toFixed(4)).join(', ')})\n` +
           `- Adjusted effect: ${trimFill.adjustedEffect.toFixed(4)} ` +
           `(${trimFill.ciAdjusted.map(v => v.toFixed(4)).join(', ')})\n` +
           `- ${trimFill.converged ? '✅' : '⚠️'} Algorithm converged\n\n` +
           trimFill.interpretation;
  }

  /**
   * Format asymmetry results
   * @private
   */
  _formatAsymmetry(asymmetry) {
    return `**Funnel Plot Asymmetry**\n` +
           `- Asymmetry index: ${asymmetry.asymmetryIndex.toFixed(4)}\n` +
           `- z-score: ${asymmetry.zScore.toFixed(4)}\n` +
           `- p-value: ${asymmetry.pValue.toFixed(4)}\n` +
           `- ${asymmetry.significant ? '✅' : '❌'} Significant asymmetry\n\n` +
           asymmetry.interpretation;
  }

  /**
   * Format small study effects
   * @private
   */
  _formatSmallStudy(smallStudy) {
    return `**Small Study Effects**\n` +
           `- Median sample size: ${smallStudy.medianSampleSize}\n` +
           `- Small studies (n < ${smallStudy.medianSampleSize}): ${smallStudy.meanSmall.toFixed(4)}\n` +
           `- Large studies (n >= ${smallStudy.medianSampleSize}): ${smallStudy.meanLarge.toFixed(4)}\n` +
           `- Difference: ${smallStudy.difference.toFixed(4)}\n` +
           `- t-statistic: ${smallStudy.t.toFixed(4)}\n` +
           `- p-value: ${smallStudy.p.toFixed(4)}\n` +
           `- ${smallStudy.significant ? '✅' : '❌'} Significant small study effects\n\n` +
           smallStudy.interpretation;
  }
}

export default PublicationBias;
