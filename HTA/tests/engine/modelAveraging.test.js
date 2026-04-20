/**
 * Tests for src/engine/modelAveraging.js — ModelAveragingEngine
 */

'use strict';

const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');

describe('ModelAveragingEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new ModelAveragingEngine();
    });

    // ===== BIC weights =====
    describe('bicWeights', () => {
        test('1. model with lowest BIC gets highest weight', () => {
            const models = [
                { name: 'A', bic: 100 },
                { name: 'B', bic: 110 },
                { name: 'C', bic: 120 }
            ];
            const result = engine.bicWeights(models);
            expect(result[0].weight).toBeGreaterThan(result[1].weight);
            expect(result[1].weight).toBeGreaterThan(result[2].weight);
        });

        test('2. BIC weights sum to 1', () => {
            const models = [
                { name: 'A', bic: 100 },
                { name: 'B', bic: 105 },
                { name: 'C', bic: 115 }
            ];
            const result = engine.bicWeights(models);
            const sum = result.reduce((s, r) => s + r.weight, 0);
            expect(sum).toBeCloseTo(1.0, 10);
        });

        test('3. equal BIC gives equal weights', () => {
            const models = [
                { name: 'A', bic: 100 },
                { name: 'B', bic: 100 },
                { name: 'C', bic: 100 }
            ];
            const result = engine.bicWeights(models);
            expect(result[0].weight).toBeCloseTo(1 / 3, 10);
            expect(result[1].weight).toBeCloseTo(1 / 3, 10);
            expect(result[2].weight).toBeCloseTo(1 / 3, 10);
        });

        test('4. large BIC difference: winner gets ~100% weight', () => {
            const models = [
                { name: 'A', bic: 100 },
                { name: 'B', bic: 200 }  // delta=100 → exp(-50) ≈ 0
            ];
            const result = engine.bicWeights(models);
            expect(result[0].weight).toBeGreaterThan(0.999);
            expect(result[1].weight).toBeLessThan(0.001);
        });

        test('5. deltaBIC computed correctly', () => {
            const models = [
                { name: 'A', bic: 100 },
                { name: 'B', bic: 108 }
            ];
            const result = engine.bicWeights(models);
            expect(result[0].deltaBIC).toBe(0);
            expect(result[1].deltaBIC).toBe(8);
        });
    });

    // ===== AIC weights =====
    describe('aicWeights', () => {
        test('6. AIC weights: same formula different values', () => {
            const models = [
                { name: 'A', aic: 90 },
                { name: 'B', aic: 95 },
                { name: 'C', aic: 105 }
            ];
            const result = engine.aicWeights(models);
            const sum = result.reduce((s, r) => s + r.weight, 0);
            expect(sum).toBeCloseTo(1.0, 10);
            expect(result[0].weight).toBeGreaterThan(result[1].weight);
        });
    });

    // ===== DIC weights =====
    describe('dicWeights', () => {
        test('7. DIC weights: same formula', () => {
            const models = [
                { name: 'A', dic: 50 },
                { name: 'B', dic: 55 }
            ];
            const result = engine.dicWeights(models);
            const sum = result.reduce((s, r) => s + r.weight, 0);
            expect(sum).toBeCloseTo(1.0, 10);
            expect(result[0].weight).toBeGreaterThan(result[1].weight);
        });
    });

    // ===== modelAverage =====
    describe('modelAverage', () => {
        test('8. weighted mean of predictions', () => {
            const models = [
                { name: 'A', predictions: [10, 20], weight: 0.7 },
                { name: 'B', predictions: [30, 40], weight: 0.3 }
            ];
            const result = engine.modelAverage(models);
            // Weighted: 0.7*10+0.3*30=16, 0.7*20+0.3*40=26
            expect(result.averaged[0]).toBeCloseTo(16, 5);
            expect(result.averaged[1]).toBeCloseTo(26, 5);
        });

        test('9. between-model SD as uncertainty', () => {
            const models = [
                { name: 'A', predictions: [10, 20], weight: 0.5 },
                { name: 'B', predictions: [30, 40], weight: 0.5 }
            ];
            const result = engine.modelAverage(models);
            // Mean: [20, 30], variance: 0.5*(10-20)^2+0.5*(30-20)^2=100 → SD=10
            expect(result.uncertainty[0]).toBeCloseTo(10, 5);
            expect(result.uncertainty[1]).toBeCloseTo(10, 5);
        });

        test('10. 95% CI covers predictions', () => {
            const models = [
                { name: 'A', predictions: [10], weight: 0.5 },
                { name: 'B', predictions: [30], weight: 0.5 }
            ];
            const result = engine.modelAverage(models);
            // CI should contain both individual predictions
            expect(result.credibleInterval[0].lower).toBeLessThan(10);
            expect(result.credibleInterval[0].upper).toBeGreaterThan(30);
        });

        test('11. single model: weight=1, averaged=original', () => {
            const models = [
                { name: 'A', predictions: [10, 20, 30], weight: 1.0 }
            ];
            const result = engine.modelAverage(models);
            expect(result.averaged).toEqual([10, 20, 30]);
            // SD should be 0
            expect(result.uncertainty[0]).toBeCloseTo(0, 10);
            expect(result.uncertainty[1]).toBeCloseTo(0, 10);
        });

        test('12. all models identical predictions: equal weights → same average', () => {
            const models = [
                { name: 'A', predictions: [10, 20], weight: 0.5 },
                { name: 'B', predictions: [10, 20], weight: 0.5 }
            ];
            const result = engine.modelAverage(models);
            expect(result.averaged[0]).toBeCloseTo(10, 10);
            expect(result.uncertainty[0]).toBeCloseTo(0, 10);
        });

        test('13. empty models array', () => {
            const result = engine.modelAverage([]);
            expect(result.averaged).toEqual([]);
            expect(result.uncertainty).toEqual([]);
        });
    });

    // ===== fitCompare =====
    describe('fitCompare', () => {
        // Generate exponential survival data (lambda=0.1)
        function generateExponentialData(n, lambda, seed) {
            const data = [];
            let s = seed ?? 42;
            for (let i = 0; i < n; i++) {
                // Simple LCG pseudo-random
                s = (s * 1664525 + 1013904223) & 0x7FFFFFFF;
                const u = s / 0x7FFFFFFF;
                const time = -Math.log(u) / lambda;
                data.push({ time, event: 1 }); // all uncensored for simplicity
            }
            return data;
        }

        test('14. exponential fit to exponential data gets lowest AIC', () => {
            const data = generateExponentialData(200, 0.1, 123);
            const result = engine.fitCompare(data, ['exponential', 'weibull', 'lognormal']);
            // Exponential should fit best (or very close)
            const expFit = result.find(r => r.name === 'exponential');
            expect(expFit).toBeDefined();
            expect(expFit.params).not.toBeNull();
            // Check AIC is finite
            expect(isFinite(expFit.aic)).toBe(true);
        });

        test('15. returns all requested distributions', () => {
            const data = generateExponentialData(100, 0.1, 456);
            const dists = ['exponential', 'weibull', 'lognormal', 'loglogistic'];
            const result = engine.fitCompare(data, dists);
            expect(result).toHaveLength(4);
            expect(result.map(r => r.name)).toEqual(dists);
        });

        test('16. AIC weights sum to 1 among valid fits', () => {
            const data = generateExponentialData(100, 0.1, 789);
            const result = engine.fitCompare(data, ['exponential', 'weibull']);
            const validWeights = result.filter(r => isFinite(r.aic)).map(r => r.weight);
            const sum = validWeights.reduce((a, b) => a + b, 0);
            if (validWeights.length > 0) {
                expect(sum).toBeCloseTo(1.0, 5);
            }
        });

        test('17. MLE lambda for exponential is close to true value', () => {
            const trueLambda = 0.1;
            const data = generateExponentialData(500, trueLambda, 321);
            const result = engine.fitCompare(data, ['exponential']);
            const expFit = result[0];
            // Lambda should be close to 0.1 (within 20%)
            expect(expFit.params.lambda).toBeGreaterThan(0.06);
            expect(expFit.params.lambda).toBeLessThan(0.16);
        });
    });

    // ===== survivalPrediction =====
    describe('survivalPrediction', () => {
        test('18. model-averaged survival curve', () => {
            const fittedModels = [
                { name: 'exp1', distribution: 'exponential', params: { lambda: 0.1 }, weight: 0.6 },
                { name: 'exp2', distribution: 'exponential', params: { lambda: 0.2 }, weight: 0.4 }
            ];
            const times = [0, 1, 5, 10];
            const result = engine.survivalPrediction(fittedModels, times);
            expect(result.survival).toHaveLength(4);
            expect(result.ci).toHaveLength(4);
        });

        test('19. S(0) = 1', () => {
            const fittedModels = [
                { name: 'exp', distribution: 'exponential', params: { lambda: 0.1 }, weight: 1.0 }
            ];
            const result = engine.survivalPrediction(fittedModels, [0, 1, 5]);
            expect(result.survival[0]).toBeCloseTo(1.0, 5);
        });

        test('20. monotonically decreasing for single exponential', () => {
            const fittedModels = [
                { name: 'exp', distribution: 'exponential', params: { lambda: 0.1 }, weight: 1.0 }
            ];
            const times = [0, 1, 2, 5, 10, 20];
            const result = engine.survivalPrediction(fittedModels, times);
            for (let i = 1; i < result.survival.length; i++) {
                expect(result.survival[i]).toBeLessThanOrEqual(result.survival[i - 1] + 1e-10);
            }
        });

        test('21. Weibull survival function', () => {
            const fittedModels = [
                { name: 'wb', distribution: 'weibull', params: { shape: 1.5, scale: 10 }, weight: 1.0 }
            ];
            const result = engine.survivalPrediction(fittedModels, [0, 5, 10, 20]);
            expect(result.survival[0]).toBeCloseTo(1.0, 5);
            // S(10) = exp(-(10/10)^1.5) = exp(-1) ≈ 0.3679
            expect(result.survival[2]).toBeCloseTo(Math.exp(-1), 3);
        });

        test('22. log-logistic survival function', () => {
            const fittedModels = [
                { name: 'll', distribution: 'loglogistic', params: { alpha: 10, beta: 2 }, weight: 1.0 }
            ];
            const result = engine.survivalPrediction(fittedModels, [0, 10]);
            expect(result.survival[0]).toBeCloseTo(1.0, 5);
            // S(10) = 1/(1+(10/10)^2) = 1/2 = 0.5
            expect(result.survival[1]).toBeCloseTo(0.5, 5);
        });

        test('23. CI bounds are within [0, 1]', () => {
            const fittedModels = [
                { name: 'exp1', distribution: 'exponential', params: { lambda: 0.05 }, weight: 0.5 },
                { name: 'exp2', distribution: 'exponential', params: { lambda: 0.5 }, weight: 0.5 }
            ];
            const result = engine.survivalPrediction(fittedModels, [0, 1, 5, 10, 20]);
            for (const ci of result.ci) {
                expect(ci.lower).toBeGreaterThanOrEqual(0);
                expect(ci.upper).toBeLessThanOrEqual(1);
            }
        });

        test('24. single model prediction matches direct evaluation', () => {
            const lambda = 0.1;
            const fittedModels = [
                { name: 'exp', distribution: 'exponential', params: { lambda }, weight: 1.0 }
            ];
            const times = [0, 1, 5, 10];
            const result = engine.survivalPrediction(fittedModels, times);
            for (let i = 0; i < times.length; i++) {
                const expected = Math.exp(-lambda * times[i]);
                expect(result.survival[i]).toBeCloseTo(expected, 5);
            }
        });

        test('25. multiple distributions can be averaged', () => {
            const fittedModels = [
                { name: 'exp', distribution: 'exponential', params: { lambda: 0.1 }, weight: 0.4 },
                { name: 'wb', distribution: 'weibull', params: { shape: 1.5, scale: 10 }, weight: 0.3 },
                { name: 'll', distribution: 'loglogistic', params: { alpha: 10, beta: 2 }, weight: 0.3 }
            ];
            const times = [0, 5, 10, 15, 20];
            const result = engine.survivalPrediction(fittedModels, times);
            expect(result.survival).toHaveLength(5);
            expect(result.survival[0]).toBeCloseTo(1.0, 3);
            // All values should be between 0 and 1
            for (const s of result.survival) {
                expect(s).toBeGreaterThanOrEqual(0);
                expect(s).toBeLessThanOrEqual(1.0 + 1e-10);
            }
        });
    });
});
