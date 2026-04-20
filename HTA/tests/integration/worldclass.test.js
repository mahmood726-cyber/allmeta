/**
 * Integration Tests: World-Class Engine Workflows
 *
 * Tests complete workflows chaining the 8 newest engines:
 *   CountryProfileLibrary, MarkovEngine, BudgetImpactEngine,
 *   CoxRegressionEngine, GuyotIPDEngine, ModelAveragingEngine,
 *   RegulatoryTemplateEngine, GRADEAutomationEngine,
 *   LivingHTAEngine, ExpectedLossEngine, EVSIEngine
 */

'use strict';

const { performance } = require('perf_hooks');
global.performance = global.performance || performance;

// ─── Shared Dependencies ──────────────────────────────────────────────────

const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');
const { PCG32 } = require('../../src/utils/pcg32');

global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;
global.PCG32 = PCG32;

// ─── Engine Imports ───────────────────────────────────────────────────────

const { CountryProfileLibrary } = require('../../src/engine/countryProfiles');
const { MarkovEngine } = require('../../src/engine/markov');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const { CoxRegressionEngine } = require('../../src/engine/coxRegression');
const { GuyotIPDEngine } = require('../../src/engine/guyotIPD');
const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');
const { RegulatoryTemplateEngine } = require('../../src/engine/regulatoryTemplates');
const { GRADEAutomationEngine } = require('../../src/engine/gradeAutomation');
const { LivingHTAEngine } = require('../../src/engine/livingHTA');
const { ExpectedLossEngine } = require('../../src/engine/expectedLoss');
const { EVSIEngine } = require('../../src/engine/evsi');

// ─── Silent logger ────────────────────────────────────────────────────────

const silentLogger = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMarkovProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: { id: 'wc-test', name: 'World-Class Test Model' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 50,
            ...overrides.settings
        },
        parameters: {
            p_sick_to_dead: { value: 0.05 },
            p_healthy_to_sick: { value: 0.10 },
            c_healthy: { value: 500 },
            c_sick: { value: 3000 },
            u_healthy: { value: 0.9 },
            u_sick: { value: 0.5 },
            ...overrides.parameters
        },
        states: {
            healthy: {
                label: 'Healthy',
                initial_probability: 1,
                cost: 'c_healthy',
                utility: 'u_healthy'
            },
            sick: {
                label: 'Sick',
                initial_probability: 0,
                cost: 'c_sick',
                utility: 'u_sick'
            },
            dead: {
                label: 'Dead',
                type: 'absorbing',
                initial_probability: 0,
                cost: 0,
                utility: 0
            },
            ...overrides.states
        },
        transitions: {
            healthy_to_sick: { from: 'healthy', to: 'sick', probability: 'p_healthy_to_sick' },
            healthy_to_dead: { from: 'healthy', to: 'dead', probability: 0.02 },
            healthy_to_healthy: { from: 'healthy', to: 'healthy', probability: 'complement' },
            sick_to_dead: { from: 'sick', to: 'dead', probability: 'p_sick_to_dead' },
            sick_to_sick: { from: 'sick', to: 'sick', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 },
            ...overrides.transitions
        },
        strategies: overrides.strategies || {
            comparator: {
                label: 'Standard Care',
                is_comparator: true,
                parameter_overrides: {}
            },
            intervention: {
                label: 'New Drug',
                parameter_overrides: { p_healthy_to_sick: 0.05 }
            }
        }
    };
}

function createBIAConfig(overrides = {}) {
    return {
        population: 1000000,
        prevalence: 0.01,
        timeHorizon: 5,
        uptake: [0.1, 0.2, 0.3, 0.4, 0.5],
        newTx: { drugCost: 5000, adminCost: 200, monitoringCost: 300, aeCost: 100 },
        currentTx: { drugCost: 2000, adminCost: 100, monitoringCost: 200, aeCost: 50 },
        offsets: { hospitalizationSavings: -500 },
        discountRate: 0.03,
        ...overrides
    };
}

function createSurvivalData(n = 100, seed = 42) {
    const rng = new PCG32(seed);
    const data = [];
    for (let i = 0; i < n; i++) {
        const u = rng.nextFloat();
        const time = Math.max(0.1, 10 * Math.pow(-Math.log(Math.max(u, 0.001)), 1 / 1.5));
        const event = rng.nextFloat() < 0.7 ? 1 : 0;
        data.push({ time, event });
    }
    return data;
}

function createCoxData(n = 150, seed = 42) {
    const rng = new PCG32(seed);
    const data = [];
    for (let i = 0; i < n; i++) {
        const treatment = rng.nextFloat() < 0.5 ? 1 : 0;
        const age = 40 + Math.floor(rng.nextFloat() * 30);
        const u = rng.nextFloat();
        // Treatment reduces hazard (treatment=1 has longer times)
        const baseTime = 10 * Math.pow(-Math.log(Math.max(u, 0.001)), 1 / 1.5);
        const time = Math.max(0.1, baseTime * (treatment === 1 ? 1.5 : 1.0));
        const event = rng.nextFloat() < 0.7 ? 1 : 0;
        data.push({ time, event, covariates: { treatment, age } });
    }
    return data;
}

function createKMPoints() {
    return [
        { time: 0, survival: 1.0 },
        { time: 3, survival: 0.90 },
        { time: 6, survival: 0.78 },
        { time: 9, survival: 0.65 },
        { time: 12, survival: 0.52 },
        { time: 15, survival: 0.40 },
        { time: 18, survival: 0.30 },
        { time: 21, survival: 0.22 },
        { time: 24, survival: 0.15 }
    ];
}

function createNRiskTable() {
    return [
        { time: 0, nRisk: 100 },
        { time: 6, nRisk: 82 },
        { time: 12, nRisk: 55 },
        { time: 18, nRisk: 32 },
        { time: 24, nRisk: 16 }
    ];
}

function createPSAIterations(nIter = 200, seed = 42) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < nIter; i++) {
        const p = 0.3 + rng.nextFloat() * 0.4;
        const costA = 5000 + p * 10000;
        const costB = 3000 + rng.nextFloat() * 2000;
        const qalyA = 5 + (1 - p) * 2;
        const qalyB = 5 + rng.nextFloat() * 0.5;
        iterations.push({
            costs: { A: costA, B: costB },
            qalys: { A: qalyA, B: qalyB }
        });
    }
    return iterations;
}

function createPSAResultsForEVSI(nIter = 200, seed = 42) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < nIter; i++) {
        const p = 0.3 + rng.nextFloat() * 0.4;
        const costs = 5000 + p * 10000;
        const qalys = 5 + (1 - p) * 2;
        const nmb = qalys * 50000 - costs;
        iterations.push({
            params: { p_response: p },
            costs, qalys, nmb,
            optimal: nmb > 0 ? 1 : 0
        });
    }
    return { iterations, wtp: 50000, evpi: 5000 };
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 1: Multi-Country HTA Analysis
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 1: Multi-Country HTA Analysis', () => {

    test('1. UK profile Markov model yields ICER at GBP 30K WTP', () => {
        const lib = new CountryProfileLibrary();
        const engine = new MarkovEngine({ logger: silentLogger });

        const ukProfile = lib.getProfile('uk');
        expect(ukProfile.wtpPerQaly).toBe(30000);
        expect(ukProfile.currency).toBe('GBP');

        // Apply UK discount rates to the model
        const project = createMarkovProject({
            settings: {
                discount_rate_costs: ukProfile.discountRateCosts,
                discount_rate_qalys: ukProfile.discountRateOutcomes
            }
        });

        const result = engine.run(project);
        expect(result).toBeDefined();
        expect(typeof result.total_costs).toBe('number');
        expect(typeof result.total_qalys).toBe('number');
        expect(result.total_costs).toBeGreaterThan(0);
        expect(result.total_qalys).toBeGreaterThan(0);

        // Compute ICER-like metric (costs / QALYs as a ratio)
        const costPerQaly = result.total_costs / result.total_qalys;
        expect(costPerQaly).toBeGreaterThan(0);
        expect(isFinite(costPerQaly)).toBe(true);
    });

    test('2. Canada profile uses different discount rate, changes QALYs', () => {
        const lib = new CountryProfileLibrary();
        const engine = new MarkovEngine({ logger: silentLogger });

        const ukRates = lib.getDiscountRates('uk');
        const caRates = lib.getDiscountRates('canada');

        // UK: 3.5% for both costs and outcomes
        expect(ukRates.costs).toBe(0.035);
        // Canada: 1.5% for both costs and outcomes
        expect(caRates.costs).toBe(0.015);
        expect(caRates.outcomes).toBe(0.015);

        // Run with UK rates
        const ukProject = createMarkovProject({
            settings: { discount_rate_costs: ukRates.costs, discount_rate_qalys: ukRates.outcomes }
        });
        const ukResult = engine.run(ukProject);

        // Run with Canada rates (lower discounting -> higher QALYs)
        const caProject = createMarkovProject({
            settings: { discount_rate_costs: caRates.costs, discount_rate_qalys: caRates.outcomes }
        });
        const caResult = engine.run(caProject);

        // Lower discount rate should yield higher total QALYs
        expect(caResult.total_qalys).toBeGreaterThan(ukResult.total_qalys);
        // Lower discount rate should yield higher total costs too (less discounting)
        expect(caResult.total_costs).toBeGreaterThan(ukResult.total_costs);
    });

    test('3. BIA with Australia profile uses AUD currency', () => {
        const lib = new CountryProfileLibrary();
        const auProfile = lib.getProfile('australia');

        expect(auProfile.currency).toBe('AUD');
        expect(auProfile.discountRateCosts).toBe(0.05);

        const bia = new BudgetImpactEngine({ currency: auProfile.currency });
        const config = createBIAConfig({ discountRate: auProfile.discountRateCosts });
        const result = bia.run(config);

        expect(result).toBeDefined();
        expect(result.currency).toBe('AUD');
        expect(result.yearlyBudget.length).toBe(5);
        expect(typeof result.netBudgetImpact).toBe('number');
    });

    test('4. Compare 5 countries: different ICERs from different discount rates', () => {
        const lib = new CountryProfileLibrary();
        const engine = new MarkovEngine({ logger: silentLogger });

        const countries = ['uk', 'canada', 'australia', 'japan', 'netherlands'];
        const results = {};

        for (const code of countries) {
            const rates = lib.getDiscountRates(code);
            const project = createMarkovProject({
                settings: {
                    discount_rate_costs: rates.costs,
                    discount_rate_qalys: rates.outcomes
                }
            });
            const r = engine.run(project);
            results[code] = {
                costPerQaly: r.total_costs / r.total_qalys,
                discountCosts: rates.costs,
                discountOutcomes: rates.outcomes
            };
        }

        // All 5 should produce valid cost/QALY ratios
        for (const code of countries) {
            expect(isFinite(results[code].costPerQaly)).toBe(true);
            expect(results[code].costPerQaly).toBeGreaterThan(0);
        }

        // Countries with different discount rates should yield different cost/QALY
        // UK (3.5%) vs Canada (1.5%) should differ
        expect(results.uk.costPerQaly).not.toBeCloseTo(results.canada.costPerQaly, 0);
    });

    test('5. applyProfile correctly overrides model config', () => {
        const lib = new CountryProfileLibrary();

        const baseConfig = {
            discountRateCosts: 0.03,
            discountRateOutcomes: 0.03,
            currency: 'USD',
            perspective: 'societal',
            customField: 'preserved'
        };

        const applied = lib.applyProfile('uk', baseConfig);

        // UK overrides should be applied
        expect(applied.discountRateCosts).toBe(0.035);
        expect(applied.discountRateOutcomes).toBe(0.035);
        expect(applied.currency).toBe('GBP');
        expect(applied.perspective).toBe('NHS and PSS');
        expect(applied.countryCode).toBe('uk');
        expect(applied.countryName).toBe('United Kingdom');
        expect(applied.agency).toBe('NICE');
        // Custom field should be preserved
        expect(applied.customField).toBe('preserved');
    });

    test('6. Netherlands severity-adjusted WTP changes cost-effectiveness conclusion', () => {
        const lib = new CountryProfileLibrary();

        // Netherlands has severity-based WTP: low=20000, medium=50000, high=80000
        const lowSeverity = lib.getSeverityAdjustedWTP('netherlands', 'low');
        const highSeverity = lib.getSeverityAdjustedWTP('netherlands', 'high');

        expect(lowSeverity.wtp).toBe(20000);
        expect(highSeverity.wtp).toBe(80000);
        expect(lowSeverity.method).toContain('Severity-weighted');
        expect(highSeverity.method).toContain('Severity-weighted');

        // A treatment with ICER = 40000 EUR:
        // - Low severity (WTP 20K): NOT cost-effective
        // - High severity (WTP 80K): cost-effective
        const icer = 40000;
        const costEffectiveLow = icer <= lowSeverity.wtp;
        const costEffectiveHigh = icer <= highSeverity.wtp;

        expect(costEffectiveLow).toBe(false);
        expect(costEffectiveHigh).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 2: Survival Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 2: Survival Pipeline', () => {

    test('1. Guyot reconstruct KM then fit Cox PH on synthetic IPD', () => {
        const guyot = new GuyotIPDEngine();
        const cox = new CoxRegressionEngine();

        // Reconstruct IPD from published KM
        const kmPoints = createKMPoints();
        const nRisk = createNRiskTable();
        const reconstruction = guyot.reconstruct(kmPoints, nRisk, 100);

        expect(reconstruction.ipd.length).toBe(100);
        expect(reconstruction.nEvents).toBeGreaterThan(0);
        expect(reconstruction.nCensored).toBeGreaterThanOrEqual(0);
        expect(reconstruction.validation.rmse).toBeLessThan(0.15);

        // Add a synthetic treatment covariate to the IPD
        const rng = new PCG32(99);
        const ipdWithCov = reconstruction.ipd.map(p => ({
            ...p,
            covariates: { treatment: rng.nextFloat() < 0.5 ? 1 : 0 }
        }));

        // Fit Cox PH model
        const coxModel = cox.coxPH(ipdWithCov, ['treatment']);

        expect(coxModel.converged).toBe(true);
        expect(coxModel.coefficients.length).toBe(1);
        expect(coxModel.coefficients[0].name).toBe('treatment');
        expect(typeof coxModel.coefficients[0].hr).toBe('number');
        expect(coxModel.coefficients[0].hr).toBeGreaterThan(0);
        expect(coxModel.concordance).toBeGreaterThanOrEqual(0);
        expect(coxModel.concordance).toBeLessThanOrEqual(1);
    });

    test('2. Guyot IPD then model averaging for survival prediction', () => {
        const guyot = new GuyotIPDEngine();
        const averaging = new ModelAveragingEngine();

        // Reconstruct IPD
        const reconstruction = guyot.reconstruct(createKMPoints(), createNRiskTable(), 100);
        expect(reconstruction.ipd.length).toBe(100);

        // Fit parametric models to the reconstructed IPD
        const fits = guyot.fitSurvivalToIPD(reconstruction.ipd, ['weibull', 'lognormal', 'loglogistic', 'exponential']);
        expect(fits.length).toBe(4);

        // All should have AIC values
        const validFits = fits.filter(f => isFinite(f.aic));
        expect(validFits.length).toBeGreaterThanOrEqual(2);

        // Compute BIC weights for model averaging
        const modelsForBIC = validFits.map(f => ({
            name: f.distribution,
            bic: f.bic
        }));
        const weights = averaging.bicWeights(modelsForBIC);
        expect(weights.length).toBe(validFits.length);

        // Weights should sum to ~1
        const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 5);

        // Model-averaged survival prediction
        const fittedModels = validFits.map((f, i) => ({
            name: f.distribution,
            distribution: f.distribution,
            params: f.parameters,
            weight: weights[i].weight
        }));

        const times = [0, 3, 6, 9, 12, 18, 24];
        const prediction = averaging.survivalPrediction(fittedModels, times);

        expect(prediction.times.length).toBe(7);
        expect(prediction.survival.length).toBe(7);
        // Survival at time 0 should be ~1
        expect(prediction.survival[0]).toBeCloseTo(1.0, 1);
        // Survival should be monotonically non-increasing
        for (let i = 1; i < prediction.survival.length; i++) {
            expect(prediction.survival[i]).toBeLessThanOrEqual(prediction.survival[i - 1] + 0.01);
        }
    });

    test('3. Cox PH HR matches expected direction', () => {
        const cox = new CoxRegressionEngine();

        // Create data where treatment=1 has longer survival
        const data = createCoxData(150, 42);

        const model = cox.coxPH(data, ['treatment', 'age']);

        expect(model.converged).toBe(true);
        expect(model.coefficients.length).toBe(2);

        // Treatment covariate: treatment=1 has longer survival (lower hazard)
        // so HR should be < 1 (negative beta)
        const treatmentCoeff = model.coefficients.find(c => c.name === 'treatment');
        expect(treatmentCoeff).toBeDefined();
        expect(treatmentCoeff.hr).toBeLessThan(1);

        // CI should be valid
        expect(treatmentCoeff.hrLower).toBeLessThan(treatmentCoeff.hr);
        expect(treatmentCoeff.hrUpper).toBeGreaterThan(treatmentCoeff.hr);
    });

    test('4. AFT Weibull predict survival curve and area under curve', () => {
        const cox = new CoxRegressionEngine();

        // Use simpler survival data (no covariates that cause extreme separation)
        const survData = createSurvivalData(120, 42);
        const data = survData.map(d => ({
            time: d.time,
            event: d.event,
            covariates: { treatment: 0 }
        }));

        const aftModel = cox.aft(data, ['treatment'], 'weibull');

        expect(aftModel.distribution).toBe('weibull');
        expect(aftModel.sigma).toBeGreaterThan(0);

        // Predict survival for treatment=0
        const times = Array.from({ length: 25 }, (_, i) => i + 1);
        const survCurve = cox.predictSurvival(aftModel, { treatment: 0 }, times);

        expect(survCurve.length).toBe(25);
        // Survival should start near 1 and decrease
        expect(survCurve[0].survival).toBeGreaterThan(0.5);
        expect(survCurve[survCurve.length - 1].survival).toBeLessThan(survCurve[0].survival);

        // Approximate area under curve (trapezoidal rule) = restricted mean survival
        let auc = 0;
        for (let i = 1; i < survCurve.length; i++) {
            const dt = survCurve[i].time - survCurve[i - 1].time;
            auc += 0.5 * (survCurve[i - 1].survival + survCurve[i].survival) * dt;
        }
        expect(auc).toBeGreaterThan(0);
        expect(auc).toBeLessThan(25); // Cannot exceed max time
    });

    test('5. Full pipeline: KM digitized then IPD then Cox then extrapolate', () => {
        const guyot = new GuyotIPDEngine();
        const cox = new CoxRegressionEngine();
        const averaging = new ModelAveragingEngine();

        // Step 1: Reconstruct IPD for treatment and control arms
        const treatmentKM = [
            { time: 0, survival: 1.0 },
            { time: 6, survival: 0.88 },
            { time: 12, survival: 0.72 },
            { time: 18, survival: 0.55 },
            { time: 24, survival: 0.40 }
        ];
        const controlKM = [
            { time: 0, survival: 1.0 },
            { time: 6, survival: 0.80 },
            { time: 12, survival: 0.58 },
            { time: 18, survival: 0.38 },
            { time: 24, survival: 0.22 }
        ];

        const twoArm = guyot.reconstructTwoArm(
            treatmentKM, controlKM, 80, 80,
            {
                treatment: [{ time: 0, nRisk: 80 }, { time: 12, nRisk: 60 }, { time: 24, nRisk: 35 }],
                control: [{ time: 0, nRisk: 80 }, { time: 12, nRisk: 48 }, { time: 24, nRisk: 20 }]
            }
        );

        expect(twoArm.ipd.length).toBe(160);
        expect(twoArm.treatment.nPatients).toBe(80);
        expect(twoArm.control.nPatients).toBe(80);

        // Step 2: Fit Cox on combined IPD with arm as covariate
        const coxData = twoArm.ipd.map(p => ({
            time: p.time,
            event: p.event,
            covariates: { treatment: p.arm === 'treatment' ? 1 : 0 }
        }));

        const coxModel = cox.coxPH(coxData, ['treatment']);
        expect(coxModel.converged).toBe(true);

        // Treatment arm should have better survival (HR < 1)
        const hr = coxModel.coefficients[0].hr;
        expect(hr).toBeLessThan(1);

        // Step 3: Extrapolate survival using model averaging
        const survData = twoArm.ipd.filter(p => p.arm === 'treatment').map(p => ({
            time: p.time,
            event: p.event
        }));

        const fitResults = averaging.fitCompare(survData, ['weibull', 'lognormal', 'loglogistic', 'exponential']);
        const validFits = fitResults.filter(f => isFinite(f.aic) && f.params);
        expect(validFits.length).toBeGreaterThanOrEqual(2);

        // Step 4: Model-averaged extrapolation beyond observed data
        const extrapolationTimes = [0, 6, 12, 18, 24, 30, 36, 42, 48];
        const prediction = averaging.survivalPrediction(
            validFits.filter(f => f.params).map(f => ({
                name: f.name,
                distribution: f.name,
                params: f.params,
                weight: f.weight
            })),
            extrapolationTimes
        );

        expect(prediction.survival.length).toBe(9);
        // Extrapolated survival at t=48 should be < survival at t=24
        const s24 = prediction.survival[extrapolationTimes.indexOf(24)];
        const s48 = prediction.survival[extrapolationTimes.indexOf(48)];
        expect(s48).toBeLessThan(s24);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 3: Regulatory Submission
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 3: Regulatory Submission', () => {

    test('1. Meta-analysis results then GRADE assessment then NICE STA template', () => {
        const grade = new GRADEAutomationEngine();
        const regulatory = new RegulatoryTemplateEngine();

        // Simulated meta-analysis results
        const maResults = {
            estimate: 0.75,
            ci95: { lower: 0.60, upper: 0.94 },
            measure: 'RR',
            I2: 35,
            tau2: 0.02,
            nStudies: 8,
            nParticipants: 3200,
            eggerP: 0.45,
            controlRate: 0.2
        };

        // GRADE assessment
        const gradeAssessment = grade.assessEvidence(maResults, {
            outcomes: [{ name: 'Mortality', importance: 'critical', direction: 'beneficial' }]
        });

        expect(gradeAssessment.evidenceProfile).toBeDefined();
        expect(gradeAssessment.evidenceProfile.length).toBe(1);
        expect(gradeAssessment.evidenceProfile[0].overallCertainty).toBeDefined();
        expect(gradeAssessment.summaryOfFindings).toBeDefined();

        // The GRADE profile should show the correct certainty level
        const ep = gradeAssessment.evidenceProfile[0];
        expect(['High', 'Moderate', 'Low', 'Very low']).toContain(ep.overallCertainty);

        // Generate NICE STA from results + GRADE
        const niceSTA = regulatory.generateNICESTA({
            metaAnalysis: {
                pooledEffects: [{ name: 'Mortality', estimate: 0.75, ci: '0.60-0.94', measure: 'RR' }],
                I2: 35,
                tau2: 0.02
            },
            costEffectiveness: {
                baseCase: { icer: 25000, totalCosts: 15000, totalQalys: 6.2 }
            },
            budgetImpact: {
                netBudgetImpact: 5000000,
                yearlyBudget: [
                    { year: 1, cost: 1000000 },
                    { year: 2, cost: 1500000 },
                    { year: 3, cost: 2500000 }
                ]
            }
        }, {
            meta: {
                intervention: 'Drug X',
                diseaseContext: 'Non-small cell lung cancer',
                population: 'Adults with advanced NSCLC'
            }
        });

        expect(niceSTA.agency).toBe('NICE');
        expect(niceSTA.sectionA.intervention).toBe('Drug X');
        expect(niceSTA.sectionB.clinicalResults.heterogeneity.I2).toBe(35);
        expect(niceSTA.sectionC.baseCase.icer).toBe(25000);
        expect(niceSTA.sectionD.netBudgetImpact).toBe(5000000);
    });

    test('2. GRADE evidence profile feeds into regulatory section B', () => {
        const grade = new GRADEAutomationEngine();
        const regulatory = new RegulatoryTemplateEngine();

        const gradeResult = grade.assessEvidence({
            estimate: 0.65,
            ci95: { lower: 0.45, upper: 0.95 },
            measure: 'HR',
            I2: 60,
            nStudies: 5,
            nParticipants: 1500
        }, {
            outcomes: [
                { name: 'Overall Survival', importance: 'critical' },
                { name: 'Progression-Free Survival', importance: 'important' }
            ]
        });

        expect(gradeResult.evidenceProfile.length).toBe(2);

        // Use GRADE output to populate the regulatory template
        const niceSTA = regulatory.generateNICESTA({
            metaAnalysis: {
                pooledEffects: gradeResult.evidenceProfile.map(ep => ({
                    name: ep.outcome,
                    certainty: ep.overallCertainty
                })),
                I2: 60
            }
        });

        expect(niceSTA.sectionB.clinicalResults.pooledEffects.length).toBe(2);
        expect(niceSTA.sectionB.clinicalResults.heterogeneity.I2).toBe(60);
    });

    test('3. Generate all 5 agency templates from same results', () => {
        const regulatory = new RegulatoryTemplateEngine();

        const analysisResults = {
            intervention: 'Drug Y',
            comparators: ['Placebo', 'SOC'],
            costEffectiveness: {
                baseCase: { icer: 35000, totalCosts: 20000, totalQalys: 5.8 }
            },
            budgetImpact: {
                eligiblePopulation: 10000,
                netBudgetImpact: 8000000
            }
        };

        const nice = regulatory.generateNICESTA(analysisResults);
        const cadth = regulatory.generateCADTH(analysisResults);
        const eunet = regulatory.generateEUnetHTA(analysisResults);
        const pbac = regulatory.generatePBAC(analysisResults);
        const gba = regulatory.generateGBA(analysisResults);

        // Each template should have correct agency
        expect(nice.agency).toBe('NICE');
        expect(cadth.agency).toBe('CADTH');
        expect(eunet.agency).toBe('EUnetHTA');
        expect(pbac.agency).toBe('PBAC');
        expect(gba.agency).toBe('GBA');

        // Each should extract the ICER
        expect(nice.sectionC.baseCase.icer).toBe(35000);
        expect(cadth.executiveSummary.economicSummary.icer).toBe(35000);
    });

    test('4. GRADE + CINeMA for NMA feeds into regulatory NMA section', () => {
        const grade = new GRADEAutomationEngine();
        const regulatory = new RegulatoryTemplateEngine();

        const nmaResults = {
            I2: 45,
            tau2: 0.05,
            nStudies: 12,
            consistency: { p: 0.08 },
            rankings: [
                { treatment: 'A', sucra: 0.82 },
                { treatment: 'B', sucra: 0.65 },
                { treatment: 'C', sucra: 0.43 }
            ]
        };

        // CINeMA assessment for NMA
        const cinema = grade.generateCINEMA(nmaResults);

        expect(cinema.framework).toBe('CINeMA');
        expect(cinema.domains.heterogeneity).toBeDefined();
        expect(cinema.domains.incoherence).toBeDefined();
        expect(cinema.overallConfidence).toBeDefined();
        expect(['High', 'Moderate', 'Low', 'Very low']).toContain(cinema.overallConfidence);

        // Feed NMA into NICE STA
        const niceSTA = regulatory.generateNICESTA({
            nmaResults: {
                network: { nodes: 3, edges: 12 },
                rankings: nmaResults.rankings,
                consistency: nmaResults.consistency
            }
        });

        expect(niceSTA.sectionB.nmaResults.available).toBe(true);
        expect(niceSTA.sectionB.nmaResults.rankings.length).toBe(3);
    });

    test('5. Export NICE STA as Markdown contains all required sections', () => {
        const regulatory = new RegulatoryTemplateEngine();

        const niceSTA = regulatory.generateNICESTA({
            intervention: 'Drug Z',
            costEffectiveness: {
                modelStructure: 'Partitioned survival',
                baseCase: { icer: 28000, totalCosts: 18000, totalQalys: 5.5 }
            },
            budgetImpact: {
                netBudgetImpact: 3000000,
                yearlyBudget: [{ year: 1, cost: 1000000 }]
            }
        }, {
            meta: {
                diseaseContext: 'Breast cancer',
                population: 'HER2+ metastatic breast cancer'
            }
        });

        const markdown = regulatory.exportAsMarkdown(niceSTA);

        expect(typeof markdown).toBe('string');
        expect(markdown.length).toBeGreaterThan(100);
        // Should contain key sections
        expect(markdown).toContain('NICE');
        expect(markdown).toContain('Decision Problem');
        expect(markdown).toContain('Clinical Effectiveness');
        expect(markdown).toContain('Cost-effectiveness');
        expect(markdown).toContain('Budget Impact');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 4: Living HTA + Decision Impact
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 4: Living HTA + Decision Impact', () => {

    test('1. Create monitor, check for updates, apply, recalculate expected loss', () => {
        const living = new LivingHTAEngine({ seed: 42 });
        const expectedLoss = new ExpectedLossEngine();

        // Create monitor
        const monitor = living.createMonitor({
            query: { condition: 'diabetes', intervention: 'SGLT2 inhibitor' },
            sources: ['clinicaltrials', 'pubmed'],
            currentEvidence: {
                studies: [
                    { id: 'S1', yi: -0.3, vi: 0.04 },
                    { id: 'S2', yi: -0.2, vi: 0.05 }
                ],
                pooledEffect: -0.25,
                heterogeneity: { I2: 20, tau2: 0.01 }
            },
            thresholds: { clinicalSignificance: 0.05, monitoringMethod: 'obrienFleming' }
        });

        expect(monitor.monitorId).toBeDefined();
        expect(monitor.status).toBe('active');

        // Check for updates
        const report = living.checkForUpdates(monitor, {
            newStudies: [
                { id: 'S3', title: 'SGLT2 inhibitor for diabetes - RCT', status: 'Completed', yi: -0.35, vi: 0.03 }
            ]
        });

        expect(report.newStudies.length).toBe(1);
        expect(report.recommendation).toBeDefined();

        // Apply update
        const updateResult = living.applyUpdate(monitor, [
            { id: 'S3', yi: -0.35, vi: 0.03 }
        ]);

        expect(updateResult.nStudiesTotal).toBe(3);
        expect(updateResult.updatedEvidence.pooledEffect).toBeDefined();
        expect(typeof updateResult.updatedEvidence.pooledEffect).toBe('number');

        // Now compute expected loss with updated evidence
        const psaIter = createPSAIterations(200, 99);
        const elResult = expectedLoss.compute(psaIter, ['A', 'B'], [0, 25000, 50000, 75000, 100000]);

        expect(elResult.curves.length).toBe(5);
        expect(elResult.minimumLoss).toBeGreaterThanOrEqual(0);
    });

    test('2. Living update changes ICER, decision impact assessed', () => {
        const living = new LivingHTAEngine({ seed: 123 });

        const monitor = living.createMonitor({
            query: { condition: 'oncology', intervention: 'checkpoint inhibitor' },
            currentEvidence: {
                studies: [
                    { id: 'T1', yi: 0.4, vi: 0.03 },
                    { id: 'T2', yi: 0.5, vi: 0.04 }
                ],
                pooledEffect: 0.45,
                heterogeneity: { I2: 10, tau2: 0.005 }
            }
        });

        // Large positive study shifts pooled effect
        const updateResult = living.applyUpdate(monitor, [
            { id: 'T3', yi: 0.7, vi: 0.02 },
            { id: 'T4', yi: 0.6, vi: 0.03 }
        ]);

        expect(updateResult.nStudiesTotal).toBe(4);

        // Assess impact on decision
        const impact = living.assessImpactOnDecision(updateResult, {
            currentICER: 45000,
            wtp: 50000,
            currentDecision: 'adopt'
        });

        expect(impact).toBeDefined();
        expect(typeof impact.newICER).toBe('number');
        expect(typeof impact.icerChange).toBe('number');
        expect(['high', 'medium', 'low']).toContain(impact.urgency);
        expect(impact.previousDecision).toBe('adopt');
    });

    test('3. Expected loss <= EVPI comparison', () => {
        const expectedLoss = new ExpectedLossEngine();

        const psaIter = createPSAIterations(300, 55);
        const wtpRange = [0, 20000, 40000, 60000, 80000, 100000];

        const elResult = expectedLoss.compute(psaIter, ['A', 'B'], wtpRange);

        // Get information value comparison
        const ivComparison = expectedLoss.informationValue(elResult);

        expect(ivComparison.curves.length).toBe(wtpRange.length);

        // Expected loss IS the EVPI in this engine's formulation
        // So ratio should be ~1 when no external EVPI is provided
        for (const c of ivComparison.curves) {
            expect(c.expectedLoss).toBeGreaterThanOrEqual(0);
            expect(c.evpi).toBeGreaterThanOrEqual(0);
            // expectedLoss <= evpi (with numerical tolerance)
            expect(c.expectedLoss).toBeLessThanOrEqual(c.evpi + 1e-6);
        }
    });

    test('4. Sequential updates accumulate evidence correctly', () => {
        const living = new LivingHTAEngine({ seed: 77 });

        const monitor = living.createMonitor({
            query: { condition: 'heart failure', intervention: 'sacubitril' },
            currentEvidence: {
                studies: [{ id: 'HF1', yi: -0.2, vi: 0.05 }],
                pooledEffect: -0.2,
                heterogeneity: { I2: 0, tau2: 0 }
            }
        });

        // First update
        const update1 = living.applyUpdate(monitor, [
            { id: 'HF2', yi: -0.3, vi: 0.04 }
        ]);
        expect(update1.nStudiesTotal).toBe(2);

        // Second update
        const update2 = living.applyUpdate(monitor, [
            { id: 'HF3', yi: -0.25, vi: 0.03 },
            { id: 'HF4', yi: -0.35, vi: 0.04 }
        ]);
        expect(update2.nStudiesTotal).toBe(4);

        // Evidence should accumulate
        expect(monitor.currentEvidence.studies.length).toBe(4);
        expect(monitor.history.length).toBeGreaterThanOrEqual(2);

        // Check the history has both updates
        const updates = monitor.history.filter(h => h.type === 'update');
        expect(updates.length).toBe(2);
    });

    test('5. Alert triggered when conclusion reverses', () => {
        const living = new LivingHTAEngine({ seed: 200 });

        // Start with negative evidence (harmful conclusion without SE)
        const monitor = living.createMonitor({
            query: { condition: 'COPD', intervention: 'new bronchodilator' },
            currentEvidence: {
                studies: [{ id: 'C1', yi: -0.3, vi: 0.5 }],
                pooledEffect: -0.3,
                heterogeneity: { I2: 0, tau2: 0 }
            },
            thresholds: { clinicalSignificance: 0.1, statisticalAlpha: 0.05 }
        });

        // Add strong positive evidence that shifts conclusion from "harmful" to "effective"
        const update = living.applyUpdate(monitor, [
            { id: 'C2', yi: 0.8, vi: 0.02 },
            { id: 'C3', yi: 0.7, vi: 0.02 },
            { id: 'C4', yi: 0.9, vi: 0.02 },
            { id: 'C5', yi: 0.85, vi: 0.02 }
        ]);

        // Conclusion should have changed from harmful to effective
        expect(update.conclusionChanged).toBe(true);
        expect(update.previousConclusion).toBe('harmful');
        expect(update.newConclusion).toBe('effective');

        // Alert should exist
        expect(update.alert).not.toBeNull();
        expect(update.alert.severity).toBe('high');
        expect(update.alert.message).toContain('reversed');

        // Monitor should have the alert recorded
        expect(monitor.alerts.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 5: Complete HTA Dossier Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 5: Complete HTA Dossier Pipeline', () => {

    test('1. Meta-analysis then GRADE then Markov then BIA then NICE STA', () => {
        const grade = new GRADEAutomationEngine();
        const engine = new MarkovEngine({ logger: silentLogger });
        const bia = new BudgetImpactEngine();
        const regulatory = new RegulatoryTemplateEngine();

        // Step 1: Meta-analysis results (simulated)
        const maResults = {
            estimate: 0.72,
            ci95: { lower: 0.58, upper: 0.89 },
            measure: 'RR',
            I2: 30,
            nStudies: 6,
            nParticipants: 2500,
            controlRate: 0.15
        };

        // Step 2: GRADE assessment
        const gradeResult = grade.assessEvidence(maResults);
        expect(gradeResult.evidenceProfile.length).toBeGreaterThanOrEqual(1);

        // Step 3: Run Markov model
        const project = createMarkovProject();
        const markovResult = engine.run(project);
        expect(markovResult.total_costs).toBeGreaterThan(0);
        expect(markovResult.total_qalys).toBeGreaterThan(0);

        // Step 4: Run BIA
        const biaResult = bia.run(createBIAConfig());
        expect(biaResult.netBudgetImpact).toBeDefined();

        // Step 5: Generate NICE STA combining everything
        const niceSTA = regulatory.generateNICESTA({
            metaAnalysis: {
                pooledEffects: [{ name: 'Primary', estimate: maResults.estimate }],
                I2: maResults.I2
            },
            costEffectiveness: {
                baseCase: {
                    icer: markovResult.total_costs / markovResult.total_qalys,
                    totalCosts: markovResult.total_costs,
                    totalQalys: markovResult.total_qalys
                }
            },
            budgetImpact: {
                netBudgetImpact: biaResult.netBudgetImpact,
                yearlyBudget: biaResult.yearlyBudget
            }
        });

        expect(niceSTA.agency).toBe('NICE');
        expect(niceSTA.sectionB.clinicalResults.pooledEffects.length).toBe(1);
        expect(niceSTA.sectionC.baseCase.totalCosts).toBe(markovResult.total_costs);
        expect(niceSTA.sectionD.netBudgetImpact).toBe(biaResult.netBudgetImpact);
    });

    test('2. Guyot then Cox then survival extrapolation then partitioned survival', () => {
        const guyot = new GuyotIPDEngine();
        const cox = new CoxRegressionEngine();
        const averaging = new ModelAveragingEngine();

        // Step 1: Reconstruct IPD
        const reconstruction = guyot.reconstruct(createKMPoints(), createNRiskTable(), 100);
        expect(reconstruction.ipd.length).toBe(100);

        // Step 2: Add covariate and fit Cox
        const rng = new PCG32(88);
        const coxData = reconstruction.ipd.map(p => ({
            time: p.time,
            event: p.event,
            covariates: { treatment: rng.nextFloat() < 0.5 ? 1 : 0 }
        }));
        const coxModel = cox.coxPH(coxData, ['treatment']);
        expect(coxModel.converged).toBe(true);

        // Step 3: Fit parametric distributions
        const survData = reconstruction.ipd.map(p => ({ time: p.time, event: p.event }));
        const fitResults = averaging.fitCompare(survData, ['weibull', 'lognormal', 'exponential']);
        const validFits = fitResults.filter(f => isFinite(f.aic) && f.params);
        expect(validFits.length).toBeGreaterThanOrEqual(2);

        // Step 4: Model-averaged survival extrapolation
        const longTermTimes = Array.from({ length: 10 }, (_, i) => i * 6);
        const prediction = averaging.survivalPrediction(
            validFits.map(f => ({
                name: f.name, distribution: f.name, params: f.params, weight: f.weight
            })),
            longTermTimes
        );

        // Partitioned survival: area under curve = QALYs (simplified)
        let totalQALYs = 0;
        for (let i = 1; i < prediction.survival.length; i++) {
            const dt = (longTermTimes[i] - longTermTimes[i - 1]) / 12; // Convert months to years
            totalQALYs += 0.5 * (prediction.survival[i - 1] + prediction.survival[i]) * dt;
        }

        expect(totalQALYs).toBeGreaterThan(0);
        expect(totalQALYs).toBeLessThan(10); // Reasonable range for cancer survival
    });

    test('3. Country profile then model then threshold check then affordability', () => {
        const lib = new CountryProfileLibrary();
        const engine = new MarkovEngine({ logger: silentLogger });
        const bia = new BudgetImpactEngine();

        // Apply UK profile
        const config = lib.applyProfile('uk', {});
        expect(config.wtpPerQaly).toBe(30000);

        // Run model
        const project = createMarkovProject({
            settings: {
                discount_rate_costs: config.discountRateCosts,
                discount_rate_qalys: config.discountRateOutcomes
            }
        });
        const result = engine.run(project);

        // Compute cost/QALY
        const costPerQaly = result.total_costs / result.total_qalys;

        // Threshold check: is the intervention cost-effective at UK WTP?
        const isCostEffective = costPerQaly <= config.wtpPerQaly;
        expect(typeof isCostEffective).toBe('boolean');

        // Affordability: run BIA with UK discount rate
        const biaResult = bia.run(createBIAConfig({ discountRate: config.discountRateCosts }));
        expect(biaResult.netBudgetImpact).toBeDefined();
        expect(typeof biaResult.netBudgetImpact).toBe('number');

        // Currency conversion for reporting
        const conversion = lib.getCurrencyConversion('GBP', 'USD', biaResult.netBudgetImpact);
        expect(conversion.converted).toBeDefined();
        expect(conversion.from).toBe('GBP');
        expect(conversion.to).toBe('USD');
    });

    test('4. Expected loss then EVSI then research recommendation', () => {
        const expectedLoss = new ExpectedLossEngine();
        const evsi = new EVSIEngine({ seed: 42, nOuter: 500, nInner: 200 });

        // Step 1: Compute expected loss
        const psaIter = createPSAIterations(200, 42);
        const wtpRange = [0, 25000, 50000, 75000, 100000];
        const elResult = expectedLoss.compute(psaIter, ['A', 'B'], wtpRange);

        expect(elResult.curves.length).toBe(5);
        expect(elResult.minimumLoss).toBeGreaterThanOrEqual(0);

        // Step 2: Compute EVSI for proposed study
        const psaForEVSI = createPSAResultsForEVSI(200, 42);
        const evsiResult = evsi.compute(psaForEVSI, {
            sampleSize: 200,
            parameter: 'p_response',
            dataModel: 'binomial',
            type: 'rct'
        });

        expect(evsiResult.evsi).toBeGreaterThanOrEqual(0);
        expect(evsiResult.evppi).toBeGreaterThanOrEqual(0);
        // EVSI should not exceed EVPPI
        expect(evsiResult.evsi).toBeLessThanOrEqual(evsiResult.evppi + 1e-6);

        // Step 3: Research recommendation
        // If EVSI > cost of study, research is worthwhile
        const studyCost = 500000;
        const populationSize = 10000;
        const popScaledEVSI = evsiResult.evsi * populationSize;
        const researchWorthwhile = popScaledEVSI > studyCost;
        expect(typeof researchWorthwhile).toBe('boolean');

        // Also check expected loss at WTP=50K
        const el50K = elResult.curves.find(c => c.wtp === 50000);
        expect(el50K).toBeDefined();
        expect(el50K.expectedLoss).toBeGreaterThanOrEqual(0);
        expect(el50K.optimalStrategy).toBeDefined();
    });
});
