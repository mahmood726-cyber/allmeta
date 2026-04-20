/**
 * HTA Artifact Standard - Advanced Validation Module
 * Version: 0.6.0
 *
 * Comprehensive model validation including:
 * - Clinical plausibility bounds checking
 * - Cross-validation for model parameters
 * - RECORD-PE (Reporting of Studies Conducted using Observational Routinely-collected health Data) checklist
 * - Technical verification and face validation
 * - External validity assessment
 */

'use strict';

// =============================================================================
// CLINICAL BOUNDS VALIDATOR
// =============================================================================

class ClinicalBoundsValidator {
    constructor() {
        this.bounds = this.initializeDefaultBounds();
        this.violations = [];
    }

    /**
     * Initialize default clinical bounds based on literature
     */
    initializeDefaultBounds() {
        return {
            // Mortality rates (annual)
            mortality: {
                allCause: { min: 0, max: 1, typical: { min: 0.001, max: 0.5 } },
                cancerSpecific: { min: 0, max: 1, typical: { min: 0.01, max: 0.8 } },
                cardiovascular: { min: 0, max: 1, typical: { min: 0.005, max: 0.3 } }
            },

            // Transition probabilities
            transitions: {
                diseaseProgression: { min: 0, max: 1, typical: { min: 0.01, max: 0.5 } },
                remission: { min: 0, max: 1, typical: { min: 0.001, max: 0.3 } },
                adverseEvent: { min: 0, max: 1, typical: { min: 0.001, max: 0.4 } }
            },

            // Utilities
            utilities: {
                perfectHealth: { min: 0.95, max: 1.0 },
                mildDisease: { min: 0.7, max: 0.95 },
                moderateDisease: { min: 0.4, max: 0.75 },
                severeDisease: { min: 0.1, max: 0.5 },
                death: { min: 0, max: 0 }
            },

            // Disutilities
            disutilities: {
                adverseEventMild: { min: -0.1, max: -0.01 },
                adverseEventModerate: { min: -0.25, max: -0.05 },
                adverseEventSevere: { min: -0.5, max: -0.1 }
            },

            // Costs (annual, in currency units)
            costs: {
                drugAcquisition: { min: 0, max: 1000000, warning: 500000 },
                administration: { min: 0, max: 100000, warning: 50000 },
                monitoring: { min: 0, max: 50000, warning: 25000 },
                adverseEvent: { min: 0, max: 200000, warning: 100000 },
                hospitalization: { min: 0, max: 500000, warning: 250000 },
                endOfLife: { min: 0, max: 100000, warning: 50000 }
            },

            // Relative treatment effects
            treatmentEffects: {
                hazardRatio: { min: 0.01, max: 10, typical: { min: 0.3, max: 3 } },
                oddsRatio: { min: 0.01, max: 100, typical: { min: 0.2, max: 5 } },
                riskRatio: { min: 0.01, max: 10, typical: { min: 0.3, max: 3 } },
                riskDifference: { min: -1, max: 1, typical: { min: -0.3, max: 0.3 } }
            },

            // Time horizons
            timeHorizon: {
                acute: { min: 0.01, max: 1 }, // years
                chronic: { min: 1, max: 100 },
                lifetime: { min: 20, max: 100 }
            },

            // Discounting
            discountRate: {
                costs: { min: 0, max: 0.1, typical: { min: 0.03, max: 0.05 } },
                outcomes: { min: 0, max: 0.1, typical: { min: 0.015, max: 0.05 } }
            }
        };
    }

    /**
     * Validate single parameter
     */
    validateParameter(value, category, subcategory, options = {}) {
        const bounds = this.bounds[category]?.[subcategory];
        if (!bounds) {
            return { valid: true, message: 'No bounds defined' };
        }

        const result = {
            valid: true,
            warnings: [],
            errors: []
        };

        // Check hard bounds
        if (value < bounds.min) {
            result.valid = false;
            result.errors.push(`Value ${value} below minimum ${bounds.min}`);
        }

        if (value > bounds.max) {
            result.valid = false;
            result.errors.push(`Value ${value} above maximum ${bounds.max}`);
        }

        // Check typical bounds (soft warnings)
        if (bounds.typical) {
            if (value < bounds.typical.min || value > bounds.typical.max) {
                result.warnings.push(
                    `Value ${value} outside typical range [${bounds.typical.min}, ${bounds.typical.max}]`
                );
            }
        }

        // Check warning thresholds
        if (bounds.warning && value > bounds.warning) {
            result.warnings.push(`Value ${value} exceeds warning threshold ${bounds.warning}`);
        }

        return result;
    }

    /**
     * Validate model parameters batch
     */
    validateModel(parameters) {
        this.violations = [];
        const results = {
            totalParameters: 0,
            valid: 0,
            warnings: 0,
            errors: 0,
            details: []
        };

        for (const [key, param] of Object.entries(parameters)) {
            results.totalParameters++;

            if (param.category && param.subcategory && param.value !== undefined) {
                const validation = this.validateParameter(
                    param.value,
                    param.category,
                    param.subcategory
                );

                const detail = {
                    parameter: key,
                    value: param.value,
                    ...validation
                };

                results.details.push(detail);

                if (validation.valid) {
                    results.valid++;
                } else {
                    results.errors++;
                    this.violations.push(detail);
                }

                if (validation.warnings.length > 0) {
                    results.warnings++;
                }
            }
        }

        return results;
    }

    /**
     * Validate transition matrix clinical plausibility
     */
    validateTransitionMatrix(matrix, stateNames = []) {
        const n = matrix.length;
        const issues = [];

        // Check row sums
        for (let i = 0; i < n; i++) {
            const rowSum = matrix[i].reduce((a, b) => a + b, 0);
            if (Math.abs(rowSum - 1) > 1e-10) {
                issues.push({
                    type: 'error',
                    state: stateNames[i] || i,
                    message: `Row sum ${rowSum.toFixed(6)} != 1`
                });
            }
        }

        // Check for negative probabilities
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (matrix[i][j] < 0) {
                    issues.push({
                        type: 'error',
                        from: stateNames[i] || i,
                        to: stateNames[j] || j,
                        message: `Negative probability: ${matrix[i][j]}`
                    });
                }
            }
        }

        // Check absorbing states
        const absorbingStates = [];
        for (let i = 0; i < n; i++) {
            if (Math.abs(matrix[i][i] - 1) < 1e-10) {
                absorbingStates.push(stateNames[i] || i);
            }
        }

        if (absorbingStates.length === 0) {
            issues.push({
                type: 'warning',
                message: 'No absorbing states detected (model may not terminate)'
            });
        }

        // Check for clinical implausibility
        // (e.g., death -> alive transitions)
        if (stateNames.includes('Dead') || stateNames.includes('Death')) {
            const deathIdx = stateNames.findIndex(s =>
                s.toLowerCase().includes('dead') || s.toLowerCase().includes('death')
            );

            if (deathIdx !== -1) {
                for (let j = 0; j < n; j++) {
                    if (j !== deathIdx && matrix[deathIdx][j] > 0) {
                        issues.push({
                            type: 'error',
                            message: `Clinical impossibility: transition from death to ${stateNames[j]}`
                        });
                    }
                }
            }
        }

        return {
            valid: issues.filter(i => i.type === 'error').length === 0,
            absorbingStates,
            issues
        };
    }

    /**
     * Add custom bounds
     */
    addBounds(category, subcategory, bounds) {
        if (!this.bounds[category]) {
            this.bounds[category] = {};
        }
        this.bounds[category][subcategory] = bounds;
    }

    /**
     * Get violations summary
     */
    getViolationsSummary() {
        return {
            count: this.violations.length,
            violations: this.violations
        };
    }
}


// =============================================================================
// CROSS-VALIDATION
// =============================================================================

class CrossValidator {
    constructor(options = {}) {
        this.options = {
            folds: 5,
            repeats: 1,
            seed: 12345,
            ...options
        };
    }

    /**
     * K-fold cross-validation
     */
    kFoldCV(data, modelFn, metricFn) {
        const n = data.length;
        const foldSize = Math.floor(n / this.options.folds);
        const indices = this.shuffle(Array.from({ length: n }, (_, i) => i));

        const results = [];

        for (let fold = 0; fold < this.options.folds; fold++) {
            const testStart = fold * foldSize;
            const testEnd = fold === this.options.folds - 1 ? n : (fold + 1) * foldSize;

            const testIndices = indices.slice(testStart, testEnd);
            const trainIndices = [
                ...indices.slice(0, testStart),
                ...indices.slice(testEnd)
            ];

            const trainData = trainIndices.map(i => data[i]);
            const testData = testIndices.map(i => data[i]);

            // Fit model on training data
            const model = modelFn(trainData);

            // Evaluate on test data
            const predictions = testData.map(d => model.predict(d));
            const actuals = testData.map(d => d.outcome);

            const metric = metricFn(actuals, predictions);

            results.push({
                fold: fold + 1,
                trainSize: trainData.length,
                testSize: testData.length,
                metric: metric
            });
        }

        return {
            folds: results,
            mean: results.reduce((s, r) => s + r.metric, 0) / results.length,
            std: this.std(results.map(r => r.metric))
        };
    }

    /**
     * Leave-one-out cross-validation
     */
    looCV(data, modelFn, metricFn) {
        const n = data.length;
        const results = [];

        for (let i = 0; i < n; i++) {
            const trainData = [...data.slice(0, i), ...data.slice(i + 1)];
            const testData = [data[i]];

            const model = modelFn(trainData);
            const prediction = model.predict(testData[0]);
            const actual = testData[0].outcome;

            results.push({
                index: i,
                prediction,
                actual,
                error: Math.abs(prediction - actual)
            });
        }

        const errors = results.map(r => r.error);
        return {
            results,
            mse: errors.reduce((s, e) => s + e * e, 0) / n,
            mae: errors.reduce((s, e) => s + e, 0) / n
        };
    }

    /**
     * Repeated k-fold cross-validation
     */
    repeatedKFoldCV(data, modelFn, metricFn) {
        const allResults = [];

        for (let rep = 0; rep < this.options.repeats; rep++) {
            this.seed = this.options.seed + rep;
            const result = this.kFoldCV(data, modelFn, metricFn);
            allResults.push(result);
        }

        const allMetrics = allResults.flatMap(r => r.folds.map(f => f.metric));

        return {
            repeats: allResults,
            overallMean: allMetrics.reduce((s, m) => s + m, 0) / allMetrics.length,
            overallStd: this.std(allMetrics)
        };
    }

    /**
     * Bootstrap validation
     */
    bootstrapValidation(data, modelFn, metricFn, nBootstraps = 1000) {
        const n = data.length;
        const results = [];

        for (let b = 0; b < nBootstraps; b++) {
            // Sample with replacement
            const bootIndices = Array.from({ length: n }, () =>
                Math.floor(this.random() * n)
            );

            const oobIndices = Array.from({ length: n }, (_, i) => i)
                .filter(i => !bootIndices.includes(i));

            if (oobIndices.length === 0) continue;

            const trainData = bootIndices.map(i => data[i]);
            const testData = oobIndices.map(i => data[i]);

            const model = modelFn(trainData);
            const predictions = testData.map(d => model.predict(d));
            const actuals = testData.map(d => d.outcome);

            results.push({
                bootstrap: b + 1,
                trainSize: trainData.length,
                oobSize: testData.length,
                metric: metricFn(actuals, predictions)
            });
        }

        const metrics = results.map(r => r.metric);
        return {
            results,
            mean: metrics.reduce((s, m) => s + m, 0) / metrics.length,
            std: this.std(metrics),
            ci95: [
                this.percentile(metrics, 2.5),
                this.percentile(metrics, 97.5)
            ]
        };
    }

    /**
     * Shuffle array using Fisher-Yates
     */
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * Seeded random number generator
     */
    random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    /**
     * Standard deviation
     */
    std(values) {
        const n = values.length;
        if (n < 2) return 0;
        const mean = values.reduce((s, v) => s + v, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
        return Math.sqrt(variance);
    }

    /**
     * Percentile
     */
    percentile(values, p) {
        const sorted = [...values].sort((a, b) => a - b);
        const idx = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(idx);
        const upper = Math.ceil(idx);
        const weight = idx - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }
}


// =============================================================================
// RECORD-PE CHECKLIST
// =============================================================================

class RECORDPEChecklist {
    constructor() {
        this.items = this.initializeChecklist();
        this.responses = new Map();
    }

    /**
     * Initialize RECORD-PE checklist items
     */
    initializeChecklist() {
        return [
            // Title and abstract
            {
                id: '1',
                section: 'Title and Abstract',
                item: 'Title',
                description: 'Indicate the study design with commonly used term(s)',
                subItems: [
                    { id: '1.1', description: 'Indicate pharmacoepidemiology/drug safety study' },
                    { id: '1.2', description: 'Name active substance(s) under investigation' }
                ]
            },
            {
                id: '2',
                section: 'Title and Abstract',
                item: 'Abstract',
                description: 'Provide informative and balanced summary',
                subItems: [
                    { id: '2.1', description: 'State data source(s) used' },
                    { id: '2.2', description: 'State medication exposure(s) studied' },
                    { id: '2.3', description: 'State outcome(s) examined' }
                ]
            },

            // Introduction
            {
                id: '3',
                section: 'Introduction',
                item: 'Background',
                description: 'Explain scientific background and rationale',
                subItems: [
                    { id: '3.1', description: 'Describe medication and indication' },
                    { id: '3.2', description: 'Describe the outcome(s) and clinical relevance' }
                ]
            },
            {
                id: '4',
                section: 'Introduction',
                item: 'Objectives',
                description: 'State specific objectives including pre-specified hypotheses',
                subItems: []
            },

            // Methods
            {
                id: '5',
                section: 'Methods',
                item: 'Study design',
                description: 'Present key elements of study design',
                subItems: []
            },
            {
                id: '6',
                section: 'Methods',
                item: 'Setting',
                description: 'Describe setting, locations, relevant dates',
                subItems: [
                    { id: '6.1', description: 'Describe the mode of patient data collection' },
                    { id: '6.2', description: 'Describe linkage method if multiple databases used' }
                ]
            },
            {
                id: '7',
                section: 'Methods',
                item: 'Participants',
                description: 'Describe eligibility criteria, sources, selection methods',
                subItems: [
                    { id: '7.1', description: 'Describe comparison group selection' },
                    { id: '7.2', description: 'Describe methods to handle immortal time bias' }
                ]
            },
            {
                id: '8',
                section: 'Methods',
                item: 'Variables',
                description: 'Define all outcomes, exposures, predictors, confounders',
                subItems: [
                    { id: '8.1', description: 'Describe medication coding systems used' },
                    { id: '8.2', description: 'Describe outcome case definition and validation' },
                    { id: '8.3', description: 'Describe confounders and how measured' }
                ]
            },
            {
                id: '9',
                section: 'Methods',
                item: 'Data sources',
                description: 'Describe data source for each variable',
                subItems: [
                    { id: '9.1', description: 'Authors should provide information on validation studies' }
                ]
            },
            {
                id: '10',
                section: 'Methods',
                item: 'Bias',
                description: 'Describe efforts to address potential sources of bias',
                subItems: [
                    { id: '10.1', description: 'Address confounding by indication' },
                    { id: '10.2', description: 'Address time-related biases' },
                    { id: '10.3', description: 'Address information biases' }
                ]
            },
            {
                id: '11',
                section: 'Methods',
                item: 'Study size',
                description: 'Explain how study size was determined',
                subItems: []
            },
            {
                id: '12',
                section: 'Methods',
                item: 'Quantitative variables',
                description: 'Explain handling of quantitative variables',
                subItems: []
            },
            {
                id: '13',
                section: 'Methods',
                item: 'Statistical methods',
                description: 'Describe all statistical methods',
                subItems: [
                    { id: '13.1', description: 'Describe propensity score methods if used' },
                    { id: '13.2', description: 'Describe sensitivity analyses' }
                ]
            },

            // Results
            {
                id: '14',
                section: 'Results',
                item: 'Participants',
                description: 'Report numbers at each stage of study',
                subItems: [
                    { id: '14.1', description: 'Present flow diagram' }
                ]
            },
            {
                id: '15',
                section: 'Results',
                item: 'Descriptive data',
                description: 'Report characteristics of participants',
                subItems: [
                    { id: '15.1', description: 'Report duration/person-time of follow-up' }
                ]
            },
            {
                id: '16',
                section: 'Results',
                item: 'Outcome data',
                description: 'Report numbers of outcome events',
                subItems: []
            },
            {
                id: '17',
                section: 'Results',
                item: 'Main results',
                description: 'Give unadjusted and adjusted estimates',
                subItems: [
                    { id: '17.1', description: 'Report absolute measures of effect' }
                ]
            },
            {
                id: '18',
                section: 'Results',
                item: 'Other analyses',
                description: 'Report results of sensitivity/subgroup analyses',
                subItems: []
            },

            // Discussion
            {
                id: '19',
                section: 'Discussion',
                item: 'Key results',
                description: 'Summarise key results with reference to objectives',
                subItems: []
            },
            {
                id: '20',
                section: 'Discussion',
                item: 'Limitations',
                description: 'Discuss limitations considering sources of bias',
                subItems: [
                    { id: '20.1', description: 'Discuss impact of misclassification' }
                ]
            },
            {
                id: '21',
                section: 'Discussion',
                item: 'Interpretation',
                description: 'Cautious interpretation considering limitations',
                subItems: []
            },
            {
                id: '22',
                section: 'Discussion',
                item: 'Generalizability',
                description: 'Discuss generalizability of results',
                subItems: []
            },

            // Other information
            {
                id: '23',
                section: 'Other',
                item: 'Funding',
                description: 'Give source of funding and role of funders',
                subItems: []
            },
            {
                id: '24',
                section: 'Other',
                item: 'Data access',
                description: 'Authors should provide information on how to access data',
                subItems: []
            }
        ];
    }

    /**
     * Set response for item
     */
    setResponse(itemId, response) {
        this.responses.set(itemId, {
            response: response.response, // 'yes', 'no', 'partial', 'na'
            pageReference: response.pageReference || '',
            comments: response.comments || '',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get response for item
     */
    getResponse(itemId) {
        return this.responses.get(itemId);
    }

    /**
     * Calculate compliance score
     */
    calculateScore() {
        let applicable = 0;
        let compliant = 0;
        let partial = 0;

        for (const item of this.items) {
            const response = this.responses.get(item.id);

            if (response && response.response !== 'na') {
                applicable++;
                if (response.response === 'yes') compliant++;
                if (response.response === 'partial') partial++;
            }

            // Check sub-items
            for (const subItem of item.subItems) {
                const subResponse = this.responses.get(subItem.id);
                if (subResponse && subResponse.response !== 'na') {
                    applicable++;
                    if (subResponse.response === 'yes') compliant++;
                    if (subResponse.response === 'partial') partial++;
                }
            }
        }

        return {
            applicable,
            compliant,
            partial,
            nonCompliant: applicable - compliant - partial,
            score: applicable > 0 ? (compliant + 0.5 * partial) / applicable : 0,
            percentage: applicable > 0 ? ((compliant + 0.5 * partial) / applicable * 100).toFixed(1) : 0
        };
    }

    /**
     * Get items by section
     */
    getItemsBySection(section) {
        return this.items.filter(item => item.section === section);
    }

    /**
     * Get all sections
     */
    getSections() {
        return [...new Set(this.items.map(item => item.section))];
    }

    /**
     * Generate compliance report
     */
    generateReport() {
        const sections = this.getSections();
        const sectionScores = {};

        for (const section of sections) {
            const sectionItems = this.getItemsBySection(section);
            let sectionApplicable = 0;
            let sectionCompliant = 0;

            for (const item of sectionItems) {
                const response = this.responses.get(item.id);
                if (response && response.response !== 'na') {
                    sectionApplicable++;
                    if (response.response === 'yes') sectionCompliant++;
                    if (response.response === 'partial') sectionCompliant += 0.5;
                }

                for (const subItem of item.subItems) {
                    const subResponse = this.responses.get(subItem.id);
                    if (subResponse && subResponse.response !== 'na') {
                        sectionApplicable++;
                        if (subResponse.response === 'yes') sectionCompliant++;
                        if (subResponse.response === 'partial') sectionCompliant += 0.5;
                    }
                }
            }

            sectionScores[section] = {
                applicable: sectionApplicable,
                compliant: sectionCompliant,
                score: sectionApplicable > 0 ? sectionCompliant / sectionApplicable : 0
            };
        }

        const overall = this.calculateScore();

        return {
            title: 'RECORD-PE Compliance Report',
            generatedDate: new Date().toISOString(),
            overallScore: overall,
            sectionScores,
            missingItems: this.getMissingItems(),
            recommendations: this.getRecommendations()
        };
    }

    /**
     * Get items without responses
     */
    getMissingItems() {
        const missing = [];

        for (const item of this.items) {
            if (!this.responses.has(item.id)) {
                missing.push({ id: item.id, description: item.description });
            }

            for (const subItem of item.subItems) {
                if (!this.responses.has(subItem.id)) {
                    missing.push({ id: subItem.id, description: subItem.description });
                }
            }
        }

        return missing;
    }

    /**
     * Get recommendations for improvement
     */
    getRecommendations() {
        const recommendations = [];

        for (const item of this.items) {
            const response = this.responses.get(item.id);

            if (response && (response.response === 'no' || response.response === 'partial')) {
                recommendations.push({
                    item: item.id,
                    description: item.description,
                    priority: item.section === 'Methods' ? 'high' : 'medium',
                    suggestion: `Improve reporting of: ${item.description}`
                });
            }
        }

        return recommendations.sort((a, b) =>
            a.priority === 'high' && b.priority !== 'high' ? -1 : 1
        );
    }

    /**
     * Export to JSON
     */
    exportJSON() {
        return JSON.stringify({
            checklist: 'RECORD-PE',
            version: '1.0',
            items: this.items,
            responses: Object.fromEntries(this.responses),
            score: this.calculateScore()
        }, null, 2);
    }

    /**
     * Import from JSON
     */
    importJSON(json) {
        const data = JSON.parse(json);
        this.responses = new Map(Object.entries(data.responses));
    }
}


// =============================================================================
// TECHNICAL VERIFICATION
// =============================================================================

class TechnicalVerification {
    constructor() {
        this.tests = [];
        this.results = [];
    }

    /**
     * Run all verification tests
     */
    runAllTests(model) {
        this.results = [];

        // Mass balance test
        this.results.push(this.testMassBalance(model));

        // Extreme value test
        this.results.push(this.testExtremeValues(model));

        // Boundary conditions test
        this.results.push(this.testBoundaryConditions(model));

        // Time step independence test
        this.results.push(this.testTimeStepIndependence(model));

        // Deterministic reproducibility test
        this.results.push(this.testReproducibility(model));

        return this.getTestSummary();
    }

    /**
     * Test mass/cohort balance
     */
    testMassBalance(model) {
        const result = {
            name: 'Mass Balance',
            passed: true,
            details: []
        };

        if (model.cohortTrace) {
            for (let t = 0; t < model.cohortTrace.length; t++) {
                const sum = model.cohortTrace[t].reduce((a, b) => a + b, 0);
                if (Math.abs(sum - 1) > 1e-10) {
                    result.passed = false;
                    result.details.push(`Cycle ${t}: cohort sum = ${sum}`);
                }
            }
        }

        return result;
    }

    /**
     * Test extreme parameter values
     */
    testExtremeValues(model) {
        const result = {
            name: 'Extreme Values',
            passed: true,
            details: []
        };

        const extremeScenarios = [
            { name: 'All zero costs', params: { costs: 0 } },
            { name: 'Maximum costs', params: { costs: 1e9 } },
            { name: 'Zero effectiveness', params: { effectiveness: 0 } },
            { name: 'Perfect effectiveness', params: { effectiveness: 1 } }
        ];

        for (const scenario of extremeScenarios) {
            try {
                const output = model.run(scenario.params);

                if (!isFinite(output.totalCost) || !isFinite(output.totalQALY)) {
                    result.passed = false;
                    result.details.push(`${scenario.name}: non-finite output`);
                }
            } catch (error) {
                result.passed = false;
                result.details.push(`${scenario.name}: error - ${error.message}`);
            }
        }

        return result;
    }

    /**
     * Test boundary conditions
     */
    testBoundaryConditions(model) {
        const result = {
            name: 'Boundary Conditions',
            passed: true,
            details: []
        };

        // Test with time horizon = 0
        try {
            const output = model.run({ timeHorizon: 0 });
            if (output.totalQALY !== 0 || output.totalCost !== 0) {
                result.details.push('Non-zero output with zero time horizon');
            }
        } catch (error) {
            result.details.push(`Zero horizon test: ${error.message}`);
        }

        // Test with discount rate = 0
        try {
            const output1 = model.run({ discountRate: 0 });
            const output2 = model.run({ discountRate: 0.035 });

            if (output1.totalQALY < output2.totalQALY) {
                result.passed = false;
                result.details.push('Undiscounted QALYs less than discounted');
            }
        } catch (error) {
            result.details.push(`Discount test: ${error.message}`);
        }

        return result;
    }

    /**
     * Test time step independence
     */
    testTimeStepIndependence(model) {
        const result = {
            name: 'Time Step Independence',
            passed: true,
            details: []
        };

        try {
            // Run with monthly cycles
            const monthly = model.run({ cycleLength: 1/12, cycles: 120 });

            // Run with yearly cycles
            const yearly = model.run({ cycleLength: 1, cycles: 10 });

            // Results should be similar (within 5%)
            const qalDiff = Math.abs(monthly.totalQALY - yearly.totalQALY) / yearly.totalQALY;
            const costDiff = Math.abs(monthly.totalCost - yearly.totalCost) / yearly.totalCost;

            if (qalDiff > 0.05) {
                result.passed = false;
                result.details.push(`QALY difference: ${(qalDiff * 100).toFixed(1)}%`);
            }

            if (costDiff > 0.05) {
                result.passed = false;
                result.details.push(`Cost difference: ${(costDiff * 100).toFixed(1)}%`);
            }
        } catch (error) {
            result.details.push(`Time step test: ${error.message}`);
        }

        return result;
    }

    /**
     * Test deterministic reproducibility
     */
    testReproducibility(model) {
        const result = {
            name: 'Reproducibility',
            passed: true,
            details: []
        };

        try {
            const output1 = model.run({ seed: 12345 });
            const output2 = model.run({ seed: 12345 });

            if (output1.totalQALY !== output2.totalQALY) {
                result.passed = false;
                result.details.push('Same seed produces different QALYs');
            }

            if (output1.totalCost !== output2.totalCost) {
                result.passed = false;
                result.details.push('Same seed produces different costs');
            }
        } catch (error) {
            result.details.push(`Reproducibility test: ${error.message}`);
        }

        return result;
    }

    /**
     * Get test summary
     */
    getTestSummary() {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;

        return {
            total,
            passed,
            failed: total - passed,
            passRate: (passed / total * 100).toFixed(1) + '%',
            results: this.results
        };
    }
}


// =============================================================================
// EXTERNAL VALIDITY ASSESSMENT
// =============================================================================

class ExternalValidityAssessment {
    constructor() {
        this.criteria = this.initializeCriteria();
        this.assessments = new Map();
    }

    /**
     * Initialize assessment criteria
     */
    initializeCriteria() {
        return [
            {
                id: 'population',
                category: 'Population',
                criteria: [
                    { id: 'pop1', question: 'Is the model population representative of the target population?' },
                    { id: 'pop2', question: 'Are age and sex distributions similar to the target?' },
                    { id: 'pop3', question: 'Are comorbidity profiles comparable?' },
                    { id: 'pop4', question: 'Is disease severity similar?' }
                ]
            },
            {
                id: 'intervention',
                category: 'Intervention',
                criteria: [
                    { id: 'int1', question: 'Are treatment protocols representative of clinical practice?' },
                    { id: 'int2', question: 'Are dosing regimens applicable to target setting?' },
                    { id: 'int3', question: 'Are treatment durations realistic?' },
                    { id: 'int4', question: 'Is adherence accounted for appropriately?' }
                ]
            },
            {
                id: 'comparator',
                category: 'Comparator',
                criteria: [
                    { id: 'comp1', question: 'Is the comparator relevant to current practice?' },
                    { id: 'comp2', question: 'Is best supportive care defined appropriately?' },
                    { id: 'comp3', question: 'Are all relevant comparators included?' }
                ]
            },
            {
                id: 'outcomes',
                category: 'Outcomes',
                criteria: [
                    { id: 'out1', question: 'Are outcomes relevant to decision makers?' },
                    { id: 'out2', question: 'Are surrogate outcomes appropriately linked to final outcomes?' },
                    { id: 'out3', question: 'Is the time horizon sufficient to capture relevant effects?' }
                ]
            },
            {
                id: 'setting',
                category: 'Setting',
                criteria: [
                    { id: 'set1', question: 'Is the healthcare setting representative?' },
                    { id: 'set2', question: 'Are costs relevant to target jurisdiction?' },
                    { id: 'set3', question: 'Are utility values appropriate for target population?' }
                ]
            }
        ];
    }

    /**
     * Set assessment for criterion
     */
    assess(criterionId, assessment) {
        this.assessments.set(criterionId, {
            rating: assessment.rating, // 'high', 'moderate', 'low', 'unclear'
            justification: assessment.justification || '',
            evidence: assessment.evidence || ''
        });
    }

    /**
     * Get assessment for criterion
     */
    getAssessment(criterionId) {
        return this.assessments.get(criterionId);
    }

    /**
     * Calculate overall validity score
     */
    calculateOverallScore() {
        const ratingScores = { high: 3, moderate: 2, low: 1, unclear: 0 };
        let totalScore = 0;
        let maxScore = 0;
        let assessed = 0;

        for (const category of this.criteria) {
            for (const criterion of category.criteria) {
                const assessment = this.assessments.get(criterion.id);
                if (assessment) {
                    assessed++;
                    totalScore += ratingScores[assessment.rating] || 0;
                    maxScore += 3;
                }
            }
        }

        return {
            totalScore,
            maxScore,
            assessed,
            percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : 0,
            rating: this.getOverallRating(totalScore / maxScore)
        };
    }

    /**
     * Get overall rating from score
     */
    getOverallRating(score) {
        if (score >= 0.8) return 'High external validity';
        if (score >= 0.6) return 'Moderate external validity';
        if (score >= 0.4) return 'Low external validity';
        return 'Unclear external validity';
    }

    /**
     * Generate category summaries
     */
    getCategorySummaries() {
        const summaries = {};
        const ratingScores = { high: 3, moderate: 2, low: 1, unclear: 0 };

        for (const category of this.criteria) {
            let categoryScore = 0;
            let categoryMax = 0;
            const assessedCriteria = [];

            for (const criterion of category.criteria) {
                const assessment = this.assessments.get(criterion.id);
                if (assessment) {
                    categoryScore += ratingScores[assessment.rating] || 0;
                    categoryMax += 3;
                    assessedCriteria.push({
                        question: criterion.question,
                        ...assessment
                    });
                }
            }

            summaries[category.category] = {
                score: categoryMax > 0 ? (categoryScore / categoryMax * 100).toFixed(1) : 0,
                assessedCriteria
            };
        }

        return summaries;
    }

    /**
     * Generate validity report
     */
    generateReport() {
        return {
            title: 'External Validity Assessment Report',
            generatedDate: new Date().toISOString(),
            overallScore: this.calculateOverallScore(),
            categorySummaries: this.getCategorySummaries(),
            limitations: this.identifyLimitations(),
            recommendations: this.generateRecommendations()
        };
    }

    /**
     * Identify key limitations
     */
    identifyLimitations() {
        const limitations = [];

        for (const category of this.criteria) {
            for (const criterion of category.criteria) {
                const assessment = this.assessments.get(criterion.id);
                if (assessment && (assessment.rating === 'low' || assessment.rating === 'unclear')) {
                    limitations.push({
                        category: category.category,
                        criterion: criterion.question,
                        rating: assessment.rating,
                        justification: assessment.justification
                    });
                }
            }
        }

        return limitations;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const limitations = this.identifyLimitations();

        for (const limitation of limitations) {
            recommendations.push({
                category: limitation.category,
                issue: limitation.criterion,
                suggestion: `Consider additional analyses or sensitivity testing for: ${limitation.criterion}`
            });
        }

        return recommendations;
    }
}


// =============================================================================
// VALIDATION ORCHESTRATOR
// =============================================================================

class ValidationOrchestrator {
    constructor() {
        this.clinicalValidator = new ClinicalBoundsValidator();
        this.crossValidator = new CrossValidator();
        this.recordPE = new RECORDPEChecklist();
        this.technicalVerifier = new TechnicalVerification();
        this.externalValidity = new ExternalValidityAssessment();
    }

    /**
     * Run comprehensive validation
     */
    runFullValidation(model, data, options = {}) {
        const results = {
            timestamp: new Date().toISOString(),
            modelName: model.name || 'Unnamed Model',
            sections: {}
        };

        // Clinical bounds validation
        if (options.clinicalBounds !== false) {
            results.sections.clinicalBounds = this.clinicalValidator.validateModel(model.parameters || {});
        }

        // Transition matrix validation
        if (model.transitionMatrix) {
            results.sections.transitionMatrix = this.clinicalValidator.validateTransitionMatrix(
                model.transitionMatrix,
                model.stateNames
            );
        }

        // Technical verification
        if (options.technical !== false) {
            results.sections.technical = this.technicalVerifier.runAllTests(model);
        }

        // Cross-validation (if data provided)
        if (data && options.crossValidation !== false) {
            results.sections.crossValidation = this.crossValidator.kFoldCV(
                data,
                model.fit.bind(model),
                options.metric || ((a, p) => {
                    const mse = a.reduce((s, v, i) => s + (v - p[i]) ** 2, 0) / a.length;
                    return Math.sqrt(mse);
                })
            );
        }

        // RECORD-PE (if applicable)
        if (options.recordPE) {
            results.sections.recordPE = this.recordPE.calculateScore();
        }

        // External validity
        if (options.externalValidity) {
            results.sections.externalValidity = this.externalValidity.calculateOverallScore();
        }

        // Overall assessment
        results.overallAssessment = this.generateOverallAssessment(results.sections);

        return results;
    }

    /**
     * Generate overall assessment
     */
    generateOverallAssessment(sections) {
        const issues = [];
        let overallRating = 'Good';

        // Check clinical bounds
        if (sections.clinicalBounds && sections.clinicalBounds.errors > 0) {
            issues.push(`${sections.clinicalBounds.errors} clinical bounds violations`);
            overallRating = 'Poor';
        }

        // Check technical verification
        if (sections.technical && sections.technical.failed > 0) {
            issues.push(`${sections.technical.failed} technical tests failed`);
            overallRating = 'Poor';
        }

        // Check transition matrix
        if (sections.transitionMatrix && !sections.transitionMatrix.valid) {
            issues.push('Invalid transition matrix');
            overallRating = 'Poor';
        }

        if (issues.length === 0) {
            return {
                rating: 'Good',
                message: 'All validation checks passed',
                recommendations: []
            };
        }

        return {
            rating: overallRating,
            message: `Validation identified ${issues.length} concern(s)`,
            issues,
            recommendations: this.generateRecommendations(sections)
        };
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(sections) {
        const recommendations = [];

        if (sections.clinicalBounds && sections.clinicalBounds.errors > 0) {
            recommendations.push('Review and correct parameter values outside clinical bounds');
        }

        if (sections.technical && sections.technical.failed > 0) {
            recommendations.push('Address failed technical verification tests');
        }

        if (sections.crossValidation && sections.crossValidation.mean > 0.5) {
            recommendations.push('Consider recalibrating model - cross-validation RMSE is high');
        }

        return recommendations;
    }

    /**
     * Export validation report
     */
    exportReport(results, format = 'json') {
        if (format === 'json') {
            return JSON.stringify(results, null, 2);
        }

        // Plain text format
        let text = `VALIDATION REPORT\n`;
        text += `================\n\n`;
        text += `Model: ${results.modelName}\n`;
        text += `Date: ${results.timestamp}\n\n`;

        text += `OVERALL ASSESSMENT: ${results.overallAssessment.rating}\n`;
        text += `${results.overallAssessment.message}\n\n`;

        if (results.overallAssessment.issues) {
            text += `Issues:\n`;
            for (const issue of results.overallAssessment.issues) {
                text += `  - ${issue}\n`;
            }
            text += '\n';
        }

        if (results.overallAssessment.recommendations) {
            text += `Recommendations:\n`;
            for (const rec of results.overallAssessment.recommendations) {
                text += `  - ${rec}\n`;
            }
        }

        return text;
    }
}


// =============================================================================
// EXPORTS
// =============================================================================

// Browser environment
if (typeof window !== 'undefined') {
    window.HTA = window.HTA || {};
    window.HTA.ClinicalBoundsValidator = ClinicalBoundsValidator;
    window.HTA.CrossValidator = CrossValidator;
    window.HTA.RECORDPEChecklist = RECORDPEChecklist;
    window.HTA.TechnicalVerification = TechnicalVerification;
    window.HTA.ExternalValidityAssessment = ExternalValidityAssessment;
    window.HTA.ValidationOrchestrator = ValidationOrchestrator;
}

// Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ClinicalBoundsValidator,
        CrossValidator,
        RECORDPEChecklist,
        TechnicalVerification,
        ExternalValidityAssessment,
        ValidationOrchestrator
    };
}
