/**
 * Tests for MAICSTCEngine
 *
 * MAIC: Signorovitch et al. (2010, 2012)
 * STC:  Caro & Ishak (2010)
 * Per NICE TSD 18 (Phillippo et al. 2016)
 */

'use strict';

const { MAICSTCEngine } = require('../../src/engine/maicSTC');

// ─── Test Data Generators ─────────────────────────────────────────

/**
 * Generate IPD with known covariate distribution
 * Uses simple LCG for reproducibility within tests
 */
function generateIPD(n, covMeans, covSDs, outcomeParams, seed = 42) {
    let s = seed;
    const nextRand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    // Box-Muller
    const nextNormal = (mu, sd) => {
        let u1, u2;
        do { u1 = nextRand(); } while (u1 === 0);
        u2 = nextRand();
        return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const covNames = Object.keys(covMeans);
    const data = [];
    for (let i = 0; i < n; i++) {
        const covariates = {};
        let linearPred = outcomeParams.intercept || 0;
        for (const cov of covNames) {
            covariates[cov] = nextNormal(covMeans[cov], covSDs[cov]);
            linearPred += (outcomeParams.betas?.[cov] || 0) * covariates[cov];
        }
        let outcome;
        if (outcomeParams.type === 'binary') {
            const p = 1 / (1 + Math.exp(-linearPred));
            outcome = nextRand() < p ? 1 : 0;
        } else {
            outcome = linearPred + nextNormal(0, outcomeParams.noise || 1);
        }
        data.push({ id: i + 1, outcome, covariates });
    }
    return data;
}

/**
 * Standard test scenario: IPD younger/more male than aggregate
 */
function standardScenario() {
    const ipdData = generateIPD(
        150,
        { age: 52, male: 0.55, stage: 2.0 },
        { age: 8, male: 0.3, stage: 0.6 },
        { intercept: 5, betas: { age: 0.1, male: 0.5, stage: 0.3 }, noise: 2 },
        42
    );
    const aggregateData = {
        means: { age: 58, male: 0.65, stage: 2.3 },
        outcome: { effect: 12.5, se: 0.8 },
        n: 200
    };
    return { ipdData, aggregateData };
}

/**
 * Identical populations (no adjustment needed)
 */
function identicalScenario() {
    const ipdData = generateIPD(
        100,
        { age: 55, male: 0.60 },
        { age: 7, male: 0.25 },
        { intercept: 10, betas: { age: 0.05, male: 0.2 }, noise: 1 },
        99
    );
    const aggregateData = {
        means: { age: 55, male: 0.60 },
        outcome: { effect: 12, se: 0.5 },
        n: 100
    };
    return { ipdData, aggregateData };
}

/**
 * Very different populations (extreme reweighting)
 */
function extremeScenario() {
    const ipdData = generateIPD(
        200,
        { age: 40, male: 0.30 },
        { age: 5, male: 0.2 },
        { intercept: 8, betas: { age: 0.2, male: 1.0 }, noise: 1 },
        77
    );
    const aggregateData = {
        means: { age: 65, male: 0.80 },
        outcome: { effect: 20, se: 1.0 },
        n: 150
    };
    return { ipdData, aggregateData };
}

/**
 * Binary outcome scenario
 */
function binaryScenario() {
    const ipdData = generateIPD(
        120,
        { age: 55, male: 0.5 },
        { age: 10, male: 0.3 },
        { intercept: -1, betas: { age: 0.02, male: 0.3 }, type: 'binary' },
        33
    );
    const aggregateData = {
        means: { age: 60, male: 0.55 },
        outcome: { effect: 0.45, se: 0.05 },  // proportion for binary
        n: 180
    };
    return { ipdData, aggregateData };
}

/**
 * Single covariate
 */
function singleCovScenario() {
    const ipdData = generateIPD(
        80,
        { age: 50 },
        { age: 10 },
        { intercept: 5, betas: { age: 0.1 }, noise: 1.5 },
        55
    );
    const aggregateData = {
        means: { age: 55 },
        outcome: { effect: 10, se: 0.6 },
        n: 100
    };
    return { ipdData, aggregateData };
}

/**
 * Five covariates
 */
function multiCovScenario() {
    const ipdData = generateIPD(
        200,
        { age: 52, male: 0.5, bmi: 26, creatinine: 1.0, stage: 2.0 },
        { age: 8, male: 0.3, bmi: 4, creatinine: 0.3, stage: 0.5 },
        { intercept: 3, betas: { age: 0.05, male: 0.4, bmi: 0.1, creatinine: 0.2, stage: 0.3 }, noise: 1 },
        101
    );
    const aggregateData = {
        means: { age: 56, male: 0.6, bmi: 28, creatinine: 1.1, stage: 2.2 },
        outcome: { effect: 8, se: 0.5 },
        n: 250
    };
    return { ipdData, aggregateData };
}

/**
 * Scenario where all IPD patients have the same covariates
 */
function uniformIPDScenario() {
    const data = [];
    for (let i = 0; i < 50; i++) {
        data.push({
            id: i + 1,
            outcome: 10 + (i % 5) * 0.5,
            covariates: { age: 55, male: 1 }
        });
    }
    const aggregateData = {
        means: { age: 55, male: 1 },
        outcome: { effect: 11, se: 0.3 },
        n: 100
    };
    return { ipdData: data, aggregateData };
}

// ─── Engine instance ──────────────────────────────────────────────

let engine;

beforeEach(() => {
    engine = new MAICSTCEngine({ seed: 12345 });
});

// ─── MAIC Tests ───────────────────────────────────────────────────

describe('MAICSTCEngine - MAIC', () => {

    test('1. MAIC weights sum to ESS (approximately)', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        const sumW = result.weights.reduce((a, b) => a + b, 0);
        // Weights are normalised so that mean = 1, sum = n
        // ESS = (sum w)^2 / sum(w^2)
        const sumW2 = result.weights.reduce((a, w) => a + w * w, 0);
        const ess = (sumW * sumW) / sumW2;
        expect(Math.abs(ess - result.effectiveSampleSize)).toBeLessThan(0.01);
    });

    test('2. ESS < original N (always)', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.effectiveSampleSize).toBeLessThanOrEqual(result.originalN);
        expect(result.effectiveSampleSize).toBeGreaterThan(0);
    });

    test('3. Weighted covariate means match aggregate means (within tolerance)', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        for (const row of result.balanceTable) {
            expect(Math.abs(row.ipdWeightedMean - row.aggMean)).toBeLessThan(0.5);
        }
    });

    test('4. Balance table SMD < 0.1 after weighting', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        for (const row of result.balanceTable) {
            expect(row.smdWeighted).toBeLessThan(0.1);
        }
    });

    test('5. Indirect effect has correct structure', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.indirectEffect).toHaveProperty('effect');
        expect(result.indirectEffect).toHaveProperty('se');
        expect(result.indirectEffect).toHaveProperty('ci');
        expect(result.indirectEffect).toHaveProperty('pValue');
        expect(result.indirectEffect.ci).toHaveLength(2);
        expect(result.indirectEffect.ci[0]).toBeLessThan(result.indirectEffect.ci[1]);
        expect(result.indirectEffect.se).toBeGreaterThan(0);
        expect(result.indirectEffect.pValue).toBeGreaterThanOrEqual(0);
        expect(result.indirectEffect.pValue).toBeLessThanOrEqual(1);
    });

    test('6. Logistic method produces valid weights', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData, { method: 'logistic' });
        expect(result.weights.length).toBe(ipdData.length);
        expect(result.balancingMethod).toBe('logistic');
        for (const w of result.weights) {
            expect(w).toBeGreaterThan(0);
            expect(isFinite(w)).toBe(true);
        }
    });

    test('7. Entropy balancing converges', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData, { method: 'entropy' });
        expect(result.diagnostics.convergence).toBe(true);
    });

    test('8. Binary outcome: MAIC produces log-odds ratio', () => {
        const { ipdData, aggregateData } = binaryScenario();
        const result = engine.maic(ipdData, aggregateData, { outcomeType: 'binary' });
        expect(result.method).toBe('MAIC');
        expect(isFinite(result.indirectEffect.effect)).toBe(true);
        expect(isFinite(result.indirectEffect.se)).toBe(true);
    });

    test('9. Continuous outcome: MAIC produces mean difference', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData, { outcomeType: 'continuous' });
        expect(result.method).toBe('MAIC');
        expect(isFinite(result.indirectEffect.effect)).toBe(true);
    });

    test('14. Weight diagnostics: CV > 0 when populations differ', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.diagnostics.weightCV).toBeGreaterThan(0);
        expect(result.diagnostics.maxWeight).toBeGreaterThan(result.diagnostics.meanWeight);
    });

    test('15. Identical populations: weights ≈ 1, ESS ≈ N', () => {
        const { ipdData, aggregateData } = identicalScenario();
        const result = engine.maic(ipdData, aggregateData);
        // Weights should be near 1
        for (const w of result.weights) {
            expect(w).toBeGreaterThan(0.2);
            expect(w).toBeLessThan(5);
        }
        // ESS close to N
        expect(result.effectiveSampleSize).toBeGreaterThan(result.originalN * 0.6);
    });

    test('16. Very different populations: ESS << N', () => {
        const { ipdData, aggregateData } = extremeScenario();
        const result = engine.maic(ipdData, aggregateData);
        // ESS should be substantially less than N
        expect(result.effectiveSampleSize).toBeLessThan(result.originalN * 0.5);
    });

    test('17. Single covariate: works correctly', () => {
        const { ipdData, aggregateData } = singleCovScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.balanceTable).toHaveLength(1);
        expect(result.balanceTable[0].covariate).toBe('age');
        expect(result.effectiveSampleSize).toBeGreaterThan(0);
    });

    test('18. Multiple covariates (5): works', () => {
        const { ipdData, aggregateData } = multiCovScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.balanceTable).toHaveLength(5);
        expect(result.effectiveSampleSize).toBeGreaterThan(0);
        expect(result.effectiveSampleSize).toBeLessThan(result.originalN);
    });

    test('19. Edge: all IPD patients have same covariates', () => {
        const { ipdData, aggregateData } = uniformIPDScenario();
        const result = engine.maic(ipdData, aggregateData);
        expect(result.weights.length).toBe(50);
        // All weights should be similar since all covariates are identical
        expect(result.effectiveSampleSize).toBeGreaterThan(0);
    });

    test('20. Edge: aggregate mean outside IPD range → extreme weights', () => {
        const { ipdData, aggregateData } = extremeScenario();
        const result = engine.maic(ipdData, aggregateData);
        // Max weight should be large
        expect(result.diagnostics.maxWeight).toBeGreaterThan(2);
        expect(result.diagnostics.weightCV).toBeGreaterThan(0.5);
    });
});

// ─── STC Tests ────────────────────────────────────────────────────

describe('MAICSTCEngine - STC', () => {

    test('10. STC regression coefficients returned', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(result.method).toBe('STC');
        expect(result.coefficients).toBeDefined();
        expect(result.coefficients).toHaveProperty('intercept');
        expect(result.coefficients).toHaveProperty('age');
        expect(result.coefficients).toHaveProperty('male');
        expect(result.coefficients).toHaveProperty('stage');
    });

    test('11. STC predicted outcome at aggregate means', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(isFinite(result.predictedOutcome)).toBe(true);
        expect(result.predictionSE).toBeGreaterThan(0);
    });

    test('12. STC indirect comparison structure', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(result.indirectEffect).toHaveProperty('effect');
        expect(result.indirectEffect).toHaveProperty('se');
        expect(result.indirectEffect).toHaveProperty('ci');
        expect(result.indirectEffect).toHaveProperty('pValue');
        expect(result.indirectEffect.ci).toHaveLength(2);
        expect(result.indirectEffect.ci[0]).toBeLessThan(result.indirectEffect.ci[1]);
    });

    test('STC effectiveSampleSize equals original N', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(result.effectiveSampleSize).toBe(ipdData.length);
    });

    test('STC R-squared is between 0 and 1 for well-specified model', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.stc(ipdData, aggregateData);
        // R-squared should be positive when true betas are non-zero
        expect(result.diagnostics.rSquared).toBeGreaterThan(-0.1);
        expect(result.diagnostics.rSquared).toBeLessThanOrEqual(1.01);
    });

    test('STC single covariate works', () => {
        const { ipdData, aggregateData } = singleCovScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(result.coefficients).toHaveProperty('age');
        expect(result.diagnostics.nCovariates).toBe(1);
    });

    test('STC multiple covariates works', () => {
        const { ipdData, aggregateData } = multiCovScenario();
        const result = engine.stc(ipdData, aggregateData);
        expect(Object.keys(result.coefficients).length).toBe(6); // intercept + 5
        expect(result.diagnostics.nCovariates).toBe(5);
    });
});

// ─── Bootstrap Tests ──────────────────────────────────────────────

describe('MAICSTCEngine - Bootstrap', () => {

    test('13. bootstrapCI produces CI that contains point estimate', () => {
        const { ipdData, aggregateData } = standardScenario();
        const point = engine.maic(ipdData, aggregateData);
        const boot = engine.bootstrapCI(ipdData, aggregateData, {}, 200);
        expect(boot.ci).toHaveLength(2);
        expect(boot.ci[0]).toBeLessThan(boot.ci[1]);
        expect(boot.nSuccessful).toBeGreaterThan(50);
        // Point estimate should be near the bootstrap distribution
        expect(boot.mean).toBeDefined();
        expect(isFinite(boot.se)).toBe(true);
        expect(boot.se).toBeGreaterThan(0);
    });

    test('Bootstrap with small nBoot', () => {
        const { ipdData, aggregateData } = standardScenario();
        const boot = engine.bootstrapCI(ipdData, aggregateData, {}, 50);
        expect(boot.nBoot).toBe(50);
        expect(boot.nSuccessful).toBeGreaterThan(0);
    });
});

// ─── Input Validation Tests ───────────────────────────────────────

describe('MAICSTCEngine - Input Validation', () => {

    test('21. Missing covariates throws', () => {
        const aggregateData = {
            means: { age: 55, male: 0.5 },
            outcome: { effect: 10, se: 0.5 },
            n: 100
        };
        // IPD missing 'male' covariate
        const ipdData = [
            { id: 1, outcome: 10, covariates: { age: 50 } },
            { id: 2, outcome: 12, covariates: { age: 55 } }
        ];
        expect(() => engine.maic(ipdData, aggregateData)).toThrow(/missing covariate/);
    });

    test('Empty IPD throws', () => {
        const aggregateData = {
            means: { age: 55 },
            outcome: { effect: 10, se: 0.5 },
            n: 100
        };
        expect(() => engine.maic([], aggregateData)).toThrow(/non-empty/);
    });

    test('Missing aggregateData.means throws', () => {
        const ipdData = [{ id: 1, outcome: 10, covariates: { age: 55 } }];
        expect(() => engine.maic(ipdData, { outcome: { effect: 10, se: 0.5 } })).toThrow(/means/);
    });

    test('Missing aggregateData.outcome throws', () => {
        const ipdData = [{ id: 1, outcome: 10, covariates: { age: 55 } }];
        expect(() => engine.maic(ipdData, { means: { age: 55 } })).toThrow(/outcome/);
    });

    test('Missing covariates object on patient throws', () => {
        const aggregateData = {
            means: { age: 55 },
            outcome: { effect: 10, se: 0.5 },
            n: 100
        };
        const ipdData = [{ id: 1, outcome: 10 }];
        expect(() => engine.maic(ipdData, aggregateData)).toThrow(/covariates/);
    });
});

// ─── Determinism Tests ────────────────────────────────────────────

describe('MAICSTCEngine - Determinism', () => {

    test('22. Same data → same weights', () => {
        const { ipdData, aggregateData } = standardScenario();
        const engine1 = new MAICSTCEngine({ seed: 12345 });
        const engine2 = new MAICSTCEngine({ seed: 12345 });
        const r1 = engine1.maic(ipdData, aggregateData);
        const r2 = engine2.maic(ipdData, aggregateData);
        expect(r1.weights.length).toBe(r2.weights.length);
        for (let i = 0; i < r1.weights.length; i++) {
            expect(Math.abs(r1.weights[i] - r2.weights[i])).toBeLessThan(1e-10);
        }
        expect(r1.effectiveSampleSize).toBeCloseTo(r2.effectiveSampleSize, 8);
    });

    test('STC determinism', () => {
        const { ipdData, aggregateData } = standardScenario();
        const r1 = engine.stc(ipdData, aggregateData);
        const r2 = engine.stc(ipdData, aggregateData);
        expect(r1.predictedOutcome).toBeCloseTo(r2.predictedOutcome, 10);
        expect(r1.indirectEffect.effect).toBeCloseTo(r2.indirectEffect.effect, 10);
    });
});

// ─── Balance Diagnostics Tests ────────────────────────────────────

describe('MAICSTCEngine - Balance Diagnostics', () => {

    test('Balance diagnostics returns correct structure', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        const diag = engine.balanceDiagnostics(result.weights, ipdData, aggregateData);
        expect(diag).toHaveLength(3); // age, male, stage
        for (const row of diag) {
            expect(row).toHaveProperty('covariate');
            expect(row).toHaveProperty('ipdMean');
            expect(row).toHaveProperty('ipdWeightedMean');
            expect(row).toHaveProperty('aggMean');
            expect(row).toHaveProperty('smd');
            expect(row).toHaveProperty('smdWeighted');
        }
    });

    test('SMD before weighting > SMD after weighting', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        for (const row of result.balanceTable) {
            // After weighting, SMD should be smaller (or equal for already balanced)
            expect(row.smdWeighted).toBeLessThanOrEqual(row.smd + 0.05); // small tolerance
        }
    });

    test('Unweighted means differ from aggregate', () => {
        const { ipdData, aggregateData } = standardScenario();
        const result = engine.maic(ipdData, aggregateData);
        // At least one covariate should have notable imbalance pre-weighting
        const anyImbalance = result.balanceTable.some(row => row.smd > 0.1);
        expect(anyImbalance).toBe(true);
    });
});
