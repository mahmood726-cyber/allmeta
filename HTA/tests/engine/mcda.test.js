/**
 * Tests for src/engine/mcda.js — Multi-Criteria Decision Analysis Engine
 */

'use strict';

const { PCG32 } = require('../../src/utils/pcg32');
global.PCG32 = PCG32;
globalThis.PCG32 = PCG32;

const { MCDAEngine } = require('../../src/engine/mcda');

// ── Helpers ──────────────────────────────────────────────────────

function makeCriteria2() {
    return [
        { name: 'efficacy', direction: 'maximize', scale: [0, 100] },
        { name: 'cost', direction: 'minimize', scale: [0, 50000] }
    ];
}

function makeAlternatives3() {
    return [
        { name: 'DrugA', values: { efficacy: 80, cost: 30000 } },
        { name: 'DrugB', values: { efficacy: 60, cost: 10000 } },
        { name: 'DrugC', values: { efficacy: 70, cost: 20000 } }
    ];
}

function makeWeights2() {
    return { efficacy: 0.6, cost: 0.4 };
}

// ── 1. Weighted Sum Basics ───────────────────────────────────────

describe('MCDAEngine — weightedSum', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('1. basic 3-alt 2-crit manual verification', () => {
        const alts = makeAlternatives3();
        const crit = makeCriteria2();
        const w = makeWeights2();
        const results = engine.weightedSum(alts, crit, w);

        // DrugA: efficacy norm = 80/100 = 0.8, cost norm = 1 - 30000/50000 = 0.4
        //   score = 0.8*0.6 + 0.4*0.4 = 0.48 + 0.16 = 0.64
        // DrugB: efficacy = 0.6, cost = 1 - 0.2 = 0.8
        //   score = 0.6*0.6 + 0.8*0.4 = 0.36 + 0.32 = 0.68
        // DrugC: efficacy = 0.7, cost = 1 - 0.4 = 0.6
        //   score = 0.7*0.6 + 0.6*0.4 = 0.42 + 0.24 = 0.66

        expect(results).toHaveLength(3);
        expect(results[0].name).toBe('DrugB');
        expect(results[1].name).toBe('DrugC');
        expect(results[2].name).toBe('DrugA');
        expect(results[0].score).toBeCloseTo(0.68, 6);
        expect(results[1].score).toBeCloseTo(0.66, 6);
        expect(results[2].score).toBeCloseTo(0.64, 6);
    });

    test('2. normalization maps to [0,1]', () => {
        const crit = [{ name: 'x', direction: 'maximize', scale: [10, 50] }];
        const alts = [
            { name: 'low', values: { x: 10 } },
            { name: 'mid', values: { x: 30 } },
            { name: 'high', values: { x: 50 } }
        ];
        const w = { x: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        const byName = Object.fromEntries(results.map(r => [r.name, r]));
        expect(byName.low.normalizedValues.x).toBeCloseTo(0.0, 6);
        expect(byName.mid.normalizedValues.x).toBeCloseTo(0.5, 6);
        expect(byName.high.normalizedValues.x).toBeCloseTo(1.0, 6);
    });

    test('3. minimize direction: lower raw = higher normalized', () => {
        const crit = [{ name: 'cost', direction: 'minimize', scale: [0, 100] }];
        const alts = [
            { name: 'cheap', values: { cost: 20 } },
            { name: 'pricey', values: { cost: 80 } }
        ];
        const w = { cost: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        expect(results[0].name).toBe('cheap');
        expect(results[0].normalizedValues.cost).toBeCloseTo(0.8, 6);
        expect(results[1].normalizedValues.cost).toBeCloseTo(0.2, 6);
    });

    test('4. correct rank order', () => {
        const results = engine.weightedSum(makeAlternatives3(), makeCriteria2(), makeWeights2());
        expect(results[0].rank).toBe(1);
        expect(results[1].rank).toBe(2);
        expect(results[2].rank).toBe(3);
    });

    test('5. equal scores → tied rank', () => {
        const crit = [{ name: 'x', direction: 'maximize', scale: [0, 10] }];
        const alts = [
            { name: 'A', values: { x: 5 } },
            { name: 'B', values: { x: 5 } }
        ];
        const w = { x: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        expect(results[0].rank).toBe(1);
        expect(results[1].rank).toBe(1);
    });

    test('6. single criterion degenerates to sorting by value', () => {
        const crit = [{ name: 'eff', direction: 'maximize', scale: [0, 100] }];
        const alts = [
            { name: 'low', values: { eff: 20 } },
            { name: 'high', values: { eff: 90 } },
            { name: 'mid', values: { eff: 55 } }
        ];
        const w = { eff: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        expect(results.map(r => r.name)).toEqual(['high', 'mid', 'low']);
    });
});

// ── 7-8. Swing Weighting ─────────────────────────────────────────

describe('MCDAEngine — swingWeight', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('7. 3 criteria ranked → correct proportional weights', () => {
        const ranges = [
            { criterion: 'efficacy', worst: 0, best: 100, rank: 1 },
            { criterion: 'safety', worst: 0, best: 10, rank: 2 },
            { criterion: 'cost', worst: 50000, best: 0, rank: 3 }
        ];
        const w = engine.swingWeight(ranges);

        // Rank 1: 100*(3-1+1)/3 = 100, Rank 2: 100*(3-2+1)/3 = 66.67, Rank 3: 100*(3-3+1)/3 = 33.33
        // Total = 200, so: 100/200=0.5, 66.67/200=0.333, 33.33/200=0.167
        expect(w.efficacy).toBeCloseTo(0.5, 2);
        expect(w.safety).toBeCloseTo(1/3, 2);
        expect(w.cost).toBeCloseTo(1/6, 2);

        // Rank 1 should have highest weight
        expect(w.efficacy).toBeGreaterThan(w.safety);
        expect(w.safety).toBeGreaterThan(w.cost);
    });

    test('8. swing weights sum to 1', () => {
        const ranges = [
            { criterion: 'a', worst: 0, best: 1, rank: 1 },
            { criterion: 'b', worst: 0, best: 1, rank: 2 },
            { criterion: 'c', worst: 0, best: 1, rank: 3 },
            { criterion: 'd', worst: 0, best: 1, rank: 4 }
        ];
        const w = engine.swingWeight(ranges);
        const sum = Object.values(w).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 8);
    });
});

// ── 9-10. Rank Acceptability ─────────────────────────────────────

describe('MCDAEngine — rankAcceptability', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine({ seed: 42 }); });

    test('9. rank probabilities sum to 1 for each alternative', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        const weightDists = [
            { criterion: 'efficacy', dist: { type: 'uniform', min: 0.2, max: 0.8 } },
            { criterion: 'cost', dist: { type: 'uniform', min: 0.2, max: 0.8 } }
        ];
        const results = engine.rankAcceptability(alts, crit, weightDists, 5000);

        expect(results).toHaveLength(3);
        for (const r of results) {
            const probSum = r.rankProb.reduce((a, b) => a + b, 0);
            expect(probSum).toBeCloseTo(1.0, 2);
        }
    });

    test('10. determinism: same seed → same results', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        const weightDists = [
            { criterion: 'efficacy', dist: { type: 'uniform', min: 0.1, max: 0.9 } },
            { criterion: 'cost', dist: { type: 'uniform', min: 0.1, max: 0.9 } }
        ];

        const engine1 = new MCDAEngine({ seed: 99 });
        const engine2 = new MCDAEngine({ seed: 99 });
        const r1 = engine1.rankAcceptability(alts, crit, weightDists, 2000);
        const r2 = engine2.rankAcceptability(alts, crit, weightDists, 2000);

        for (let i = 0; i < r1.length; i++) {
            for (let j = 0; j < r1[i].rankProb.length; j++) {
                expect(r1[i].rankProb[j]).toBe(r2[i].rankProb[j]);
            }
        }
    });
});

// ── 11-13. Dominance Detection ───────────────────────────────────

describe('MCDAEngine — detectDominance', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('11. A > B on all criteria → B dominated', () => {
        const crit = [
            { name: 'eff', direction: 'maximize', scale: [0, 100] },
            { name: 'safety', direction: 'maximize', scale: [0, 10] }
        ];
        const alts = [
            { name: 'A', values: { eff: 90, safety: 8 } },
            { name: 'B', values: { eff: 50, safety: 4 } }
        ];
        const dominated = engine.detectDominance(alts, crit);
        expect(dominated).toHaveLength(1);
        expect(dominated[0].name).toBe('B');
        expect(dominated[0].dominatedBy).toBe('A');
    });

    test('12. Pareto-efficient set → no dominance', () => {
        const crit = [
            { name: 'eff', direction: 'maximize', scale: [0, 100] },
            { name: 'cost', direction: 'minimize', scale: [0, 50000] }
        ];
        const alts = [
            { name: 'A', values: { eff: 90, cost: 40000 } },  // high eff, high cost
            { name: 'B', values: { eff: 60, cost: 10000 } }   // low eff, low cost
        ];
        const dominated = engine.detectDominance(alts, crit);
        expect(dominated).toHaveLength(0);
    });

    test('13. partial dominance: A > B on some, = on rest', () => {
        const crit = [
            { name: 'eff', direction: 'maximize', scale: [0, 100] },
            { name: 'safety', direction: 'maximize', scale: [0, 10] }
        ];
        const alts = [
            { name: 'A', values: { eff: 80, safety: 5 } },
            { name: 'B', values: { eff: 70, safety: 5 } }  // same safety, worse eff
        ];
        const dominated = engine.detectDominance(alts, crit);
        expect(dominated).toHaveLength(1);
        expect(dominated[0].name).toBe('B');
        expect(dominated[0].dominatedBy).toBe('A');
    });
});

// ── 14-15. Weight Sensitivity ────────────────────────────────────

describe('MCDAEngine — weightSensitivity', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('14. varying weight changes ranking', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        const w = makeWeights2();
        const result = engine.weightSensitivity(alts, crit, w, 'efficacy', 20);

        expect(result.weights).toHaveLength(21);
        expect(result.weights[0]).toBe(0);
        expect(result.weights[20]).toBe(1);
        expect(Object.keys(result.scores)).toHaveLength(3);

        // At weight=1 for efficacy, DrugA (eff=80) should score highest
        const scoresAtMax = {};
        for (const name of Object.keys(result.scores)) {
            scoresAtMax[name] = result.scores[name][20];
        }
        expect(scoresAtMax.DrugA).toBeGreaterThan(scoresAtMax.DrugB);
        expect(scoresAtMax.DrugA).toBeGreaterThan(scoresAtMax.DrugC);
    });

    test('15. at weight=0, criterion has no effect', () => {
        const crit = makeCriteria2();
        const alts = [
            { name: 'A', values: { efficacy: 100, cost: 25000 } },
            { name: 'B', values: { efficacy: 0, cost: 25000 } }
        ];
        const w = { efficacy: 0.5, cost: 0.5 };
        const result = engine.weightSensitivity(alts, crit, w, 'efficacy', 10);

        // At efficacy weight=0, both should have same score (same cost)
        const scoreA_0 = result.scores.A[0];
        const scoreB_0 = result.scores.B[0];
        expect(scoreA_0).toBeCloseTo(scoreB_0, 6);
    });
});

// ── 16-19. Partial Value Functions ───────────────────────────────

describe('MCDAEngine — partialValue', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('16. linear maps correctly', () => {
        expect(engine.partialValue(0, [0, 100], 'linear')).toBeCloseTo(0.0, 6);
        expect(engine.partialValue(50, [0, 100], 'linear')).toBeCloseTo(0.5, 6);
        expect(engine.partialValue(100, [0, 100], 'linear')).toBeCloseTo(1.0, 6);
        expect(engine.partialValue(25, [0, 100], 'linear')).toBeCloseTo(0.25, 6);
    });

    test('17. concave (sqrt) transform', () => {
        // sqrt(0.25) = 0.5
        expect(engine.partialValue(25, [0, 100], 'concave')).toBeCloseTo(0.5, 6);
        expect(engine.partialValue(0, [0, 100], 'concave')).toBeCloseTo(0.0, 6);
        expect(engine.partialValue(100, [0, 100], 'concave')).toBeCloseTo(1.0, 6);
        // sqrt(0.5) ≈ 0.7071
        expect(engine.partialValue(50, [0, 100], 'concave')).toBeCloseTo(Math.sqrt(0.5), 4);
    });

    test('18. convex (square) transform', () => {
        // 0.5^2 = 0.25
        expect(engine.partialValue(50, [0, 100], 'convex')).toBeCloseTo(0.25, 6);
        expect(engine.partialValue(0, [0, 100], 'convex')).toBeCloseTo(0.0, 6);
        expect(engine.partialValue(100, [0, 100], 'convex')).toBeCloseTo(1.0, 6);
    });

    test('19. step: binary at midpoint', () => {
        expect(engine.partialValue(49, [0, 100], 'step')).toBe(0);
        expect(engine.partialValue(50, [0, 100], 'step')).toBe(1);
        expect(engine.partialValue(75, [0, 100], 'step')).toBe(1);
        expect(engine.partialValue(0, [0, 100], 'step')).toBe(0);
        expect(engine.partialValue(100, [0, 100], 'step')).toBe(1);
    });
});

// ── 20-22. Input Validation ──────────────────────────────────────

describe('MCDAEngine — input validation', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('20. weights don\'t sum to 1 → error', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        expect(() => {
            engine.weightedSum(alts, crit, { efficacy: 0.5, cost: 0.3 });
        }).toThrow(/Weights must sum to 1/);
    });

    test('21. unknown criterion in weights → error', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        expect(() => {
            engine.weightedSum(alts, crit, { efficacy: 0.5, cost: 0.3, bogus: 0.2 });
        }).toThrow(/unknown criterion "bogus"/);
    });

    test('22. invalid direction → error', () => {
        const crit = [{ name: 'x', direction: 'up', scale: [0, 10] }];
        const alts = [{ name: 'A', values: { x: 5 } }];
        expect(() => {
            engine.weightedSum(alts, crit, { x: 1.0 });
        }).toThrow(/Invalid direction/);
    });

    test('scale min >= max → error', () => {
        const crit = [{ name: 'x', direction: 'maximize', scale: [10, 10] }];
        const alts = [{ name: 'A', values: { x: 5 } }];
        expect(() => {
            engine.weightedSum(alts, crit, { x: 1.0 });
        }).toThrow(/min.*must be < max/);
    });

    test('missing weight for a criterion → error', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        expect(() => {
            engine.weightedSum(alts, crit, { efficacy: 1.0 });
        }).toThrow(/Missing weight/);
    });

    test('missing value in alternative → error', () => {
        const crit = makeCriteria2();
        const alts = [{ name: 'A', values: { efficacy: 50 } }]; // missing cost
        expect(() => {
            engine.weightedSum(alts, crit, { efficacy: 0.5, cost: 0.5 });
        }).toThrow(/missing value/);
    });

    test('empty alternatives → error', () => {
        expect(() => {
            engine.weightedSum([], makeCriteria2(), makeWeights2());
        }).toThrow(/non-empty/);
    });

    test('empty criteria → error', () => {
        expect(() => {
            engine.weightedSum(makeAlternatives3(), [], makeWeights2());
        }).toThrow(/non-empty/);
    });
});

// ── 23. Real HTA example ────────────────────────────────────────

describe('MCDAEngine — real HTA example', () => {
    test('23. 3 alternatives, 4 criteria HTA benefit-risk', () => {
        const engine = new MCDAEngine();
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 100] },
            { name: 'safety', direction: 'maximize', scale: [0, 10] },
            { name: 'cost', direction: 'minimize', scale: [0, 100000] },
            { name: 'convenience', direction: 'maximize', scale: [0, 5] }
        ];
        const alternatives = [
            { name: 'NewDrug', values: { efficacy: 85, safety: 7, cost: 80000, convenience: 4 } },
            { name: 'Standard', values: { efficacy: 65, safety: 8, cost: 30000, convenience: 3 } },
            { name: 'Generic', values: { efficacy: 60, safety: 9, cost: 5000, convenience: 2 } }
        ];
        const weights = { efficacy: 0.4, safety: 0.2, cost: 0.3, convenience: 0.1 };
        const results = engine.weightedSum(alternatives, criteria, weights);

        expect(results).toHaveLength(3);
        // Each has name, score, rank, normalizedValues
        for (const r of results) {
            expect(r).toHaveProperty('name');
            expect(r).toHaveProperty('score');
            expect(r).toHaveProperty('rank');
            expect(r).toHaveProperty('normalizedValues');
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }

        // Verify manual calculation for Generic:
        // efficacy: 60/100 = 0.6; safety: 9/10 = 0.9; cost: 1 - 5000/100000 = 0.95; convenience: 2/5 = 0.4
        // score = 0.6*0.4 + 0.9*0.2 + 0.95*0.3 + 0.4*0.1 = 0.24 + 0.18 + 0.285 + 0.04 = 0.745
        const generic = results.find(r => r.name === 'Generic');
        expect(generic.score).toBeCloseTo(0.745, 4);
    });
});

// ── 24. Tie-breaking ────────────────────────────────────────────

describe('MCDAEngine — tie handling', () => {
    test('24. ties broken consistently (alphabetical)', () => {
        const engine = new MCDAEngine();
        const crit = [{ name: 'x', direction: 'maximize', scale: [0, 10] }];
        const alts = [
            { name: 'Zebra', values: { x: 5 } },
            { name: 'Apple', values: { x: 5 } },
            { name: 'Mango', values: { x: 5 } }
        ];
        const w = { x: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        // All tied at rank 1, alphabetical order in output
        expect(results[0].name).toBe('Apple');
        expect(results[1].name).toBe('Mango');
        expect(results[2].name).toBe('Zebra');
        expect(results[0].rank).toBe(1);
        expect(results[1].rank).toBe(1);
        expect(results[2].rank).toBe(1);
    });
});

// ── 25. Large problem ───────────────────────────────────────────

describe('MCDAEngine — large problem', () => {
    test('25. 10 alternatives, 8 criteria', () => {
        const engine = new MCDAEngine();
        const criteria = [
            { name: 'c1', direction: 'maximize', scale: [0, 100] },
            { name: 'c2', direction: 'minimize', scale: [0, 100] },
            { name: 'c3', direction: 'maximize', scale: [0, 50] },
            { name: 'c4', direction: 'minimize', scale: [0, 200] },
            { name: 'c5', direction: 'maximize', scale: [0, 10] },
            { name: 'c6', direction: 'minimize', scale: [0, 1000] },
            { name: 'c7', direction: 'maximize', scale: [0, 1] },
            { name: 'c8', direction: 'maximize', scale: [0, 5] }
        ];
        const weights = { c1: 0.2, c2: 0.15, c3: 0.1, c4: 0.15, c5: 0.1, c6: 0.1, c7: 0.1, c8: 0.1 };

        // Generate 10 alternatives with varied values
        const alts = [];
        for (let i = 0; i < 10; i++) {
            const values = {};
            for (const c of criteria) {
                values[c.name] = c.scale[0] + (c.scale[1] - c.scale[0]) * ((i * 7 + criteria.indexOf(c) * 3) % 11) / 10;
            }
            alts.push({ name: `Alt${i}`, values });
        }

        const results = engine.weightedSum(alts, criteria, weights);
        expect(results).toHaveLength(10);
        // Ranks should be 1..10 (or have ties)
        for (const r of results) {
            expect(r.rank).toBeGreaterThanOrEqual(1);
            expect(r.rank).toBeLessThanOrEqual(10);
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }
    });
});

// ── Additional edge-case tests ──────────────────────────────────

describe('MCDAEngine — additional tests', () => {
    let engine;
    beforeEach(() => { engine = new MCDAEngine(); });

    test('26. values at scale boundaries', () => {
        const crit = [{ name: 'x', direction: 'maximize', scale: [10, 90] }];
        const alts = [
            { name: 'atMin', values: { x: 10 } },
            { name: 'atMax', values: { x: 90 } },
            { name: 'belowMin', values: { x: 5 } },   // clamped to 0
            { name: 'aboveMax', values: { x: 100 } }   // clamped to 1
        ];
        const w = { x: 1.0 };
        const results = engine.weightedSum(alts, crit, w);

        const byName = Object.fromEntries(results.map(r => [r.name, r]));
        expect(byName.atMin.normalizedValues.x).toBeCloseTo(0.0, 6);
        expect(byName.atMax.normalizedValues.x).toBeCloseTo(1.0, 6);
        expect(byName.belowMin.normalizedValues.x).toBeCloseTo(0.0, 6);
        expect(byName.aboveMax.normalizedValues.x).toBeCloseTo(1.0, 6);
    });

    test('27. swing weighting with 2 criteria', () => {
        const ranges = [
            { criterion: 'a', worst: 0, best: 100, rank: 1 },
            { criterion: 'b', worst: 0, best: 50, rank: 2 }
        ];
        const w = engine.swingWeight(ranges);
        // Rank 1: 100*(2-1+1)/2 = 100, Rank 2: 100*(2-2+1)/2 = 50
        // Total = 150. a=100/150=2/3, b=50/150=1/3
        expect(w.a).toBeCloseTo(2/3, 4);
        expect(w.b).toBeCloseTo(1/3, 4);
    });

    test('28. dominance with 3 alternatives — one dominated', () => {
        const crit = [
            { name: 'eff', direction: 'maximize', scale: [0, 100] },
            { name: 'safety', direction: 'maximize', scale: [0, 10] },
            { name: 'cost', direction: 'minimize', scale: [0, 50000] }
        ];
        const alts = [
            { name: 'A', values: { eff: 80, safety: 8, cost: 20000 } },
            { name: 'B', values: { eff: 70, safety: 6, cost: 30000 } }, // dominated by A
            { name: 'C', values: { eff: 90, safety: 5, cost: 10000 } }
        ];
        const dominated = engine.detectDominance(alts, crit);
        expect(dominated).toHaveLength(1);
        expect(dominated[0].name).toBe('B');
        expect(dominated[0].dominatedBy).toBe('A');
    });

    test('29. weight sensitivity returns correct steps', () => {
        const crit = makeCriteria2();
        const alts = makeAlternatives3();
        const w = makeWeights2();
        const result = engine.weightSensitivity(alts, crit, w, 'efficacy', 10);

        expect(result.weights).toHaveLength(11); // 0 to 10 inclusive = 11 steps
        expect(result.weights[0]).toBe(0);
        expect(result.weights[5]).toBeCloseTo(0.5, 6);
        expect(result.weights[10]).toBe(1);
    });

    test('30. weight sensitivity detects crossings', () => {
        const crit = [
            { name: 'eff', direction: 'maximize', scale: [0, 100] },
            { name: 'cost', direction: 'minimize', scale: [0, 100] }
        ];
        // A: high eff, high cost; B: low eff, low cost
        const alts = [
            { name: 'A', values: { eff: 90, cost: 80 } },
            { name: 'B', values: { eff: 40, cost: 10 } }
        ];
        const w = { eff: 0.5, cost: 0.5 };
        const result = engine.weightSensitivity(alts, crit, w, 'eff', 20);

        // At eff weight=0, only cost matters → B wins (lower cost)
        // At eff weight=1, only eff matters → A wins (higher eff)
        // There should be at least one crossing
        expect(result.crossings.length).toBeGreaterThanOrEqual(1);
    });

    test('31. rank acceptability with dominant alternative', () => {
        const engine2 = new MCDAEngine({ seed: 100 });
        const crit = [
            { name: 'x', direction: 'maximize', scale: [0, 100] },
            { name: 'y', direction: 'maximize', scale: [0, 100] }
        ];
        const alts = [
            { name: 'Best', values: { x: 100, y: 100 } },
            { name: 'Worst', values: { x: 0, y: 0 } }
        ];
        const weightDists = [
            { criterion: 'x', dist: { type: 'uniform', min: 0.1, max: 0.9 } },
            { criterion: 'y', dist: { type: 'uniform', min: 0.1, max: 0.9 } }
        ];
        const results = engine2.rankAcceptability(alts, crit, weightDists, 3000);

        const best = results.find(r => r.name === 'Best');
        // Best should rank 1st in ~100% of simulations
        expect(best.rankProb[0]).toBeCloseTo(1.0, 2);
    });

    test('32. partial value clamps out-of-range values', () => {
        // Value below min
        expect(engine.partialValue(-10, [0, 100], 'linear')).toBeCloseTo(0.0, 6);
        // Value above max
        expect(engine.partialValue(200, [0, 100], 'linear')).toBeCloseTo(1.0, 6);
    });

    test('33. unknown partial value type → error', () => {
        expect(() => {
            engine.partialValue(50, [0, 100], 'exponential');
        }).toThrow(/Unknown partial value type/);
    });

    test('34. swing weight with single criterion', () => {
        const ranges = [{ criterion: 'only', worst: 0, best: 100, rank: 1 }];
        const w = engine.swingWeight(ranges);
        expect(w.only).toBeCloseTo(1.0, 8);
    });

    test('35. all criteria minimize — full reversal', () => {
        const crit = [
            { name: 'cost', direction: 'minimize', scale: [0, 100] },
            { name: 'toxicity', direction: 'minimize', scale: [0, 50] }
        ];
        const alts = [
            { name: 'Safe', values: { cost: 10, toxicity: 5 } },
            { name: 'Risky', values: { cost: 90, toxicity: 45 } }
        ];
        const w = { cost: 0.5, toxicity: 0.5 };
        const results = engine.weightedSum(alts, crit, w);

        expect(results[0].name).toBe('Safe');
        expect(results[0].score).toBeGreaterThan(results[1].score);
        // Safe: cost norm = 1-0.1=0.9, toxicity norm = 1-0.1=0.9, score=0.9
        expect(results[0].score).toBeCloseTo(0.9, 4);
    });
});
