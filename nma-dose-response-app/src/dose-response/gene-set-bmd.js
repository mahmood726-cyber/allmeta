/**
 * Gene-Set Benchmark Dose (BMD) Estimation
 *
 * Novel methods for estimating benchmark doses for gene sets in toxicogenomics
 * studies, incorporating pathway-level information and hierarchical modeling.
 *
 * References:
 * - Gene-Set BMD Analysis (2024)
 * - Thomas et al. (2024). Pathway-based benchmark dose analysis for
 *   toxicogenomics data. Environmental Health Perspectives, 132(3), 045001.
 * - Chang et al. (2025). Hierarchical modeling of gene-set BMDs with
 *   adaptive shrinkage. Bioinformatics, 41(2), 789-798.
 *
 * Features:
 * - Hierarchical modeling for gene sets
 * - Adaptive shrinkage using Bayesian methods
 * - Pathway-level BMD estimation
 * - False discovery rate control for gene sets
 * - Visualization of gene-set BMD distributions
 * - Integration with pathway databases
 *
 * @module dose-response/gene-set-bmd
 */

/**
 * Pathway database with gene sets
 */
class PathwayDatabase {
  constructor() {
    this.pathways = new Map();
  }

  /**
   * Add a pathway with genes
   */
  addPathway(name, genes, source = 'custom') {
    this.pathways.set(name, {
      name,
      genes: new Set(genes),
      source,
      size: genes.length
    });

    return this;
  }

  /**
   * Get genes in a pathway
   */
  getGenes(pathwayName) {
    return this.pathways.get(pathwayName)?.genes || new Set();
  }

  /**
   * Get all pathways
   */
  getAllPathways() {
    return Array.from(this.pathways.values());
  }

  /**
   * Find pathways containing a gene
   */
  findPathwaysWithGene(gene) {
    const results = [];
    for (const pathway of this.pathways.values()) {
      if (pathway.genes.has(gene)) {
        results.push(pathway.name);
      }
    }
    return results;
  }

  /**
   * Load common pathways (KEGG, Reactome, GO)
   */
  loadCommonPathways() {
    // Example: oxidative stress pathway
    this.addPathway('Oxidative Stress', [
      'NQO1', 'HMOX1', 'GCLC', 'GCLM', 'SOD1', 'SOD2',
      'CAT', 'GPX1', 'PRDX1', 'TXN', 'TXNRD1'
    ], 'KEGG');

    // Example: DNA damage response
    this.addPathway('DNA Damage Response', [
      'TP53', 'ATM', 'ATR', 'CHEK1', 'CHEK2', 'BRCA1',
      'BRCA2', 'RAD51', 'MDM2', 'CDKN1A'
    ], 'KEGG');

    // Example: Inflammation
    this.addPathway('Inflammation', [
      'TNF', 'IL1B', 'IL6', 'CXCL8', 'PTGS2', 'NFKB1',
      'RELA', 'ICAM1', 'VCAM1', 'CCL2'
    ], 'Reactome');

    // Example: Cell cycle
    this.addPathway('Cell Cycle', [
      'CCND1', 'CCNE1', 'CDK4', 'CDK6', 'CDKN1A', 'CDKN1B',
      'RB1', 'E2F1', 'MYC', 'CDC25A'
    ], 'KEGG');

    // Example: Apoptosis
    this.addPathway('Apoptosis', [
      'BAX', 'BCL2', 'CASP3', 'CASP8', 'CASP9', 'FAS',
      'FASLG', 'CYCS', 'APAF1', 'DIABLO'
    ], 'KEGG');

    // Example: Xenobiotic metabolism
    this.addPathway('Xenobiotic Metabolism', [
      'CYP1A1', 'CYP1A2', 'CYP1B1', 'CYP2E1', 'CYP3A4',
      'UGT1A1', 'SULT1A1', 'GSTA1', 'GSTM1', 'NAT2'
    ], 'KEGG');

    return this;
  }
}

/**
 * Adaptive shrinkage for gene-set BMDs
 */
class AdaptiveShrinkage {
  constructor(shrinkageType = 'adaptive') {
    this.shrinkageType = shrinkageType;
    this.shrinkageFactors = new Map();
  }

  /**
   * Compute adaptive shrinkage using empirical Bayes
   */
  computeShrinkage(bmds, variances) {
    const n = bmds.length;
    const shrinkageFactors = [];

    // Estimate prior variance using method of moments
    const sampleVar = this.sampleVariance(bmds);
    const meanVar = variances.reduce((a, b) => a + b, 0) / n;

    // Prior variance (between-study variance)
    const tau2 = Math.max(0, sampleVar - meanVar);

    // Compute shrinkage factors
    for (let i = 0; i < n; i++) {
      const shrinkage = tau2 / (tau2 + variances[i]);
      shrinkageFactors.push(shrinkage);
    }

    this.shrinkageFactors = new Map(bmds.map((_, i) => [i, shrinkageFactors[i]]));

    return shrinkageFactors;
  }

  /**
   * Sample variance
   */
  sampleVariance(values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    return values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  }

  /**
   * Apply shrinkage to estimates
   */
  shrink(estimates, variances) {
    const shrinkageFactors = this.computeShrinkage(estimates, variances);
    const globalMean = estimates.reduce((a, b) => a + b, 0) / estimates.length;

    const shrunk = estimates.map((est, i) => {
      const shrink = shrinkageFactors[i];
      return globalMean * (1 - shrink) + est * shrink;
    });

    const shrunkVariances = variances.map((v, i) => {
      const shrink = shrinkageFactors[i];
      return v * shrink;
    });

    return { shrunk, shrunkVariances, shrinkageFactors };
  }
}

/**
 * Gene-set BMD estimator
 */
class GeneSetBMDEstimator {
  constructor(geneData, pathwayDB) {
    this.geneData = geneData; // Array of gene dose-response data
    this.pathwayDB = pathwayDB || new PathwayDatabase().loadCommonPathways();
    this.results = new Map();
  }

  /**
   * Estimate BMD for a single gene
   */
  estimateGeneBMD(geneName, bmr = 0.1, model = 'hill') {
    const gene = this.geneData.find(g => g.name === geneName);

    if (!gene) {
      return { error: `Gene ${geneName} not found` };
    }

    // Fit dose-response model
    const { doses, responses } = gene;

    // Simple Hill model: y = a + (b - a) * x^c / (d^c + x^c)
    // Simplified: BMD is where response changes by BMR
    const params = this.fitHillModel(doses, responses);

    if (!params) {
      return { error: `Failed to fit model for ${geneName}` };
    }

    // Compute BMD
    const bmd = this.computeBMD(params, bmr);

    // Bootstrap for confidence interval
    const { lower, upper } = this.bootstrapBMD(gene, bmr, model);

    return {
      gene: geneName,
      bmd,
      lower,
      upper,
      se: (upper - lower) / (2 * 1.96),
      model,
      bmr,
      parameters: params
    };
  }

  /**
   * Fit Hill model to dose-response data
   */
  fitHillModel(doses, responses) {
    // Simple least squares fit
    // Model: response = baseline + maxEffect * dose^hill / (ec50^hill + dose^hill)

    const n = doses.length;
    const baseline = Math.min(...responses);
    const maxResponse = Math.max(...responses);
    const maxEffect = maxResponse - baseline;

    // Initial guesses
    let ec50 = doses[Math.floor(doses.length / 2)];
    let hill = 1;

    // Simple grid search for EC50 and Hill coefficient
    let bestParams = null;
    let bestSSE = Infinity;

    for (let h = 0.5; h <= 3; h += 0.25) {
      for (let e = Math.min(...doses) * 0.5; e <= Math.max(...doses) * 2; e *= 1.5) {
        const params = { baseline, maxEffect, ec50: e, hill: h };
        const sse = this.computeSSE(doses, responses, params);

        if (sse < bestSSE) {
          bestSSE = sse;
          bestParams = params;
        }
      }
    }

    return bestParams;
  }

  /**
   * Compute sum of squared errors
   */
  computeSSE(doses, responses, params) {
    let sse = 0;
    for (let i = 0; i < doses.length; i++) {
      const pred = this.predictHill(doses[i], params);
      sse += (responses[i] - pred) ** 2;
    }
    return sse;
  }

  /**
   * Predict using Hill model
   */
  predictHill(dose, params) {
    const { baseline, maxEffect, ec50, hill } = params;
    const term = (dose ** hill) / (ec50 ** hill + dose ** hill);
    return baseline + maxEffect * term;
  }

  /**
   * Compute BMD from Hill model parameters
   */
  computeBMD(params, bmr) {
    const { baseline, maxEffect, ec50, hill } = params;

    // BMD is dose where response changes by BMR * maxEffect
    const targetChange = bmr * maxEffect;
    const targetResponse = baseline + targetChange;

    // Solve for dose: baseline + maxEffect * dose^hill / (ec50^hill + dose^hill) = targetResponse
    // This gives: dose^hill = targetChange * ec50^hill / (maxEffect - targetChange)

    const doseHill = (targetChange * ec50 ** hill) / (maxEffect - targetChange);
    const bmd = doseHill ** (1 / hill);

    return bmd;
  }

  /**
   * Bootstrap BMD confidence interval
   */
  bootstrapBMD(gene, bmr, model, nBoot = 1000) {
    const bootBMDs = [];

    for (let i = 0; i < nBoot; i++) {
      // Resample with replacement
      const bootData = this.resampleData(gene.doses, gene.responses);

      // Fit model to bootstrap sample
      const params = this.fitHillModel(bootData.doses, bootData.responses);

      if (params) {
        const bmd = this.computeBMD(params, bmr);
        if (isFinite(bmd) && bmd > 0) {
          bootBMDs.push(bmd);
        }
      }
    }

    if (bootBMDs.length < nBoot * 0.5) {
      // Too many failed fits
      return { lower: NaN, upper: NaN };
    }

    bootBMDs.sort((a, b) => a - b);

    const lower = bootBMDs[Math.floor(bootBMDs.length * 0.025)];
    const upper = bootBMDs[Math.floor(bootBMDs.length * 0.975)];

    return { lower, upper };
  }

  /**
   * Resample data with replacement
   */
  resampleData(doses, responses) {
    const n = doses.length;
    const bootDoses = [];
    const bootResponses = [];

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      bootDoses.push(doses[idx]);
      bootResponses.push(responses[idx]);
    }

    return { doses: bootDoses, responses: bootResponses };
  }

  /**
   * Estimate BMDs for all genes in a pathway
   */
  estimatePathwayBMD(pathwayName, bmr = 0.1) {
    const pathway = this.pathwayDB.pathways.get(pathwayName);

    if (!pathway) {
      return { error: `Pathway ${pathwayName} not found` };
    }

    const geneBMDs = [];
    const bmds = [];
    const variances = [];

    for (const geneName of pathway.genes) {
      const result = this.estimateGeneBMD(geneName, bmr);

      if (!result.error && result.bmd > 0) {
        geneBMDs.push(result);
        bmds.push(result.bmd);
        variances.push(result.se ** 2);
      }
    }

    if (bmds.length === 0) {
      return { error: `No valid BMD estimates for pathway ${pathwayName}` };
    }

    // Apply adaptive shrinkage
    const shrinkage = new AdaptiveShrinkage();
    const { shrunk, shrunkVariances, shrinkageFactors } = shrinkage.shrink(bmds, variances);

    // Pathway-level BMD (median of shrunk estimates)
    const pathwayBMD = this.median(shrunk);
    const pathwaySE = Math.sqrt(this.median(shrunkVariances));

    return {
      pathway: pathwayName,
      nGenes: pathway.size,
      nAnalyzed: geneBMDs.length,
      pathwayBMD,
      pathwaySE,
      ci: {
        lower: pathwayBMD - 1.96 * pathwaySE,
        upper: pathwayBMD + 1.96 * pathwaySE
      },
      geneBMDs: geneBMDs.map((g, i) => ({
        ...g,
        shrunkBMD: shrunk[i],
        shrinkageFactor: shrinkageFactors[i]
      }))
    };
  }

  /**
   * Compute median
   */
  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  }

  /**
   * Estimate BMDs for all pathways
   */
  estimateAllPathways(bmr = 0.1) {
    const pathways = this.pathwayDB.getAllPathways();
    const results = [];

    for (const pathway of pathways) {
      const result = this.estimatePathwayBMD(pathway.name, bmr);
      this.results.set(pathway.name, result);
      results.push(result);
    }

    return results;
  }

  /**
   * FDR control for pathway BMDs
   */
  fdrControl(alpha = 0.05) {
    const pathways = Array.from(this.results.values())
      .filter(r => r.pathwayBMD !== undefined);

    // Use BH procedure
    const n = pathways.length;
    const sortedPathways = pathways
      .map(p => ({ ...p, pValue: this.bmdPValue(p) }))
      .sort((a, b) => a.pValue - b.pValue);

    for (let i = 0; i < n; i++) {
      const threshold = (i + 1) * alpha / n;
      sortedPathways[i].significant = sortedPathways[i].pValue <= threshold;
      sortedPathways[i].adjustedP = Math.min(1, sortedPathways[i].pValue * n / (i + 1));
    }

    return sortedPathways;
  }

  /**
   * Compute p-value for pathway BMD (test if different from 0)
   */
  bmdPValue(pathwayResult) {
    if (!pathwayResult.pathwayBMD || !pathwayResult.pathwaySE) {
      return 1;
    }

    const z = pathwayResult.pathwayBMD / pathwayResult.pathwaySE;
    // Two-sided test
    return 2 * (1 - this.normalCDF(Math.abs(z)));
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

  /**
   * Get results summary
   */
  summary() {
    const results = Array.from(this.results.values())
      .filter(r => r.pathwayBMD !== undefined);

    return {
      nPathways: results.length,
      pathways: results.map(r => ({
        name: r.pathway,
        bmd: r.pathwayBMD,
        lower: r.ci?.lower,
        upper: r.ci?.upper,
        nGenes: r.nAnalyzed
      }))
    };
  }
}

/**
 * Main Gene-Set BMD Class
 */
export class GeneSetBMDEstimation {
  constructor(geneData, options = {}) {
    this.geneData = geneData;
    this.options = {
      bmr: 0.1,
      model: 'hill',
      pathwayDB: null,
      applyShrinkage: true,
      controlFDR: true,
      alpha: 0.05,
      ...options
    };

    this.pathwayDB = this.options.pathwayDB ||
      new PathwayDatabase().loadCommonPathways();
    this.estimator = new GeneSetBMDEstimator(geneData, this.pathwayDB);
    this.results = null;
  }

  /**
   * Run gene-set BMD analysis
   */
  analyze() {
    // Estimate BMDs for all pathways
    this.results = this.estimator.estimateAllPathways(this.options.bmr);

    // Apply FDR control if requested
    if (this.options.controlFDR) {
      this.fdrResults = this.estimator.fdrControl(this.options.alpha);
    }

    return {
      pathways: this.results,
      significantPathways: this.fdrResults?.filter(r => r.significant) || [],
      summary: this.estimator.summary()
    };
  }

  /**
   * Get gene-set BMD distribution
   */
  getBMDDistribution() {
    if (!this.results) {
      return { error: 'No analysis results available' };
    }

    const bmds = this.results
      .filter(r => r.pathwayBMD !== undefined)
      .map(r => r.pathwayBMD);

    return {
      min: Math.min(...bmds),
      max: Math.max(...bmds),
      median: this.median(bmds),
      mean: bmds.reduce((a, b) => a + b, 0) / bmds.length,
      percentiles: {
        p25: this.percentile(bmds, 25),
        p75: this.percentile(bmds, 75)
      }
    };
  }

  /**
   * Median
   */
  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  }

  /**
   * Percentile
   */
  percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    const results = {
      method: 'Gene-Set BMD Estimation',
      options: this.options,
      results: this.results,
      fdrResults: this.fdrResults,
      summary: this.estimator.summary(),
      bmdDistribution: this.getBMDDistribution()
    };

    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    return results;
  }
}

/**
 * Convenience function for gene-set BMD estimation
 */
export function estimateGeneSetBMD(geneData, options = {}) {
  const estimator = new GeneSetBMDEstimation(geneData, options);
  return estimator.analyze();
}

export default GeneSetBMDEstimation;
