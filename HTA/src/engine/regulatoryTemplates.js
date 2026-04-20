/**
 * Regulatory Template Engine for HTA
 * Generates structured HTA submission documents for major regulatory agencies.
 *
 * Supported agencies:
 * - NICE (UK) — Single Technology Appraisal (STA)
 * - CADTH (Canada) — Common Drug Review
 * - EUnetHTA (EU) — Joint Clinical Assessment
 * - PBAC (Australia) — Pharmaceutical Benefits Advisory Committee
 * - G-BA (Germany) — AMNOG Benefit Assessment
 *
 * References:
 * - NICE STA submission template (2022)
 * - CADTH Common Drug Review procedures
 * - EUnetHTA Core Model 3.0
 * - PBAC Guidelines Section 3
 * - G-BA Dossier Template Module 1-5
 */

class RegulatoryTemplateEngine {
    constructor(options = {}) {
        this.options = {
            language: 'en',
            includeAppendices: true,
            currencySymbol: '£',
            ...options
        };

        this.VALID_AGENCIES = ['NICE', 'CADTH', 'EUnetHTA', 'PBAC', 'GBA'];
    }

    // ============================================================
    // NICE STA SUBMISSION (UK)
    // ============================================================

    /**
     * Generate NICE Single Technology Appraisal submission
     * Based on NICE STA template 2022
     * @param {Object} analysisResults - Results from HTA engines
     * @param {Object} options - Submission options
     * @returns {Object} Structured NICE STA submission
     */
    generateNICESTA(analysisResults, options = {}) {
        const results = analysisResults || {};
        const meta = options.meta || {};

        return {
            agency: 'NICE',
            templateVersion: 'STA 2022',
            sectionA: this._buildNICESectionA(results, meta),
            sectionB: this._buildNICESectionB(results, meta),
            sectionC: this._buildNICESectionC(results, meta),
            sectionD: this._buildNICESectionD(results, meta)
        };
    }

    _buildNICESectionA(results, meta) {
        const intervention = meta.intervention || results.intervention || 'Not specified';
        const comparators = meta.comparators || results.comparators || [];
        const outcomes = meta.outcomes || results.outcomes || [];
        const population = meta.population || results.population || 'Not specified';

        return {
            title: 'Decision Problem',
            diseaseContext: meta.diseaseContext || results.diseaseContext || 'Not specified',
            population: population,
            intervention: intervention,
            comparators: Array.isArray(comparators) ? comparators : [comparators],
            outcomes: Array.isArray(outcomes) ? outcomes : [outcomes],
            subgroups: meta.subgroups || results.subgroups || [],
            specialConsiderations: {
                endOfLife: meta.endOfLife ?? results.endOfLife ?? false,
                severity: meta.severity || results.severity || 'Not assessed',
                innovation: meta.innovation ?? results.innovation ?? false
            }
        };
    }

    _buildNICESectionB(results, meta) {
        const sr = results.systematicReview || {};
        const rob = results.riskOfBias || results.robTable || {};
        const ma = results.metaAnalysis || results.pooledEffects || {};
        const nma = results.nmaResults || null;

        return {
            title: 'Clinical Effectiveness',
            systematicReview: {
                databases: sr.databases || meta.databases || ['MEDLINE', 'Embase', 'Cochrane CENTRAL'],
                searchStrategy: sr.searchStrategy || meta.searchStrategy || 'Not provided',
                prismaFlow: sr.prismaFlow || this._defaultPRISMAFlow()
            },
            studyCharacteristics: {
                includedStudies: results.studies || sr.includedStudies || [],
                table: this._buildStudyCharacteristicsTable(results.studies || sr.includedStudies || [])
            },
            qualityAssessment: {
                robTable: rob,
                summary: this._summarizeRoB(rob)
            },
            clinicalResults: {
                pooledEffects: ma.pooledEffects || ma.effects || [],
                heterogeneity: {
                    I2: ma.I2 ?? ma.i2 ?? null,
                    tau2: ma.tau2 ?? null,
                    cochranQ: ma.Q ?? ma.cochranQ ?? null,
                    pHeterogeneity: ma.pHeterogeneity ?? ma.pQ ?? null
                },
                subgroupAnalysis: results.subgroupAnalysis || ma.subgroupAnalysis || []
            },
            nmaResults: nma ? {
                available: true,
                network: nma.network || null,
                rankings: nma.rankings || nma.sucra || null,
                leagueTable: nma.leagueTable || null,
                consistencyCheck: nma.consistency || null
            } : { available: false }
        };
    }

    _buildNICESectionC(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};
        const psa = results.psaResults || results.psa || {};
        const scenarios = results.scenarioAnalysis || [];

        const baseCase = ce.baseCase || {};

        return {
            title: 'Cost-effectiveness',
            modelStructure: ce.modelStructure || meta.modelStructure || 'Not specified',
            clinicalParameters: this._extractParameters(ce.clinicalParameters || results.clinicalParameters || [], 'clinical'),
            costParameters: this._extractParameters(ce.costParameters || results.costParameters || [], 'cost'),
            utilityParameters: this._extractParameters(ce.utilityParameters || results.utilityParameters || [], 'utility'),
            baseCase: {
                icer: baseCase.icer ?? ce.icer ?? null,
                costPerQaly: baseCase.costPerQaly ?? ce.costPerQaly ?? baseCase.icer ?? ce.icer ?? null,
                totalCosts: baseCase.totalCosts ?? ce.totalCosts ?? null,
                totalQalys: baseCase.totalQalys ?? ce.totalQalys ?? null
            },
            psaResults: {
                meanICER: psa.meanICER ?? psa.mean ?? null,
                ci95: psa.ci95 ?? psa.confidenceInterval ?? null,
                ceacData: psa.ceacData ?? psa.ceac ?? null,
                iterations: psa.iterations ?? psa.nIterations ?? null
            },
            scenarioAnalysis: scenarios.map(s => ({
                name: s.name || 'Unnamed scenario',
                icer: s.icer ?? s.result ?? null,
                description: s.description || ''
            })),
            structuralUncertainty: ce.structuralUncertainty || meta.structuralUncertainty || 'Not assessed'
        };
    }

    _buildNICESectionD(results, meta) {
        const bia = results.budgetImpact || results.biaResults || {};
        const yearlyBudget = bia.yearlyBudget || bia.annualBudget || [];

        return {
            title: 'Budget Impact',
            eligiblePopulation: bia.eligiblePopulation ?? meta.eligiblePopulation ?? null,
            marketUptake: bia.marketUptake ?? bia.uptake ?? [],
            budgetImpact: yearlyBudget.map((y, i) => ({
                year: y.year ?? (i + 1),
                cost: y.cost ?? y.incrementalCost ?? y.totalCost ?? null
            })),
            netBudgetImpact: bia.netBudgetImpact ?? bia.totalIncremental ?? this._sumBudgetImpact(yearlyBudget)
        };
    }

    // ============================================================
    // CADTH SUBMISSION (Canada)
    // ============================================================

    /**
     * Generate CADTH Common Drug Review submission
     * @param {Object} analysisResults - Results from HTA engines
     * @param {Object} options - Submission options
     * @returns {Object} Structured CADTH submission
     */
    generateCADTH(analysisResults, options = {}) {
        const results = analysisResults || {};
        const meta = options.meta || {};

        return {
            agency: 'CADTH',
            templateVersion: 'CDR 2023',
            executiveSummary: this._buildCADTHExecutiveSummary(results, meta),
            clinicalReview: this._buildCADTHClinicalReview(results, meta),
            economicEvaluation: this._buildCADTHEconomicEvaluation(results, meta),
            budgetImpact: this._buildCADTHBudgetImpact(results, meta)
        };
    }

    _buildCADTHExecutiveSummary(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};
        const baseCase = ce.baseCase || {};

        return {
            title: 'Executive Summary',
            drugName: meta.drugName || meta.intervention || results.intervention || 'Not specified',
            indication: meta.indication || meta.diseaseContext || 'Not specified',
            reimbursementRequest: meta.reimbursementRequest || 'Not specified',
            clinicalSummary: this._generateClinicalSummaryText(results),
            economicSummary: {
                icer: baseCase.icer ?? ce.icer ?? null,
                costPerQaly: baseCase.costPerQaly ?? ce.costPerQaly ?? null,
                priceReduction: meta.priceReduction ?? null
            },
            recommendation: meta.recommendation || 'Pending review'
        };
    }

    _buildCADTHClinicalReview(results, meta) {
        const ma = results.metaAnalysis || results.pooledEffects || {};
        const sr = results.systematicReview || {};

        return {
            title: 'Clinical Review',
            pivotalStudies: results.studies || sr.includedStudies || [],
            efficacyResults: ma.pooledEffects || ma.effects || [],
            safetyResults: results.safetyResults || meta.safetyResults || [],
            patientInput: meta.patientInput || 'Not provided'
        };
    }

    _buildCADTHEconomicEvaluation(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};
        const psa = results.psaResults || results.psa || {};

        return {
            title: 'Economic Evaluation',
            perspective: meta.perspective || 'Canadian public healthcare payer',
            modelType: ce.modelStructure || meta.modelStructure || 'Not specified',
            timeHorizon: meta.timeHorizon || ce.timeHorizon || 'Not specified',
            discountRate: meta.discountRate ?? ce.discountRate ?? 0.015,
            results: {
                icer: ce.baseCase?.icer ?? ce.icer ?? null,
                totalCosts: ce.baseCase?.totalCosts ?? ce.totalCosts ?? null,
                totalQalys: ce.baseCase?.totalQalys ?? ce.totalQalys ?? null
            },
            sensitivityAnalysis: {
                psa: {
                    meanICER: psa.meanICER ?? psa.mean ?? null,
                    ci95: psa.ci95 ?? psa.confidenceInterval ?? null
                },
                scenarios: results.scenarioAnalysis || []
            }
        };
    }

    _buildCADTHBudgetImpact(results, meta) {
        const bia = results.budgetImpact || results.biaResults || {};

        return {
            title: 'Budget Impact Analysis',
            timeHorizon: bia.timeHorizon || meta.biaTimeHorizon || 3,
            eligiblePopulation: bia.eligiblePopulation ?? meta.eligiblePopulation ?? null,
            annualBudget: bia.yearlyBudget || bia.annualBudget || [],
            netImpact: bia.netBudgetImpact ?? bia.totalIncremental ?? null
        };
    }

    // ============================================================
    // EUnetHTA SUBMISSION (EU)
    // ============================================================

    /**
     * Generate EUnetHTA Joint Clinical Assessment
     * Based on EUnetHTA Core Model 3.0
     * @param {Object} analysisResults - Results from HTA engines
     * @param {Object} options - Submission options
     * @returns {Object} Structured EUnetHTA JCA
     */
    generateEUnetHTA(analysisResults, options = {}) {
        const results = analysisResults || {};
        const meta = options.meta || {};

        return {
            agency: 'EUnetHTA',
            templateVersion: 'Core Model 3.0',
            healthProblem: this._buildEUnetHTAHealthProblem(results, meta),
            technology: this._buildEUnetHTATechnology(results, meta),
            safety: this._buildEUnetHTASafety(results, meta),
            clinicalEffectiveness: this._buildEUnetHTAClinicalEffectiveness(results, meta),
            costs: this._buildEUnetHTACosts(results, meta)
        };
    }

    _buildEUnetHTAHealthProblem(results, meta) {
        return {
            title: 'Health Problem and Current Use of Technology',
            diseaseDescription: meta.diseaseContext || results.diseaseContext || 'Not specified',
            epidemiology: {
                prevalence: meta.prevalence ?? results.prevalence ?? null,
                incidence: meta.incidence ?? results.incidence ?? null,
                mortality: meta.mortality ?? results.mortality ?? null
            },
            currentManagement: meta.currentManagement || results.currentManagement || 'Not specified',
            targetPopulation: meta.population || results.population || 'Not specified',
            unmetNeed: meta.unmetNeed || 'Not specified'
        };
    }

    _buildEUnetHTATechnology(results, meta) {
        return {
            title: 'Description and Technical Characteristics of Technology',
            name: meta.intervention || results.intervention || 'Not specified',
            mechanism: meta.mechanism || 'Not specified',
            administration: meta.administration || 'Not specified',
            regulatoryStatus: meta.regulatoryStatus || 'Not specified',
            comparators: meta.comparators || results.comparators || []
        };
    }

    _buildEUnetHTASafety(results, meta) {
        return {
            title: 'Safety',
            adverseEvents: results.safetyResults || meta.safetyResults || [],
            seriousAdverseEvents: results.seriousAdverseEvents || meta.seriousAdverseEvents || [],
            safetyProfile: meta.safetyProfile || 'See included studies',
            riskManagement: meta.riskManagement || 'Not specified'
        };
    }

    _buildEUnetHTAClinicalEffectiveness(results, meta) {
        const ma = results.metaAnalysis || results.pooledEffects || {};
        const sr = results.systematicReview || {};

        return {
            title: 'Clinical Effectiveness',
            availableEvidence: results.studies || sr.includedStudies || [],
            relativeEffectiveness: {
                pooledEffects: ma.pooledEffects || ma.effects || [],
                heterogeneity: {
                    I2: ma.I2 ?? ma.i2 ?? null,
                    tau2: ma.tau2 ?? null
                }
            },
            applicability: meta.applicability || 'To be assessed',
            limitations: meta.limitations || []
        };
    }

    _buildEUnetHTACosts(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};

        return {
            title: 'Costs and Economic Evaluation',
            resourceUse: meta.resourceUse || 'Not specified',
            unitCosts: ce.costParameters || results.costParameters || [],
            costEffectiveness: {
                icer: ce.baseCase?.icer ?? ce.icer ?? null,
                totalCosts: ce.baseCase?.totalCosts ?? ce.totalCosts ?? null,
                totalQalys: ce.baseCase?.totalQalys ?? ce.totalQalys ?? null
            },
            budgetImpact: results.budgetImpact || results.biaResults || {}
        };
    }

    // ============================================================
    // PBAC SUBMISSION (Australia)
    // ============================================================

    /**
     * Generate PBAC submission
     * Based on PBAC Guidelines Section 3
     * @param {Object} analysisResults - Results from HTA engines
     * @param {Object} options - Submission options
     * @returns {Object} Structured PBAC submission
     */
    generatePBAC(analysisResults, options = {}) {
        const results = analysisResults || {};
        const meta = options.meta || {};

        return {
            agency: 'PBAC',
            templateVersion: 'PBAC Guidelines 5.0',
            clinicalClaim: this._buildPBACClinicalClaim(results, meta),
            trialEvidence: this._buildPBACTrialEvidence(results, meta),
            economicAnalysis: this._buildPBACEconomicAnalysis(results, meta),
            financialEstimates: this._buildPBACFinancialEstimates(results, meta)
        };
    }

    _buildPBACClinicalClaim(results, meta) {
        const ma = results.metaAnalysis || results.pooledEffects || {};

        return {
            title: 'Clinical Claim',
            intervention: meta.intervention || results.intervention || 'Not specified',
            comparator: meta.comparators?.[0] || (results.comparators || [])[0] || 'Not specified',
            claimBasis: meta.claimBasis || 'superiority',
            claimType: meta.claimType || this._inferClaimType(ma),
            primaryOutcome: meta.primaryOutcome || (results.outcomes || [])[0] || 'Not specified',
            effectEstimate: ma.pooledEffects?.[0] || ma.effects?.[0] || null,
            clinicalSignificance: meta.clinicalSignificance || 'To be assessed'
        };
    }

    _buildPBACTrialEvidence(results, meta) {
        const sr = results.systematicReview || {};

        return {
            title: 'Trial Evidence',
            searchStrategy: sr.searchStrategy || meta.searchStrategy || 'Not provided',
            includedTrials: results.studies || sr.includedStudies || [],
            trialDesign: meta.trialDesign || 'Not specified',
            riskOfBias: results.riskOfBias || results.robTable || {},
            results: results.metaAnalysis || results.pooledEffects || {}
        };
    }

    _buildPBACEconomicAnalysis(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};
        const baseCase = ce.baseCase || {};
        const analysisType = meta.economicAnalysisType || this._inferEconomicAnalysisType(ce);

        return {
            title: 'Economic Analysis',
            type: analysisType,
            perspective: meta.perspective || 'Australian healthcare system',
            modelStructure: ce.modelStructure || meta.modelStructure || 'Not specified',
            timeHorizon: meta.timeHorizon || ce.timeHorizon || 'Lifetime',
            discountRate: meta.discountRate ?? ce.discountRate ?? 0.05,
            baseCase: {
                icer: baseCase.icer ?? ce.icer ?? null,
                costPerQaly: baseCase.costPerQaly ?? ce.costPerQaly ?? null,
                incrementalCost: baseCase.incrementalCost ?? ce.incrementalCost ?? null,
                incrementalQaly: baseCase.incrementalQaly ?? ce.incrementalQaly ?? null
            },
            sensitivityAnalysis: {
                psa: results.psaResults || results.psa || {},
                dsa: results.dsaResults || {},
                scenarios: results.scenarioAnalysis || []
            }
        };
    }

    _buildPBACFinancialEstimates(results, meta) {
        const bia = results.budgetImpact || results.biaResults || {};

        return {
            title: 'Financial Estimates',
            estimatedUtilisation: bia.eligiblePopulation ?? meta.eligiblePopulation ?? null,
            estimatedCost: bia.netBudgetImpact ?? bia.totalIncremental ?? null,
            netCostToGovernment: meta.netCostToGovernment ?? bia.netBudgetImpact ?? null,
            years: bia.yearlyBudget || bia.annualBudget || []
        };
    }

    // ============================================================
    // G-BA AMNOG DOSSIER (Germany)
    // ============================================================

    /**
     * Generate G-BA AMNOG benefit assessment dossier
     * Based on G-BA Dossier Template Modules 1-5
     * @param {Object} analysisResults - Results from HTA engines
     * @param {Object} options - Submission options
     * @returns {Object} Structured G-BA dossier
     */
    generateGBA(analysisResults, options = {}) {
        const results = analysisResults || {};
        const meta = options.meta || {};

        return {
            agency: 'GBA',
            templateVersion: 'AMNOG Dossier 2023',
            module1: this._buildGBAModule1(results, meta),
            module2: this._buildGBAModule2(results, meta),
            module3: this._buildGBAModule3(results, meta),
            module4: this._buildGBAModule4(results, meta),
            module5: this._buildGBAModule5(results, meta)
        };
    }

    _buildGBAModule1(results, meta) {
        return {
            title: 'Module 1 — Administrative Information',
            drugName: meta.drugName || meta.intervention || results.intervention || 'Not specified',
            manufacturer: meta.manufacturer || 'Not specified',
            indication: meta.indication || meta.diseaseContext || results.diseaseContext || 'Not specified',
            atcCode: meta.atcCode || 'Not specified',
            submissionDate: meta.submissionDate || new Date().toISOString().split('T')[0]
        };
    }

    _buildGBAModule2(results, meta) {
        return {
            title: 'Module 2 — General Information on the Drug',
            approvedIndication: meta.approvedIndication || meta.indication || 'Not specified',
            mechanism: meta.mechanism || 'Not specified',
            therapeuticArea: meta.therapeuticArea || 'Not specified',
            comparativeTherapy: meta.comparators || results.comparators || [],
            patientPopulation: meta.population || results.population || 'Not specified'
        };
    }

    _buildGBAModule3(results, meta) {
        const ma = results.metaAnalysis || results.pooledEffects || {};
        const sr = results.systematicReview || {};

        return {
            title: 'Module 3 — Evidence Dossier',
            systematicSearch: {
                databases: sr.databases || meta.databases || ['MEDLINE', 'Embase', 'Cochrane CENTRAL'],
                strategy: sr.searchStrategy || meta.searchStrategy || 'Not provided'
            },
            includedStudies: results.studies || sr.includedStudies || [],
            riskOfBias: results.riskOfBias || results.robTable || {},
            results: {
                pooledEffects: ma.pooledEffects || ma.effects || [],
                heterogeneity: {
                    I2: ma.I2 ?? ma.i2 ?? null,
                    tau2: ma.tau2 ?? null
                }
            },
            subgroupAnalysis: results.subgroupAnalysis || ma.subgroupAnalysis || []
        };
    }

    _buildGBAModule4(results, meta) {
        const ce = results.costEffectiveness || results.ceResults || {};

        return {
            title: 'Module 4 — Health Economic Evaluation',
            costComparison: {
                annualTreatmentCost: meta.annualTreatmentCost ?? ce.annualTreatmentCost ?? null,
                comparatorCost: meta.comparatorCost ?? ce.comparatorCost ?? null,
                additionalCosts: meta.additionalCosts || ce.additionalCosts || []
            },
            costEffectiveness: {
                icer: ce.baseCase?.icer ?? ce.icer ?? null,
                totalCosts: ce.baseCase?.totalCosts ?? ce.totalCosts ?? null,
                totalQalys: ce.baseCase?.totalQalys ?? ce.totalQalys ?? null
            }
        };
    }

    _buildGBAModule5(results, meta) {
        const bia = results.budgetImpact || results.biaResults || {};

        return {
            title: 'Module 5 — Budget Impact Analysis',
            targetPopulation: bia.eligiblePopulation ?? meta.eligiblePopulation ?? null,
            uptakeForecast: bia.marketUptake ?? bia.uptake ?? [],
            annualBudgetImpact: bia.yearlyBudget || bia.annualBudget || [],
            totalBudgetImpact: bia.netBudgetImpact ?? bia.totalIncremental ?? null,
            costOffsets: bia.costOffsets || meta.costOffsets || []
        };
    }

    // ============================================================
    // EXPORT METHODS
    // ============================================================

    /**
     * Export submission as formatted HTML
     * @param {Object} submission - Generated submission object
     * @param {string} agency - Agency name
     * @returns {string} HTML string
     */
    exportAsHTML(submission, agency) {
        if (!submission) return '<html><body><p>No submission data provided</p></body></html>';

        const agencyName = agency || submission.agency || 'Unknown';
        let html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${agencyName} HTA Submission</title>\n`;
        html += `<style>
body { font-family: Arial, sans-serif; margin: 2em; line-height: 1.6; }
h1 { color: #1a5276; border-bottom: 2px solid #1a5276; padding-bottom: 0.3em; }
h2 { color: #2c3e50; margin-top: 1.5em; }
h3 { color: #34495e; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #bdc3c7; padding: 8px 12px; text-align: left; }
th { background-color: #ecf0f1; font-weight: bold; }
.na { color: #95a5a6; font-style: italic; }
</style>\n</head>\n<body>\n`;

        html += `<h1>${agencyName} HTA Submission</h1>\n`;
        html += this._renderSectionsHTML(submission);
        html += `</body>\n</html>`;

        return html;
    }

    /**
     * Export submission as formatted Markdown
     * @param {Object} submission - Generated submission object
     * @param {string} agency - Agency name
     * @returns {string} Markdown string
     */
    exportAsMarkdown(submission, agency) {
        if (!submission) return '# No submission data provided\n';

        const agencyName = agency || submission.agency || 'Unknown';
        let md = `# ${agencyName} HTA Submission\n\n`;
        md += this._renderSectionsMarkdown(submission);

        return md;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    _defaultPRISMAFlow() {
        return {
            identified: null,
            screened: null,
            eligible: null,
            included: null
        };
    }

    _buildStudyCharacteristicsTable(studies) {
        if (!Array.isArray(studies) || studies.length === 0) return [];
        return studies.map(s => ({
            name: s.name || s.id || 'Unnamed',
            design: s.design || 'Not reported',
            n: s.n ?? s.sampleSize ?? null,
            population: s.population || 'Not reported',
            intervention: s.intervention || 'Not reported',
            comparator: s.comparator || 'Not reported',
            followUp: s.followUp || 'Not reported'
        }));
    }

    _summarizeRoB(rob) {
        if (!rob || (typeof rob === 'object' && Object.keys(rob).length === 0)) {
            return 'Risk of bias assessment not available';
        }
        return 'Risk of bias assessment provided — see table for details';
    }

    _extractParameters(params, type) {
        if (!Array.isArray(params)) return [];
        return params.map(p => {
            const base = {
                name: p.name || 'Unnamed parameter',
                value: p.value ?? null,
                source: p.source || 'Not specified'
            };
            if (type === 'clinical') {
                base.distribution = p.distribution || 'Not specified';
            } else if (type === 'cost') {
                base.year = p.year || 'Not specified';
            } else if (type === 'utility') {
                base.method = p.method || 'Not specified';
            }
            return base;
        });
    }

    _sumBudgetImpact(yearly) {
        if (!Array.isArray(yearly) || yearly.length === 0) return null;
        const total = yearly.reduce((sum, y) => {
            const cost = y.cost ?? y.incrementalCost ?? y.totalCost ?? 0;
            return sum + cost;
        }, 0);
        return total;
    }

    _generateClinicalSummaryText(results) {
        const ma = results.metaAnalysis || results.pooledEffects || {};
        const effects = ma.pooledEffects || ma.effects || [];
        if (effects.length === 0) return 'Clinical evidence summary not available';
        return `Based on ${effects.length} pooled effect estimate(s) from the systematic review.`;
    }

    _inferClaimType(ma) {
        const effects = ma.pooledEffects || ma.effects || [];
        if (effects.length === 0) return 'Not determined';
        return 'superiority';
    }

    _inferEconomicAnalysisType(ce) {
        if (ce.costPerQaly || ce.baseCase?.costPerQaly) return 'cost-utility';
        if (ce.icer || ce.baseCase?.icer) return 'cost-effectiveness';
        return 'cost-minimisation';
    }

    _renderSectionsHTML(obj, depth = 2) {
        let html = '';
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'agency' || key === 'templateVersion') continue;
            if (value === null || value === undefined) {
                html += `<p><strong>${this._formatKey(key)}:</strong> <span class="na">Not available</span></p>\n`;
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                const tag = `h${Math.min(depth, 6)}`;
                if (value.title) {
                    html += `<${tag}>${value.title}</${tag}>\n`;
                } else {
                    html += `<${tag}>${this._formatKey(key)}</${tag}>\n`;
                }
                html += this._renderSectionsHTML(value, depth + 1);
            } else if (Array.isArray(value)) {
                html += `<p><strong>${this._formatKey(key)}:</strong></p>\n`;
                if (value.length === 0) {
                    html += `<p class="na">None specified</p>\n`;
                } else {
                    html += '<ul>\n';
                    for (const item of value) {
                        html += `<li>${typeof item === 'object' ? JSON.stringify(item) : item}</li>\n`;
                    }
                    html += '</ul>\n';
                }
            } else if (key === 'title') {
                // title is already rendered as heading, skip
            } else {
                html += `<p><strong>${this._formatKey(key)}:</strong> ${value}</p>\n`;
            }
        }
        return html;
    }

    _renderSectionsMarkdown(obj, depth = 2) {
        let md = '';
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'agency' || key === 'templateVersion') continue;
            if (value === null || value === undefined) {
                md += `**${this._formatKey(key)}:** *Not available*\n\n`;
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                const hashes = '#'.repeat(Math.min(depth, 6));
                if (value.title) {
                    md += `${hashes} ${value.title}\n\n`;
                } else {
                    md += `${hashes} ${this._formatKey(key)}\n\n`;
                }
                md += this._renderSectionsMarkdown(value, depth + 1);
            } else if (Array.isArray(value)) {
                md += `**${this._formatKey(key)}:**\n\n`;
                if (value.length === 0) {
                    md += `*None specified*\n\n`;
                } else {
                    for (const item of value) {
                        md += `| ${typeof item === 'object' ? JSON.stringify(item) : item} |\n`;
                    }
                    md += '\n';
                }
            } else if (key === 'title') {
                // title is already rendered as heading, skip
            } else {
                md += `**${this._formatKey(key)}:** ${value}\n\n`;
            }
        }
        return md;
    }

    _formatKey(key) {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, s => s.toUpperCase())
            .replace(/_/g, ' ')
            .trim();
    }

    /**
     * Validate agency name
     * @param {string} agency - Agency name
     * @returns {boolean}
     */
    isValidAgency(agency) {
        return this.VALID_AGENCIES.includes(agency);
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.RegulatoryTemplateEngine = RegulatoryTemplateEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RegulatoryTemplateEngine };
}
