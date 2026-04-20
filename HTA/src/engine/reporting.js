/**
 * HTA Reporting Standards Engine v0.3
 *
 * Automated compliance checking and report generation for:
 * - CHEERS 2022 (Consolidated Health Economic Evaluation Reporting Standards)
 * - NICE Reference Case
 * - GRADE/CINeMA Quality Assessment for Network Meta-Analysis
 * - PRISMA-NMA Reporting Checklist
 *
 * References:
 * - Husereau et al. (2022) CHEERS 2022 Statement
 * - Salanti et al. (2014) CINeMA: Confidence in Network Meta-Analysis
 * - Hutton et al. (2015) PRISMA extension for network meta-analysis
 * - NICE Methods Guide for Health Technology Evaluation (2022)
 */

class ReportingStandards {
    constructor() {
        this.cheers2022Items = this.initCHEERS2022();
        this.niceReferenceCase = this.initNICEReferenceCase();
        this.cinemaFramework = this.initCINEMA();
        this.prismaNMA = this.initPRISMANMA();
    }

    /**
     * Initialize CHEERS 2022 checklist items
     */
    initCHEERS2022() {
        return [
            // Title and Abstract
            { id: 1, section: 'Title', item: 'Identify the study as an economic evaluation', required: true },
            { id: 2, section: 'Abstract', item: 'Provide structured summary including methods, results, conclusions', required: true },

            // Introduction
            { id: 3, section: 'Background', item: 'Provide context for the study', required: true },
            { id: 4, section: 'Objectives', item: 'State the research question and objectives', required: true },

            // Methods
            { id: 5, section: 'Target population', item: 'Describe characteristics of base-case population', required: true },
            { id: 6, section: 'Setting and location', item: 'State the setting and location for the study', required: true },
            { id: 7, section: 'Comparators', item: 'Describe the interventions or strategies being compared', required: true },
            { id: 8, section: 'Perspective', item: 'State the perspective(s) of the analysis', required: true },
            { id: 9, section: 'Time horizon', item: 'State the time horizon and justify its appropriateness', required: true },
            { id: 10, section: 'Discount rate', item: 'Report discount rate(s) used for costs and outcomes', required: true },
            { id: 11, section: 'Health outcomes', item: 'Describe how health outcomes were measured', required: true },
            { id: 12, section: 'Measurement of effectiveness', item: 'Describe methods for measuring effectiveness', required: true },
            { id: 13, section: 'Costs and resources', item: 'Describe methods for measuring and valuing costs', required: true },
            { id: 14, section: 'Currency and date', item: 'Report currency, price date, and conversion methods', required: true },
            { id: 15, section: 'Rationale for model', item: 'Describe and justify the type of model used', required: true },
            { id: 16, section: 'Model structure', item: 'Describe model structure using appropriate diagrams', required: true },
            { id: 17, section: 'Assumptions', item: 'Describe structural and data assumptions', required: true },
            { id: 18, section: 'Analytical methods', item: 'Describe analytical methods for base case and uncertainties', required: true },

            // Results
            { id: 19, section: 'Study parameters', item: 'Report all parameters used with sources and uncertainty', required: true },
            { id: 20, section: 'Base-case analysis', item: 'Report base-case results including ICERs', required: true },
            { id: 21, section: 'Uncertainty analysis', item: 'Report results of sensitivity/uncertainty analyses', required: true },
            { id: 22, section: 'Heterogeneity', item: 'Report results for relevant subgroups if applicable', required: false },

            // Discussion
            { id: 23, section: 'Summary', item: 'Summarize key findings and their implications', required: true },
            { id: 24, section: 'Limitations', item: 'Discuss limitations and generalizability', required: true },
            { id: 25, section: 'Conclusions', item: 'State conclusions with policy implications', required: true },

            // Other
            { id: 26, section: 'Source of funding', item: 'Describe funding sources and role in study', required: true },
            { id: 27, section: 'Conflicts of interest', item: 'Describe any conflicts of interest', required: true },
            { id: 28, section: 'Code/Data availability', item: 'Report availability of analytical code and data', required: false }
        ];
    }

    /**
     * Initialize NICE Reference Case requirements
     */
    initNICEReferenceCase() {
        return {
            perspective: {
                required: 'NHS and PSS (personal social services)',
                description: 'Costs to the NHS and personal social services'
            },
            discountRate: {
                costs: 0.035,
                qalys: 0.035,
                description: 'Annual discount rate of 3.5% for costs and health effects'
            },
            outcomesMeasure: {
                required: 'QALYs',
                description: 'Quality-adjusted life years (QALYs)'
            },
            utilityMeasure: {
                required: 'EQ-5D',
                description: 'EQ-5D utility values from general population'
            },
            timeHorizon: {
                required: 'Lifetime where appropriate',
                minimumYears: 20,
                description: 'Long enough to capture all important differences'
            },
            psa: {
                required: true,
                minimumIterations: 10000,
                description: 'Probabilistic sensitivity analysis with ≥10,000 iterations'
            },
            halfCycleCorrection: {
                required: true,
                description: 'Half-cycle correction for Markov models'
            },
            wtpThreshold: {
                lower: 20000,
                upper: 30000,
                description: 'Cost-effectiveness threshold £20,000-£30,000 per QALY'
            },
            validation: {
                technical: true,
                internal: true,
                external: true,
                description: 'Model validation required'
            }
        };
    }

    /**
     * Initialize CINeMA (Confidence in Network Meta-Analysis) framework
     */
    initCINEMA() {
        return {
            domains: [
                {
                    id: 'withinStudyBias',
                    name: 'Within-study bias',
                    description: 'Risk of bias in individual studies contributing to comparison',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                },
                {
                    id: 'reportingBias',
                    name: 'Reporting bias',
                    description: 'Bias due to selective reporting and publication',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                },
                {
                    id: 'indirectness',
                    name: 'Indirectness',
                    description: 'Population, intervention, comparison, outcome differences',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                },
                {
                    id: 'imprecision',
                    name: 'Imprecision',
                    description: 'Random error in effect estimate',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                },
                {
                    id: 'heterogeneity',
                    name: 'Heterogeneity',
                    description: 'Variability in effects across studies',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                },
                {
                    id: 'incoherence',
                    name: 'Incoherence',
                    description: 'Inconsistency between direct and indirect evidence',
                    levels: ['Low concern', 'Some concerns', 'Major concerns']
                }
            ],
            overallConfidence: ['Very low', 'Low', 'Moderate', 'High']
        };
    }

    /**
     * Initialize PRISMA-NMA checklist items
     */
    initPRISMANMA() {
        return [
            { section: 'Title', items: ['Title identifies as systematic review with NMA'] },
            { section: 'Abstract', items: ['Structured summary of NMA methods and results'] },
            { section: 'Eligibility', items: ['Specify eligibility criteria including study design'] },
            { section: 'Search', items: ['Present full search strategy for at least one database'] },
            { section: 'Study selection', items: ['State process for selecting studies'] },
            { section: 'Data items', items: ['List all extracted variables'] },
            { section: 'Geometry', items: ['Describe methods to explore network geometry'] },
            { section: 'Risk of bias', items: ['Describe methods for assessing risk of bias'] },
            { section: 'Effect measures', items: ['State principal summary measures'] },
            { section: 'Synthesis methods', items: ['Describe statistical methods for NMA'] },
            { section: 'Heterogeneity', items: ['Describe methods to assess heterogeneity'] },
            { section: 'Inconsistency', items: ['Describe methods to assess inconsistency'] },
            { section: 'Certainty', items: ['Describe approach for rating confidence'] },
            { section: 'Results', items: ['Present network structure', 'Summarize studies', 'Present all pairwise results'] },
            { section: 'Ranking', items: ['Present treatment ranking results'] },
            { section: 'Discussion', items: ['Discuss limitations and implications'] }
        ];
    }

    /**
     * Assess CHEERS 2022 compliance for an HTA project
     */
    assessCHEERS2022(project, additionalInfo = {}) {
        const results = {
            version: 'CHEERS 2022',
            assessmentDate: new Date().toISOString(),
            items: [],
            summary: {
                total: this.cheers2022Items.length,
                reported: 0,
                notReported: 0,
                partiallyReported: 0,
                notApplicable: 0
            },
            overallCompliance: 0
        };

        // Check each item
        for (const item of this.cheers2022Items) {
            const assessment = this.assessCHEERSItem(item, project, additionalInfo);
            results.items.push({
                id: item.id,
                section: item.section,
                item: item.item,
                required: item.required,
                status: assessment.status,
                details: assessment.details,
                recommendation: assessment.recommendation
            });

            switch (assessment.status) {
                case 'Reported': results.summary.reported++; break;
                case 'Not reported': results.summary.notReported++; break;
                case 'Partially reported': results.summary.partiallyReported++; break;
                case 'Not applicable': results.summary.notApplicable++; break;
            }
        }

        // Calculate compliance percentage
        const applicableItems = results.summary.total - results.summary.notApplicable;
        results.overallCompliance = applicableItems > 0 ?
            ((results.summary.reported + 0.5 * results.summary.partiallyReported) / applicableItems * 100).toFixed(1) : 0;

        // Generate recommendations
        results.recommendations = this.generateCHEERSRecommendations(results);

        return results;
    }

    /**
     * Assess individual CHEERS 2022 item
     */
    assessCHEERSItem(item, project, additionalInfo) {
        const settings = project.settings || {};
        const states = project.states || {};
        const parameters = project.parameters || {};
        const strategies = project.strategies || {};

        switch (item.id) {
            case 5: // Target population
                return {
                    status: settings.starting_age ? 'Reported' : 'Not reported',
                    details: settings.starting_age ? `Starting age: ${settings.starting_age}` : null,
                    recommendation: !settings.starting_age ? 'Define target population characteristics' : null
                };

            case 9: // Time horizon
                const horizon = settings.time_horizon;
                return {
                    status: horizon ? (horizon >= 20 ? 'Reported' : 'Partially reported') : 'Not reported',
                    details: horizon ? `${horizon} years` : null,
                    recommendation: !horizon || horizon < 20 ? 'Consider lifetime horizon (≥20 years for chronic conditions)' : null
                };

            case 10: // Discount rate
                const dr = settings.discount_rate_costs;
                return {
                    status: dr !== undefined ? 'Reported' : 'Not reported',
                    details: dr !== undefined ? `Costs: ${(dr * 100).toFixed(1)}%, QALYs: ${((settings.discount_rate_qalys || dr) * 100).toFixed(1)}%` : null,
                    recommendation: dr !== 0.035 ? 'NICE recommends 3.5% discount rate' : null
                };

            case 15: // Model type
                const modelType = settings.model_type || (Object.keys(states).length > 0 ? 'Markov' : 'Unknown');
                return {
                    status: modelType !== 'Unknown' ? 'Reported' : 'Not reported',
                    details: modelType,
                    recommendation: null
                };

            case 7: // Comparators
                const nStrategies = Object.keys(strategies).length;
                return {
                    status: nStrategies >= 2 ? 'Reported' : 'Not reported',
                    details: `${nStrategies} strategies defined`,
                    recommendation: nStrategies < 2 ? 'Define at least 2 strategies for comparison' : null
                };

            case 19: // Parameters
                const nParams = Object.keys(parameters).length;
                const paramsWithDist = Object.values(parameters).filter(p => p.distribution).length;
                return {
                    status: nParams > 0 ? (paramsWithDist === nParams ? 'Reported' : 'Partially reported') : 'Not reported',
                    details: `${nParams} parameters (${paramsWithDist} with distributions)`,
                    recommendation: paramsWithDist < nParams ? 'Add uncertainty distributions to all parameters' : null
                };

            default:
                // Check if additional info was provided
                const key = `cheers_${item.id}`;
                if (additionalInfo[key]) {
                    return {
                        status: 'Reported',
                        details: additionalInfo[key],
                        recommendation: null
                    };
                }
                return {
                    status: 'Not assessed',
                    details: 'Requires manual assessment',
                    recommendation: `Document: ${item.item}`
                };
        }
    }

    /**
     * Generate recommendations for CHEERS 2022 compliance
     */
    generateCHEERSRecommendations(results) {
        const recommendations = [];

        const critical = results.items.filter(i => i.required && i.status === 'Not reported');
        if (critical.length > 0) {
            recommendations.push({
                priority: 'High',
                category: 'Required items missing',
                items: critical.map(i => `Item ${i.id}: ${i.section} - ${i.item}`)
            });
        }

        const partial = results.items.filter(i => i.status === 'Partially reported');
        if (partial.length > 0) {
            recommendations.push({
                priority: 'Medium',
                category: 'Items requiring additional detail',
                items: partial.map(i => `Item ${i.id}: ${i.recommendation || i.item}`)
            });
        }

        if (results.overallCompliance < 70) {
            recommendations.push({
                priority: 'High',
                category: 'Overall compliance',
                items: [`Current compliance: ${results.overallCompliance}%. Target ≥90% for publication.`]
            });
        }

        return recommendations;
    }

    /**
     * Assess NICE Reference Case compliance
     */
    assessNICECompliance(project, psaResults = null) {
        const settings = project.settings || {};
        const results = {
            version: 'NICE Reference Case 2022',
            assessmentDate: new Date().toISOString(),
            items: [],
            overallCompliant: true
        };

        // Check perspective
        results.items.push({
            requirement: 'Perspective',
            expected: this.niceReferenceCase.perspective.required,
            status: settings.perspective?.includes('NHS') ? 'Compliant' : 'Non-compliant',
            details: settings.perspective || 'Not specified'
        });

        // Check discount rate
        const drCosts = settings.discount_rate_costs;
        const drQalys = settings.discount_rate_qalys;
        results.items.push({
            requirement: 'Discount rate',
            expected: '3.5% for costs and QALYs',
            status: drCosts === 0.035 && drQalys === 0.035 ? 'Compliant' :
                   (drCosts === 0.035 || drQalys === 0.035) ? 'Partially compliant' : 'Non-compliant',
            details: `Costs: ${(drCosts * 100 || 0).toFixed(1)}%, QALYs: ${(drQalys * 100 || 0).toFixed(1)}%`
        });

        // Check time horizon
        const horizon = settings.time_horizon || 0;
        results.items.push({
            requirement: 'Time horizon',
            expected: `≥${this.niceReferenceCase.timeHorizon.minimumYears} years for chronic conditions`,
            status: horizon >= this.niceReferenceCase.timeHorizon.minimumYears ? 'Compliant' : 'Review needed',
            details: `${horizon} years`
        });

        // Check PSA
        if (psaResults) {
            const nIterations = psaResults.iterations || 0;
            results.items.push({
                requirement: 'PSA iterations',
                expected: `≥${this.niceReferenceCase.psa.minimumIterations.toLocaleString()}`,
                status: nIterations >= this.niceReferenceCase.psa.minimumIterations ? 'Compliant' : 'Non-compliant',
                details: `${nIterations.toLocaleString()} iterations`
            });
        }

        // Check half-cycle correction
        results.items.push({
            requirement: 'Half-cycle correction',
            expected: 'Applied for Markov models',
            status: settings.half_cycle_correction !== false ? 'Compliant' : 'Non-compliant',
            details: settings.half_cycle_correction === false ? 'Not applied' : 'Applied'
        });

        // Determine overall compliance
        results.overallCompliant = results.items.every(i =>
            i.status === 'Compliant' || i.status === 'Partially compliant'
        );

        // Generate summary
        results.summary = {
            compliant: results.items.filter(i => i.status === 'Compliant').length,
            partiallyCompliant: results.items.filter(i => i.status === 'Partially compliant').length,
            nonCompliant: results.items.filter(i => i.status === 'Non-compliant').length,
            reviewNeeded: results.items.filter(i => i.status === 'Review needed').length
        };

        return results;
    }

    /**
     * Assess NMA quality using CINeMA framework
     */
    assessCINEMA(nmaResults, studyAssessments = {}) {
        const results = {
            framework: 'CINeMA',
            version: '2.0',
            assessmentDate: new Date().toISOString(),
            comparisons: [],
            overallConfidence: {}
        };

        // Get all pairwise comparisons from NMA
        const treatments = nmaResults.treatments || [];

        for (let i = 0; i < treatments.length; i++) {
            for (let j = i + 1; j < treatments.length; j++) {
                const comparison = `${treatments[i]} vs ${treatments[j]}`;

                const domainAssessments = this.assessCINEMADomains(
                    comparison,
                    nmaResults,
                    studyAssessments
                );

                const overallConfidence = this.deriveOverallConfidence(domainAssessments);

                results.comparisons.push({
                    comparison,
                    domains: domainAssessments,
                    overallConfidence,
                    recommendation: this.getCINEMARecommendation(overallConfidence)
                });
            }
        }

        return results;
    }

    /**
     * Assess individual CINeMA domains
     */
    assessCINEMADomains(comparison, nmaResults, studyAssessments) {
        const domains = {};

        // Within-study bias
        domains.withinStudyBias = {
            level: studyAssessments.robAverage || 'Some concerns',
            rationale: 'Based on individual study risk of bias assessments'
        };

        // Reporting bias
        const funnelTest = nmaResults.funnelTest || {};
        domains.reportingBias = {
            level: funnelTest.pValue < 0.1 ? 'Major concerns' :
                   funnelTest.pValue < 0.3 ? 'Some concerns' : 'Low concern',
            rationale: `Funnel plot asymmetry test p=${funnelTest.pValue?.toFixed(3) || 'NA'}`
        };

        // Indirectness
        const network = nmaResults.networkGeometry || {};
        const directEvidence = network.edges?.some(e =>
            e.treatment1 === comparison.split(' vs ')[0] ||
            e.treatment2 === comparison.split(' vs ')[1]
        );
        domains.indirectness = {
            level: directEvidence ? 'Low concern' : 'Some concerns',
            rationale: directEvidence ? 'Direct evidence available' : 'Relies on indirect evidence'
        };

        // Imprecision
        const effect = nmaResults.effects?.find(e =>
            comparison.includes(e.treatment)
        ) || {};
        const ciWidth = effect.ci_upper - effect.ci_lower;
        domains.imprecision = {
            level: ciWidth < 0.5 ? 'Low concern' :
                   ciWidth < 1.0 ? 'Some concerns' : 'Major concerns',
            rationale: `95% CI width: ${ciWidth?.toFixed(2) || 'NA'}`
        };

        // Heterogeneity
        const I2 = nmaResults.heterogeneity?.I2 ?? 0;
        domains.heterogeneity = {
            level: I2 < 25 ? 'Low concern' :
                   I2 < 75 ? 'Some concerns' : 'Major concerns',
            rationale: `I² = ${I2.toFixed(1)}%`
        };

        // Incoherence
        const consistency = nmaResults.consistency || {};
        const inconsistent = consistency.nodeSplitting?.some(n =>
            n.comparison.includes(comparison.split(' vs ')[0]) && n.inconsistent
        );
        domains.incoherence = {
            level: inconsistent ? 'Major concerns' :
                   consistency.globalTest?.pValue < 0.1 ? 'Some concerns' : 'Low concern',
            rationale: inconsistent ? 'Node-splitting shows inconsistency' : 'No significant inconsistency'
        };

        return domains;
    }

    /**
     * Derive overall confidence from domain assessments
     */
    deriveOverallConfidence(domains) {
        const levels = {
            'Low concern': 0,
            'Some concerns': 1,
            'Major concerns': 2
        };

        const domainScores = Object.values(domains).map(d => levels[d.level] ?? 1);
        const maxScore = Math.max(...domainScores);
        const avgScore = domainScores.reduce((a, b) => a + b, 0) / domainScores.length;

        if (maxScore === 2) return 'Very low';
        if (avgScore > 1) return 'Low';
        if (avgScore > 0.5) return 'Moderate';
        return 'High';
    }

    /**
     * Get recommendation based on CINeMA confidence
     */
    getCINEMARecommendation(confidence) {
        switch (confidence) {
            case 'Very low':
                return 'Very low confidence in the effect estimate. Additional research urgently needed.';
            case 'Low':
                return 'Low confidence. True effect may be substantially different from estimate.';
            case 'Moderate':
                return 'Moderate confidence. True effect likely to be close to estimate.';
            case 'High':
                return 'High confidence. Very unlikely that further research will change conclusions.';
            default:
                return 'Confidence not assessed.';
        }
    }

    /**
     * Generate automated HTA report
     */
    generateHTAReport(project, results = {}) {
        const settings = project.settings || {};
        const strategies = Object.keys(project.strategies || {});
        const parameters = project.parameters || {};

        const report = {
            title: project.name || 'Health Technology Assessment',
            generatedDate: new Date().toISOString(),
            sections: []
        };

        // Executive Summary
        report.sections.push({
            heading: 'Executive Summary',
            content: this.generateExecutiveSummary(project, results)
        });

        // Background and Objectives
        report.sections.push({
            heading: 'Background and Objectives',
            content: `This health economic evaluation compares ${strategies.join(', ')} ` +
                    `for the target population starting at age ${settings.starting_age || 'unspecified'}. ` +
                    `The analysis takes a ${settings.perspective || 'healthcare'} perspective ` +
                    `over a time horizon of ${settings.time_horizon || 'unspecified'} years.`
        });

        // Methods
        report.sections.push({
            heading: 'Methods',
            subsections: [
                {
                    heading: 'Model Structure',
                    content: this.describeModelStructure(project)
                },
                {
                    heading: 'Model Parameters',
                    content: this.describeParameters(parameters),
                    table: this.generateParameterTable(parameters)
                },
                {
                    heading: 'Analytical Approach',
                    content: this.describeAnalyticalApproach(settings, results)
                }
            ]
        });

        // Results
        if (results.baseCase || results.psa) {
            report.sections.push({
                heading: 'Results',
                subsections: [
                    {
                        heading: 'Base-Case Analysis',
                        content: this.describeBaseCaseResults(results.baseCase),
                        table: results.baseCase?.summary
                    },
                    {
                        heading: 'Probabilistic Sensitivity Analysis',
                        content: this.describePSAResults(results.psa),
                        figures: ['CE plane', 'CEAC']
                    }
                ]
            });
        }

        // Discussion
        report.sections.push({
            heading: 'Discussion',
            content: this.generateDiscussion(project, results)
        });

        // Compliance
        const cheersCompliance = this.assessCHEERS2022(project);
        const niceCompliance = this.assessNICECompliance(project, results.psa);

        report.sections.push({
            heading: 'Reporting Standards Compliance',
            subsections: [
                {
                    heading: 'CHEERS 2022',
                    content: `Overall compliance: ${cheersCompliance.overallCompliance}%`,
                    recommendations: cheersCompliance.recommendations
                },
                {
                    heading: 'NICE Reference Case',
                    content: niceCompliance.overallCompliant ?
                        'The analysis is compliant with the NICE reference case.' :
                        'Some deviations from the NICE reference case were identified.',
                    items: niceCompliance.items
                }
            ]
        });

        return report;
    }

    /**
     * Generate executive summary
     */
    generateExecutiveSummary(project, results) {
        const strategies = Object.keys(project.strategies || {});

        let summary = `This economic evaluation assessed ${strategies.length} treatment strategies. `;

        if (results.baseCase) {
            const icer = results.baseCase.summary?.icer;
            const dominant = results.baseCase.summary?.dominant;

            if (dominant) {
                summary += `${dominant} was dominant (more effective and less costly). `;
            } else if (icer) {
                summary += `The incremental cost-effectiveness ratio was £${icer.toLocaleString()} per QALY. `;
            }
        }

        if (results.psa) {
            const probCE = results.psa.probability_ce_30k || 0;
            summary += `At a willingness-to-pay threshold of £30,000/QALY, ` +
                      `the probability of cost-effectiveness was ${(probCE * 100).toFixed(0)}%. `;
        }

        return summary;
    }

    /**
     * Describe model structure
     */
    describeModelStructure(project) {
        const states = Object.keys(project.states || {});
        const transitions = Object.keys(project.transitions || {});
        const settings = project.settings || {};

        return `A ${settings.model_type || 'Markov cohort'} model was constructed with ` +
               `${states.length} health states: ${states.join(', ')}. ` +
               `The model includes ${transitions.length} state transitions. ` +
               `Cycle length was ${settings.cycle_length || 1} year(s) with ` +
               `${settings.half_cycle_correction ? 'half-cycle correction applied' : 'no half-cycle correction'}.`;
    }

    /**
     * Describe parameters
     */
    describeParameters(parameters) {
        const nParams = Object.keys(parameters).length;
        const withDist = Object.values(parameters).filter(p => p.distribution).length;

        return `The model included ${nParams} parameters, of which ` +
               `${withDist} (${(withDist/nParams*100).toFixed(0)}%) had uncertainty distributions ` +
               `specified for probabilistic analysis.`;
    }

    /**
     * Generate parameter table
     */
    generateParameterTable(parameters) {
        return Object.entries(parameters).map(([id, param]) => ({
            parameter: id,
            value: param.value,
            distribution: param.distribution?.type || 'Fixed',
            distributionParams: param.distribution ?
                JSON.stringify(param.distribution) : '-',
            source: param.source || 'Not specified'
        }));
    }

    /**
     * Describe analytical approach
     */
    describeAnalyticalApproach(settings, results) {
        let content = `Costs and health outcomes were discounted at ` +
                     `${((settings.discount_rate_costs || 0.035) * 100).toFixed(1)}% per annum. `;

        if (results.psa) {
            content += `Probabilistic sensitivity analysis was conducted using ` +
                      `${results.psa.iterations?.toLocaleString() || 'multiple'} Monte Carlo simulations. `;
        }

        if (results.dsa) {
            content += `One-way deterministic sensitivity analysis examined the impact of ` +
                      `individual parameter uncertainty. `;
        }

        return content;
    }

    /**
     * Describe base-case results
     */
    describeBaseCaseResults(baseCase) {
        if (!baseCase) return 'Base-case results not available.';

        const summary = baseCase.summary || {};
        return `In the base-case analysis, the intervention resulted in ` +
               `${summary.incremental_qalys?.toFixed(3) || 'NA'} additional QALYs ` +
               `at an incremental cost of £${summary.incremental_costs?.toLocaleString() || 'NA'}. ` +
               `The incremental cost-effectiveness ratio was ` +
               `£${summary.icer?.toLocaleString() || 'NA'} per QALY gained.`;
    }

    /**
     * Describe PSA results
     */
    describePSAResults(psa) {
        if (!psa) return 'Probabilistic analysis results not available.';

        const probCE = (psa.probability_ce_30k || 0) * 100;
        return `Across ${psa.iterations?.toLocaleString() || 'all'} probabilistic iterations, ` +
               `the intervention was cost-effective at a £30,000/QALY threshold in ` +
               `${probCE.toFixed(1)}% of simulations. ` +
               `The 95% credible interval for the ICER was ` +
               `£${psa.icer_ci_lower?.toLocaleString() || 'NA'} to ` +
               `£${psa.icer_ci_upper?.toLocaleString() || 'NA'}.`;
    }

    /**
     * Generate discussion section
     */
    generateDiscussion(project, results) {
        return `This economic evaluation provides evidence on the cost-effectiveness of ` +
               `the interventions considered. Key uncertainties remain around [specific parameters]. ` +
               `The results are broadly consistent with [previous analyses/clinical evidence]. ` +
               `Limitations include [model assumptions, data limitations]. ` +
               `Further research is needed to [specific areas].`;
    }

    /**
     * Export report to formatted text
     */
    exportReportAsText(report) {
        let text = `${'='.repeat(80)}\n`;
        text += `${report.title}\n`;
        text += `Generated: ${report.generatedDate}\n`;
        text += `${'='.repeat(80)}\n\n`;

        for (const section of report.sections) {
            text += `\n## ${section.heading}\n${'─'.repeat(40)}\n`;

            if (section.content) {
                text += `${section.content}\n\n`;
            }

            if (section.subsections) {
                for (const sub of section.subsections) {
                    text += `\n### ${sub.heading}\n`;
                    if (sub.content) text += `${sub.content}\n`;

                    if (sub.table) {
                        text += '\n' + this.formatTable(sub.table) + '\n';
                    }
                }
            }
        }

        return text;
    }

    /**
     * Format table for text output
     */
    formatTable(data) {
        if (!Array.isArray(data) || data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const colWidths = headers.map(h => Math.max(h.length,
            ...data.map(row => String(row[h] || '').length)
        ));

        let output = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + '\n';
        output += colWidths.map(w => '─'.repeat(w)).join('─┼─') + '\n';

        for (const row of data) {
            output += headers.map((h, i) =>
                String(row[h] || '').padEnd(colWidths[i])
            ).join(' | ') + '\n';
        }

        return output;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ReportingStandards = ReportingStandards;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ReportingStandards };
}
