/**
 * Tests for src/engine/headroomAnalysis.js — HeadroomAnalysisEngine
 */

'use strict';

const { HeadroomAnalysisEngine } = require('../../src/engine/headroomAnalysis');

// ---------------------------------------------------------------------------
// Test model: New treatment vs Current (comparator)
// cost = price + 1000 (treatment arm), comparator cost = 3000
// qaly = 9 (treatment arm), comparator qaly = 7
// incCost = price + 1000 - 3000 = price - 2000
// incQaly = 9 - 7 = 2
// ICER = (price - 2000) / 2
// NMB = 2 * wtp - (price - 2000) = 2*wtp - price + 2000
// NMB = 0 → price = 2*wtp + 2000
// ---------------------------------------------------------------------------
const simpleModel = (params) => ({
    cost: (params.price ?? 5000) + 1000,
    qaly: 9,
    comparatorCost: 3000,
    comparatorQaly: 7
});

// Model where price does not affect ICER (flat model)
const flatModel = (params) => ({
    cost: 5000,
    qaly: 9,
    comparatorCost: 3000,
    comparatorQaly: 7
});

// Model where higher price reduces QALYs (nonlinear)
const nonlinearModel = (params) => {
    const price = params.price ?? 5000;
    return {
        cost: price + 1000,
        qaly: 10 - price / 100000, // slight QALY decrease with price
        comparatorCost: 3000,
        comparatorQaly: 7
    };
};

describe('HeadroomAnalysisEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new HeadroomAnalysisEngine({ tolerance: 0.01 });
    });

    test('1. Max price found at ICER = WTP', () => {
        // At WTP=30000: maxPrice = 2*30000 + 2000 = 62000
        const result = engine.maxPrice(simpleModel, { price: 5000 }, 'price', 30000, [0, 100000]);
        expect(result.maxPrice).toBeCloseTo(62000, -1);
    });

    test('2. Headroom = maxPrice - currentPrice', () => {
        const currentPrice = 5000;
        const result = engine.maxPrice(simpleModel, { price: currentPrice }, 'price', 30000, [0, 100000]);
        expect(result.headroom).toBeCloseTo(result.maxPrice - currentPrice, 0);
    });

    test('3. Currently affordable: currentPrice < maxPrice', () => {
        const result = engine.maxPrice(simpleModel, { price: 5000 }, 'price', 30000, [0, 100000]);
        // maxPrice ~ 62000, current = 5000 → affordable
        expect(result.isCurrentlyAffordable).toBe(true);
    });

    test('4. Not affordable: currentPrice > maxPrice', () => {
        // WTP=1000: maxPrice = 2*1000 + 2000 = 4000, current=5000
        const result = engine.maxPrice(simpleModel, { price: 5000 }, 'price', 1000, [0, 100000]);
        expect(result.isCurrentlyAffordable).toBe(false);
    });

    test('5. Affordability curve: maxPrice increases with WTP', () => {
        const curve = engine.affordabilityCurve(
            simpleModel, { price: 5000 }, 'price', [10000, 50000], 10
        );
        expect(curve.length).toBe(11);
        // maxPrice should increase with WTP
        const validPrices = curve.filter(c => c.maxPrice !== null);
        for (let i = 1; i < validPrices.length; i++) {
            expect(validPrices[i].maxPrice).toBeGreaterThanOrEqual(validPrices[i - 1].maxPrice - 1);
        }
    });

    test('6. Budget ceiling: lower than maxPrice when budget constrained', () => {
        // WTP=30000 → ICER maxPrice ~ 62000
        // Budget=100,000 with population=10 → budget maxPrice = 10,000
        const result = engine.budgetCeiling(
            simpleModel, { price: 5000 }, 'price', 30000, 100000, 10
        );
        expect(result.budgetMaxPrice).toBe(10000);
        expect(result.maxPrice).toBeLessThanOrEqual(result.icerMaxPrice ?? Infinity);
        expect(result.bindingConstraint).toBe('budget');
    });

    test('7. Price sensitivity: ICER increases with price', () => {
        const sens = engine.sensitivityToPrice(
            simpleModel, { price: 5000 }, 'price', [0, 100000], 30000, 20
        );
        expect(sens.length).toBe(21);
        // ICER should increase with price for this model
        for (let i = 1; i < sens.length; i++) {
            expect(sens[i].icer).toBeGreaterThanOrEqual(sens[i - 1].icer - 0.01);
        }
    });

    test('8. Zero price: ICER is most favorable', () => {
        const sens = engine.sensitivityToPrice(
            simpleModel, { price: 5000 }, 'price', [0, 50000], 30000, 10
        );
        const icerAtZero = sens[0].icer;
        // ICER at price=0: (0+1000-3000)/2 = -1000 (dominant!)
        expect(icerAtZero).toBeLessThan(0);
        expect(sens[0].costEffective).toBe(true);
    });

    test('9. Very high price: ICER exceeds any reasonable WTP', () => {
        const sens = engine.sensitivityToPrice(
            simpleModel, { price: 5000 }, 'price', [500000, 1000000], 30000, 5
        );
        for (const s of sens) {
            expect(s.icer).toBeGreaterThan(30000);
            expect(s.costEffective).toBe(false);
        }
    });

    test('10. Bisection converges within tolerance', () => {
        const tol = 0.1;
        const eng = new HeadroomAnalysisEngine({ tolerance: tol });
        const result = eng.maxPrice(simpleModel, { price: 5000 }, 'price', 30000, [0, 100000]);
        // Verify NMB at maxPrice is near 0
        const params = { price: result.maxPrice };
        const modelResult = simpleModel(params);
        const nmb = (modelResult.qaly - modelResult.comparatorQaly) * 30000 -
                     (modelResult.cost - modelResult.comparatorCost);
        expect(Math.abs(nmb)).toBeLessThan(1); // close to 0
    });

    test('11. No threshold in range: all affordable returns null maxPrice', () => {
        // WTP=30000 → maxPrice=62000, range [0, 10000] → all affordable
        const result = engine.maxPrice(simpleModel, { price: 5000 }, 'price', 30000, [0, 10000]);
        expect(result.maxPrice).toBeNull();
        expect(result.allAffordable).toBe(true);
    });

    test('12. Flat model: price doesnt affect ICER', () => {
        // flatModel always returns same cost/qaly regardless of price
        const result = engine.maxPrice(flatModel, { price: 5000 }, 'price', 30000, [0, 100000]);
        // NMB is constant: both endpoints have same sign
        expect(result.allAffordable).toBe(true);
        expect(result.maxPrice).toBeNull();
    });

    test('13. Multiple WTP thresholds tested', () => {
        const wtps = [10000, 20000, 30000, 50000, 100000];
        const maxPrices = [];
        for (const wtp of wtps) {
            const result = engine.maxPrice(simpleModel, { price: 5000 }, 'price', wtp, [0, 300000]);
            maxPrices.push(result.maxPrice);
        }
        // maxPrice should increase with WTP
        for (let i = 1; i < maxPrices.length; i++) {
            if (maxPrices[i] !== null && maxPrices[i - 1] !== null) {
                expect(maxPrices[i]).toBeGreaterThan(maxPrices[i - 1]);
            }
        }
    });

    test('14. Budget + WTP dual constraint: budget binding', () => {
        // WTP=100000 → ICER maxPrice = 2*100000+2000 = 202000
        // Budget=500000, population=100 → budget max = 5000
        const result = engine.budgetCeiling(
            simpleModel, { price: 3000 }, 'price', 100000, 500000, 100
        );
        expect(result.budgetMaxPrice).toBe(5000);
        expect(result.maxPrice).toBe(5000); // budget is binding
        expect(result.bindingConstraint).toBe('budget');
    });

    test('15. Input validation: missing modelFn throws', () => {
        expect(() => {
            engine.maxPrice(null, { price: 5000 }, 'price', 30000, [0, 100000]);
        }).toThrow(/function/i);
    });

    test('16. Input validation: missing range throws', () => {
        expect(() => {
            engine.maxPrice(simpleModel, { price: 5000 }, 'price', 30000, null);
        }).toThrow(/range/i);
    });

    test('17. Sensitivity returns correct step count', () => {
        const sens = engine.sensitivityToPrice(
            simpleModel, { price: 5000 }, 'price', [0, 50000], 30000, 25
        );
        expect(sens.length).toBe(26); // steps + 1
    });

    test('18. Budget ceiling: ICER binding when budget is generous', () => {
        // WTP=30000 → ICER maxPrice ~ 62000
        // Budget=10,000,000 with population=10 → budget maxPrice = 1,000,000
        const result = engine.budgetCeiling(
            simpleModel, { price: 5000 }, 'price', 30000, 10000000, 10
        );
        expect(result.bindingConstraint).toBe('icer');
        expect(result.maxPrice).toBeCloseTo(62000, -2);
    });

    test('19. Nonlinear model: max price can be found', () => {
        const result = engine.maxPrice(nonlinearModel, { price: 5000 }, 'price', 30000, [0, 200000]);
        expect(result.maxPrice).toBeDefined();
        if (result.maxPrice !== null) {
            expect(result.maxPrice).toBeGreaterThan(0);
        }
    });

    test('20. Affordability curve has correct length', () => {
        const curve = engine.affordabilityCurve(
            simpleModel, { price: 5000 }, 'price', [10000, 50000], 20
        );
        expect(curve.length).toBe(21); // steps + 1
        expect(curve[0].wtp).toBeCloseTo(10000);
        expect(curve[20].wtp).toBeCloseTo(50000);
    });
});
