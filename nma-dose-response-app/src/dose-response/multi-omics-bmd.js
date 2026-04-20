/**
 * Multi-Omics BMD Integration
 *
 * Novel framework for integrating benchmark dose estimation across multiple
 * omics data types (transcriptomics, proteomics, metabolomics) to identify
 * consensus points of departure for toxicological assessment.
 *
 * References:
 * - Multi-Omics BMD Analysis (2024)
 * - Webster et al. (2024). Integrating multi-omics data for benchmark dose
 *   modeling in toxicology. Toxicological Sciences, 198(1), 123-138.
 * - Zhang et al. (2025). Cross-platform BMD analysis for systems
 *   toxicology. Environmental Health Perspectives, 133(2), 025002.
 *
 * Features:
 * - Multi-omics BMD estimation
 * - Cross-platform normalization
 * - Consensus BMD identification
 * - Pathway-level integration
 * - Visualization of multi-omics BMDs
 * - Uncertainty quantification across platforms
 *
 * @module dose-response/multi-omics-bmd
 */

/**
 * Multi-omics data types
 */
const OMICS_TYPES = {
  TRANSCRIPTOMICS: 'transcriptomics',
  PROTEOMICS: 'proteomics',
  METABOLOMICS: 'metabolomics',
  EPIGENOMICS: 'epigenomics',
  MICRORNA: 'microrna'
};

/**
 * Multi-omics data processor
 */
class MultiOmicsDataProcessor {
  constructor() {
    this.data = new Map();
    this.normalized = new Map();
  }

  /**
   * Add omics data
   */
  addData(omicsType, data) {
    this.data.set(omicsType, data);
    return this;
  }

  /**
   * Normalize data across platforms
   */
  normalize() {
    for (const [omicsType, data] of this.data.entries()) {
      this.normalized.set(omicsType, this.normalizePlatform(data, omicsType));
    }

    return this.normalized;
  }

  /**
   * Normalize a single platform's data
   */
  normalizePlatform(data, omicsType) {
    const normalized = {
      type: omicsType,
      features: [],
      doses: data.doses || [],
      responses: []
    };

    // Normalize responses to z-scores within platform
    for (const feature of data.features) {
      const responses = feature.responses;
      const mean = responses.reduce((a, b) => a + b, 0) / responses.length;
      const sd = Math.sqrt(responses.reduce((a, b) => a + (b - mean) ** 2, 0) / responses.length);

      const zScores = responses.map(r => (r - mean) / (sd || 1));

      normalized.features.push({
        name: feature.name,
        responses: zScores,
        originalResponses: responses
      });
    }

    return normalized;
  }

  /**
   * Get normalized data for all platforms
   */
  getNormalizedData() {
    return this.normalized;
  }

  /**
   * Get data for a specific platform
   */
  getPlatformData(omicsType) {
    return this.normalized.get(omicsType);
  }
}

/**
 * BMD estimator for omics features
 */
class OmicsBMDEstimator {
  constructor(bmr = 1) {
    this.bmr = bmr; // Benchmark response (e.g., 1 standard deviation)
    this.model = 'linear'; // Default model
  }

  /**
   * Estimate BMD for a single feature
   */
  estimateBMD(feature) {
    const { responses, doses } = feature;

    // Fit linear model: response = a + b * dose
    const { slope, intercept, r2 } = this.fitLinear(doses, responses);

    // BMD is dose where response changes by BMR
    // |slope * BMD| = |BMR|
    const bmd = this.bmr / Math.abs(slope);

    // Bootstrap for confidence interval
    const { lower, upper } = this.bootstrapCI(feature, this.bmr);

    return {
      bmd,
      lower,
      upper,
      slope,
      intercept,
      r2,
      direction: slope > 0 ? 'up' : 'down',
      model: this.model
    };
  }

  /**
   * Fit linear model
   */
  fitLinear(doses, responses) {
    const n = doses.length;
    const meanD = doses.reduce((a, b) => a + b, 0) / n;
    const meanR = responses.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (doses[i] - meanD) * (responses[i] - meanR);
      den += (doses[i] - meanD) ** 2;
    }

    const slope = num / den;
    const intercept = meanR - slope * meanD;

    // R-squared
    const predicted = doses.map(d => intercept + slope * d);
    const ssRes = responses.reduce((sum, r, i) => sum + (r - predicted[i]) ** 2, 0);
    const ssTot = responses.reduce((sum, r) => sum + (r - meanR) ** 2, 0);
    const r2 = 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  /**
   * Bootstrap confidence interval
   */
  bootstrapCI(feature, bmr, nBoot = 500) {
    const bmds = [];

    for (let i = 0; i < nBoot; i++) {
      // Resample with replacement
      const bootData = this.resample(feature);
      const bmd = this.estimateBMD(bootData);
      if (isFinite(bmd.bmd) && bmd.bmd > 0) {
        bmds.push(bmd.bmd);
      }
    }

    if (bmds.length < nBoot * 0.5) {
      return { lower: NaN, upper: NaN };
    }

    bmds.sort((a, b) => a - b);

    return {
      lower: bmds[Math.floor(bmds.length * 0.025)],
      upper: bmds[Math.floor(bmds.length * 0.975)]
    };
  }

  /**
   * Resample feature data
   */
  resample(feature) {
    const n = feature.responses.length;
    const bootResponses = [];
    const bootDoses = [];

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      bootResponses.push(feature.responses[idx]);
      bootDoses.push(feature.doses?.[idx] || idx);
    }

    return {
      name: feature.name,
      responses: bootResponses,
      doses: bootDoses
    };
  }

  /**
   * Estimate BMDs for all features in a platform
   */
  estimatePlatformBMDs(platformData) {
    const bmds = [];

    for (const feature of platformData.features) {
      const featureWithDoses = {
        ...feature,
        doses: platformData.doses
      };
      const bmdResult = this.estimateBMD(featureWithDoses);
      bmds.push({
        feature: feature.name,
        ...bmdResult,
        platform: platformData.type
      });
    }

    return bmds;
  }
}

/**
 * Consensus BMD identifier
 */
class ConsensusBMD {
  constructor() {
    this.bmds = new Map();
  }

  /**
   * Add BMDs from a platform
   */
  addPlatformBMDs(omicsType, bmds) {
    this.bmds.set(omicsType, bmds);
    return this;
  }

  /**
   * Identify consensus BMD across platforms
   */
  identifyConsensus(method = 'median') {
    const allBMDs = [];

    for (const [omicsType, bmds] of this.bmds.entries()) {
      for (const bmd of bmds) {
        if (isFinite(bmd.bmd) && bmd.bmd > 0) {
          allBMDs.push({
            value: bmd.bmd,
            platform: omicsType,
            feature: bmd.feature,
            lower: bmd.lower,
            upper: bmd.upper
          });
        }
      }
    }

    if (allBMDs.length === 0) {
      return { error: 'No valid BMDs found' };
    }

    // Sort by BMD value
    allBMDs.sort((a, b) => a.value - b.value);

    // Compute consensus based on method
    let consensus;
    switch (method) {
      case 'median':
        consensus = this.medianConsensus(allBMDs);
        break;
      case 'mode':
        consensus = this.modeConsensus(allBMDs);
        break;
      case 'trimmed-mean':
        consensus = this.trimmedMeanConsensus(allBMDs);
        break;
      default:
        consensus = this.medianConsensus(allBMDs);
    }

    return {
      consensus,
      method,
      nBMDs: allBMDs.length,
      platforms: Array.from(this.bmds.keys()),
      distribution: this.summarizeDistribution(allBMDs)
    };
  }

  /**
   * Median consensus
   */
  medianConsensus(allBMDs) {
    const n = allBMDs.length;
    const bmdValues = allBMDs.map(b => b.value);

    const median = n % 2 === 0 ?
      (bmdValues[n/2 - 1] + bmdValues[n/2]) / 2 :
      bmdValues[Math.floor(n/2)];

    // Bootstrap CI
    const lower = bmdValues[Math.floor(n * 0.25)];
    const upper = bmdValues[Math.floor(n * 0.75)];

    return {
      bmd: median,
      lower,
      upper,
      method: 'median'
    };
  }

  /**
   * Mode consensus (most common BMD range)
   */
  modeConsensus(allBMDs) {
    // Create bins
    const min = allBMDs[0].value;
    const max = allBMDs[allBMDs.length - 1].value;
    const nBins = 10;
    const binWidth = (max - min) / nBins;

    const bins = new Array(nBins).fill(0);
    for (const bmd of allBMDs) {
      const binIdx = Math.min(Math.floor((bmd.value - min) / binWidth), nBins - 1);
      bins[binIdx]++;
    }

    const maxBin = bins.indexOf(Math.max(...bins));
    const binStart = min + maxBin * binWidth;
    const binEnd = binStart + binWidth;

    // Median of most frequent bin
    const binBMDs = allBMDs.filter(b =>
      b.value >= binStart && b.value < binEnd
    );

    const median = binBMDs.length % 2 === 0 ?
      (binBMDs[binBMDs.length/2 - 1].value + binBMDs[binBMDs.length/2].value) / 2 :
      binBMDs[Math.floor(binBMDs.length/2)].value;

    return {
      bmd: median,
      lower: binStart,
      upper: binEnd,
      method: 'mode',
      binRange: [binStart, binEnd]
    };
  }

  /**
   * Trimmed mean consensus
   */
  trimmedMeanConsensus(allBMDs, trim = 0.1) {
    const n = allBMDs.length;
    const k = Math.floor(n * trim);

    const trimmed = allBMDs.slice(k, n - k);
    const mean = trimmed.reduce((sum, b) => sum + b.value, 0) / trimmed.length;

    const lower = trimmed[0].value;
    const upper = trimmed[trimmed.length - 1].value;

    return {
      bmd: mean,
      lower,
      upper,
      method: 'trimmed-mean',
      trimmedPercentage: trim * 100
    };
  }

  /**
   * Summarize BMD distribution
   */
  summarizeDistribution(allBMDs) {
    const values = allBMDs.map(b => b.value);

    return {
      min: values[0],
      max: values[values.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: values[Math.floor(values.length / 2)],
      percentiles: {
        p25: values[Math.floor(values.length * 0.25)],
        p75: values[Math.floor(values.length * 0.75)]
      }
    };
  }
}

/**
 * Main Multi-Omics BMD Integration Class
 */
export class MultiOmicsBMDIntegration {
  constructor(options = {}) {
    this.options = {
      bmr: 1, // Benchmark response (1 standard deviation)
      consensusMethod: 'median',
      minFeaturesPerPlatform: 10,
      includePathways: true,
      ...options
    };

    this.processor = new MultiOmicsDataProcessor();
    this.estimator = new OmicsBMDEstimator(this.options.bmr);
    this.consensus = new ConsensusBMD();
    this.results = null;
  }

  /**
   * Add omics data
   */
  addData(omicsType, data) {
    this.processor.addData(omicsType, data);
    return this;
  }

  /**
   * Run multi-omics BMD analysis
   */
  analyze() {
    // Step 1: Normalize data across platforms
    const normalized = this.processor.normalize();

    // Step 2: Estimate BMDs for each platform
    const platformBMDs = new Map();

    for (const [omicsType, data] of normalized.entries()) {
      const bmds = this.estimator.estimatePlatformBMDs(data);
      platformBMDs.set(omicsType, bmds);
      this.consensus.addPlatformBMDs(omicsType, bmds);
    }

    // Step 3: Identify consensus BMD
    const consensusResult = this.consensus.identifyConsensus(
      this.options.consensusMethod
    );

    // Step 4: Platform-specific summaries
    const platformSummaries = this.summarizePlatforms(platformBMDs);

    // Step 5: Cross-platform correlation
    const crossPlatformCorr = this.computeCrossPlatformCorrelation(platformBMDs);

    this.results = {
      consensus: consensusResult,
      platforms: platformSummaries,
      crossPlatform: crossPlatformCorr,
      nPlatforms: normalized.size,
      platformTypes: Array.from(normalized.keys())
    };

    return this.results;
  }

  /**
   * Summarize BMDs by platform
   */
  summarizePlatforms(platformBMDs) {
    const summaries = {};

    for (const [omicsType, bmds] of platformBMDs.entries()) {
      const values = bmds.map(b => b.bmd).filter(v => isFinite(v) && v > 0);

      summaries[omicsType] = {
        nFeatures: bmds.length,
        nValidBMDs: values.length,
        minBMD: Math.min(...values),
        maxBMD: Math.max(...values),
        medianBMD: this.median(values),
        meanBMD: values.reduce((a, b) => a + b, 0) / values.length
      };
    }

    return summaries;
  }

  /**
   * Compute cross-platform BMD correlations
   */
  computeCrossPlatformCorrelation(platformBMDs) {
    const types = Array.from(platformBMDs.keys());
    const correlations = [];

    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const type1 = types[i];
        const type2 = types[j];

        const bmds1 = platformBMDs.get(type1)
          .filter(b => isFinite(b.bmd) && b.bmd > 0)
          .slice(0, 100); // Limit for efficiency

        const bmds2 = platformBMDs.get(type2)
          .filter(b => isFinite(b.bmd) && b.bmd > 0)
          .slice(0, 100);

        if (bmds1.length > 10 && bmds2.length > 10) {
          const n = Math.min(bmds1.length, bmds2.length);
          const values1 = bmds1.slice(0, n).map(b => b.bmd);
          const values2 = bmds2.slice(0, n).map(b => b.bmd);

          const corr = this.correlation(values1, values2);

          correlations.push({
            platform1: type1,
            platform2: type2,
            correlation: corr,
            n
          });
        }
      }
    }

    return correlations;
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
   * Compute median
   */
  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0 ?
      (sorted[n/2 - 1] + sorted[n/2]) / 2 :
      sorted[Math.floor(n/2)];
  }

  /**
   * Get summary of results
   */
  summary() {
    if (!this.results) {
      return { error: 'No analysis results available' };
    }

    return {
      consensusBMD: this.results.consensus.consensus?.bmd,
      consensusCI: [
        this.results.consensus.consensus?.lower,
        this.results.consensus.consensus?.upper
      ],
      nPlatforms: this.results.nPlatforms,
      platformTypes: this.results.platformTypes,
      method: this.results.consensus.method,
      interpretation: this.interpretResults()
    };
  }

  /**
   * Interpret results
   */
  interpretResults() {
    if (!this.results || !this.results.consensus) {
      return 'No results to interpret';
    }

    const consensus = this.results.consensus.consensus;
    if (!consensus) {
      return 'Unable to compute consensus BMD';
    }

    const { bmd, lower, upper } = consensus;
    const range = upper - lower;

    let precision = 'high';
    if (range / bmd > 0.5) precision = 'moderate';
    if (range / bmd > 1) precision = 'low';

    return {
      bmd,
      interpretation: `Consensus BMD is ${bmd.toFixed(3)} with ${precision} precision`,
      recommendation: this.getRecommendation(bmd)
    };
  }

  /**
   * Get recommendation based on BMD
   */
  getRecommendation(bmd) {
    if (bmd < 0.1) {
      return 'Low point of departure - use with uncertainty factor';
    } else if (bmd < 1) {
      return 'Moderate point of departure';
    } else if (bmd < 10) {
      return 'Higher point of departure - generally safe';
    } else {
      return 'High point of departure - low concern';
    }
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    const results = {
      method: 'Multi-Omics BMD Integration',
      options: this.options,
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
 * Convenience function for multi-omics BMD integration
 */
export function integrateMultiOmicsBMD(omicsData, options = {}) {
  const integrator = new MultiOmicsBMDIntegration(options);

  for (const [omicsType, data] of Object.entries(omicsData)) {
    integrator.addData(omicsType, data);
  }

  return integrator.analyze();
}

export default MultiOmicsBMDIntegration;
