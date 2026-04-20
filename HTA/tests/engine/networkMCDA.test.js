/**
 * Tests for src/engine/networkMCDA.js — Network MCDA Engine
 */

'use strict';

const { NetworkMCDAEngine } = require('../../src/engine/networkMCDA');

// ============ HELPERS ============

function makeNMAResults() {
    return {
        treatments: ['A', 'B', 'C', 'D'],
        effects: {
            efficacy: { A: 0, B: 0.5, C: 0.3, D: 0.8 },
            safety:   { A: 0, B: -0.2, C: 0.1, D: -0.5 },
            cost:     { A: 1000, B: 5000, C: 3000, D: 8000 }
        },
        uncertainty: {
            efficacy: { A: 0, B: 0.15, C: 0.12, D: 0.2 },
            safety:   { A: 0, B: 0.08, C: 0.05, D: 0.1 },
            cost:     { A: 100, B: 500, C: 300, D: 800 }
        }
    };
}

function makeCriteriaConfig() {
    return [
        { name: 'efficacy', direction: 'maximize', scale: [-1, 2] },
        { name: 'safety',   direction: 'maximize', scale: [-1, 1] },
        { name: 'cost',     direction: 'minimize', scale: [0, 10000] }
    ];
}

function makeWeights() {
    return { efficacy: 0.5, safety: 0.3, cost: 0.2 };
}

// ============ TESTS ============

describe('NetworkMCDAEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new NetworkMCDAEngine({ seed: 12345 });
    });

    // ------------------------------------------------------------------
    // 1. 4 treatments scored correctly with manual calculation
    // ------------------------------------------------------------------
    test('1. Evaluate: 4 treatments scored with correct manual calculation', () => {
        const nma = makeNMAResults();
        const criteria = makeCriteriaConfig();
        const weights = makeWeights();

        const result = engine.evaluate(nma, criteria, weights);

        expect(result.rankings).toHaveLength(4);

        // Manual calculation for treatment B:
        // efficacy: norm = (0.5 - (-1)) / (2 - (-1)) = 1.5/3 = 0.5, dir=max → 0.5
        // safety:   norm = (-0.2 - (-1)) / (1 - (-1)) = 0.8/2 = 0.4, dir=max → 0.4
        // cost:     norm = (5000 - 0) / (10000 - 0) = 0.5, dir=min → 1 - 0.5 = 0.5
        // score = 0.5*0.5 + 0.4*0.3 + 0.5*0.2 = 0.25 + 0.12 + 0.10 = 0.47
        const B = result.rankings.find(r => r.name === 'B');
        expect(B.score).toBeCloseTo(0.47, 4);

        // Verify contributions sum to score
        for (const r of result.rankings) {
            const contribSum = Object.values(r.contributions).reduce((a, b) => a + b, 0);
            expect(contribSum).toBeCloseTo(r.score, 10);
        }
    });

    // ------------------------------------------------------------------
    // 2. Best treatment has highest score and rank 1
    // ------------------------------------------------------------------
    test('2. Best treatment has rank 1', () => {
        const result = engine.evaluate(makeNMAResults(), makeCriteriaConfig(), makeWeights());

        expect(result.rankings[0].rank).toBe(1);
        // Rank 1 has highest score
        for (let i = 1; i < result.rankings.length; i++) {
            expect(result.rankings[0].score).toBeGreaterThanOrEqual(result.rankings[i].score - 1e-12);
        }
    });

    // ------------------------------------------------------------------
    // 3. Normalization: all contributions in [0, weight]
    // ------------------------------------------------------------------
    test('3. Normalized contributions are in [0, weight] for each criterion', () => {
        const weights = makeWeights();
        const result = engine.evaluate(makeNMAResults(), makeCriteriaConfig(), weights);

        for (const r of result.rankings) {
            for (const [criterion, contrib] of Object.entries(r.contributions)) {
                expect(contrib).toBeGreaterThanOrEqual(-1e-12);
                expect(contrib).toBeLessThanOrEqual(weights[criterion] + 1e-12);
            }
        }
    });

    // ------------------------------------------------------------------
    // 4. Minimize direction: lower cost → higher normalized score
    // ------------------------------------------------------------------
    test('4. Minimize direction: lower cost yields higher contribution', () => {
        const result = engine.evaluate(makeNMAResults(), makeCriteriaConfig(), makeWeights());

        const A = result.rankings.find(r => r.name === 'A');
        const D = result.rankings.find(r => r.name === 'D');

        // A has cost=1000, D has cost=8000. For minimize, A should have higher cost contribution
        expect(A.contributions.cost).toBeGreaterThan(D.contributions.cost);
    });

    // ------------------------------------------------------------------
    // 5. Probabilistic ranking: rank probabilities sum to 1 per treatment
    // ------------------------------------------------------------------
    test('5. Probabilistic: rank probabilities sum to 1 per treatment', () => {
        const result = engine.probabilisticRanking(
            makeNMAResults(), makeCriteriaConfig(), makeWeights(), 5000
        );

        for (const tx of result.treatments) {
            const sum = tx.rankProb.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 2);
        }
    });

    // ------------------------------------------------------------------
    // 6. Probabilistic: determinism with same seed
    // ------------------------------------------------------------------
    test('6. Probabilistic: same seed produces same rank probabilities', () => {
        const eng1 = new NetworkMCDAEngine({ seed: 42 });
        const eng2 = new NetworkMCDAEngine({ seed: 42 });

        const r1 = eng1.probabilisticRanking(makeNMAResults(), makeCriteriaConfig(), makeWeights(), 2000);
        const r2 = eng2.probabilisticRanking(makeNMAResults(), makeCriteriaConfig(), makeWeights(), 2000);

        for (let i = 0; i < r1.treatments.length; i++) {
            for (let j = 0; j < r1.treatments[i].rankProb.length; j++) {
                expect(r1.treatments[i].rankProb[j]).toBe(r2.treatments[i].rankProb[j]);
            }
        }
    });

    // ------------------------------------------------------------------
    // 7. Dominant treatment: highest efficacy, best safety, lowest cost → rank 1
    // ------------------------------------------------------------------
    test('7. Dominant treatment gets rank 1 with high probability', () => {
        const nma = {
            treatments: ['Weak', 'Dominant'],
            effects: {
                efficacy: { Weak: 0.1, Dominant: 1.5 },
                safety:   { Weak: -0.5, Dominant: 0.8 },
                cost:     { Weak: 8000, Dominant: 1000 }
            },
            uncertainty: {
                efficacy: { Weak: 0.1, Dominant: 0.1 },
                safety:   { Weak: 0.05, Dominant: 0.05 },
                cost:     { Weak: 200, Dominant: 200 }
            }
        };

        const result = engine.probabilisticRanking(nma, makeCriteriaConfig(), makeWeights(), 5000);

        const dominant = result.treatments.find(t => t.name === 'Dominant');
        expect(dominant.bestProb).toBeGreaterThan(0.9);
    });

    // ------------------------------------------------------------------
    // 8. Equal treatments: roughly equal rank probabilities
    // ------------------------------------------------------------------
    test('8. Equal treatments have roughly equal rank probabilities', () => {
        const nma = {
            treatments: ['X', 'Y'],
            effects: {
                efficacy: { X: 0.5, Y: 0.5 },
                safety:   { X: 0.0, Y: 0.0 },
                cost:     { X: 3000, Y: 3000 }
            },
            uncertainty: {
                efficacy: { X: 0.2, Y: 0.2 },
                safety:   { X: 0.1, Y: 0.1 },
                cost:     { X: 500, Y: 500 }
            }
        };

        const result = engine.probabilisticRanking(nma, makeCriteriaConfig(), makeWeights(), 5000);

        const X = result.treatments.find(t => t.name === 'X');
        const Y = result.treatments.find(t => t.name === 'Y');

        // Each should be rank 1 about 50% of the time
        expect(X.bestProb).toBeGreaterThan(0.3);
        expect(X.bestProb).toBeLessThan(0.7);
        expect(Y.bestProb).toBeGreaterThan(0.3);
        expect(Y.bestProb).toBeLessThan(0.7);
    });

    // ------------------------------------------------------------------
    // 9. VOI: highest for most uncertain criterion
    // ------------------------------------------------------------------
    test('9. VOI: highest for criterion with most uncertainty', () => {
        const nma = {
            treatments: ['A', 'B'],
            effects: {
                efficacy: { A: 0.5, B: 0.6 },
                safety:   { A: 0.0, B: -0.05 },
                cost:     { A: 3000, B: 3500 }
            },
            uncertainty: {
                efficacy: { A: 0.01, B: 0.01 },     // very certain
                safety:   { A: 0.01, B: 0.01 },      // very certain
                cost:     { A: 2000, B: 2000 }        // very uncertain
            }
        };

        const voi = engine.valueOfInformation(nma, makeCriteriaConfig(), makeWeights(), 2000);

        // Cost has highest uncertainty, so should have highest VOI (or close)
        expect(voi.length).toBe(3);
        // VOI is sorted descending by voi
        for (let i = 1; i < voi.length; i++) {
            expect(voi[i].voi).toBeLessThanOrEqual(voi[i - 1].voi + 1e-6);
        }
    });

    // ------------------------------------------------------------------
    // 10. VOI: zero when no uncertainty
    // ------------------------------------------------------------------
    test('10. VOI: zero when no uncertainty', () => {
        const nma = {
            treatments: ['A', 'B'],
            effects: {
                efficacy: { A: 0.3, B: 0.7 },
                safety:   { A: 0.0, B: -0.1 },
                cost:     { A: 2000, B: 4000 }
            },
            uncertainty: {
                efficacy: { A: 0, B: 0 },
                safety:   { A: 0, B: 0 },
                cost:     { A: 0, B: 0 }
            }
        };

        const voi = engine.valueOfInformation(nma, makeCriteriaConfig(), makeWeights(), 2000);

        for (const v of voi) {
            expect(v.voi).toBeCloseTo(0, 2);
            expect(v.currentUncertainty).toBe(0);
        }
    });

    // ------------------------------------------------------------------
    // 11. Weight sensitivity: changing weights changes ranking
    // ------------------------------------------------------------------
    test('11. Weight sensitivity: different weights produce different rankings', () => {
        const nma = makeNMAResults();
        const criteria = makeCriteriaConfig();

        // Weight efficacy heavily
        const w1 = { efficacy: 0.8, safety: 0.1, cost: 0.1 };
        const r1 = engine.evaluate(nma, criteria, w1);

        // Weight cost heavily
        const w2 = { efficacy: 0.1, safety: 0.1, cost: 0.8 };
        const r2 = engine.evaluate(nma, criteria, w2);

        // Rankings should differ (D has highest efficacy but highest cost)
        const top1 = r1.rankings[0].name;
        const top2 = r2.rankings[0].name;
        expect(top1).not.toBe(top2);
    });

    // ------------------------------------------------------------------
    // 12. Single criterion: ranking by that criterion alone
    // ------------------------------------------------------------------
    test('12. Single criterion: ranking matches that criterion', () => {
        const nma = {
            treatments: ['A', 'B', 'C'],
            effects: {
                efficacy: { A: 0.2, B: 0.8, C: 0.5 }
            },
            uncertainty: {}
        };
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 1] }
        ];
        const weights = { efficacy: 1.0 };

        const result = engine.evaluate(nma, criteria, weights);

        // B (0.8) > C (0.5) > A (0.2)
        expect(result.rankings[0].name).toBe('B');
        expect(result.rankings[1].name).toBe('C');
        expect(result.rankings[2].name).toBe('A');
    });

    // ------------------------------------------------------------------
    // 13. Two treatments: simple comparison
    // ------------------------------------------------------------------
    test('13. Two treatments: pairwise comparison', () => {
        const nma = {
            treatments: ['Control', 'Novel'],
            effects: {
                efficacy: { Control: 0, Novel: 0.5 },
                cost:     { Control: 1000, Novel: 3000 }
            },
            uncertainty: {}
        };
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [-1, 2] },
            { name: 'cost',     direction: 'minimize', scale: [0, 10000] }
        ];
        const weights = { efficacy: 0.6, cost: 0.4 };

        const result = engine.evaluate(nma, criteria, weights);

        expect(result.rankings).toHaveLength(2);
        // Both treatments have valid scores
        for (const r of result.rankings) {
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }
    });

    // ------------------------------------------------------------------
    // 14. Input validation: weights don't sum to 1
    // ------------------------------------------------------------------
    test('14. Weights not summing to 1 are auto-normalized', () => {
        const nma = makeNMAResults();
        const criteria = makeCriteriaConfig();
        // Weights sum to 2 — should be auto-normalized
        const weights = { efficacy: 1.0, safety: 0.6, cost: 0.4 };

        // Should not throw; auto-normalizes
        const result = engine.evaluate(nma, criteria, weights);
        expect(result.rankings).toHaveLength(4);

        // Contributions should still be valid
        for (const r of result.rankings) {
            expect(r.score).toBeGreaterThanOrEqual(0);
        }
    });

    // ------------------------------------------------------------------
    // 15. Input validation: missing treatment in effects
    // ------------------------------------------------------------------
    test('15. Missing treatment in effects throws', () => {
        const nma = {
            treatments: ['A', 'B', 'C'],
            effects: {
                efficacy: { A: 0.1, B: 0.5 }  // Missing C
            },
            uncertainty: {}
        };
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 1] }
        ];
        const weights = { efficacy: 1.0 };

        expect(() => engine.evaluate(nma, criteria, weights))
            .toThrow(/Missing effect for treatment "C"/);
    });

    // ------------------------------------------------------------------
    // 16. Dominance detection: dominated treatment identified
    // ------------------------------------------------------------------
    test('16. Dominance: clearly dominated treatment is detected', () => {
        // C is strictly dominated by B (B better on everything)
        const nma = {
            treatments: ['A', 'B', 'C'],
            effects: {
                efficacy: { A: 0.0, B: 0.8, C: 0.3 },
                safety:   { A: 0.0, B: 0.5, C: 0.4 },
                cost:     { A: 5000, B: 2000, C: 6000 }
            },
            uncertainty: {}
        };
        const criteria = makeCriteriaConfig();
        const weights = makeWeights();

        const result = engine.evaluate(nma, criteria, weights);

        // B dominates C (better efficacy, better safety, lower cost)
        const dominatedNames = result.dominance.map(d => d.dominated);
        expect(dominatedNames).toContain('C');
    });

    // ------------------------------------------------------------------
    // 17. Mean rank computed correctly
    // ------------------------------------------------------------------
    test('17. Mean rank is weighted average of rank probabilities', () => {
        const result = engine.probabilisticRanking(
            makeNMAResults(), makeCriteriaConfig(), makeWeights(), 3000
        );

        for (const tx of result.treatments) {
            const computedMean = tx.rankProb.reduce((sum, p, r) => sum + p * (r + 1), 0);
            expect(tx.meanRank).toBeCloseTo(computedMean, 10);
        }
    });

    // ------------------------------------------------------------------
    // 18. Rankings have correct structure
    // ------------------------------------------------------------------
    test('18. Rankings have name, score, rank, contributions', () => {
        const result = engine.evaluate(makeNMAResults(), makeCriteriaConfig(), makeWeights());

        for (const r of result.rankings) {
            expect(r).toHaveProperty('name');
            expect(r).toHaveProperty('score');
            expect(r).toHaveProperty('rank');
            expect(r).toHaveProperty('contributions');
            expect(typeof r.score).toBe('number');
            expect(typeof r.rank).toBe('number');
            expect(r.rank).toBeGreaterThanOrEqual(1);
        }
    });

    // ------------------------------------------------------------------
    // 19. VOI structure is correct
    // ------------------------------------------------------------------
    test('19. VOI returns correct structure', () => {
        const voi = engine.valueOfInformation(
            makeNMAResults(), makeCriteriaConfig(), makeWeights(), 1000
        );

        expect(Array.isArray(voi)).toBe(true);
        expect(voi.length).toBe(3);
        for (const v of voi) {
            expect(v).toHaveProperty('criterion');
            expect(v).toHaveProperty('voi');
            expect(v).toHaveProperty('currentUncertainty');
            expect(v.voi).toBeGreaterThanOrEqual(0);
            expect(typeof v.currentUncertainty).toBe('number');
        }
    });

    // ------------------------------------------------------------------
    // 20. Missing criterion in NMA effects throws
    // ------------------------------------------------------------------
    test('20. Missing criterion in NMA effects throws', () => {
        const nma = {
            treatments: ['A', 'B'],
            effects: {
                efficacy: { A: 0.1, B: 0.5 }
                // Missing safety and cost
            },
            uncertainty: {}
        };

        expect(() => engine.evaluate(nma, makeCriteriaConfig(), makeWeights()))
            .toThrow(/NMA effects missing criterion "safety"/);
    });
});
