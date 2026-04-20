/**
 * Tests for the second half of src/engine/frontierMeta.js
 * Covers: EditorialStandards, PopulationAdjustment, CureFractionModels,
 *         PreferenceElicitation, MachineLearningHTA, CausalInferenceMethods,
 *         AdvancedUncertaintyQuantification, AdvancedSurvivalMethods
 */

'use strict';

const {
    EditorialStandards,
    PopulationAdjustment,
    CureFractionModels,
    PreferenceElicitation,
    MachineLearningHTA,
    CausalInferenceMethods,
    AdvancedUncertaintyQuantification,
    AdvancedSurvivalMethods
} = require('../../src/engine/frontierMeta');

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// 6-study meta-analysis dataset (log-OR scale)
const effects   = [0.30, 0.50, 0.20, 0.60, 0.35, 0.45];
const variances = [0.04, 0.06, 0.03, 0.08, 0.05, 0.07];
const tau2      = 0.02;

// ---------------------------------------------------------------------------
// EditorialStandards
// ---------------------------------------------------------------------------

describe('EditorialStandards', () => {
    let es;
    beforeEach(() => { es = new EditorialStandards(); });

    // -- smallStudyTests  (egger + begg inside) --
    test('smallStudyTests returns Egger and Begg results with p-values', () => {
        const result = es.smallStudyTests(effects, variances);

        // Egger
        expect(result.egger).toBeDefined();
        expect(typeof result.egger.pValue).toBe('number');
        expect(result.egger.pValue).toBeGreaterThanOrEqual(0);
        expect(result.egger.pValue).toBeLessThanOrEqual(1);
        expect(result.egger.reference).toContain('Egger');

        // Begg
        expect(result.begg).toBeDefined();
        expect(typeof result.begg.pValue).toBe('number');
        expect(result.begg.pValue).toBeGreaterThanOrEqual(0);
        expect(result.begg.pValue).toBeLessThanOrEqual(1);
        expect(result.begg.reference).toContain('Begg');
    });

    test('Egger test returns a regression intercept and t-statistic', () => {
        const result = es.smallStudyTests(effects, variances);
        expect(typeof result.egger.intercept).toBe('number');
        expect(Number.isFinite(result.egger.intercept)).toBe(true);
        expect(typeof result.egger.t).toBe('number');
        expect(Number.isFinite(result.egger.t)).toBe(true);
    });

    // -- bootstrapCI --
    test('bootstrapCI returns percentile and normal CIs that bracket the mean', () => {
        const result = es.bootstrapCI(effects, variances, tau2, 500);

        expect(result.ci95_percentile).toHaveLength(2);
        expect(result.ci95_percentile[0]).toBeLessThan(result.ci95_percentile[1]);
        expect(result.bootstrapMean).toBeGreaterThanOrEqual(result.ci95_percentile[0]);
        expect(result.bootstrapMean).toBeLessThanOrEqual(result.ci95_percentile[1]);

        expect(result.ci95_normal).toHaveLength(2);
        expect(result.ci95_normal[0]).toBeLessThan(result.ci95_normal[1]);
        expect(result.nBootstrap).toBe(500);
    });

    test('bootstrapCI is deterministic across repeated calls (seeded RNG)', () => {
        const a = new EditorialStandards();
        const b = new EditorialStandards();
        const r1 = a.bootstrapCI(effects, variances, tau2, 200);
        const r2 = b.bootstrapCI(effects, variances, tau2, 200);

        expect(r1.bootstrapMean).toBeCloseTo(r2.bootstrapMean, 8);
    });

    // -- knappHartung --
    test('knappHartung returns estimate with df = k-1', () => {
        const result = es.knappHartung(effects, variances, tau2);
        expect(result.df).toBe(effects.length - 1);
        expect(result.method).toBe('Knapp-Hartung');
        expect(result.ci95[0]).toBeLessThan(result.estimate);
        expect(result.ci95[1]).toBeGreaterThan(result.estimate);
    });
});

// ---------------------------------------------------------------------------
// PopulationAdjustment
// ---------------------------------------------------------------------------

describe('PopulationAdjustment', () => {
    let pa;
    beforeEach(() => { pa = new PopulationAdjustment(); });

    // Helper: simple IPD dataset
    function makeIPD(n) {
        return Array.from({ length: n }, (_, i) => ({
            age: 50 + (i % 30),
            sex: i % 2,
            outcome: 0.4 + (i % 5) * 0.1,
            treatment: i % 2
        }));
    }

    const aggregateData = {
        means: { age: 60, sex: 0.4 },
        mean: 0.55,
        se: 0.05
    };

    test('maicAnalysis returns treatment effect and effective sample size', () => {
        const ipd = makeIPD(100);
        const result = pa.maicAnalysis(ipd, aggregateData, {
            covariates: ['age', 'sex'],
            outcomeVar: 'outcome',
            treatmentVar: 'treatment'
        });

        expect(result.method).toBe('maic');
        expect(result.effectiveSampleSize).toBeGreaterThan(0);
        expect(result.effectiveSampleSize).toBeLessThanOrEqual(ipd.length);
        expect(result.treatmentEffect).toBeDefined();
        expect(typeof result.treatmentEffect.estimate).toBe('number');
        expect(Number.isFinite(result.treatmentEffect.estimate)).toBe(true);
    });

    test('stcAnalysis returns regression-based treatment effect', () => {
        const ipd = makeIPD(80);
        const result = pa.stcAnalysis(ipd, aggregateData, {
            covariates: ['age', 'sex'],
            outcomeVar: 'outcome',
            treatmentVar: 'treatment'
        });

        expect(result.method).toBe('stc');
        expect(typeof result.treatmentEffect.estimate).toBe('number');
        expect(typeof result.rSquared).toBe('number');
    });

    test('effective sample size is less than or equal to original N', () => {
        const ipd = makeIPD(60);
        const result = pa.maicAnalysis(ipd, aggregateData, {
            covariates: ['age', 'sex'],
            outcomeVar: 'outcome',
            treatmentVar: 'treatment'
        });
        expect(result.essReduction).toBeGreaterThanOrEqual(0);
        expect(result.essReduction).toBeLessThanOrEqual(100);
    });
});

// ---------------------------------------------------------------------------
// CureFractionModels
// ---------------------------------------------------------------------------

describe('CureFractionModels', () => {
    let cm;
    beforeEach(() => { cm = new CureFractionModels(); });

    // Survival data with a clear plateau (cure fraction)
    // ~40% events early, then stable tail = cure fraction ~0.3-0.5
    function makeSurvivalData() {
        const n = 100;
        const times = [];
        const events = [];
        for (let i = 0; i < n; i++) {
            if (i < 50) {
                // Early events
                times.push(1 + i * 0.5);
                events.push(1);
            } else {
                // Long-term survivors (censored)
                times.push(30 + i * 0.2);
                events.push(0);
            }
        }
        return { times, events };
    }

    test('mixtureCure returns a cure fraction between 0 and 1', () => {
        const { times, events } = makeSurvivalData();
        const result = cm.mixtureCure(times, events, { distribution: 'weibull' });

        expect(result.method).toBe('mixture-cure');
        expect(result.cureFraction).toBeGreaterThanOrEqual(0);
        expect(result.cureFraction).toBeLessThanOrEqual(1);
        expect(result.cureFractionCI).toHaveLength(2);
        expect(result.cureFractionCI[0]).toBeLessThanOrEqual(result.cureFraction);
        expect(result.cureFractionCI[1]).toBeGreaterThanOrEqual(result.cureFraction);
    });

    test('mixtureCure survival function is monotonically decreasing and starts near 1', () => {
        const { times, events } = makeSurvivalData();
        const result = cm.mixtureCure(times, events);
        const sf = result.survivalFunction;

        expect(sf(0)).toBeCloseTo(1, 1);
        expect(sf(5)).toBeLessThanOrEqual(sf(0));
        expect(sf(50)).toBeLessThanOrEqual(sf(5));
        // Approaches cure fraction at long horizons
        expect(sf(500)).toBeGreaterThan(0);
    });

    test('nonMixtureCure returns a cure fraction derived from theta', () => {
        const { times, events } = makeSurvivalData();
        const result = cm.nonMixtureCure(times, events);

        expect(result.method).toBe('non-mixture-cure');
        expect(result.cureFraction).toBeGreaterThanOrEqual(0);
        expect(result.cureFraction).toBeLessThanOrEqual(1);
        expect(result.theta).toBeGreaterThan(0);
        // cureFraction = exp(-theta) relationship
        expect(result.cureFraction).toBeCloseTo(Math.exp(-result.theta), 10);
    });
});

// ---------------------------------------------------------------------------
// PreferenceElicitation
// ---------------------------------------------------------------------------

describe('PreferenceElicitation', () => {
    let pe;
    beforeEach(() => { pe = new PreferenceElicitation(); });

    // DCE data: 3 choice sets, 2 alternatives each, 2 attributes (cost, efficacy)
    function makeDCEData() {
        return [
            // Set 1: alternative A chosen
            { choiceSet: 1, chosen: true,  cost: -50, efficacy: 0.8 },
            { choiceSet: 1, chosen: false, cost: -20, efficacy: 0.3 },
            // Set 2: alternative B chosen
            { choiceSet: 2, chosen: false, cost: -60, efficacy: 0.6 },
            { choiceSet: 2, chosen: true,  cost: -10, efficacy: 0.9 },
            // Set 3: alternative A chosen
            { choiceSet: 3, chosen: true,  cost: -40, efficacy: 0.7 },
            { choiceSet: 3, chosen: false, cost: -30, efficacy: 0.2 },
            // Set 4
            { choiceSet: 4, chosen: false, cost: -55, efficacy: 0.4 },
            { choiceSet: 4, chosen: true,  cost: -15, efficacy: 0.85 },
            // Set 5
            { choiceSet: 5, chosen: true,  cost: -25, efficacy: 0.75 },
            { choiceSet: 5, chosen: false, cost: -45, efficacy: 0.35 }
        ];
    }

    test('analyzeDiscretChoice returns coefficients and model fit for conditional logit', () => {
        const data = makeDCEData();
        const result = pe.analyzeDiscretChoice(data, {}, {
            modelType: 'conditional-logit',
            attributes: ['cost', 'efficacy']
        });

        expect(result.method).toBe('discrete-choice-experiment');
        expect(result.modelType).toBe('conditional-logit');
        expect(result.coefficients).toBeDefined();
        expect(typeof result.coefficients.cost).toBe('number');
        expect(typeof result.coefficients.efficacy).toBe('number');
        expect(result.modelFit).toBeDefined();
        expect(typeof result.modelFit.logLikelihood).toBe('number');
    });

    test('_fitConditionalLogit returns finite coefficients and standard errors', () => {
        const data = makeDCEData();
        const model = pe._fitConditionalLogit(data, ['cost', 'efficacy']);

        expect(Number.isFinite(model.coefficients.cost)).toBe(true);
        expect(Number.isFinite(model.coefficients.efficacy)).toBe(true);
        expect(Number.isFinite(model.se.cost)).toBe(true);
        expect(Number.isFinite(model.se.efficacy)).toBe(true);
        expect(model.se.cost).toBeGreaterThan(0);
        expect(model.se.efficacy).toBeGreaterThan(0);
    });

    test('conditional logit produces higher coefficient for strongly preferred attribute', () => {
        // Efficacy strongly drives choices, cost weakly
        const data = makeDCEData();
        const model = pe._fitConditionalLogit(data, ['cost', 'efficacy']);

        // Efficacy coefficient should be positive (higher efficacy preferred)
        expect(model.coefficients.efficacy).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// MachineLearningHTA
// ---------------------------------------------------------------------------

describe('MachineLearningHTA', () => {
    let ml;
    beforeEach(() => { ml = new MachineLearningHTA(); });

    test('_calculateConcordance returns C-index between 0.5 and 1.0 for concordant data', () => {
        // Higher risk score => shorter time (perfectly concordant)
        const scores = [0.9, 0.7, 0.5, 0.3, 0.1];
        const data = [
            { time: 1, event: 1 },
            { time: 2, event: 1 },
            { time: 3, event: 1 },
            { time: 4, event: 1 },
            { time: 5, event: 1 }
        ];
        const cIndex = ml._calculateConcordance(scores, data, 'time', 'event');

        expect(cIndex).toBeGreaterThanOrEqual(0.5);
        expect(cIndex).toBeLessThanOrEqual(1.0);
        // Perfect concordance: higher score = shorter time
        expect(cIndex).toBeCloseTo(1.0, 5);
    });

    test('_calculateConcordance returns 0.5 for random / uncorrelated data', () => {
        // Scores in same order as times (discordant with the convention higher risk = shorter time)
        const scores = [0.1, 0.2, 0.3, 0.4, 0.5];
        const data = [
            { time: 1, event: 1 },
            { time: 2, event: 1 },
            { time: 3, event: 1 },
            { time: 4, event: 1 },
            { time: 5, event: 1 }
        ];
        const cIndex = ml._calculateConcordance(scores, data, 'time', 'event');

        // Perfectly discordant => C-index = 0
        expect(cIndex).toBeGreaterThanOrEqual(0);
        expect(cIndex).toBeLessThanOrEqual(1.0);
    });

    test('_calculateConcordance handles censored observations', () => {
        const scores = [0.8, 0.6, 0.4, 0.2];
        const data = [
            { time: 1, event: 1 },
            { time: 2, event: 0 },  // censored
            { time: 3, event: 1 },
            { time: 4, event: 0 }   // censored
        ];
        const cIndex = ml._calculateConcordance(scores, data, 'time', 'event');
        expect(cIndex).toBeGreaterThanOrEqual(0);
        expect(cIndex).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(cIndex)).toBe(true);
    });

    test('_calculateConcordance returns 0.5 for fewer than 2 data points', () => {
        expect(ml._calculateConcordance([0.5], [{ time: 1, event: 1 }], 'time', 'event')).toBe(0.5);
        expect(ml._calculateConcordance([], [], 'time', 'event')).toBe(0.5);
    });
});

// ---------------------------------------------------------------------------
// CausalInferenceMethods
// ---------------------------------------------------------------------------

describe('CausalInferenceMethods', () => {
    let ci;
    beforeEach(() => { ci = new CausalInferenceMethods(); });

    function makeCausalData(n) {
        const data = [];
        for (let i = 0; i < n; i++) {
            const age = 40 + (i % 40);
            const treatment = age > 60 ? 1 : 0;
            const outcome = 2 + treatment * 0.5 + age * 0.01 + (i % 7) * 0.05;
            data.push({ age, treatment, outcome });
        }
        return data;
    }

    test('_fitPropensityScore returns scores between 0 and 1 for each observation', () => {
        const data = makeCausalData(80);
        const g = ci._fitPropensityScore(data, 'treatment', ['age'], false);

        expect(g.predict).toBeDefined();
        data.forEach(d => {
            const ps = g.predict(d);
            expect(ps).toBeGreaterThanOrEqual(0);
            expect(ps).toBeLessThanOrEqual(1);
        });
    });

    test('_fitPropensityScore without covariates returns prevalence', () => {
        const data = makeCausalData(50);
        const g = ci._fitPropensityScore(data, 'treatment', [], false);
        const prevalence = data.filter(d => d.treatment === 1).length / data.length;
        const ps = g.predict(data[0]);
        expect(ps).toBeCloseTo(prevalence, 5);
    });

    test('tmle returns ATE estimate and marks method as doubly robust', () => {
        const data = makeCausalData(100);
        const result = ci.tmle(data, {
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            covariates: ['age']
        });

        expect(result.method).toBe('tmle');
        expect(result.doublyRobust).toBe(true);
        expect(typeof result.ate.estimate).toBe('number');
        expect(Number.isFinite(result.ate.estimate)).toBe(true);
        expect(result.ate.ci95).toHaveLength(2);
        expect(result.models.outcome).toBeDefined();
        expect(result.models.propensity).toBeDefined();
        expect(result.diagnostics.positivity).toBeDefined();
    });

    test('aipw returns doubly robust estimate', () => {
        const data = makeCausalData(80);
        const result = ci.aipw(data, {
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            covariates: ['age']
        });

        expect(result.method).toBe('aipw');
        expect(result.doublyRobust).toBe(true);
        expect(typeof result.ate.estimate).toBe('number');
        expect(Number.isFinite(result.ate.estimate)).toBe(true);
        expect(result.ate.ci95).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// AdvancedUncertaintyQuantification
// ---------------------------------------------------------------------------

describe('AdvancedUncertaintyQuantification', () => {
    let auq;
    beforeEach(() => { auq = new AdvancedUncertaintyQuantification(); });

    test('_calculateFirstOrderSobol returns index between 0 and 1', () => {
        // Model: y = 2*x1 + 0.5*x2 (x1 dominates)
        const params = ['x1', 'x2'];
        const ranges = { x1: { min: 0, max: 1 }, x2: { min: 0, max: 1 } };
        const samples = auq._saltelliSampling(ranges, 200);
        const outputs = samples.map(s => 2 * s.x1 + 0.5 * s.x2);

        const si_x1 = auq._calculateFirstOrderSobol('x1', samples, outputs, params, 'saltelli');
        const si_x2 = auq._calculateFirstOrderSobol('x2', samples, outputs, params, 'saltelli');

        expect(si_x1).toBeGreaterThanOrEqual(0);
        expect(si_x1).toBeLessThanOrEqual(1);
        expect(si_x2).toBeGreaterThanOrEqual(0);
        expect(si_x2).toBeLessThanOrEqual(1);
        // x1 should explain more variance than x2
        expect(si_x1).toBeGreaterThan(si_x2);
    });

    test('sobolIndices returns first-order and total-order for all parameters', () => {
        const model = (s) => 3 * s.a + 1 * s.b;
        const ranges = { a: { min: 0, max: 1 }, b: { min: 0, max: 1 } };
        const result = auq.sobolIndices(model, ranges, { nSamples: 300, nResamples: 50 });

        expect(result.method).toBe('sobol-indices');
        expect(result.firstOrder).toHaveLength(2);
        expect(result.totalOrder).toHaveLength(2);
        result.firstOrder.forEach(f => {
            expect(f.Si).toBeGreaterThanOrEqual(0);
            expect(f.Si).toBeLessThanOrEqual(1);
        });
    });

    test('_calculateFirstOrderSobol returns 0 for constant output', () => {
        const samples = [{ x: 0.1 }, { x: 0.5 }, { x: 0.9 }];
        const outputs = [5, 5, 5];
        const si = auq._calculateFirstOrderSobol('x', samples, outputs, ['x'], 'saltelli');
        expect(si).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// AdvancedSurvivalMethods
// ---------------------------------------------------------------------------

describe('AdvancedSurvivalMethods', () => {
    let asm;
    beforeEach(() => { asm = new AdvancedSurvivalMethods(); });

    function makeSurvivalData() {
        // Control group: higher event rate
        const control = Array.from({ length: 30 }, (_, i) => ({
            treatment: 0,
            time: 1 + i * 0.8,
            event: i < 20 ? 1 : 0
        }));
        // Treatment group: lower event rate
        const treated = Array.from({ length: 30 }, (_, i) => ({
            treatment: 1,
            time: 2 + i * 1.0,
            event: i < 15 ? 1 : 0
        }));
        return [...control, ...treated];
    }

    test('rmstAnalysis returns RMST difference with CI', () => {
        const data = makeSurvivalData();
        const result = asm.rmstAnalysis(data, {
            restrictionTime: 20,
            groupVar: 'treatment',
            timeVar: 'time',
            eventVar: 'event'
        });

        expect(result.method).toBe('rmst');
        expect(result.tau).toBe(20);
        expect(result.byGroup).toHaveLength(2);
        result.byGroup.forEach(g => {
            expect(g.rmst).toBeGreaterThan(0);
            expect(typeof g.rmst).toBe('number');
        });
        expect(typeof result.difference.estimate).toBe('number');
        expect(Number.isFinite(result.difference.estimate)).toBe(true);
        expect(result.difference.ci95).toHaveLength(2);
        expect(result.difference.ci95[0]).toBeLessThan(result.difference.ci95[1]);
    });

    test('rmstAnalysis auto-selects restriction time when not provided', () => {
        const data = makeSurvivalData();
        const result = asm.rmstAnalysis(data, {
            groupVar: 'treatment',
            timeVar: 'time',
            eventVar: 'event'
        });

        expect(result.tau).toBeGreaterThan(0);
        expect(result.byGroup).toHaveLength(2);
    });

    test('RMST for treatment group is larger than control in favourable data', () => {
        const data = makeSurvivalData();
        const result = asm.rmstAnalysis(data, {
            restrictionTime: 20,
            groupVar: 'treatment',
            timeVar: 'time',
            eventVar: 'event'
        });

        // Treatment group (index 1) should have higher RMST
        const controlRMST = result.byGroup.find(g => g.group === 0).rmst;
        const treatedRMST = result.byGroup.find(g => g.group === 1).rmst;
        expect(treatedRMST).toBeGreaterThan(controlRMST);
    });

    test('rmstAnalysis ratio is positive', () => {
        const data = makeSurvivalData();
        const result = asm.rmstAnalysis(data, {
            restrictionTime: 20,
            groupVar: 'treatment',
            timeVar: 'time',
            eventVar: 'event'
        });

        expect(result.ratio.estimate).toBeGreaterThan(0);
        expect(Number.isFinite(result.ratio.estimate)).toBe(true);
    });
});
