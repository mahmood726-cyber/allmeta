/**
 * Tests for src/engine/thresholdAnalysis.js — ThresholdAnalysisEngine
 */

'use strict';

const { ThresholdAnalysisEngine } = require('../../src/engine/thresholdAnalysis');

// ---------------------------------------------------------------------------
// Test model: New treatment vs Current (comparator)
// cost = drug_cost + 1000 (treatment arm), comparator cost = 3000
// qaly = utility * 10 (treatment arm), comparator qaly = 7
// NMB = (utility*10 - 7) * wtp - (drug_cost + 1000 - 3000)
//     = (utility*10 - 7) * wtp - drug_cost + 2000
// ---------------------------------------------------------------------------
const simpleModel = (params) => ({
    cost: (params.drug_cost ?? 5000) + 1000,
    qaly: (params.utility ?? 0.8) * 10,
    comparatorCost: 3000,
    comparatorQaly: 7
});

describe('ThresholdAnalysisEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new ThresholdAnalysisEngine({ tolerance: 0.001 });
    });

    // ===== oneway =====
    describe('oneway', () => {
        test('1. finds threshold for drug_cost where ICER = WTP', () => {
            // NMB = (0.8*10-7)*wtp - (drug_cost+1000-3000) = 1*wtp - drug_cost + 2000
            // At wtp=50000: NMB = 50000 - drug_cost + 2000 = 0 → drug_cost = 52000
            const result = engine.oneway(simpleModel, 'drug_cost', [1000, 100000], 50000, 200);
            expect(result.thresholdExists).toBe(true);
            expect(result.threshold).toBeCloseTo(52000, -1);
            expect(result.param).toBe('drug_cost');
        });

        test('2. no threshold in range returns thresholdExists = false', () => {
            // NMB at drug_cost=1000: 50000-1000+2000=51000 > 0
            // NMB at drug_cost=10000: 50000-10000+2000=42000 > 0
            // Both positive → no crossing
            const result = engine.oneway(simpleModel, 'drug_cost', [1000, 10000], 50000, 100);
            expect(result.thresholdExists).toBe(false);
            expect(result.threshold).toBeNull();
        });

        test('3. threshold near boundary of range', () => {
            // Threshold at 52000; range [51999, 53000]
            const result = engine.oneway(simpleModel, 'drug_cost', [51999, 53000], 50000, 200);
            expect(result.thresholdExists).toBe(true);
            expect(result.threshold).toBeCloseTo(52000, -1);
        });

        test('4. optimal strategies are determined correctly', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [1000, 100000], 50000, 100);
            // Below threshold (low cost) → New is better (NMB > 0)
            expect(result.optimalBelow).toBe('New');
            // Above threshold (high cost) → Current is better (NMB < 0)
            expect(result.optimalAbove).toBe('Current');
        });

        test('5. values array has correct length (steps+1)', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [0, 10000], 50000, 50);
            expect(result.values).toHaveLength(51);
            expect(result.nmb).toHaveLength(51);
            expect(result.icer).toHaveLength(51);
        });

        test('6. NMB computed correctly at each point', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [5000, 5000], 50000, 0);
            // Only one point: drug_cost=5000, utility=0.8
            // NMB = (8-7)*50000 - (6000-3000) = 50000-3000 = 47000
            expect(result.nmb[0]).toBeCloseTo(47000, 0);
        });

        test('7. steps parameter controls resolution', () => {
            const r10 = engine.oneway(simpleModel, 'drug_cost', [0, 10000], 50000, 10);
            const r100 = engine.oneway(simpleModel, 'drug_cost', [0, 10000], 50000, 100);
            expect(r10.values).toHaveLength(11);
            expect(r100.values).toHaveLength(101);
        });

        test('8. ICER computed at each value', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [5000, 5000], 50000, 0);
            // ICER = (6000-3000)/(8-7) = 3000
            expect(result.icer[0]).toBeCloseTo(3000, 0);
        });
    });

    // ===== twoway =====
    describe('twoway', () => {
        test('9. 2D grid computed with correct dimensions', () => {
            const result = engine.twoway(
                simpleModel,
                [{ name: 'drug_cost' }, { name: 'utility' }],
                [[1000, 10000], [0.5, 1.0]],
                50000,
                10
            );
            expect(result.param1.values).toHaveLength(11);
            expect(result.param2.values).toHaveLength(11);
            expect(result.nmbGrid).toHaveLength(11);
            expect(result.nmbGrid[0]).toHaveLength(11);
        });

        test('10. threshold line separates positive and negative NMB regions', () => {
            const result = engine.twoway(
                simpleModel,
                [{ name: 'drug_cost' }, { name: 'utility' }],
                [[1000, 100000], [0.3, 1.0]],
                50000,
                20
            );
            // There should be a threshold boundary
            expect(result.thresholdLine.length).toBeGreaterThan(0);
            // Both strategies should appear
            expect(result.optimalRegions.length).toBe(2);
        });

        test('11. optimal regions fractions sum to ~1', () => {
            const result = engine.twoway(
                simpleModel,
                [{ name: 'drug_cost' }, { name: 'utility' }],
                [[1000, 100000], [0.3, 1.0]],
                50000,
                10
            );
            const totalFraction = result.optimalRegions.reduce((s, r) => s + r.fraction, 0);
            expect(totalFraction).toBeCloseTo(1.0, 5);
        });
    });

    // ===== tornado =====
    describe('tornado', () => {
        const baseParams = { drug_cost: 5000, utility: 0.8 };
        const paramRanges = [
            { name: 'drug_cost', low: 2000, high: 10000, baseValue: 5000 },
            { name: 'utility', low: 0.5, high: 1.0, baseValue: 0.8 }
        ];

        test('12. bars sorted by swing descending', () => {
            const result = engine.tornado(simpleModel, paramRanges, baseParams, 50000);
            expect(result.sortedBySwing).toBe(true);
            for (let i = 1; i < result.bars.length; i++) {
                expect(result.bars[i - 1].swing).toBeGreaterThanOrEqual(result.bars[i].swing);
            }
        });

        test('13. widest swing = most influential parameter', () => {
            const result = engine.tornado(simpleModel, paramRanges, baseParams, 50000);
            // drug_cost swing: at wtp=50000, NMB changes by |high-low| = 8000 for cost
            // utility swing: at wtp=50000, NMB changes by (1.0-0.5)*10*50000 = 250000 for utility
            expect(result.bars[0].name).toBe('utility');
        });

        test('14. single parameter tornado', () => {
            const result = engine.tornado(
                simpleModel,
                [{ name: 'drug_cost', low: 3000, high: 8000, baseValue: 5000 }],
                baseParams,
                50000
            );
            expect(result.bars).toHaveLength(1);
            expect(result.bars[0].name).toBe('drug_cost');
            // Swing = |NMB(8000) - NMB(3000)| = |(-8000+1000)+(-3000+1000)| ... actually:
            // NMB(3000) = (8-7)*50000 - (4000-3000) = 49000
            // NMB(8000) = (8-7)*50000 - (9000-3000) = 44000
            // Swing = 5000
            expect(result.bars[0].swing).toBeCloseTo(5000, 0);
        });

        test('15. swing values are non-negative', () => {
            const result = engine.tornado(simpleModel, paramRanges, baseParams, 50000);
            for (const bar of result.bars) {
                expect(bar.swing).toBeGreaterThanOrEqual(0);
            }
        });

        test('16. baseNMB is included in output', () => {
            const result = engine.tornado(simpleModel, paramRanges, baseParams, 50000);
            // Base NMB = (8-7)*50000 - (6000-3000) = 47000
            expect(result.baseNMB).toBeCloseTo(47000, 0);
        });
    });

    // ===== findBreakeven =====
    describe('findBreakeven', () => {
        test('17. converges within tolerance', () => {
            const threshold = engine.findBreakeven(simpleModel, 'drug_cost', [1000, 100000], 50000, 0.01);
            expect(threshold).not.toBeNull();
            // Verify: at threshold, NMB should be ~0
            const result = simpleModel({ drug_cost: threshold });
            const nmb = (result.qaly - result.comparatorQaly) * 50000 - (result.cost - result.comparatorCost);
            expect(Math.abs(nmb)).toBeLessThan(1);
        });

        test('18. no breakeven returns null', () => {
            const threshold = engine.findBreakeven(simpleModel, 'drug_cost', [1000, 10000], 50000, 0.01);
            expect(threshold).toBeNull();
        });

        test('19. breakeven value is within range', () => {
            const threshold = engine.findBreakeven(simpleModel, 'drug_cost', [1000, 100000], 50000, 0.01);
            expect(threshold).toBeGreaterThanOrEqual(1000);
            expect(threshold).toBeLessThanOrEqual(100000);
        });
    });

    // ===== Edge cases =====
    describe('edge cases', () => {
        test('20. flat model (no sensitivity to parameter)', () => {
            const flatModel = (params) => ({
                cost: 5000,
                qaly: 8,
                comparatorCost: 3000,
                comparatorQaly: 7
            });
            const result = engine.oneway(flatModel, 'drug_cost', [1000, 10000], 50000, 50);
            // NMB is constant → no threshold
            expect(result.thresholdExists).toBe(false);
        });

        test('21. very narrow range', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [5000, 5001], 50000, 10);
            expect(result.values).toHaveLength(11);
            expect(result.values[0]).toBeCloseTo(5000, 0);
            expect(result.values[10]).toBeCloseTo(5001, 0);
        });

        test('22. zero WTP', () => {
            const result = engine.oneway(simpleModel, 'drug_cost', [1000, 10000], 0, 50);
            // NMB = (qaly-cQaly)*0 - (cost-cCost) = -(drug_cost+1000-3000) = 2000-drug_cost
            // Threshold at drug_cost=2000
            expect(result.thresholdExists).toBe(true);
            expect(result.threshold).toBeCloseTo(2000, -1);
        });

        test('23. negative NMB everywhere', () => {
            // Very high cost → NMB always negative
            const highCostModel = (params) => ({
                cost: (params.drug_cost ?? 100000) + 100000,
                qaly: (params.utility ?? 0.8) * 10,
                comparatorCost: 3000,
                comparatorQaly: 7
            });
            const result = engine.oneway(highCostModel, 'drug_cost', [50000, 100000], 50000, 50);
            expect(result.thresholdExists).toBe(false);
            expect(result.optimalBelow).toBe('Current');
            expect(result.optimalAbove).toBe('Current');
        });

        test('24. multiple strategies comparison via custom model', () => {
            // Model that changes strategy at threshold
            const multiModel = (params) => {
                const cost = params.drug_cost ?? 5000;
                return {
                    cost: cost,
                    qaly: 10 - cost / 50000,
                    comparatorCost: 4000,
                    comparatorQaly: 8
                };
            };
            const result = engine.oneway(multiModel, 'drug_cost', [1000, 20000], 50000, 200);
            expect(result.values.length).toBeGreaterThan(0);
            expect(result.nmb.length).toBe(result.values.length);
        });

        test('25. constructor respects custom tolerance and maxIter', () => {
            const custom = new ThresholdAnalysisEngine({ tolerance: 1e-6, maxIter: 500 });
            expect(custom.tolerance).toBe(1e-6);
            expect(custom.maxIter).toBe(500);
        });
    });
});
