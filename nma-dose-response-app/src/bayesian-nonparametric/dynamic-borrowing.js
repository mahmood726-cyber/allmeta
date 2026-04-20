/**
 * NMA Dose Response Studio - Nonparametric Dynamic Borrowing
 *
 * Method: Dynamic borrowing of information across subgroups in meta-analysis
 * Reference: Biometrics (2024)
 * Title: "Nonparametric dynamic borrowing for subgroup analysis in meta-analysis"
 * DOI: 10.1111/biom.14234
 *
 * Description:
 * When performing subgroup analysis in meta-analysis, a key question is how much
 * to borrow information across subgroups. Fixed effects assume no borrowing (separate
 * estimates), while random effects assume complete borrowing (partial pooling).
 * Dynamic borrowing adaptively determines the degree of borrowing based on the
 * similarity between subgroups using a nonparametric Dirichlet process mixture model.
 *
 * Key Features:
 * - Nonparametric Bayesian approach using Dirichlet Process (DP) prior
 * - Automatic determination of borrowing strength from data
 * - Handles multiple subgroups with different effect sizes
 * - Partial pooling that adapts to subgroup heterogeneity
 * - Posterior probability of sharing information across subgroups
 * - Handles subgroups with small sample sizes
 *
 * The DP mixture model allows for:
 * - Clustering of subgroups: similar subgroups share cluster parameters
 * - Adaptive borrowing: more borrowing for similar subgroups, less for different ones
 * - Automatic discovery: number of clusters determined from data
 *
 * Applications:
 * - Subgroup analysis with heterogeneous effects
 * - Geographic variation in treatment effects
 * - Dose-response meta-analysis across studies
 * - Cross-study extrapolation with uncertainty quantification
 */

/**
 * Nonparametric Dynamic Borrowing for Subgroup Analysis
 * @param {Array<Object>} data - Array of subgroup data
 *   Each object: { subgroup: string, effects: Array<number>, variances: Array<number> }
 * @param {Object} options - Configuration options
 * @param {number} options.alpha - DP concentration parameter (default: 1)
 * @param {number} options.sigma0 - Prior SD for base measure (default: 1)
 * @param {number} options.mu0 - Prior mean for base measure (default: 0)
 * @param {number} options.burnIn - MCMC burn-in iterations (default: 2000)
 * @param {number} options.iterations - MCMC sampling iterations (default: 5000)
 * @param {number} options.thin - Thinning interval (default: 5)
 * @param {boolean} options.verbose - Print progress (default: false)
 * @returns {Object} Dynamic borrowing results
 */
export function NonparametricDynamicBorrowing(data, options = {}) {
  const {
    alpha = 1,
    sigma0 = 1,
    mu0 = 0,
    burnIn = 2000,
    iterations = 5000,
    thin = 5,
    verbose = false
  } = options;

  // Validate input
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('At least 2 subgroups required for dynamic borrowing');
  }

  // Extract subgroup information
  const subgroups = data.map(d => d.subgroup || `Group ${data.indexOf(d)}`);
  const nSubgroups = subgroups.length;

  // Compute initial estimates for each subgroup
  const initialEstimates = data.map(d => {
    const effects = d.effects || [];
    const variances = d.variances || [];

    if (effects.length === 0) {
      return { mean: mu0, se: sigma0, n: 0 };
    }

    // Fixed effect meta-analysis within subgroup
    const weights = variances.map(v => 1 / v);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const mean = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    return { mean, se, n: effects.length };
  });

  // Initialize cluster assignments (each subgroup starts in its own cluster)
  let clusterAssignments = new Array(nSubgroups).fill(0).map((_, i) => i);
  let nClusters = nSubgroups;

  // Initialize cluster parameters
  let clusterMeans = initialEstimates.map(e => e.mean);
  let clusterVars = initialEstimates.map(e => e.se * e.se);

  // MCMC storage
  const nSamples = Math.floor((iterations - burnIn) / thin);
  const clusterSamples = [];
  const meanSamples = [];
  const borrowingSamples = [];

  // MCMC sampling
  for (let iter = 0; iter < iterations; iter++) {
    // Step 1: Update cluster assignments using Chinese Restaurant Process
    const newAssignments = updateClusterAssignments(
      initialEstimates,
      clusterAssignments,
      clusterMeans,
      clusterVars,
      alpha
    );

    // Step 2: Update cluster parameters
    const result = updateClusterParameters(
      initialEstimates,
      newAssignments,
      mu0,
      sigma0
    );

    clusterMeans = result.means;
    clusterVars = result.vars;
    nClusters = result.nClusters;
    clusterAssignments = newAssignments;

    // Step 3: Compute borrowing weights
    const borrowingWeights = computeBorrowingWeights(
      initialEstimates,
      clusterAssignments,
      clusterMeans,
      clusterVars
    );

    // Store samples after burn-in
    if (iter >= burnIn && (iter - burnIn) % thin === 0) {
      clusterSamples.push([...clusterAssignments]);
      meanSamples.push([...clusterMeans]);
      borrowingSamples.push(borrowingWeights.map(w => [...w]));
    }

    // Print progress
    if (verbose && iter % 500 === 0) {
      console.log(`Iteration ${iter}/${iterations}, nClusters: ${nClusters}`);
    }
  }

  // Compute posterior summaries
  const posteriorSummary = computePosteriorSummary(
    clusterSamples,
    meanSamples,
    borrowingSamples,
    nSubgroups
  );

  // Compute borrowing matrix
  const borrowingMatrix = computeBorrowingMatrix(borrowingSamples, subgroups);

  // Compute cluster probabilities
  const clusterProbabilities = computeClusterProbabilities(clusterSamples, nSubgroups);

  // Optimal clustering (maximum a posteriori)
  const optimalClustering = findOptimalClustering(clusterSamples);

  // Estimate pooled effects for each subgroup
  const pooledEffects = estimatePooledEffects(
    data,
    borrowingSamples,
    clusterSamples,
    initialEstimates
  );

  return {
    subgroups: subgroups,
    pooledEffects: pooledEffects,
    clustering: {
      optimal: optimalClustering,
      nClusters: Math.max(...optimalClustering) + 1,
      probabilities: clusterProbabilities
    },
    borrowingMatrix: borrowingMatrix,
    posteriorSummary: posteriorSummary,

    // Borrowing statistics
    borrowingStatistics: {
      meanBorrowing: borrowingMatrix.mean.map(b => ({
        from: subgroups[borrowingMatrix.mean.indexOf(b)],
        amount: b
      })),
      totalBorrowing: borrowingMatrix.mean.reduce((a, b) => a + Math.abs(b), 0)
    },

    // MCMC diagnostics
    mcmcDiagnostics: {
      nSamples: nSamples,
      burnIn: burnIn,
      thin: thin
    },

    method: 'Nonparametric Dynamic Borrowing',
    reference: 'Biometrics (2024)',
    doi: '10.1111/biom.14234',
    notes: `${Math.max(...optimalClustering) + 1} clusters identified`
  };
}

/**
 * Update cluster assignments using Chinese Restaurant Process
 * @private
 */
function updateClusterAssignments(estimates, currentAssignments, clusterMeans,
                                   clusterVars, alpha) {
  const n = estimates.length;
  const newAssignments = [...currentAssignments];

  for (let i = 0; i < n; i++) {
    // Remove current assignment
    const currentCluster = newAssignments[i];
    const clusterCounts = new Array(n).fill(0);
    newAssignments.forEach((c, j) => {
      if (j !== i) clusterCounts[c]++;
    });

    // Compute log probabilities for each existing cluster
    const logProbs = [];
    const existingClusters = new Set(newAssignments.filter((c, j) => j !== i));

    existingClusters.forEach(c => {
      const count = clusterCounts[c];
      const ll = normalLogPDF(estimates[i].mean, clusterMeans[c],
                               estimates[i].se * estimates[i].se + clusterVars[c]);
      logProbs.push(Math.log(count) + ll);
    });

    // Add probability for new cluster
    const llNew = normalLogPDF(estimates[i].mean, 0,
                               estimates[i].se * estimates[i].se + 1);
    logProbs.push(Math.log(alpha) + llNew);

    // Normalize and sample
    const maxLog = Math.max(...logProbs);
    const probs = logProbs.map(l => Math.exp(l - maxLog));
    const sumProbs = probs.reduce((a, b) => a + b, 0);
    const normProbs = probs.map(p => p / sumProbs);

    let r = Math.random();
    let newCluster = 0;
    for (let c = 0; c < normProbs.length; c++) {
      r -= normProbs[c];
      if (r < 0) {
        newCluster = c < existingClusters.size ?
          Array.from(existingClusters)[c] :
          Math.max(...newAssignments) + 1;
        break;
      }
    }

    newAssignments[i] = newCluster;
  }

  return newAssignments;
}

/**
 * Update cluster parameters
 * @private
 */
function updateClusterParameters(estimates, assignments, mu0, sigma0) {
  const nClusters = Math.max(...assignments) + 1;
  const means = [];
  const vars = [];

  for (let c = 0; c < nClusters; c++) {
    const indices = assignments.map((a, i) => a === c ? i : -1).filter(i => i >= 0);

    if (indices.length === 0) {
      // Empty cluster
      means.push(mu0);
      vars.push(sigma0 * sigma0);
      continue;
    }

    // Posterior update for normal mean
    const clusterEstimates = indices.map(i => estimates[i]);
    const totalVar = clusterEstimates.reduce((s, e) => s + e.se * e.se, 0);
    const weightedMean = clusterEstimates.reduce((s, e) =>
      s + e.mean / (e.se * e.se), 0) / (1 / totalVar);

    const priorPrec = 1 / (sigma0 * sigma0);
    const dataPrec = 1 / totalVar;

    const postMean = (priorPrec * mu0 + dataPrec * weightedMean) / (priorPrec + dataPrec);
    const postVar = 1 / (priorPrec + dataPrec);

    means.push(postMean);
    vars.push(Math.max(postVar, 0.01));
  }

  return {
    means: means,
    vars: vars,
    nClusters: nClusters
  };
}

/**
 * Compute borrowing weights
 * @private
 */
function computeBorrowingWeights(estimates, assignments, clusterMeans, clusterVars) {
  const n = estimates.length;
  const weights = new Array(n).fill(null).map(() => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];
    let totalWeight = 0;

    for (let j = 0; j < n; j++) {
      if (assignments[j] === myCluster) {
        // Borrow from studies in same cluster
        const similarity = Math.exp(-0.5 * Math.pow(estimates[i].mean - estimates[j].mean, 2) /
                                    (estimates[i].se * estimates[i].se + estimates[j].se * estimates[j].se));
        weights[i][j] = similarity;
        totalWeight += similarity;
      }
    }

    // Self-weight is higher
    weights[i][i] = Math.max(weights[i][i], 1);

    // Normalize
    if (totalWeight > 0) {
      weights[i] = weights[i].map(w => w / totalWeight);
    }
  }

  return weights;
}

/**
 * Compute posterior summary
 * @private
 */
function computePosteriorSummary(clusterSamples, meanSamples, borrowingSamples, nSubgroups) {
  const nSamples = clusterSamples.length;

  // Mode of number of clusters
  const nClusters = clusterSamples.map(c => Math.max(...c) + 1);
  const freq = {};
  nClusters.forEach(k => freq[k] = (freq[k] || 0) + 1);
  const modeClusters = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);

  // Mean borrowing for each subgroup
  const meanBorrowing = new Array(nSubgroups).fill(0);
  borrowingSamples.forEach(borrowing => {
    borrowing.forEach((row, i) => {
      row.forEach((w, j) => {
        if (i !== j) meanBorrowing[i] += w;
      });
    });
  });
  meanBorrowing.forEach((b, i) => meanBorrowing[i] /= nSamples);

  return {
    modeClusters: modeClusters,
    meanClusters: nClusters.reduce((a, b) => a + b, 0) / nSamples,
    meanBorrowing: meanBorrowing
  };
}

/**
 * Compute borrowing matrix
 * @private
 */
function computeBorrowingMatrix(borrowingSamples, subgroups) {
  const n = subgroups.length;
  const mean = new Array(n).fill(null).map(() => new Array(n).fill(0));

  borrowingSamples.forEach(borrowing => {
    borrowing.forEach((row, i) => {
      row.forEach((w, j) => {
        mean[i][j] += w;
      });
    });
  });

  // Normalize
  const nSamples = borrowingSamples.length;
  mean.forEach((row, i) => {
    mean[i] = row.map(w => w / nSamples);
  });

  return {
    mean: mean,
    subgroups: subgroups
  };
}

/**
 * Compute cluster probabilities
 * @private
 */
function computeClusterProbabilities(clusterSamples, nSubgroups) {
  const nSamples = clusterSamples.length;
  const maxClusters = Math.max(...clusterSamples.map(c => Math.max(...c))) + 1;

  const probs = new Array(nSubgroups).fill(null).map(() => new Array(maxClusters).fill(0));

  clusterSamples.forEach(clusters => {
    clusters.forEach((c, i) => {
      probs[i][c]++;
    });
  });

  // Normalize
  for (let i = 0; i < nSubgroups; i++) {
    const rowSum = probs[i].reduce((a, b) => a + b, 0);
    probs[i] = probs[i].map(p => p / rowSum);
  }

  return probs;
}

/**
 * Find optimal clustering (MAP)
 * @private
 */
function findOptimalClustering(clusterSamples) {
  const freq = {};

  clusterSamples.forEach(clusters => {
    const key = clusters.join(',');
    freq[key] = (freq[key] || 0) + 1;
  });

  const bestKey = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  return bestKey.split(',').map(Number);
}

/**
 * Estimate pooled effects for each subgroup
 * @private
 */
function estimatePooledEffects(data, borrowingSamples, clusterSamples, initialEstimates) {
  const nSubgroups = data.length;
  const pooled = [];

  for (let i = 0; i < nSubgroups; i++) {
    // Compute weighted average using borrowing weights
    let totalEffect = 0;
    let totalWeight = 0;

    borrowingSamples.forEach((borrowing, s) => {
      const clusters = clusterSamples[s];

      borrowing[i].forEach((w, j) => {
        totalEffect += w * initialEstimates[j].mean;
        totalWeight += w;
      });
    });

    const nSamples = borrowingSamples.length;
    const meanEffect = totalEffect / nSamples / (totalWeight / nSamples);

    // Compute SE using bootstrap
    const bootstrapEffects = [];

    for (let s = 0; s < Math.min(1000, borrowingSamples.length); s++) {
      let effect = 0;
      let weight = 0;
      borrowingSamples[s][i].forEach((w, j) => {
        effect += w * initialEstimates[j].mean;
        weight += w;
      });
      bootstrapEffects.push(effect / weight);
    }

    const se = Math.sqrt(bootstrapEffects.reduce((s, e) =>
      s + Math.pow(e - meanEffect, 2), 0) / bootstrapEffects.length);

    pooled.push({
      subgroup: data[i].subgroup || `Group ${i}`,
      effect: meanEffect,
      se: se,
      ci: {
        lower: meanEffect - 1.96 * se,
        upper: meanEffect + 1.96 * se
      }
    });
  }

  return pooled;
}

/**
 * Normal log PDF
 * @private
 */
function normalLogPDF(x, mean, variance) {
  return -0.5 * Math.log(2 * Math.PI * variance) -
         0.5 * Math.pow(x - mean, 2) / variance;
}

export default NonparametricDynamicBorrowing;
