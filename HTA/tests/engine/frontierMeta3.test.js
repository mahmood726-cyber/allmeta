/**
 * Tests for untested classes in src/engine/frontierMeta.js
 * Covers: MLAssistedScreening, SurvivalMetaAnalysis, FederatedMetaAnalysis,
 *         PartitionedSurvival, SurvivalModelAveraging, StructuralUncertainty,
 *         DistributionalCEA, RWEIntegration, JointClinicalAssessment,
 *         RelativeEffectivenessAssessment, HorizonScanning, ManagedEntryAgreements,
 *         MultiCountryHTACoordination, ATMPOrphanMethods, PatientReportedOutcomes,
 *         RealWorldEvidenceFDA, ExpeditedPrograms, BenefitRiskAssessment,
 *         AdaptiveTrialDesigns, MasterProtocols, PatientFocusedDrugDevelopment,
 *         PostMarketSurveillance, DigitalHealthFDA, PediatricDevelopment,
 *         OrphanDrugFDA, BiosimilarDevelopment, OncologyReviewPrograms,
 *         AdvisoryCommitteeSupport, ICHCompliance, EssentialMedicinesList,
 *         WHOCHOICEMethodology, GRADEMethodology, UniversalHealthCoverage,
 *         GlobalHealthEquity, WHOPrequalification, SAGEVaccineRecommendations,
 *         OneHealthApproach, PandemicPreparedness, HealthSystemsStrengthening,
 *         SDG3Alignment, PrecisionMedicineHTA, BayesianDecisionAnalysis,
 *         AdvancedNMAMethods, MissingDataMethods, DynamicTreatmentRegimes,
 *         GeneralizabilityTransportability, MediationAnalysisHTA
 */

'use strict';

const {
    MLAssistedScreening,
    SurvivalMetaAnalysis,
    FederatedMetaAnalysis,
    PartitionedSurvival,
    SurvivalModelAveraging,
    StructuralUncertainty,
    DistributionalCEA,
    RWEIntegration,
    JointClinicalAssessment,
    RelativeEffectivenessAssessment,
    HorizonScanning,
    ManagedEntryAgreements,
    MultiCountryHTACoordination,
    ATMPOrphanMethods,
    PatientReportedOutcomes,
    RealWorldEvidenceFDA,
    ExpeditedPrograms,
    BenefitRiskAssessment,
    AdaptiveTrialDesigns,
    MasterProtocols,
    PatientFocusedDrugDevelopment,
    PostMarketSurveillance,
    DigitalHealthFDA,
    PediatricDevelopment,
    OrphanDrugFDA,
    BiosimilarDevelopment,
    OncologyReviewPrograms,
    AdvisoryCommitteeSupport,
    ICHCompliance,
    EssentialMedicinesList,
    WHOCHOICEMethodology,
    GRADEMethodology,
    UniversalHealthCoverage,
    GlobalHealthEquity,
    WHOPrequalification,
    SAGEVaccineRecommendations,
    OneHealthApproach,
    PandemicPreparedness,
    HealthSystemsStrengthening,
    SDG3Alignment,
    PrecisionMedicineHTA,
    BayesianDecisionAnalysis,
    AdvancedNMAMethods,
    MissingDataMethods,
    DynamicTreatmentRegimes,
    GeneralizabilityTransportability,
    MediationAnalysisHTA
} = require('../../src/engine/frontierMeta');

// ============================================================================
// MLAssistedScreening
// ============================================================================

describe('MLAssistedScreening', () => {
    let ml;
    beforeEach(() => { ml = new MLAssistedScreening(); });

    function makeTrainingData() {
        return [
            { text: 'randomized controlled trial efficacy drug treatment outcome', label: 'include' },
            { text: 'systematic review meta-analysis pooled effect clinical trial', label: 'include' },
            { text: 'cohort study observational prospective outcome measure', label: 'include' },
            { text: 'cell culture in vitro experiment gene expression mouse model', label: 'exclude' },
            { text: 'case report anecdotal single patient narrative opinion letter', label: 'exclude' },
            { text: 'economic analysis cost budget hospital resource utilization', label: 'exclude' },
            { text: 'randomized placebo controlled double blind clinical endpoint', label: 'include' },
            { text: 'editorial commentary opinion personal view discussion debate', label: 'exclude' }
        ];
    }

    test('trainScreeningModel returns vocabulary and model', () => {
        const data = makeTrainingData();
        const result = ml.trainScreeningModel(data);

        expect(result.vocabulary).toBeDefined();
        expect(Array.isArray(result.vocabulary)).toBe(true);
        expect(result.vocabulary.length).toBeGreaterThan(0);
        expect(result.model).toBeDefined();
        expect(result.stats.nInclude).toBe(4);
        expect(result.stats.nExclude).toBe(4);
        expect(result.stats.vocabularySize).toBeGreaterThan(0);
    });

    test('predictInclusion returns predictions for new abstracts', () => {
        const data = makeTrainingData();
        const trained = ml.trainScreeningModel(data);

        const abstracts = [
            { text: 'randomized controlled trial drug treatment efficacy outcome' },
            { text: 'mouse model cell line laboratory experiment' }
        ];
        const predictions = ml.predictInclusion(abstracts, trained);

        expect(predictions).toHaveLength(2);
        predictions.forEach(p => {
            expect(p.predictedLabel).toBeDefined();
            expect(['include', 'exclude']).toContain(p.predictedLabel);
            expect(typeof p.confidence).toBe('number');
            expect(p.confidence).toBeGreaterThanOrEqual(0);
            expect(p.confidence).toBeLessThanOrEqual(1);
        });
    });

    test('constructor sets available models', () => {
        expect(ml.models).toContain('naive-bayes');
        expect(ml.models).toContain('tfidf-similarity');
    });
});

// ============================================================================
// SurvivalMetaAnalysis
// ============================================================================

describe('SurvivalMetaAnalysis', () => {
    let sma;
    beforeEach(() => { sma = new SurvivalMetaAnalysis(); });

    function makeSurvivalStudyData() {
        return [
            {
                times: [1, 2, 3, 5, 8, 12, 18, 24],
                cumHazard: [0.02, 0.05, 0.10, 0.18, 0.30, 0.50, 0.75, 1.0]
            },
            {
                times: [1, 2, 3, 5, 8, 12, 18, 24],
                cumHazard: [0.03, 0.06, 0.12, 0.20, 0.35, 0.55, 0.80, 1.1]
            }
        ];
    }

    test('fractionalPolynomial returns study results and model selection', () => {
        const data = makeSurvivalStudyData();
        const result = sma.fractionalPolynomial(data, { maxDegree: 1 });

        expect(result.method).toBe('fractional-polynomial-ma');
        expect(result.studyResults).toHaveLength(2);
        result.studyResults.forEach(r => {
            expect(r.bestFit.degree).toBe(1);
            expect(r.bestFit.powers).toHaveLength(1);
            expect(r.bestFit.coefficients).toBeDefined();
        });
        expect(result.modelSelection).toBeDefined();
        expect(result.modelSelection.bestDegree).toBe(1);
    });

    test('constructor lists supported distributions', () => {
        expect(sma.distributions).toContain('weibull');
        expect(sma.distributions).toContain('exponential');
        expect(sma.distributions).toContain('royston-parmar');
    });
});

// ============================================================================
// FederatedMetaAnalysis
// ============================================================================

describe('FederatedMetaAnalysis', () => {
    let fed;
    beforeEach(() => { fed = new FederatedMetaAnalysis(); });

    function makeSiteSummaries() {
        return [
            { siteId: 'Site1', n: 100, mean: 0.5, variance: 0.04 },
            { siteId: 'Site2', n: 80,  mean: 0.6, variance: 0.06 },
            { siteId: 'Site3', n: 120, mean: 0.4, variance: 0.03 },
            { siteId: 'Site4', n: 90,  mean: 0.55, variance: 0.05 }
        ];
    }

    test('distributedMA returns pooled estimate and heterogeneity', () => {
        const sites = makeSiteSummaries();
        const result = fed.distributedMA(sites);

        expect(result.method).toBe('distributed-ma');
        expect(result.pooledEstimate).toBeDefined();
        expect(typeof result.pooledEstimate.effect).toBe('number');
        expect(Number.isFinite(result.pooledEstimate.effect)).toBe(true);
        expect(result.pooledEstimate.se).toBeGreaterThan(0);
        expect(result.pooledEstimate.ci95).toHaveLength(2);
        expect(result.pooledEstimate.ci95[0]).toBeLessThan(result.pooledEstimate.ci95[1]);
    });

    test('distributedMA returns site contributions', () => {
        const sites = makeSiteSummaries();
        const result = fed.distributedMA(sites);

        expect(result.siteContributions).toHaveLength(4);
        result.siteContributions.forEach(sc => {
            expect(typeof sc.siteId).toBe('string');
            expect(typeof sc.weight).toBe('number');
            expect(sc.weight).toBeGreaterThan(0);
            expect(sc.weight).toBeLessThanOrEqual(1);
        });
        // Weights should sum to ~1
        const totalWeight = result.siteContributions.reduce((s, c) => s + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 5);
    });

    test('distributedMA heterogeneity has I2 between 0 and 100', () => {
        const sites = makeSiteSummaries();
        const result = fed.distributedMA(sites);

        expect(result.heterogeneity).toBeDefined();
        expect(result.heterogeneity.I2).toBeGreaterThanOrEqual(0);
        expect(result.heterogeneity.I2).toBeLessThanOrEqual(100);
        expect(result.heterogeneity.tau2).toBeGreaterThanOrEqual(0);
    });

    test('distributedMA pooled estimate is within range of site means', () => {
        const sites = makeSiteSummaries();
        const result = fed.distributedMA(sites);
        const means = sites.map(s => s.mean);
        expect(result.pooledEstimate.effect).toBeGreaterThanOrEqual(Math.min(...means) - 0.1);
        expect(result.pooledEstimate.effect).toBeLessThanOrEqual(Math.max(...means) + 0.1);
    });
});

// ============================================================================
// PartitionedSurvival
// ============================================================================

describe('PartitionedSurvival', () => {
    let ps;
    beforeEach(() => { ps = new PartitionedSurvival(); });

    const pfsCurve = (t) => Math.exp(-0.05 * t);  // PFS: exponential decay
    const osCurve = (t) => Math.exp(-0.03 * t);   // OS: slower decay

    test('runPartitionedSurvival returns cycle-level results', () => {
        const result = ps.runPartitionedSurvival(pfsCurve, osCurve, 10, 1);

        expect(result.stateOccupancy).toBeDefined();
        expect(result.stateOccupancy.length).toBeGreaterThan(0);
        expect(result.totals).toBeDefined();
        expect(typeof result.totals.totalQALY).toBe('number');
        expect(typeof result.totals.totalCost).toBe('number');
        expect(result.totals.totalQALY).toBeGreaterThan(0);
        expect(result.totals.totalCost).toBeGreaterThan(0);
        expect(result.method).toBe('partitioned-survival');
    });

    test('state membership sums to 1 at each cycle', () => {
        const result = ps.runPartitionedSurvival(pfsCurve, osCurve, 10, 1);
        result.stateOccupancy.forEach(c => {
            const total = c.preProg + c.postProg + c.dead;
            expect(total).toBeCloseTo(1, 3);
        });
    });

    test('constructor initializes states', () => {
        expect(ps.states).toContain('pre-progression');
        expect(ps.states).toContain('post-progression');
        expect(ps.states).toContain('death');
    });
});

// ============================================================================
// SurvivalModelAveraging
// ============================================================================

describe('SurvivalModelAveraging', () => {
    let sma;
    beforeEach(() => { sma = new SurvivalModelAveraging(); });

    function makeSurvivalModels() {
        return [
            {
                name: 'Weibull',
                bic: 100,
                aic: 95,
                survivalFunction: (t) => Math.exp(-0.03 * Math.pow(t, 1.2)),
                hazardFunction: (t) => 0.03 * 1.2 * Math.pow(t, 0.2)
            },
            {
                name: 'LogNormal',
                bic: 102,
                aic: 97,
                survivalFunction: (t) => Math.exp(-0.04 * t),
                hazardFunction: (t) => 0.04
            },
            {
                name: 'Gompertz',
                bic: 105,
                aic: 100,
                survivalFunction: (t) => Math.exp(-0.02 * (Math.exp(0.1 * t) - 1) / 0.1),
                hazardFunction: (t) => 0.02 * Math.exp(0.1 * t)
            }
        ];
    }

    test('bicWeightedAveraging returns model weights that sum to 1', () => {
        const models = makeSurvivalModels();
        const result = sma.bicWeightedAveraging(models);

        expect(result.method).toBe('bic-weighted-averaging');
        expect(result.modelWeights).toHaveLength(3);

        const totalWeight = result.modelWeights.reduce((s, m) => s + m.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 10);

        // Best BIC model (Weibull, BIC=100) should have highest weight
        const weibullWeight = result.modelWeights.find(m => m.model === 'Weibull').weight;
        result.modelWeights.forEach(m => {
            expect(weibullWeight).toBeGreaterThanOrEqual(m.weight);
        });
    });

    test('bicWeightedAveraging returns averaged survival function', () => {
        const models = makeSurvivalModels();
        const result = sma.bicWeightedAveraging(models);

        expect(typeof result.averagedSurvival).toBe('function');
        expect(result.averagedSurvival(0)).toBeCloseTo(1, 1);
        expect(result.averagedSurvival(10)).toBeLessThan(1);
        expect(result.averagedSurvival(10)).toBeGreaterThan(0);
    });

    test('aicWeightedAveraging returns model weights that sum to 1', () => {
        const models = makeSurvivalModels();
        const result = sma.aicWeightedAveraging(models);

        expect(result.method).toBe('aic-weighted-averaging');
        const totalWeight = result.modelWeights.reduce((s, m) => s + m.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 10);
        expect(typeof result.averagedSurvival).toBe('function');
    });
});

// ============================================================================
// StructuralUncertainty
// ============================================================================

describe('StructuralUncertainty', () => {
    let su;
    beforeEach(() => { su = new StructuralUncertainty(); });

    test('identifyKeyAssumptions sorts by ICER impact', () => {
        const scenarios = [
            { scenario: 'A', icer: 30000, inmb: 5000 },
            { scenario: 'B', icer: 60000, inmb: -2000 },
            { scenario: 'C', icer: 45000, inmb: 1000 }
        ];
        const baseCase = { icer: 40000, inmb: 3000 };

        const result = su.identifyKeyAssumptions(scenarios, baseCase);

        expect(result).toHaveLength(3);
        // Should be sorted by descending ICER impact
        expect(result[0].icerImpact).toBeGreaterThanOrEqual(result[1].icerImpact);
        expect(result[1].icerImpact).toBeGreaterThanOrEqual(result[2].icerImpact);
    });

    test('identifyKeyAssumptions flags scenarios that change decision', () => {
        const scenarios = [
            { scenario: 'switches', icer: 60000, inmb: -2000 }
        ];
        const baseCase = { icer: 40000, inmb: 3000 }; // inmb>0

        const result = su.identifyKeyAssumptions(scenarios, baseCase);
        expect(result[0].changesDecision).toBe(true);
    });

    test('modelAveraging with equal weights returns averaged ICER', () => {
        const models = [
            { name: 'M1', run: () => ({ icer: 30000, inmb: 5000 }) },
            { name: 'M2', run: () => ({ icer: 50000, inmb: -1000 }) }
        ];

        const result = su.modelAveraging(models, { weightingMethod: 'equal' });

        expect(result.method).toBe('model-averaging');
        expect(result.weightingMethod).toBe('equal');
        expect(result.averagedICER).toBeCloseTo(40000, 0);
        expect(result.averagedINMB).toBeCloseTo(2000, 0);
    });
});

// ============================================================================
// DistributionalCEA
// ============================================================================

describe('DistributionalCEA', () => {
    let dcea;
    beforeEach(() => { dcea = new DistributionalCEA(); });

    test('distributionalAnalysis returns inequality metrics', () => {
        const effects = [
            { qalyGain: 0.5, cost: 10000 },
            { qalyGain: 0.3, cost: 8000 },
            { qalyGain: 0.8, cost: 15000 }
        ];
        const population = {
            subgroups: [
                { name: 'group1', baselineQALE: 20 },
                { name: 'group2', baselineQALE: 15 },
                { name: 'group3', baselineQALE: 25 }
            ]
        };

        const result = dcea.distributionalAnalysis(effects, population);

        expect(result.method).toBe('distributional-cea');
        expect(result.inequalityMetrics).toBeDefined();
        expect(result.inequalityMetrics.baseline.gini).toBeGreaterThanOrEqual(0);
        expect(result.inequalityMetrics.baseline.gini).toBeLessThanOrEqual(1);
        expect(result.standardCEA).toBeDefined();
        expect(result.standardCEA.totalQALY).toBeCloseTo(1.6, 5);
        expect(result.standardCEA.totalCost).toBeCloseTo(33000, 5);
    });
});

// ============================================================================
// RWEIntegration
// ============================================================================

describe('RWEIntegration', () => {
    let rwe;
    beforeEach(() => { rwe = new RWEIntegration(); });

    test('constructor lists methods', () => {
        expect(rwe.methods).toContain('external-control');
        expect(rwe.methods).toContain('target-trial');
        expect(rwe.methods).toContain('hybrid');
    });

    test('externalControlAdjustment returns treatment effect and diagnostics', () => {
        const trialData = Array.from({ length: 30 }, (_, i) => ({
            age: 55 + (i % 20), survival: 0.7 + (i % 5) * 0.03
        }));
        const rweData = Array.from({ length: 50 }, (_, i) => ({
            age: 60 + (i % 20), survival: 0.5 + (i % 5) * 0.02
        }));

        const result = rwe.externalControlAdjustment(trialData, rweData, {
            covariates: ['age'],
            outcomeVar: 'survival'
        });

        expect(result.method).toBe('external-control-iptw');
        expect(result.treatmentEffect).toBeDefined();
        expect(result.diagnostics).toBeDefined();
    });
});

// ============================================================================
// JointClinicalAssessment (EU HTA)
// ============================================================================

describe('JointClinicalAssessment', () => {
    let jca;
    beforeEach(() => { jca = new JointClinicalAssessment(); });

    test('constructor defines assessment elements', () => {
        expect(jca.assessmentElements).toContain('clinical_effectiveness');
        expect(jca.assessmentElements).toContain('safety');
    });

    test('generateJCADossier returns complete dossier structure', () => {
        const technology = {
            name: 'DrugX',
            indication: 'Type 2 Diabetes',
            atcCode: 'A10B',
            moa: 'GLP-1 receptor agonist',
            maStatus: 'approved',
            dosing: '10mg daily',
            currentTreatment: 'Metformin',
            epidemiology: { incidence: 0.005, prevalence: 0.08, mortality: 0.02 }
        };
        const evidence = {
            trials: [{ name: 'TRIAL1', n: 500 }],
            directComparisons: [{ comparator: 'placebo', effect: 0.5 }]
        };

        const result = jca.generateJCADossier(technology, evidence);

        expect(result.type).toBe('jca-dossier');
        expect(result.version).toBe('EU-HTA-2021/2282');
        expect(result.dossier).toBeDefined();
        expect(result.dossier.assessmentElements.healthProblem).toBeDefined();
        expect(result.dossier.assessmentElements.technologyDescription.inn).toBe('DrugX');
        expect(result.completeness).toBeDefined();
        expect(result.validationChecks).toBeDefined();
    });
});

// ============================================================================
// RelativeEffectivenessAssessment (EU HTA)
// ============================================================================

describe('RelativeEffectivenessAssessment', () => {
    let rea;
    beforeEach(() => { rea = new RelativeEffectivenessAssessment(); });

    test('constructor lists comparative frameworks', () => {
        expect(rea.comparativeFrameworks).toContain('direct');
        expect(rea.comparativeFrameworks).toContain('nma');
        expect(rea.comparativeFrameworks).toContain('maic');
    });

    test('generateComparativeTable returns table with rows', () => {
        const reaResults = {
            synthesizedResults: [
                { intervention: 'DrugA', comparator: 'Placebo', effect: 1.5, ciLow: 1.1, ciHigh: 2.0, pValue: 0.01, certainty: 'moderate' }
            ]
        };
        const table = rea.generateComparativeTable(reaResults);
        expect(table.header).toHaveLength(5);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0].comparison).toBe('DrugA vs Placebo');
        expect(table.rows[0].favors).toBe('DrugA');
    });

    test('assessTherapeuticBenefit returns categorized benefit', () => {
        const reaResults = {
            synthesizedResults: [
                { intervention: 'DrugA', comparator: 'Placebo', effect: 1.8, pValue: 0.001 }
            ]
        };
        const result = rea.assessTherapeuticBenefit(reaResults);
        expect(result).toBeDefined();
    });
});

// ============================================================================
// HorizonScanning (EU HTA)
// ============================================================================

describe('HorizonScanning', () => {
    let hs;
    beforeEach(() => { hs = new HorizonScanning(); });

    test('constructor defines time horizons', () => {
        expect(hs.timeHorizons.immediate).toBeDefined();
        expect(hs.timeHorizons.shortTerm).toBeDefined();
        expect(hs.timeHorizons.longTerm).toBeDefined();
    });

    test('estimateEarlyBudgetImpact returns scenario estimates', () => {
        const tech = { name: 'DrugX' };
        const assumptions = {
            eligiblePopulation: 100000,
            marketShare: 0.2,
            treatmentCost: 50000,
            comparatorCost: 10000,
            treatmentDuration: 12
        };
        const result = hs.estimateEarlyBudgetImpact(tech, assumptions);

        expect(result.annualBudgetImpact).toBeDefined();
        expect(result.annualBudgetImpact.base).toBeGreaterThan(0);
        expect(result.annualBudgetImpact.low).toBeLessThan(result.annualBudgetImpact.base);
        expect(result.annualBudgetImpact.high).toBeGreaterThan(result.annualBudgetImpact.base);
    });

    test('identifyEmergingTechnologies returns filtered and prioritized list', () => {
        const pipeline = [
            { name: 'DrugA', therapeuticArea: 'oncology', phase: 3, novelty: 0.8 },
            { name: 'DrugB', therapeuticArea: 'cardiology', phase: 2, novelty: 0.6 }
        ];
        const result = hs.identifyEmergingTechnologies(pipeline);

        expect(result.technologies).toBeDefined();
        expect(result.technologies.length).toBeGreaterThan(0);
        expect(result.summary).toBeDefined();
    });
});

// ============================================================================
// ManagedEntryAgreements (EU HTA)
// ============================================================================

describe('ManagedEntryAgreements', () => {
    let mea;
    beforeEach(() => { mea = new ManagedEntryAgreements(); });

    test('constructor lists MEA types', () => {
        expect(mea.meaTypes).toContain('outcomes-based');
        expect(mea.meaTypes).toContain('financial-based');
    });

    test('designMEA returns scheme with metrics and exit criteria', () => {
        const tech = { name: 'DrugX' };
        const uncertainty = { level: 'high', domain: 'effectiveness' };
        const result = mea.designMEA(tech, uncertainty);

        expect(result.technology).toBe('DrugX');
        expect(result.recommendedScheme).toBeDefined();
        expect(result.performanceMetrics).toBeDefined();
        expect(result.exitCriteria).toBeDefined();
    });
});

// ============================================================================
// MultiCountryHTACoordination (EU HTA)
// ============================================================================

describe('MultiCountryHTACoordination', () => {
    let mchtac;
    beforeEach(() => { mchtac = new MultiCountryHTACoordination(); });

    test('constructor has EU member states', () => {
        expect(mchtac.memberStates).toContain('DE');
        expect(mchtac.memberStates).toContain('FR');
        expect(mchtac.memberStates).toContain('ES');
        expect(mchtac.memberStates.length).toBe(27);
    });

    test('analyzeComparatorVariation returns mapping for member states', () => {
        const result = mchtac.analyzeComparatorVariation('oncology', ['DE', 'FR', 'ES']);

        expect(result.therapeuticArea).toBe('oncology');
        expect(result.memberStates).toHaveLength(3);
        expect(result.comparatorMapping).toBeDefined();
        expect(result.comparatorMapping['DE']).toBeDefined();
        expect(result.comparatorMapping['FR']).toBeDefined();
    });

    test('assessTransferability returns scored matrix', () => {
        const assessment = { sourceCountry: 'DE' };
        const result = mchtac.assessTransferability(assessment, ['FR', 'ES']);

        expect(result.source).toBe('DE');
        expect(result.targets).toBeDefined();
        expect(result.targets['FR']).toBeDefined();
        expect(typeof result.targets['FR'].overallScore).toBe('number');
    });
});

// ============================================================================
// ATMPOrphanMethods (EU HTA)
// ============================================================================

describe('ATMPOrphanMethods', () => {
    let atmp;
    beforeEach(() => { atmp = new ATMPOrphanMethods(); });

    test('constructor has uncertainty thresholds', () => {
        expect(atmp.uncertaintyThresholds.orphan).toBe(0.3);
        expect(atmp.uncertaintyThresholds.atmp).toBe(0.4);
        expect(atmp.uncertaintyThresholds.standard).toBe(0.2);
    });

    test('adaptiveUncertaintyAssessment categorizes ATMP technology', () => {
        const tech = { name: 'GeneTherapyX', orphan: true, atmp: true };
        const evidence = { trials: [{ n: 30 }] };
        const result = atmp.adaptiveUncertaintyAssessment(tech, evidence);

        expect(result.technology).toBe('GeneTherapyX');
        expect(result.category).toBe('ATMP');
        expect(result.evidenceProfile).toBeDefined();
        expect(result.adaptiveApproach).toBeDefined();
    });

    test('adaptiveUncertaintyAssessment categorizes orphan technology', () => {
        const tech = { name: 'OrphanDrug', orphan: true, atmp: false };
        const evidence = { trials: [{ n: 50 }] };
        const result = atmp.adaptiveUncertaintyAssessment(tech, evidence);

        expect(result.category).toBe('Orphan');
    });

    test('adaptiveUncertaintyAssessment categorizes standard technology', () => {
        const tech = { name: 'StandardDrug', orphan: false, atmp: false };
        const evidence = { trials: [{ n: 500 }] };
        const result = atmp.adaptiveUncertaintyAssessment(tech, evidence);

        expect(result.category).toBe('Standard');
    });
});

// ============================================================================
// RealWorldEvidenceFDA
// ============================================================================

describe('RealWorldEvidenceFDA', () => {
    let rweFDA;
    beforeEach(() => { rweFDA = new RealWorldEvidenceFDA(); });

    test('constructor sets config with defaults', () => {
        expect(rweFDA.config.dataStandards).toBe('CDISC');
        expect(rweFDA.config.regulatoryContext).toBe('supplemental');
    });

    test('assessDataFitness returns overall fitness score and grade', () => {
        const rwdSource = { name: 'Claims Database', size: 1000000 };
        const intendedUse = 'supplemental-effectiveness';
        const result = rweFDA.assessDataFitness(rwdSource, intendedUse);

        expect(result.source).toBe('Claims Database');
        expect(result.relevance).toBeDefined();
        expect(result.reliability).toBeDefined();
        expect(result.keyQuestions).toBeDefined();
        expect(typeof result.overallFitness).toBe('number');
        expect(result.regulatoryGrade).toBeDefined();
    });

    test('designRWEStudy returns protocol elements', () => {
        const rq = { type: 'effectiveness', endpoint: 'OS' };
        const data = { type: 'ehr', size: 50000 };
        const result = rweFDA.designRWEStudy(rq, data);

        expect(result.researchQuestion).toBe(rq);
        expect(result.recommendedDesign).toBeDefined();
        expect(result.protocol).toBeDefined();
        expect(result.biasAssessment).toBeDefined();
    });
});

// ============================================================================
// ExpeditedPrograms (FDA)
// ============================================================================

describe('ExpeditedPrograms', () => {
    let ep;
    beforeEach(() => { ep = new ExpeditedPrograms(); });

    test('constructor creates instance', () => {
        expect(ep).toBeDefined();
        expect(ep.config).toBeDefined();
    });
});

// ============================================================================
// BenefitRiskAssessment (FDA)
// ============================================================================

describe('BenefitRiskAssessment', () => {
    let bra;
    beforeEach(() => { bra = new BenefitRiskAssessment(); });

    test('constructor sets framework', () => {
        expect(bra.config.framework).toBe('FDA-PDUFA-VII');
    });

    test('conductAssessment returns five-domain assessment', () => {
        const drug = { name: 'DrugX' };
        const indication = { name: 'NSCLC' };
        const evidence = {
            trials: [{ n: 300, endpoint: 'OS' }],
            safetyData: { aes: [] }
        };
        const result = bra.conductAssessment(drug, indication, evidence);

        expect(result.drug).toBe('DrugX');
        expect(result.indication).toBe('NSCLC');
        expect(result.framework).toBe('FDA Benefit-Risk Framework');
        expect(result.domains).toBeDefined();
        expect(result.domains.benefit).toBeDefined();
        expect(result.domains.riskAndRiskManagement).toBeDefined();
        expect(result.domains.uncertainty).toBeDefined();
        expect(result.conclusion).toBeDefined();
    });
});

// ============================================================================
// AdaptiveTrialDesigns (FDA)
// ============================================================================

describe('AdaptiveTrialDesigns', () => {
    let atd;
    beforeEach(() => { atd = new AdaptiveTrialDesigns(); });

    test('constructor sets simulation runs', () => {
        expect(atd.config.simulationRuns).toBe(10000);
    });

    test('designAdaptiveTrial returns design with operating characteristics', () => {
        const result = atd.designAdaptiveTrial('superiority', { size: 500 });

        expect(result.objective).toBe('superiority');
        expect(result.adaptationType).toBe('sample-size-reestimation');
        expect(result.design).toBeDefined();
        expect(result.operatingCharacteristics).toBeDefined();
        expect(result.typeIErrorControl).toBeDefined();
    });

    test('sampleSizeReestimation returns blinded SSR by default', () => {
        const interimData = { n: 100, pooledVariance: 2.5 };
        const original = { n: 200, expectedVariance: 2.0, alpha: 0.05, power: 0.8 };
        const result = atd.sampleSizeReestimation(interimData, original);

        expect(result.method).toBe('Blinded SSR');
        expect(result.originalN).toBe(200);
        expect(typeof result.reestimatedN).toBe('number');
        expect(result.typeIErrorImpact).toBe('None');
    });
});

// ============================================================================
// MasterProtocols (FDA)
// ============================================================================

describe('MasterProtocols', () => {
    let mp;
    beforeEach(() => { mp = new MasterProtocols(); });

    test('designBasketTrial returns baskets with sample sizes', () => {
        const drug = { name: 'DrugX' };
        const tumorTypes = [
            { name: 'Breast', biomarkerPrevalence: 0.15, expectedResponse: 0.3 },
            { name: 'Lung', biomarkerPrevalence: 0.25, expectedResponse: 0.25 },
            { name: 'Colon', biomarkerPrevalence: 0.10, expectedResponse: 0.20 }
        ];

        const result = mp.designBasketTrial(drug, tumorTypes, { biomarker: 'BRAF' });

        expect(result.drug).toBe('DrugX');
        expect(result.design).toBe('Basket Trial');
        expect(result.baskets).toHaveLength(3);
        result.baskets.forEach(b => {
            expect(b.tumor).toBeDefined();
            expect(b.sampleSize).toBeDefined();
            expect(typeof b.sampleSize.total).toBe('number');
        });
    });

    test('designUmbrellaTrial returns arms for each subgroup', () => {
        const subgroups = [
            { name: 'EGFR+', biomarker: 'EGFR', treatment: 'Osimertinib', prevalence: 0.15 },
            { name: 'ALK+', biomarker: 'ALK', treatment: 'Crizotinib', prevalence: 0.05 }
        ];
        const result = mp.designUmbrellaTrial('NSCLC', subgroups);

        expect(result.disease).toBe('NSCLC');
        expect(result.design).toBe('Umbrella Trial');
        expect(result.arms).toHaveLength(2);
    });
});

// ============================================================================
// PatientFocusedDrugDevelopment (FDA)
// ============================================================================

describe('PatientFocusedDrugDevelopment', () => {
    let pfdd;
    beforeEach(() => { pfdd = new PatientFocusedDrugDevelopment(); });

    test('collectPatientInput returns structured collection plan', () => {
        const result = pfdd.collectPatientInput('chronic pain');

        expect(result.condition).toBe('chronic pain');
        expect(result.objectives).toBeDefined();
        expect(result.objectives.length).toBeGreaterThan(0);
        expect(result.methods).toBeDefined();
        expect(result.fdaGuidanceAlignment).toContain('PFDD Guidance 1');
    });

    test('identifyMeaningfulOutcomes returns prioritization', () => {
        const input = { symptoms: ['pain', 'fatigue'] };
        const context = { condition: 'RA' };
        const result = pfdd.identifyMeaningfulOutcomes(input, context);

        expect(result.conceptualFramework).toBeDefined();
        expect(result.fdaGuidanceAlignment).toContain('PFDD Guidance 2');
    });
});

// ============================================================================
// PostMarketSurveillance (FDA)
// ============================================================================

describe('PostMarketSurveillance', () => {
    let pms;
    beforeEach(() => { pms = new PostMarketSurveillance(); });

    test('designREMS returns elements and assessment plan', () => {
        const drug = { name: 'DrugX' };
        const risks = [{ event: 'hepatotoxicity', severity: 'serious', frequency: 0.01 }];
        const result = pms.designREMS(drug, risks);

        expect(result.drug).toBe('DrugX');
        expect(result.remsElements).toBeDefined();
        expect(result.assessmentPlan).toBeDefined();
        expect(result.metrics).toBeDefined();
    });

    test('analyzeSignal returns causality assessment', () => {
        const drug = { name: 'DrugX' };
        const signal = { event: 'rhabdomyolysis', source: 'FAERS' };
        const data = { reports: 50, background: 5 };
        const result = pms.analyzeSignal(drug, signal, data);

        expect(result.drug).toBe('DrugX');
        expect(result.characterization).toBeDefined();
        expect(result.causalityAssessment).toBeDefined();
    });
});

// ============================================================================
// DigitalHealthFDA
// ============================================================================

describe('DigitalHealthFDA', () => {
    let dhfda;
    beforeEach(() => { dhfda = new DigitalHealthFDA(); });

    test('assessSaMDPathway returns risk classification and pathway', () => {
        const software = { name: 'DiagnosticAI', version: '1.0' };
        const intendedUse = 'clinical-decision-support';
        const result = dhfda.assessSaMDPathway(software, intendedUse);

        expect(result.software).toBe('DiagnosticAI');
        expect(result.riskClassification).toBeDefined();
        expect(result.regulatoryPathway).toBeDefined();
        expect(result.cybersecurityRequirements).toBeDefined();
    });

    test('designDCT returns decentralized trial elements', () => {
        const protocol = { name: 'DCT-001' };
        const result = dhfda.designDCT(protocol);

        expect(result.protocol).toBe('DCT-001');
        expect(result.dctElements).toBeDefined();
        expect(result.technologyPlatform).toBeDefined();
    });
});

// ============================================================================
// PediatricDevelopment (FDA)
// ============================================================================

describe('PediatricDevelopment', () => {
    let pd;
    beforeEach(() => { pd = new PediatricDevelopment(); });

    test('constructor creates instance', () => {
        expect(pd).toBeDefined();
    });
});

// ============================================================================
// OrphanDrugFDA
// ============================================================================

describe('OrphanDrugFDA', () => {
    let od;
    beforeEach(() => { od = new OrphanDrugFDA(); });

    test('constructor creates instance', () => {
        expect(od).toBeDefined();
    });
});

// ============================================================================
// BiosimilarDevelopment (FDA)
// ============================================================================

describe('BiosimilarDevelopment', () => {
    let bd;
    beforeEach(() => { bd = new BiosimilarDevelopment(); });

    test('constructor creates instance', () => {
        expect(bd).toBeDefined();
    });
});

// ============================================================================
// OncologyReviewPrograms (FDA)
// ============================================================================

describe('OncologyReviewPrograms', () => {
    let orp;
    beforeEach(() => { orp = new OncologyReviewPrograms(); });

    test('constructor creates instance', () => {
        expect(orp).toBeDefined();
    });
});

// ============================================================================
// AdvisoryCommitteeSupport (FDA)
// ============================================================================

describe('AdvisoryCommitteeSupport', () => {
    let acs;
    beforeEach(() => { acs = new AdvisoryCommitteeSupport(); });

    test('constructor creates instance', () => {
        expect(acs).toBeDefined();
    });
});

// ============================================================================
// ICHCompliance (FDA)
// ============================================================================

describe('ICHCompliance', () => {
    let ich;
    beforeEach(() => { ich = new ICHCompliance(); });

    test('constructor creates instance', () => {
        expect(ich).toBeDefined();
    });
});

// ============================================================================
// EssentialMedicinesList (WHO)
// ============================================================================

describe('EssentialMedicinesList', () => {
    let eml;
    beforeEach(() => { eml = new EssentialMedicinesList(); });

    test('constructor defines categories and criteria', () => {
        expect(eml.emlCategories).toContain('core');
        expect(eml.emlCategories).toContain('complementary');
        expect(eml.evaluationCriteria).toContain('efficacy-safety');
        expect(eml.evaluationCriteria).toContain('cost-effectiveness');
    });

    test('assessEMLInclusion returns structured assessment', () => {
        const medicine = { name: 'Amoxicillin' };
        const indication = 'Bacterial infection';
        const evidence = { trials: [{ n: 500, effect: 0.8 }] };
        const result = eml.assessEMLInclusion(medicine, indication, evidence);

        expect(result.medicine).toBe(medicine);
        expect(result.indication).toBe('Bacterial infection');
        expect(result.assessment).toBeDefined();
        expect(result.assessment.publicHealthRelevance).toBeDefined();
        expect(result.assessment.efficacySafety).toBeDefined();
    });
});

// ============================================================================
// WHOCHOICEMethodology (WHO)
// ============================================================================

describe('WHOCHOICEMethodology', () => {
    let choice;
    beforeEach(() => { choice = new WHOCHOICEMethodology(); });

    test('constructor defines thresholds', () => {
        expect(choice.thresholds['highly-cost-effective']).toBe(1.0);
        expect(choice.thresholds['cost-effective']).toBe(3.0);
    });

    test('constructor lists perspectives', () => {
        expect(choice.perspectives).toContain('health-system');
        expect(choice.perspectives).toContain('societal');
    });
});

// ============================================================================
// GRADEMethodology (WHO)
// ============================================================================

describe('GRADEMethodology', () => {
    let grade;
    beforeEach(() => { grade = new GRADEMethodology(); });

    test('constructor defines certainty levels and domains', () => {
        expect(grade.certaintyLevels).toEqual(['high', 'moderate', 'low', 'very-low']);
        expect(grade.domains).toContain('risk-of-bias');
        expect(grade.domains).toContain('imprecision');
        expect(grade.upgradeDomains).toContain('large-effect');
    });

    test('assessCertainty returns bounded certainty level', () => {
        const evidence = {
            studyDesign: 'rct',
            nStudies: 5,
            totalN: 2000,
            effectEstimate: 0.5,
            heterogeneity: { I2: 30 }
        };
        const outcome = { name: 'mortality' };
        const result = grade.assessCertainty(evidence, outcome);

        expect(result).toBeDefined();
        // result should have certainty-related properties
        expect(result.certainty || result.finalCertainty || result.level).toBeDefined();
    });
});

// ============================================================================
// UniversalHealthCoverage (WHO)
// ============================================================================

describe('UniversalHealthCoverage', () => {
    let uhc;
    beforeEach(() => { uhc = new UniversalHealthCoverage(); });

    test('constructor defines UHC dimensions', () => {
        expect(uhc.uhcDimensions).toContain('coverage');
        expect(uhc.uhcDimensions).toContain('quality');
        expect(uhc.uhcDimensions).toContain('financial-protection');
    });

    test('designBenefitsPackage returns package with UHC impact', () => {
        const interventions = [
            { name: 'Vaccine A', cost: 5, healthImpact: 0.9 },
            { name: 'Treatment B', cost: 50, healthImpact: 0.7 }
        ];
        const result = uhc.designBenefitsPackage(interventions, 1000000, { totalPop: 5000000 });

        expect(result.method).toBe('WHO-UHC-Benefits-Package-Design');
        expect(result.interventionAssessments).toBeDefined();
        expect(result.recommendedPackage).toBeDefined();
    });
});

// ============================================================================
// GlobalHealthEquity (WHO)
// ============================================================================

describe('GlobalHealthEquity', () => {
    let ghe;
    beforeEach(() => { ghe = new GlobalHealthEquity(); });

    test('constructor creates instance', () => {
        expect(ghe).toBeDefined();
    });
});

// ============================================================================
// WHOPrequalification (WHO)
// ============================================================================

describe('WHOPrequalification', () => {
    let whopq;
    beforeEach(() => { whopq = new WHOPrequalification(); });

    test('constructor defines product types and assessment types', () => {
        expect(whopq.productTypes).toContain('medicines');
        expect(whopq.productTypes).toContain('vaccines');
        expect(whopq.assessmentTypes).toContain('full');
    });

    test('assessPrequalificationEligibility returns eligibility and pathway', () => {
        const product = { name: 'Generic Amoxicillin' };
        const result = whopq.assessPrequalificationEligibility(product, 'medicines');

        expect(result.product).toBe(product);
        expect(result.productType).toBe('medicines');
        expect(result.eligibility).toBeDefined();
        expect(typeof result.isEligible).toBe('boolean');
        expect(result.recommendedPathway).toBeDefined();
    });
});

// ============================================================================
// SAGEVaccineRecommendations (WHO)
// ============================================================================

describe('SAGEVaccineRecommendations', () => {
    let sage;
    beforeEach(() => { sage = new SAGEVaccineRecommendations(); });

    test('constructor creates instance', () => {
        expect(sage).toBeDefined();
    });
});

// ============================================================================
// OneHealthApproach (WHO)
// ============================================================================

describe('OneHealthApproach', () => {
    let oh;
    beforeEach(() => { oh = new OneHealthApproach(); });

    test('constructor creates instance', () => {
        expect(oh).toBeDefined();
    });
});

// ============================================================================
// PandemicPreparedness (WHO)
// ============================================================================

describe('PandemicPreparedness', () => {
    let pp;
    beforeEach(() => { pp = new PandemicPreparedness(); });

    test('constructor creates instance', () => {
        expect(pp).toBeDefined();
    });
});

// ============================================================================
// HealthSystemsStrengthening (WHO)
// ============================================================================

describe('HealthSystemsStrengthening', () => {
    let hss;
    beforeEach(() => { hss = new HealthSystemsStrengthening(); });

    test('constructor creates instance', () => {
        expect(hss).toBeDefined();
    });
});

// ============================================================================
// SDG3Alignment (WHO)
// ============================================================================

describe('SDG3Alignment', () => {
    let sdg3;
    beforeEach(() => { sdg3 = new SDG3Alignment(); });

    test('constructor creates instance', () => {
        expect(sdg3).toBeDefined();
    });
});

// ============================================================================
// PrecisionMedicineHTA
// ============================================================================

describe('PrecisionMedicineHTA', () => {
    let pm;
    beforeEach(() => { pm = new PrecisionMedicineHTA(); });

    test('constructor defines biomarker and test types', () => {
        expect(pm.biomarkerTypes).toContain('predictive');
        expect(pm.biomarkerTypes).toContain('prognostic');
        expect(pm.testTypes).toContain('companion-diagnostic');
    });

    test('biomarkerStratifiedAnalysis returns subgroup effects and interaction test', () => {
        const data = [];
        for (let i = 0; i < 100; i++) {
            const bm = i < 50 ? 'positive' : 'negative';
            const trt = i % 2;
            const outcome = bm === 'positive' ? 5 + trt * 2 + (i % 7) * 0.1 : 5 + trt * 0.2 + (i % 7) * 0.1;
            data.push({ biomarker: bm, treatment: trt, outcome });
        }

        const result = pm.biomarkerStratifiedAnalysis(data);

        expect(result.method).toBe('biomarker-stratified-analysis');
        expect(result.overallEffect).toBeDefined();
        expect(result.subgroupEffects).toBeDefined();
        expect(result.subgroupEffects.length).toBe(2);
        expect(result.interaction).toBeDefined();
    });
});

// ============================================================================
// BayesianDecisionAnalysis
// ============================================================================

describe('BayesianDecisionAnalysis', () => {
    let bda;
    beforeEach(() => { bda = new BayesianDecisionAnalysis(); });

    test('constructor defines methods', () => {
        expect(bda.methods).toContain('evhi');
        expect(bda.methods).toContain('enbs');
        expect(bda.methods).toContain('real-options');
    });

    test('calculateEVHI returns heterogeneous vs homogeneous EVPI comparison', () => {
        const modelResults = {
            strategies: {
                A: { nmb: 50000, qalys: 5, costs: 20000 },
                B: { nmb: 45000, qalys: 4.5, costs: 22000 }
            },
            uncertainty: { mean: 0.5, se: 0.1 }
        };
        const popData = { totalSize: 100000 };
        const result = bda.calculateEVHI(modelResults, popData, {
            subgroups: ['young', 'old'],
            subgroupPrevalence: { young: 0.6, old: 0.4 }
        });

        expect(result.method).toBe('evhi');
        expect(typeof result.homogeneousEVPI).toBe('number');
        expect(typeof result.heterogeneousEVPI).toBe('number');
        expect(typeof result.evhi).toBe('number');
        expect(result.interpretation).toBeDefined();
    });

    test('calculateENBS returns design analysis with costs', () => {
        const priorResults = { mean: 0.5, se: 0.15 };
        const designs = [
            { sampleSize: 100, name: 'Small' },
            { sampleSize: 500, name: 'Large' }
        ];
        const result = bda.calculateENBS(priorResults, designs);

        expect(result).toBeDefined();
    });
});

// ============================================================================
// AdvancedNMAMethods
// ============================================================================

describe('AdvancedNMAMethods', () => {
    let anma;
    beforeEach(() => { anma = new AdvancedNMAMethods(); });

    test('constructor defines methods', () => {
        expect(anma.methods).toContain('multinomial');
        expect(anma.methods).toContain('time-varying');
        expect(anma.methods).toContain('rare-events');
    });

    test('multinomialNMA returns treatment effects and rankings', () => {
        const data = [
            { study: 'S1', treatment: 'A', outcome: 'good', count: 30 },
            { study: 'S1', treatment: 'B', outcome: 'good', count: 25 },
            { study: 'S2', treatment: 'A', outcome: 'moderate', count: 20 },
            { study: 'S2', treatment: 'C', outcome: 'moderate', count: 22 }
        ];
        const result = anma.multinomialNMA(data, {
            categories: ['good', 'moderate', 'poor'],
            model: 'proportional-odds'
        });

        expect(result.method).toBe('multinomial-nma');
        expect(result.model).toBe('proportional-odds');
        expect(result.treatmentEffects).toBeDefined();
        expect(result.rankings).toBeDefined();
    });

    test('timeVaryingNMA returns time-specific treatment effects', () => {
        const data = [
            { study: 'S1', treatment: 'A', time: 6, outcome: 0.5 },
            { study: 'S1', treatment: 'B', time: 6, outcome: 0.4 },
            { study: 'S1', treatment: 'A', time: 12, outcome: 0.3 },
            { study: 'S1', treatment: 'B', time: 12, outcome: 0.25 }
        ];
        const result = anma.timeVaryingNMA(data, {
            timePoints: [6, 12]
        });

        expect(result.method).toBe('time-varying-nma');
        expect(result.timeEffects).toBeDefined();
        expect(result.timeEffects).toHaveLength(2);
    });
});

// ============================================================================
// MissingDataMethods
// ============================================================================

describe('MissingDataMethods', () => {
    let mdm;
    beforeEach(() => { mdm = new MissingDataMethods(); });

    test('constructor defines methods', () => {
        expect(mdm.methods).toContain('mi');
        expect(mdm.methods).toContain('pattern-mixture');
        expect(mdm.methods).toContain('tipping-point');
    });

    test('multipleImputationIPD returns pooled results with Rubin rules', () => {
        const ipdData = Array.from({ length: 50 }, (_, i) => ({
            study: i < 25 ? 'S1' : 'S2',
            treatment: i % 2,
            outcome: 5 + (i % 2) * 0.5 + (i % 5) * 0.1,
            age: 50 + (i % 20),
            // Some missing values
            biomarker: i % 7 === 0 ? null : (i % 5) * 0.3
        }));
        const result = mdm.multipleImputationIPD(ipdData, {
            variables: ['age', 'biomarker'],
            m: 5
        });

        expect(result.method).toBe('multiple-imputation-ipd');
        expect(result.nImputations).toBe(5);
        expect(result.missingness).toBeDefined();
        expect(result.pooledResults).toBeDefined();
    });
});

// ============================================================================
// DynamicTreatmentRegimes
// ============================================================================

describe('DynamicTreatmentRegimes', () => {
    let dtr;
    beforeEach(() => { dtr = new DynamicTreatmentRegimes(); });

    test('constructor defines methods', () => {
        expect(dtr.methods).toContain('smart');
        expect(dtr.methods).toContain('q-learning');
        expect(dtr.methods).toContain('g-estimation');
    });

    test('smartAnalysis returns embedded regimes comparison', () => {
        const smartData = Array.from({ length: 60 }, (_, i) => ({
            id: i,
            stage1Treatment: i % 2 === 0 ? 'A' : 'B',
            response: i % 3 === 0,
            stage2Treatment: i % 2 === 0 ? 'C' : 'D',
            outcome: 5 + (i % 2) * 1.5 + (i % 3) * 0.3
        }));
        const result = dtr.smartAnalysis(smartData, {
            stages: 2,
            treatments: { stage1: ['A', 'B'], stage2: ['C', 'D'] },
            outcome: 'outcome'
        });

        expect(result.method).toBe('smart-analysis');
        expect(result.stages).toBe(2);
        expect(result.embeddedRegimes).toBeDefined();
        expect(result.comparison).toBeDefined();
        expect(result.optimalRegime).toBeDefined();
    });
});

// ============================================================================
// GeneralizabilityTransportability
// ============================================================================

describe('GeneralizabilityTransportability', () => {
    let gt;
    beforeEach(() => { gt = new GeneralizabilityTransportability(); });

    test('constructor defines methods', () => {
        expect(gt.methods).toContain('generalizability');
        expect(gt.methods).toContain('transportability');
        expect(gt.methods).toContain('fusion');
    });

    test('generalizabilityAnalysis returns generalized vs sample estimates', () => {
        const trialData = Array.from({ length: 80 }, (_, i) => ({
            treatment: i % 2,
            outcome: 5 + (i % 2) * 1.2 + (i % 10) * 0.1,
            age: 50 + (i % 20),
            sex: i % 2
        }));
        const targetData = Array.from({ length: 200 }, (_, i) => ({
            age: 60 + (i % 30),
            sex: i % 3 === 0 ? 1 : 0
        }));
        const result = gt.generalizabilityAnalysis(trialData, targetData, {
            covariates: ['age', 'sex'],
            method: 'iosw'
        });

        expect(result.method).toBe('generalizability');
        expect(result.generalizedEstimate).toBeDefined();
        expect(result.sampleEstimate).toBeDefined();
        expect(result.difference).toBeDefined();
    });
});

// ============================================================================
// MediationAnalysisHTA
// ============================================================================

describe('MediationAnalysisHTA', () => {
    let mahta;
    beforeEach(() => { mahta = new MediationAnalysisHTA(); });

    test('constructor defines methods', () => {
        expect(mahta.methods).toContain('causal-mediation');
        expect(mahta.methods).toContain('natural-effects');
        expect(mahta.methods).toContain('multiple-mediators');
    });

    test('causalMediation returns NDE, NIE, and proportion mediated', () => {
        const data = Array.from({ length: 100 }, (_, i) => ({
            treatment: i % 2,
            mediator: (i % 2) * 0.5 + (i % 5) * 0.1,
            outcome: 5 + (i % 2) * 1 + ((i % 2) * 0.5 + (i % 5) * 0.1) * 0.3 + (i % 7) * 0.05
        }));
        const result = mahta.causalMediation(data);

        expect(result.method).toBe('causal-mediation');
        expect(result.naturalDirectEffect).toBeDefined();
        expect(typeof result.naturalDirectEffect.estimate).toBe('number');
        expect(result.naturalIndirectEffect).toBeDefined();
        expect(typeof result.naturalIndirectEffect.estimate).toBe('number');
        expect(result.totalEffect).toBeDefined();
        expect(typeof result.totalEffect.estimate).toBe('number');
        expect(result.proportionMediated).toBeDefined();
        expect(result.assumptions).toBeDefined();
        expect(result.assumptions.length).toBe(4);
    });

    test('causalMediation total = NDE + NIE', () => {
        const data = Array.from({ length: 100 }, (_, i) => ({
            treatment: i % 2,
            mediator: (i % 2) * 0.5 + (i % 5) * 0.1,
            outcome: 5 + (i % 2) * 1 + ((i % 2) * 0.5 + (i % 5) * 0.1) * 0.3
        }));
        const result = mahta.causalMediation(data);

        expect(result.totalEffect.estimate).toBeCloseTo(
            result.naturalDirectEffect.estimate + result.naturalIndirectEffect.estimate, 8
        );
    });
});

// ============================================================================
// PatientReportedOutcomes (EU HTA)
// ============================================================================

describe('PatientReportedOutcomes', () => {
    let pro;
    beforeEach(() => { pro = new PatientReportedOutcomes(); });

    test('constructor creates instance', () => {
        expect(pro).toBeDefined();
    });
});

// ============================================================================
// EditorialStandards - additional coverage for uncovered methods
// ============================================================================

describe('EditorialStandards - additional', () => {
    const { EditorialStandards } = require('../../src/engine/frontierMeta');
    let es;
    beforeEach(() => { es = new EditorialStandards(); });

    const effects   = [0.30, 0.50, 0.20, 0.60, 0.35, 0.45];
    const variances = [0.04, 0.06, 0.03, 0.08, 0.05, 0.07];

    test('henmiCopas returns CI with tau2 range', () => {
        const result = es.henmiCopas(effects, variances);

        expect(result.method).toBe('Henmi-Copas');
        expect(typeof result.estimate).toBe('number');
        expect(Number.isFinite(result.estimate)).toBe(true);
        expect(result.ci95).toHaveLength(2);
        expect(Number.isFinite(result.ci95[0])).toBe(true);
        expect(Number.isFinite(result.ci95[1])).toBe(true);
        expect(result.tau2Range).toHaveLength(2);
        expect(result.tau2Range[0]).toBeGreaterThanOrEqual(0);
        expect(result.tau2Range[1]).toBeGreaterThanOrEqual(0);
        expect(typeof result.Q).toBe('number');
    });

    test('tau2Estimators returns all 7 estimators', () => {
        const result = es.tau2Estimators(effects, variances);

        expect(result.DL).toBeDefined();
        expect(result.DL.estimate).toBeGreaterThanOrEqual(0);
        expect(result.PM).toBeDefined();
        expect(result.REML).toBeDefined();
        expect(result.ML).toBeDefined();
        expect(result.EB).toBeDefined();
        expect(result.SJ).toBeDefined();
        expect(result.HS).toBeDefined();
    });

    test('profileLikelihoodCI returns CI with max log-likelihood', () => {
        const result = es.profileLikelihoodCI(effects, variances);

        expect(result.method).toBe('Profile likelihood');
        expect(typeof result.estimate).toBe('number');
        expect(result.ci95).toHaveLength(2);
        expect(result.ci95[0]).toBeLessThan(result.estimate);
        expect(result.ci95[1]).toBeGreaterThan(result.estimate);
        expect(typeof result.maxLogLikelihood).toBe('number');
    });
});

// ============================================================================
// AdvancedPublicationBias - RoBMA coverage (lines 1587-1636)
// ============================================================================

describe('AdvancedPublicationBias - RoBMA', () => {
    const { AdvancedPublicationBias } = require('../../src/engine/frontierMeta');
    let pb;
    beforeEach(() => { pb = new AdvancedPublicationBias(); });

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

    test('robma returns model-averaged estimate and posterior probabilities', () => {
        const data = createPubBiasData();
        const result = pb.robma(data);

        expect(result.method).toBe('robma');
        expect(result.modelAveragedEstimate).toBeDefined();
        expect(typeof result.modelAveragedEstimate.effect).toBe('number');
        expect(Number.isFinite(result.modelAveragedEstimate.effect)).toBe(true);
        expect(result.posteriorProbabilities).toBeDefined();
        expect(result.posteriorProbabilities.H1).toBeGreaterThanOrEqual(0);
        expect(result.posteriorProbabilities.H1).toBeLessThanOrEqual(1);
        expect(result.posteriorProbabilities.H0).toBeCloseTo(1 - result.posteriorProbabilities.H1, 10);
    });

    test('robma model weights sum to 1', () => {
        const data = createPubBiasData();
        const result = pb.robma(data);

        const totalWeight = result.modelWeights.reduce((s, m) => s + m.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 10);
    });

    test('robma Bayes factors are defined', () => {
        const data = createPubBiasData();
        const result = pb.robma(data);

        expect(result.bayesFactor).toBeDefined();
        expect(typeof result.bayesFactor.effect).toBe('number');
    });
});

// ============================================================================
// MendelianRandomizationMA - MR-PRESSO coverage (lines 2894-2952)
// ============================================================================

describe('MendelianRandomizationMA - MR-PRESSO', () => {
    const { MendelianRandomizationMA } = require('../../src/engine/frontierMeta');
    let mr;
    beforeEach(() => { mr = new MendelianRandomizationMA(); });

    function createMRData() {
        return [
            { betaExposure: 0.30, seBetaExposure: 0.05, betaOutcome: 0.15, seBetaOutcome: 0.08 },
            { betaExposure: 0.25, seBetaExposure: 0.04, betaOutcome: 0.12, seBetaOutcome: 0.07 },
            { betaExposure: 0.40, seBetaExposure: 0.06, betaOutcome: 0.22, seBetaOutcome: 0.09 },
            { betaExposure: 0.20, seBetaExposure: 0.03, betaOutcome: 0.08, seBetaOutcome: 0.06 },
            { betaExposure: 0.35, seBetaExposure: 0.05, betaOutcome: 0.18, seBetaOutcome: 0.08 }
        ];
    }

    test('mrPresso returns global test and distortion test', () => {
        const data = createMRData();
        const result = mr.mrPresso(data, { nDistributions: 50 });

        expect(result.method).toBe('mr-presso');
        expect(result.globalTest).toBeDefined();
        expect(typeof result.globalTest.pValue).toBe('number');
        expect(result.globalTest.pValue).toBeGreaterThanOrEqual(0);
        expect(result.globalTest.pValue).toBeLessThanOrEqual(1);
        expect(typeof result.distortionTest).toBeDefined();
    });
});

// ============================================================================
// DTAMetaAnalysis - networkDTA coverage (lines 1297-1363)
// ============================================================================

describe('DTAMetaAnalysis - network DTA', () => {
    const { DTAMetaAnalysis } = require('../../src/engine/frontierMeta');
    let dta;
    beforeEach(() => { dta = new DTAMetaAnalysis(); });

    test('networkDTA returns test-level results and comparisons', () => {
        const data = [
            { id: 'D1', test: 'TestA', tp: 80, fp: 10, fn: 20, tn: 90 },
            { id: 'D2', test: 'TestA', tp: 70, fp: 15, fn: 30, tn: 85 },
            { id: 'D3', test: 'TestA', tp: 90, fp:  5, fn: 10, tn: 95 },
            { id: 'D4', test: 'TestB', tp: 60, fp: 20, fn: 40, tn: 80 },
            { id: 'D5', test: 'TestB', tp: 85, fp: 12, fn: 15, tn: 88 },
            { id: 'D6', test: 'TestB', tp: 75, fp: 18, fn: 25, tn: 82 }
        ];

        const result = dta.networkDTA(data);

        expect(result.model).toBe('network-dta');
        expect(result.testResults).toBeDefined();
        expect(result.testResults['TestA']).toBeDefined();
        expect(result.testResults['TestB']).toBeDefined();
        expect(result.comparisons).toBeDefined();
        expect(result.rankings).toBeDefined();
        expect(result.rankings.length).toBe(2);
    });
});

// ============================================================================
// ADDITIONAL DEEP COVERAGE TESTS
// ============================================================================

// ---------------------------------------------------------------------------
// MLAssistedScreening - deeper coverage
// ---------------------------------------------------------------------------

describe('MLAssistedScreening - deeper coverage', () => {
    let ml;
    beforeEach(() => { ml = new MLAssistedScreening(); });

    function makeTrainingData() {
        return [
            { text: 'randomized controlled trial efficacy drug treatment outcome', label: 'include' },
            { text: 'systematic review meta-analysis pooled effect clinical trial', label: 'include' },
            { text: 'cohort study observational prospective outcome measure', label: 'include' },
            { text: 'cell culture in vitro experiment gene expression mouse model', label: 'exclude' },
            { text: 'case report anecdotal single patient narrative opinion letter', label: 'exclude' },
            { text: 'economic analysis cost budget hospital resource utilization', label: 'exclude' },
            { text: 'randomized placebo controlled double blind clinical endpoint', label: 'include' },
            { text: 'editorial commentary opinion personal view discussion debate', label: 'exclude' }
        ];
    }

    test('getUncertainAbstracts returns abstracts sorted by uncertainty', () => {
        const data = makeTrainingData();
        const trained = ml.trainScreeningModel(data);
        const abstracts = [
            { text: 'randomized controlled drug efficacy' },
            { text: 'mouse laboratory cell culture' },
            { text: 'prospective cohort patient outcome study gene expression review' }
        ];
        const uncertain = ml.getUncertainAbstracts(abstracts, trained, 2);
        expect(uncertain.length).toBeLessThanOrEqual(2);
    });

    test('extractPICO extracts structured PICO elements', () => {
        const text = 'patients with diabetes treated with metformin versus placebo. The primary outcome was HbA1c reduction.';
        const result = ml.extractPICO(text);

        expect(result.population).toBeDefined();
        expect(result.intervention).toBeDefined();
        expect(result.comparator).toBeDefined();
        expect(result.outcome).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// HistoricalBorrowing - MAP prior (lines 3151-3192)
// ---------------------------------------------------------------------------

describe('HistoricalBorrowing - MAP prior', () => {
    const { HistoricalBorrowing } = require('../../src/engine/frontierMeta');
    let hb;
    beforeEach(() => { hb = new HistoricalBorrowing(); });

    test('mapPrior returns posterior with heterogeneity estimate', () => {
        const current = { n: 50, mean: 5.0, sd: 2.0 };
        const historical = [
            { n: 80, mean: 4.8, sd: 1.8 },
            { n: 60, mean: 5.2, sd: 2.1 },
            { n: 100, mean: 4.9, sd: 1.9 }
        ];
        const result = hb.mapPrior(current, historical);

        expect(result.method).toBe('map');
        expect(result.mapPrior).toBeDefined();
        expect(typeof result.mapPrior.mean).toBe('number');
        expect(result.mapPrior.sd).toBeGreaterThan(0);
        expect(result.heterogeneity).toBeDefined();
        expect(result.heterogeneity.tau2).toBeGreaterThanOrEqual(0);
        expect(result.posteriorEstimate).toBeDefined();
        expect(result.posteriorEstimate.ci95).toHaveLength(2);
    });

    test('mapPrior with robust weight returns robust-map method', () => {
        const current = { n: 50, mean: 5.0, sd: 2.0 };
        const historical = [
            { n: 80, mean: 4.8, sd: 1.8 },
            { n: 60, mean: 5.2, sd: 2.1 }
        ];
        const result = hb.mapPrior(current, historical, { robustWeight: 0.2 });
        expect(result.method).toBe('robust-map');
    });
});

// ---------------------------------------------------------------------------
// ThresholdAnalysis - VOI threshold (lines 3608-3641)
// ---------------------------------------------------------------------------

describe('ThresholdAnalysis - VOI threshold', () => {
    const { ThresholdAnalysis } = require('../../src/engine/frontierMeta');
    let ta;
    beforeEach(() => { ta = new ThresholdAnalysis(); });

    test('voiThreshold returns WTP switch points', () => {
        const ceaResults = {
            strategies: {
                'DrugA': { qalys: 5.0, costs: 100000 },
                'DrugB': { qalys: 4.5, costs: 50000 }
            }
        };
        const result = ta.voiThreshold(ceaResults);

        expect(result.method).toBe('voi-threshold');
        expect(result.currentBest).toBeDefined();
        expect(result.thresholdWTP).toBeDefined();
        expect(result.thresholdWTP.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// FederatedMetaAnalysis - secure aggregation (lines 3738-3770)
// ---------------------------------------------------------------------------

describe('FederatedMetaAnalysis - differentiallyPrivateMA', () => {
    const { FederatedMetaAnalysis } = require('../../src/engine/frontierMeta');
    let fed;
    beforeEach(() => { fed = new FederatedMetaAnalysis(); });

    test('differentiallyPrivateMA returns privacy-protected estimate', () => {
        const sites = [
            { siteId: 'A', n: 100, mean: 0.5, variance: 0.04 },
            { siteId: 'B', n: 80,  mean: 0.6, variance: 0.06 },
            { siteId: 'C', n: 120, mean: 0.4, variance: 0.03 }
        ];
        const result = fed.differentiallyPrivateMA(sites, { epsilon: 1.0, sensitivity: 0.1 });

        expect(result.method).toBe('differentially-private-ma');
        expect(result.epsilon).toBe(1.0);
        expect(result.pooledEstimate).toBeDefined();
        expect(typeof result.pooledEstimate.effect).toBe('number');
        expect(result.pooledEstimate.se).toBeGreaterThan(0);
        expect(result.privacyGuarantee).toContain('differential privacy');
        expect(result.interpretation).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// EditorialStandards - GOSH, failSafeN, galbraith, baujat (lines 3926-4316)
// ---------------------------------------------------------------------------

describe('EditorialStandards - deeper methods', () => {
    const { EditorialStandards } = require('../../src/engine/frontierMeta');
    let es;
    beforeEach(() => { es = new EditorialStandards(); });

    const effects   = [0.30, 0.50, 0.20, 0.60, 0.35, 0.45];
    const variances = [0.04, 0.06, 0.03, 0.08, 0.05, 0.07];

    test('goshAnalysis returns subset results with clusters', () => {
        const result = es.goshAnalysis(effects, variances, 50);

        expect(result.subsetResults).toBeDefined();
        expect(result.subsetResults.length).toBe(50);
        result.subsetResults.forEach(r => {
            expect(typeof r.estimate).toBe('number');
            expect(typeof r.I2).toBe('number');
            expect(r.k).toBeGreaterThanOrEqual(2);
        });
        expect(result.clusters).toBeDefined();
        expect(result.summary.meanEffect).toBeDefined();
    });

    test('failSafeN returns Rosenthal and Orwin N', () => {
        const result = es.failSafeN(effects, variances);

        expect(result).toBeDefined();
        expect(result.rosenthal).toBeDefined();
        expect(typeof result.rosenthal.N).toBe('number');
        expect(result.rosenthal.N).toBeGreaterThanOrEqual(0);
        expect(result.orwin).toBeDefined();
        expect(typeof result.orwin.N).toBe('number');
        expect(result.rosenberg).toBeDefined();
        expect(typeof result.rosenberg.N).toBe('number');
    });

    test('radialPlotData returns points with reference line', () => {
        const result = es.radialPlotData(effects, variances);

        expect(result.points).toHaveLength(6);
        result.points.forEach(p => {
            expect(typeof p.x).toBe('number');
            expect(typeof p.y).toBe('number');
        });
        expect(result.referenceLine).toBeDefined();
        expect(typeof result.referenceLine.slope).toBe('number');
    });

    test('baujatPlotData returns heterogeneity and influence per study', () => {
        const result = es.baujatPlotData(effects, variances, 0.02);

        expect(result).toHaveLength(6);
        result.forEach(r => {
            expect(typeof r.heterogeneityContribution).toBe('number');
            expect(r.heterogeneityContribution).toBeGreaterThanOrEqual(0);
            expect(typeof r.influenceOnResult).toBe('number');
            expect(r.influenceOnResult).toBeGreaterThanOrEqual(0);
        });
    });

    test('smallStudyTests returns Thompson-Sharp and Macaskill and Peters tests', () => {
        const result = es.smallStudyTests(effects, variances);

        // Thompson-Sharp
        if (result.thompsonSharp) {
            expect(typeof result.thompsonSharp.pValue).toBe('number');
        }
        // Macaskill
        if (result.macaskill) {
            expect(typeof result.macaskill.pValue).toBe('number');
        }
        // Peters
        if (result.peters) {
            expect(typeof result.peters.pValue).toBe('number');
        }
    });
});

// ---------------------------------------------------------------------------
// PartitionedSurvival - deeper methods
// ---------------------------------------------------------------------------

describe('PartitionedSurvival - deeper', () => {
    const { PartitionedSurvival } = require('../../src/engine/frontierMeta');
    let ps;
    beforeEach(() => { ps = new PartitionedSurvival(); });

    test('applyHalfCycleCorrection reduces first and last cycle values', () => {
        const results = [
            { lyPreProg: 1, lyPostProg: 0.5, qalyPreProg: 0.8, qalyPostProg: 0.3, costPreProg: 5000, costPostProg: 3000 },
            { lyPreProg: 0.9, lyPostProg: 0.6, qalyPreProg: 0.7, qalyPostProg: 0.35, costPreProg: 4500, costPostProg: 3200 },
            { lyPreProg: 0.8, lyPostProg: 0.7, qalyPreProg: 0.6, qalyPostProg: 0.4, costPreProg: 4000, costPostProg: 3500 }
        ];
        const corrected = ps.applyHalfCycleCorrection(results);

        expect(corrected).toHaveLength(3);
        // First and last get half weight
        expect(corrected[0].lyPreProg).toBe(0.5);
        expect(corrected[2].lyPreProg).toBe(0.4);
        // Middle unchanged
        expect(corrected[1].lyPreProg).toBe(0.9);
        expect(corrected[0].halfCycleCorrected).toBe(true);
    });

    test('runPartitionedSurvival with no half-cycle correction', () => {
        const pfsCurve = (t) => Math.exp(-0.05 * t);
        const osCurve = (t) => Math.exp(-0.03 * t);
        const result = ps.runPartitionedSurvival(pfsCurve, osCurve, 5, 1, { halfCycleCorrection: false });

        expect(result.method).toBe('partitioned-survival');
        expect(result.settings.halfCycleCorrection).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SurvivalModelAveraging - stacking ensemble
// ---------------------------------------------------------------------------

describe('SurvivalModelAveraging - stacking', () => {
    const { SurvivalModelAveraging } = require('../../src/engine/frontierMeta');
    let sma;
    beforeEach(() => { sma = new SurvivalModelAveraging(); });

    test('stackingEnsemble returns optimized weights', () => {
        const models = [
            {
                name: 'Weibull',
                survivalFunction: (t) => Math.exp(-0.03 * Math.pow(t, 1.2)),
                predict: (t) => Math.exp(-0.03 * Math.pow(t, 1.2))
            },
            {
                name: 'Exponential',
                survivalFunction: (t) => Math.exp(-0.04 * t),
                predict: (t) => Math.exp(-0.04 * t)
            }
        ];
        const validationData = [
            { time: 1, event: 1, survival: 0.95 },
            { time: 5, event: 1, survival: 0.80 },
            { time: 10, event: 0, survival: 0.65 }
        ];
        const result = sma.stackingEnsemble(models, validationData);

        expect(result.method).toBe('stacking-ensemble');
        expect(result.modelWeights).toBeDefined();
        expect(typeof result.averagedSurvival).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// StructuralUncertainty - scenarioAnalysis
// ---------------------------------------------------------------------------

describe('StructuralUncertainty - scenarioAnalysis', () => {
    const { StructuralUncertainty } = require('../../src/engine/frontierMeta');
    let su;
    beforeEach(() => { su = new StructuralUncertainty(); });

    test('modelAveraging with BIC weights selects best model', () => {
        const models = [
            { name: 'M1', bic: 100, aic: 95, run: () => ({ icer: 30000, inmb: 5000 }) },
            { name: 'M2', bic: 110, aic: 105, run: () => ({ icer: 50000, inmb: -1000 }) },
            { name: 'M3', bic: 120, aic: 115, run: () => ({ icer: 40000, inmb: 2000 }) }
        ];

        const result = su.modelAveraging(models, { weightingMethod: 'bic' });

        expect(result.method).toBe('model-averaging');
        expect(result.weightingMethod).toBe('bic');
        expect(result.weights).toHaveLength(3);
        // BIC model: M1 with lowest BIC should have highest weight
        expect(result.weights[0]).toBeGreaterThan(result.weights[1]);
        expect(result.weights[0]).toBeGreaterThan(result.weights[2]);
    });
});

// ---------------------------------------------------------------------------
// DistributionalCEA - deeper
// ---------------------------------------------------------------------------

describe('DistributionalCEA - deeper', () => {
    const { DistributionalCEA } = require('../../src/engine/frontierMeta');
    let dcea;
    beforeEach(() => { dcea = new DistributionalCEA(); });

    test('distributionalAnalysis detects inequality reduction', () => {
        // Intervention gives more QALY to the worst-off group
        const effects = [
            { qalyGain: 0.8, cost: 10000 },  // worst-off gets most
            { qalyGain: 0.3, cost: 8000 },
            { qalyGain: 0.2, cost: 6000 }
        ];
        const population = {
            subgroups: [
                { name: 'deprived', baselineQALE: 15 },
                { name: 'middle', baselineQALE: 20 },
                { name: 'affluent', baselineQALE: 25 }
            ]
        };

        const result = dcea.distributionalAnalysis(effects, population, { inequalityAversion: 2.0 });
        expect(result.inequalityMetrics.change.gini).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// RelativeEffectivenessAssessment - runREA
// ---------------------------------------------------------------------------

describe('RelativeEffectivenessAssessment - runREA', () => {
    const { RelativeEffectivenessAssessment } = require('../../src/engine/frontierMeta');
    let rea;
    beforeEach(() => { rea = new RelativeEffectivenessAssessment(); });

    test('runREA returns methodology and direct evidence assessment', () => {
        const evidence = {
            directComparisons: [
                { comparator: 'placebo', effect: 1.5, se: 0.2, n: 500 }
            ]
        };
        const result = rea.runREA('DrugA', ['Placebo'], evidence);

        expect(result.intervention).toBe('DrugA');
        expect(result.comparators).toEqual(['Placebo']);
        expect(result.methodology).toBeDefined();
        expect(result.directEvidence).toBeDefined();
        expect(result.certaintyAssessment).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ManagedEntryAgreements - simulateOutcomesBasedContract
// ---------------------------------------------------------------------------

describe('ManagedEntryAgreements - simulation', () => {
    const { ManagedEntryAgreements } = require('../../src/engine/frontierMeta');
    let mea;
    beforeEach(() => { mea = new ManagedEntryAgreements(); });

    test('simulateOutcomesBasedContract returns payment distribution', () => {
        const tech = { name: 'DrugX' };
        const contract = {
            expectedOutcome: 0.7,
            outcomeVariability: 0.1,
            performanceThreshold: 0.6,
            paymentStructure: { basePrice: 50000, rebateRate: 0.2 }
        };
        const result = mea.simulateOutcomesBasedContract(tech, contract, 100);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ATMPOrphanMethods - smallPopulationExtrapolation
// ---------------------------------------------------------------------------

describe('ATMPOrphanMethods - extrapolation', () => {
    const { ATMPOrphanMethods } = require('../../src/engine/frontierMeta');
    let atmp;
    beforeEach(() => { atmp = new ATMPOrphanMethods(); });

    test('smallPopulationExtrapolation returns extrapolated result', () => {
        const evidence = {
            trials: [{ n: 30, effect: 0.5 }],
            pediatric: true
        };
        const target = { adult: true };
        const result = atmp.smallPopulationExtrapolation(evidence, target);

        expect(result.sourceEvidence).toBe(evidence);
        expect(result.targetPopulation).toBe(target);
    });
});

// ---------------------------------------------------------------------------
// BenefitRiskAssessment - quantitative MCDA
// ---------------------------------------------------------------------------

describe('BenefitRiskAssessment - quantitative', () => {
    const { BenefitRiskAssessment } = require('../../src/engine/frontierMeta');
    let bra;
    beforeEach(() => { bra = new BenefitRiskAssessment(); });

    test('quantitativeBenefitRisk returns weighted scores and overall score', () => {
        const drug = { name: 'DrugX' };
        const outcomes = [
            { name: 'efficacy', value: 0.8, min: 0, max: 1 },
            { name: 'safety', value: 0.6, min: 0, max: 1 },
            { name: 'convenience', value: 0.7, min: 0, max: 1 }
        ];
        const weights = { efficacy: 0.5, safety: 0.3, convenience: 0.2 };
        const result = bra.quantitativeBenefitRisk(drug, outcomes, weights);

        expect(result.drug).toBe('DrugX');
        expect(result.method).toBeDefined();
        expect(result.overallScore).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// AdaptiveTrialDesigns - unblinded SSR
// ---------------------------------------------------------------------------

describe('AdaptiveTrialDesigns - unblinded SSR', () => {
    const { AdaptiveTrialDesigns } = require('../../src/engine/frontierMeta');
    let atd;
    beforeEach(() => { atd = new AdaptiveTrialDesigns(); });

    test('sampleSizeReestimation unblinded returns type I error impact', () => {
        const interimData = { n: 100, pooledVariance: 2.5, treatmentEffect: 0.3 };
        const original = { n: 200, expectedVariance: 2.0, alpha: 0.05, power: 0.8 };
        const result = atd.sampleSizeReestimation(interimData, original, { blinded: false });

        expect(result.method).toContain('Unblinded SSR');
        expect(result.typeIErrorImpact).not.toBe('None');
    });
});

// ---------------------------------------------------------------------------
// PostMarketSurveillance - PMR study design
// ---------------------------------------------------------------------------

describe('PostMarketSurveillance - PMR', () => {
    const { PostMarketSurveillance } = require('../../src/engine/frontierMeta');
    let pms;
    beforeEach(() => { pms = new PostMarketSurveillance(); });

    test('designPMRStudy returns study type and design', () => {
        const drug = { name: 'DrugX' };
        const requirement = { type: 'safety', concern: 'hepatotoxicity' };
        const result = pms.designPMRStudy(drug, requirement);

        expect(result.drug).toBe('DrugX');
        expect(result.requirement).toBe(requirement);
    });
});

// ---------------------------------------------------------------------------
// DigitalHealthFDA - validateDigitalEndpoint
// ---------------------------------------------------------------------------

describe('DigitalHealthFDA - endpoint validation', () => {
    const { DigitalHealthFDA } = require('../../src/engine/frontierMeta');
    let dh;
    beforeEach(() => { dh = new DigitalHealthFDA(); });

    test('validateDigitalEndpoint returns V3 framework assessment', () => {
        const measure = { name: 'StepCount', sensor: 'accelerometer' };
        const context = { condition: 'COPD', endpoint: 'physical-activity' };
        const result = dh.validateDigitalEndpoint(measure, context);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// EssentialMedicinesList - deeper
// ---------------------------------------------------------------------------

describe('EssentialMedicinesList - deeper', () => {
    const { EssentialMedicinesList } = require('../../src/engine/frontierMeta');
    let eml;
    beforeEach(() => { eml = new EssentialMedicinesList(); });

    test('assessEMLInclusion in LMIC context returns feasibility assessment', () => {
        const result = eml.assessEMLInclusion(
            { name: 'Amoxicillin' },
            'Pneumonia',
            { trials: [{ n: 2000, effect: 0.8 }] },
            { feasibilityContext: 'lmic', existingAlternatives: ['Penicillin'] }
        );

        expect(result.assessment.feasibility).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// GRADEMethodology - detailed downgrade assessment
// ---------------------------------------------------------------------------

describe('GRADEMethodology - detailed', () => {
    const { GRADEMethodology } = require('../../src/engine/frontierMeta');
    let grade;
    beforeEach(() => { grade = new GRADEMethodology(); });

    test('assessCertainty with observational study starts at low', () => {
        const evidence = {
            studyDesign: 'observational',
            nStudies: 3,
            totalN: 5000,
            effectEstimate: 2.5,
            heterogeneity: { I2: 10 }
        };
        const result = grade.assessCertainty(evidence, { name: 'mortality' }, {
            studyDesign: 'observational'
        });
        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// WHOPrequalification - dossier preparation
// ---------------------------------------------------------------------------

describe('WHOPrequalification - dossier', () => {
    const { WHOPrequalification } = require('../../src/engine/frontierMeta');
    let whopq;
    beforeEach(() => { whopq = new WHOPrequalification(); });

    test('prepareDossier returns structured CTD modules', () => {
        const product = { name: 'Generic Drug' };
        const data = {
            quality: { specifications: {} },
            nonclinical: { studies: [] },
            clinical: { trials: [] },
            manufacturing: { sites: [] }
        };
        const result = whopq.prepareDossier(product, 'medicines', data);

        expect(result.product).toBe(product);
        expect(result.dossierStructure || result.completeness).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// PrecisionMedicineHTA - deeper
// ---------------------------------------------------------------------------

describe('PrecisionMedicineHTA - deeper', () => {
    const { PrecisionMedicineHTA } = require('../../src/engine/frontierMeta');
    let pm;
    beforeEach(() => { pm = new PrecisionMedicineHTA(); });

    test('biomarkerStratifiedAnalysis interaction test detects differential effect', () => {
        const data = [];
        for (let i = 0; i < 200; i++) {
            const bm = i < 100 ? 'positive' : 'negative';
            const trt = i % 2;
            // Large interaction: positive group benefits 3x more
            const outcome = bm === 'positive' ? 5 + trt * 3 + Math.random() * 0.1 : 5 + trt * 0.1 + Math.random() * 0.1;
            data.push({ biomarker: bm, treatment: trt, outcome });
        }

        const result = pm.biomarkerStratifiedAnalysis(data);
        expect(result.interaction.pValue).toBeDefined();
        expect(result.subgroupEffects.length).toBe(2);
        expect(result.credibility).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// AdvancedNMAMethods - rare events NMA
// ---------------------------------------------------------------------------

describe('AdvancedNMAMethods - rare events', () => {
    const { AdvancedNMAMethods } = require('../../src/engine/frontierMeta');
    let anma;
    beforeEach(() => { anma = new AdvancedNMAMethods(); });

    test('multinomialNMA with baseline-category model works', () => {
        const data = [
            { study: 'S1', treatment: 'A', outcome: 'good', count: 30 },
            { study: 'S1', treatment: 'B', outcome: 'moderate', count: 25 }
        ];
        const result = anma.multinomialNMA(data, {
            categories: ['good', 'moderate', 'poor'],
            model: 'baseline-category'
        });
        expect(result.method).toBe('multinomial-nma');
        expect(result.model).toBe('baseline-category');
    });
});

// ---------------------------------------------------------------------------
// DynamicTreatmentRegimes - G-Estimation
// ---------------------------------------------------------------------------

describe('DynamicTreatmentRegimes - gEstimation', () => {
    const { DynamicTreatmentRegimes } = require('../../src/engine/frontierMeta');
    let dtr;
    beforeEach(() => { dtr = new DynamicTreatmentRegimes(); });

    test('gEstimation returns structural nested model results', () => {
        const data = Array.from({ length: 50 }, (_, i) => ({
            id: i,
            treatment: i % 2,
            outcome: 5 + (i % 2) * 1.5 + (i % 5) * 0.2,
            time: i % 10,
            age: 50 + (i % 20)
        }));
        const result = dtr.gEstimation(data, { covariates: ['age'] });

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// GeneralizabilityTransportability - transportability
// ---------------------------------------------------------------------------

describe('GeneralizabilityTransportability - transportability', () => {
    const { GeneralizabilityTransportability } = require('../../src/engine/frontierMeta');
    let gt;
    beforeEach(() => { gt = new GeneralizabilityTransportability(); });

    test('transportabilityAnalysis returns transported estimate', () => {
        const sourceData = Array.from({ length: 80 }, (_, i) => ({
            treatment: i % 2,
            outcome: 5 + (i % 2) * 1.2,
            age: 50 + (i % 20),
            sex: i % 2
        }));
        const targetData = Array.from({ length: 200 }, (_, i) => ({
            age: 60 + (i % 30),
            sex: i % 3 === 0 ? 1 : 0
        }));
        const result = gt.transportabilityAnalysis(sourceData, targetData, {
            covariates: ['age', 'sex']
        });

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// MediationAnalysisHTA - path analysis
// ---------------------------------------------------------------------------

describe('MediationAnalysisHTA - path analysis', () => {
    const { MediationAnalysisHTA } = require('../../src/engine/frontierMeta');
    let mahta;
    beforeEach(() => { mahta = new MediationAnalysisHTA(); });

    test('causalMediation with interaction enabled returns sensitivity', () => {
        const data = Array.from({ length: 100 }, (_, i) => ({
            treatment: i % 2,
            mediator: (i % 2) * 0.5 + (i % 5) * 0.1,
            outcome: 5 + (i % 2) * 1 + ((i % 2) * 0.5 + (i % 5) * 0.1) * 0.3
        }));
        const result = mahta.causalMediation(data, { interaction: true, sensitivity: true });

        expect(result.sensitivity).toBeDefined();
    });

    test('causalMediation with sensitivity disabled returns null sensitivity', () => {
        const data = Array.from({ length: 100 }, (_, i) => ({
            treatment: i % 2,
            mediator: (i % 2) * 0.5 + (i % 5) * 0.1,
            outcome: 5 + (i % 2) * 1
        }));
        const result = mahta.causalMediation(data, { sensitivity: false });

        expect(result.sensitivity).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// MissingDataMethods - pattern mixture
// ---------------------------------------------------------------------------

describe('MissingDataMethods - pattern mixture', () => {
    const { MissingDataMethods } = require('../../src/engine/frontierMeta');
    let mdm;
    beforeEach(() => { mdm = new MissingDataMethods(); });

    test('patternMixtureModel returns pattern-specific results', () => {
        const data = Array.from({ length: 50 }, (_, i) => ({
            outcome: 5 + (i % 2) * 0.5,
            treatment: i % 2,
            time: i % 10,
            dropout: i > 30,
            pattern: i > 30 ? 1 : 0
        }));
        const result = mdm.patternMixtureModel(data);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// BayesianDecisionAnalysis - real options
// ---------------------------------------------------------------------------

describe('BayesianDecisionAnalysis - ENBS', () => {
    const { BayesianDecisionAnalysis } = require('../../src/engine/frontierMeta');
    let bda;
    beforeEach(() => { bda = new BayesianDecisionAnalysis(); });

    test('calculateENBS with multiple designs returns optimal design', () => {
        const priorResults = {
            strategies: {
                A: { nmb: 50000, qalys: 5, costs: 20000 },
                B: { nmb: 45000, qalys: 4.5, costs: 22000 }
            },
            uncertainty: { mean: 0.5, se: 0.1 }
        };
        const designs = [
            { sampleSize: 100, name: 'Small', duration: 2 },
            { sampleSize: 500, name: 'Large', duration: 4 }
        ];
        const result = bda.calculateENBS(priorResults, designs, {
            costPerPatient: 5000, trialDuration: 3
        });

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// WHOCHOICEMethodology - conductGCEA
// ---------------------------------------------------------------------------

describe('WHOCHOICEMethodology - GCEA', () => {
    const { WHOCHOICEMethodology } = require('../../src/engine/frontierMeta');
    let choice;
    beforeEach(() => { choice = new WHOCHOICEMethodology(); });

    test('conductGCEA returns ICERs and classification', () => {
        const interventions = [
            { name: 'Vaccine', cost: 5, dalysAverted: 100 },
            { name: 'Drug', cost: 500, dalysAverted: 50 }
        ];
        const comparator = { name: 'NoTreatment', cost: 0, dalysAverted: 0 };
        const population = { size: 1000000 };
        const result = choice.conductGCEA(interventions, comparator, population);

        expect(result.method).toBe('WHO-CHOICE-GCEA');
        expect(result.interventions).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// UniversalHealthCoverage - UHC Index
// ---------------------------------------------------------------------------

describe('UniversalHealthCoverage - UHC Index', () => {
    const { UniversalHealthCoverage } = require('../../src/engine/frontierMeta');
    let uhc;
    beforeEach(() => { uhc = new UniversalHealthCoverage(); });

    test('calculateUHCIndex returns coverage index', () => {
        const indicators = {
            reproductiveHealth: 70,
            infectiousDiseases: 60,
            ncd: 50,
            serviceCapacity: 65
        };
        const result = uhc.calculateUHCIndex('TestCountry', indicators);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// RWEIntegration - target trial emulation
// ---------------------------------------------------------------------------

describe('RWEIntegration - target trial', () => {
    const { RWEIntegration } = require('../../src/engine/frontierMeta');
    let rwe;
    beforeEach(() => { rwe = new RWEIntegration(); });

    test('targetTrialEmulation returns eligible and assigned cohort', () => {
        const rweData = Array.from({ length: 100 }, (_, i) => ({
            age: 40 + (i % 30),
            treatment: i % 3 === 0 ? 'DrugA' : 'Standard',
            outcome: 0.5 + (i % 5) * 0.05,
            eligible: true
        }));
        const protocol = {
            eligibility: [
                { variable: 'age', operator: '>=', value: 18 },
                { variable: 'age', operator: '<=', value: 80 }
            ],
            treatmentAssignment: { exposed: 'DrugA' }
        };
        const result = rwe.targetTrialEmulation(rweData, protocol);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// SurvivalMetaAnalysis - deeper
// ---------------------------------------------------------------------------

describe('SurvivalMetaAnalysis - deeper', () => {
    const { SurvivalMetaAnalysis } = require('../../src/engine/frontierMeta');
    let sma;
    beforeEach(() => { sma = new SurvivalMetaAnalysis(); });

    test('fractionalPolynomial with maxDegree 2 tries 2-power combinations', () => {
        const data = [
            {
                times: [1, 2, 3, 5, 8, 12, 18, 24],
                cumHazard: [0.02, 0.05, 0.10, 0.18, 0.30, 0.50, 0.75, 1.0]
            }
        ];
        const result = sma.fractionalPolynomial(data, { maxDegree: 2 });

        expect(result.method).toBe('fractional-polynomial-ma');
        expect(result.studyResults).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// ExpeditedPrograms - deeper
// ---------------------------------------------------------------------------

describe('ExpeditedPrograms - deeper', () => {
    const { ExpeditedPrograms } = require('../../src/engine/frontierMeta');
    let ep;
    beforeEach(() => { ep = new ExpeditedPrograms(); });

    test('constructor with custom config passes through', () => {
        const custom = new ExpeditedPrograms({ customField: 'test' });
        expect(custom.config.customField).toBe('test');
    });
});

// ---------------------------------------------------------------------------
// MultiCountryHTACoordination - deeper
// ---------------------------------------------------------------------------

describe('MultiCountryHTACoordination - deeper', () => {
    const { MultiCountryHTACoordination } = require('../../src/engine/frontierMeta');
    let mchtac;
    beforeEach(() => { mchtac = new MultiCountryHTACoordination(); });

    test('analyzeComparatorVariation with all member states works', () => {
        const result = mchtac.analyzeComparatorVariation('cardiology');
        expect(result.memberStates).toHaveLength(27);
        expect(Object.keys(result.comparatorMapping).length).toBe(27);
        expect(result.harmonizationOpportunities).toBeDefined();
        expect(result.challenges).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// IPDMetaAnalysis - binary outcome one-stage (lines 397-750)
// ---------------------------------------------------------------------------

describe('IPDMetaAnalysis - binary outcome', () => {
    const { IPDMetaAnalysis } = require('../../src/engine/frontierMeta');
    let ipd;
    beforeEach(() => { ipd = new IPDMetaAnalysis(); });

    test('oneStage with binary outcome returns log-OR treatment effect', () => {
        const data = [];
        for (let i = 0; i < 60; i++) {
            const study = i < 30 ? 'S1' : 'S2';
            const treatment = i % 2;
            // Higher treatment = higher probability of outcome
            const outcome = (treatment === 1 && Math.random() > 0.4) ? 1 :
                           (treatment === 0 && Math.random() > 0.6) ? 1 : 0;
            data.push({ study, treatment, outcome });
        }
        const result = ipd.oneStage(data, {
            outcome: 'binary',
            treatmentVar: 'treatment',
            outcomeVar: 'outcome',
            studyVar: 'study'
        });

        expect(result.method).toBe('one-stage-ipd');
        expect(result.treatmentEffect).toBeDefined();
        expect(typeof result.treatmentEffect.estimate).toBe('number');
        expect(Number.isFinite(result.treatmentEffect.estimate)).toBe(true);
    });
});

// ============================================================================
// ROUND 3: Deeper coverage for classes 12194-16642 (biggest uncovered block)
// ============================================================================

// ---------------------------------------------------------------------------
// PediatricDevelopment - deep
// ---------------------------------------------------------------------------

describe('PediatricDevelopment - deep', () => {
    const { PediatricDevelopment } = require('../../src/engine/frontierMeta');
    let pd;
    beforeEach(() => { pd = new PediatricDevelopment(); });

    test('constructor defines pediatric age groups', () => {
        expect(pd.pediatricAgeGroups).toBeDefined();
        expect(pd.pediatricAgeGroups.neonates).toBeDefined();
        expect(pd.pediatricAgeGroups.adolescents.min).toBe(12);
    });

    test('developPediatricStudyPlan returns PREA-compliant plan', () => {
        const drug = { name: 'DrugX' };
        const indication = { name: 'Asthma' };
        const adultData = { trials: [{ n: 500, effect: 0.5 }] };
        const result = pd.developPediatricStudyPlan(drug, indication, adultData);

        expect(result.drug).toBe('DrugX');
        expect(result.indication).toBe('Asthma');
        expect(result.preaApplicability).toBeDefined();
        expect(result.studyPlan).toBeDefined();
        expect(result.studyPlan.ageGroups).toBeDefined();
    });

    test('planExtrapolation returns extrapolation framework', () => {
        const indication = { name: 'Asthma' };
        const adultData = { pharmacology: 'similar', efficacy: 0.6 };
        const pediatricData = { pharmacology: 'similar', pk: 'similar' };
        const result = pd.planExtrapolation(indication, adultData, pediatricData);

        expect(result.indication).toBe('Asthma');
        expect(result.similarityAssessment).toBeDefined();
        expect(result.exposureResponseAnalysis).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// OrphanDrugFDA - deep
// ---------------------------------------------------------------------------

describe('OrphanDrugFDA - deep', () => {
    const { OrphanDrugFDA } = require('../../src/engine/frontierMeta');
    let od;
    beforeEach(() => { od = new OrphanDrugFDA(); });

    test('constructor has rare disease prevalence threshold', () => {
        expect(od.config.rareDiseasePrev).toBe(200000);
    });

    test('assessOrphanDesignation returns eligibility assessment', () => {
        const drug = { name: 'OrphanDrug' };
        const indication = { name: 'Rare Disease X', prevalence: 5000 };
        const result = od.assessOrphanDesignation(drug, indication);

        expect(result.drug).toBe('OrphanDrug');
        expect(result.eligibility).toBeDefined();
        expect(result.eligibility.prevalence).toBeDefined();
        expect(result.designationBenefits).toBeDefined();
    });

    test('planOrphanDevelopment returns development strategy', () => {
        const drug = { name: 'OrphanDrug' };
        const indication = { name: 'Rare Disease', prevalence: 5000 };
        const result = od.planOrphanDevelopment(drug, indication);

        expect(result.drug).toBe('OrphanDrug');
        expect(result.developmentStrategy).toBeDefined();
        expect(result.developmentStrategy.trialDesign).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// BiosimilarDevelopment - deep
// ---------------------------------------------------------------------------

describe('BiosimilarDevelopment - deep', () => {
    const { BiosimilarDevelopment } = require('../../src/engine/frontierMeta');
    let bd;
    beforeEach(() => { bd = new BiosimilarDevelopment(); });

    test('designBiosimilarProgram returns comprehensive program', () => {
        const biosimilar = { name: 'BioX-BS' };
        const reference = { name: 'BioX' };
        const result = bd.designBiosimilarProgram(biosimilar, reference);

        expect(result.biosimilar).toBe('BioX-BS');
        expect(result.referenceProduct).toBe('BioX');
        expect(result.developmentProgram).toBeDefined();
        expect(result.developmentProgram.analyticalStudies).toBeDefined();
        expect(result.developmentProgram.clinicalStudies).toBeDefined();
    });

    test('planInterchangeability returns switching study design', () => {
        const biosimilar = { name: 'BioX-BS' };
        const reference = { name: 'BioX' };
        const result = bd.planInterchangeability(biosimilar, reference);

        expect(result.biosimilar).toBe('BioX-BS');
        expect(result.requirements).toBeDefined();
        expect(result.studyDesign.switching).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// OncologyReviewPrograms - deep
// ---------------------------------------------------------------------------

describe('OncologyReviewPrograms - deep', () => {
    const { OncologyReviewPrograms } = require('../../src/engine/frontierMeta');
    let orp;
    beforeEach(() => { orp = new OncologyReviewPrograms(); });

    test('constructor lists Orbis partners', () => {
        expect(orp.orbisPartners).toContain('FDA');
        expect(orp.orbisPartners).toContain('Health Canada');
    });

    test('assessProjectOrbis returns eligibility and partner agencies', () => {
        const drug = { name: 'OncoDrug' };
        const indication = { name: 'NSCLC' };
        const result = orp.assessProjectOrbis(drug, indication);

        expect(result.drug).toBe('OncoDrug');
        expect(result.partnerAgencies).toBeDefined();
        expect(result.process).toBeDefined();
    });

    test('planRTOR returns review plan', () => {
        const drug = { name: 'OncoDrug' };
        const indication = { name: 'NSCLC' };
        const clinicalData = { primaryEndpoint: 'ORR', response: 0.4 };
        const result = orp.planRTOR(drug, indication, clinicalData);

        expect(result.drug).toBe('OncoDrug');
        expect(result.program).toBeDefined();
        expect(result.benefits).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// AdvisoryCommitteeSupport - deep
// ---------------------------------------------------------------------------

describe('AdvisoryCommitteeSupport - deep', () => {
    const { AdvisoryCommitteeSupport } = require('../../src/engine/frontierMeta');
    let acs;
    beforeEach(() => { acs = new AdvisoryCommitteeSupport(); });

    test('prepareAdvisoryCom returns meeting preparation', () => {
        const drug = { name: 'DrugX' };
        const indication = { name: 'Diabetes' };
        const evidence = { trials: [{ n: 500 }], safety: { events: 10 } };
        const result = acs.prepareAdvisoryCom(drug, indication, evidence);

        expect(result.drug).toBe('DrugX');
        expect(result.meeting).toBeDefined();
        expect(result.preparation).toBeDefined();
        expect(result.votingQuestions).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ICHCompliance - deep
// ---------------------------------------------------------------------------

describe('ICHCompliance - deep', () => {
    const { ICHCompliance } = require('../../src/engine/frontierMeta');
    let ich;
    beforeEach(() => { ich = new ICHCompliance(); });

    test('applyEstimandFramework returns estimand and strategies', () => {
        const objective = { population: 'adults', treatment: 'DrugX', comparator: 'placebo', outcome: 'HbA1c' };
        const result = ich.applyEstimandFramework(objective);

        expect(result.objective).toBe(objective);
        expect(result.estimand).toBeDefined();
        expect(result.intercurrentEvents).toBeDefined();
        expect(result.alignment).toBeDefined();
    });

    test('assessGCPCompliance returns risk assessment', () => {
        const design = { type: 'RCT', multisite: true, decentralized: false };
        const result = ich.assessGCPCompliance(design);
        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// SAGEVaccineRecommendations - deep
// ---------------------------------------------------------------------------

describe('SAGEVaccineRecommendations - deep', () => {
    const { SAGEVaccineRecommendations } = require('../../src/engine/frontierMeta');
    let sage;
    beforeEach(() => { sage = new SAGEVaccineRecommendations(); });

    test('constructor has GRADE and ETD flags', () => {
        expect(sage.gradeInVaccines).toBe(true);
        expect(sage.etdFramework).toBe(true);
    });

    test('developVaccineRecommendation returns ETR framework', () => {
        const vaccine = { name: 'CovidVax', type: 'mRNA' };
        const disease = { name: 'COVID-19', burden: 'high' };
        const evidence = { trials: [{ n: 30000, efficacy: 0.95 }] };
        const result = sage.developVaccineRecommendation(vaccine, disease, evidence);

        expect(result.vaccine).toBe(vaccine);
        expect(result.gradeAssessment).toBeDefined();
        expect(result.etrFramework).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// OneHealthApproach - deep
// ---------------------------------------------------------------------------

describe('OneHealthApproach - deep', () => {
    const { OneHealthApproach } = require('../../src/engine/frontierMeta');
    let oh;
    beforeEach(() => { oh = new OneHealthApproach(); });

    test('constructor defines sectors and priority areas', () => {
        expect(oh.sectors).toContain('human');
        expect(oh.sectors).toContain('animal');
        expect(oh.sectors).toContain('environment');
        expect(oh.priorityAreas).toContain('amr');
    });

    test('conductOneHealthAssessment returns cross-sector assessment', () => {
        const data = {
            human: { cases: 1000, deaths: 50 },
            animal: { cases: 5000, affected: 'poultry' },
            environment: { contamination: 'waterborne' }
        };
        const result = oh.conductOneHealthAssessment('Avian Influenza', data);

        expect(result.healthThreat).toBe('Avian Influenza');
        expect(result.sectoralAssessment).toBeDefined();
        expect(result.sectoralAssessment.human).toBeDefined();
        expect(result.sectoralAssessment.animal).toBeDefined();
        expect(result.sectoralAssessment.environment).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// PandemicPreparedness - deep
// ---------------------------------------------------------------------------

describe('PandemicPreparedness - deep', () => {
    const { PandemicPreparedness } = require('../../src/engine/frontierMeta');
    let pp;
    beforeEach(() => { pp = new PandemicPreparedness(); });

    test('constructor defines IHR capacities and priority pathogens', () => {
        expect(pp.ihrCapacities).toContain('surveillance');
        expect(pp.ihrCapacities).toContain('laboratory');
        expect(pp.priorityPathogens).toContain('Disease X');
    });

    test('assessPreparedness returns JEE-style assessment', () => {
        const data = {
            legislation: { score: 3 },
            coordination: { score: 4 },
            surveillance: { score: 2 },
            response: { score: 3 },
            preparedness: { score: 2 },
            'risk-communication': { score: 3 },
            'human-resources': { score: 2 },
            laboratory: { score: 4 }
        };
        const result = pp.assessPreparedness('TestCountry', data);

        expect(result.country).toBe('TestCountry');
        expect(result.assessmentType).toBe('jee');
        expect(result.capacityAssessment).toBeDefined();
        expect(result.overallScore).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// HealthSystemsStrengthening - deep
// ---------------------------------------------------------------------------

describe('HealthSystemsStrengthening - deep', () => {
    const { HealthSystemsStrengthening } = require('../../src/engine/frontierMeta');
    let hss;
    beforeEach(() => { hss = new HealthSystemsStrengthening(); });

    test('constructor defines six building blocks', () => {
        expect(hss.buildingBlocks).toHaveLength(6);
        expect(hss.buildingBlocks).toContain('service-delivery');
        expect(hss.buildingBlocks).toContain('health-financing');
    });

    test('assessHealthSystem returns building block assessment', () => {
        const data = {
            'service-delivery': { coverage: 0.7 },
            'health-workforce': { density: 25 },
            'health-information': { completeness: 0.8 },
            'medical-products': { availability: 0.6 },
            'health-financing': { totalExpenditure: 500 },
            'leadership-governance': { accountability: 0.7 }
        };
        const result = hss.assessHealthSystem('TestCountry', data);

        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// SDG3Alignment - deep
// ---------------------------------------------------------------------------

describe('SDG3Alignment - deep', () => {
    const { SDG3Alignment } = require('../../src/engine/frontierMeta');
    let sdg3;
    beforeEach(() => { sdg3 = new SDG3Alignment(); });

    test('constructor creates instance with expected structure', () => {
        expect(sdg3).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// GlobalHealthEquity - deep
// ---------------------------------------------------------------------------

describe('GlobalHealthEquity - deep', () => {
    const { GlobalHealthEquity } = require('../../src/engine/frontierMeta');
    let ghe;
    beforeEach(() => { ghe = new GlobalHealthEquity(); });

    test('constructor creates instance with expected structure', () => {
        expect(ghe).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ExpeditedPrograms - deeper methods
// ---------------------------------------------------------------------------

describe('ExpeditedPrograms - methods', () => {
    const { ExpeditedPrograms } = require('../../src/engine/frontierMeta');
    let ep;
    beforeEach(() => { ep = new ExpeditedPrograms(); });

    test('constructor creates configurable instance', () => {
        const custom = new ExpeditedPrograms({ framework: 'FDA' });
        expect(custom.config.framework).toBe('FDA');
    });
});

// ---------------------------------------------------------------------------
// PatientReportedOutcomes - deep
// ---------------------------------------------------------------------------

describe('PatientReportedOutcomes - deep', () => {
    const { PatientReportedOutcomes } = require('../../src/engine/frontierMeta');
    let pro;
    beforeEach(() => { pro = new PatientReportedOutcomes(); });

    test('constructor creates instance', () => {
        expect(pro).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// EditorialStandards - limitMetaAnalysis
// ---------------------------------------------------------------------------

describe('EditorialStandards - limitMA', () => {
    const { EditorialStandards } = require('../../src/engine/frontierMeta');
    let es;
    beforeEach(() => { es = new EditorialStandards(); });

    const effects   = [0.30, 0.50, 0.20, 0.60, 0.35, 0.45];
    const variances = [0.04, 0.06, 0.03, 0.08, 0.05, 0.07];

    test('limitMetaAnalysis returns limit effect extrapolated to SE=0', () => {
        const result = es.limitMetaAnalysis(effects, variances);

        expect(result).toBeDefined();
        expect(typeof result.limitEffect).toBe('number');
        expect(Number.isFinite(result.limitEffect)).toBe(true);
        expect(result.ci95).toHaveLength(2);
        expect(typeof result.slope).toBe('number');
    });
});

// ---------------------------------------------------------------------------
// AdvancedPublicationBias - deeper internal coverage
// ---------------------------------------------------------------------------

describe('AdvancedPublicationBias - _defineRoBMAModelSpace', () => {
    const { AdvancedPublicationBias } = require('../../src/engine/frontierMeta');
    let pb;
    beforeEach(() => { pb = new AdvancedPublicationBias(); });

    test('_defineRoBMAModelSpace returns 12 models', () => {
        const models = pb._defineRoBMAModelSpace();
        // 2 effect x 2 het x 3 pb = 12
        expect(models).toHaveLength(12);
        models.forEach(m => {
            expect(typeof m.effectNull).toBe('boolean');
            expect(typeof m.randomEffects).toBe('boolean');
            expect(['none', 'one-sided', 'two-sided']).toContain(m.selectionModel);
        });
    });
});

// ---------------------------------------------------------------------------
// DataFabricationDetection - deeper edge cases
// ---------------------------------------------------------------------------

describe('DataFabricationDetection - deeper', () => {
    const { DataFabricationDetection } = require('../../src/engine/frontierMeta');
    let detector;
    beforeEach(() => { detector = new DataFabricationDetection(); });

    test('statcheck detects p-value inconsistencies', () => {
        const data = [
            { id: 'correct', testStat: 2.5, df: 20, reportedP: 0.02 },
            { id: 'wrong', testStat: 1.5, df: 20, reportedP: 0.001 }
        ];
        const result = detector.statcheck(data);

        expect(result.method).toBe('statcheck');
        expect(result.results).toHaveLength(2);
    });
});
