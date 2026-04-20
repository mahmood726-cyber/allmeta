/**
 * Tests for src/engine/regulatoryTemplates.js — Regulatory Template Engine
 */

'use strict';

const { RegulatoryTemplateEngine } = require('../../src/engine/regulatoryTemplates');

// ============ HELPERS ============

function makeAnalysisResults(overrides = {}) {
    return {
        intervention: 'Drug X 100mg',
        comparators: ['Placebo', 'Drug Y 50mg'],
        population: 'Adults with advanced NSCLC',
        diseaseContext: 'Non-small cell lung cancer',
        outcomes: ['Overall Survival', 'Progression-Free Survival', 'Quality of Life'],
        subgroups: ['PD-L1 ≥50%', 'PD-L1 1-49%'],
        endOfLife: true,
        severity: 'High',
        innovation: true,
        studies: [
            { name: 'TRIAL-001', design: 'RCT', n: 500, population: 'Advanced NSCLC', intervention: 'Drug X', comparator: 'Placebo', followUp: '24 months' },
            { name: 'TRIAL-002', design: 'RCT', n: 300, population: 'Advanced NSCLC', intervention: 'Drug X', comparator: 'Drug Y', followUp: '18 months' }
        ],
        metaAnalysis: {
            pooledEffects: [
                { outcome: 'OS', estimate: 0.75, ci: [0.60, 0.94], measure: 'HR' },
                { outcome: 'PFS', estimate: 0.65, ci: [0.50, 0.85], measure: 'HR' }
            ],
            I2: 30,
            tau2: 0.02,
            Q: 4.5,
            pHeterogeneity: 0.34
        },
        riskOfBias: { summary: 'Low risk overall' },
        costEffectiveness: {
            modelStructure: 'Partitioned survival model',
            baseCase: { icer: 35000, costPerQaly: 35000, totalCosts: 125000, totalQalys: 5.2 },
            clinicalParameters: [{ name: 'HR OS', value: 0.75, source: 'TRIAL-001', distribution: 'lognormal' }],
            costParameters: [{ name: 'Drug cost', value: 5000, source: 'BNF', year: '2024' }],
            utilityParameters: [{ name: 'Progression-free', value: 0.78, source: 'EQ-5D', method: 'TTO' }]
        },
        psaResults: {
            meanICER: 37500,
            ci95: [22000, 55000],
            ceacData: [{ wtp: 30000, prob: 0.45 }, { wtp: 50000, prob: 0.72 }],
            iterations: 1000
        },
        scenarioAnalysis: [
            { name: 'Shorter horizon', icer: 42000 },
            { name: 'Higher discount', icer: 38000 }
        ],
        budgetImpact: {
            eligiblePopulation: 5000,
            marketUptake: [0.1, 0.25, 0.4],
            yearlyBudget: [
                { year: 1, cost: 2500000 },
                { year: 2, cost: 6250000 },
                { year: 3, cost: 10000000 }
            ],
            netBudgetImpact: 18750000,
            totalIncremental: 18750000
        },
        nmaResults: {
            network: { treatments: ['Drug X', 'Placebo', 'Drug Y'] },
            rankings: { 'Drug X': 0.85, 'Drug Y': 0.55, 'Placebo': 0.10 },
            leagueTable: {},
            consistency: { p: 0.67 }
        },
        systematicReview: {
            databases: ['MEDLINE', 'Embase', 'Cochrane CENTRAL'],
            searchStrategy: 'NSCLC AND (Drug X OR intervention)',
            prismaFlow: { identified: 500, screened: 300, eligible: 50, included: 2 }
        },
        ...overrides
    };
}

// ============ TESTS ============

describe('RegulatoryTemplateEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new RegulatoryTemplateEngine();
    });

    // ------------------------------------------------------------------
    // NICE STA
    // ------------------------------------------------------------------

    test('1. NICE STA has 4 sections (A-D)', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        expect(result.sectionA).toBeDefined();
        expect(result.sectionB).toBeDefined();
        expect(result.sectionC).toBeDefined();
        expect(result.sectionD).toBeDefined();
        expect(result.agency).toBe('NICE');
    });

    test('2. NICE section A has decision problem fields', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        const a = result.sectionA;
        expect(a.diseaseContext).toBe('Non-small cell lung cancer');
        expect(a.population).toBe('Adults with advanced NSCLC');
        expect(a.intervention).toBe('Drug X 100mg');
        expect(a.comparators).toEqual(['Placebo', 'Drug Y 50mg']);
        expect(a.outcomes).toContain('Overall Survival');
        expect(a.subgroups).toContain('PD-L1 ≥50%');
        expect(a.specialConsiderations).toBeDefined();
        expect(a.specialConsiderations.endOfLife).toBe(true);
        expect(a.specialConsiderations.severity).toBe('High');
        expect(a.specialConsiderations.innovation).toBe(true);
    });

    test('3. NICE section C has ICER and PSA results', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        const c = result.sectionC;
        expect(c.baseCase.icer).toBe(35000);
        expect(c.baseCase.costPerQaly).toBe(35000);
        expect(c.baseCase.totalCosts).toBe(125000);
        expect(c.baseCase.totalQalys).toBe(5.2);
        expect(c.psaResults.meanICER).toBe(37500);
        expect(c.psaResults.ci95).toEqual([22000, 55000]);
        expect(c.psaResults.iterations).toBe(1000);
    });

    test('4. NICE section B has clinical effectiveness with NMA', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        const b = result.sectionB;
        expect(b.systematicReview.databases).toHaveLength(3);
        expect(b.clinicalResults.heterogeneity.I2).toBe(30);
        expect(b.nmaResults.available).toBe(true);
        expect(b.nmaResults.rankings).toBeDefined();
    });

    test('5. NICE section D has budget impact', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        const d = result.sectionD;
        expect(d.eligiblePopulation).toBe(5000);
        expect(d.marketUptake).toEqual([0.1, 0.25, 0.4]);
        expect(d.budgetImpact).toHaveLength(3);
        expect(d.netBudgetImpact).toBe(18750000);
    });

    // ------------------------------------------------------------------
    // CADTH
    // ------------------------------------------------------------------

    test('6. CADTH has executive summary', () => {
        const result = engine.generateCADTH(makeAnalysisResults());
        expect(result.agency).toBe('CADTH');
        expect(result.executiveSummary).toBeDefined();
        expect(result.executiveSummary.title).toBe('Executive Summary');
        expect(result.executiveSummary.drugName).toBe('Drug X 100mg');
    });

    test('7. CADTH has clinical review section', () => {
        const result = engine.generateCADTH(makeAnalysisResults());
        expect(result.clinicalReview).toBeDefined();
        expect(result.clinicalReview.pivotalStudies).toHaveLength(2);
    });

    test('8. CADTH has economic evaluation', () => {
        const result = engine.generateCADTH(makeAnalysisResults());
        expect(result.economicEvaluation).toBeDefined();
        expect(result.economicEvaluation.results.icer).toBe(35000);
    });

    test('9. CADTH has budget impact', () => {
        const result = engine.generateCADTH(makeAnalysisResults());
        expect(result.budgetImpact).toBeDefined();
        expect(result.budgetImpact.netImpact).toBe(18750000);
    });

    // ------------------------------------------------------------------
    // EUnetHTA
    // ------------------------------------------------------------------

    test('10. EUnetHTA has 5 core model domains', () => {
        const result = engine.generateEUnetHTA(makeAnalysisResults());
        expect(result.agency).toBe('EUnetHTA');
        expect(result.healthProblem).toBeDefined();
        expect(result.technology).toBeDefined();
        expect(result.safety).toBeDefined();
        expect(result.clinicalEffectiveness).toBeDefined();
        expect(result.costs).toBeDefined();
    });

    test('11. EUnetHTA health problem domain has required fields', () => {
        const result = engine.generateEUnetHTA(makeAnalysisResults());
        expect(result.healthProblem.diseaseDescription).toBe('Non-small cell lung cancer');
        expect(result.healthProblem.targetPopulation).toBe('Adults with advanced NSCLC');
    });

    test('12. EUnetHTA technology domain has comparators', () => {
        const result = engine.generateEUnetHTA(makeAnalysisResults());
        expect(result.technology.name).toBe('Drug X 100mg');
        expect(result.technology.comparators).toEqual(['Placebo', 'Drug Y 50mg']);
    });

    // ------------------------------------------------------------------
    // PBAC
    // ------------------------------------------------------------------

    test('13. PBAC has clinical claim section', () => {
        const result = engine.generatePBAC(makeAnalysisResults());
        expect(result.agency).toBe('PBAC');
        expect(result.clinicalClaim).toBeDefined();
        expect(result.clinicalClaim.title).toBe('Clinical Claim');
        expect(result.clinicalClaim.intervention).toBe('Drug X 100mg');
    });

    test('14. PBAC has trial evidence', () => {
        const result = engine.generatePBAC(makeAnalysisResults());
        expect(result.trialEvidence).toBeDefined();
        expect(result.trialEvidence.includedTrials).toHaveLength(2);
    });

    test('15. PBAC has economic analysis with type inference', () => {
        const result = engine.generatePBAC(makeAnalysisResults());
        expect(result.economicAnalysis).toBeDefined();
        expect(result.economicAnalysis.baseCase.icer).toBe(35000);
        expect(result.economicAnalysis.type).toBe('cost-utility');
    });

    test('16. PBAC has financial estimates', () => {
        const result = engine.generatePBAC(makeAnalysisResults());
        expect(result.financialEstimates).toBeDefined();
        expect(result.financialEstimates.estimatedUtilisation).toBe(5000);
    });

    // ------------------------------------------------------------------
    // G-BA AMNOG
    // ------------------------------------------------------------------

    test('17. G-BA has 5 modules', () => {
        const result = engine.generateGBA(makeAnalysisResults());
        expect(result.agency).toBe('GBA');
        expect(result.module1).toBeDefined();
        expect(result.module2).toBeDefined();
        expect(result.module3).toBeDefined();
        expect(result.module4).toBeDefined();
        expect(result.module5).toBeDefined();
    });

    test('18. G-BA module 1 has administrative info', () => {
        const result = engine.generateGBA(makeAnalysisResults());
        expect(result.module1.title).toContain('Module 1');
        expect(result.module1.drugName).toBe('Drug X 100mg');
    });

    test('19. G-BA module 3 has evidence dossier', () => {
        const result = engine.generateGBA(makeAnalysisResults());
        expect(result.module3.includedStudies).toHaveLength(2);
        expect(result.module3.results.heterogeneity.I2).toBe(30);
    });

    test('20. G-BA module 5 has budget impact', () => {
        const result = engine.generateGBA(makeAnalysisResults());
        expect(result.module5.totalBudgetImpact).toBe(18750000);
    });

    // ------------------------------------------------------------------
    // Each agency template has required fields
    // ------------------------------------------------------------------

    test('21. Each agency template has required fields', () => {
        const ar = makeAnalysisResults();
        const nice = engine.generateNICESTA(ar);
        const cadth = engine.generateCADTH(ar);
        const eunet = engine.generateEUnetHTA(ar);
        const pbac = engine.generatePBAC(ar);
        const gba = engine.generateGBA(ar);

        // All have agency identifier
        expect(nice.agency).toBe('NICE');
        expect(cadth.agency).toBe('CADTH');
        expect(eunet.agency).toBe('EUnetHTA');
        expect(pbac.agency).toBe('PBAC');
        expect(gba.agency).toBe('GBA');

        // All have template version
        expect(nice.templateVersion).toBeDefined();
        expect(cadth.templateVersion).toBeDefined();
        expect(eunet.templateVersion).toBeDefined();
        expect(pbac.templateVersion).toBeDefined();
        expect(gba.templateVersion).toBeDefined();
    });

    // ------------------------------------------------------------------
    // Export methods
    // ------------------------------------------------------------------

    test('22. exportAsHTML returns valid HTML string', () => {
        const submission = engine.generateNICESTA(makeAnalysisResults());
        const html = engine.exportAsHTML(submission, 'NICE');
        expect(typeof html).toBe('string');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
        expect(html).toContain('NICE');
        expect(html).toContain('<h2');
    });

    test('23. exportAsMarkdown returns valid markdown', () => {
        const submission = engine.generateNICESTA(makeAnalysisResults());
        const md = engine.exportAsMarkdown(submission, 'NICE');
        expect(typeof md).toBe('string');
        expect(md).toContain('# NICE');
        expect(md).toContain('##');
    });

    // ------------------------------------------------------------------
    // Missing results handled gracefully
    // ------------------------------------------------------------------

    test('24. Missing results handled gracefully — sections marked "Not available" or defaults', () => {
        const result = engine.generateNICESTA({});
        expect(result.sectionA.diseaseContext).toBe('Not specified');
        expect(result.sectionA.population).toBe('Not specified');
        expect(result.sectionA.intervention).toBe('Not specified');
        expect(result.sectionB.nmaResults.available).toBe(false);
        expect(result.sectionC.baseCase.icer).toBeNull();
        expect(result.sectionD.eligiblePopulation).toBeNull();
    });

    test('25. Missing results: CADTH handles null gracefully', () => {
        const result = engine.generateCADTH({});
        expect(result.executiveSummary.drugName).toBe('Not specified');
        expect(result.clinicalReview.pivotalStudies).toEqual([]);
    });

    test('26. Missing results: EUnetHTA handles null gracefully', () => {
        const result = engine.generateEUnetHTA({});
        expect(result.healthProblem.diseaseDescription).toBe('Not specified');
        expect(result.technology.comparators).toEqual([]);
    });

    // ------------------------------------------------------------------
    // Budget impact section populated from BIA results
    // ------------------------------------------------------------------

    test('27. Budget impact section populated from BIA results', () => {
        const ar = makeAnalysisResults();
        const nice = engine.generateNICESTA(ar);
        expect(nice.sectionD.budgetImpact[0].year).toBe(1);
        expect(nice.sectionD.budgetImpact[0].cost).toBe(2500000);
        expect(nice.sectionD.budgetImpact[2].cost).toBe(10000000);
    });

    // ------------------------------------------------------------------
    // PSA results mapped correctly
    // ------------------------------------------------------------------

    test('28. PSA results mapped correctly across agencies', () => {
        const ar = makeAnalysisResults();
        const nice = engine.generateNICESTA(ar);
        expect(nice.sectionC.psaResults.meanICER).toBe(37500);
        expect(nice.sectionC.psaResults.ceacData).toHaveLength(2);

        const cadth = engine.generateCADTH(ar);
        expect(cadth.economicEvaluation.sensitivityAnalysis.psa.meanICER).toBe(37500);
    });

    // ------------------------------------------------------------------
    // All 5 agencies produce non-empty output
    // ------------------------------------------------------------------

    test('29. All 5 agencies produce non-empty output', () => {
        const ar = makeAnalysisResults();
        const nice = engine.generateNICESTA(ar);
        const cadth = engine.generateCADTH(ar);
        const eunet = engine.generateEUnetHTA(ar);
        const pbac = engine.generatePBAC(ar);
        const gba = engine.generateGBA(ar);

        for (const sub of [nice, cadth, eunet, pbac, gba]) {
            const json = JSON.stringify(sub);
            expect(json.length).toBeGreaterThan(100);
        }
    });

    // ------------------------------------------------------------------
    // Agency names validated
    // ------------------------------------------------------------------

    test('30. Agency names validated', () => {
        expect(engine.isValidAgency('NICE')).toBe(true);
        expect(engine.isValidAgency('CADTH')).toBe(true);
        expect(engine.isValidAgency('EUnetHTA')).toBe(true);
        expect(engine.isValidAgency('PBAC')).toBe(true);
        expect(engine.isValidAgency('GBA')).toBe(true);
        expect(engine.isValidAgency('FDA')).toBe(false);
        expect(engine.isValidAgency('')).toBe(false);
    });

    // ------------------------------------------------------------------
    // Scenario analysis mapping
    // ------------------------------------------------------------------

    test('31. Scenario analysis mapped in NICE section C', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        expect(result.sectionC.scenarioAnalysis).toHaveLength(2);
        expect(result.sectionC.scenarioAnalysis[0].name).toBe('Shorter horizon');
        expect(result.sectionC.scenarioAnalysis[0].icer).toBe(42000);
    });

    // ------------------------------------------------------------------
    // Export HTML for different agencies
    // ------------------------------------------------------------------

    test('32. exportAsHTML works for all agencies', () => {
        const ar = makeAnalysisResults();
        const agencies = [
            { gen: () => engine.generateNICESTA(ar), name: 'NICE' },
            { gen: () => engine.generateCADTH(ar), name: 'CADTH' },
            { gen: () => engine.generateEUnetHTA(ar), name: 'EUnetHTA' },
            { gen: () => engine.generatePBAC(ar), name: 'PBAC' },
            { gen: () => engine.generateGBA(ar), name: 'GBA' }
        ];

        for (const a of agencies) {
            const html = engine.exportAsHTML(a.gen(), a.name);
            expect(html).toContain(a.name);
            expect(html).toContain('<html');
        }
    });

    // ------------------------------------------------------------------
    // Null/undefined submission export
    // ------------------------------------------------------------------

    test('33. exportAsHTML handles null submission', () => {
        const html = engine.exportAsHTML(null, 'NICE');
        expect(html).toContain('No submission data');
    });

    test('34. exportAsMarkdown handles null submission', () => {
        const md = engine.exportAsMarkdown(null, 'NICE');
        expect(md).toContain('No submission data');
    });

    // ------------------------------------------------------------------
    // NICE clinical parameters extracted correctly
    // ------------------------------------------------------------------

    test('35. Clinical parameters extracted with distribution', () => {
        const result = engine.generateNICESTA(makeAnalysisResults());
        const params = result.sectionC.clinicalParameters;
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('HR OS');
        expect(params[0].distribution).toBe('lognormal');
    });
});
