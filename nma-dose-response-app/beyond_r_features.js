// ============================================================================
// BEYOND R: ADVANCED FEATURES NOT AVAILABLE IN STANDARD R PACKAGES
// ============================================================================

// ----------------------------------------------------------------------------
// 1. BAYESIAN MODEL AVERAGING WITH MCMC SAMPLING
// Full posterior distributions, not just point estimates
// ----------------------------------------------------------------------------

class BayesianModelAveraging {
  constructor(models, data, options = {}) {
    this.models = models; // Array of model specs
    this.data = data;
    this.nIter = options.nIter || 5000;
    this.burnIn = options.burnIn || 1000;
    this.thin = options.thin || 2;
    this.priorSD = options.priorSD || 10;
    this.posteriors = {};
  }

  // Metropolis-Hastings sampler for each model
  samplePosterior(model, likelihood) {
    const samples = [];
    let current = this.initializeParams(model);
    let currentLL = likelihood(current);

    for (let i = 0; i < this.nIter; i++) {
      // Propose new parameters
      const proposed = this.propose(current, model);
      const proposedLL = likelihood(proposed);

      // Prior ratio (assuming normal priors)
      const priorRatio = this.computePriorRatio(current, proposed);

      // Acceptance probability
      const alpha = Math.min(1, Math.exp(proposedLL - currentLL) * priorRatio);

      if (getRandom() < alpha) {
        current = proposed;
        currentLL = proposedLL;
      }

      if (i >= this.burnIn && (i - this.burnIn) % this.thin === 0) {
        samples.push({ ...current, logLik: currentLL });
      }
    }

    return samples;
  }

  initializeParams(model) {
    const params = {};
    switch (model.type) {
      case 'emax':
        params.e0 = 0;
        params.emax = 1;
        params.ed50 = this.data.maxDose / 2;
        break;
      case 'hill':
        params.e0 = 0;
        params.emax = 1;
        params.ed50 = this.data.maxDose / 2;
        params.hill = 1;
        break;
      case 'linear':
        params.intercept = 0;
        params.slope = 0.01;
        break;
      case 'quadratic':
        params.a = 0;
        params.b = 0.01;
        params.c = -0.0001;
        break;
    }
    params.tau2 = 0.1;
    return params;
  }

  propose(current, model) {
    const proposed = { ...current };
    const keys = Object.keys(current);
    const key = keys[Math.floor(getRandom() * keys.length)];

    // Adaptive proposal SD based on parameter
    let propSD = 0.1;
    if (key === 'ed50') propSD = this.data.maxDose * 0.1;
    if (key === 'tau2') propSD = 0.05;

    proposed[key] = current[key] + normalRandom() * propSD;

    // Ensure positivity constraints
    if (key === 'ed50' || key === 'tau2' || key === 'hill') {
      proposed[key] = Math.abs(proposed[key]);
    }

    return proposed;
  }

  computePriorRatio(current, proposed) {
    let ratio = 1;
    for (const key of Object.keys(current)) {
      const currPrior = Math.exp(-0.5 * (current[key] / this.priorSD) ** 2);
      const propPrior = Math.exp(-0.5 * (proposed[key] / this.priorSD) ** 2);
      ratio *= propPrior / currPrior;
    }
    return ratio;
  }

  // Compute model weights using marginal likelihood (harmonic mean estimator)
  computeModelWeights() {
    const logML = {};
    let maxLogML = -Infinity;

    for (const model of this.models) {
      const samples = this.posteriors[model.type];
      if (!samples || samples.length === 0) continue;

      // Harmonic mean estimator of marginal likelihood
      const invLiks = samples.map(s => -s.logLik);
      const maxInv = Math.max(...invLiks);
      const sumExp = invLiks.reduce((sum, l) => sum + Math.exp(l - maxInv), 0);
      logML[model.type] = -maxInv - Math.log(sumExp / samples.length);

      if (logML[model.type] > maxLogML) maxLogML = logML[model.type];
    }

    // Convert to weights
    const weights = {};
    let sumWeights = 0;
    for (const type of Object.keys(logML)) {
      weights[type] = Math.exp(logML[type] - maxLogML);
      sumWeights += weights[type];
    }
    for (const type of Object.keys(weights)) {
      weights[type] /= sumWeights;
    }

    return weights;
  }

  // Generate model-averaged predictions with full uncertainty
  predictWithUncertainty(doses) {
    const weights = this.computeModelWeights();
    const predictions = doses.map(() => []);

    for (const model of this.models) {
      const samples = this.posteriors[model.type];
      if (!samples) continue;

      const w = weights[model.type];
      const nSamples = Math.round(w * 1000); // Weighted resampling

      for (let i = 0; i < nSamples; i++) {
        const sample = samples[Math.floor(getRandom() * samples.length)];
        for (let j = 0; j < doses.length; j++) {
          const pred = this.predictModel(model.type, sample, doses[j]);
          predictions[j].push(pred);
        }
      }
    }

    // Compute credible intervals
    return doses.map((d, i) => {
      const sorted = predictions[i].sort((a, b) => a - b);
      const n = sorted.length;
      return {
        dose: d,
        mean: sorted.reduce((a, b) => a + b, 0) / n,
        median: sorted[Math.floor(n / 2)],
        ci_2_5: sorted[Math.floor(n * 0.025)],
        ci_97_5: sorted[Math.floor(n * 0.975)],
        ci_10: sorted[Math.floor(n * 0.1)],
        ci_90: sorted[Math.floor(n * 0.9)]
      };
    });
  }

  predictModel(type, params, dose) {
    switch (type) {
      case 'emax':
        return params.e0 + (params.emax * dose) / (params.ed50 + dose);
      case 'hill':
        return params.e0 + (params.emax * Math.pow(dose, params.hill)) /
               (Math.pow(params.ed50, params.hill) + Math.pow(dose, params.hill));
      case 'linear':
        return params.intercept + params.slope * dose;
      case 'quadratic':
        return params.a + params.b * dose + params.c * dose * dose;
      default:
        return 0;
    }
  }
}

// Helper: Generate normal random using Box-Muller
function normalRandom() {
  const u1 = getRandom();
  const u2 = getRandom();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ----------------------------------------------------------------------------
// 2. AI-ASSISTED HETEROGENEITY SOURCE DETECTION
// Uses clustering and feature importance to identify sources of heterogeneity
// ----------------------------------------------------------------------------

class HeterogeneityDetector {
  constructor(studies) {
    this.studies = studies;
    this.features = this.extractFeatures();
  }

  extractFeatures() {
    // Extract numerical features from studies
    return this.studies.map(s => ({
      study: s.study,
      dose: s.dose,
      sampleSize: s.n || 100,
      year: s.year || 2020,
      effectSize: s.effect,
      se: s.se,
      precision: 1 / (s.se * s.se),
      doseCategory: s.dose < 10 ? 'low' : s.dose < 50 ? 'medium' : 'high'
    }));
  }

  // K-means clustering to identify study subgroups
  clusterStudies(k = 3) {
    const features = this.features.map(f => [
      f.effectSize,
      f.precision,
      f.dose / 100 // Normalize
    ]);

    // Initialize centroids randomly
    const centroids = [];
    for (let i = 0; i < k; i++) {
      centroids.push(features[Math.floor(getRandom() * features.length)].slice());
    }

    // Iterate
    let assignments = new Array(features.length).fill(0);
    for (let iter = 0; iter < 100; iter++) {
      // Assign to nearest centroid
      const newAssignments = features.map(f => {
        let minDist = Infinity;
        let best = 0;
        for (let j = 0; j < k; j++) {
          const dist = euclideanDist(f, centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            best = j;
          }
        }
        return best;
      });

      // Check convergence
      if (arraysEqual(assignments, newAssignments)) break;
      assignments = newAssignments;

      // Update centroids
      for (let j = 0; j < k; j++) {
        const members = features.filter((_, i) => assignments[i] === j);
        if (members.length === 0) continue;
        for (let d = 0; d < centroids[j].length; d++) {
          centroids[j][d] = members.reduce((s, m) => s + m[d], 0) / members.length;
        }
      }
    }

    return {
      assignments,
      centroids,
      clusters: this.summarizeClusters(assignments, k)
    };
  }

  summarizeClusters(assignments, k) {
    const clusters = [];
    for (let j = 0; j < k; j++) {
      const members = this.features.filter((_, i) => assignments[i] === j);
      if (members.length === 0) continue;

      const effects = members.map(m => m.effectSize);
      const doses = members.map(m => m.dose);

      clusters.push({
        id: j,
        n: members.length,
        studies: members.map(m => m.study),
        meanEffect: mean(effects),
        sdEffect: sd(effects),
        meanDose: mean(doses),
        characteristics: this.identifyCharacteristics(members)
      });
    }
    return clusters;
  }

  identifyCharacteristics(members) {
    // Identify what makes this cluster different
    const chars = [];

    const avgDose = mean(members.map(m => m.dose));
    if (avgDose < 10) chars.push('Low dose studies');
    else if (avgDose > 50) chars.push('High dose studies');

    const avgPrecision = mean(members.map(m => m.precision));
    if (avgPrecision > mean(this.features.map(f => f.precision)) * 1.5) {
      chars.push('High precision studies');
    }

    return chars.length > 0 ? chars : ['Mixed characteristics'];
  }

  // Detect outliers using leave-one-out influence
  detectOutliers(pooledEffect, tau2) {
    const outliers = [];

    for (let i = 0; i < this.studies.length; i++) {
      const study = this.studies[i];
      const others = this.studies.filter((_, j) => j !== i);

      // Recompute pooled effect without this study
      let sumW = 0, sumWY = 0;
      for (const s of others) {
        const w = 1 / (s.se * s.se + tau2);
        sumW += w;
        sumWY += w * s.effect;
      }
      const looEffect = sumWY / sumW;

      // Compute influence
      const influence = Math.abs(pooledEffect - looEffect);
      const stdResidual = (study.effect - pooledEffect) / Math.sqrt(study.se * study.se + tau2);

      if (Math.abs(stdResidual) > 2.5 || influence > 0.1 * Math.abs(pooledEffect)) {
        outliers.push({
          study: study.study,
          effect: study.effect,
          stdResidual,
          influence,
          reason: Math.abs(stdResidual) > 2.5 ? 'Large residual' : 'High influence'
        });
      }
    }

    return outliers;
  }

  // Feature importance for heterogeneity using random permutation
  computeFeatureImportance(tau2Initial) {
    const features = ['dose', 'sampleSize', 'precision'];
    const importance = {};

    for (const feature of features) {
      // Permute feature and recompute tau2
      const permuted = this.studies.map(s => ({ ...s }));
      const values = permuted.map(s => s[feature] || s.se);
      shuffle(values);
      permuted.forEach((s, i) => {
        if (feature === 'precision') s.se = 1 / Math.sqrt(values[i]);
        else s[feature] = values[i];
      });

      // Compute tau2 with permuted feature
      const tau2Permuted = this.computeTau2(permuted);

      // Importance is change in tau2
      importance[feature] = Math.abs(tau2Initial - tau2Permuted) / tau2Initial;
    }

    return importance;
  }

  computeTau2(studies) {
    // DerSimonian-Laird estimator
    let sumW = 0, sumW2 = 0, sumWY = 0, sumWY2 = 0;
    for (const s of studies) {
      const w = 1 / (s.se * s.se);
      sumW += w;
      sumW2 += w * w;
      sumWY += w * s.effect;
      sumWY2 += w * s.effect * s.effect;
    }
    const Q = sumWY2 - (sumWY * sumWY) / sumW;
    const df = studies.length - 1;
    const C = sumW - sumW2 / sumW;
    return Math.max(0, (Q - df) / C);
  }
}

// ----------------------------------------------------------------------------
// 3. OPTIMAL DOSE PREDICTION WITH UNCERTAINTY QUANTIFICATION
// Finds the dose that maximizes expected benefit with risk constraints
// ----------------------------------------------------------------------------

class OptimalDoseFinder {
  constructor(model, params, options = {}) {
    this.model = model;
    this.params = params;
    this.minDose = options.minDose || 0;
    this.maxDose = options.maxDose || 100;
    this.targetEffect = options.targetEffect || null;
    this.maxRisk = options.maxRisk || 0.1; // Max probability of exceeding safety threshold
    this.safetyThreshold = options.safetyThreshold || null;
  }

  // Find dose that achieves target effect with minimum uncertainty
  findOptimalDose() {
    const nPoints = 100;
    const doses = [];
    for (let i = 0; i <= nPoints; i++) {
      doses.push(this.minDose + (this.maxDose - this.minDose) * i / nPoints);
    }

    let bestDose = null;
    let bestScore = -Infinity;

    for (const dose of doses) {
      const pred = this.predictWithUncertainty(dose);

      // Score: effect - penalty for uncertainty - penalty for safety risk
      let score = pred.mean;

      // Penalty for uncertainty (prefer narrower CIs)
      const uncertainty = pred.ci_97_5 - pred.ci_2_5;
      score -= uncertainty * 0.5;

      // Check safety constraint if specified
      if (this.safetyThreshold !== null) {
        const riskProb = this.computeRiskProbability(dose, this.safetyThreshold);
        if (riskProb > this.maxRisk) continue; // Skip doses exceeding risk threshold
        score -= riskProb * 2; // Additional penalty for risk
      }

      // Check target effect if specified
      if (this.targetEffect !== null) {
        const targetDiff = Math.abs(pred.mean - this.targetEffect);
        score -= targetDiff;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDose = dose;
      }
    }

    return {
      optimalDose: bestDose,
      prediction: this.predictWithUncertainty(bestDose),
      score: bestScore,
      riskProbability: this.safetyThreshold ?
        this.computeRiskProbability(bestDose, this.safetyThreshold) : null
    };
  }

  predictWithUncertainty(dose) {
    const effect = this.predictEffect(dose);
    const se = this.predictSE(dose);

    return {
      dose,
      mean: effect,
      se,
      ci_2_5: effect - 1.96 * se,
      ci_97_5: effect + 1.96 * se
    };
  }

  predictEffect(dose) {
    switch (this.model) {
      case 'emax':
        return this.params.e0 + (this.params.emax * dose) / (this.params.ed50 + dose);
      case 'hill':
        return this.params.e0 + (this.params.emax * Math.pow(dose, this.params.hill)) /
               (Math.pow(this.params.ed50, this.params.hill) + Math.pow(dose, this.params.hill));
      case 'linear':
        return this.params.intercept + this.params.slope * dose;
      default:
        return 0;
    }
  }

  predictSE(dose) {
    // Approximate SE using delta method
    const h = 0.001;
    const f0 = this.predictEffect(dose);
    const f1 = this.predictEffect(dose + h);
    const gradient = (f1 - f0) / h;

    // SE increases with dose uncertainty
    const baseSE = this.params.se || 0.1;
    return baseSE * Math.sqrt(1 + gradient * gradient * (this.params.ed50SE || 1) ** 2);
  }

  computeRiskProbability(dose, threshold) {
    const pred = this.predictWithUncertainty(dose);
    // P(effect > threshold) assuming normal distribution
    const z = (threshold - pred.mean) / pred.se;
    return 1 - normalCDF(z);
  }

  // Find minimum effective dose (MED)
  findMED(minEffect) {
    let low = this.minDose;
    let high = this.maxDose;

    while (high - low > 0.1) {
      const mid = (low + high) / 2;
      const pred = this.predictWithUncertainty(mid);

      // MED: lower bound of CI exceeds minEffect
      if (pred.ci_2_5 >= minEffect) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return {
      med: (low + high) / 2,
      prediction: this.predictWithUncertainty((low + high) / 2)
    };
  }
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ----------------------------------------------------------------------------
// 4. DOSE EXTRAPOLATION WITH UNCERTAINTY BOUNDS
// Safely extrapolate beyond observed dose range with appropriate warnings
// ----------------------------------------------------------------------------

class DoseExtrapolator {
  constructor(model, params, observedDoses) {
    this.model = model;
    this.params = params;
    this.minObserved = Math.min(...observedDoses);
    this.maxObserved = Math.max(...observedDoses);
  }

  extrapolate(dose) {
    const isExtrapolation = dose < this.minObserved || dose > this.maxObserved;
    const extrapolationDistance = isExtrapolation ?
      Math.max(0, dose - this.maxObserved, this.minObserved - dose) / (this.maxObserved - this.minObserved) : 0;

    // Base prediction
    let effect = this.predictEffect(dose);
    let se = this.params.se || 0.1;

    // Increase uncertainty for extrapolation (uncertainty grows with distance)
    const uncertaintyMultiplier = 1 + extrapolationDistance * 2;
    se *= uncertaintyMultiplier;

    // For extreme extrapolation, use asymptotic behavior
    if (extrapolationDistance > 1) {
      effect = this.computeAsymptote(dose);
    }

    return {
      dose,
      effect,
      se,
      ci_lower: effect - 1.96 * se,
      ci_upper: effect + 1.96 * se,
      isExtrapolation,
      extrapolationDistance,
      reliability: Math.exp(-extrapolationDistance), // 0-1 reliability score
      warning: this.getWarning(extrapolationDistance)
    };
  }

  predictEffect(dose) {
    switch (this.model) {
      case 'emax':
        return this.params.e0 + (this.params.emax * dose) / (this.params.ed50 + dose);
      case 'hill':
        return this.params.e0 + (this.params.emax * Math.pow(dose, this.params.hill)) /
               (Math.pow(this.params.ed50, this.params.hill) + Math.pow(dose, this.params.hill));
      case 'linear':
        return this.params.intercept + this.params.slope * dose;
      default:
        return 0;
    }
  }

  computeAsymptote(dose) {
    switch (this.model) {
      case 'emax':
      case 'hill':
        // Emax/Hill models have natural asymptote
        return this.params.e0 + this.params.emax;
      case 'linear':
        // Linear extrapolation (with warning)
        return this.predictEffect(dose);
      default:
        return this.predictEffect(this.maxObserved);
    }
  }

  getWarning(distance) {
    if (distance === 0) return null;
    if (distance < 0.25) return 'Minor extrapolation - interpret with caution';
    if (distance < 0.5) return 'Moderate extrapolation - substantial uncertainty';
    if (distance < 1) return 'Major extrapolation - estimates highly uncertain';
    return 'Extreme extrapolation - reliability very low, use asymptotic bounds only';
  }
}

// ----------------------------------------------------------------------------
// 5. NMA POWER ANALYSIS AND SAMPLE SIZE CALCULATOR
// Prospective planning tool for network meta-analyses
// ----------------------------------------------------------------------------

class NMAPowerCalculator {
  constructor(options = {}) {
    this.alpha = options.alpha || 0.05;
    this.power = options.power || 0.8;
    this.tau2 = options.tau2 || 0.1;
    this.networkStructure = options.networkStructure || 'star';
  }

  // Calculate required sample size per arm
  calculateSampleSize(effectSize, withinStudySE) {
    const z_alpha = normalQuantile(1 - this.alpha / 2);
    const z_beta = normalQuantile(this.power);

    // Account for heterogeneity
    const totalVar = withinStudySE * withinStudySE + this.tau2;

    // Sample size formula
    const n = 2 * totalVar * Math.pow(z_alpha + z_beta, 2) / (effectSize * effectSize);

    return {
      perArm: Math.ceil(n),
      total: Math.ceil(n * 2),
      effectSize,
      withinStudySE,
      tau2: this.tau2,
      assumptions: 'Two-arm trial, continuous outcome, equal allocation'
    };
  }

  // Calculate power for given network
  calculateNetworkPower(comparisons, effectSizes, ses, nStudiesPerComparison) {
    const powers = {};

    for (let i = 0; i < comparisons.length; i++) {
      const comp = comparisons[i];
      const effect = effectSizes[i];
      const se = ses[i];
      const k = nStudiesPerComparison[i];

      // Standard error of pooled estimate
      const pooledVar = (se * se + this.tau2) / k;
      const pooledSE = Math.sqrt(pooledVar);

      // Non-centrality parameter
      const ncp = Math.abs(effect) / pooledSE;

      // Power calculation
      const z_alpha = normalQuantile(1 - this.alpha / 2);
      const power = 1 - normalCDF(z_alpha - ncp) + normalCDF(-z_alpha - ncp);

      powers[comp] = {
        effect,
        pooledSE,
        power,
        nStudies: k
      };
    }

    return powers;
  }

  // Suggest optimal network design
  suggestOptimalDesign(treatments, budget, costPerStudy) {
    const maxStudies = Math.floor(budget / costPerStudy);
    const nComparisons = (treatments.length * (treatments.length - 1)) / 2;

    // Different network structures
    const designs = [];

    // Star network (all vs reference)
    const starStudies = treatments.length - 1;
    if (starStudies <= maxStudies) {
      designs.push({
        type: 'Star',
        nStudies: starStudies,
        directComparisons: starStudies,
        indirectOnly: nComparisons - starStudies,
        efficiency: this.computeNetworkEfficiency('star', treatments.length),
        recommendation: starStudies === treatments.length - 1 ?
          'Efficient but relies heavily on indirect evidence' : null
      });
    }

    // Complete network
    if (nComparisons <= maxStudies) {
      designs.push({
        type: 'Complete',
        nStudies: nComparisons,
        directComparisons: nComparisons,
        indirectOnly: 0,
        efficiency: this.computeNetworkEfficiency('complete', treatments.length),
        recommendation: 'Most informative but most expensive'
      });
    }

    // Ladder/chain network
    const ladderStudies = treatments.length - 1;
    designs.push({
      type: 'Ladder',
      nStudies: ladderStudies,
      directComparisons: ladderStudies,
      indirectOnly: nComparisons - ladderStudies,
      efficiency: this.computeNetworkEfficiency('ladder', treatments.length),
      recommendation: 'Minimizes studies but has long indirect paths'
    });

    // Sort by efficiency
    designs.sort((a, b) => b.efficiency - a.efficiency);

    return {
      budget,
      maxStudies,
      treatments: treatments.length,
      possibleComparisons: nComparisons,
      recommendedDesign: designs[0],
      allDesigns: designs
    };
  }

  computeNetworkEfficiency(type, nTreatments) {
    // Efficiency based on average path length and connectivity
    switch (type) {
      case 'complete':
        return 1.0;
      case 'star':
        return 0.7;
      case 'ladder':
        return 0.5;
      default:
        return 0.6;
    }
  }
}

// ----------------------------------------------------------------------------
// 6. GOSH PLOT FOR OUTLIER AND INFLUENCE DETECTION
// Graphical Overview of Study Heterogeneity
// ----------------------------------------------------------------------------

class GOSHAnalysis {
  constructor(studies, options = {}) {
    this.studies = studies;
    this.nSubsets = options.nSubsets || Math.min(1000, Math.pow(2, studies.length));
    this.minSubsetSize = options.minSubsetSize || 2;
  }

  run() {
    const results = [];
    const n = this.studies.length;

    // Generate random subsets
    for (let i = 0; i < this.nSubsets; i++) {
      // Random subset (at least minSubsetSize studies)
      const subset = [];
      const included = [];
      for (let j = 0; j < n; j++) {
        if (getRandom() > 0.5) {
          subset.push(this.studies[j]);
          included.push(j);
        }
      }

      if (subset.length < this.minSubsetSize) continue;

      // Compute meta-analysis for subset
      const ma = this.computeMetaAnalysis(subset);

      results.push({
        included,
        k: subset.length,
        effect: ma.effect,
        I2: ma.I2,
        tau2: ma.tau2,
        Q: ma.Q
      });
    }

    return {
      subsets: results,
      summary: this.summarize(results),
      outlierCandidates: this.identifyOutlierCandidates(results)
    };
  }

  computeMetaAnalysis(studies) {
    let sumW = 0, sumW2 = 0, sumWY = 0, sumWY2 = 0;
    for (const s of studies) {
      const w = 1 / (s.se * s.se);
      sumW += w;
      sumW2 += w * w;
      sumWY += w * s.effect;
      sumWY2 += w * s.effect * s.effect;
    }

    const effect = sumWY / sumW;
    const Q = sumWY2 - (sumWY * sumWY) / sumW;
    const df = studies.length - 1;
    const I2 = df > 0 ? Math.max(0, (Q - df) / Q * 100) : 0;
    const C = sumW - sumW2 / sumW;
    const tau2 = Math.max(0, (Q - df) / C);

    return { effect, Q, I2, tau2 };
  }

  summarize(results) {
    const effects = results.map(r => r.effect);
    const I2s = results.map(r => r.I2);

    return {
      effectRange: [Math.min(...effects), Math.max(...effects)],
      effectMean: mean(effects),
      effectSD: sd(effects),
      I2Range: [Math.min(...I2s), Math.max(...I2s)],
      I2Mean: mean(I2s),
      nSubsets: results.length
    };
  }

  identifyOutlierCandidates(results) {
    // Studies that, when excluded, consistently reduce heterogeneity
    const studyImpact = {};
    const n = this.studies.length;

    for (let i = 0; i < n; i++) {
      studyImpact[i] = { included: [], excluded: [] };
    }

    for (const r of results) {
      for (let i = 0; i < n; i++) {
        if (r.included.includes(i)) {
          studyImpact[i].included.push(r.I2);
        } else {
          studyImpact[i].excluded.push(r.I2);
        }
      }
    }

    const candidates = [];
    for (let i = 0; i < n; i++) {
      const impact = studyImpact[i];
      if (impact.included.length > 10 && impact.excluded.length > 10) {
        const meanIncluded = mean(impact.included);
        const meanExcluded = mean(impact.excluded);
        const difference = meanIncluded - meanExcluded;

        if (difference > 10) { // I2 increases by >10% when included
          candidates.push({
            study: this.studies[i].study,
            index: i,
            I2WhenIncluded: meanIncluded,
            I2WhenExcluded: meanExcluded,
            impact: difference
          });
        }
      }
    }

    return candidates.sort((a, b) => b.impact - a.impact);
  }

  // Prepare data for GOSH plot visualization
  getPlotData() {
    const results = this.run();
    return results.subsets.map(r => ({
      x: r.effect,
      y: r.I2,
      k: r.k
    }));
  }
}

// ----------------------------------------------------------------------------
// 7. COMPONENT NMA FOR COMPLEX INTERVENTIONS
// Decompose multi-component interventions into additive effects
// ----------------------------------------------------------------------------

class ComponentNMA {
  constructor(studies, components) {
    this.studies = studies;
    this.components = components; // e.g., ['counseling', 'medication', 'exercise']
    this.designMatrix = this.buildDesignMatrix();
  }

  buildDesignMatrix() {
    // Each treatment is a combination of components
    // Design matrix encodes which components are present
    const matrix = [];
    const treatmentComponents = {};

    for (const study of this.studies) {
      // Parse treatment into components (assumed format: "comp1+comp2+comp3")
      const comps = study.treatment.split('+').map(c => c.trim().toLowerCase());
      treatmentComponents[study.treatment] = comps;

      const row = this.components.map(c => comps.includes(c.toLowerCase()) ? 1 : 0);
      matrix.push({
        study: study.study,
        treatment: study.treatment,
        effect: study.effect,
        se: study.se,
        components: row
      });
    }

    return matrix;
  }

  // Estimate component effects using weighted least squares
  estimateComponentEffects() {
    const n = this.designMatrix.length;
    const p = this.components.length;

    // Build X matrix (design) and y vector (effects)
    const X = this.designMatrix.map(r => r.components);
    const y = this.designMatrix.map(r => r.effect);
    const W = this.designMatrix.map(r => 1 / (r.se * r.se));

    // Weighted least squares: (X'WX)^-1 X'Wy
    const XtWX = this.matrixMultiply(this.transpose(X), this.diagMultiply(W, X));
    const XtWy = this.matrixVectorMultiply(this.transpose(X), this.elementMultiply(W, y));

    // Solve using Gaussian elimination
    const beta = this.solve(XtWX, XtWy);

    // Compute standard errors
    const XtWXinv = this.inverse(XtWX);
    const se = XtWXinv.map((row, i) => Math.sqrt(row[i]));

    return this.components.map((comp, i) => ({
      component: comp,
      effect: beta[i],
      se: se[i],
      ci_lower: beta[i] - 1.96 * se[i],
      ci_upper: beta[i] + 1.96 * se[i],
      pValue: 2 * (1 - normalCDF(Math.abs(beta[i] / se[i])))
    }));
  }

  // Predict effect of new component combinations
  predictCombination(componentsPresent) {
    const effects = this.estimateComponentEffects();
    let total = 0;
    let totalVar = 0;

    for (let i = 0; i < this.components.length; i++) {
      if (componentsPresent.includes(this.components[i].toLowerCase())) {
        total += effects[i].effect;
        totalVar += effects[i].se * effects[i].se;
      }
    }

    const se = Math.sqrt(totalVar);
    return {
      components: componentsPresent,
      effect: total,
      se,
      ci_lower: total - 1.96 * se,
      ci_upper: total + 1.96 * se
    };
  }

  // Matrix operations (simple implementations)
  transpose(M) {
    return M[0].map((_, i) => M.map(row => row[i]));
  }

  diagMultiply(d, M) {
    return M.map((row, i) => row.map(x => x * d[i]));
  }

  matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < B.length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  matrixVectorMultiply(M, v) {
    return M.map(row => row.reduce((sum, x, i) => sum + x * v[i], 0));
  }

  elementMultiply(a, b) {
    return a.map((x, i) => x * b[i]);
  }

  solve(A, b) {
    // Gaussian elimination with partial pivoting
    const n = A.length;
    const aug = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
      }
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      // Eliminate
      for (let k = i + 1; k < n; k++) {
        const factor = aug[k][i] / aug[i][i];
        for (let j = i; j <= n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= aug[i][j] * x[j];
      }
      x[i] /= aug[i][i];
    }

    return x;
  }

  inverse(A) {
    const n = A.length;
    const result = A.map(row => [...row]);
    const I = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? 1 : 0)
    );

    // Augment with identity
    const aug = result.map((row, i) => [...row, ...I[i]]);

    // Gaussian elimination
    for (let i = 0; i < n; i++) {
      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k][i];
          for (let j = 0; j < 2 * n; j++) {
            aug[k][j] -= factor * aug[i][j];
          }
        }
      }
    }

    return aug.map(row => row.slice(n));
  }
}

// ----------------------------------------------------------------------------
// 8. LIVING REVIEW AUTO-UPDATE SIMULATION
// Simulate how results change as new studies are added
// ----------------------------------------------------------------------------

class LivingReviewSimulator {
  constructor(currentStudies, options = {}) {
    this.studies = currentStudies;
    this.futureStudyRate = options.studiesPerYear || 2;
    this.simulationYears = options.years || 5;
    this.expectedEffectChange = options.expectedEffectChange || 0;
    this.expectedHeterogeneity = options.expectedHeterogeneity || 0.1;
  }

  // Simulate adding new studies over time
  simulate(nSimulations = 100) {
    const trajectories = [];

    for (let sim = 0; sim < nSimulations; sim++) {
      const trajectory = [];
      let currentStudies = [...this.studies];

      // Initial state
      trajectory.push({
        year: 0,
        nStudies: currentStudies.length,
        ...this.computeMetaAnalysis(currentStudies)
      });

      // Add studies year by year
      for (let year = 1; year <= this.simulationYears; year++) {
        const nNew = Math.round(this.futureStudyRate + normalRandom() * 0.5);

        for (let i = 0; i < nNew; i++) {
          const newStudy = this.generateNewStudy(currentStudies, year);
          currentStudies.push(newStudy);
        }

        trajectory.push({
          year,
          nStudies: currentStudies.length,
          ...this.computeMetaAnalysis(currentStudies)
        });
      }

      trajectories.push(trajectory);
    }

    return {
      trajectories,
      summary: this.summarizeTrajectories(trajectories)
    };
  }

  generateNewStudy(existingStudies, year) {
    const avgEffect = mean(existingStudies.map(s => s.effect));
    const avgSE = mean(existingStudies.map(s => s.se));

    // New study effect with drift
    const drift = this.expectedEffectChange * year;
    const effect = avgEffect + drift + normalRandom() * Math.sqrt(this.expectedHeterogeneity);

    // SE varies around average
    const se = avgSE * (0.8 + getRandom() * 0.4);

    return {
      study: `Future_${year}_${Math.floor(getRandom() * 1000)}`,
      effect,
      se,
      treatment: existingStudies[0].treatment,
      dose: existingStudies[0].dose,
      simulated: true
    };
  }

  computeMetaAnalysis(studies) {
    let sumW = 0, sumW2 = 0, sumWY = 0, sumWY2 = 0;
    for (const s of studies) {
      const w = 1 / (s.se * s.se);
      sumW += w;
      sumW2 += w * w;
      sumWY += w * s.effect;
      sumWY2 += w * s.effect * s.effect;
    }

    const effect = sumWY / sumW;
    const se = 1 / Math.sqrt(sumW);
    const Q = sumWY2 - (sumWY * sumWY) / sumW;
    const df = studies.length - 1;
    const I2 = df > 0 ? Math.max(0, (Q - df) / Q * 100) : 0;

    return {
      effect,
      se,
      ci_lower: effect - 1.96 * se,
      ci_upper: effect + 1.96 * se,
      I2,
      Q
    };
  }

  summarizeTrajectories(trajectories) {
    const years = trajectories[0].length;
    const summary = [];

    for (let y = 0; y < years; y++) {
      const effects = trajectories.map(t => t[y].effect);
      const I2s = trajectories.map(t => t[y].I2);
      const ciWidths = trajectories.map(t => t[y].ci_upper - t[y].ci_lower);

      summary.push({
        year: y,
        effectMean: mean(effects),
        effectSD: sd(effects),
        effect_2_5: percentile(effects, 2.5),
        effect_97_5: percentile(effects, 97.5),
        I2Mean: mean(I2s),
        ciWidthMean: mean(ciWidths),
        ciWidthReduction: y > 0 ? 1 - mean(ciWidths) / summary[0].ciWidthMean : 0,
        nStudies: trajectories[0][y].nStudies
      });
    }

    return summary;
  }

  // Estimate when conclusions might change
  estimateStabilityPoint(threshold = 0.1) {
    const simulation = this.simulate(200);
    const summary = simulation.summary;

    // Find year where CI width reduction plateaus
    for (let y = 1; y < summary.length; y++) {
      if (summary[y].ciWidthReduction > 0.5) {
        return {
          year: y,
          nStudiesNeeded: summary[y].nStudies,
          expectedCIWidth: summary[y].ciWidthMean,
          message: `Evidence likely stable after ~${summary[y].nStudies} studies`
        };
      }
    }

    return {
      year: this.simulationYears,
      nStudiesNeeded: summary[summary.length - 1].nStudies,
      message: 'More studies needed to reach stability'
    };
  }
}

// ----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------------------------------

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sd(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
}

function euclideanDist(a, b) {
  return Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0));
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(getRandom() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
