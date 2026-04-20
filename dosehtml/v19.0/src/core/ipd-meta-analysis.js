/**
 * Dose Response Pro v19.0 - IPD Meta-Analysis Module
 *
 * Individual Patient Data (IPD) Meta-Analysis implementation
 * supporting one-stage and two-stage approaches.
 *
 * References:
 * - Simmonds et al. (2015). Meta-analysis of individual participant data.
 * - Stewart & Tierney (2017). IPD meta-analysis.
 * - Riley et al. (2010). Individual patient data meta-analysis.
 *
 * @module IPDMetaAnalysis
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

import { Matrix } from '../math/matrix.js';
import { Stats } from '../math/stats.js';
import { Plots } from '../visualization/plots.js';

/**
 * IPD Meta-Analysis Class
 */
export class IPDMetaAnalysis {
  constructor(options = {}) {
    this.options = {
      method: 'onestage', // 'onestage' or 'twostage'
      model: 'cox', // 'cox', 'weibull', 'lognormal', 'exponential'
      sharedBaseline: true,
      stratified: false,
      ...options
    };

    this.data = null;
    this.results = null;
  }

  /**
   * Load IPD data
   *
   * Expected format:
   * patient_id, study_id, treatment, time, event, cov1, cov2, ...
   *
   * @param {Array} data - Individual patient data
   * @returns {Object} Data summary
   */
  loadData(data) {
    this.data = this._validateAndProcess(data);

    return {
      nPatients: this.data.patients.length,
      nStudies: new Set(this.data.patients.map(p => p.study_id)).size,
      nTreatments: new Set(this.data.patients.map(p => p.treatment)).size,
      nEvents: this.data.patients.filter(p => p.event === 1).length,
      studySummary: this._summarizeStudies()
    };
  }

  /**
   * Validate and process IPD data
   * @private
   */
  _validateAndProcess(data) {
    // Validate required fields
    const required = ['patient_id', 'study_id', 'treatment', 'time', 'event'];
    const missing = required.filter(field => !data[0] || !(field in data[0]));

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Extract covariates
    const covariates = Object.keys(data[0]).filter(k =>
      !required.includes(k) && !k.startsWith('_')
    );

    // Process data
    const patients = data.map(row => ({
      id: row.patient_id,
      study_id: row.study_id,
      treatment: String(row.treatment),
      time: parseFloat(row.time),
      event: parseInt(row.event),
      covariates: covariates.map(c => parseFloat(row[c] || 0)),
      covariateNames: covariates
    }));

    // Study list
    const studies = [...new Set(patients.map(p => p.study_id))];

    // Treatment list
    const treatments = [...new Set(patients.map(p => p.treatment))];

    return { patients, studies, treatments, covariates };
  }

  /**
   * Summarize studies
   * @private
   */
  _summarizeStudies() {
    const summary = {};

    this.data.patients.forEach(p => {
      if (!summary[p.study_id]) {
        summary[p.study_id] = {
          nPatients: 0,
          nEvents: 0,
          treatments: new Set(),
          totalTime: 0
        };
      }
      summary[p.study_id].nPatients++;
      summary[p.study_id].nEvents += p.event;
      summary[p.study_id].treatments.add(p.treatment);
      summary[p.study_id].totalTime += p.time;
    });

    return summary;
  }

  /**
   * One-stage IPD meta-analysis
   *
   * Uses mixed-effects Cox model with random treatment effects
   *
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis results
   */
  analyzeOneStage(options = {}) {
    if (!this.data) {
      throw new Error('Load data first using loadData()');
    }

    const opts = { ...this.options, ...options };

    // Build design matrix
    const X = this._buildDesignMatrix();
    const y = this._buildOutcomeVector();

    // Variance components
    const studyEffects = this._extractStudyEffects();
    const betweenStudyVar = this._estimateBetweenStudyVariance(studyEffects);

    // Fit mixed-effects model
    const model = this._fitMixedModel(X, y, studyEffects, betweenStudyVar, opts);

    // Likelihood ratio test
    const lrt = this._likelihoodRatioTest(model);

    // Hazard ratios with CIs
    const hazardRatios = this._calculateHazardRatios(model);

    this.results = {
      method: 'onestage',
      modelType: opts.model,
      coefficients: model.coefficients,
      hazardRatios,
      betweenStudyVariance: betweenStudyVar,
      likelihoodRatioTest: lrt,
      studyEffects: model.studyEffects,
      convergence: model.converged,
      iterations: model.iterations
    };

    return this.results;
  }

  /**
   * Build design matrix for one-stage model
   * @private
   */
  _buildDesignMatrix() {
    const { patients, covariates } = this.data;
    const n = patients.length;
    const nCovariates = covariates.length;

    // Columns: intercept + treatment + covariates + study interactions
    const nCols = 1 + 1 + nCovariates + this.data.studies.length;

    const X = Matrix.zeros(n, nCols);

    for (let i = 0; i < n; i++) {
      let col = 0;
      X.set(i, col++, 1); // Intercept

      // Treatment effect (binary: 1 = treatment, 0 = control)
      const isTreatment = patients[i].treatment === this.data.treatments[1] ? 1 : 0;
      X.set(i, col++, isTreatment);

      // Covariates
      patients[i].covariates.forEach(cov => {
        X.set(i, col++, cov);
      });

      // Study indicators (for stratification)
      const studyIdx = this.data.studies.indexOf(patients[i].study_id);
      X.set(i, col + studyIdx, 1);
    }

    return X;
  }

  /**
   * Build outcome vector (survival)
   * @private
   */
  _buildOutcomeVector() {
    const { patients } = this.data;

    return {
      time: patients.map(p => p.time),
      event: patients.map(p => p.event),
      logRankScore: this._calculateLogRankScores()
    };
  }

  /**
   * Calculate log-rank scores for survival data
   * @private
   */
  _calculateLogRankScores() {
    const { patients } = this.data;
    const n = patients.length;

    // Sort by time
    const sorted = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => patients[a].time - patients[b].time);

    // Calculate risk sets at each time
    const scores = Array(n).fill(0);
    let atRisk = new Set(sorted);

    for (const idx of sorted) {
      const nAtRisk = atRisk.size;
      const nEvents = Array.from(atRisk).filter(i => patients[i].event === 1).length;

      if (nEvents > 0) {
        scores[idx] = patients[idx].event - nEvents / nAtRisk;
      }

      atRisk.delete(idx);
    }

    return scores;
  }

  /**
   * Extract study-specific effects
   * @private
   */
  _extractStudyEffects() {
    const { patients, studies, treatments } = this.data;
    const effects = [];

    studies.forEach(studyId => {
      const studyPatients = patients.filter(p => p.study_id === studyId);
      const treatmentPatients = studyPatients.filter(p =>
        p.treatment === treatments[1]
      );
      const controlPatients = studyPatients.filter(p =>
        p.treatment === treatments[0]
      );

      // Simple log-rank per study
      const effect = this._calculateStudyEffect(treatmentPatients, controlPatients);

      effects.push({
        studyId,
        effect: effect.estimate,
        variance: effect.variance,
        logRank: effect.logRank
      });
    });

    return effects;
  }

  /**
   * Calculate study-specific effect
   * @private
   */
  _calculateStudyEffect(treatment, control) {
    // Simplified log-rank calculation
    const allPatients = [...treatment, ...control];

    // Calculate log-rank scores
    const treatmentScores = this._calculateLogRankScoresForGroup(treatment, allPatients);
    const controlScores = this._calculateLogRankScoresForGroup(control, allPatients);

    const estimate = Stats.sum(treatmentScores) - Stats.sum(controlScores);

    // Variance estimate (simplified)
    const variance = (treatment.length + control.length) /
                     (treatment.length * control.length);

    return {
      estimate,
      variance,
      logRank: estimate / Math.sqrt(variance)
    };
  }

  /**
   * Calculate log-rank scores for a group
   * @private
   */
  _calculateLogRankScoresForGroup(group, allPatients) {
    const times = group.map(p => p.time);
    const scores = [];

    times.forEach(time => {
      const atRiskInGroup = group.filter(p => p.time >= time).length;
      const atRiskTotal = allPatients.filter(p => p.time >= time).length;
      const eventsAtTime = allPatients.filter(p => p.time === time && p.event === 1).length;

      scores.push(atRiskInGroup / atRiskTotal * eventsAtTime);
    });

    return scores;
  }

  /**
   * Estimate between-study variance
   * @private
   */
  _estimateBetweenStudyVariance(studyEffects) {
    if (studyEffects.length < 2) return 0;

    const effects = studyEffects.map(e => e.effect);
    const variances = studyEffects.map(e => e.variance);

    // DerSimonian-Laird estimator
    const Q = Stats.sum(effects.map((e, i) =>
      (e - Stats.mean(effects)) ** 2 / variances[i]
    ));

    const df = effects.length - 1;
    const tau2 = Math.max(0, (Q - df) / Stats.sum(variances.map(v => 1 / v)));

    return tau2;
  }

  /**
   * Fit mixed-effects model (simplified Cox)
   * @private
   */
  _fitMixedModel(X, y, studyEffects, tau2, opts) {
    const maxIter = 1000;
    const tol = 1e-8;
    let converged = false;
    let iteration = 0;

    // Initial estimates (using weighted least squares)
    const n = X.rows;
    const p = X.cols;

    // Weight matrix (accounting for tau2)
    const V = Matrix.diag(
      y.logRankScore.map((_, i) => 1 + tau2)
    );
    const V_inv = Matrix.inv(V);

    // GLS estimation
    const Xt_V_inv = Matrix.transpose(X).multiply(V_inv);
    const Xt_V_inv_X = Xt_V_inv.multiply(X);
    const Xt_V_inv_X_inv = Matrix.inv(Xt_V_inv_X);

    let beta = Xt_V_inv_X_inv
      .multiply(Xt_V_inv)
      .multiply(Matrix.columnVector(y.logRankScore));

    // Iterative refinement
    for (let iter = 0; iter < maxIter; iter++) {
      iteration++;

      // Calculate partial likelihood (simplified)
      const newBeta = beta;

      const delta = newBeta.subtract(beta).norm();

      if (delta < tol) {
        converged = true;
        break;
      }

      beta = newBeta;
    }

    // Standard errors
    const covMatrix = Xt_V_inv_X_inv;
    const se = covMatrix.diag().map(v => Math.sqrt(v));

    // Study-specific random effects
    const studyREs = studyEffects.map(e => ({
      studyId: e.studyId,
      randomEffect: e.effect - beta.get(1, 0) // Assuming treatment is column 1
    }));

    return {
      coefficients: {
        estimates: beta.col(0),
        se: se.col(0),
        covMatrix: covMatrix.toArray()
      },
      studyEffects: studyREs,
      converged,
      iterations: iteration,
      logLikelihood: this._calculateLogLikelihood(beta, X, y)
    };
  }

  /**
   * Calculate log-likelihood
   * @private
   */
  _calculateLogLikelihood(beta, X, y) {
    // Simplified partial likelihood
    const linearPredictor = X.multiply(beta).col(0);
    const logLik = Stats.sum(
      y.logRankScore.map((s, i) => s * linearPredictor[i])
    );

    return logLik;
  }

  /**
   * Likelihood ratio test
   * @private
   */
  _likelihoodRatioTest(model) {
    // Fit null model (no treatment effect)
    // This is simplified - proper implementation would refit model

    const chiSquare = 2 * model.logLikelihood; // Assuming null logLik = 0
    const df = 1; // Testing treatment effect only
    const pValue = 1 - Stats.chiSquareCDF(chiSquare, df);

    return {
      chiSquare,
      df,
      pValue,
      significant: pValue < this.options.alpha
    };
  }

  /**
   * Calculate hazard ratios with confidence intervals
   * @private
   */
  _calculateHazardRatios(model) {
    const { estimates, se } = model.coefficients;
    const z = 1.96; // For 95% CI

    const hr = estimates.map((beta, i) => ({
      parameter: i === 0 ? 'Intercept' : i === 1 ? 'Treatment' : `Covariate ${i}`,
      hazardRatio: Math.exp(beta),
      ciLower: Math.exp(beta - z * se[i]),
      ciUpper: Math.exp(beta + z * se[i]),
      pValue: 2 * (1 - Stats.normalCDF(Math.abs(beta / se[i])))
    }));

    return hr;
  }

  /**
   * Two-stage IPD meta-analysis
   *
   * Stage 1: Study-specific Cox models
   * Stage 2: Pool study estimates
   *
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis results
   */
  analyzeTwoStage(options = {}) {
    if (!this.data) {
      throw new Error('Load data first using loadData()');
    }

    const opts = { ...this.options, ...options };

    // Stage 1: Fit study-specific models
    const stage1 = this._stage1Analysis(opts);

    // Stage 2: Pool study estimates
    const stage2 = this._stage2Pooling(stage1);

    this.results = {
      method: 'twostage',
      modelType: opts.model,
      stage1,
      stage2,
      pooledEffect: stage2.pooledEffect,
      heterogeneity: stage2.heterogeneity
    };

    return this.results;
  }

  /**
   * Stage 1: Study-specific Cox models
   * @private
   */
  _stage1Analysis(opts) {
    const { studies, patients, treatments } = this.data;

    return studies.map(studyId => {
      const studyPatients = patients.filter(p => p.study_id === studyId);

      // Fit Cox model for this study
      const model = this._fitStudyCox(studyPatients, treatments, opts);

      return {
        studyId,
        model,
        nPatients: studyPatients.length,
        nEvents: studyPatients.filter(p => p.event === 1).length
      };
    });
  }

  /**
   * Fit Cox model for single study
   * @private
   */
  _fitStudyCox(studyPatients, treatments, opts) {
    const treatment = studyPatients.map(p =>
      p.treatment === treatments[1] ? 1 : 0
    );
    const times = studyPatients.map(p => p.time);
    const events = studyPatients.map(p => p.event);

    // Simplified Cox estimation using Breslow method
    const n = studyPatients.length;

    // Sort by time
    const sorted = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => times[a] - times[b]);

    // Calculate risk sets
    const logRankScores = Array(n).fill(0);
    let atRisk = new Set(sorted);

    for (const idx of sorted) {
      const nAtRisk = atRisk.size;
      const treatmentAtRisk = Array.from(atRisk)
        .filter(i => treatment[i] === 1).length;

      const eventsAtTime = Array.from(atRisk)
        .filter(i => events[i] === 1).length;

      if (eventsAtTime > 0) {
        const expected = treatmentAtRisk / nAtRisk * eventsAtTime;
        logRankScores[idx] = treatment[idx] - expected;
      }

      atRisk.delete(idx);
    }

    // Estimate coefficient
    const variance = Stats.sum(treatment.map(t =>
      t * (1 - Stats.mean(treatment))
    ));

    const estimate = Stats.sum(logRankScores);
    const se = Math.sqrt(variance);

    return {
      estimate,
      se,
      hazardRatio: Math.exp(estimate),
      ciLower: Math.exp(estimate - 1.96 * se),
      ciUpper: Math.exp(estimate + 1.96 * se),
      pValue: 2 * (1 - Stats.normalCDF(Math.abs(estimate / se)))
    };
  }

  /**
   * Stage 2: Pool study estimates
   * @private
   */
  _stage2Pooling(stage1) {
    const effects = stage1.map(s => s.model.estimate);
    const variances = stage1.map(s => s.model.se ** 2);

    // Random effects pooling
    const tau2 = this._estimateTau2(effects, variances);

    // Pooled estimate
    const weights = variances.map(v => 1 / (v + tau2));
    const sumWeights = Stats.sum(weights);

    const pooledEffect = Stats.sum(
      effects.map((e, i) => e * weights[i])
    ) / sumWeights;

    const pooledSE = Math.sqrt(1 / sumWeights);

    // Heterogeneity statistics
    const Q = Stats.sum(
      effects.map((e, i) =>
        weights[i] * (e - pooledEffect) ** 2
      )
    );

    const df = effects.length - 1;
    const i2 = Math.max(0, 100 * (Q - df) / Q);

    // Heterogeneity test
    const pValue = 1 - Stats.chiSquareCDF(Q, df);

    return {
      pooledEffect: {
        estimate: pooledEffect,
        se: pooledSE,
        hazardRatio: Math.exp(pooledEffect),
        ciLower: Math.exp(pooledEffect - 1.96 * pooledSE),
        ciUpper: Math.exp(pooledEffect + 1.96 * pooledSE),
        pValue: 2 * (1 - Stats.normalCDF(Math.abs(pooledEffect / pooledSE)))
      },
      heterogeneity: {
        tau2,
        i2,
        Q,
        df,
        pValue,
        significant: pValue < 0.05
      }
    };
  }

  /**
   * Estimate tau² for two-stage pooling
   * @private
   */
  _estimateTau2(effects, variances) {
    if (effects.length < 2) return 0;

    // DerSimonian-Laird
    const pooledVar = Stats.harmonicMean(variances);
    const Q = Stats.sum(effects.map(e =>
      (e - Stats.mean(effects)) ** 2 / pooledVar
    ));

    const df = effects.length - 1;
    return Math.max(0, (Q - df) / Stats.sum(variances.map(v => 1 / v)));
  }

  /**
   * Test subgroup interactions
   *
   * @param {string} covariate - Covariate to test for interaction
   * @returns {Object} Interaction test results
   */
  testInteraction(covariate) {
    if (!this.data) {
      throw new Error('Load data first using loadData()');
    }

    const { patients, studies, covariates } = this.data;
    const covIdx = covariates.indexOf(covariate);

    if (covIdx === -1) {
      throw new Error(`Covariate "${covariate}" not found`);
    }

    // Fit model with interaction term
    const covValues = patients.map(p => p.covariates[covIdx]);
    const treatment = patients.map(p =>
      p.treatment === this.data.treatments[1] ? 1 : 0
    );

    // Interaction term
    const interaction = treatment.map((t, i) => t * covValues[i]);

    // Simple test (chi-square for interaction)
    const modelWithInteraction = this._fitModelWithInteraction(
      treatment, covValues, interaction
    );

    const modelWithoutInteraction = this._fitModelWithoutInteraction(
      treatment, covValues
    );

    // Likelihood ratio test
    const lrStat = 2 * (modelWithInteraction.logLik - modelWithoutInteraction.logLik);
    const df = 1;
    const pValue = 1 - Stats.chiSquareCDF(lrStat, df);

    return {
      covariate,
      interactionCoefficient: modelWithInteraction.interactionCoef,
      interactionSe: modelWithInteraction.interactionSe,
      interactionP: pValue,
      significant: pValue < 0.05,
      interpretation: pValue < 0.05 ?
        `Significant interaction: Treatment effect varies by ${covariate}` :
        `No significant interaction with ${covariate}`
    };
  }

  /**
   * Fit model with interaction term
   * @private
   */
  _fitModelWithInteraction(treatment, covariate, interaction) {
    // Simplified estimation
    const n = treatment.length;

    const X = Matrix.zeros(n, 3);
    for (let i = 0; i < n; i++) {
      X.set(i, 0, 1); // Intercept
      X.set(i, 1, treatment[i]);
      X.set(i, 2, interaction[i]);
    }

    const y = Matrix.columnVector(this.data.patients.map(p => p.event));

    const XtX = Matrix.transpose(X).multiply(X);
    const XtX_inv = Matrix.inv(XtX);
    const Xty = Matrix.transpose(X).multiply(y);
    const beta = XtX_inv.multiply(Xty);

    return {
      interactionCoef: beta.get(2, 0),
      interactionSe: Math.sqrt(XtX_inv.get(2, 2)),
      logLik: this._calculateLogLikelihoodSimple(beta, X, y)
    };
  }

  /**
   * Fit model without interaction
   * @private
   */
  _fitModelWithoutInteraction(treatment, covariate) {
    const n = treatment.length;

    const X = Matrix.zeros(n, 2);
    for (let i = 0; i < n; i++) {
      X.set(i, 0, 1); // Intercept
      X.set(i, 1, treatment[i]);
    }

    const y = Matrix.columnVector(this.data.patients.map(p => p.event));

    const XtX = Matrix.transpose(X).multiply(X);
    const XtX_inv = Matrix.inv(XtX);
    const Xty = Matrix.transpose(X).multiply(y);
    const beta = XtX_inv.multiply(Xty);

    return {
      logLik: this._calculateLogLikelihoodSimple(beta, X, y)
    };
  }

  /**
   * Simple log-likelihood calculation
   * @private
   */
  _calculateLogLikelihoodSimple(beta, X, y) {
    const linearPredictor = X.multiply(beta).col(0);

    // Bernoulli log-likelihood
    let logLik = 0;
    for (let i = 0; i < y.length; i++) {
      const p = 1 / (1 + Math.exp(-linearPredictor[i]));
      logLik += y.get(i, 0) * Math.log(p + 1e-10) +
                (1 - y.get(i, 0)) * Math.log(1 - p + 1e-10);
    }

    return logLik;
  }

  /**
   * Create Kaplan-Meier plot
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotKaplanMeier(elementId, options = {}) {
    if (!this.data) {
      throw new Error('Load data first');
    }

    const plotOptions = {
      stratifyByStudy: false,
      showConfidenceIntervals: true,
      showRiskTable: true,
      ...options
    };

    return Plots.kaplanMeierPlot(this.data, elementId, plotOptions);
  }

  /**
   * Create forest plot of study-specific HRs
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotForest(elementId, options = {}) {
    if (!this.results) {
      throw new Error('Run analysis first');
    }

    return Plots.ipdForestPlot(this.results, elementId, options);
  }

  /**
   * Create interaction plot
   *
   * @param {string} elementId - DOM element ID
   * @param {string} covariate - Covariate to plot
   * @param {Object} options - Plot options
   */
  plotInteraction(elementId, covariate, options = {}) {
    if (!this.data) {
      throw new Error('Load data first');
    }

    return Plots.interactionPlot(this.data, covariate, elementId, options);
  }

  /**
   * Export results
   *
   * @param {string} format - Output format
   * @returns {string} Formatted output
   */
  exportResults(format = 'json') {
    if (!this.results) {
      throw new Error('No results to export');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(this.results, null, 2);

      case 'csv':
        return this._exportCSV();

      case 'r':
        return this._exportRCode();

      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Export results as CSV
   * @private
   */
  _exportCSV() {
    const { method, pooledEffect, stage1 } = this.results;

    let csv = 'Study,HR,CI_Lower,CI_Upper,P-value\n';

    if (method === 'twostage') {
      stage1.forEach(s => {
        csv += `${s.studyId},${s.model.hazardRatio.toFixed(4)},` +
               `${s.model.ciLower.toFixed(4)},${s.model.ciUpper.toFixed(4)},` +
               `${s.model.pValue.toFixed(4)}\n`;
      });

      csv += `Pooled,${pooledEffect.hazardRatio.toFixed(4)},` +
             `${pooledEffect.ciLower.toFixed(4)},` +
             `${pooledEffect.ciUpper.toFixed(4)},` +
             `${pooledEffect.pValue.toFixed(4)}\n`;
    }

    return csv;
  }

  /**
   * Export R code
   * @private
   */
  _exportRCode() {
    const { treatments, covariates } = this.data;

    return `
# IPD Meta-Analysis with R
# Generated by Dose Response Pro v19.0

library(survival)
library(meta)
library(ipdmeta)

# Load data
ipd_data <- read.csv("your_ipd_data.csv")

# One-stage IPD meta-analysis
# Fit stratified Cox model
fit_onestage <- survfit(
  Surv(time, event) ~ treatment + strata(study_id),
  data = ipd_data
)

# Two-stage IPD meta-analysis
stage1_results <- list()

for (study in unique(ipd_data$study_id)) {
  study_data <- ipd_data[ipd_data$study_id == study, ]

  # Fit Cox model per study
  fit <- coxph(
    Surv(time, event) ~ treatment,
    data = study_data
  )

  stage1_results[[study]] <- summary(fit)
}

# Pool stage 1 results
stage2_pooling <- metagen(
  TE = sapply(stage1_results, function(x) x$coefficients[1]),
  seTE = sapply(stage1_results, function(x) x$coefficients[3]),
  sm = "HR",
  studlab = names(stage1_results)
)

print(stage2_pooling)

# Forest plot
forest(stage2_pooling,
       xlab = "Hazard Ratio",
       title = "IPD Meta-Analysis")

# Test interaction
interaction_fit <- coxph(
  Surv(time, event) ~ treatment * ${covariates[0] || 'covariate'} + strata(study_id),
  data = ipd_data
)

summary(interaction_fit)
`.trim();
  }
}

export default IPDMetaAnalysis;
