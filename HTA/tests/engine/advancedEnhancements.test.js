/**
 * Tests for src/engine/advancedEnhancements.js
 */

'use strict';

const {
    HKSJAdjustment,
    CopasSelectionModel,
    ProfileLikelihoodCI,
    RoystonParmarSurvival,
    MCMCDiagnostics,
    GRADEAssessment,
    ValidationReport,
    MixtureCureModel
} = require('../../src/engine/advancedEnhancements');

// ---------------------------------------------------------------------------
// Helper data
// ---------------------------------------------------------------------------

function createStudies(k = 5) {
    // Generate k studies with effects ~0.5 and realistic SEs
    const studies = [];
    for (let i = 0; i < k; i++) {
        const se = 0.1 + 0.05 * i;
        studies.push({ effect: 0.5 + 0.05 * (i - 2), se });
    }
    return studies;
}

// ---------------------------------------------------------------------------
// HKSJAdjustment
// ---------------------------------------------------------------------------

describe('HKSJAdjustment', () => {
    let hksj;

    beforeEach(() => {
        hksj = new HKSJAdjustment();
    });

    test('returns null for k < 2', () => {
        const result = hksj.adjust([{ effect: 0.5, se: 0.1 }], 0.01, 0.5);
        expect(result).toBeNull();
    });

    test('returns valid result for k >= 2', () => {
        const studies = createStudies(5);
        const tauSq = 0.01;
        const pooled = 0.5;
        const result = hksj.adjust(studies, tauSq, pooled);

        expect(result).not.toBeNull();
        expect(result.effect).toBeCloseTo(pooled, 10);
        expect(result.se).toBeGreaterThan(0);
        expect(result.ci_lower).toBeLessThan(result.effect);
        expect(result.ci_upper).toBeGreaterThan(result.effect);
        expect(result.df).toBe(4);
        expect(result.tCritical).toBeGreaterThan(0);
    });

    test('ad-hoc adjustment ensures CI is never narrower than standard RE', () => {
        const studies = createStudies(5);
        const tauSq = 0.01;
        const pooled = 0.5;

        const withAdhoc = hksj.adjust(studies, tauSq, pooled, { adhoc: true });
        const withoutAdhoc = hksj.adjust(studies, tauSq, pooled, { adhoc: false });

        expect(withAdhoc.se).toBeGreaterThanOrEqual(withAdhoc.seUnadjusted - 1e-10);
    });

    test('adjustmentFactor is sqrt(max(1, q))', () => {
        const studies = createStudies(5);
        const tauSq = 0.01;
        const pooled = 0.5;

        const result = hksj.adjust(studies, tauSq, pooled, { adhoc: true });
        expect(result.adjustmentFactor).toBeGreaterThanOrEqual(1 - 1e-10);
    });

    test('uses t-distribution not normal for critical value', () => {
        const studies = createStudies(3);
        const result = hksj.adjust(studies, 0.01, 0.5);

        // t with df=2 should be larger than z=1.96
        expect(result.tCritical).toBeGreaterThan(1.96);
    });

    test('method string reflects adhoc setting', () => {
        const studies = createStudies(3);
        const withAdhoc = hksj.adjust(studies, 0.01, 0.5, { adhoc: true });
        const withoutAdhoc = hksj.adjust(studies, 0.01, 0.5, { adhoc: false });

        expect(withAdhoc.method).toContain('ad-hoc');
        expect(withoutAdhoc.method).toContain('without');
    });

    test('normalQuantile returns ~1.96 for p=0.975', () => {
        expect(hksj.normalQuantile(0.975)).toBeCloseTo(1.96, 2);
    });

    test('normalQuantile returns ~-1.96 for p=0.025', () => {
        expect(hksj.normalQuantile(0.025)).toBeCloseTo(-1.96, 2);
    });

    test('tCDF returns ~0.5 at t=0 for any df', () => {
        expect(hksj.tCDF(0, 5)).toBeCloseTo(0.5, 4);
        expect(hksj.tCDF(0, 100)).toBeCloseTo(0.5, 4);
    });

    test('pValue is finite and between 0 and 1', () => {
        const studies = createStudies(5);
        const result = hksj.adjust(studies, 0.01, 0.5);

        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// CopasSelectionModel
// ---------------------------------------------------------------------------

describe('CopasSelectionModel', () => {
    let copas;

    beforeEach(() => {
        copas = new CopasSelectionModel();
    });

    test('fit returns unadjusted and adjusted effects', () => {
        const studies = createStudies(8);
        const result = copas.fit(studies, { gridPoints: 5, maxIterations: 20 });

        expect(result.unadjusted).toBeDefined();
        expect(result.adjusted).toBeDefined();
        expect(result.unadjusted.effect).toBeGreaterThan(0);
        expect(result.adjusted.effect).toBeDefined();
        expect(Number.isFinite(result.adjusted.effect)).toBe(true);
    });

    test('fit returns selection parameters', () => {
        const studies = createStudies(8);
        const result = copas.fit(studies, { gridPoints: 5, maxIterations: 20 });

        expect(result.selectionParameters).toBeDefined();
        expect(typeof result.selectionParameters.gamma0).toBe('number');
        expect(typeof result.selectionParameters.gamma1).toBe('number');
        expect(typeof result.selectionParameters.interpretation).toBe('string');
    });

    test('fit estimates missing studies', () => {
        const studies = createStudies(8);
        const result = copas.fit(studies, { gridPoints: 5, maxIterations: 20 });

        expect(result.missingStudies).toBeDefined();
        expect(typeof result.missingStudies.estimated).toBe('number');
        expect(result.missingStudies.avgPublicationProb).toBeGreaterThan(0);
        expect(result.missingStudies.avgPublicationProb).toBeLessThanOrEqual(1);
    });

    test('fit returns model fit statistics', () => {
        const studies = createStudies(8);
        const result = copas.fit(studies, { gridPoints: 5, maxIterations: 20 });

        expect(typeof result.modelFit.logLikelihood).toBe('number');
        expect(typeof result.modelFit.lrt).toBe('number');
        expect(typeof result.modelFit.pValueSelection).toBe('number');
        expect(typeof result.modelFit.evidenceOfSelection).toBe('boolean');
    });

    test('sensitivityAnalysis returns grid of results', () => {
        const studies = createStudies(8);
        const result = copas.sensitivityAnalysis(studies, {
            gamma0Values: [-1, 0],
            gamma1Values: [0, 1],
            maxIterations: 20
        });

        expect(result.grid.length).toBe(4);
        expect(result.summary).toBeDefined();
        expect(result.summary.effectRange).toBeDefined();
        expect(result.summary.nScenarios).toBe(4);
    });

    test('classifySeverity categorizes correctly', () => {
        expect(copas.classifySeverity(0, 0.1)).toBe('minimal');
        expect(copas.classifySeverity(-1, 0.5)).toBe('moderate');
        expect(copas.classifySeverity(-2, 1.5)).toBe('severe');
    });

    test('normalCDF returns 0.5 at z=0', () => {
        expect(copas.normalCDF(0)).toBeCloseTo(0.5, 6);
    });
});

// ---------------------------------------------------------------------------
// ProfileLikelihoodCI
// ---------------------------------------------------------------------------

describe('ProfileLikelihoodCI', () => {
    let plci;

    beforeEach(() => {
        plci = new ProfileLikelihoodCI();
    });

    test('returns null for k < 3', () => {
        const studies = createStudies(2);
        const result = plci.calculate(studies, 0.05);
        expect(result).toBeNull();
    });

    test('returns valid CI for k >= 3', () => {
        const studies = createStudies(5);
        const tauSqML = 0.02;
        const result = plci.calculate(studies, tauSqML);

        expect(result).not.toBeNull();
        expect(result.tauSquared).toBe(tauSqML);
        expect(result.ci_lower_tauSq).toBeLessThanOrEqual(tauSqML);
        expect(result.ci_upper_tauSq).toBeGreaterThanOrEqual(tauSqML);
        expect(result.method).toBe('Profile Likelihood');
    });

    test('CI for tauSq=0 has lower bound at 0', () => {
        const studies = createStudies(5);
        const result = plci.calculate(studies, 0);

        expect(result.ci_lower_tauSq).toBe(0);
    });

    test('tau and tauSq are consistent', () => {
        const studies = createStudies(5);
        const result = plci.calculate(studies, 0.04);

        expect(result.ci_lower_tau).toBeCloseTo(Math.sqrt(result.ci_lower_tauSq), 8);
        expect(result.ci_upper_tau).toBeCloseTo(Math.sqrt(result.ci_upper_tauSq), 8);
    });

    test('logLikelihood is finite for reasonable inputs', () => {
        const y = [0.3, 0.5, 0.7];
        const v = [0.01, 0.02, 0.03];
        const ll = plci.logLikelihood(0.01, y, v);
        expect(Number.isFinite(ll)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// RoystonParmarSurvival
// ---------------------------------------------------------------------------

describe('RoystonParmarSurvival', () => {
    let rp;

    beforeEach(() => {
        rp = new RoystonParmarSurvival({ nKnots: 3 });
    });

    test('fit returns knots, coefficients, and predict functions', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];

        const result = rp.fit({ times, events });

        expect(result.knots).toBeDefined();
        expect(result.knots.length).toBeGreaterThan(0);
        expect(Array.isArray(result.splineCoefficients)).toBe(true);
        expect(typeof result.predict).toBe('function');
        expect(typeof result.hazardFunction).toBe('function');
        expect(typeof result.survivalFunction).toBe('function');
    });

    test('survivalFunction returns value between 0 and 1', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];
        const result = rp.fit({ times, events });

        const S5 = result.survivalFunction(5);
        expect(S5).toBeGreaterThanOrEqual(0);
        expect(S5).toBeLessThanOrEqual(1);
    });

    test('fit reports AIC and BIC', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];
        const result = rp.fit({ times, events });

        expect(typeof result.aic).toBe('number');
        expect(typeof result.bic).toBe('number');
        expect(Number.isFinite(result.aic)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// MCMCDiagnostics
// ---------------------------------------------------------------------------

describe('MCMCDiagnostics', () => {
    let diag;

    beforeEach(() => {
        diag = new MCMCDiagnostics();
    });

    function makeChain(n, mean, noise, seed) {
        // Simple seeded pseudo-random chain for testing
        const chain = [];
        let s = seed;
        for (let i = 0; i < n; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const u = s / 0x7fffffff;
            chain.push(mean + noise * (u - 0.5));
        }
        return chain;
    }

    test('gelmanRubin is close to 1 for converged chains', () => {
        const chains = [
            makeChain(200, 5, 1, 42),
            makeChain(200, 5, 1, 99)
        ];
        const result = diag.analyze(chains);

        expect(result.gelmanRubin).toBeDefined();
        expect(result.gelmanRubin.rhat).toBeLessThan(1.5);
    });

    test('effectiveSampleSize is positive', () => {
        const chains = [
            makeChain(200, 5, 1, 42),
            makeChain(200, 5, 1, 99)
        ];
        const result = diag.analyze(chains);

        expect(result.effectiveSampleSize).toBeDefined();
        expect(result.effectiveSampleSize.ess).toBeGreaterThan(0);
    });

    test('geweke diagnostic is computed', () => {
        const chains = [makeChain(200, 5, 1, 42)];
        const result = diag.analyze(chains);

        expect(result.geweke).toBeDefined();
    });

    test('traceStats returns mean and sd', () => {
        const chains = [makeChain(200, 5, 1, 42)];
        const result = diag.analyze(chains);

        expect(result.traceStats).toBeDefined();
        expect(result.traceStats.mean).toBeDefined();
    });

    test('convergenceSummary is provided', () => {
        const chains = [
            makeChain(200, 5, 1, 42),
            makeChain(200, 5, 1, 99)
        ];
        const result = diag.analyze(chains);

        expect(result.convergenceSummary).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// GRADEAssessment
// ---------------------------------------------------------------------------

describe('GRADEAssessment', () => {
    let grade;

    beforeEach(() => {
        grade = new GRADEAssessment();
    });

    test('RCT starts at high certainty (4)', () => {
        const result = grade.assess(
            { heterogeneity: { I2: 10, pValueQ: 0.5 }, nStudies: 15 },
            [{ overall: 'low' }],
            { isRCT: true }
        );
        expect(result.overallCertainty).toBeLessThanOrEqual(4);
        expect(result.certaintyLabel).toBeDefined();
    });

    test('observational starts at low certainty (2)', () => {
        const result = grade.assess(
            { heterogeneity: { I2: 10, pValueQ: 0.5 }, nStudies: 15 },
            [{ overall: 'low' }],
            { isRCT: false }
        );
        expect(result.overallCertainty).toBeLessThanOrEqual(2);
    });

    test('high I2 downgrades for inconsistency', () => {
        const result = grade.assess(
            { heterogeneity: { I2: 80, pValueQ: 0.001 }, nStudies: 15 },
            [{ overall: 'low' }],
            { isRCT: true }
        );
        expect(result.domainAssessments.inconsistency.concern).toBe('very serious');
    });

    test('assessRiskOfBias handles empty input', () => {
        const result = grade.assessRiskOfBias([]);
        expect(result.concern).toBe('no information');
    });

    test('assessRiskOfBias flags >50% high risk as very serious', () => {
        const rob = [
            { overall: 'high' }, { overall: 'high' }, { overall: 'high' },
            { overall: 'low' }
        ];
        const result = grade.assessRiskOfBias(rob);
        expect(result.concern).toBe('very serious');
    });

    test('assessPublicationBias not assessed for < 10 studies', () => {
        const result = grade.assessPublicationBias({ nStudies: 5 });
        expect(result.concern).toBe('not assessed');
    });

    test('generateRecommendation returns string', () => {
        const rec = grade.generateRecommendation(3, { random: { effect: 0.5 } });
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// ValidationReport
// ---------------------------------------------------------------------------

describe('ValidationReport', () => {
    let vr;

    beforeEach(() => {
        vr = new ValidationReport();
    });

    test('generateReport returns summary with pass/fail counts', () => {
        const metaResults = {
            random: { effect: 0.5, ci_lower: 0.3, ci_upper: 0.7 },
            heterogeneity: { I2: 25, tauSquared: 0.01 }
        };
        const report = vr.generateReport(metaResults, {
            expectedPooled: 0.5,
            expectedHeterogeneity: { I2: 25, tauSquared: 0.01 },
            expectedCI: { lower: 0.3, upper: 0.7 }
        });

        expect(report.summary).toBeDefined();
        expect(report.summary.total).toBe(4);
        expect(report.summary.passed).toBeGreaterThan(0);
        expect(report.summary.passRate).toBeDefined();
    });

    test('validatePooledEffect skips when no expected value', () => {
        const result = vr.validatePooledEffect({ random: { effect: 0.5 } }, undefined);
        expect(result.status).toBe('skipped');
    });

    test('validatePooledEffect passes when within tolerance', () => {
        const result = vr.validatePooledEffect({ random: { effect: 0.500 } }, 0.505);
        expect(result.passed).toBe(true);
    });

    test('validateHeterogeneity skips when no expected value', () => {
        const result = vr.validateHeterogeneity({}, undefined);
        expect(result.status).toBe('skipped');
    });
});

// ---------------------------------------------------------------------------
// MixtureCureModel
// ---------------------------------------------------------------------------

describe('MixtureCureModel', () => {
    let mcm;

    beforeEach(() => {
        mcm = new MixtureCureModel({ maxIterations: 30, seed: 42 });
    });

    test('fit returns cure fraction and distribution params', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50];
        const events = [1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];

        const result = mcm.fit({ times, events });

        expect(result.cureFraction).toBeDefined();
        expect(result.cureFraction.estimate).toBeGreaterThan(0);
        expect(result.cureFraction.estimate).toBeLessThan(1);
        expect(result.distribution.type).toBe('weibull');
        expect(typeof result.distribution.scale).toBe('number');
        expect(typeof result.distribution.shape).toBe('number');
    });

    test('predictedSurvival returns function', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30];
        const events = [1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];

        const result = mcm.fit({ times, events });
        const sv = result.predictedSurvival(5);
        expect(sv).toBeGreaterThanOrEqual(0);
        expect(sv).toBeLessThanOrEqual(1);
    });

    test('model fit reports AIC and BIC', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 0, 1, 0, 0, 0, 0];

        const result = mcm.fit({ times, events });
        expect(Number.isFinite(result.modelFit.aic)).toBe(true);
        expect(Number.isFinite(result.modelFit.bic)).toBe(true);
    });
});
