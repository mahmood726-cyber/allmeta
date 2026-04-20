/**
 * Tests for src/engine/advancedValidation.js
 */

'use strict';

const {
    ClinicalBoundsValidator,
    CrossValidator,
    RECORDPEChecklist,
    TechnicalVerification,
    ExternalValidityAssessment,
    ValidationOrchestrator
} = require('../../src/engine/advancedValidation');

// ============================================================
// ClinicalBoundsValidator
// ============================================================

describe('ClinicalBoundsValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new ClinicalBoundsValidator();
    });

    test('validates a value within hard bounds as valid', () => {
        const result = validator.validateParameter(0.05, 'mortality', 'allCause');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('rejects a value below the minimum bound', () => {
        const result = validator.validateParameter(-0.1, 'mortality', 'allCause');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('below minimum');
    });

    test('rejects a value above the maximum bound', () => {
        const result = validator.validateParameter(1.5, 'transitions', 'diseaseProgression');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('above maximum');
    });

    test('issues a warning when value falls outside typical range', () => {
        // allCause typical range is [0.001, 0.5] — 0.9 is within hard bounds but atypical
        const result = validator.validateParameter(0.9, 'mortality', 'allCause');
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('outside typical range');
    });

    test('issues a warning when value exceeds the warning threshold for costs', () => {
        // drugAcquisition warning threshold is 500000
        const result = validator.validateParameter(600000, 'costs', 'drugAcquisition');
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('exceeds warning threshold'))).toBe(true);
    });

    test('returns valid with message for unknown category/subcategory', () => {
        const result = validator.validateParameter(42, 'nonexistent', 'category');
        expect(result.valid).toBe(true);
        expect(result.message).toBe('No bounds defined');
    });

    test('validateModel counts errors, warnings, and valid parameters', () => {
        const parameters = {
            p1: { value: 0.05, category: 'mortality', subcategory: 'allCause' },
            p2: { value: -0.5, category: 'mortality', subcategory: 'cardiovascular' },
            p3: { value: 0.9, category: 'mortality', subcategory: 'allCause' } // atypical but valid
        };

        const results = validator.validateModel(parameters);
        expect(results.totalParameters).toBe(3);
        expect(results.valid).toBe(2);  // p1 and p3 within hard bounds
        expect(results.errors).toBe(1); // p2 below minimum
        expect(results.warnings).toBe(2); // p2 outside typical + p3 outside typical
        expect(results.details).toHaveLength(3);
    });

    test('validateTransitionMatrix detects row sum not equal to 1', () => {
        const matrix = [
            [0.5, 0.3],  // sum = 0.8, not 1
            [0.0, 1.0]
        ];
        const result = validator.validateTransitionMatrix(matrix, ['Alive', 'Dead']);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.message.includes('Row sum'))).toBe(true);
    });

    test('validateTransitionMatrix detects negative probabilities', () => {
        const matrix = [
            [1.1, -0.1],
            [0.0, 1.0]
        ];
        const result = validator.validateTransitionMatrix(matrix, ['Alive', 'Dead']);
        expect(result.issues.some(i => i.message.includes('Negative probability'))).toBe(true);
    });

    test('validateTransitionMatrix detects death-to-alive clinical impossibility', () => {
        const matrix = [
            [0.8, 0.2],
            [0.1, 0.9] // Dead -> Alive = 0.1
        ];
        const result = validator.validateTransitionMatrix(matrix, ['Alive', 'Death']);
        expect(result.issues.some(i =>
            i.message.includes('Clinical impossibility')
        )).toBe(true);
    });

    test('validateTransitionMatrix warns when no absorbing states', () => {
        const matrix = [
            [0.5, 0.5],
            [0.3, 0.7]
        ];
        const result = validator.validateTransitionMatrix(matrix, ['A', 'B']);
        expect(result.issues.some(i => i.message.includes('No absorbing states'))).toBe(true);
    });

    test('addBounds allows custom bounds and validates against them', () => {
        validator.addBounds('custom', 'score', { min: 0, max: 100 });
        const valid = validator.validateParameter(50, 'custom', 'score');
        expect(valid.valid).toBe(true);

        const invalid = validator.validateParameter(150, 'custom', 'score');
        expect(invalid.valid).toBe(false);
    });

    test('getViolationsSummary tracks violations from validateModel', () => {
        const parameters = {
            bad: { value: -1, category: 'mortality', subcategory: 'allCause' }
        };
        validator.validateModel(parameters);
        const summary = validator.getViolationsSummary();
        expect(summary.count).toBe(1);
        expect(summary.violations).toHaveLength(1);
    });
});

// ============================================================
// CrossValidator
// ============================================================

describe('CrossValidator', () => {
    let cv;

    beforeEach(() => {
        cv = new CrossValidator({ folds: 3, seed: 42 });
    });

    test('kFoldCV splits data and returns per-fold metrics', () => {
        const data = Array.from({ length: 9 }, (_, i) => ({
            x: i,
            outcome: i * 2
        }));

        const modelFn = (trainData) => ({
            predict: (d) => d.x * 2
        });

        const metricFn = (actuals, predictions) => {
            const mse = actuals.reduce((s, a, i) => s + (a - predictions[i]) ** 2, 0) / actuals.length;
            return Math.sqrt(mse);
        };

        const result = cv.kFoldCV(data, modelFn, metricFn);
        expect(result.folds).toHaveLength(3);
        expect(result.mean).toBeDefined();
        expect(result.std).toBeDefined();
        // Perfect model should get RMSE = 0
        expect(result.mean).toBeCloseTo(0, 10);
    });

    test('looCV returns per-sample results with error metrics', () => {
        const data = [
            { x: 1, outcome: 2 },
            { x: 2, outcome: 4 },
            { x: 3, outcome: 6 }
        ];

        const modelFn = (trainData) => ({
            predict: (d) => d.x * 2
        });

        const metricFn = (actuals, predictions) => 0;

        const result = cv.looCV(data, modelFn, metricFn);
        expect(result.results).toHaveLength(3);
        expect(result.mse).toBeCloseTo(0, 10);
        expect(result.mae).toBeCloseTo(0, 10);
    });

    test('repeatedKFoldCV runs multiple repetitions', () => {
        const cv2 = new CrossValidator({ folds: 2, repeats: 3, seed: 42 });
        const data = Array.from({ length: 6 }, (_, i) => ({
            x: i,
            outcome: i
        }));

        const modelFn = () => ({ predict: (d) => d.x });
        const metricFn = (a, p) => a.reduce((s, v, i) => s + Math.abs(v - p[i]), 0) / a.length;

        const result = cv2.repeatedKFoldCV(data, modelFn, metricFn);
        expect(result.repeats).toHaveLength(3);
        expect(typeof result.overallMean).toBe('number');
        expect(typeof result.overallStd).toBe('number');
    });

    test('std returns 0 for fewer than 2 values', () => {
        expect(cv.std([5])).toBe(0);
        expect(cv.std([])).toBe(0);
    });

    test('percentile returns correct interpolated value', () => {
        const values = [10, 20, 30, 40, 50];
        expect(cv.percentile(values, 0)).toBe(10);
        expect(cv.percentile(values, 100)).toBe(50);
        expect(cv.percentile(values, 50)).toBe(30);
    });

    test('shuffle produces a permutation of the input', () => {
        cv.seed = 42;
        const arr = [1, 2, 3, 4, 5];
        const shuffled = cv.shuffle(arr);
        expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
        expect(arr).toEqual([1, 2, 3, 4, 5]); // original unchanged
    });
});

// ============================================================
// RECORDPEChecklist
// ============================================================

describe('RECORDPEChecklist', () => {
    let checklist;

    beforeEach(() => {
        checklist = new RECORDPEChecklist();
    });

    test('initializes with 24 top-level items', () => {
        expect(checklist.items.length).toBe(24);
    });

    test('setResponse and getResponse round-trip correctly', () => {
        checklist.setResponse('1', { response: 'yes', pageReference: 'p.1' });
        const resp = checklist.getResponse('1');
        expect(resp.response).toBe('yes');
        expect(resp.pageReference).toBe('p.1');
        expect(resp.timestamp).toBeTruthy();
    });

    test('calculateScore returns zero when no responses given', () => {
        const score = checklist.calculateScore();
        expect(score.applicable).toBe(0);
        expect(score.score).toBe(0);
    });

    test('calculateScore counts compliant, partial, and non-compliant', () => {
        checklist.setResponse('1', { response: 'yes' });
        checklist.setResponse('2', { response: 'partial' });
        checklist.setResponse('3', { response: 'no' });
        checklist.setResponse('4', { response: 'na' }); // should be excluded

        const score = checklist.calculateScore();
        expect(score.applicable).toBe(3);
        expect(score.compliant).toBe(1);
        expect(score.partial).toBe(1);
        expect(score.nonCompliant).toBe(1);
        // score = (1 + 0.5*1) / 3 = 0.5
        expect(score.score).toBeCloseTo(0.5, 10);
    });

    test('getSections returns unique section names', () => {
        const sections = checklist.getSections();
        expect(sections).toContain('Title and Abstract');
        expect(sections).toContain('Methods');
        expect(sections).toContain('Results');
        expect(sections).toContain('Discussion');
        expect(new Set(sections).size).toBe(sections.length);
    });

    test('getItemsBySection filters correctly', () => {
        const introItems = checklist.getItemsBySection('Introduction');
        expect(introItems.length).toBeGreaterThanOrEqual(1);
        expect(introItems.every(i => i.section === 'Introduction')).toBe(true);
    });

    test('getMissingItems lists all items without responses', () => {
        const missing = checklist.getMissingItems();
        // Should include all top-level items + all sub-items
        expect(missing.length).toBeGreaterThan(24);
    });

    test('getRecommendations prioritizes Methods section as high', () => {
        // Item 5 is in Methods section
        checklist.setResponse('5', { response: 'no' });
        // Item 19 is in Discussion section
        checklist.setResponse('19', { response: 'no' });

        const recs = checklist.getRecommendations();
        expect(recs.length).toBe(2);
        expect(recs[0].priority).toBe('high'); // Methods first
    });

    test('exportJSON produces valid JSON with score', () => {
        checklist.setResponse('1', { response: 'yes' });
        const json = checklist.exportJSON();
        const parsed = JSON.parse(json);
        expect(parsed.checklist).toBe('RECORD-PE');
        expect(parsed.score).toBeDefined();
        expect(parsed.responses['1'].response).toBe('yes');
    });

    test('importJSON restores responses correctly', () => {
        checklist.setResponse('1', { response: 'yes' });
        checklist.setResponse('2', { response: 'no' });
        const exported = checklist.exportJSON();

        const newChecklist = new RECORDPEChecklist();
        newChecklist.importJSON(exported);

        expect(newChecklist.getResponse('1').response).toBe('yes');
        expect(newChecklist.getResponse('2').response).toBe('no');
    });

    test('generateReport includes section scores and recommendations', () => {
        checklist.setResponse('5', { response: 'partial' });
        const report = checklist.generateReport();
        expect(report.title).toBe('RECORD-PE Compliance Report');
        expect(report.overallScore).toBeDefined();
        expect(report.sectionScores).toBeDefined();
        expect(report.missingItems).toBeDefined();
        expect(report.recommendations).toBeDefined();
    });
});

// ============================================================
// TechnicalVerification
// ============================================================

describe('TechnicalVerification', () => {
    let verifier;

    beforeEach(() => {
        verifier = new TechnicalVerification();
    });

    test('testMassBalance passes when cohort sums to 1', () => {
        const model = {
            cohortTrace: [
                [0.5, 0.5],
                [0.3, 0.7],
                [0.1, 0.9]
            ]
        };
        const result = verifier.testMassBalance(model);
        expect(result.passed).toBe(true);
        expect(result.name).toBe('Mass Balance');
    });

    test('testMassBalance fails when cohort does not sum to 1', () => {
        const model = {
            cohortTrace: [
                [0.5, 0.4], // sum = 0.9
                [0.3, 0.7]
            ]
        };
        const result = verifier.testMassBalance(model);
        expect(result.passed).toBe(false);
        expect(result.details.length).toBeGreaterThan(0);
    });

    test('testReproducibility passes when same seed gives same results', () => {
        const model = {
            run: (params) => ({ totalQALY: 5.0, totalCost: 1000 })
        };
        const result = verifier.testReproducibility(model);
        expect(result.passed).toBe(true);
    });

    test('testReproducibility fails when same seed gives different results', () => {
        let callCount = 0;
        const model = {
            run: () => ({ totalQALY: ++callCount, totalCost: 1000 })
        };
        const result = verifier.testReproducibility(model);
        expect(result.passed).toBe(false);
    });

    test('getTestSummary reports total, passed, failed counts', () => {
        verifier.results = [
            { name: 'A', passed: true, details: [] },
            { name: 'B', passed: false, details: ['fail'] },
            { name: 'C', passed: true, details: [] }
        ];
        const summary = verifier.getTestSummary();
        expect(summary.total).toBe(3);
        expect(summary.passed).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.passRate).toBe('66.7%');
    });
});

// ============================================================
// ExternalValidityAssessment
// ============================================================

describe('ExternalValidityAssessment', () => {
    let eva;

    beforeEach(() => {
        eva = new ExternalValidityAssessment();
    });

    test('initializeCriteria returns 5 categories', () => {
        expect(eva.criteria).toHaveLength(5);
        const categories = eva.criteria.map(c => c.category);
        expect(categories).toContain('Population');
        expect(categories).toContain('Intervention');
        expect(categories).toContain('Setting');
    });

    test('assess and getAssessment round-trip correctly', () => {
        eva.assess('pop1', { rating: 'high', justification: 'Representative' });
        const assessment = eva.getAssessment('pop1');
        expect(assessment.rating).toBe('high');
        expect(assessment.justification).toBe('Representative');
    });

    test('calculateOverallScore returns correct percentage for all-high ratings', () => {
        // Assess all criteria as high
        for (const category of eva.criteria) {
            for (const criterion of category.criteria) {
                eva.assess(criterion.id, { rating: 'high' });
            }
        }
        const score = eva.calculateOverallScore();
        expect(score.percentage).toBe('100.0');
        expect(score.rating).toBe('High external validity');
    });

    test('getOverallRating classifies scores into appropriate categories', () => {
        expect(eva.getOverallRating(0.9)).toBe('High external validity');
        expect(eva.getOverallRating(0.7)).toBe('Moderate external validity');
        expect(eva.getOverallRating(0.5)).toBe('Low external validity');
        expect(eva.getOverallRating(0.2)).toBe('Unclear external validity');
    });

    test('identifyLimitations returns only low and unclear ratings', () => {
        eva.assess('pop1', { rating: 'high' });
        eva.assess('pop2', { rating: 'low', justification: 'Not representative' });
        eva.assess('int1', { rating: 'unclear' });

        const limitations = eva.identifyLimitations();
        expect(limitations).toHaveLength(2);
        expect(limitations.every(l => l.rating === 'low' || l.rating === 'unclear')).toBe(true);
    });

    test('generateReport includes all expected sections', () => {
        eva.assess('pop1', { rating: 'moderate' });
        const report = eva.generateReport();
        expect(report.title).toBe('External Validity Assessment Report');
        expect(report.overallScore).toBeDefined();
        expect(report.categorySummaries).toBeDefined();
        expect(report.limitations).toBeDefined();
        expect(report.recommendations).toBeDefined();
    });
});

// ============================================================
// ValidationOrchestrator
// ============================================================

describe('ValidationOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        orchestrator = new ValidationOrchestrator();
    });

    test('runFullValidation returns overall Good when no issues found', () => {
        const model = {
            name: 'Test Model',
            parameters: {
                p1: { value: 0.05, category: 'mortality', subcategory: 'allCause' }
            }
        };
        const result = orchestrator.runFullValidation(model, null, {
            technical: false,
            crossValidation: false
        });

        expect(result.modelName).toBe('Test Model');
        expect(result.overallAssessment.rating).toBe('Good');
    });

    test('runFullValidation returns Poor when clinical bounds are violated', () => {
        const model = {
            name: 'Bad Model',
            parameters: {
                p1: { value: -5, category: 'mortality', subcategory: 'allCause' }
            }
        };
        const result = orchestrator.runFullValidation(model, null, {
            technical: false,
            crossValidation: false
        });

        expect(result.overallAssessment.rating).toBe('Poor');
        expect(result.overallAssessment.issues.length).toBeGreaterThan(0);
    });

    test('exportReport produces valid JSON output', () => {
        const results = {
            modelName: 'Test',
            timestamp: '2024-01-01',
            overallAssessment: { rating: 'Good', message: 'All passed' }
        };
        const json = orchestrator.exportReport(results, 'json');
        const parsed = JSON.parse(json);
        expect(parsed.modelName).toBe('Test');
    });

    test('exportReport produces text format with expected structure', () => {
        const results = {
            modelName: 'Test',
            timestamp: '2024-01-01',
            overallAssessment: {
                rating: 'Good',
                message: 'All passed',
                issues: ['issue1'],
                recommendations: ['rec1']
            }
        };
        const text = orchestrator.exportReport(results, 'text');
        expect(text).toContain('VALIDATION REPORT');
        expect(text).toContain('Test');
        expect(text).toContain('Good');
        expect(text).toContain('issue1');
        expect(text).toContain('rec1');
    });
});
