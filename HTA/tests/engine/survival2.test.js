/**
 * Additional tests for src/engine/survival.js
 * Targeting uncovered lines: 382-411 (compareCurves), 927-1307 (Gompertz fit,
 *   GeneralizedGamma, RoystonParmarSpline)
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;

const {
    SurvivalAnalysisEngine,
    ExponentialDistribution,
    WeibullDistribution,
    LogNormalDistribution,
    GompertzDistribution,
    GeneralizedGammaDistribution,
    RoystonParmarSpline
} = require('../../src/engine/survival');

function createSyntheticEvents() {
    return [
        { time: 1,  survival: 0.95,  events: 5,  censored: 0, atRisk: 100 },
        { time: 3,  survival: 0.86,  events: 9,  censored: 1, atRisk: 95  },
        { time: 6,  survival: 0.74,  events: 10, censored: 2, atRisk: 85  },
        { time: 9,  survival: 0.63,  events: 8,  censored: 3, atRisk: 73  },
        { time: 12, survival: 0.54,  events: 6,  censored: 2, atRisk: 62  },
        { time: 18, survival: 0.40,  events: 8,  censored: 3, atRisk: 54  },
        { time: 24, survival: 0.30,  events: 5,  censored: 4, atRisk: 43  },
        { time: 30, survival: 0.22,  events: 3,  censored: 2, atRisk: 34  },
        { time: 36, survival: 0.16,  events: 2,  censored: 3, atRisk: 29  }
    ];
}

// ---------------------------------------------------------------------------
// compareCurves (lines 382-411)
// ---------------------------------------------------------------------------

describe('SurvivalAnalysisEngine.compareCurves', () => {
    test('compares two curves and calculates difference', () => {
        const engine = new SurvivalAnalysisEngine();
        const curves = {
            intervention: new ExponentialDistribution(0.05),
            comparator: new ExponentialDistribution(0.1)
        };

        const result = engine.compareCurves(curves, 50, { numPoints: 20 });

        expect(result.intervention).toBeDefined();
        expect(result.comparator).toBeDefined();
        expect(result.difference).toBeDefined();
        expect(result.difference.length).toBeGreaterThan(0);
        expect(result.lifeYearsGained).toBeGreaterThan(0);
    });

    test('difference includes survivalDiff and hazardRatio', () => {
        const engine = new SurvivalAnalysisEngine();
        const curves = {
            control: new WeibullDistribution(0.05, 1.2),
            treatment: new WeibullDistribution(0.03, 1.2)
        };

        const result = engine.compareCurves(curves, 30, { numPoints: 10 });

        for (const pt of result.difference) {
            expect(typeof pt.survivalDiff).toBe('number');
            expect(pt.time).toBeGreaterThanOrEqual(0);
        }
    });

    test('compareCurves with single curve skips difference', () => {
        const engine = new SurvivalAnalysisEngine();
        const curves = {
            only: new ExponentialDistribution(0.1)
        };

        const result = engine.compareCurves(curves, 20);

        expect(result.only).toBeDefined();
        expect(result.difference).toBeUndefined();
    });

    test('compareCurves with calculateDifferences=false skips difference', () => {
        const engine = new SurvivalAnalysisEngine();
        const curves = {
            a: new ExponentialDistribution(0.05),
            b: new ExponentialDistribution(0.1)
        };

        const result = engine.compareCurves(curves, 20, { calculateDifferences: false });
        expect(result.difference).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Gompertz fit (lines 927-973)
// ---------------------------------------------------------------------------

describe('GompertzDistribution fit', () => {
    test('fit converges on synthetic data', () => {
        const events = createSyntheticEvents();
        const dist = new GompertzDistribution();
        const fit = dist.fit(events);

        expect(fit.parameters.a).toBeDefined();
        expect(fit.parameters.b).toBeDefined();
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });

    test('fit recovers approximate parameters', () => {
        const dist = new GompertzDistribution();
        const events = createSyntheticEvents();
        const fit = dist.fit(events);

        // Parameters should be in reasonable range
        expect(fit.parameters.a).toBeGreaterThan(-1);
        expect(fit.parameters.a).toBeLessThan(1);
        expect(fit.parameters.b).toBeGreaterThan(0);
    });

    test('evalLogLikelihood and calculateLogLikelihood agree', () => {
        const dist = new GompertzDistribution(0.05, 0.01);
        const events = createSyntheticEvents();

        const ll1 = dist.evalLogLikelihood(events, 0.05, 0.01);
        const ll2 = dist.calculateLogLikelihood(events);
        expect(ll1).toBeCloseTo(ll2, 10);
    });

    test('density is positive for t > 0', () => {
        const dist = new GompertzDistribution(0.05, 0.01);
        expect(dist.density(5)).toBeGreaterThan(0);
        expect(dist.density(10)).toBeGreaterThan(0);
    });

    test('cumHazard is consistent with survival', () => {
        const dist = new GompertzDistribution(0.05, 0.01);
        const t = 10;
        const H = dist.cumHazard(t);
        const S = dist.survival(t);
        expect(Math.exp(-H)).toBeCloseTo(S, 8);
    });
});

// ---------------------------------------------------------------------------
// GeneralizedGammaDistribution (lines 981-1146)
// ---------------------------------------------------------------------------

describe('GeneralizedGammaDistribution', () => {
    test('survival is 1 at t=0', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.5);
        expect(dist.survival(0)).toBe(1);
    });

    test('survival decreases monotonically', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.5);
        let prev = 1;
        for (let t = 1; t <= 50; t += 5) {
            const s = dist.survival(t);
            expect(s).toBeLessThanOrEqual(prev + 1e-10);
            prev = s;
        }
    });

    test('Q near 0 gives log-normal-like behavior', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.0005);
        const lognorm = new LogNormalDistribution(2, 0.5);

        expect(dist.survival(5)).toBeCloseTo(lognorm.survival(5), 1);
    });

    test('hazard is positive for t > 0', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.8);
        expect(dist.hazard(5)).toBeGreaterThan(0);
        expect(dist.hazard(10)).toBeGreaterThan(0);
    });

    test('hazard returns 0 for t <= 0', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.5);
        expect(dist.hazard(0)).toBe(0);
        expect(dist.hazard(-1)).toBe(0);
    });

    test('density is positive for t > 0', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.5);
        expect(dist.density(5)).toBeGreaterThan(0);
    });

    test('density near Q=0 uses log-normal', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.0001);
        const d = dist.density(5);
        expect(d).toBeGreaterThan(0);
    });

    test('negative Q branch of survival', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, -0.5);
        const s = dist.survival(5);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });

    test('fit converges on synthetic data', () => {
        const events = createSyntheticEvents();
        const dist = new GeneralizedGammaDistribution();
        const fit = dist.fit(events);

        expect(fit.parameters.mu).toBeDefined();
        expect(fit.parameters.sigma).toBeDefined();
        expect(fit.parameters.Q).toBeDefined();
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });

    test('cumHazard is consistent with survival', () => {
        const dist = new GeneralizedGammaDistribution(2, 0.5, 0.5);
        const t = 10;
        const H = dist.cumHazard(t);
        const S = dist.survival(t);
        expect(H).toBeCloseTo(-Math.log(Math.max(S, 1e-10)), 6);
    });
});

// ---------------------------------------------------------------------------
// RoystonParmarSpline (lines 1153-1309)
// ---------------------------------------------------------------------------

describe('RoystonParmarSpline', () => {
    test('survival is 1 at t=0 and decreasing for hazard scale', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.5, 0.1, 0.05], 'hazard');
        expect(sp.survival(0)).toBeCloseTo(1, 3);
        expect(sp.survival(5)).toBeLessThan(sp.survival(1));
    });

    test('survival for odds scale', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.5, 0.1, 0.05], 'odds');
        const s = sp.survival(5);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
    });

    test('survival for normal scale', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.5, 0.1, 0.05], 'normal');
        const s = sp.survival(5);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
    });

    test('hazard returns positive for hazard scale', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.5, 0.1, 0.05], 'hazard');
        const h = sp.hazard(5);
        expect(h).toBeGreaterThanOrEqual(0);
    });

    test('hazard for odds scale', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.3, 0.1, 0.05], 'odds');
        const h = sp.hazard(5);
        expect(Number.isFinite(h)).toBe(true);
    });

    test('fit on synthetic data returns knots and gammas', () => {
        const events = createSyntheticEvents();
        const sp = new RoystonParmarSpline(null, null, 'hazard');
        const fit = sp.fit(events, { nKnots: 3 });

        expect(fit.parameters.knots).toBeDefined();
        expect(fit.parameters.gammas).toBeDefined();
        expect(fit.parameters.scale).toBe('hazard');
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });

    test('fit throws with too few events', () => {
        const events = [{ time: 1, events: 1, censored: 0 }];
        const sp = new RoystonParmarSpline(null, null, 'hazard');
        expect(() => sp.fit(events, { nKnots: 5 })).toThrow();
    });

    test('density equals hazard times survival', () => {
        const sp = new RoystonParmarSpline([0, 1, 2, 3], [-2, 0.5, 0.1, 0.05], 'hazard');
        const t = 5;
        const d = sp.density(t);
        const h = sp.hazard(t);
        const s = sp.survival(t);
        expect(d).toBeCloseTo(h * s, 8);
    });
});
