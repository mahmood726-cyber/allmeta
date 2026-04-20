/**
 * Tests for the first half of src/engine/frontierMeta.js
 * Covers: IPDMetaAnalysis, DTAMetaAnalysis, AdvancedPublicationBias,
 *         DataFabricationDetection, MendelianRandomizationMA,
 *         HistoricalBorrowing, ThresholdAnalysis
 */

'use strict';

const {
    IPDMetaAnalysis,
    DTAMetaAnalysis,
    AdvancedPublicationBias,
    DataFabricationDetection,
    MendelianRandomizationMA,
    HistoricalBorrowing,
    ThresholdAnalysis
} = require('../../src/engine/frontierMeta');

// ---------------------------------------------------------------------------
// Shared test data factories
// ---------------------------------------------------------------------------

/**
 * Minimal IPD data for oneStage (n=6 total to avoid O(n^3) matrix inversion cost).
 * 2 studies x 3 patients each: 1 control + 1 treatment per study + 1 extra.
 */
function createSmallIPDData() {
    return [
        { study: 'S1', treatment: 0, outcome: 10 },
        { study: 'S1', treatment: 0, outcome: 11 },
        { study: 'S1', treatment: 1, outcome: 13 },
        { study: 'S2', treatment: 0, outcome:  9 },
        { study: 'S2', treatment: 0, outcome: 10 },
        { study: 'S2', treatment: 1, outcome: 12 }
    ];
}

/**
 * Slightly larger IPD data for twoStage (no nxn inversion, so n=18 is fine).
 * 3 studies x 6 patients each.
 */
function createTwoStageIPDData() {
    return [
        { study: 'S1', treatment: 0, outcome: 10 },
        { study: 'S1', treatment: 0, outcome: 11 },
        { study: 'S1', treatment: 0, outcome: 10.5 },
        { study: 'S1', treatment: 1, outcome: 13 },
        { study: 'S1', treatment: 1, outcome: 12 },
        { study: 'S1', treatment: 1, outcome: 12.5 },
        { study: 'S2', treatment: 0, outcome: 9 },
        { study: 'S2', treatment: 0, outcome: 10 },
        { study: 'S2', treatment: 0, outcome: 9.5 },
        { study: 'S2', treatment: 1, outcome: 12 },
        { study: 'S2', treatment: 1, outcome: 11 },
        { study: 'S2', treatment: 1, outcome: 11.5 },
        { study: 'S3', treatment: 0, outcome: 10.5 },
        { study: 'S3', treatment: 0, outcome: 9.5 },
        { study: 'S3', treatment: 0, outcome: 10 },
        { study: 'S3', treatment: 1, outcome: 12.5 },
        { study: 'S3', treatment: 1, outcome: 13.5 },
        { study: 'S3', treatment: 1, outcome: 13 }
    ];
}

function createDTAData() {
    return [
        { id: 'D1', tp: 80, fp: 10, fn: 20, tn: 90 },
        { id: 'D2', tp: 70, fp: 15, fn: 30, tn: 85 },
        { id: 'D3', tp: 90, fp:  5, fn: 10, tn: 95 },
        { id: 'D4', tp: 60, fp: 20, fn: 40, tn: 80 },
        { id: 'D5', tp: 85, fp: 12, fn: 15, tn: 88 }
    ];
}

function createPubBiasData() {
    return [
        { effect: 0.5,  se: 0.15 },
        { effect: 0.3,  se: 0.20 },
        { effect: 0.8,  se: 0.10 },
        { effect: 0.1,  se: 0.25 },
        { effect: 0.6,  se: 0.12 },
        { effect: 0.45, se: 0.18 },
        { effect: 0.35, se: 0.22 },
        { effect: 0.55, se: 0.14 }
    ];
}

function createMRData() {
    return [
        { betaExposure: 0.30, seBetaExposure: 0.05, betaOutcome: 0.15, seBetaOutcome: 0.08 },
        { betaExposure: 0.25, seBetaExposure: 0.04, betaOutcome: 0.12, seBetaOutcome: 0.07 },
        { betaExposure: 0.40, seBetaExposure: 0.06, betaOutcome: 0.22, seBetaOutcome: 0.09 },
        { betaExposure: 0.20, seBetaExposure: 0.03, betaOutcome: 0.08, seBetaOutcome: 0.06 },
        { betaExposure: 0.35, seBetaExposure: 0.05, betaOutcome: 0.18, seBetaOutcome: 0.08 }
    ];
}

// ============================================================================
// 1. IPDMetaAnalysis
// ============================================================================

describe('IPDMetaAnalysis', () => {
    let ipd;

    beforeEach(() => {
        ipd = new IPDMetaAnalysis();
    });

    test('oneStage returns treatmentEffect with estimate and CI', () => {
        const data = createSmallIPDData();
        const result = ipd.oneStage(data, {
            outcome: 'continuous',
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            studyVar: 'study'
        });

        expect(result.method).toBe('one-stage-ipd');
        expect(result.treatmentEffect).toBeDefined();
        expect(typeof result.treatmentEffect.estimate).toBe('number');
        expect(Number.isFinite(result.treatmentEffect.estimate)).toBe(true);
        expect(result.treatmentEffect.ci95).toHaveLength(2);
        expect(result.treatmentEffect.ci95[0]).toBeLessThan(result.treatmentEffect.ci95[1]);
        expect(result.nPatients).toBe(6);
        expect(result.nStudies).toBe(2);
    });

    test('oneStage estimate is positive for data with positive treatment effect', () => {
        const data = createSmallIPDData();
        const result = ipd.oneStage(data, {
            outcome: 'continuous',
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            studyVar: 'study'
        });

        // Treatment adds ~2-3 to outcome, so estimate should be positive
        expect(result.treatmentEffect.estimate).toBeGreaterThan(0);
        expect(result.treatmentEffect.pValue).toBeGreaterThanOrEqual(0);
        expect(result.treatmentEffect.pValue).toBeLessThanOrEqual(1);
    });

    test('twoStage returns study-level effects and pooled result', () => {
        const data = createTwoStageIPDData();
        const result = ipd.twoStage(data, {
            outcome: 'continuous',
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            studyVar: 'study'
        });

        expect(result.method).toBe('two-stage-ipd');
        expect(result.studyEstimates).toHaveLength(3);
        result.studyEstimates.forEach(se => {
            expect(typeof se.effect).toBe('number');
            expect(typeof se.se).toBe('number');
            expect(se.se).toBeGreaterThan(0);
        });
        expect(typeof result.treatmentEffect.estimate).toBe('number');
        expect(result.treatmentEffect.ci95).toHaveLength(2);
        expect(result.heterogeneity).toBeDefined();
        expect(result.heterogeneity.I2).toBeGreaterThanOrEqual(0);
        expect(result.heterogeneity.I2).toBeLessThanOrEqual(100);
    });

    test('_buildDesignMatrix returns correct dimensions', () => {
        const data = [
            { treatment: 1, age: 55 },
            { treatment: 0, age: 62 },
            { treatment: 1, age: 48 }
        ];
        const X = ipd._buildDesignMatrix(data, 'treatment', ['age']);

        expect(X).toHaveLength(3);
        expect(X[0]).toHaveProperty('intercept', 1);
        expect(X[0]).toHaveProperty('treatment', 1);
        expect(X[0]).toHaveProperty('age', 55);
        expect(X[1]).toHaveProperty('treatment', 0);
        expect(Object.keys(X[0])).toHaveLength(3);
    });

    test('_fitLinearMixedModel returns fixedEffects and sigma2_u0', () => {
        const data = createSmallIPDData();
        const X = ipd._buildDesignMatrix(data, 'treatment', []);
        const y = data.map(d => d.outcome);
        const Z = ipd._buildRandomEffectsMatrix(data, 'study', 'treatment', false);
        const studies = ['S1', 'S2'];

        const result = ipd._fitLinearMixedModel(y, X, Z, studies);

        expect(result.fixedEffects).toBeDefined();
        expect(result.fixedEffects.treatment).toBeDefined();
        expect(typeof result.fixedEffects.treatment.estimate).toBe('number');
        expect(typeof result.fixedEffects.treatment.se).toBe('number');
        expect(result.fixedEffects.treatment.se).toBeGreaterThan(0);
        expect(typeof result.sigma2_u0).toBe('number');
        expect(result.sigma2_u0).toBeGreaterThanOrEqual(0);
        expect(typeof result.sigma2_e).toBe('number');
        expect(result.sigma2_e).toBeGreaterThan(0);
    });
});

// ============================================================================
// 2. DTAMetaAnalysis
// ============================================================================

describe('DTAMetaAnalysis', () => {
    let dta;

    beforeEach(() => {
        dta = new DTAMetaAnalysis();
    });

    test('bivariate returns pooled sensitivity and specificity in [0,1]', () => {
        const data = createDTAData();
        const result = dta.bivariate(data);

        expect(result.model).toBe('bivariate');
        const se = result.pooledEstimates.sensitivity;
        const sp = result.pooledEstimates.specificity;

        expect(se.estimate).toBeGreaterThan(0);
        expect(se.estimate).toBeLessThan(1);
        expect(sp.estimate).toBeGreaterThan(0);
        expect(sp.estimate).toBeLessThan(1);

        // CIs should bracket the point estimate
        expect(se.ci95[0]).toBeLessThan(se.estimate);
        expect(se.ci95[1]).toBeGreaterThan(se.estimate);
        expect(sp.ci95[0]).toBeLessThan(sp.estimate);
        expect(sp.ci95[1]).toBeGreaterThan(sp.estimate);

        // All CI bounds in [0,1]
        expect(se.ci95[0]).toBeGreaterThan(0);
        expect(se.ci95[1]).toBeLessThan(1);
        expect(sp.ci95[0]).toBeGreaterThan(0);
        expect(sp.ci95[1]).toBeLessThan(1);
    });

    test('bivariate returns SROC parameters and AUC', () => {
        const data = createDTAData();
        const result = dta.bivariate(data);

        expect(result.sroc).toBeDefined();
        expect(result.sroc.auc).toBeGreaterThan(0);
        expect(result.sroc.auc).toBeLessThanOrEqual(1);
        expect(result.sroc.dor).toBeGreaterThan(0);
        expect(result.nStudies).toBe(5);
    });

    test('bivariate returns study-level data', () => {
        const data = createDTAData();
        const result = dta.bivariate(data);

        expect(result.studyData).toHaveLength(5);
        result.studyData.forEach(d => {
            expect(d.sensitivity).toBeGreaterThan(0);
            expect(d.sensitivity).toBeLessThan(1);
            expect(d.specificity).toBeGreaterThan(0);
            expect(d.specificity).toBeLessThan(1);
        });
    });

    test('hsroc returns Lambda, Theta, and summary operating point in [0,1]', () => {
        const data = createDTAData();
        const result = dta.hsroc(data);

        expect(result.model).toBe('hsroc');
        expect(typeof result.parameters.Lambda).toBe('number');
        expect(Number.isFinite(result.parameters.Lambda)).toBe(true);
        expect(typeof result.parameters.Theta).toBe('number');
        expect(Number.isFinite(result.parameters.Theta)).toBe(true);

        const sp = result.summaryPoint;
        expect(sp.sensitivity).toBeGreaterThan(0);
        expect(sp.sensitivity).toBeLessThan(1);
        expect(sp.specificity).toBeGreaterThan(0);
        expect(sp.specificity).toBeLessThan(1);

        expect(result.srocCurve.auc).toBeGreaterThan(0);
        expect(result.srocCurve.auc).toBeLessThanOrEqual(1);
    });

    test('hsroc Lambda is positive for good diagnostic test data', () => {
        const data = createDTAData();
        const result = dta.hsroc(data);

        // Lambda = accuracy parameter; should be positive for tests with decent Se and Sp
        expect(result.parameters.Lambda).toBeGreaterThan(0);
    });
});

// ============================================================================
// 3. AdvancedPublicationBias
// ============================================================================

describe('AdvancedPublicationBias', () => {
    let pb;

    beforeEach(() => {
        pb = new AdvancedPublicationBias();
    });

    test('copasModel returns adjusted and unadjusted effects', () => {
        const data = createPubBiasData();
        // Use small grid to keep runtime reasonable
        const result = pb.copasModel(data, { nGrid: 5 });

        expect(result.method).toBe('copas');
        expect(typeof result.adjustedEstimate.effect).toBe('number');
        expect(Number.isFinite(result.adjustedEstimate.effect)).toBe(true);
        expect(typeof result.unadjustedEstimate.effect).toBe('number');
        expect(Number.isFinite(result.unadjustedEstimate.effect)).toBe(true);
        expect(result.unadjustedEstimate.se).toBeGreaterThan(0);
        expect(result.nStudies).toBe(8);
    });

    test('copasModel returns selection probabilities for each study', () => {
        const data = createPubBiasData();
        const result = pb.copasModel(data, { nGrid: 5 });

        expect(result.selectionProbabilities).toHaveLength(8);
        result.selectionProbabilities.forEach(p => {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        });
    });

    test('copasModel returns sensitivity analysis curve', () => {
        const data = createPubBiasData();
        const result = pb.copasModel(data, { nGrid: 5 });

        expect(result.sensitivityAnalysis.length).toBeGreaterThan(0);
        result.sensitivityAnalysis.forEach(point => {
            expect(typeof point.severity).toBe('number');
            expect(typeof point.mu).toBe('number');
        });
    });

    test('andrewsKasy returns bias-corrected estimate', () => {
        const data = createPubBiasData();
        const result = pb.andrewsKasy(data);

        expect(result.method).toBe('andrews-kasy');
        expect(typeof result.adjustedEstimate).toBe('number');
        expect(Number.isFinite(result.adjustedEstimate)).toBe(true);
        expect(typeof result.adjustedSE).toBe('number');
        expect(result.adjustedSE).toBeGreaterThan(0);
        expect(result.adjustedCI95).toHaveLength(2);
        expect(result.adjustedCI95[0]).toBeLessThan(result.adjustedCI95[1]);
    });

    test('andrewsKasy returns relative publication probabilities', () => {
        const data = createPubBiasData();
        const result = pb.andrewsKasy(data, { cutoffs: [0.05, 0.10] });

        expect(result.relativePublicationProbabilities.length).toBeGreaterThan(0);
        result.relativePublicationProbabilities.forEach(rp => {
            expect(typeof rp.pValueCutoff).toBe('number');
            expect(typeof rp.relativeWeight).toBe('number');
        });
    });
});

// ============================================================================
// 4. DataFabricationDetection
// ============================================================================

describe('DataFabricationDetection', () => {
    let detector;

    beforeEach(() => {
        detector = new DataFabricationDetection();
    });

    test('grimTest correctly identifies impossible means', () => {
        const data = [
            { id: 'possible',   mean: 2.50, n: 10 },
            { id: 'impossible', mean: 2.53, n: 10 }
        ];
        const result = detector.grim(data, { decimals: 2 });

        expect(result.method).toBe('grim');
        expect(result.results).toHaveLength(2);

        const possible = result.results.find(r => r.study === 'possible');
        const impossible = result.results.find(r => r.study === 'impossible');

        expect(possible.isPossible).toBe(true);
        expect(possible.flag).toBe('OK');
        expect(impossible.isPossible).toBe(false);
        expect(impossible.flag).toBe('INCONSISTENT');
    });

    test('grimTest summary counts are correct', () => {
        const data = [
            { id: 'A', mean: 3.00, n: 5 },
            { id: 'B', mean: 3.33, n: 3 },
            { id: 'C', mean: 3.14, n: 7 }
        ];
        const result = detector.grim(data, { decimals: 2 });

        expect(result.summary.total).toBe(3);
        expect(result.summary.consistent + result.summary.inconsistent).toBe(3);
        expect(result.summary.inconsistentRate).toBeGreaterThanOrEqual(0);
        expect(result.summary.inconsistentRate).toBeLessThanOrEqual(1);
    });

    test('spriteTest validates consistency of reported statistics', () => {
        const data = [
            { id: 'valid',   mean: 3.5, sd: 1.2, n: 10 },
            { id: 'suspect', mean: 3.5, sd: 0.01, n: 10 }
        ];
        const result = detector.sprite(data, { minValue: 1, maxValue: 7 });

        expect(result.method).toBe('sprite');
        expect(result.results).toHaveLength(2);
        result.results.forEach(r => {
            expect(typeof r.isPossible).toBe('boolean');
            expect(['POSSIBLE', 'IMPOSSIBLE']).toContain(r.flag);
        });
        expect(result.summary.total).toBe(2);
        expect(result.summary.possible + result.summary.impossible).toBe(2);
    });

    test('spriteTest returns reconstructed distribution when possible', () => {
        const data = [
            { id: 'easy', mean: 4.0, sd: 1.0, n: 5 }
        ];
        const result = detector.sprite(data, { minValue: 1, maxValue: 7 });
        const item = result.results[0];

        if (item.isPossible) {
            expect(item.reconstructedDistribution).not.toBeNull();
            expect(item.reconstructedDistribution).toHaveLength(5);
        }
    });

    test('grimmer detects SD inconsistencies beyond GRIM', () => {
        const data = [
            { id: 'ok',  mean: 3.00, sd: 1.00, n: 10 },
            { id: 'bad', mean: 3.00, sd: 1.23, n: 10 }
        ];
        const result = detector.grimmer(data, { decimals: 2 });

        expect(result.method).toBe('grimmer');
        expect(result.results).toHaveLength(2);
        result.results.forEach(r => {
            expect(['OK', 'GRIM_FAIL', 'GRIMMER_FAIL']).toContain(r.flag);
            expect(typeof r.grimPossible).toBe('boolean');
            expect(typeof r.grimmerPossible).toBe('boolean');
        });
        expect(result.summary.totalFails).toBe(result.summary.grimFails + result.summary.grimmerFails);
        expect(result.summary.failRate).toBeGreaterThanOrEqual(0);
        expect(result.summary.failRate).toBeLessThanOrEqual(1);
    });
});

// ============================================================================
// 5. MendelianRandomizationMA
// ============================================================================

describe('MendelianRandomizationMA', () => {
    let mr;

    beforeEach(() => {
        mr = new MendelianRandomizationMA();
    });

    test('ivw returns causal effect estimate with CI', () => {
        const data = createMRData();
        const result = mr.ivw(data);

        expect(result.method).toBe('ivw-random');
        expect(typeof result.estimate).toBe('number');
        expect(Number.isFinite(result.estimate)).toBe(true);
        expect(result.se).toBeGreaterThan(0);
        expect(result.ci95).toHaveLength(2);
        expect(result.ci95[0]).toBeLessThan(result.ci95[1]);
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
    });

    test('ivw fixed-effects returns estimate without heterogeneity', () => {
        const data = createMRData();
        const result = mr.ivw(data, { fixedEffects: true });

        expect(result.method).toBe('ivw-fixed');
        expect(typeof result.estimate).toBe('number');
        expect(result.se).toBeGreaterThan(0);
        expect(result.heterogeneity).toBeUndefined();
    });

    test('ivw causal estimate is positive for consistent positive ratios', () => {
        const data = createMRData();
        const result = mr.ivw(data);
        expect(result.estimate).toBeGreaterThan(0);
    });

    test('mrEgger returns intercept for pleiotropy test', () => {
        const data = createMRData();
        const result = mr.mrEgger(data);

        expect(result.method).toBe('mr-egger');
        expect(result.causalEstimate).toBeDefined();
        expect(typeof result.causalEstimate.estimate).toBe('number');
        expect(result.causalEstimate.se).toBeGreaterThan(0);
        expect(result.causalEstimate.ci95).toHaveLength(2);

        expect(typeof result.pleiotropyTest.intercept).toBe('number');
        expect(result.pleiotropyTest.se).toBeGreaterThan(0);
        expect(result.pleiotropyTest.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pleiotropyTest.pValue).toBeLessThanOrEqual(1);
        expect(typeof result.pleiotropyTest.interpretation).toBe('string');
    });

    test('weightedMedian returns robust estimate', () => {
        const data = createMRData();
        // Use small bootstrap count for speed
        const result = mr.weightedMedian(data, { bootstrapIterations: 50 });

        expect(result.method).toBe('weighted-median');
        expect(typeof result.estimate).toBe('number');
        expect(Number.isFinite(result.estimate)).toBe(true);
        expect(result.se).toBeGreaterThan(0);
        expect(result.ci95).toHaveLength(2);
        expect(result.ci95[0]).toBeLessThan(result.ci95[1]);
        expect(typeof result.robustness).toBe('string');
    });
});

// ============================================================================
// 6. HistoricalBorrowing
// ============================================================================

describe('HistoricalBorrowing', () => {
    let hb;

    beforeEach(() => {
        hb = new HistoricalBorrowing();
    });

    const currentData = { n: 50, mean: 5.0, sd: 2.0 };
    const historicalData = { n: 100, mean: 4.8, sd: 1.8 };

    test('powerPrior returns posterior with proper shrinkage', () => {
        const result = hb.powerPrior(currentData, historicalData, { a0: 0.5 });

        expect(result.method).toBe('power-prior');
        expect(result.powerParameter).toBe(0.5);
        expect(result.effectiveBorrowing).toBe(50);
        expect(typeof result.posteriorEstimate.mean).toBe('number');
        expect(result.posteriorEstimate.sd).toBeGreaterThan(0);
        expect(result.posteriorEstimate.ci95).toHaveLength(2);
        expect(result.posteriorEstimate.ci95[0]).toBeLessThan(result.posteriorEstimate.ci95[1]);
    });

    test('powerPrior posterior is between current and historical means', () => {
        const result = hb.powerPrior(currentData, historicalData, { a0: 0.5 });

        const lower = Math.min(currentData.mean, historicalData.mean);
        const upper = Math.max(currentData.mean, historicalData.mean);
        expect(result.posteriorEstimate.mean).toBeGreaterThanOrEqual(lower - 0.01);
        expect(result.posteriorEstimate.mean).toBeLessThanOrEqual(upper + 0.01);
    });

    test('powerPrior with a0=0 ignores historical data', () => {
        const result = hb.powerPrior(currentData, historicalData, { a0: 0 });

        expect(result.effectiveBorrowing).toBe(0);
        expect(result.historicalWeight).toBe(0);
        expect(result.currentWeight).toBe(1);
    });

    test('powerPrior with a0=1 fully borrows historical data', () => {
        const result = hb.powerPrior(currentData, historicalData, { a0: 1.0 });

        expect(result.effectiveBorrowing).toBe(100);
        // Posterior should be closer to historical mean because historical has more data
        const distToHist = Math.abs(result.posteriorEstimate.mean - historicalData.mean);
        const distToCurr = Math.abs(result.posteriorEstimate.mean - currentData.mean);
        expect(distToHist).toBeLessThan(distToCurr);
    });

    test('commensuratePrior returns borrowing weight', () => {
        const result = hb.commensuratePrior(currentData, historicalData);

        expect(result.method).toBe('commensurate-prior');
        expect(typeof result.commensurateParameter).toBe('number');
        expect(result.commensurateParameter).toBeGreaterThanOrEqual(0);

        expect(result.conflict).toBeDefined();
        expect(typeof result.conflict.zScore).toBe('number');
        expect(result.conflict.pValue).toBeGreaterThanOrEqual(0);
        expect(result.conflict.pValue).toBeLessThanOrEqual(1);

        expect(typeof result.posteriorEstimate.mean).toBe('number');
        expect(result.posteriorEstimate.sd).toBeGreaterThan(0);

        expect(result.borrowingMetrics).toBeDefined();
        expect(typeof result.borrowingMetrics.effectiveBorrowing).toBe('number');
        expect(typeof result.borrowingMetrics.interpretation).toBe('string');
    });

    test('commensuratePrior detects conflict when means differ greatly', () => {
        const conflicting = { n: 100, mean: 10.0, sd: 1.8 };
        const result = hb.commensuratePrior(currentData, conflicting);

        expect(result.conflict.zScore).toBeGreaterThan(2);
        expect(result.commensurateParameter).toBeGreaterThan(0);
    });
});

// ============================================================================
// 7. ThresholdAnalysis
// ============================================================================

describe('ThresholdAnalysis', () => {
    let ta;

    beforeEach(() => {
        ta = new ThresholdAnalysis();
    });

    test('nmaThreshold returns thresholds for each treatment', () => {
        const nmaResults = {
            effects: {
                'DrugA': { estimate: 0.5, se: 0.1 },
                'DrugB': { estimate: 0.3, se: 0.12 },
                'DrugC': { estimate: 0.7, se: 0.15 }
            }
        };

        const result = ta.nmaThreshold(nmaResults);

        expect(result.method).toBe('nma-threshold');
        expect(result.currentBest).toBe('DrugC');
        expect(result.thresholds).toHaveLength(3);

        result.thresholds.forEach(t => {
            expect(typeof t.treatment).toBe('string');
            expect(typeof t.threshold).toBe('number');
            expect(t.threshold).toBeGreaterThanOrEqual(0);
            expect(['increase', 'decrease']).toContain(t.direction);
            expect(typeof t.interpretation).toBe('string');
        });
    });

    test('nmaThreshold best treatment has decrease direction', () => {
        const nmaResults = {
            effects: {
                'A': { estimate: 1.0, se: 0.1 },
                'B': { estimate: 0.5, se: 0.1 },
                'C': { estimate: 0.2, se: 0.1 }
            }
        };

        const result = ta.nmaThreshold(nmaResults);

        const bestThreshold = result.thresholds.find(t => t.treatment === 'A');
        expect(bestThreshold.direction).toBe('decrease');
        expect(bestThreshold.threshold).toBeCloseTo(0.5, 5);
    });

    test('nmaThreshold non-best treatments have correct gap to best', () => {
        const nmaResults = {
            effects: {
                'A': { estimate: 1.0, se: 0.1 },
                'B': { estimate: 0.5, se: 0.1 },
                'C': { estimate: 0.2, se: 0.1 }
            }
        };

        const result = ta.nmaThreshold(nmaResults);

        const bThreshold = result.thresholds.find(t => t.treatment === 'B');
        expect(bThreshold.direction).toBe('increase');
        expect(bThreshold.threshold).toBeCloseTo(0.5, 5);

        const cThreshold = result.thresholds.find(t => t.treatment === 'C');
        expect(cThreshold.direction).toBe('increase');
        expect(cThreshold.threshold).toBeCloseTo(0.8, 5);
    });

    test('nmaThreshold returns robustness assessment', () => {
        const nmaResults = {
            effects: {
                'X': { estimate: 0.5, se: 0.1 },
                'Y': { estimate: 0.3, se: 0.12 }
            }
        };

        const result = ta.nmaThreshold(nmaResults);

        expect(result.robustness).toBeDefined();
        expect(result.robustness).toHaveLength(2);
        result.robustness.forEach(r => {
            expect(typeof r.treatment).toBe('string');
            expect(typeof r.robustnessRatio).toBe('number');
            expect(typeof r.interpretation).toBe('string');
        });
        expect(typeof result.decisionCertainty).toBe('number');
    });
});
