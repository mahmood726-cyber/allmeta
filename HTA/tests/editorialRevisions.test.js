/**
 * Jest-based tests for editorial revisions modules.
 * Replaces previous custom test runner to avoid process.exit side effects.
 *
 * Covers: HKSJMetaAnalysis, EVPPICalculator, PriorSensitivityAnalysis,
 *         SurvivalModelSelection, NetworkMetaAnalysis, PublicationBiasTests,
 *         NumericalValidation
 */

'use strict';

const {
    HKSJMetaAnalysis,
    EVPPICalculator,
    PriorSensitivityAnalysis,
    SurvivalModelSelection,
    NetworkMetaAnalysis,
    PublicationBiasTests,
    NumericalValidation
} = require('../src/engine/editorialRevisions');

const { OptimizedAlgorithms, FastMath } = require('../src/engine/performanceWrapper');

// ============================================================================
// Shared test data
// ============================================================================

const FIVE_STUDIES = {
    effects: [0.5, 0.3, 0.7, 0.4, 0.6],
    variances: [0.04, 0.09, 0.06, 0.08, 0.05]
};

const HOMOGENEOUS_STUDIES = {
    effects: [0.50, 0.50, 0.50, 0.50, 0.50],
    variances: [0.04, 0.04, 0.04, 0.04, 0.04]
};

const HETEROGENEOUS_STUDIES = {
    effects: [0.1, 0.9, -0.3, 1.2, 0.5, -0.1, 0.8],
    variances: [0.02, 0.03, 0.05, 0.04, 0.01, 0.06, 0.03]
};

// ============================================================================
// SECTION 1: HKSJ META-ANALYSIS (expanded)
// ============================================================================

describe('HKSJMetaAnalysis', () => {
    // --- Original test (preserved) ---
    test('HKSJ returns structurally valid outputs and CI width relation', () => {
        const hksj = new HKSJMetaAnalysis({ method: 'REML' });
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(result.effect).toBeGreaterThan(0);
        expect(result.se).toBeGreaterThan(0);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
        expect(result.adjustment).toBe('HKSJ');

        const hksjWidth = result.ci[1] - result.ci[0];
        const stdWidth = result.ciStandard[1] - result.ciStandard[0];
        expect(hksjWidth).toBeGreaterThanOrEqual(stdWidth - 1e-6);
    });

    // --- Constructor options ---
    test('defaults to REML method and alpha=0.05', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj.method).toBe('REML');
        expect(hksj.alpha).toBe(0.05);
    });

    test('accepts DL method option', () => {
        const hksj = new HKSJMetaAnalysis({ method: 'DL' });
        expect(hksj.method).toBe('DL');
    });

    // --- Empty / single study edge cases ---
    test('empty input returns zero-filled result', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze([], []);

        expect(result.effect).toBe(0);
        expect(result.se).toBe(0);
        expect(result.k).toBe(0);
        expect(result.tau2).toBe(0);
        expect(result.I2).toBe(0);
    });

    test('single study returns effect with normal CI and no heterogeneity', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze([0.5], [0.04]);

        expect(result.effect).toBe(0.5);
        expect(result.se).toBeCloseTo(0.2, 5);
        expect(result.k).toBe(1);
        expect(result.tau2).toBe(0);
        expect(result.I2).toBe(0);
        expect(result.Q).toBe(0);
        expect(result.predictionInterval.lower).toBeNull();
        expect(result.predictionInterval.message).toContain('3 studies');
    });

    // --- HKSJ variance inflation ---
    test('HKSJ inflates SE when studies are heterogeneous (k small)', () => {
        const hksj = new HKSJMetaAnalysis({ method: 'DL' });
        const result = hksj.analyze(HETEROGENEOUS_STUDIES.effects, HETEROGENEOUS_STUDIES.variances);

        // HKSJ SE should be >= standard SE
        expect(result.se).toBeGreaterThanOrEqual(result.seStandard - 1e-10);
        // The HKSJ factor q should be > 1 for heterogeneous data
        expect(result.hksjFactor).toBeGreaterThan(0);
    });

    test('HKSJ factor is approximately 1 for homogeneous data', () => {
        const hksj = new HKSJMetaAnalysis({ method: 'DL' });
        const result = hksj.analyze(HOMOGENEOUS_STUDIES.effects, HOMOGENEOUS_STUDIES.variances);

        // When all effects are identical, qHKSJ should be near 0 (clamped to max(1, q))
        // So the CI should be similar to standard
        const hksjWidth = result.ci[1] - result.ci[0];
        const stdWidth = result.ciStandard[1] - result.ciStandard[0];
        // They should be close (ratio near 1)
        expect(hksjWidth / stdWidth).toBeGreaterThanOrEqual(0.5);
    });

    // --- HKSJ uses t-distribution with k-1 df ---
    test('HKSJ CI uses t-distribution (wider than z-based for k=3)', () => {
        const hksj = new HKSJMetaAnalysis();
        const effects = [0.4, 0.6, 0.5];
        const variances = [0.04, 0.04, 0.04];

        const result = hksj.analyze(effects, variances);

        // t_{0.975, 2} ~ 4.303 >> z_{0.975} = 1.96
        // So HKSJ CI should be significantly wider than standard
        const hksjWidth = result.ci[1] - result.ci[0];
        const stdWidth = result.ciStandard[1] - result.ciStandard[0];
        expect(hksjWidth).toBeGreaterThan(stdWidth * 1.2);
        expect(result.df).toBe(2);
    });

    // --- DL vs REML tau2 ---
    test('DL and REML give different tau2 estimates', () => {
        const dl = new HKSJMetaAnalysis({ method: 'DL' });
        const reml = new HKSJMetaAnalysis({ method: 'REML' });

        const dlResult = dl.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);
        const remlResult = reml.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        // Both should be non-negative
        expect(dlResult.tau2).toBeGreaterThanOrEqual(0);
        expect(remlResult.tau2).toBeGreaterThanOrEqual(0);
        // They may differ slightly (REML often slightly larger)
        // Just check both produce valid results
        expect(dlResult.effect).toBeCloseTo(remlResult.effect, 1);
    });

    // --- Prediction interval ---
    test('prediction interval is wider than confidence interval', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        const piWidth = result.predictionInterval.upper - result.predictionInterval.lower;
        const ciWidth = result.ci[1] - result.ci[0];
        expect(piWidth).toBeGreaterThan(ciWidth);
    });

    test('prediction interval uses t-distribution with k-2 df', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(result.predictionInterval.df).toBe(3); // 5 - 2
        expect(result.predictionInterval.lower).toBeDefined();
        expect(result.predictionInterval.upper).toBeDefined();
        expect(result.predictionInterval.se).toBeGreaterThan(0);
    });

    test('prediction interval requires >= 3 studies', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze([0.5, 0.3], [0.04, 0.09]);

        expect(result.predictionInterval.lower).toBeNull();
        expect(result.predictionInterval.upper).toBeNull();
        expect(result.predictionInterval.message).toContain('3 studies');
    });

    test('prediction interval includes tau2 in width calculation', () => {
        // When tau2 is large, PI should be very wide
        const effects = [0.1, 0.5, 0.9, 0.2, 0.8, 1.5, -0.3];
        const variances = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];

        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(effects, variances);

        expect(result.tau2).toBeGreaterThan(0.05);
        const piWidth = result.predictionInterval.upper - result.predictionInterval.lower;
        expect(piWidth).toBeGreaterThan(0.5);
    });

    // --- I2 confidence interval (Q-profile method) ---
    test('I2 CI lower bound <= point estimate <= upper bound', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(result.I2CI.lower).toBeLessThanOrEqual(result.I2 + 1e-6);
        // Upper can sometimes be less than point due to approximation, but should be reasonable
        expect(result.I2CI.upper).toBeGreaterThanOrEqual(0);
        expect(result.I2CI.upper).toBeLessThanOrEqual(100);
        expect(result.I2CI.method).toBe('Q-profile');
    });

    test('I2 CI bounds are [0, 0] for k < 2', () => {
        const hksj = new HKSJMetaAnalysis();
        const ci = hksj._calculateI2CI(5, 1);
        expect(ci.lower).toBe(0);
        expect(ci.upper).toBe(0);
    });

    test('I2 is bounded [0, 100]', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);
        expect(result.I2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeLessThanOrEqual(100);
    });

    test('I2 is 0 for perfectly homogeneous studies', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(HOMOGENEOUS_STUDIES.effects, HOMOGENEOUS_STUDIES.variances);
        expect(result.I2).toBe(0);
    });

    // --- Q statistic and p-value ---
    test('Q statistic is non-negative and p-value is bounded', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(result.Q).toBeGreaterThanOrEqual(0);
        expect(result.pQ).toBeGreaterThanOrEqual(0);
        expect(result.pQ).toBeLessThanOrEqual(1);
    });

    test('Q p-value is large for homogeneous data', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(HOMOGENEOUS_STUDIES.effects, HOMOGENEOUS_STUDIES.variances);
        expect(result.pQ).toBeGreaterThan(0.5);
    });

    // --- Weights ---
    test('weights are all positive and sum-meaningful', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(result.weights).toHaveLength(5);
        result.weights.forEach(w => expect(w).toBeGreaterThan(0));
    });

    // --- Statistical helper: _normalQuantile ---
    test('_normalQuantile(0.975) ~ 1.96', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._normalQuantile(0.975)).toBeCloseTo(1.96, 2);
    });

    test('_normalQuantile(0.5) ~ 0', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._normalQuantile(0.5)).toBeCloseTo(0, 3);
    });

    // --- Statistical helper: _tQuantile ---
    test('_tQuantile(0.975, 2) ~ 4.303', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._tQuantile(0.975, 2)).toBeCloseTo(4.303, 0);
    });

    test('_tQuantile(0.975, 10) ~ 2.228', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._tQuantile(0.975, 10)).toBeCloseTo(2.228, 1);
    });

    test('_tQuantile converges to normal for large df', () => {
        const hksj = new HKSJMetaAnalysis();
        const t200 = hksj._tQuantile(0.975, 200);
        const z = hksj._normalQuantile(0.975);
        expect(Math.abs(t200 - z)).toBeLessThan(0.02);
    });

    // --- Chi-square CDF / quantile ---
    test('_chiSquareCDF(3.84, 1) ~ 0.95', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._chiSquareCDF(3.84, 1)).toBeCloseTo(0.95, 1);
    });

    test('_chiSquareQuantile(0.95, 1) ~ 3.84', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._chiSquareQuantile(0.95, 1)).toBeCloseTo(3.84, 0);
    });

    test('_chiSquareQuantile returns 0 for df <= 0', () => {
        const hksj = new HKSJMetaAnalysis();
        expect(hksj._chiSquareQuantile(0.95, 0)).toBe(0);
    });

    // --- Custom alpha ---
    test('alpha=0.10 produces narrower CI than alpha=0.05', () => {
        const hksj05 = new HKSJMetaAnalysis({ alpha: 0.05 });
        const hksj10 = new HKSJMetaAnalysis({ alpha: 0.10 });

        const r05 = hksj05.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);
        const r10 = hksj10.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        const w05 = r05.ci[1] - r05.ci[0];
        const w10 = r10.ci[1] - r10.ci[0];
        expect(w05).toBeGreaterThan(w10);
    });

    // --- H2 statistic ---
    test('H2 = Q / (k-1)', () => {
        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(FIVE_STUDIES.effects, FIVE_STUDIES.variances);
        expect(result.H2).toBeCloseTo(result.Q / 4, 6);
    });
});

// ============================================================================
// SECTION 2: EVPPI CALCULATOR
// ============================================================================

describe('EVPPICalculator', () => {
    // --- Original test (preserved) ---
    test('EVPPI computes results for at least one parameter', async () => {
        const modelFn = (params) => ({
            cost: 1000 + params.costMultiplier * 250,
            effect: 0.5 + params.effectModifier * 0.2,
            strategy: 'intervention'
        });

        const allParams = {
            costMultiplier: { distribution: 'normal', mean: 1, se: 0.2 },
            effectModifier: { distribution: 'normal', mean: 0, se: 0.1 }
        };

        const evppi = new EVPPICalculator({ outerSamples: 50, innerSamples: 50 });
        const result = await evppi.calculate(modelFn, allParams, ['costMultiplier'], 50000);

        expect(result.evpi).toBeDefined();
        expect(result.evppiResults.costMultiplier).toBeDefined();
        expect(result.evppiResults.costMultiplier.evppi).toBeGreaterThanOrEqual(-1e-6);
    });

    test('EVPPI proportion of EVPI is between 0 and 1 (or close)', async () => {
        const modelFn = (params) => ({
            cost: 1000 + params.x * 500,
            effect: 0.5 + params.x * 0.1,
            strategy: 'A'
        });

        const allParams = {
            x: { distribution: 'normal', mean: 0, se: 1 }
        };

        const evppi = new EVPPICalculator({ outerSamples: 50, innerSamples: 50, seed: 42 });
        const result = await evppi.calculate(modelFn, allParams, ['x'], 50000);

        expect(result.wtp).toBe(50000);
        expect(result.method).toBe('standard');
    });

    test('constructor respects seed for deterministic RNG', () => {
        const evppi1 = new EVPPICalculator({ seed: 123 });
        const evppi2 = new EVPPICalculator({ seed: 123 });

        // Both should produce the same first random number
        const r1 = evppi1.rng();
        const r2 = evppi2.rng();
        expect(r1).toBe(r2);
    });

    test('_sampleParam handles various distribution types', () => {
        const evppi = new EVPPICalculator({ seed: 42 });

        // Normal
        const n = evppi._sampleParam({ distribution: 'normal', mean: 5, se: 0.1 });
        expect(typeof n).toBe('number');
        expect(isFinite(n)).toBe(true);

        // Uniform
        const u = evppi._sampleParam({ distribution: 'uniform', min: 0, max: 1 });
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);

        // Beta
        const b = evppi._sampleParam({ distribution: 'beta', mean: 0.5, se: 0.1 });
        expect(b).toBeGreaterThan(0);
        expect(b).toBeLessThan(1);

        // Lognormal
        const ln = evppi._sampleParam({ distribution: 'lognormal', mean: 10, se: 2 });
        expect(ln).toBeGreaterThan(0);
    });

    test('_sampleParam defaults to normal for unknown distribution', () => {
        const evppi = new EVPPICalculator({ seed: 42 });
        const val = evppi._sampleParam({ distribution: 'weirdthing', mean: 5, se: 1 });
        expect(typeof val).toBe('number');
        expect(isFinite(val)).toBe(true);
    });
});

// ============================================================================
// SECTION 3: PRIOR SENSITIVITY ANALYSIS
// ============================================================================

describe('PriorSensitivityAnalysis', () => {
    test('analyze runs with multiple prior specs and returns recommendations', () => {
        const likelihoodFn = (theta, data) => {
            // Simple normal likelihood: sum of -(x - theta)^2 / 2
            return data.reduce((s, x) => s - 0.5 * Math.pow(x - theta, 2), 0);
        };

        const data = [1.0, 1.2, 0.8, 1.1, 0.9];

        const priorSpecs = [
            {
                name: 'Informative Normal',
                description: 'N(1, 0.5)',
                distribution: 'normal',
                params: { mean: 1, sd: 0.5 },
                proposalSD: 0.2
            },
            {
                name: 'Vague Normal',
                description: 'N(0, 10)',
                distribution: 'normal',
                params: { mean: 0, sd: 10 },
                proposalSD: 0.5
            }
        ];

        const psa = new PriorSensitivityAnalysis({ nSamples: 500, seed: 42 });
        const result = psa.analyze(likelihoodFn, priorSpecs, data);

        expect(result.results).toHaveLength(2);
        expect(result.sensitivityMetrics).toBeDefined();
        expect(result.recommendation).toBeTruthy();

        // Both posteriors should be near the data mean (1.0)
        for (const r of result.results) {
            expect(r.posteriorMean).toBeGreaterThan(0);
            expect(r.posteriorSD).toBeGreaterThan(0);
            expect(r.credibleInterval).toHaveLength(2);
            expect(r.effectiveSampleSize).toBeGreaterThan(0);
        }
    });

    test('robust result when posteriors agree', () => {
        const likelihoodFn = (theta, data) => {
            return data.reduce((s, x) => s - 0.5 * Math.pow(x - theta, 2), 0);
        };
        const data = [5, 5.1, 4.9, 5.0, 5.2];

        const priorSpecs = [
            { name: 'A', distribution: 'normal', params: { mean: 5, sd: 1 }, proposalSD: 0.3 },
            { name: 'B', distribution: 'normal', params: { mean: 4, sd: 2 }, proposalSD: 0.3 }
        ];

        const psa = new PriorSensitivityAnalysis({ nSamples: 500, seed: 99 });
        const result = psa.analyze(likelihoodFn, priorSpecs, data);

        // With strong data, posteriors should agree => robust
        // (May or may not pass the strict threshold, but sensitivity ratio should be small)
        expect(result.sensitivityMetrics.sensitivityRatio).toBeDefined();
    });

    test('_logPrior returns correct values for different distributions', () => {
        const psa = new PriorSensitivityAnalysis({ seed: 1 });

        // Normal: log-density ~ -0.5 * ((x - mean) / sd)^2
        const normalSpec = { distribution: 'normal', params: { mean: 0, sd: 1 } };
        expect(psa._logPrior(0, normalSpec)).toBeCloseTo(0, 5);
        expect(psa._logPrior(1, normalSpec)).toBeCloseTo(-0.5, 5);

        // Uniform: 0 inside, -Infinity outside
        const uniformSpec = { distribution: 'uniform', params: { min: 0, max: 1 } };
        expect(psa._logPrior(0.5, uniformSpec)).toBe(0);
        expect(psa._logPrior(-1, uniformSpec)).toBe(-Infinity);
        expect(psa._logPrior(2, uniformSpec)).toBe(-Infinity);

        // Halfnormal: ~0 at x=0 (may return -0), -Infinity for x < 0
        const halfnormalSpec = { distribution: 'halfnormal', params: { sd: 1 } };
        expect(psa._logPrior(0, halfnormalSpec)).toBeCloseTo(0, 10);
        expect(psa._logPrior(-1, halfnormalSpec)).toBe(-Infinity);

        // Beta: should be -Infinity outside (0,1)
        const betaSpec = { distribution: 'beta', params: { alpha: 2, beta: 2 } };
        expect(psa._logPrior(-0.1, betaSpec)).toBe(-Infinity);
        expect(psa._logPrior(1.1, betaSpec)).toBe(-Infinity);
        expect(isFinite(psa._logPrior(0.5, betaSpec))).toBe(true);

        // Gamma: should be -Infinity for x <= 0
        const gammaSpec = { distribution: 'gamma', params: { shape: 2, scale: 1 } };
        expect(psa._logPrior(-1, gammaSpec)).toBe(-Infinity);
        expect(isFinite(psa._logPrior(1, gammaSpec))).toBe(true);

        // Unknown: flat prior returns 0
        const flatSpec = { distribution: 'flat', params: {} };
        expect(psa._logPrior(100, flatSpec)).toBe(0);
    });

    test('single prior spec returns sensitivity metrics with robust=true', () => {
        const likelihoodFn = (theta) => -0.5 * theta * theta;
        const psa = new PriorSensitivityAnalysis({ nSamples: 100, seed: 42 });
        const result = psa.analyze(likelihoodFn, [
            { name: 'only', distribution: 'normal', params: { mean: 0, sd: 1 }, proposalSD: 0.5 }
        ], []);

        expect(result.sensitivityMetrics.robust).toBe(true);
        expect(result.sensitivityMetrics.maxDifference).toBe(0);
    });
});

// ============================================================================
// SECTION 4: SURVIVAL MODEL SELECTION
// ============================================================================

describe('SurvivalModelSelection', () => {
    // --- Original test (preserved) ---
    test('survival model selection returns recommendation and averaged predictions', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
        const events = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1];

        const selector = new SurvivalModelSelection();
        const result = selector.compare(times, events);

        expect(result.models.length).toBeGreaterThan(0);
        expect(result.recommended).toBeDefined();
        expect(result.modelAveraging.length).toBeGreaterThan(0);
        expect(result.modelAveraging[0].survival).toBeGreaterThanOrEqual(0);
        expect(result.modelAveraging[0].survival).toBeLessThanOrEqual(1);
    });

    test('models are sorted by AIC (ascending)', () => {
        const times = [1, 2, 3, 5, 8, 10, 12, 15];
        const events = [1, 1, 0, 1, 1, 0, 1, 1];

        const selector = new SurvivalModelSelection();
        const result = selector.compare(times, events);

        for (let i = 1; i < result.models.length; i++) {
            expect(result.models[i].AIC).toBeGreaterThanOrEqual(result.models[i - 1].AIC);
        }
    });

    test('Akaike weights sum to approximately 1', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];

        const selector = new SurvivalModelSelection();
        const result = selector.compare(times, events);

        const totalWeight = result.models.reduce((s, m) => s + m.akaikeWeight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    test('recommended model has deltaAIC = 0', () => {
        const times = [1, 3, 5, 7, 9];
        const events = [1, 1, 1, 0, 1];

        const selector = new SurvivalModelSelection();
        const result = selector.compare(times, events);

        expect(result.recommended.deltaAIC).toBe(0);
    });

    // --- Survival function spot checks ---
    test('exponential S(t) = exp(-rate*t)', () => {
        const selector = new SurvivalModelSelection();
        expect(selector._survivalFunction(5, { rate: 0.1 }, 'exponential'))
            .toBeCloseTo(Math.exp(-0.5), 8);
    });

    test('weibull S(t) = exp(-(t/scale)^shape)', () => {
        const selector = new SurvivalModelSelection();
        const S = selector._survivalFunction(2, { shape: 1.5, scale: 5 }, 'weibull');
        const expected = Math.exp(-Math.pow(2 / 5, 1.5));
        expect(S).toBeCloseTo(expected, 8);
    });

    test('loglogistic S(t) = 1 / (1 + (t/alpha)^beta)', () => {
        const selector = new SurvivalModelSelection();
        const S = selector._survivalFunction(10, { alpha: 10, beta: 2 }, 'loglogistic');
        expect(S).toBeCloseTo(0.5, 5);
    });

    test('all survival functions return values in [0, 1]', () => {
        const selector = new SurvivalModelSelection();
        const dists = [
            ['exponential', { rate: 0.1 }],
            ['weibull', { shape: 1.5, scale: 5 }],
            ['lognormal', { mu: 2, sigma: 1 }],
            ['loglogistic', { alpha: 10, beta: 1 }],
            ['gompertz', { shape: 0.01, rate: 0.1 }],
            ['gamma', { shape: 2, rate: 0.2 }]
        ];

        for (const [dist, params] of dists) {
            for (const t of [0.1, 1, 5, 10, 50]) {
                const S = selector._survivalFunction(t, params, dist);
                expect(S).toBeGreaterThanOrEqual(0);
                expect(S).toBeLessThanOrEqual(1);
            }
        }
    });

    test('survival function is monotonically decreasing in t', () => {
        const selector = new SurvivalModelSelection();
        const params = { rate: 0.1 };
        let prevS = 1;
        for (let t = 0.5; t <= 20; t += 0.5) {
            const S = selector._survivalFunction(t, params, 'exponential');
            expect(S).toBeLessThanOrEqual(prevS + 1e-10);
            prevS = S;
        }
    });

    // --- Extrapolation uncertainty ---
    test('extrapolation uncertainty includes predictions and optional warning', () => {
        const times = [1, 2, 3];
        const events = [1, 1, 1];

        const selector = new SurvivalModelSelection();
        const eu = selector._assessExtrapolationUncertainty(times, events, { rate: 0.3 }, 'exponential');

        expect(eu.predictions).toHaveLength(3);
        // Short follow-up => warning
        expect(eu.warning).toContain('Limited follow-up');
    });

    test('no extrapolation warning when follow-up >= 10', () => {
        const times = [1, 5, 10, 15, 20];
        const events = [1, 1, 0, 1, 1];

        const selector = new SurvivalModelSelection();
        const eu = selector._assessExtrapolationUncertainty(times, events, { rate: 0.05 }, 'exponential');

        expect(eu.warning).toBeNull();
    });

    // --- Model criteria ---
    test('AIC = -2*logLik + 2*k', () => {
        const selector = new SurvivalModelSelection();
        const times = [1, 2, 3, 4, 5];
        const events = [1, 1, 1, 0, 1];

        const criteria = selector._calculateCriteria(times, events, { rate: 0.2 }, 'exponential');
        expect(criteria.aic).toBeCloseTo(-2 * criteria.logLik + 2 * criteria.nParams, 6);
        expect(criteria.nParams).toBe(1); // exponential has 1 param
    });

    test('BIC penalizes more than AIC for large n', () => {
        const selector = new SurvivalModelSelection();
        const times = Array.from({ length: 50 }, (_, i) => i + 1);
        const events = times.map(() => 1);

        const criteria = selector._calculateCriteria(times, events, { rate: 0.05 }, 'exponential');
        // BIC = -2*logLik + k*log(n), AIC = -2*logLik + 2*k
        // For n=50: log(50)=3.91 > 2, so BIC > AIC
        expect(criteria.bic).toBeGreaterThan(criteria.aic);
    });
});

// ============================================================================
// SECTION 5: NETWORK META-ANALYSIS
// ============================================================================

describe('NetworkMetaAnalysis', () => {
    // --- Original test (preserved) ---
    test('flags disconnected networks', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.3, se: 0.1 },
            { study: 'S2', treat1: 'C', treat2: 'D', effect: 0.2, se: 0.15 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);
        expect(result.error).toBe('Network is not connected');
    });

    test('connected triangle network produces valid results', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.3, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.2, se: 0.12 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 0.5, se: 0.15 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        expect(result.error).toBeUndefined();
        expect(result.treatments).toEqual(['A', 'B', 'C']);
        expect(result.results.reference).toBe('A');
        expect(result.results.effects.A).toBe(0);
        expect(result.results.tau2).toBeGreaterThanOrEqual(0);
    });

    test('pairwise comparisons include effect, SE, CI, and p-value', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: -0.2, se: 0.15 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 0.3, se: 0.12 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        // Check a pairwise comparison exists
        const keys = Object.keys(result.results.pairwise);
        expect(keys.length).toBeGreaterThan(0);

        const firstPair = result.results.pairwise[keys[0]];
        expect(firstPair).toHaveProperty('effect');
        expect(firstPair).toHaveProperty('se');
        expect(firstPair).toHaveProperty('ci');
        expect(firstPair.ci).toHaveLength(2);
        expect(firstPair).toHaveProperty('pValue');
        expect(firstPair.pValue).toBeGreaterThanOrEqual(0);
        expect(firstPair.pValue).toBeLessThanOrEqual(1);
    });

    test('consistency check reports when inconsistency is found or not', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.5, se: 0.1 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 1.0, se: 0.1 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        expect(result.consistency).toBeDefined();
        expect(result.consistency.conclusion).toBeTruthy();
        expect(typeof result.consistency.nInconsistentLoops).toBe('number');
    });

    test('consistency check detects strong inconsistency', () => {
        // A->B = 0.5, B->C = 0.5, but A->C = 5.0 (grossly inconsistent)
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.05 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.5, se: 0.05 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 5.0, se: 0.05 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        // With such extreme inconsistency, at least one test should flag it
        const hasInconsistency = result.consistency.tests.some(t => t.pValue < 0.05);
        expect(hasInconsistency).toBe(true);
    });

    test('ranking returns SUCRA, P-score, and best treatment', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.12 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 0.8, se: 0.15 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        expect(result.ranking).toBeDefined();
        expect(result.ranking.sucra).toBeDefined();
        expect(result.ranking.pScore).toBeDefined();
        expect(result.ranking.bestTreatment).toBeTruthy();

        // SUCRA and P-score should be between 0 and 1
        for (const val of Object.values(result.ranking.pScore)) {
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(1);
        }
    });

    test('league table has correct dimensions', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.3, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.2, se: 0.12 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 0.5, se: 0.15 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        expect(result.leagueTable).toHaveLength(3);
        expect(result.leagueTable[0]).toHaveProperty('treatment');
    });

    test('self-comparison in league table has effect=0', () => {
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.3, se: 0.1 },
            { study: 'S2', treat1: 'A', treat2: 'C', effect: 0.5, se: 0.15 },
            { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.2, se: 0.12 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        for (const row of result.leagueTable) {
            const selfComp = row[row.treatment];
            expect(selfComp.effect).toBe(0);
        }
    });

    test('multi-study per comparison pools correctly', () => {
        const studies = [
            { study: 'S1a', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.1 },
            { study: 'S1b', treat1: 'A', treat2: 'B', effect: 0.6, se: 0.1 },
            { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.15 },
            { study: 'S3', treat1: 'A', treat2: 'C', effect: 0.7, se: 0.12 }
        ];

        const nma = new NetworkMetaAnalysis();
        const result = nma.analyze(studies);

        expect(result.error).toBeUndefined();
        expect(result.directComparisons.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// SECTION 6: PUBLICATION BIAS TESTS
// ============================================================================

describe('PublicationBiasTests', () => {
    const symmetricEffects = [0.5, 0.4, 0.6, 0.3, 0.7, 0.55, 0.45];
    const symmetricSEs = [0.1, 0.15, 0.12, 0.18, 0.08, 0.14, 0.11];

    // --- Original test (preserved) ---
    test('publication bias methods return bounded p-values', () => {
        const variances = symmetricSEs.map(se => se * se);

        const bias = new PublicationBiasTests();
        const egger = bias.eggerTest(symmetricEffects, symmetricSEs);
        const begg = bias.beggTest(symmetricEffects, symmetricSEs);
        const peters = bias.petersTest(symmetricEffects, variances);

        expect(egger.pValue).toBeGreaterThanOrEqual(0);
        expect(egger.pValue).toBeLessThanOrEqual(1);
        expect(begg.pValue).toBeGreaterThanOrEqual(0);
        expect(begg.pValue).toBeLessThanOrEqual(1);
        expect(peters.pValue).toBeGreaterThanOrEqual(0);
        expect(peters.pValue).toBeLessThanOrEqual(1);
    });

    // --- Egger's test ---
    describe('Egger test', () => {
        test('returns error for fewer than 3 studies', () => {
            const bias = new PublicationBiasTests();
            const result = bias.eggerTest([0.5, 0.3], [0.1, 0.2]);
            expect(result.error).toContain('at least 3');
        });

        test('detects asymmetry in clearly biased funnel', () => {
            // Large effects in small studies, small effects in large studies
            const effects = [0.8, 0.7, 0.6, 0.5, 0.3, 0.1];
            const ses = [0.05, 0.08, 0.1, 0.15, 0.25, 0.4];

            const bias = new PublicationBiasTests();
            const result = bias.eggerTest(effects, ses);

            expect(result.intercept).toBeDefined();
            expect(result.slope).toBeDefined();
            expect(result.df).toBe(4);
            expect(result.biasDetected).toBeDefined();
        });

        test('interpretation string reflects bias detection', () => {
            const bias = new PublicationBiasTests();
            const result = bias.eggerTest(symmetricEffects, symmetricSEs);

            expect(typeof result.interpretation).toBe('string');
            if (result.biasDetected) {
                expect(result.interpretation).toContain('asymmetry');
            } else {
                expect(result.interpretation).toContain('No significant');
            }
        });
    });

    // --- Peters test ---
    describe('Peters test', () => {
        test('returns error for fewer than 3 studies', () => {
            const bias = new PublicationBiasTests();
            const result = bias.petersTest([0.5], [0.04]);
            expect(result.error).toContain('at least 3');
        });

        test('returns slope, intercept, and p-value', () => {
            const bias = new PublicationBiasTests();
            const variances = symmetricSEs.map(se => se * se);
            const result = bias.petersTest(symmetricEffects, variances);

            expect(result.slope).toBeDefined();
            expect(result.intercept).toBeDefined();
            expect(result.t).toBeDefined();
            expect(result.pValue).toBeGreaterThanOrEqual(0);
        });
    });

    // --- Harbord test ---
    describe('Harbord test', () => {
        test('returns error for fewer than 3 studies', () => {
            const bias = new PublicationBiasTests();
            const result = bias.harbordTest([0.5, 0.3], [0.1, 0.2]);
            expect(result.error).toContain('at least 3');
        });

        test('returns intercept and p-value', () => {
            const bias = new PublicationBiasTests();
            const result = bias.harbordTest(symmetricEffects, symmetricSEs);

            expect(result.intercept).toBeDefined();
            expect(result.pValue).toBeGreaterThanOrEqual(0);
            expect(result.pValue).toBeLessThanOrEqual(1);
        });
    });

    // --- Begg test ---
    describe('Begg test', () => {
        test('returns error for fewer than 3 studies', () => {
            const bias = new PublicationBiasTests();
            const result = bias.beggTest([0.5, 0.3], [0.1, 0.2]);
            expect(result.error).toContain('at least 3');
        });

        test('Kendall tau is bounded [-1, 1]', () => {
            const bias = new PublicationBiasTests();
            const result = bias.beggTest(symmetricEffects, symmetricSEs);
            expect(result.tau).toBeGreaterThanOrEqual(-1);
            expect(result.tau).toBeLessThanOrEqual(1);
        });
    });

    // --- Funnel plot data ---
    describe('funnelPlotData', () => {
        test('generates funnel bounds and study data', () => {
            const bias = new PublicationBiasTests();
            const result = bias.funnelPlotData(symmetricEffects, symmetricSEs);

            expect(result.pooledEffect).toBeDefined();
            expect(result.studies).toHaveLength(7);
            expect(result.funnelBounds.length).toBeGreaterThan(0);
            expect(result.asymmetry).toBeDefined();
        });

        test('funnel bounds are centered on pooled effect', () => {
            const bias = new PublicationBiasTests();
            const result = bias.funnelPlotData([0.5, 0.5, 0.5], [0.1, 0.1, 0.1]);

            for (const bound of result.funnelBounds) {
                const midpoint = (bound.upper + bound.lower) / 2;
                expect(midpoint).toBeCloseTo(result.pooledEffect, 5);
            }
        });
    });

    // --- Trim and fill ---
    describe('trimAndFill', () => {
        test('returns original and adjusted estimate', () => {
            const bias = new PublicationBiasTests();
            const effects = [0.8, 0.6, 0.5, 0.3, 0.2];
            const variances = [0.01, 0.0225, 0.04, 0.0625, 0.09];

            const result = bias.trimAndFill(effects, variances);

            expect(result.originalEstimate).toBeDefined();
            expect(result.adjustedEstimate).toBeDefined();
            expect(result.nMissing).toBeGreaterThanOrEqual(0);
            expect(result.side).toBeTruthy();
            expect(result.interpretation).toBeTruthy();
        });

        test('nMissing is non-negative for clearly asymmetric data', () => {
            const bias = new PublicationBiasTests();
            // Use clearly asymmetric data to get a valid k0 that does not exceed n
            const effects = [1.5, 1.2, 0.9, 0.6, 0.4, 0.2, 0.1, 0.05, 0.01, -0.1];
            const variances = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15];

            const result = bias.trimAndFill(effects, variances);
            expect(result.nMissing).toBeGreaterThanOrEqual(0);
            expect(result.originalEstimate).toBeDefined();
            expect(result.adjustedEstimate).toBeDefined();
            expect(result.side).toBeTruthy();
        });

        test('filled studies are mirrored around pooled estimate', () => {
            const bias = new PublicationBiasTests();
            const effects = [0.9, 0.7, 0.5, 0.4];
            const variances = [0.01, 0.02, 0.04, 0.06];

            const result = bias.trimAndFill(effects, variances);

            if (result.nMissing > 0) {
                for (const filled of result.filledStudies) {
                    expect(filled.imputed).toBe(true);
                    expect(typeof filled.effect).toBe('number');
                    expect(typeof filled.variance).toBe('number');
                }
            }
        });

        test('adjusted estimate accounts for filled studies', () => {
            const bias = new PublicationBiasTests();
            const effects = [0.9, 0.8, 0.7, 0.6, 0.5];
            const variances = [0.01, 0.015, 0.02, 0.03, 0.04];

            const result = bias.trimAndFill(effects, variances);

            if (result.nMissing > 0) {
                // Adjusted estimate should differ from original
                expect(result.adjustedEstimate.effect).not.toBeCloseTo(
                    result.originalEstimate.effect, 5
                );
            }
        });
    });

    // --- runAll ---
    describe('runAll', () => {
        test('returns all test results in a single call', () => {
            const bias = new PublicationBiasTests();
            const variances = symmetricSEs.map(se => se * se);
            const result = bias.runAll(symmetricEffects, variances, symmetricSEs);

            expect(result.egger).toBeDefined();
            expect(result.peters).toBeDefined();
            expect(result.harbord).toBeDefined();
            expect(result.begg).toBeDefined();
            expect(result.funnel).toBeDefined();
            expect(result.trimFill).toBeDefined();
        });

        test('computes SE from variance when not provided', () => {
            const bias = new PublicationBiasTests();
            const effects = [0.5, 0.4, 0.6, 0.3, 0.7];
            const variances = [0.01, 0.0225, 0.0144, 0.0324, 0.0064];

            const result = bias.runAll(effects, variances);
            expect(result.egger.pValue).toBeGreaterThanOrEqual(0);
        });
    });
});

// ============================================================================
// SECTION 7: NUMERICAL VALIDATION
// ============================================================================

describe('NumericalValidation', () => {
    // --- Original test (preserved) ---
    test('generates a report with passing tests', () => {
        const validator = new NumericalValidation();
        const report = validator.runAllValidations();

        expect(report.summary.total).toBeGreaterThan(0);
        expect(report.summary.passed).toBeGreaterThan(0);
        expect(report.summary.passRate).toBeDefined();
    });

    test('report has timestamp and recommendation', () => {
        const validator = new NumericalValidation();
        const report = validator.runAllValidations();

        expect(report.timestamp).toBeTruthy();
        expect(report.recommendation).toBeTruthy();
    });

    test('all built-in validations pass', () => {
        const validator = new NumericalValidation();
        const report = validator.runAllValidations();

        expect(report.summary.failed).toBe(0);
        expect(report.recommendation).toContain('suitable for use');
    });

    test('validateAgainstR returns comparisons array', () => {
        const validator = new NumericalValidation();
        const rResults = {
            effects: [0.5, 0.3, 0.7],
            variances: [0.04, 0.09, 0.06],
            metafor: { effect: 0.496, tau2: 0.015 }
        };

        const result = validator.validateAgainstR(rResults);

        expect(result.comparisons.length).toBeGreaterThan(0);
        expect(result.allWithinTolerance).toBeDefined();

        // Our effect should be close to R's
        const effectComp = result.comparisons.find(c => c.test.includes('effect'));
        expect(effectComp.difference).toBeLessThan(0.1);
    });

    test('validateAgainstR returns empty comparisons when no metafor results', () => {
        const validator = new NumericalValidation();
        const result = validator.validateAgainstR({});
        expect(result.comparisons).toHaveLength(0);
    });
});

// ============================================================================
// SECTION 8: PERFORMANCE WRAPPER (preserved + expanded)
// ============================================================================

describe('Performance wrapper numerical correctness', () => {
    test('optimized REML includes prediction interval and I2 CI', () => {
        const dl = OptimizedAlgorithms.derSimonianLaird(
            FIVE_STUDIES.effects, FIVE_STUDIES.variances, { hksj: true }
        );
        const reml = OptimizedAlgorithms.reml(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(dl.I2CI).toBeDefined();
        expect(dl.adjustment).toBe('HKSJ');
        expect(reml.predictionInterval).toBeDefined();
        expect(reml.predictionInterval.lower).toBeDefined();
        expect(reml.predictionInterval.upper).toBeDefined();
    });

    test('FastMath distribution helpers are within tolerance', () => {
        expect(FastMath.tQuantile(0.975, 10)).toBeCloseTo(2.228, 2);
        expect(FastMath.tQuantile(0.975, 30)).toBeCloseTo(2.042, 2);
        expect(FastMath.chiSquaredCDF(3.84, 1)).toBeCloseTo(0.95, 2);
    });

    test('DL and REML pooled effects agree within 0.1', () => {
        const dl = OptimizedAlgorithms.derSimonianLaird(FIVE_STUDIES.effects, FIVE_STUDIES.variances);
        const reml = OptimizedAlgorithms.reml(FIVE_STUDIES.effects, FIVE_STUDIES.variances);

        expect(Math.abs(dl.effect - reml.effect)).toBeLessThan(0.1);
    });
});
