/**
 * Tests for src/engine/evsi.js — EVSIEngine
 * ~30 tests covering core EVSI, optimal sample size, population EVSI,
 * multi-parameter EVSI, conjugate helpers, edge cases, and validation.
 */

'use strict';

const { PCG32 } = require('../../src/utils/pcg32');
const { KahanSum } = require('../../src/utils/kahan');

// Make KahanSum available globally (EVSIEngine resolves via globalThis)
global.KahanSum = KahanSum;

const { EVSIEngine } = require('../../src/engine/evsi');

// ----------------------------------------------------------------
// Helper: generate deterministic mock PSA results using PCG32
// ----------------------------------------------------------------
function mockPSA(n, seed) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < n; i++) {
        const p = rng.beta(20, 30); // prior mean ~ 0.4
        const cost = rng.gamma(100, 50); // mean ~ 5000
        const qaly = p * 10;
        const nmb = qaly * 50000 - cost;
        iterations.push({
            params: { p_response: p, cost: cost },
            nmb: nmb,
            qaly: qaly,
            cost: cost,
            optimal: nmb > 0 ? 'Treatment' : 'Control'
        });
    }
    const evpi = 5000;
    return { iterations, evpi, wtp: 50000 };
}

/**
 * Generate PSA where all iterations agree (no decision uncertainty).
 */
function mockPSAUnanimous(n, seed) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < n; i++) {
        const p = 0.9 + rng.nextDouble() * 0.01; // very tight around 0.905
        const cost = 100 + rng.nextDouble() * 10;
        const nmb = p * 10 * 50000 - cost; // Always hugely positive
        iterations.push({
            params: { p_response: p, cost: cost },
            nmb: nmb,
            qaly: p * 10,
            cost: cost,
            optimal: 'Treatment'
        });
    }
    return { iterations, evpi: 0, wtp: 50000 };
}

/**
 * Generate PSA with roughly 50/50 decision split.
 */
function mockPSA5050(n, seed) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < n; i++) {
        // p_response centred so NMB is close to zero (50/50 decision)
        const p = rng.beta(50, 50); // mean = 0.5, tight
        const cost = 2500 + rng.normal(0, 10); // cost tightly around 2500
        const qaly = p * 0.1; // small QALYs
        const nmb = qaly * 50000 - cost; // ≈ 0.5*0.1*50000 - 2500 = 0
        iterations.push({
            params: { p_response: p, cost: cost },
            nmb: nmb,
            qaly: qaly,
            cost: cost,
            optimal: nmb > 0 ? 'Treatment' : 'Control'
        });
    }
    // Compute actual EVPI from the iterations
    const meanNMB = iterations.reduce((s, it) => s + it.nmb, 0) / n;
    let sumMax = 0;
    for (const it of iterations) sumMax += Math.max(0, it.nmb);
    const evpi = Math.max(0, sumMax / n - Math.max(0, meanNMB));
    return { iterations, evpi, wtp: 50000 };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('EVSIEngine', () => {
    let engine;
    let psa;

    beforeAll(() => {
        engine = new EVSIEngine({ seed: 12345, nOuter: 500, nInner: 200 });
        psa = mockPSA(500, 42);
    });

    // ================================================================
    // 1. EVSI <= EVPPI
    // ================================================================
    test('EVSI <= EVPPI: always true', () => {
        const result = engine.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(result.evsi).toBeLessThanOrEqual(result.evppi + 1e-10);
    });

    // ================================================================
    // 2. EVSI >= 0
    // ================================================================
    test('EVSI >= 0: information cannot have negative value', () => {
        const result = engine.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(result.evsi).toBeGreaterThanOrEqual(0);
    });

    // ================================================================
    // 3. EVSI increases with sample size (broadly)
    // ================================================================
    test('EVSI increases with sample size (n=50 < n=500)', () => {
        const r50 = engine.compute(psa, {
            sampleSize: 50,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        const r500 = engine.compute(psa, {
            sampleSize: 500,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r500.evsi).toBeGreaterThanOrEqual(r50.evsi - 1e-10);
    });

    // ================================================================
    // 4. EVSI(n->infinity) approaches EVPPI
    // ================================================================
    test('EVSI converges toward EVPPI for very large n', () => {
        const rLarge = engine.compute(psa, {
            sampleSize: 100000,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        // With n=100000 the proportion resolved should be > 0.95
        expect(rLarge.proportionResolved).toBeGreaterThan(0.95);
    });

    // ================================================================
    // 5. EVSI(n=0) = 0
    // ================================================================
    test('EVSI(n=0) equals 0 (no information from empty study)', () => {
        const r0 = engine.compute(psa, {
            sampleSize: 0,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r0.evsi).toBeCloseTo(0, 10);
        expect(r0.proportionResolved).toBeCloseTo(0, 10);
    });

    // ================================================================
    // 6. proportionResolved in [0, 1]
    // ================================================================
    test('proportionResolved is in [0, 1]', () => {
        for (const n of [0, 1, 10, 100, 1000]) {
            const r = engine.compute(psa, {
                sampleSize: n,
                parameter: 'p_response',
                dataModel: 'binomial'
            });
            expect(r.proportionResolved).toBeGreaterThanOrEqual(0);
            expect(r.proportionResolved).toBeLessThanOrEqual(1 + 1e-10);
        }
    });

    // ================================================================
    // 7. posteriorVariance < priorVariance
    // ================================================================
    test('posteriorVariance < priorVariance for n > 0', () => {
        const r = engine.compute(psa, {
            sampleSize: 100,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r.posteriorVariance).toBeLessThan(r.priorVariance);
    });

    // ================================================================
    // 8. Binomial posterior: correct conjugate formula
    // ================================================================
    test('binomialPosteriorVar: correct beta-binomial conjugate', () => {
        // Prior Beta(10, 10), n = 100
        // Expected successes = 100 * 0.5 = 50, postAlpha=60, postBeta=60
        // Var = 60*60 / (120*120*121)
        const v = engine.binomialPosteriorVar(10, 10, 100);
        const expected = (60 * 60) / (120 * 120 * 121);
        expect(v).toBeCloseTo(expected, 8);
    });

    // ================================================================
    // 9. Normal posterior: correct conjugate formula
    // ================================================================
    test('normalPosteriorVar: correct normal-normal conjugate', () => {
        // Prior var = 1.0, data var = 4.0, n = 10
        // Post var = 1 / (1/1 + 10/4) = 1 / 3.5 ≈ 0.2857
        const v = engine.normalPosteriorVar(1.0, 4.0, 10);
        expect(v).toBeCloseTo(1 / 3.5, 8);
    });

    // ================================================================
    // 10. Determinism: same seed produces same result
    // ================================================================
    test('determinism: same seed gives same EVSI', () => {
        const e1 = new EVSIEngine({ seed: 99 });
        const e2 = new EVSIEngine({ seed: 99 });
        const r1 = e1.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        const r2 = e2.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r1.evsi).toBe(r2.evsi);
        expect(r1.priorVariance).toBe(r2.priorVariance);
        expect(r1.posteriorVariance).toBe(r2.posteriorVariance);
    });

    // ================================================================
    // 11. optimalSampleSize: returns positive n
    // ================================================================
    test('optimalSampleSize: returns a non-negative optimal n', () => {
        const result = engine.optimalSampleSize(psa, 'p_response', 10, 1000, 'binomial');
        expect(result.optimalN).toBeGreaterThanOrEqual(0);
        expect(typeof result.optimalN).toBe('number');
    });

    // ================================================================
    // 12. optimalSampleSize: net value at optimal >= net at other n's
    // ================================================================
    test('optimalSampleSize: optimal n has highest net value', () => {
        const result = engine.optimalSampleSize(psa, 'p_response', 10, 1000, 'binomial');
        for (const point of result.curve) {
            expect(result.netValue).toBeGreaterThanOrEqual(point.net - 1e-10);
        }
    });

    // ================================================================
    // 13. optimalSampleSize: very expensive study -> optimal may be 0
    // ================================================================
    test('optimalSampleSize: very expensive study yields optimal n = 0', () => {
        // Cost per patient = 1,000,000 → every n has negative net value
        const result = engine.optimalSampleSize(psa, 'p_response', 1000000, 500, 'binomial');
        expect(result.optimalN).toBe(0);
        expect(result.netValue).toBeCloseTo(0, 5); // n=0 → EVSI=0, cost=0, net=0
    });

    // ================================================================
    // 14. optimalSampleSize: curve has multiple points
    // ================================================================
    test('optimalSampleSize: curve contains multiple evaluation points', () => {
        const result = engine.optimalSampleSize(psa, 'p_response', 10, 1000, 'binomial');
        expect(result.curve.length).toBeGreaterThan(5);
        // Each curve point has the required fields
        for (const pt of result.curve) {
            expect(pt).toHaveProperty('n');
            expect(pt).toHaveProperty('evsi');
            expect(pt).toHaveProperty('cost');
            expect(pt).toHaveProperty('net');
        }
    });

    // ================================================================
    // 15. populationEVSI: larger population -> higher pop EVSI
    // ================================================================
    test('populationEVSI: larger population yields higher value', () => {
        const r1 = engine.populationEVSI(1000, 500, 10, 0.035);
        const r2 = engine.populationEVSI(1000, 5000, 10, 0.035);
        expect(r2.populationEVSI).toBeGreaterThan(r1.populationEVSI);
    });

    // ================================================================
    // 16. populationEVSI: discounting reduces effective population
    // ================================================================
    test('populationEVSI: discounting reduces effective population', () => {
        const noDiscount = engine.populationEVSI(1000, 500, 10, 0);
        const withDiscount = engine.populationEVSI(1000, 500, 10, 0.05);
        expect(withDiscount.effectivePopulation).toBeLessThan(noDiscount.effectivePopulation);
    });

    // ================================================================
    // 17. populationEVSI: discountRate=0 -> effectivePopulation = pop * T
    // ================================================================
    test('populationEVSI: zero discount gives effectivePop = pop * timeHorizon', () => {
        const result = engine.populationEVSI(1000, 500, 10, 0);
        expect(result.effectivePopulation).toBeCloseTo(500 * 10, 5);
        expect(result.populationEVSI).toBeCloseTo(1000 * 5000, 2);
    });

    // ================================================================
    // 18. multiParameterEVSI: joint >= max individual
    // ================================================================
    test('multiParameterEVSI: joint EVSI >= max individual EVSI', () => {
        const designs = [
            { sampleSize: 200, parameter: 'p_response', dataModel: 'binomial' },
            { sampleSize: 200, parameter: 'cost', dataModel: 'normal' }
        ];
        const result = engine.multiParameterEVSI(psa, designs);
        const maxIndividual = Math.max(...result.individual.map(r => r.evsi));
        expect(result.jointEVSI).toBeGreaterThanOrEqual(maxIndividual - 1e-10);
    });

    // ================================================================
    // 19. Edge: all PSA iterations agree -> EVSI ≈ 0
    // ================================================================
    test('edge: unanimous PSA yields EVSI near 0', () => {
        const unanimousPSA = mockPSAUnanimous(500, 77);
        const r = engine.compute(unanimousPSA, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        // EVPI is 0 when there is no decision uncertainty, so EVSI should also be ~0
        expect(r.evsi).toBeLessThan(1); // Essentially zero in context of NMB scale
    });

    // ================================================================
    // 20. Edge: 50/50 split in PSA -> relatively high EVSI
    // ================================================================
    test('edge: 50/50 PSA split yields higher EVSI than unanimous', () => {
        const splitPSA = mockPSA5050(500, 88);
        const unanimousPSA = mockPSAUnanimous(500, 77);

        const rSplit = engine.compute(splitPSA, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        const rUnan = engine.compute(unanimousPSA, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(rSplit.evsi).toBeGreaterThan(rUnan.evsi);
    });

    // ================================================================
    // 21. Edge: sampleSize = 1
    // ================================================================
    test('edge: sampleSize = 1 gives small but positive EVSI', () => {
        const r = engine.compute(psa, {
            sampleSize: 1,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r.evsi).toBeGreaterThanOrEqual(0);
        expect(r.proportionResolved).toBeGreaterThan(0);
        expect(r.proportionResolved).toBeLessThan(0.5); // Should be small
    });

    // ================================================================
    // 22. Edge: very large sampleSize
    // ================================================================
    test('edge: very large sampleSize approaches EVPPI', () => {
        const r = engine.compute(psa, {
            sampleSize: 1000000,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(r.proportionResolved).toBeGreaterThan(0.99);
        // EVSI should be very close to EVPPI
        expect(r.evsi).toBeCloseTo(r.evppi, 1);
    });

    // ================================================================
    // 23. Input validation: negative sampleSize throws
    // ================================================================
    test('validation: negative sampleSize throws', () => {
        expect(() => {
            engine.compute(psa, {
                sampleSize: -10,
                parameter: 'p_response',
                dataModel: 'binomial'
            });
        }).toThrow('sampleSize must be non-negative');
    });

    // ================================================================
    // 24. Input validation: empty psaResults throws
    // ================================================================
    test('validation: empty psaResults throws', () => {
        expect(() => {
            engine.compute({ iterations: [], evpi: 0, wtp: 50000 }, {
                sampleSize: 100,
                parameter: 'p_response',
                dataModel: 'binomial'
            });
        }).toThrow('non-empty');
    });

    // ================================================================
    // 25. Input validation: missing parameter throws
    // ================================================================
    test('validation: missing parameter in psaResults throws', () => {
        expect(() => {
            engine.compute(psa, {
                sampleSize: 100,
                parameter: 'nonexistent_param',
                dataModel: 'binomial'
            });
        }).toThrow('not found');
    });

    // ================================================================
    // 26. Input validation: missing studyDesign.parameter throws
    // ================================================================
    test('validation: missing studyDesign.parameter throws', () => {
        expect(() => {
            engine.compute(psa, {
                sampleSize: 100,
                dataModel: 'binomial'
            });
        }).toThrow('parameter is required');
    });

    // ================================================================
    // 27. Normal data model works
    // ================================================================
    test('normal dataModel: produces valid EVSI', () => {
        const r = engine.compute(psa, {
            sampleSize: 200,
            parameter: 'cost',
            dataModel: 'normal'
        });
        expect(r.evsi).toBeGreaterThanOrEqual(0);
        expect(r.posteriorVariance).toBeLessThan(r.priorVariance);
        expect(r.proportionResolved).toBeGreaterThan(0);
        expect(r.proportionResolved).toBeLessThanOrEqual(1);
    });

    // ================================================================
    // 28. Survival data model works
    // ================================================================
    test('survival dataModel: produces valid EVSI', () => {
        const r = engine.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'survival'
        });
        expect(r.evsi).toBeGreaterThanOrEqual(0);
        expect(r.posteriorVariance).toBeLessThan(r.priorVariance);
    });

    // ================================================================
    // 29. survivalPosteriorVar: correct formula
    // ================================================================
    test('survivalPosteriorVar: precision scales with nEvents', () => {
        const priorVar = 0.1;
        const v10 = engine.survivalPosteriorVar(priorVar, 10);
        const v100 = engine.survivalPosteriorVar(priorVar, 100);
        // More events → lower posterior variance
        expect(v100).toBeLessThan(v10);
        // Check formula: 1/(1/0.1 + 10) = 1/20 = 0.05
        expect(v10).toBeCloseTo(1 / (1 / 0.1 + 10), 10);
    });

    // ================================================================
    // 30. Constructor defaults
    // ================================================================
    test('constructor: applies defaults correctly', () => {
        const e = new EVSIEngine();
        expect(e.seed).toBe(12345);
        expect(e.nOuter).toBe(1000);
        expect(e.nInner).toBe(500);
        expect(e.rng).not.toBeNull();
    });

    // ================================================================
    // 31. Constructor custom options
    // ================================================================
    test('constructor: accepts custom options', () => {
        const e = new EVSIEngine({ seed: 999, nOuter: 2000, nInner: 800 });
        expect(e.seed).toBe(999);
        expect(e.nOuter).toBe(2000);
        expect(e.nInner).toBe(800);
    });

    // ================================================================
    // 32. multiParameterEVSI: empty designs throws
    // ================================================================
    test('multiParameterEVSI: empty studyDesigns throws', () => {
        expect(() => {
            engine.multiParameterEVSI(psa, []);
        }).toThrow('non-empty');
    });

    // ================================================================
    // 33. Unknown dataModel throws
    // ================================================================
    test('unknown dataModel throws', () => {
        expect(() => {
            engine.compute(psa, {
                sampleSize: 100,
                parameter: 'p_response',
                dataModel: 'poisson'
            });
        }).toThrow('Unknown dataModel');
    });

    // ================================================================
    // 34. EVSI result contains all expected fields
    // ================================================================
    test('compute: result contains all expected fields', () => {
        const r = engine.compute(psa, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial',
            studyCost: 50000
        });
        expect(r).toHaveProperty('evsi');
        expect(r).toHaveProperty('evppi');
        expect(r).toHaveProperty('evpi');
        expect(r).toHaveProperty('proportionResolved');
        expect(r).toHaveProperty('priorVariance');
        expect(r).toHaveProperty('posteriorVariance');
        expect(r).toHaveProperty('sampleSize', 200);
        expect(r).toHaveProperty('studyCost', 50000);
    });
});
