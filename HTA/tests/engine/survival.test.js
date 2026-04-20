/**
 * Tests for src/engine/survival.js — SurvivalAnalysisEngine and parametric distributions
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
    LogLogisticDistribution,
    GompertzDistribution,
    GeneralizedGammaDistribution,
    RoystonParmarSpline
} = require('../../src/engine/survival');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Synthetic KM-like event data suitable for fitting.
 * Simulates a cohort with approximately exponential decay (lambda ~ 0.05).
 */
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
// SurvivalAnalysisEngine — constructor and KM import
// ---------------------------------------------------------------------------

describe('SurvivalAnalysisEngine', () => {

    test('constructor initialises distribution map', () => {
        const engine = new SurvivalAnalysisEngine();

        expect(engine.distributions).toBeDefined();
        expect(engine.distributions.exponential).toBe(ExponentialDistribution);
        expect(engine.distributions.weibull).toBe(WeibullDistribution);
        expect(engine.distributions.lognormal).toBe(LogNormalDistribution);
        expect(engine.distributions.loglogistic).toBe(LogLogisticDistribution);
        expect(engine.distributions.gompertz).toBe(GompertzDistribution);
        expect(engine.distributions.gamma).toBe(GeneralizedGammaDistribution);
        expect(engine.distributions.spline).toBe(RoystonParmarSpline);
    });

    test('importKaplanMeier returns structured result with median and RMST', () => {
        const engine = new SurvivalAnalysisEngine();
        const points = [
            { time: 0, survival: 1.0 },
            { time: 6, survival: 0.75 },
            { time: 12, survival: 0.50 },
            { time: 18, survival: 0.25 },
            { time: 24, survival: 0.10 }
        ];

        const km = engine.importKaplanMeier(points, { totalPatients: 100 });

        expect(km.points.length).toBe(5);
        expect(km.timeUnit).toBe('months');
        expect(km.medianSurvival).toBeCloseTo(12, 0); // median at S=0.5
        expect(km.meanSurvival).toBeGreaterThan(0);
    });

    test('calculateMedian returns null when median not reached', () => {
        const engine = new SurvivalAnalysisEngine();
        const points = [
            { time: 0, survival: 1.0 },
            { time: 12, survival: 0.8 },
            { time: 24, survival: 0.6 }
        ];

        expect(engine.calculateMedian(points)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Exponential distribution
// ---------------------------------------------------------------------------

describe('ExponentialDistribution', () => {

    test('S(t) = exp(-lambda*t) for known values', () => {
        const dist = new ExponentialDistribution(0.1);

        expect(dist.survival(0)).toBeCloseTo(1.0, 12);
        expect(dist.survival(1)).toBeCloseTo(Math.exp(-0.1), 12);
        expect(dist.survival(10)).toBeCloseTo(Math.exp(-1.0), 12);
        expect(dist.survival(100)).toBeCloseTo(Math.exp(-10), 10);
    });

    test('hazard is constant and equals lambda', () => {
        const dist = new ExponentialDistribution(0.05);

        expect(dist.hazard(0)).toBeCloseTo(0.05, 12);
        expect(dist.hazard(10)).toBeCloseTo(0.05, 12);
        expect(dist.hazard(1000)).toBeCloseTo(0.05, 12);
    });

    test('cumulative hazard is lambda*t', () => {
        const dist = new ExponentialDistribution(0.2);

        expect(dist.cumHazard(0)).toBeCloseTo(0, 12);
        expect(dist.cumHazard(5)).toBeCloseTo(1.0, 12);
        expect(dist.cumHazard(10)).toBeCloseTo(2.0, 12);
    });

    test('fit recovers lambda from synthetic data', () => {
        const events = createSyntheticEvents();
        const dist = new ExponentialDistribution();
        const fit = dist.fit(events);

        expect(fit.parameters.lambda).toBeGreaterThan(0);
        expect(fit.convergence).toBe(true);
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Weibull distribution
// ---------------------------------------------------------------------------

describe('WeibullDistribution', () => {

    test('S(t) matches known values for specific shape/scale', () => {
        // S(t) = exp(-(lambda*t)^gamma)
        const dist = new WeibullDistribution(0.1, 1.5);

        expect(dist.survival(0)).toBeCloseTo(1.0, 12);

        const t = 10;
        const expected = Math.exp(-Math.pow(0.1 * t, 1.5));
        expect(dist.survival(t)).toBeCloseTo(expected, 10);
    });

    test('gamma=1 reduces to exponential', () => {
        const weibull = new WeibullDistribution(0.05, 1.0);
        const exponential = new ExponentialDistribution(0.05);

        for (const t of [0, 1, 5, 10, 20, 50]) {
            expect(weibull.survival(t)).toBeCloseTo(exponential.survival(t), 10);
        }
    });

    test('hazard is positive for t > 0', () => {
        const dist = new WeibullDistribution(0.1, 2.0);

        for (const t of [0.1, 1, 5, 10, 50]) {
            expect(dist.hazard(t)).toBeGreaterThan(0);
        }
    });

    test('fit converges on synthetic data', () => {
        const events = createSyntheticEvents();
        const dist = new WeibullDistribution();
        const fit = dist.fit(events);

        expect(fit.parameters.lambda).toBeGreaterThan(0);
        expect(fit.parameters.gamma).toBeGreaterThan(0);
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Log-Normal distribution
// ---------------------------------------------------------------------------

describe('LogNormalDistribution', () => {

    test('S(t) is monotonically decreasing for t > 0', () => {
        const dist = new LogNormalDistribution(2.5, 0.8);
        let prevS = 1.0;

        for (let t = 0.5; t <= 50; t += 0.5) {
            const s = dist.survival(t);
            expect(s).toBeLessThanOrEqual(prevS + 1e-12); // allow floating-point tolerance
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(1);
            prevS = s;
        }
    });

    test('S(0) = 1', () => {
        const dist = new LogNormalDistribution(3, 1);
        expect(dist.survival(0)).toBeCloseTo(1.0, 12);
    });

    test('hazard is positive for t > 0', () => {
        const dist = new LogNormalDistribution(2, 0.5);

        for (const t of [0.5, 1, 5, 10, 20]) {
            expect(dist.hazard(t)).toBeGreaterThan(0);
        }
    });

    test('normCDF returns 0.5 at z=0 and correct boundary values', () => {
        const dist = new LogNormalDistribution(0, 1);

        expect(dist.normCDF(0)).toBeCloseTo(0.5, 4);
        expect(dist.normCDF(-6)).toBeCloseTo(0, 4);
        expect(dist.normCDF(6)).toBeCloseTo(1, 4);
    });

    test('fit converges on synthetic data', () => {
        const events = createSyntheticEvents();
        const dist = new LogNormalDistribution();
        const fit = dist.fit(events);

        expect(Number.isFinite(fit.parameters.mu)).toBe(true);
        expect(fit.parameters.sigma).toBeGreaterThan(0);
        expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Log-Logistic distribution
// ---------------------------------------------------------------------------

describe('LogLogisticDistribution', () => {

    test('S(t) matches formula S(t) = 1/(1 + (lambda*t)^gamma)', () => {
        const lambda = 0.08;
        const gamma = 2.0;
        const dist = new LogLogisticDistribution(lambda, gamma);

        for (const t of [1, 5, 10, 20]) {
            const expected = 1 / (1 + Math.pow(lambda * t, gamma));
            expect(dist.survival(t)).toBeCloseTo(expected, 10);
        }
    });

    test('S(0) = 1', () => {
        const dist = new LogLogisticDistribution(0.1, 1.5);
        expect(dist.survival(0)).toBeCloseTo(1.0, 12);
    });

    test('hazard is positive for t > 0', () => {
        const dist = new LogLogisticDistribution(0.05, 2);

        for (const t of [0.5, 1, 5, 10, 50]) {
            expect(dist.hazard(t)).toBeGreaterThan(0);
        }
    });

    test('cumHazard equals log(1 + (lambda*t)^gamma)', () => {
        const lambda = 0.1;
        const gamma = 1.8;
        const dist = new LogLogisticDistribution(lambda, gamma);

        for (const t of [1, 5, 10, 20]) {
            const expected = Math.log(1 + Math.pow(lambda * t, gamma));
            expect(dist.cumHazard(t)).toBeCloseTo(expected, 10);
        }
    });
});

// ---------------------------------------------------------------------------
// Gompertz distribution
// ---------------------------------------------------------------------------

describe('GompertzDistribution', () => {

    test('S(t) for known parameters matches formula', () => {
        const a = 0.05;  // shape
        const b = 0.01;  // scale
        const dist = new GompertzDistribution(a, b);

        for (const t of [1, 5, 10, 20]) {
            const expected = Math.exp(-(b / a) * (Math.exp(a * t) - 1));
            expect(dist.survival(t)).toBeCloseTo(expected, 10);
        }
    });

    test('S(0) = 1', () => {
        const dist = new GompertzDistribution(0.1, 0.02);
        expect(dist.survival(0)).toBeCloseTo(1.0, 12);
    });

    test('hazard increases exponentially (h(t) = b*exp(a*t))', () => {
        const a = 0.03;
        const b = 0.005;
        const dist = new GompertzDistribution(a, b);

        let prevH = 0;
        for (const t of [0, 5, 10, 20, 50]) {
            const h = dist.hazard(t);
            expect(h).toBeGreaterThanOrEqual(prevH - 1e-15);
            expect(h).toBeCloseTo(b * Math.exp(a * t), 10);
            prevH = h;
        }
    });
});

// ---------------------------------------------------------------------------
// Hazard function positivity across all distributions
// ---------------------------------------------------------------------------

describe('Hazard function positivity', () => {
    const testTimes = [0.1, 0.5, 1, 2, 5, 10, 20];

    test('all distributions have h(t) > 0 for t > 0', () => {
        const distributions = [
            new ExponentialDistribution(0.05),
            new WeibullDistribution(0.1, 1.5),
            new LogNormalDistribution(2, 0.8),
            new LogLogisticDistribution(0.05, 2),
            new GompertzDistribution(0.05, 0.01)
        ];

        for (const dist of distributions) {
            for (const t of testTimes) {
                expect(dist.hazard(t)).toBeGreaterThan(0);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// AIC/BIC model selection
// ---------------------------------------------------------------------------

describe('AIC/BIC model selection', () => {

    test('fitAllDistributions returns valid fit statistics and ranking', () => {
        const engine = new SurvivalAnalysisEngine();
        const events = createSyntheticEvents();
        const kmData = { events, raw: { events } };

        const fits = engine.fitAllDistributions(kmData, {
            distributions: ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz']
        });

        expect(fits.ranked.length).toBeGreaterThan(0);
        expect(fits.best).toBeDefined();
        expect(Number.isFinite(fits.best.aic)).toBe(true);
        expect(Number.isFinite(fits.best.bic)).toBe(true);

        // Verify ranking is by AIC ascending
        for (let i = 1; i < fits.ranked.length; i++) {
            expect(fits.ranked[i].aic).toBeGreaterThanOrEqual(fits.ranked[i - 1].aic);
        }

        // deltaAIC for best model should be 0
        expect(fits.ranked[0].deltaAIC).toBe(0);
    });

    test('calculateGoodnessOfFit returns aic, bic, r2, rmse', () => {
        const engine = new SurvivalAnalysisEngine();
        const events = createSyntheticEvents();
        const dist = new ExponentialDistribution();
        const fit = dist.fit(events);

        const gof = engine.calculateGoodnessOfFit(dist, events, fit);

        expect(Number.isFinite(gof.aic)).toBe(true);
        expect(Number.isFinite(gof.bic)).toBe(true);
        expect(Number.isFinite(gof.rmse)).toBe(true);
        expect(Number.isFinite(gof.r2)).toBe(true);
        expect(gof.rmse).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Extrapolation validity
// ---------------------------------------------------------------------------

describe('Extrapolation', () => {

    test('survival extrapolated beyond data range remains in [0,1]', () => {
        const distributions = [
            new ExponentialDistribution(0.05),
            new WeibullDistribution(0.1, 1.5),
            new LogNormalDistribution(3, 1),
            new LogLogisticDistribution(0.05, 2),
            new GompertzDistribution(0.03, 0.005)
        ];

        for (const dist of distributions) {
            for (const t of [50, 100, 200, 500, 1000]) {
                const s = dist.survival(t);
                expect(s).toBeGreaterThanOrEqual(0);
                expect(s).toBeLessThanOrEqual(1);
            }
        }
    });

    test('generateCurve produces points within [0,1]', () => {
        const engine = new SurvivalAnalysisEngine();
        const dist = new WeibullDistribution(0.05, 1.2);

        const curve = engine.generateCurve(dist, 100, 50);

        expect(curve.length).toBe(51); // 0..50 inclusive
        expect(curve[0].time).toBe(0);
        expect(curve[0].survival).toBeCloseTo(1, 10);

        for (const p of curve) {
            expect(p.survival).toBeGreaterThanOrEqual(0);
            expect(p.survival).toBeLessThanOrEqual(1);
        }
    });
});

// ---------------------------------------------------------------------------
// Edge cases: t=0 gives S=1, very large t gives S close to 0
// ---------------------------------------------------------------------------

describe('Edge cases', () => {

    test('t=0 gives S(t) = 1 for all distributions', () => {
        const distributions = [
            new ExponentialDistribution(0.1),
            new WeibullDistribution(0.1, 2),
            new LogNormalDistribution(2, 0.5),
            new LogLogisticDistribution(0.1, 1.5),
            new GompertzDistribution(0.05, 0.01)
        ];

        for (const dist of distributions) {
            expect(dist.survival(0)).toBeCloseTo(1.0, 12);
        }
    });

    test('very large t gives S(t) approximately 0', () => {
        const distributions = [
            new ExponentialDistribution(0.1),
            new WeibullDistribution(0.1, 2),
            new LogNormalDistribution(2, 0.5),
            new LogLogisticDistribution(0.1, 1.5),
            new GompertzDistribution(0.05, 0.01)
        ];

        for (const dist of distributions) {
            const s = dist.survival(10000);
            expect(s).toBeLessThan(0.001);
        }
    });

    test('negative time gives S(t) = 1 for distributions that guard it', () => {
        // Weibull, LogNormal, LogLogistic, Gompertz guard t<=0
        const guarded = [
            new WeibullDistribution(0.1, 2),
            new LogNormalDistribution(2, 0.5),
            new LogLogisticDistribution(0.1, 1.5),
            new GompertzDistribution(0.05, 0.01)
        ];

        for (const dist of guarded) {
            expect(dist.survival(-5)).toBeCloseTo(1.0, 12);
        }
    });

    test('hazard at t=0 is 0 for distributions with t<=0 guard', () => {
        const distributions = [
            new WeibullDistribution(0.1, 2),
            new LogNormalDistribution(2, 0.5),
            new LogLogisticDistribution(0.1, 1.5)
        ];

        for (const dist of distributions) {
            expect(dist.hazard(0)).toBe(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Hazard ratio application and cure model
// ---------------------------------------------------------------------------

describe('Hazard ratio application', () => {

    test('applyHazardRatio shifts survival curve', () => {
        const engine = new SurvivalAnalysisEngine();
        const base = new ExponentialDistribution(0.1);
        const modified = engine.applyHazardRatio(base, 0.5);

        // S_treatment(t) = S_control(t)^HR = exp(-0.1*t)^0.5 = exp(-0.05*t)
        expect(modified.survival(10)).toBeCloseTo(Math.exp(-0.05 * 10), 10);
        expect(modified.survival(0)).toBeCloseTo(1.0, 10);
    });

    test('createCureModel blends cured and uncured fractions', () => {
        const engine = new SurvivalAnalysisEngine();
        const base = new ExponentialDistribution(0.1);
        const cured = engine.createCureModel(base, 0.2);

        // S_cure(t) = 0.2 + 0.8 * exp(-0.1*t)
        expect(cured.survival(0)).toBeCloseTo(0.2 + 0.8 * 1.0, 10);
        expect(cured.survival(100)).toBeCloseTo(0.2 + 0.8 * Math.exp(-10), 6);

        // At very large t, survival should approach the cure fraction
        expect(cured.survival(10000)).toBeCloseTo(0.2, 6);
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('Determinism', () => {

    test('same parameters produce identical survival values across calls', () => {
        const dist = new WeibullDistribution(0.08, 1.3);

        for (const t of [0, 1, 5, 10, 50, 100]) {
            const s1 = dist.survival(t);
            const s2 = dist.survival(t);
            expect(s1).toBe(s2);
        }
    });

    test('fitAllDistributions is deterministic on same input', () => {
        const engine = new SurvivalAnalysisEngine();
        const events = createSyntheticEvents();
        const kmData = { events, raw: { events } };

        const fits1 = engine.fitAllDistributions(kmData, {
            distributions: ['exponential', 'weibull']
        });
        const fits2 = engine.fitAllDistributions(kmData, {
            distributions: ['exponential', 'weibull']
        });

        expect(fits1.best.distribution).toBe(fits2.best.distribution);
        expect(fits1.best.aic).toBe(fits2.best.aic);
    });
});
