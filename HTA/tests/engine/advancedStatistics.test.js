/**
 * Tests for src/engine/advancedStatistics.js
 */

'use strict';

const {
    EVSICalculator,
    BayesianModelAveraging,
    FlexibleSurvival,
    MultiStateMarkov,
    StressTesting,
    MetaRegression
} = require('../../src/engine/advancedStatistics');

// ---------------------------------------------------------------------------
// EVSICalculator
// ---------------------------------------------------------------------------

describe('EVSICalculator', () => {
    let evsi;

    beforeEach(() => {
        evsi = new EVSICalculator({
            iterations: 100,
            preposteriorSamples: 50,
            sampleSizes: [50, 100],
            seed: 42
        });
    });

    test('_createRNG produces deterministic sequence', () => {
        const rng1 = evsi._createRNG(42);
        const rng2 = evsi._createRNG(42);
        const seq1 = [rng1(), rng1(), rng1()];
        const seq2 = [rng2(), rng2(), rng2()];
        expect(seq1).toEqual(seq2);
    });

    test('_sampleNormal produces values around mean', () => {
        const samples = [];
        for (let i = 0; i < 500; i++) {
            samples.push(evsi._sampleNormal(10, 1));
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        expect(mean).toBeCloseTo(10, 0);
    });

    test('_sampleBeta produces values in [0, 1]', () => {
        for (let i = 0; i < 100; i++) {
            const v = evsi._sampleBeta(2, 5);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    test('_sampleGamma produces positive values', () => {
        for (let i = 0; i < 100; i++) {
            const v = evsi._sampleGamma(2, 1);
            expect(v).toBeGreaterThan(0);
        }
    });

    test('_sampleFromPrior handles normal type', () => {
        const v = evsi._sampleFromPrior({ mean: 5, se: 1, type: 'normal' });
        expect(Number.isFinite(v)).toBe(true);
    });

    test('_sampleFromPrior handles beta type', () => {
        const v = evsi._sampleFromPrior({ mean: 0.5, se: 0.1, type: 'beta' });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
    });

    test('_sampleFromPrior handles lognormal type', () => {
        const v = evsi._sampleFromPrior({ mean: 5, se: 1, type: 'lognormal' });
        expect(v).toBeGreaterThan(0);
    });

    test('_sampleFromPrior handles gamma type', () => {
        const v = evsi._sampleFromPrior({ mean: 5, se: 1, type: 'gamma' });
        expect(v).toBeGreaterThan(0);
    });

    test('_sampleFromPrior fallback for invalid beta params', () => {
        const v = evsi._sampleFromPrior({ mean: 0, se: 0.1, type: 'beta' });
        expect(v).toBe(0);
    });

    test('_findOptimalSampleSize picks highest EVSI per participant', () => {
        const results = [
            { sampleSize: 50, evsiPerParticipant: 10 },
            { sampleSize: 100, evsiPerParticipant: 20 },
            { sampleSize: 200, evsiPerParticipant: 15 }
        ];
        const best = evsi._findOptimalSampleSize(results);
        expect(best.sampleSize).toBe(100);
    });

    test('_updatePrior produces narrower posterior with more data', () => {
        const prior = { mean: 5, se: 1, type: 'normal' };
        const data = { mean: 5.5, se: 0.2, n: 100 };
        const posterior = evsi._updatePrior(prior, data, 100);

        expect(posterior.se).toBeLessThan(prior.se);
    });
});

// ---------------------------------------------------------------------------
// BayesianModelAveraging
// ---------------------------------------------------------------------------

describe('BayesianModelAveraging', () => {
    let bma;

    beforeEach(() => {
        bma = new BayesianModelAveraging({ seed: 42 });
    });

    test('averageSurvival returns models sorted by posterior probability', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

        const result = bma.averageSurvival(times, events, ['exponential', 'weibull', 'lognormal']);

        expect(result.models.length).toBe(3);
        // Sorted by posterior probability descending
        for (let i = 0; i < result.models.length - 1; i++) {
            expect(result.models[i].posteriorProbability).toBeGreaterThanOrEqual(
                result.models[i + 1].posteriorProbability
            );
        }
    });

    test('posterior probabilities sum to 1', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

        const result = bma.averageSurvival(times, events, ['exponential', 'weibull']);
        const sum = result.models.reduce((s, m) => s + m.posteriorProbability, 0);
        expect(sum).toBeCloseTo(1, 8);
    });

    test('averagedSurvival returns function that gives values in [0, 1]', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

        const result = bma.averageSurvival(times, events, ['exponential', 'weibull']);
        const sv = result.averagedSurvival(5);
        expect(sv).toBeGreaterThanOrEqual(0);
        expect(sv).toBeLessThanOrEqual(1);
    });

    test('predictSurvival returns array of predictions', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

        const result = bma.averageSurvival(times, events, ['exponential']);
        const predictions = result.predictSurvival([1, 5, 10]);
        expect(predictions.length).toBe(3);
        for (const p of predictions) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    test('_fitDistribution handles all distribution types', () => {
        const times = [1, 2, 3, 4, 5];
        const events = [1, 1, 1, 1, 1];

        for (const dist of ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma']) {
            const params = bma._fitDistribution(times, events, dist);
            expect(params).toBeDefined();
        }
    });

    test('_fitDistribution returns defaults when no events', () => {
        const times = [1, 2, 3, 4, 5];
        const events = [0, 0, 0, 0, 0];

        const params = bma._fitDistribution(times, events, 'weibull');
        expect(params.shape).toBe(1);
        expect(params.scale).toBe(10);
    });

    test('_survivalFunction is monotonically decreasing for exponential', () => {
        const params = { rate: 0.1 };
        let prev = 1;
        for (let t = 0; t <= 20; t += 1) {
            const S = bma._survivalFunction(t, params, 'exponential');
            expect(S).toBeLessThanOrEqual(prev + 1e-10);
            prev = S;
        }
    });
});

// ---------------------------------------------------------------------------
// FlexibleSurvival
// ---------------------------------------------------------------------------

describe('FlexibleSurvival', () => {
    let flex;

    beforeEach(() => {
        flex = new FlexibleSurvival({ df: 3 });
    });

    test('fit returns predict and hazard functions', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];

        const result = flex.fit(times, events);
        expect(typeof result.predict).toBe('function');
        expect(typeof result.hazard).toBe('function');
    });

    test('predict returns survival in [0, 1] for hazard scale', () => {
        const flexHazard = new FlexibleSurvival({ df: 3, scale: 'hazard' });
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];

        const result = flexHazard.fit(times, events);
        const sv = result.predict(5);
        expect(sv).toBeGreaterThanOrEqual(0);
        expect(sv).toBeLessThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// MultiStateMarkov
// ---------------------------------------------------------------------------

describe('MultiStateMarkov', () => {
    let msm;

    beforeEach(() => {
        msm = new MultiStateMarkov({ timeStep: 1, maxTime: 20 });
    });

    test('defineModel identifies absorbing states', () => {
        const states = [
            { id: 'healthy', label: 'Healthy' },
            { id: 'sick', label: 'Sick' },
            { id: 'dead', label: 'Dead' }
        ];
        const transitions = [
            { from: 'healthy', to: 'sick', probability: 0.1 },
            { from: 'healthy', to: 'dead', probability: 0.02 },
            { from: 'sick', to: 'dead', probability: 0.2 },
            { from: 'sick', to: 'healthy', probability: 0.1 }
        ];

        msm.defineModel(states, transitions);
        expect(msm.absorbing).toContain('dead');
        expect(msm.absorbing).not.toContain('healthy');
    });

    test('simulate returns state occupancy and transition counts', () => {
        const states = [
            { id: 'A', label: 'A' },
            { id: 'B', label: 'B' }
        ];
        const transitions = [
            { from: 'A', to: 'B', probability: 0.3 }
        ];

        msm.defineModel(states, transitions);
        const result = msm.simulate('A', { nPatients: 50, seed: 42 });

        expect(result.stateOccupancy).toBeDefined();
        expect(result.transitionCounts).toBeDefined();
        expect(result.nPatients).toBe(50);
        expect(result.meanSojourn).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// StressTesting
// ---------------------------------------------------------------------------

describe('StressTesting', () => {
    test('generateExtremeScenarios creates worst and best case', () => {
        const modelFn = (params) => ({ cost: params.cost, effect: params.effect });
        const st = new StressTesting(modelFn, { cost: 100, effect: 5 });

        const scenarios = st.generateExtremeScenarios({
            cost: { min: 50, max: 200, direction: 'cost' },
            effect: { min: 2, max: 8, direction: 'effect' }
        });

        expect(scenarios.length).toBe(2);
        expect(scenarios[0].name).toBe('Worst Case');
        expect(scenarios[1].name).toBe('Best Case');
        expect(scenarios[0].changes.cost).toBe(200);
        expect(scenarios[0].changes.effect).toBe(2);
        expect(scenarios[1].changes.cost).toBe(50);
        expect(scenarios[1].changes.effect).toBe(8);
    });

    test('findThresholds detects decision change', () => {
        const modelFn = (params) => ({
            cost: params.cost,
            effect: params.effect
        });
        const st = new StressTesting(modelFn, { cost: 100, effect: 5 });

        // At wtp=30: nmb = effect*30 - cost
        // At effect=5: nmb = 150 - 100 = 50 (adopt)
        // We want to find where nmb = 0: effect*30 - cost = 0 => effect = cost/30 ~ 3.33
        const thresholds = st.findThresholds('effect', { min: 0, max: 10 }, 30, 0.01);

        expect(thresholds.length).toBeGreaterThan(0);
        const firstThreshold = thresholds[0];
        expect(firstThreshold.parameter).toBe('effect');
        expect(firstThreshold.thresholdValue).toBeCloseTo(100 / 30, 0);
    });

    test('_calculateICER handles zero delta effect', () => {
        const modelFn = (params) => params;
        const st = new StressTesting(modelFn, {});

        const icer = st._calculateICER({ cost: 100, effect: 5 }, { cost: 200, effect: 5 });
        expect(icer).toBe(Infinity);
    });
});

// ---------------------------------------------------------------------------
// MetaRegression
// ---------------------------------------------------------------------------

describe('MetaRegression', () => {
    let mr;

    beforeEach(() => {
        mr = new MetaRegression();
    });

    test('fit with no covariates returns intercept-only model', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.01, 0.02, 0.01, 0.03, 0.02];

        const result = mr.fit(effects, variances, []);

        expect(result.coefficients.length).toBe(1);
        expect(result.coefficients[0]).toBeCloseTo(0.5, 0);
        expect(result.se.length).toBe(1);
    });

    test('fit with covariates returns regression coefficients', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.01, 0.02, 0.01, 0.03, 0.02];
        const covariates = [[1], [2], [3], [1.5], [2.5]];

        const result = mr.fit(effects, variances, covariates);

        expect(result.coefficients.length).toBe(2); // intercept + 1 covariate
        expect(result.fitted.length).toBe(5);
        expect(result.residuals.length).toBe(5);
        expect(typeof result.tau2).toBe('number');
    });

    test('I2 is between 0 and 100', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.01, 0.02, 0.01, 0.03, 0.02];

        const result = mr.fit(effects, variances, []);
        expect(result.I2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeLessThanOrEqual(100);
    });

    test('predict function works', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.01, 0.02, 0.01, 0.03, 0.02];
        const covariates = [[1], [2], [3], [1.5], [2.5]];

        const result = mr.fit(effects, variances, covariates);
        const prediction = result.predict([2]);
        expect(typeof prediction).toBe('number');
        expect(Number.isFinite(prediction)).toBe(true);
    });
});
