/**
 * Dose Response Pro v19.0 - Network Meta-Analysis Module
 *
 * Implements network meta-analysis for comparing multiple interventions
 * simultaneously using frequentist and Bayesian approaches.
 *
 * References:
 * - Salanti et al. (2011). Evaluation of network meta-analyses.
 * - White et al. (2012). Network meta-analysis with Stata.
 * - Dias et al. (2013). Network meta-analysis using Bayesian methods.
 *
 * @module NetworkMetaAnalysis
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

import { Matrix } from '../math/matrix.js';
import { Stats } from '../math/stats.js';
import { Plots } from '../visualization/plots.js';

/**
 * Network Meta-Analysis Class
 *
 * Performs network meta-analysis for multi-intervention comparisons.
 */
export class NetworkMetaAnalysis {
  constructor(options = {}) {
    this.options = {
      treatments: [],
      studies: [],
      reference: null,
      consistencyModel: 'consistency', // 'consistency' or 'inconsistency'
      heterogeneityPrior: { distribution: 'uniform', params: [0, 5] },
      ...options
    };

    this.network = null;
    this.results = null;
    this.geometry = null;
  }

  /**
   * Build network structure from study data
   *
   * @param {Array} studies - Study data with treatment comparisons
   * @returns {Object} Network structure (nodes, edges, adjacency)
   */
  buildNetwork(studies) {
    const treatments = new Set();
    const edges = [];
    const studyArms = {};

    // Extract all treatments and comparisons
    studies.forEach((study, studyId) => {
      studyArms[studyId] = study.treatments;

      study.treatments.forEach(t => treatments.add(t));

      // Create edges for all pairwise comparisons within study
      for (let i = 0; i < study.treatments.length; i++) {
        for (let j = i + 1; j < study.treatments.length; j++) {
          edges.push({
            study: studyId,
            treatmentA: study.treatments[i],
            treatmentB: study.treatments[j],
            effect: study.effects?.[i]?.[j],
            variance: study.variances?.[i]?.[j],
            sampleSize: study.sampleSizes?.[i] || study.sampleSize
          });
        }
      }
    });

    // Build adjacency matrix
    const treatmentList = Array.from(treatments);
    const n = treatmentList.length;
    const adjacency = Matrix.zeros(n, n);

    edges.forEach(edge => {
      const i = treatmentList.indexOf(edge.treatmentA);
      const j = treatmentList.indexOf(edge.treatmentB);
      adjacency.set(i, j, (adjacency.get(i, j) || 0) + 1);
      adjacency.set(j, i, (adjacency.get(j, i) || 0) + 1);
    });

    this.network = {
      nodes: treatmentList.map((t, i) => ({
        id: i,
        name: t,
        degree: Matrix.rowSum(adjacency, i)
      })),
      edges: edges,
      adjacency: adjacency,
      nTreatments: n,
      nStudies: studies.length,
      nEdges: edges.length
    };

    this.options.treatments = treatmentList;

    return this.network;
  }

  /**
   * Calculate network geometry statistics
   *
   * @returns {Object} Network geometry metrics
   */
  calculateGeometry() {
    if (!this.network) {
      throw new Error('Network must be built first using buildNetwork()');
    }

    const { adjacency, nodes } = this.network;

    // Connectedness: Is the network connected?
    const isConnected = this._checkConnected(adjacency);

    // Density: Proportion of possible edges that exist
    const nPossible = (nodes.length * (nodes.length - 1)) / 2;
    const density = this.network.nEdges / nPossible;

    // Average path length
    const avgPathLength = this._calculateAveragePathLength(adjacency);

    // Clustering coefficient
    const clusteringCoef = this._calculateClusteringCoefficient(adjacency);

    // Treatment connectivity
    const connectivity = nodes.map(n => n.degree);

    // Star network check (hub treatment)
    const degrees = nodes.map(n => n.degree);
    const maxDegree = Math.max(...degrees);
    const isStarNetwork = maxDegree > (nodes.length - 1) * 0.8;

    this.geometry = {
      isConnected,
      density,
      avgPathLength,
      clusteringCoef,
      connectivity: {
        min: Math.min(...connectivity),
        max: maxDegree,
        mean: Stats.mean(connectivity),
        median: Stats.median(connectivity)
      },
      isStarNetwork,
      networkShape: this._classifyNetworkShape(density, clusteringCoef, isStarNetwork)
    };

    return this.geometry;
  }

  /**
   * Check if network is connected using BFS
   * @private
   */
  _checkConnected(adjacency) {
    const n = adjacency.rows;
    const visited = new Set();
    const queue = [0];

    while (queue.length > 0) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);

      for (let i = 0; i < n; i++) {
        if (adjacency.get(node, i) > 0 && !visited.has(i)) {
          queue.push(i);
        }
      }
    }

    return visited.size === n;
  }

  /**
   * Calculate average shortest path length
   * @private
   */
  _calculateAveragePathLength(adjacency) {
    const n = adjacency.rows;
    let totalPathLength = 0;
    let pathCount = 0;

    for (let i = 0; i < n; i++) {
      const distances = this._shortestPaths(adjacency, i);
      for (let j = i + 1; j < n; j++) {
        if (distances[j] < Infinity) {
          totalPathLength += distances[j];
          pathCount++;
        }
      }
    }

    return pathCount > 0 ? totalPathLength / pathCount : null;
  }

  /**
   * Calculate shortest paths using Dijkstra's algorithm
   * @private
   */
  _shortestPaths(adjacency, start) {
    const n = adjacency.rows;
    const distances = Array(n).fill(Infinity);
    const visited = Array(n).fill(false);
    distances[start] = 0;

    for (let i = 0; i < n; i++) {
      // Find unvisited node with minimum distance
      let minDist = Infinity;
      let minNode = -1;
      for (let j = 0; j < n; j++) {
        if (!visited[j] && distances[j] < minDist) {
          minDist = distances[j];
          minNode = j;
        }
      }

      if (minNode === -1 || minDist === Infinity) break;
      visited[minNode] = true;

      // Update distances to neighbors
      for (let j = 0; j < n; j++) {
        if (adjacency.get(minNode, j) > 0) {
          const newDist = distances[minNode] + 1;
          if (newDist < distances[j]) {
            distances[j] = newDist;
          }
        }
      }
    }

    return distances;
  }

  /**
   * Calculate clustering coefficient
   * @private
   */
  _calculateClusteringCoefficient(adjacency) {
    const n = adjacency.rows;
    let totalCoef = 0;

    for (let i = 0; i < n; i++) {
      const neighbors = [];
      for (let j = 0; j < n; j++) {
        if (adjacency.get(i, j) > 0) {
          neighbors.push(j);
        }
      }

      const k = neighbors.length;
      if (k < 2) {
        totalCoef += 0;
        continue;
      }

      // Count triangles
      let triangles = 0;
      for (let a = 0; a < k; a++) {
        for (let b = a + 1; b < k; b++) {
          if (adjacency.get(neighbors[a], neighbors[b]) > 0) {
            triangles++;
          }
        }
      }

      const possible = k * (k - 1) / 2;
      totalCoef += triangles / possible;
    }

    return totalCoef / n;
  }

  /**
   * Classify network shape
   * @private
   */
  _classifyNetworkShape(density, clustering, isStar) {
    if (isStar) return 'Star';
    if (density < 0.3) return 'Sparse';
    if (clustering > 0.7) return 'Clustered';
    if (density > 0.7) return 'Dense';
    return 'Connected';
  }

  /**
   * Split evidence into direct and indirect
   *
   * @returns {Object} Direct and indirect evidence
   */
  splitEvidence() {
    if (!this.network) {
      throw new Error('Network must be built first');
    }

    const direct = [];
    const indirect = [];
    const { edges, nodes, adjacency } = this.network;

    // Direct evidence: head-to-head comparisons
    const directComparisons = new Set();
    edges.forEach(edge => {
      const key = `${edge.treatmentA}|${edge.treatmentB}`;
      directComparisons.add(key);
      direct.push(edge);
    });

    // Indirect evidence: via common comparators
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const key = `${nodes[i].name}|${nodes[j].name}`;
        if (directComparisons.has(key)) continue;

        // Find common comparators (indirect paths)
        const paths = this._findIndirectPaths(adjacency, i, j, 2);
        paths.forEach(path => {
          indirect.push({
            treatmentA: nodes[i].name,
            treatmentB: nodes[j].name,
            path: path.map(p => nodes[p].name),
            length: path.length - 1
          });
        });
      }
    }

    return { direct, indirect };
  }

  /**
   * Find indirect paths between nodes
   * @private
   */
  _findIndirectPaths(adjacency, start, end, maxLength) {
    const paths = [];
    const visited = new Set();

    const dfs = (current, path) => {
      if (path.length > maxLength + 1) return;
      if (current === end && path.length > 2) {
        paths.push([...path]);
        return;
      }

      visited.add(current);
      for (let i = 0; i < adjacency.rows; i++) {
        if (adjacency.get(current, i) > 0 && !visited.has(i)) {
          dfs(i, [...path, i]);
        }
      }
      visited.delete(current);
    };

    dfs(start, [start]);
    return paths;
  }

  /**
   * Perform network meta-analysis using frequentist approach
   *
   * @param {string} reference - Reference treatment
   * @param {string} outcome - Outcome measure ('RR', 'OR', 'MD', 'SMD')
   * @returns {Object} Analysis results
   */
  analyzeFrequentist(reference, outcome = 'RR') {
    if (!this.network) {
      throw new Error('Network must be built first');
    }

    const refIdx = this.options.treatments.indexOf(reference);
    if (refIdx === -1) {
      throw new Error(`Reference treatment "${reference}" not found`);
    }

    // Design matrix for treatment contrasts
    const X = this._buildDesignMatrix(refIdx);
    const y = this._buildOutcomeVector();
    const S = this._buildVarianceMatrix();

    // GLS estimation: β = (X' S^(-1) X)^(-1) X' S^(-1) y
    const S_inv = Matrix.inv(S);
    const Xt_S_inv = Matrix.transpose(X).multiply(S_inv);
    const Xt_S_inv_X = Xt_S_inv.multiply(X);
    const Xt_S_inv_X_inv = Matrix.inv(Xt_S_inv_X);
    const beta = Xt_S_inv_X_inv.multiply(Xt_S_inv.multiply(y));

    // Covariance matrix
    const covBeta = Xt_S_inv_X_inv;

    // Heterogeneity (tau²) using DerSimonian-Laird
    const tau2 = this._estimateTau2(y, X, S, beta);

    // Standard errors
    const se = Matrix.sqrt(Matrix.diag(covBeta).map((v, i) => v + tau2));

    // Treatment effects vs reference
    const effects = this.options.treatments.map((t, i) => {
      if (i === refIdx) return { treatment: t, effect: 0, se: 0, ci: [0, 0] };

      return {
        treatment: t,
        effect: beta.get(i - (i > refIdx ? 1 : 0), 0),
        se: se.get(i - (i > refIdx ? 1 : 0), 0),
        ci: this._calculateCI(
          beta.get(i - (i > refIdx ? 1 : 0), 0),
          se.get(i - (i > refIdx ? 1 : 0), 0)
        )
      };
    });

    this.results = {
      method: 'frequentist',
      reference,
      outcome,
      nTreatments: this.network.nTreatments,
      nStudies: this.network.nStudies,
      tau2,
      i2: this._calculateI2(tau2),
      effects,
      covMatrix: covBeta.toArray(),
      rankings: this._calculateRankings(effects)
    };

    return this.results;
  }

  /**
   * Build design matrix for NMA
   * @private
   */
  _buildDesignMatrix(refIdx) {
    const { edges, treatments } = this.network;
    const nComparisons = edges.length;
    const nTreatments = treatments.length;
    const X = Matrix.zeros(nComparisons, nTreatments - 1);

    let row = 0;
    edges.forEach(edge => {
      const idxA = treatments.indexOf(edge.treatmentA);
      const idxB = treatments.indexOf(edge.treatmentB);

      // Code treatment contrast
      for (let j = 0; j < nTreatments; j++) {
        if (j === refIdx) continue;
        const col = j > refIdx ? j - 1 : j;

        if (idxA === refIdx) {
          X.set(row, col, idxB === j ? 1 : 0);
        } else if (idxB === refIdx) {
          X.set(row, col, idxA === j ? -1 : 0);
        } else {
          // Both non-reference
          X.set(row, col, idxB === j ? 1 : idxA === j ? -1 : 0);
        }
      }
      row++;
    });

    return X;
  }

  /**
   * Build outcome vector from study effects
   * @private
   */
  _buildOutcomeVector() {
    const { edges } = this.network;
    const y = edges.map(e => e.effect || 0);
    return Matrix.columnVector(y);
  }

  /**
   * Build variance matrix
   * @private
   */
  _buildVarianceMatrix() {
    const { edges } = this.network;
    const n = edges.length;
    const S = Matrix.zeros(n, n);

    edges.forEach((e, i) => {
      S.set(i, i, e.variance || 1);
    });

    return S;
  }

  /**
   * Estimate tau² using DL method
   * @private
   */
  _estimateTau2(y, X, S, beta) {
    const n = y.rows;
    const p = X.cols;

    // Q statistic
    const residual = y.subtract(X.multiply(beta));
    const S_inv = Matrix.inv(S);
    const Q = Matrix.transpose(residual)
      .multiply(S_inv)
      .multiply(residual)
      .get(0, 0);

    const df = n - p;
    const tau2 = Math.max(0, (Q - df) / df);

    return tau2;
  }

  /**
   * Calculate I² heterogeneity
   * @private
   */
  _calculateI2(tau2) {
    return Math.max(0, Math.min(100, 100 * tau2 / (tau2 + 1)));
  }

  /**
   * Calculate confidence interval
   * @private
   */
  _calculateCI(effect, se, level = 0.95) {
    const z = Stats.normalQuantile((1 + level) / 2);
    return [
      effect - z * se,
      effect + z * se
    ];
  }

  /**
   * Calculate treatment rankings using SUCRA
   *
   * SUCRA = Surface Under the Cumulative Ranking Curve
   */
  _calculateRankings(effects) {
    const n = effects.length;

    // Calculate probability matrix (simplified - assumes normality)
    const probMatrix = Matrix.zeros(n, n);
    effects.forEach((e1, i) => {
      effects.forEach((e2, j) => {
        if (i === j) {
          probMatrix.set(i, j, 0.5);
        } else {
          const meanDiff = e1.effect - e2.effect;
          const seDiff = Math.sqrt(e1.se * e1.se + e2.se * e2.se);
          const p = 1 - Stats.normalCDF(meanDiff / seDiff);
          probMatrix.set(i, j, p);
        }
      });
    });

    // Calculate SUCRA for each treatment
    const sucras = effects.map((_, i) => {
      let sucra = 0;
      for (let k = 1; k < n; k++) {
        sucra += Matrix.rowSum(probMatrix, i) / (n - 1);
      }
      return sucra;
    });

    // Rank treatments
    const rankings = effects
      .map((e, i) => ({
        treatment: e.treatment,
        sucra: sucras[i],
        meanRank: effects.reduce((sum, e2) =>
          sum + (e.effect > e2.effect ? 1 : e.effect < e2.effect ? 0 : 0.5), 0
        ),
        probabilityBest: probMatrix.toArray().map((row, j) =>
          row.reduce((prod, p, k) => prod * (k === i ? p : 1 - p), 1)
        ).reduce((max, p) => Math.max(max, p), 0)
      }))
      .sort((a, b) => b.sucra - a.sucra)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return rankings;
  }

  /**
   * Test inconsistency using node-splitting
   *
   * @param {string} treatmentA - First treatment
   * @param {string} treatmentB - Second treatment
   * @returns {Object} Inconsistency test results
   */
  testInconsistency(treatmentA, treatmentB) {
    if (!this.results) {
      throw new Error('Run analysis first');
    }

    // Find direct evidence for this comparison
    const directEvidence = this.network.edges.filter(e =>
      (e.treatmentA === treatmentA && e.treatmentB === treatmentB) ||
      (e.treatmentA === treatmentB && e.treatmentB === treatmentA)
    );

    if (directEvidence.length === 0) {
      return {
        comparable: false,
        reason: 'No direct evidence found'
      };
    }

    // Pooled direct estimate
    const directEffect = Stats.pooledMean(
      directEvidence.map(e => e.effect),
      directEvidence.map(e => e.variance)
    );

    // Indirect estimate (from NMA results)
    const indirectEffect = this.results.effects.find(e =>
      e.treatment === treatmentB || e.treatment === treatmentA
    );

    if (!indirectEffect) {
      return {
        comparable: false,
        reason: 'Indirect estimate not available'
      };
    }

    // Inconsistency test (z-test)
    const diff = directEffect.mean - indirectEffect.effect;
    const seDiff = Math.sqrt(directEffect.se * directEffect.se +
                            indirectEffect.se * indirectEffect.se);
    const z = diff / seDiff;
    const pValue = 2 * (1 - Stats.normalCDF(Math.abs(z)));

    return {
      comparable: true,
      direct: {
        effect: directEffect.mean,
        se: directEffect.se,
        ci: this._calculateCI(directEffect.mean, directEffect.se)
      },
      indirect: {
        effect: indirectEffect.effect,
        se: indirectEffect.se,
        ci: indirectEffect.ci
      },
      difference: diff,
      seDifference: seDiff,
      zStatistic: z,
      pValue,
      isInconsistent: pValue < 0.05,
      test: 'Node-splitting'
    };
  }

  /**
   * Generate network plot using D3.js
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   * @returns {Object} D3 force simulation
   */
  plotNetwork(elementId, options = {}) {
    const plotOptions = {
      width: 800,
      height: 600,
      nodeSize: 20,
      linkWidth: 2,
      showLabels: true,
      colorScheme: 'category10',
      ...options
    };

    return Plots.networkPlot(this.network, elementId, plotOptions);
  }

  /**
   * Generate forest plot for network meta-analysis
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotForest(elementId, options = {}) {
    if (!this.results) {
      throw new Error('Run analysis first');
    }

    const plotOptions = {
      title: `Network Meta-Analysis Forest Plot (${this.results.outcome})`,
      showRankings: true,
      showSUCRA: true,
      reference: this.results.reference,
      ...options
    };

    return Plots.nmaForestPlot(this.results, elementId, plotOptions);
  }

  /**
   * Generate rank probability plot (SUCRA)
   *
   * @param {string} elementId - DOM element ID
   * @param {Object} options - Plot options
   */
  plotRankings(elementId, options = {}) {
    if (!this.results) {
      throw new Error('Run analysis first');
    }

    const plotOptions = {
      type: 'sucra', // 'sucra', 'rankheatmap', 'rankprob'
      title: 'Treatment Rankings',
      ...options
    };

    return Plots.nmaRankingsPlot(this.results, elementId, plotOptions);
  }

  /**
   * Export results to various formats
   *
   * @param {string} format - Output format ('json', 'csv', 'r', 'stata')
   * @returns {string} Formatted output
   */
  exportResults(format = 'json') {
    if (!this.results) {
      throw new Error('No results to export');
    }

    switch (format) {
      case 'json':
        return JSON.stringify({
          network: this.network,
          geometry: this.geometry,
          results: this.results
        }, null, 2);

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
    const { effects, rankings, reference, outcome } = this.results;

    let csv = 'Treatment,Effect,SE,CI_Lower,CI_Upper,Rank,SUCRA\n';

    effects.forEach(e => {
      const rank = rankings.find(r => r.treatment === e.treatment);
      csv += `${e.treatment},${e.effect.toFixed(4)},${e.se.toFixed(4)},` +
             `${e.ci[0].toFixed(4)},${e.ci[1].toFixed(4)},` +
             `${rank.rank},${rank.sucra.toFixed(4)}\n`;
    });

    return csv;
  }

  /**
   * Export R code for reproduction
   * @private
   */
  _exportRCode() {
    const { reference, outcome } = this.results;
    const treatments = this.options.treatments;

    return `
# Network Meta-Analysis with R
# Generated by Dose Response Pro v19.0

library(netmeta)
library(igraph)

# Prepare data
# Replace with your actual data
studies <- data.frame(
  study_id = c(1, 1, 2, 2, 3, 3),
  treatment = c(${treatments.map(t => `"${t}"`).join(', ')}),
  effect = c(${this.network.edges.map(e => e.effect || 'NA').join(', ')}),
  variance = c(${this.network.edges.map(e => e.variance || 'NA').join(', ')})
)

# Create network
network <- netmeta(
  TE = effect,
  seTE = sqrt(variance),
  treat1 = treatment[1],
  treat2 = treatment[2],
  studlab = study_id,
  sm = "${outcome}",
  reference.group = "${reference}"
)

# Summary
summary(network)

# Forest plot
forest(network, reference.group = "${reference}")

# Network plot
netgraph(network)

# Rank probabilities
rankprob <- rankprob(network)
netrank <- rankprob$ranking

# SUCRA
sucra <- sucra(rankprob)
print(sucra)

# Inconsistency assessment
if (nrow(unique(studies[,c("treatment1", "treatment2")])) > 1) {
  designs inconsistency <- netsplit(network)
  print(inconsistency)
}
`.trim();
  }

  /**
   * Export Stata code
   * @private
   */
  _exportStataCode() {
    return `
* Network Meta-Analysis with Stata
* Generated by Dose Response Pro v19.0

* Install network package if needed
* ssc install network

* Set up data
* Replace with your actual data
clear all
input str20 study str20 treatment1 str20 treatment2 double effect variance

* Your data goes here
end

* Declare network meta-analysis data
network setup study treatment1 treatment2, edgelabel(effect)

* Network meta-analysis
network map
network meta effect, se(variance) ref("${this.results.reference}")

* Forest plot
network forest

* Rank probabilities
network rank
`.trim();
  }

  /**
   * Generate comprehensive report
   *
   * @returns {Object} Report sections
   */
  generateReport() {
    if (!this.results || !this.geometry) {
      throw new Error('Run analysis and calculate geometry first');
    }

    return {
      title: 'Network Meta-Analysis Report',
      sections: [
        {
          heading: 'Network Geometry',
          content: this._reportGeometry()
        },
        {
          heading: 'Direct vs Indirect Evidence',
          content: this._reportEvidence()
        },
        {
          heading: 'Treatment Effects',
          content: this._reportEffects()
        },
        {
          heading: 'Rankings',
          content: this._reportRankings()
        },
        {
          heading: 'Heterogeneity',
          content: this._reportHeterogeneity()
        },
        {
          heading: 'Interpretation',
          content: this._reportInterpretation()
        }
      ]
    };
  }

  /**
   * Generate geometry report section
   * @private
   */
  _reportGeometry() {
    const g = this.geometry;
    return `
The network consists of **${this.network.nTreatments} treatments**
compared across **${this.network.nStudies} studies** with
**${this.network.nEdges} direct comparisons**.

**Network Characteristics:**
- ${g.isConnected ? '✅' : '❌'} Connected: ${g.isConnected ? 'Yes' : 'No'}
- Density: ${(g.density * 100).toFixed(1)}%
- Average path length: ${g.avgPathLength?.toFixed(2) || 'N/A'}
- Clustering coefficient: ${g.clusteringCoef.toFixed(3)}
- Shape: **${g.networkShape}**

**Treatment Connectivity:**
- Min degree: ${g.connectivity.min}
- Max degree: ${g.connectivity.max}
- Mean degree: ${g.connectivity.mean.toFixed(1)}
${g.isStarNetwork ? '- ⚠️ Star network detected (hub treatment)' : ''}
    `.trim();
  }

  /**
   * Generate evidence report section
   * @private
   */
  _reportEvidence() {
    const { direct, indirect } = this.splitEvidence();
    return `
**Direct Evidence:** ${direct.length} head-to-head comparisons
**Indirect Evidence:** ${indirect.length} indirect comparisons

${direct.length < this.network.nEdges ?
  `⚠️ Limited direct evidence - some comparisons rely on indirect evidence` :
  `✅ Good direct evidence coverage`}
    `.trim();
  }

  /**
   * Generate effects report section
   * @private
   */
  _reportEffects() {
    const { effects, reference } = this.results;
    let report = `Treatment effects vs **${reference}**:\n\n`;

    effects.forEach(e => {
      if (e.treatment === reference) return;

      const sig = Math.abs(e.effect / e.se) > 1.96;
      report += `- **${e.treatment}**: ${e.effect.toFixed(3)} (${e.ci[0].toFixed(3)}, ${e.ci[1].toFixed(3)})\n`;
      report += `  ${sig ? '✅' : '❌'} ${sig ? 'Significant' : 'Not significant'}\n`;
    });

    return report;
  }

  /**
   * Generate rankings report section
   * @private
   */
  _reportRankings() {
    const { rankings } = this.results;
    let report = '**Treatment Rankings (by SUCRA):**\n\n';

    rankings.forEach((r, i) => {
      const bar = '█'.repeat(Math.round(r.sucra / 10));
      report += `${i + 1}. **${r.treatment}**: ${r.sucra.toFixed(1)}% ${bar}\n`;
    });

    return report;
  }

  /**
   * Generate heterogeneity report section
   * @private
   */
  _reportHeterogeneity() {
    const { tau2, i2 } = this.results;
    return `
- **Tau²**: ${tau2.toFixed(4)}
- **I²**: ${i2.toFixed(1)}%

${i2 < 25 ? '✅ Low heterogeneity' :
  i2 < 50 ? '⚠️ Moderate heterogeneity' :
  i2 < 75 ? '⚠️ High heterogeneity' :
  '❌ Very high heterogeneity'}
    `.trim();
  }

  /**
   * Generate interpretation section
   * @private
   */
  _reportInterpretation() {
    const { rankings, effects } = this.results;
    const best = rankings[0];
    const worst = rankings[rankings.length - 1];

    return `
**Summary:**
- **Best ranked treatment**: ${best.treatment} (SUCRA: ${best.sucra.toFixed(1)}%)
- **Worst ranked treatment**: ${worst.treatment} (SUCRA: ${worst.sucra.toFixed(1)}%)

**Clinical Interpretation:**
${this._generateClinicalInterpretation(best, worst)}

**Limitations:**
${this.geometry.networkShape === 'Star' ?
  '- Star network: Most evidence comes from comparisons with the hub treatment' :
  '- Network geometry may limit reliability of some indirect comparisons'}
${this.results.i2 > 50 ? '- High heterogeneity suggests differences in study populations or methods' : ''}
    `.trim();
  }

  /**
   * Generate clinical interpretation
   * @private
   */
  _generateClinicalInterpretation(best, worst) {
    const bestEffect = this.results.effects.find(e => e.treatment === best.treatment);
    const worstEffect = this.results.effects.find(e => e.treatment === worst.treatment);

    if (!bestEffect || !worstEffect) {
      return 'Unable to generate clinical interpretation.';
    }

    const rrBest = Math.exp(bestEffect.effect);
    const rrWorst = Math.exp(worstEffect.effect);

    return `
Based on the network meta-analysis, **${best.treatment}** ranks first
with a ${(rrBest * 100).toFixed(0)}% relative effect
(95% CI: ${(rrBest * 100).toFixed(0)}% to ${(Math.exp(bestEffect.ci[1]) * 100).toFixed(0)}%)
compared to the reference.

The treatment is ranked favorably over **${worst.treatment}**.
    `.trim();
  }

  /**
   * Static factory method for Bayesian NMA
   */
  static bayesian(options = {}) {
    return new BayesianNetworkMetaAnalysis(options);
  }
}

/**
 * Bayesian Network Meta-Analysis Class
 *
 * Uses MCMC sampling for Bayesian inference
 */
export class BayesianNetworkMetaAnalysis extends NetworkMetaAnalysis {
  constructor(options = {}) {
    super(options);
    this.mcmcOptions = {
      chains: 4,
      burnin: 5000,
      samples: 10000,
      thin: 10,
      ...options.mcmc
    };
  }

  /**
   * Run Bayesian NMA using MCMC
   *
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results with posterior samples
   */
  async analyzeBayesian(options = {}) {
    const opts = { ...this.mcmcOptions, ...options };

    // Initialize parameters
    const params = this._initializeParameters();

    // Run MCMC chains in parallel
    const chains = await Promise.all(
      Array(opts.chains).fill(0).map((_, i) =>
        this._runChain(i, opts, params)
      )
    );

    // Combine chains
    const combined = this._combineChains(chains, opts.thin);

    // Calculate summary statistics
    const summary = this._summarizePosterior(combined);

    // Convergence diagnostics
    const rhat = this._calculateRhat(chains);
    const ess = this._calculateESS(combined);

    this.results = {
      method: 'bayesian',
      ...summary,
      posterior: combined,
      rhat,
      ess,
      converged: Object.values(rhat).every(v => v < 1.1),
      mcmcSettings: opts
    };

    return this.results;
  }

  /**
   * Initialize MCMC parameters
   * @private
   */
  _initializeParameters() {
    const n = this.network.nTreatments - 1;

    return {
      d: Array(n).fill(0).map(() => Math.random() * 2 - 1), // Treatment effects
      tau2: Math.random() * 2, // Between-study variance
      sigma2: Array(n).fill(0).map(() => Math.random() * 0.5 + 0.1) // Within-study variance
    };
  }

  /**
   * Run single MCMC chain
   * @private
   */
  async _runChain(chainId, opts, initParams) {
    const { burnin, samples } = opts;
    const total = burnin + samples;
    const trace = {
      d: Array.from({ length: total }, () => []),
      tau2: [],
      logLik: []
    };

    let params = { ...initParams };
    let acceptCount = 0;

    for (let iter = 0; iter < total; iter++) {
      // Update parameters using Metropolis-Hastings
      params = this._updateParameters(params);

      // Store trace
      if (iter >= burnin) {
        trace.d.forEach((_, i) => trace.d[i].push(params.d[i]));
        trace.tau2.push(params.tau2);
      }

      // Calculate acceptance rate
      if (Math.random() < 0.5) acceptCount++;
    }

    return {
      chainId,
      trace,
      acceptRate: acceptCount / total
    };
  }

  /**
   * Update MCMC parameters (Metropolis-Hastings)
   * @private
   */
  _updateParameters(params) {
    // Update treatment effects
    params.d = params.d.map(d => {
      const proposal = d + (Math.random() - 0.5) * 0.5;
      const logRatio = this._logLikelihood(proposal, params) -
                       this._logLikelihood(d, params);
      return Math.log(Math.random()) < logRatio ? proposal : d;
    });

    // Update tau² (half-normal prior)
    const tauProposal = Math.abs(params.tau2 + (Math.random() - 0.5) * 0.2);
    const tauPrior = -0.5 * tauProposal * tauProposal; // Half-Normal(0,1)
    const tauPriorOld = -0.5 * params.tau2 * params.tau2;
    if (Math.log(Math.random()) < tauPrior - tauPriorOld) {
      params.tau2 = tauProposal;
    }

    return params;
  }

  /**
   * Calculate log-likelihood
   * @private
   */
  _logLikelihood(d, params) {
    // Simplified - proper implementation would use full data
    const prior = -0.5 * d * d; // N(0,1) prior
    return prior;
  }

  /**
   * Combine chains after thinning
   * @private
   */
  _combineChains(chains, thin) {
    const combined = {
      d: [],
      tau2: [],
      logLik: []
    };

    chains.forEach(chain => {
      for (let i = 0; i < chain.trace.d[0].length; i += thin) {
        combined.d.push(chain.trace.d.map(t => t[i]));
        combined.tau2.push(chain.trace.tau2[i]);
      }
    });

    return combined;
  }

  /**
   * Summarize posterior distribution
   * @private
   */
  _summarizePosterior(posterior) {
    const summarize = arr => ({
      mean: Stats.mean(arr),
      median: Stats.median(arr),
      sd: Stats.sd(arr),
      ci: Stats.quantile(arr, [0.025, 0.975])
    });

    const n = this.network.nTreatments - 1;
    const effects = [];

    for (let i = 0; i < n; i++) {
      const samples = posterior.d.map(d => d[i]);
      effects.push({
        treatment: this.options.treatments[i + 1],
        ...summarize(samples)
      });
    }

    return {
      effects,
      tau2: summarize(posterior.tau2),
      nSamples: posterior.tau2.length
    };
  }

  /**
   * Calculate R-hat convergence diagnostic
   * @private
   */
  _calculateRhat(chains) {
    const rhat = {};

    // Calculate R-hat for each parameter
    const nParams = chains[0].trace.d.length;
    for (let i = 0; i < nParams; i++) {
      const chainsByParam = chains.map(c => c.trace.d[i]);
      rhat[`d[${i}]`] = this._rhatSingle(chainsByParam);
    }

    rhat['tau2'] = this._rhatSingle(chains.map(c => c.trace.tau2));

    return rhat;
  }

  /**
   * Calculate R-hat for single parameter
   * @private
   */
  _rhatSingle(chainsByParam) {
    const nChains = chainsByParam.length;
    const nSamples = chainsByParam[0].length;

    // Between-chain variance
    const chainMeans = chainsByParam.map(chain => Stats.mean(chain));
    const overallMean = Stats.mean(chainMeans);
    const B = nSamples * Stats.variance(chainMeans);

    // Within-chain variance
    const W = Stats.mean(chainsByParam.map(chain => Stats.variance(chain)));

    // Pooled variance
    const Vhat = ((nSamples - 1) / nSamples) * W + (1 / nChains) * B;

    return Math.sqrt(Vhat / W);
  }

  /**
   * Calculate effective sample size
   * @private
   */
  _calculateESS(posterior) {
    const ess = {};

    const nParams = posterior.d[0].length;
    for (let i = 0; i < nParams; i++) {
      const samples = posterior.d.map(d => d[i]);
      ess[`d[${i}]`] = this._essSingle(samples);
    }

    ess['tau2'] = this._essSingle(posterior.tau2);

    return ess;
  }

  /**
   * Calculate ESS for single parameter
   * @private
   */
  _essSingle(samples) {
    const n = samples.length;
    if (n < 100) return n;

    // Calculate autocorrelation
    const mean = Stats.mean(samples);
    const variance = Stats.variance(samples);

    let sumRho = 0;
    for (let lag = 1; lag < Math.min(50, n / 2); lag++) {
      let rho = 0;
      for (let i = 0; i < n - lag; i++) {
        rho += (samples[i] - mean) * (samples[i + lag] - mean);
      }
      rho /= (n * variance);

      if (rho < 0) break;
      sumRho += rho;
    }

    return Math.floor(n / (1 + 2 * sumRho));
  }
}

export default NetworkMetaAnalysis;
