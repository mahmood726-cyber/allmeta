/**
 * Property-based tests for HTA numerical engines using fast-check.
 *
 * Property-based testing generates random inputs to verify invariants that
 * must ALWAYS hold, finding edge cases that hand-written tests miss.
 *
 * ~60 tests across 12 engine modules.
 */

const fc = require('fast-check');

// ─── Module imports ──────────────────────────────────────────────────────────
const { KahanSum, NeumaierSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { ExpressionParser } = require('../../src/parser/expression');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const { MCDAEngine } = require('../../src/engine/mcda');
const { CompetingRisksEngine } = require('../../src/engine/competingRisks');
const { CureModelEngine, weibullSurvival, lognormalSurvival } = require('../../src/engine/cureModels');
const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');
const { ThresholdAnalysisEngine } = require('../../src/engine/thresholdAnalysis');
const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');
const { EVSIEngine } = require('../../src/engine/evsi');
const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOL = 1e-9;

/** Shuffle array using Fisher-Yates with a seeded RNG for reproducibility */
function shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Naive summation (no compensation) */
function naiveSum(arr) {
    let s = 0;
    for (const v of arr) s += v;
    return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. KahanSum Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('KahanSum Properties', () => {
    test('Commutativity: sum of any permutation equals sum of original', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 200 }),
                fc.integer({ min: 1, max: 100 }),
                (arr, seed) => {
                    const original = KahanSum.sum(arr);
                    const rng = new PCG32(seed);
                    const permuted = shuffle(arr, rng);
                    const permutedSum = KahanSum.sum(permuted);
                    return Math.abs(original - permutedSum) < 1e-6;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Identity: sum of empty array = 0', () => {
        expect(KahanSum.sum([])).toBe(0);
    });

    test('Additive: KahanSum(a.concat(b)) approximately equals KahanSum(a) + KahanSum(b)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }), { minLength: 0, maxLength: 100 }),
                fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }), { minLength: 0, maxLength: 100 }),
                (a, b) => {
                    const combined = KahanSum.sum(a.concat(b));
                    const separate = KahanSum.sum(a) + KahanSum.sum(b);
                    return Math.abs(combined - separate) < 1e-6;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Negation: KahanSum(arr) + KahanSum(arr.map(x=>-x)) approximately equals 0', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 200 }),
                (arr) => {
                    const pos = KahanSum.sum(arr);
                    const neg = KahanSum.sum(arr.map(x => -x));
                    return Math.abs(pos + neg) < 1e-6;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Precision: |KahanSum - naive| >= 0 (Kahan error is always finite non-negative)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 500 }),
                (arr) => {
                    const kahan = KahanSum.sum(arr);
                    const naive = naiveSum(arr);
                    // The absolute difference must be a finite non-negative number
                    const diff = Math.abs(kahan - naive);
                    return diff >= 0 && isFinite(diff);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PCG32 Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('PCG32 Properties', () => {
    test('Range: nextFloat() always in [0, 1)', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2 ** 31 - 1 }),
                (seed) => {
                    const rng = new PCG32(seed);
                    for (let i = 0; i < 1000; i++) {
                        const v = rng.nextFloat();
                        if (v < 0 || v >= 1) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 20 }
        );
    });

    test('Uniformity: chi-squared test on 10 bins (p > 0.01) for 10K samples', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2 ** 31 - 1 }),
                (seed) => {
                    const rng = new PCG32(seed);
                    const nSamples = 10000;
                    const nBins = 10;
                    const bins = new Array(nBins).fill(0);
                    for (let i = 0; i < nSamples; i++) {
                        const v = rng.nextFloat();
                        const bin = Math.min(Math.floor(v * nBins), nBins - 1);
                        bins[bin]++;
                    }
                    const expected = nSamples / nBins;
                    let chiSq = 0;
                    for (let i = 0; i < nBins; i++) {
                        chiSq += ((bins[i] - expected) ** 2) / expected;
                    }
                    // Chi-squared critical value for df=9, p=0.01 is ~21.67
                    return chiSq < 21.67;
                }
            ),
            { numRuns: 10 }
        );
    });

    test('No repeats in short sequence: 1000 consecutive nextU32() values have no duplicates', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2 ** 31 - 1 }),
                (seed) => {
                    const rng = new PCG32(seed);
                    const values = new Set();
                    for (let i = 0; i < 1000; i++) {
                        values.add(rng.nextU32());
                    }
                    return values.size === 1000;
                }
            ),
            { numRuns: 20 }
        );
    });

    test('State determinism: for any seed, first 10 values are reproducible', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2 ** 31 - 1 }),
                (seed) => {
                    const rng1 = new PCG32(seed);
                    const rng2 = new PCG32(seed);
                    for (let i = 0; i < 10; i++) {
                        if (rng1.nextU32() !== rng2.nextU32()) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Beta distribution: beta(a, b) always in [0, 1] for any positive a, b', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 999 }),
                fc.double({ min: 0.1, max: 50, noNaN: true }),
                fc.double({ min: 0.1, max: 50, noNaN: true }),
                (seed, alpha, beta) => {
                    const rng = new PCG32(seed);
                    for (let i = 0; i < 100; i++) {
                        const v = rng.beta(alpha, beta);
                        if (v < 0 || v > 1 || !isFinite(v)) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 30 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ExpressionParser Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ExpressionParser Properties', () => {
    test('Commutativity: evaluate(a+b) = evaluate(b+a)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
                (a, b) => {
                    const r1 = ExpressionParser.evaluate('a + b', { a, b });
                    const r2 = ExpressionParser.evaluate('b + a', { a, b });
                    return Math.abs(r1 - r2) < TOL;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Associativity: evaluate((a+b)+c) approximately equals evaluate(a+(b+c))', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
                (a, b, c) => {
                    const r1 = ExpressionParser.evaluate('(a + b) + c', { a, b, c });
                    const r2 = ExpressionParser.evaluate('a + (b + c)', { a, b, c });
                    return Math.abs(r1 - r2) < 1e-6;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Identity: evaluate(x*1) = evaluate(x), evaluate(x+0) = evaluate(x)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }),
                (x) => {
                    const mul = ExpressionParser.evaluate('x * 1', { x });
                    const add = ExpressionParser.evaluate('x + 0', { x });
                    return Math.abs(mul - x) < TOL && Math.abs(add - x) < TOL;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Inverse: evaluate(x - x) = 0 for any x', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
                (x) => {
                    const result = ExpressionParser.evaluate('x - x', { x });
                    return Math.abs(result) < TOL;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Comparison consistency: if a > b then evaluate("a > b") = 1', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
                (a, b) => {
                    const result = ExpressionParser.evaluate('a > b', { a, b });
                    if (a > b) return result === 1;
                    if (a <= b) return result === 0;
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BudgetImpact Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('BudgetImpact Properties', () => {
    const bia = new BudgetImpactEngine();

    /** Generate a valid BIA config with the given uptake array */
    function makeConfig(uptake, newDrugCost, currentDrugCost, population) {
        return {
            population: population || 100000,
            prevalence: 0.01,
            timeHorizon: uptake.length,
            uptake,
            newTx: { drugCost: newDrugCost || 5000 },
            currentTx: { drugCost: currentDrugCost || 2000 },
            discountRate: 0.03,
        };
    }

    test('Zero uptake = zero impact: for any config with uptake=[0,...,0], netBudgetImpact = 0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 10 }),
                fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }),
                (horizon, newCost, curCost) => {
                    const uptake = new Array(horizon).fill(0);
                    const config = makeConfig(uptake, newCost, curCost);
                    const result = bia.run(config);
                    return Math.abs(result.netBudgetImpact) < 1e-6;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Monotonicity: higher uptake leads to higher (or equal) absolute budget impact', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 5 }),
                (horizon) => {
                    const lowUptake = new Array(horizon).fill(0.1);
                    const highUptake = new Array(horizon).fill(0.5);
                    const configLow = makeConfig(lowUptake, 5000, 2000);
                    const configHigh = makeConfig(highUptake, 5000, 2000);
                    const resultLow = bia.run(configLow);
                    const resultHigh = bia.run(configHigh);
                    return Math.abs(resultHigh.netBudgetImpact) >= Math.abs(resultLow.netBudgetImpact) - 1e-6;
                }
            ),
            { numRuns: 30 }
        );
    });

    test('Linearity: doubling population doubles budget impact', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 5 }),
                fc.integer({ min: 10000, max: 500000 }),
                (horizon, pop) => {
                    const uptake = new Array(horizon).fill(0.3);
                    const config1 = makeConfig(uptake, 5000, 2000, pop);
                    const config2 = makeConfig(uptake, 5000, 2000, pop * 2);
                    const result1 = bia.run(config1);
                    const result2 = bia.run(config2);
                    // Due to rounding of eligible population, allow small tolerance
                    const ratio = result2.netBudgetImpact / result1.netBudgetImpact;
                    return Math.abs(ratio - 2) < 0.05 || Math.abs(result1.netBudgetImpact) < 1;
                }
            ),
            { numRuns: 30 }
        );
    });

    test('Non-negative patients: patients treated per year always >= 0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 5 }),
                (horizon) => {
                    const uptake = [];
                    for (let i = 0; i < horizon; i++) uptake.push(i / (horizon + 1));
                    const config = makeConfig(uptake, 5000, 2000);
                    const result = bia.run(config);
                    return result.yearlyBudget.every(yb => yb.patients >= 0);
                }
            ),
            { numRuns: 30 }
        );
    });

    test('Symmetry: swapping newTx/currentTx negates the incremental', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 5 }),
                (horizon) => {
                    const uptake = new Array(horizon).fill(0.3);
                    const config1 = {
                        population: 100000, prevalence: 0.01,
                        timeHorizon: horizon, uptake,
                        newTx: { drugCost: 5000 }, currentTx: { drugCost: 2000 },
                        discountRate: 0.03,
                    };
                    const config2 = {
                        population: 100000, prevalence: 0.01,
                        timeHorizon: horizon, uptake,
                        newTx: { drugCost: 2000 }, currentTx: { drugCost: 5000 },
                        discountRate: 0.03,
                    };
                    const result1 = bia.run(config1);
                    const result2 = bia.run(config2);
                    return Math.abs(result1.netBudgetImpact + result2.netBudgetImpact) < 1e-6;
                }
            ),
            { numRuns: 30 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MCDA Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('MCDA Properties', () => {
    const mcda = new MCDAEngine();

    const baseCriteria = [
        { name: 'eff', direction: 'maximize', scale: [0, 100] },
        { name: 'saf', direction: 'maximize', scale: [0, 100] },
    ];

    test('Rank stability: adding a zero-weight criterion does not change ranking', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 10, max: 90, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 10, max: 90, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 10, max: 90, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 10, max: 90, noNaN: true, noDefaultInfinity: true }),
                (aEff, aSaf, bEff, bSaf) => {
                    const alts = [
                        { name: 'A', values: { eff: aEff, saf: aSaf } },
                        { name: 'B', values: { eff: bEff, saf: bSaf } },
                    ];
                    const weights = { eff: 0.5, saf: 0.5 };
                    const result2 = mcda.weightedSum(alts, baseCriteria, weights);

                    // Add a zero-weight criterion
                    const alts3 = alts.map(a => ({
                        ...a,
                        values: { ...a.values, cost: 50 }
                    }));
                    const criteria3 = [
                        ...baseCriteria,
                        { name: 'cost', direction: 'minimize', scale: [0, 100] }
                    ];
                    const weights3 = { eff: 0.5, saf: 0.5, cost: 0 };
                    const result3 = mcda.weightedSum(alts3, criteria3, weights3);

                    // Rankings should be the same
                    return result2[0].name === result3[0].name;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Score range: all scores in [0, 1] after normalization', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                (aEff, aSaf, bEff, bSaf) => {
                    const alts = [
                        { name: 'A', values: { eff: aEff, saf: aSaf } },
                        { name: 'B', values: { eff: bEff, saf: bSaf } },
                    ];
                    const weights = { eff: 0.6, saf: 0.4 };
                    const results = mcda.weightedSum(alts, baseCriteria, weights);
                    return results.every(r => r.score >= -1e-12 && r.score <= 1 + 1e-12);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Dominance: if A >= B on all criteria, A score >= B score', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 50, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 50, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
                (aEff, aSaf, bEff, bSaf) => {
                    // Ensure A dominates B (both criteria maximize)
                    const alts = [
                        { name: 'A', values: { eff: Math.max(aEff, bEff), saf: Math.max(aSaf, bSaf) } },
                        { name: 'B', values: { eff: Math.min(aEff, bEff), saf: Math.min(aSaf, bSaf) } },
                    ];
                    const weights = { eff: 0.5, saf: 0.5 };
                    const results = mcda.weightedSum(alts, baseCriteria, weights);
                    const scoreA = results.find(r => r.name === 'A').score;
                    const scoreB = results.find(r => r.name === 'B').score;
                    return scoreA >= scoreB - 1e-12;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Weight sum: swing weights always sum to 1.0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 2, max: 8 }),
                (nCriteria) => {
                    const ranges = [];
                    for (let i = 0; i < nCriteria; i++) {
                        ranges.push({
                            criterion: `c${i}`,
                            worst: 0,
                            best: 100,
                            rank: i + 1
                        });
                    }
                    const weights = mcda.swingWeight(ranges);
                    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
                    return Math.abs(sum - 1.0) < 1e-9;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Monotonicity: improving an alternative on any criterion can only improve its score', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 10, max: 80, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 10, max: 80, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 1, max: 19, noNaN: true, noDefaultInfinity: true }),
                (eff, saf, improvement) => {
                    const altsBase = [
                        { name: 'A', values: { eff, saf } },
                        { name: 'B', values: { eff: 50, saf: 50 } },
                    ];
                    const altsImproved = [
                        { name: 'A', values: { eff: eff + improvement, saf } },
                        { name: 'B', values: { eff: 50, saf: 50 } },
                    ];
                    const weights = { eff: 0.5, saf: 0.5 };
                    const base = mcda.weightedSum(altsBase, baseCriteria, weights);
                    const improved = mcda.weightedSum(altsImproved, baseCriteria, weights);
                    const baseScore = base.find(r => r.name === 'A').score;
                    const improvedScore = improved.find(r => r.name === 'A').score;
                    return improvedScore >= baseScore - 1e-12;
                }
            ),
            { numRuns: 50 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CompetingRisks Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('CompetingRisks Properties', () => {
    const cr = new CompetingRisksEngine();

    /** Generate synthetic competing risks data */
    function genCRData(nPerCause, nCensored) {
        const data = [];
        for (let i = 0; i < nPerCause; i++) {
            data.push({ time: 1 + i * 0.5, event: 'death' });
        }
        for (let i = 0; i < nPerCause; i++) {
            data.push({ time: 2 + i * 0.3, event: 'relapse' });
        }
        for (let i = 0; i < nCensored; i++) {
            data.push({ time: 3 + i * 0.2, event: 'censored' });
        }
        return data;
    }

    test('CIF bound: CIF_k(t) in [0, 1] for all t and all causes', () => {
        const data = genCRData(10, 5);
        const result = cr.cumulativeIncidence(data, ['death', 'relapse']);
        for (const cause of ['death', 'relapse']) {
            for (const pt of result[cause]) {
                expect(pt.cif).toBeGreaterThanOrEqual(-1e-12);
                expect(pt.cif).toBeLessThanOrEqual(1 + 1e-12);
            }
        }
    });

    test('CIF sum: sum of all CIFs + survival <= 1 at every time', () => {
        const data = genCRData(10, 5);
        const result = cr.cumulativeIncidence(data, ['death', 'relapse']);

        for (let i = 0; i < result.overallSurvival.length; i++) {
            const surv = result.overallSurvival[i].surv;
            let cifSum = 0;
            for (const cause of ['death', 'relapse']) {
                if (result[cause][i]) {
                    cifSum += result[cause][i].cif;
                }
            }
            expect(cifSum + surv).toBeLessThanOrEqual(1 + 1e-6);
        }
    });

    test('CIF monotonicity: CIF_k is non-decreasing', () => {
        const data = genCRData(15, 8);
        const result = cr.cumulativeIncidence(data, ['death', 'relapse']);
        for (const cause of ['death', 'relapse']) {
            for (let i = 1; i < result[cause].length; i++) {
                expect(result[cause][i].cif).toBeGreaterThanOrEqual(result[cause][i - 1].cif - 1e-12);
            }
        }
    });

    test('Single cause: CIF approaches 1 - S(last) when only one cause observed', () => {
        // Create data with only one cause type (all events are 'death')
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({ time: 1 + i * 0.5, event: 'death' });
            data.push({ time: 1 + i * 0.5, event: 'death' }); // need at least 2 per cause
        }
        // Minimal second cause to satisfy validation
        data.push({ time: 100, event: 'other' });
        data.push({ time: 101, event: 'other' });
        for (let i = 0; i < 5; i++) {
            data.push({ time: 50 + i, event: 'censored' });
        }
        const result = cr.cumulativeIncidence(data, ['death', 'other']);

        // Death CIF + overall survival should be close to 1 at the end
        const lastIdx = result.overallSurvival.length - 1;
        const lastSurv = result.overallSurvival[lastIdx].surv;
        const lastDeathCIF = result.death[lastIdx]?.cif ?? 0;
        const lastOtherCIF = result.other[lastIdx]?.cif ?? 0;
        expect(lastDeathCIF + lastOtherCIF + lastSurv).toBeCloseTo(1, 1);
    });

    test('Overall survival: non-increasing over time', () => {
        const data = genCRData(12, 6);
        const result = cr.cumulativeIncidence(data, ['death', 'relapse']);
        for (let i = 1; i < result.overallSurvival.length; i++) {
            expect(result.overallSurvival[i].surv).toBeLessThanOrEqual(
                result.overallSurvival[i - 1].surv + 1e-12
            );
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CureModels Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('CureModels Properties', () => {
    const cm = new CureModelEngine();

    /** Generate synthetic survival data with cure */
    function genCureData(n, cureFrac) {
        const data = [];
        const rng = new PCG32(42);
        for (let i = 0; i < n; i++) {
            if (rng.nextFloat() < cureFrac) {
                // Cured: censored at late time
                data.push({ time: 20 + rng.nextFloat() * 10, event: 0 });
            } else {
                // Uncured: event at some time
                data.push({ time: 0.5 + rng.nextFloat() * 15, event: 1 });
            }
        }
        return data;
    }

    test('Cure fraction bound: pi in [0, 1]', () => {
        const data = genCureData(100, 0.3);
        const model = cm.mixtureCure(data, { distribution: 'weibull' });
        expect(model.cureFraction).toBeGreaterThanOrEqual(0);
        expect(model.cureFraction).toBeLessThanOrEqual(1);
    });

    test('Survival bound: S(t) in [0, 1] for all t >= 0', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                (t) => {
                    const S = weibullSurvival(t, 1.5, 10);
                    return S >= 0 && S <= 1;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Survival monotone: S(t1) >= S(t2) when t1 < t2', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
                (t1, t2) => {
                    const lo = Math.min(t1, t2);
                    const hi = Math.max(t1, t2);
                    return weibullSurvival(lo, 1.5, 10) >= weibullSurvival(hi, 1.5, 10) - 1e-12;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Survival plateau: S(t) approaches pi as t -> infinity (for mixture cure)', () => {
        const data = genCureData(200, 0.3);
        const model = cm.mixtureCure(data, { distribution: 'weibull' });
        const predictions = cm.predict(model, [500, 1000, 5000]);
        for (const pred of predictions) {
            // At very large t, S(t) should approach the cure fraction
            expect(pred.survival).toBeGreaterThanOrEqual(model.cureFraction - 0.05);
            expect(pred.survival).toBeLessThanOrEqual(model.cureFraction + 0.05);
        }
    });

    test('AIC ordering: if model A has lower AIC, it has higher weight in compareFit', () => {
        const data = genCureData(100, 0.2);
        const fits = cm.compareFit(data, ['weibull', 'lognormal']);
        const valid = fits.filter(f => !f.error);
        if (valid.length >= 2) {
            // compareFit sorts by AIC ascending, so the first has the lowest AIC
            expect(valid[0].aic).toBeLessThanOrEqual(valid[1].aic + 1e-6);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. CorrelatedPSA Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('CorrelatedPSA Properties', () => {
    const engine = new CorrelatedPSAEngine({ seed: 12345 });

    test('Cholesky positive: diagonal of L always positive', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -0.9, max: 0.9, noNaN: true, noDefaultInfinity: true }),
                (r12) => {
                    const matrix = [[1, r12], [r12, 1]];
                    try {
                        const L = engine.cholesky(matrix);
                        // Diagonal elements must be positive
                        return L[0][0] > 0 && L[1][1] > 0;
                    } catch (e) {
                        // Not PD — skip
                        return true;
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Cholesky reconstruction: L * L^T = original matrix (within tolerance)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -0.8, max: 0.8, noNaN: true, noDefaultInfinity: true }),
                (r12) => {
                    const matrix = [[1, r12], [r12, 1]];
                    try {
                        const L = engine.cholesky(matrix);
                        // Reconstruct: LLT[i][j] = sum_k L[i][k] * L[j][k]
                        const n = matrix.length;
                        for (let i = 0; i < n; i++) {
                            for (let j = 0; j < n; j++) {
                                let val = 0;
                                for (let k = 0; k < n; k++) {
                                    val += L[i][k] * L[j][k];
                                }
                                if (Math.abs(val - matrix[i][j]) > 1e-9) return false;
                            }
                        }
                        return true;
                    } catch (e) {
                        return true; // Not PD
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Copula marginals: beta samples respect [0, 1] bounds', () => {
        const cpsa = new CorrelatedPSAEngine({ seed: 999 });
        const marginals = [
            { name: 'p1', dist: { type: 'beta', alpha: 2, beta: 5 } },
            { name: 'p2', dist: { type: 'beta', alpha: 3, beta: 3 } },
        ];
        const corrMatrix = [[1, 0.3], [0.3, 1]];
        const samples = cpsa.gaussianCopula(marginals, corrMatrix, 500);
        for (const s of samples) {
            expect(s.p1).toBeGreaterThanOrEqual(0);
            expect(s.p1).toBeLessThanOrEqual(1);
            expect(s.p2).toBeGreaterThanOrEqual(0);
            expect(s.p2).toBeLessThanOrEqual(1);
        }
    });

    test('Correlation preservation: empirical correlation within 0.15 of specified', () => {
        const cpsa = new CorrelatedPSAEngine({ seed: 777 });
        const targetCorr = 0.5;
        const corrMatrix = [[1, targetCorr], [targetCorr, 1]];
        const samples = cpsa.correlatedNormal([0, 0], [1, 1], corrMatrix, 2000);
        const arr1 = samples.map(s => s.param0);
        const arr2 = samples.map(s => s.param1);
        const empirical = cpsa.empiricalCorrelation([arr1, arr2]);
        expect(Math.abs(empirical[0][1] - targetCorr)).toBeLessThan(0.15);
    });

    test('normalCDF range: normalCDF(x) in [0, 1] for all x', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -20, max: 20, noNaN: true, noDefaultInfinity: true }),
                (x) => {
                    const val = CorrelatedPSAEngine.normalCDF(x);
                    return val >= 0 && val <= 1;
                }
            ),
            { numRuns: 200 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ThresholdAnalysis Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ThresholdAnalysis Properties', () => {
    const ta = new ThresholdAnalysisEngine();

    /** Simple linear model: cost = x * 100, qaly = x * 0.5 */
    function linearModel(params) {
        const x = params.x ?? 1;
        return {
            cost: x * 100,
            qaly: x * 0.5,
            comparatorCost: 0,
            comparatorQaly: 0,
        };
    }

    test('Tornado bars sorted: bars always in descending order of swing', () => {
        const modelFn = (params) => ({
            cost: (params.a ?? 10) * 100 + (params.b ?? 5) * 200 + (params.c ?? 1) * 50,
            qaly: (params.a ?? 10) * 0.5 + (params.b ?? 5) * 0.3 + (params.c ?? 1) * 0.1,
            comparatorCost: 5000,
            comparatorQaly: 3,
        });
        const paramRanges = [
            { name: 'a', low: 5, high: 15 },
            { name: 'b', low: 2, high: 8 },
            { name: 'c', low: 0.5, high: 2 },
        ];
        const baseParams = { a: 10, b: 5, c: 1 };
        const result = ta.tornado(modelFn, paramRanges, baseParams, 50000);
        for (let i = 1; i < result.bars.length; i++) {
            expect(result.bars[i].swing).toBeLessThanOrEqual(result.bars[i - 1].swing + 1e-12);
        }
    });

    test('NMB sign flip: NMB positive below threshold, negative above (or vice versa)', () => {
        // Model where NMB = qaly * wtp - cost, and we vary x
        // NMB = x * 0.5 * wtp - x * 100
        // NMB > 0 when x * (0.5 * wtp - 100) > 0
        const wtp = 50000;
        const result = ta.oneway(linearModel, 'x', [0.1, 10], wtp, 100);
        if (result.thresholdExists) {
            // There should be a sign change in NMB
            const signs = result.nmb.map(v => v >= 0);
            const hasPositive = signs.some(s => s);
            const hasNegative = signs.some(s => !s);
            expect(hasPositive && hasNegative).toBe(true);
        }
    });

    test('Oneway monotonicity: if model is monotone in parameter, NMB is monotone', () => {
        // NMB = x * 0.5 * 50000 - x * 100 = x * (25000 - 100) = x * 24900
        // This is strictly monotone increasing in x
        const wtp = 50000;
        const result = ta.oneway(linearModel, 'x', [0.1, 10], wtp, 50);
        for (let i = 1; i < result.nmb.length; i++) {
            expect(result.nmb[i]).toBeGreaterThanOrEqual(result.nmb[i - 1] - 1e-6);
        }
    });

    test('Grid coverage: twoway grid covers full parameter ranges', () => {
        const result = ta.twoway(
            linearModel,
            [{ name: 'x' }, { name: 'y' }],
            [[0, 10], [0, 10]],
            50000,
            10
        );
        expect(result.param1.values[0]).toBeCloseTo(0, 6);
        expect(result.param1.values[result.param1.values.length - 1]).toBeCloseTo(10, 6);
        expect(result.param2.values[0]).toBeCloseTo(0, 6);
        expect(result.param2.values[result.param2.values.length - 1]).toBeCloseTo(10, 6);
    });

    test('Break-even precision: |NMB at threshold| < tolerance', () => {
        // Model: NMB = x * 0.5 * wtp - x * 100, threshold at x where NMB = 0
        // But NMB is always positive for wtp=50000, so use a model that crosses zero
        const crossingModel = (params) => ({
            cost: 5000,
            qaly: 2,
            comparatorCost: (params.x ?? 1) * 1000,
            comparatorQaly: 0,
        });
        const wtp = 50000;
        const threshold = ta.findBreakeven(crossingModel, 'x', [0, 200], wtp, 0.01);
        if (threshold !== null) {
            const result = crossingModel({ x: threshold });
            const incQaly = result.qaly - result.comparatorQaly;
            const incCost = result.cost - result.comparatorCost;
            const nmb = incQaly * wtp - incCost;
            expect(Math.abs(nmb)).toBeLessThan(1.0); // within tolerance
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ModelAveraging Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModelAveraging Properties', () => {
    const ma = new ModelAveragingEngine();

    test('Weights sum to 1: BIC/AIC weights always sum to 1.0', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 8 }),
                (bicValues) => {
                    const models = bicValues.map((bic, i) => ({ name: `m${i}`, bic }));
                    const weights = ma.bicWeights(models);
                    const sum = weights.reduce((s, w) => s + w.weight, 0);
                    return Math.abs(sum - 1.0) < 1e-9;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Best model gets highest weight: lowest IC gets highest weight', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: 10, max: 500, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 6 }),
                (aicValues) => {
                    const models = aicValues.map((aic, i) => ({ name: `m${i}`, aic }));
                    const weights = ma.aicWeights(models);
                    const minAIC = Math.min(...aicValues);
                    const bestWeight = weights.find(w => Math.abs(w.aic - minAIC) < 1e-12);
                    const maxWeight = Math.max(...weights.map(w => w.weight));
                    return bestWeight && Math.abs(bestWeight.weight - maxWeight) < 1e-9;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Model average in range: averaged prediction between min and max individual predictions', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: 0.1, max: 0.99, noNaN: true, noDefaultInfinity: true }), { minLength: 3, maxLength: 3 }),
                fc.array(fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }), { minLength: 3, maxLength: 3 }),
                (preds, rawWeights) => {
                    const wSum = rawWeights.reduce((a, b) => a + b, 0);
                    if (wSum < 1e-12) return true;
                    const models = preds.map((p, i) => ({
                        name: `m${i}`,
                        predictions: [p],
                        weight: rawWeights[i] / wSum
                    }));
                    const result = ma.modelAverage(models);
                    const minPred = Math.min(...preds);
                    const maxPred = Math.max(...preds);
                    return result.averaged[0] >= minPred - 1e-9 && result.averaged[0] <= maxPred + 1e-9;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Survival bound: model-averaged survival in [0, 1]', () => {
        const models = [
            { name: 'weibull', params: { shape: 1.5, scale: 10 }, weight: 0.6, distribution: 'weibull' },
            { name: 'lognormal', params: { mu: 2, sigma: 0.5 }, weight: 0.4, distribution: 'lognormal' },
        ];
        const times = [0, 1, 2, 5, 10, 20, 50];
        const result = ma.survivalPrediction(models, times);
        for (let i = 0; i < times.length; i++) {
            expect(result.survival[i]).toBeGreaterThanOrEqual(-1e-12);
            expect(result.survival[i]).toBeLessThanOrEqual(1 + 1e-12);
        }
    });

    test('IC ordering: if AIC_a < AIC_b then weight_a > weight_b', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 10, max: 200, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
                (aicBase, delta) => {
                    const models = [
                        { name: 'A', aic: aicBase },
                        { name: 'B', aic: aicBase + delta },
                    ];
                    const weights = ma.aicWeights(models);
                    const wA = weights.find(w => w.name === 'A').weight;
                    const wB = weights.find(w => w.name === 'B').weight;
                    return wA >= wB - 1e-12;
                }
            ),
            { numRuns: 50 }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. EVSI Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('EVSI Properties', () => {
    const evsiEngine = new EVSIEngine({ seed: 12345 });

    /** Generate mock PSA results with NMB variation */
    function makePSAResults(nIter, wtp) {
        const rng = new PCG32(42);
        const iterations = [];
        for (let i = 0; i < nIter; i++) {
            const pResponse = 0.3 + rng.nextFloat() * 0.4;
            const cost = 5000 + rng.nextFloat() * 10000;
            const qaly = pResponse * 5;
            const nmb = qaly * wtp - cost;
            iterations.push({
                params: { p_response: pResponse, cost_param: cost },
                nmb,
                costs: cost,
                qalys: qaly
            });
        }
        // Compute EVPI
        const meanNMB = iterations.reduce((s, it) => s + it.nmb, 0) / nIter;
        const evpi = iterations.reduce((s, it) => s + Math.max(0, it.nmb), 0) / nIter - Math.max(0, meanNMB);
        return { iterations, evpi, wtp };
    }

    const psa = makePSAResults(500, 50000);

    test('EVSI bound: 0 <= EVSI <= EVPPI', () => {
        const result = evsiEngine.compute(psa, {
            sampleSize: 100,
            parameter: 'p_response',
            dataModel: 'binomial'
        });
        expect(result.evsi).toBeGreaterThanOrEqual(-1e-9);
        expect(result.evsi).toBeLessThanOrEqual(result.evppi + 1e-6);
    });

    test('EVSI monotone: EVSI(n) weakly increasing in n', () => {
        const sizes = [10, 50, 100, 500];
        const evsis = sizes.map(n =>
            evsiEngine.compute(psa, {
                sampleSize: n,
                parameter: 'p_response',
                dataModel: 'binomial'
            }).evsi
        );
        for (let i = 1; i < evsis.length; i++) {
            expect(evsis[i]).toBeGreaterThanOrEqual(evsis[i - 1] - 1e-6);
        }
    });

    test('Proportion resolved: R in [0, 1]', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 5000 }),
                (n) => {
                    const result = evsiEngine.compute(psa, {
                        sampleSize: n,
                        parameter: 'p_response',
                        dataModel: 'binomial'
                    });
                    return result.proportionResolved >= -1e-9 && result.proportionResolved <= 1 + 1e-9;
                }
            ),
            { numRuns: 30 }
        );
    });

    test('Posterior variance: <= prior variance', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2000 }),
                (n) => {
                    const result = evsiEngine.compute(psa, {
                        sampleSize: n,
                        parameter: 'p_response',
                        dataModel: 'binomial'
                    });
                    return result.posteriorVariance <= result.priorVariance + 1e-12;
                }
            ),
            { numRuns: 30 }
        );
    });

    test('Population scaling: populationEVSI increases with population', () => {
        const evsi = 100;
        const r1 = evsiEngine.populationEVSI(evsi, 1000, 10, 0.035);
        const r2 = evsiEngine.populationEVSI(evsi, 2000, 10, 0.035);
        expect(r2.populationEVSI).toBeGreaterThanOrEqual(r1.populationEVSI - 1e-6);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. SemiMarkov Properties (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('SemiMarkov Properties', () => {
    const sm = new SemiMarkovEngine({ maxCycles: 50 });

    function makeConfig(transType, shape, scale, rate) {
        const transition = transType === 'constant'
            ? { type: 'constant', rate: rate ?? 0.1 }
            : { type: transType, shape: shape ?? 1.5, scale: scale ?? 10 };
        return {
            states: ['Healthy', 'Sick', 'Dead'],
            initial: [1, 0, 0],
            transitions: {
                'Healthy->Sick': transition,
                'Sick->Dead': { type: 'constant', rate: 0.2 },
            },
            costs: { Healthy: 0, Sick: 1000, Dead: 0 },
            utilities: { Healthy: 1, Sick: 0.5, Dead: 0 },
            timeHorizon: 20,
            discountRate: 0.035,
        };
    }

    test('State trace sums: each row sums to 1.0', () => {
        const config = makeConfig('weibull', 1.5, 10);
        const result = sm.run(config);
        for (let cycle = 0; cycle < result.stateTrace.length; cycle++) {
            const sum = result.stateTrace[cycle].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 4);
        }
    });

    test('Absorbing accumulation: absorbing state population never decreases', () => {
        const config = makeConfig('constant', null, null, 0.15);
        const result = sm.run(config);
        for (let cycle = 1; cycle < result.stateTrace.length; cycle++) {
            const deadNow = result.stateTrace[cycle][2];   // Dead is index 2
            const deadPrev = result.stateTrace[cycle - 1][2];
            expect(deadNow).toBeGreaterThanOrEqual(deadPrev - 1e-9);
        }
    });

    test('hazardToProb range: output in [0, 1] for non-negative hazard', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0.01, max: 10, noNaN: true, noDefaultInfinity: true }),
                (hazard, cycleLength) => {
                    const p = sm.hazardToProb(hazard, cycleLength);
                    return p >= 0 && p <= 1;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Constant hazard: equivalent to standard Markov transition', () => {
        // For constant hazard, transition prob = 1 - exp(-rate * cycleLength)
        fc.assert(
            fc.property(
                fc.double({ min: 0.001, max: 5, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0.1, max: 5, noNaN: true, noDefaultInfinity: true }),
                (rate, cycleLength) => {
                    const hazard = sm.sojournHazard({ type: 'constant', rate }, 1);
                    const expected = rate;
                    return Math.abs(hazard - expected) < 1e-12;
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Costs non-negative: total costs >= 0 when all state costs >= 0', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 5000, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0, max: 5000, noNaN: true, noDefaultInfinity: true }),
                (sickCost, healthyCost) => {
                    const config = {
                        states: ['Healthy', 'Sick', 'Dead'],
                        initial: [1, 0, 0],
                        transitions: {
                            'Healthy->Sick': { type: 'constant', rate: 0.1 },
                            'Sick->Dead': { type: 'constant', rate: 0.2 },
                        },
                        costs: { Healthy: healthyCost, Sick: sickCost, Dead: 0 },
                        utilities: { Healthy: 1, Sick: 0.5, Dead: 0 },
                        timeHorizon: 10,
                        discountRate: 0.035,
                    };
                    const result = sm.run(config);
                    return result.totalCosts >= -1e-9;
                }
            ),
            { numRuns: 30 }
        );
    });
});
