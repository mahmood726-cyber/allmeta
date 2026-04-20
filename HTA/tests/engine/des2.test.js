/**
 * Additional tests for src/engine/des.js
 * Targeting uncovered lines: 117-263 (distribution sampling — lognormal, loglogistic,
 *   gompertz, gamma, empirical, sampleGamma, normalInverse, sampleFromSurvivalCurve),
 *   716-916 (runComparison, runWithPSA, PriorityQueue, PCG32)
 */

'use strict';

const { performance } = require('perf_hooks');

const { PCG32 } = require('../../src/utils/pcg32');
PCG32.prototype.random = PCG32.prototype.nextFloat;
global.PCG32 = PCG32;
global.performance = global.performance || performance;

const {
    DiscreteEventSimulationEngine,
    PriorityQueue
} = require('../../src/engine/des');

function createSimpleModel() {
    return {
        initialState: 'healthy',
        states: {
            healthy: {
                costPerTime: 1000,
                utilityPerTime: 0.8,
                scheduledEvents: [
                    {
                        event: 'death',
                        distribution: 'exponential',
                        parameters: { rate: 0.1 }
                    }
                ]
            },
            dead: {
                terminal: true,
                costPerTime: 0,
                utilityPerTime: 0
            }
        },
        events: {
            death: { cost: 0 }
        },
        transitions: [
            { trigger: 'death', from: 'healthy', to: 'dead' }
        ]
    };
}

// ---------------------------------------------------------------------------
// Distribution sampling (lines 117-263)
// ---------------------------------------------------------------------------

describe('DES distribution sampling — additional distributions', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine({ seed: 12345 });
        engine.defineModel(createSimpleModel());
    });

    test('lognormal distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('lognormal', { mu: 2, sigma: 0.5 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('loglogistic distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('loglogistic', { alpha: 10, beta: 2 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('gompertz distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('gompertz', { a: 0.05, b: 0.01 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('gamma distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('gamma', { shape: 2, scale: 5 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('gamma distribution with shape < 1', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 10; i++) {
            const t = engine.sampleTimeToEvent('gamma', { shape: 0.5, scale: 5 }, patient);
            expect(t).toBeGreaterThan(0);
        }
    });

    test('empirical distribution samples from survival curve', () => {
        const patient = engine.createPatient(0);
        const curve = [
            { time: 0, survival: 1.0 },
            { time: 5, survival: 0.8 },
            { time: 10, survival: 0.5 },
            { time: 20, survival: 0.2 },
            { time: 30, survival: 0.05 }
        ];
        const t = engine.sampleTimeToEvent('empirical', { survivalCurve: curve }, patient);
        expect(t).toBeGreaterThan(0);
        expect(Number.isFinite(t)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// normalInverse edge cases (lines 197-239)
// ---------------------------------------------------------------------------

describe('DES normalInverse edge cases', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine({ seed: 42 });
    });

    test('normalInverse(0) returns -Infinity', () => {
        expect(engine.normalInverse(0)).toBe(-Infinity);
    });

    test('normalInverse(1) returns Infinity', () => {
        expect(engine.normalInverse(1)).toBe(Infinity);
    });

    test('normalInverse(0.5) returns approximately 0', () => {
        expect(engine.normalInverse(0.5)).toBeCloseTo(0, 5);
    });

    test('normalInverse handles low tail (p < 0.02425)', () => {
        const val = engine.normalInverse(0.001);
        expect(val).toBeLessThan(-2);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('normalInverse handles high tail (p > 0.97575)', () => {
        const val = engine.normalInverse(0.999);
        expect(val).toBeGreaterThan(2);
        expect(Number.isFinite(val)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// sampleFromSurvivalCurve (lines 244-264)
// ---------------------------------------------------------------------------

describe('DES sampleFromSurvivalCurve', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine({ seed: 42 });
    });

    test('returns first time when u=0 (target=1.0)', () => {
        const curve = [
            { time: 0, survival: 1.0 },
            { time: 10, survival: 0.5 },
            { time: 20, survival: 0.1 }
        ];
        const t = engine.sampleFromSurvivalCurve(curve, 0);
        expect(t).toBe(0);
    });

    test('interpolates between curve points', () => {
        const curve = [
            { time: 0, survival: 1.0 },
            { time: 10, survival: 0.5 },
            { time: 20, survival: 0.0 }
        ];
        // u=0.5 => target = 0.5, should be around t=10
        const t = engine.sampleFromSurvivalCurve(curve, 0.5);
        expect(t).toBeCloseTo(10, 0);
    });
});

// ---------------------------------------------------------------------------
// runComparison (lines 715-745)
// ---------------------------------------------------------------------------

describe('DES runComparison', () => {
    test('runs comparison of two strategies', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 20,
            seed: 42,
            maxTime: 20
        });

        const strategies = {
            standard: {
                model: createSimpleModel(),
                options: {}
            },
            treatment: {
                model: {
                    ...createSimpleModel(),
                    states: {
                        healthy: {
                            costPerTime: 2000,
                            utilityPerTime: 0.9,
                            scheduledEvents: [{
                                event: 'death',
                                distribution: 'exponential',
                                parameters: { rate: 0.05 }
                            }]
                        },
                        dead: { terminal: true, costPerTime: 0, utilityPerTime: 0 }
                    }
                },
                options: {}
            }
        };

        const result = await engine.runComparison(strategies);

        expect(result.standard).toBeDefined();
        expect(result.treatment).toBeDefined();
        expect(result.incremental).toBeDefined();
        expect(Number.isFinite(result.incremental.incrementalCost)).toBe(true);
        expect(Number.isFinite(result.incremental.incrementalQALY)).toBe(true);
        expect(Number.isFinite(result.incremental.icer)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// runWithPSA (lines 750-830)
// ---------------------------------------------------------------------------

describe('DES runWithPSA', () => {
    test('returns PSA results with correct structure', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 5,
            seed: 42,
            maxTime: 10
        });

        const model = createSimpleModel();
        const paramSampler = (iter) => ({
            costMultiplier: 1 + iter * 0.01,
            rate: 0.1
        });

        const result = await engine.runWithPSA(model, paramSampler, {
            iterations: 3,
            wtp: [20000, 30000],
            discountRate: 0.035
        });

        expect(result.iterations).toHaveLength(3);
        expect(result.summary.meanCost).toBeDefined();
        expect(result.summary.meanQALY).toBeDefined();
        expect(Number.isFinite(result.summary.meanCost.mean)).toBe(true);
        expect(Number.isFinite(result.summary.meanQALY.mean)).toBe(true);
        expect(result.summary.meanCost.se).toBeGreaterThanOrEqual(0);
        expect(result.summary.meanQALY.se).toBeGreaterThanOrEqual(0);
        expect(result.summary.meanCost.ci).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// PriorityQueue additional coverage (lines 837-886)
// ---------------------------------------------------------------------------

describe('PriorityQueue additional', () => {
    test('maintains order with many insertions', () => {
        const pq = new PriorityQueue();
        const times = [10, 3, 7, 1, 5, 8, 2, 9, 4, 6];

        for (const t of times) {
            pq.enqueue({ time: t }, t);
        }

        const result = [];
        while (!pq.isEmpty()) {
            result.push(pq.dequeue().time);
        }

        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
        }
    });

    test('size tracks insertions and removals', () => {
        const pq = new PriorityQueue();
        expect(pq.size()).toBe(0);

        pq.enqueue('a', 1);
        pq.enqueue('b', 2);
        expect(pq.size()).toBe(2);

        pq.dequeue();
        expect(pq.size()).toBe(1);

        pq.dequeue();
        expect(pq.size()).toBe(0);
        expect(pq.isEmpty()).toBe(true);
    });
});
