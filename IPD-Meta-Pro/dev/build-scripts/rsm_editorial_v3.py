#!/usr/bin/env python3
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

"""
Research Synthesis Methods Editorial Review V3
ENHANCES features without removing anything

Focus areas:
1. Uncertainty communication
2. Method selection guidance
3. Assumption verification
4. Reporting checklists
5. Clinical significance
6. Risk of bias integration
7. Credibility of subgroups
8. Ecological bias warnings
9. IPD-specific advantages documentation
10. Comprehensive validation
"""

import re

def apply_editorial_enhancements():
    with open('ipd-meta-pro.html', 'r', encoding='utf-8') as f:
        content = f.read()

    original_length = len(content)
    enhancements = []

    # ==========================================================================
    # ENHANCEMENT 1: UNCERTAINTY COMMUNICATION FRAMEWORK
    # ==========================================================================
    uncertainty_framework = '''
    // ============================================================================
    // UNCERTAINTY COMMUNICATION FRAMEWORK
    // Reference: Spiegelhalter D. Science 2017;356:1232-1233
    // Editorial requirement: Clear communication of statistical uncertainty
    // ============================================================================
    function communicateUncertainty(results, config) {
        var isRatio = ['HR', 'OR', 'RR'].includes(config.effectMeasure);
        var pooled = isRatio ? Math.exp(results.pooled.effect) : results.pooled.effect;
        var lower = isRatio ? Math.exp(results.pooled.lower) : results.pooled.lower;
        var upper = isRatio ? Math.exp(results.pooled.upper) : results.pooled.upper;

        var uncertainty = {
            pointEstimate: pooled,
            confidenceInterval: { lower: lower, upper: upper, level: 95 },
            precision: null,
            probabilityBenefit: null,
            probabilityHarm: null,
            clinicalRelevance: null,
            naturalFrequency: null
        };

        // Precision category
        var ciWidth = upper - lower;
        var relativeWidth = ciWidth / Math.abs(pooled);
        if (relativeWidth < 0.5) uncertainty.precision = "High precision";
        else if (relativeWidth < 1.0) uncertainty.precision = "Moderate precision";
        else if (relativeWidth < 2.0) uncertainty.precision = "Low precision";
        else uncertainty.precision = "Very low precision - interpret with caution";

        // Probability of benefit/harm (assuming normal posterior)
        var se = results.pooled.se;
        var effect = results.pooled.effect;
        if (isRatio) {
            // Probability HR/OR < 1 (benefit for harmful outcome)
            uncertainty.probabilityBenefit = jStat.normal.cdf(0, effect, se);
            uncertainty.probabilityHarm = 1 - uncertainty.probabilityBenefit;
        } else {
            // For MD, depends on direction
            uncertainty.probabilityBenefit = effect > 0 ?
                jStat.normal.cdf(0, -effect, se) :
                jStat.normal.cdf(0, effect, se);
        }

        // Natural frequency framing (per 1000 patients)
        if (config.baselineRisk) {
            var baseRisk = config.baselineRisk;
            var treatmentRisk;
            if (config.effectMeasure === 'RR') {
                treatmentRisk = baseRisk * pooled;
            } else if (config.effectMeasure === 'OR') {
                treatmentRisk = (baseRisk * pooled) / (1 - baseRisk + baseRisk * pooled);
            } else if (config.effectMeasure === 'RD') {
                treatmentRisk = baseRisk + pooled;
            } else if (config.effectMeasure === 'HR') {
                // Approximate for HR
                treatmentRisk = 1 - Math.pow(1 - baseRisk, pooled);
            }

            if (treatmentRisk !== undefined) {
                var eventsControl = Math.round(baseRisk * 1000);
                var eventsTreatment = Math.round(treatmentRisk * 1000);
                var difference = eventsControl - eventsTreatment;

                uncertainty.naturalFrequency = {
                    per1000Control: eventsControl,
                    per1000Treatment: eventsTreatment,
                    differencePerPer1000: difference,
                    nnt: difference !== 0 ? Math.abs(Math.round(1000 / difference)) : null,
                    statement: difference > 0 ?
                        "For every 1000 patients treated, approximately " + difference + " fewer would experience the outcome" :
                        difference < 0 ?
                        "For every 1000 patients treated, approximately " + Math.abs(difference) + " more would experience the outcome" :
                        "No difference expected per 1000 patients treated"
                };
            }
        }

        // Clinical relevance assessment
        var thresholds = {
            HR: { negligible: 0.9, small: 0.8, moderate: 0.67, large: 0.5 },
            OR: { negligible: 0.9, small: 0.7, moderate: 0.5, large: 0.33 },
            RR: { negligible: 0.9, small: 0.8, moderate: 0.67, large: 0.5 },
            SMD: { negligible: 0.1, small: 0.2, moderate: 0.5, large: 0.8 },
            MD: { negligible: null, small: null, moderate: null, large: null }
        };

        var t = thresholds[config.effectMeasure];
        if (t && t.small !== null) {
            var absEffect = isRatio ? Math.min(pooled, 1/pooled) : Math.abs(pooled);
            if (isRatio) {
                if (absEffect > t.negligible) uncertainty.clinicalRelevance = "Negligible effect";
                else if (absEffect > t.small) uncertainty.clinicalRelevance = "Small effect";
                else if (absEffect > t.moderate) uncertainty.clinicalRelevance = "Moderate effect";
                else uncertainty.clinicalRelevance = "Large effect";
            } else {
                if (absEffect < t.negligible) uncertainty.clinicalRelevance = "Negligible effect";
                else if (absEffect < t.small) uncertainty.clinicalRelevance = "Small effect";
                else if (absEffect < t.moderate) uncertainty.clinicalRelevance = "Moderate effect";
                else uncertainty.clinicalRelevance = "Large effect";
            }
        }

        return uncertainty;
    }

    function displayUncertaintyReport() {
        if (!APP.results) {
            alert('Run analysis first');
            return;
        }

        var unc = communicateUncertainty(APP.results, APP.config);
        var isRatio = ['HR', 'OR', 'RR'].includes(APP.config.effectMeasure);

        var html = '<div class="analysis-results">';
        html += '<h3>Uncertainty Communication Report</h3>';
        html += '<p><em>Transparent reporting of statistical uncertainty (Spiegelhalter, Science 2017)</em></p>';

        // Main estimate
        html += '<div class="stats-grid">';
        html += '<div class="stat-box"><div class="stat-value">' + unc.pointEstimate.toFixed(3) + '</div>';
        html += '<div class="stat-label">Point Estimate</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + unc.confidenceInterval.lower.toFixed(3) + ' - ' + unc.confidenceInterval.upper.toFixed(3) + '</div>';
        html += '<div class="stat-label">95% Confidence Interval</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + unc.precision + '</div>';
        html += '<div class="stat-label">Precision</div></div>';
        html += '</div>';

        // Probability statements
        if (unc.probabilityBenefit !== null) {
            html += '<h4>Probability Statements</h4>';
            html += '<div class="alert alert-info">';
            html += '<p>Probability of benefit: <strong>' + (unc.probabilityBenefit * 100).toFixed(1) + '%</strong></p>';
            html += '<p>Probability of harm: <strong>' + (unc.probabilityHarm * 100).toFixed(1) + '%</strong></p>';
            html += '</div>';
        }

        // Natural frequency
        if (unc.naturalFrequency) {
            html += '<h4>Natural Frequency Framing</h4>';
            html += '<div class="alert alert-success">';
            html += '<p><strong>' + unc.naturalFrequency.statement + '</strong></p>';
            html += '<p>Control group: ' + unc.naturalFrequency.per1000Control + ' events per 1000</p>';
            html += '<p>Treatment group: ' + unc.naturalFrequency.per1000Treatment + ' events per 1000</p>';
            if (unc.naturalFrequency.nnt) {
                html += '<p>Number needed to treat: ' + unc.naturalFrequency.nnt + '</p>';
            }
            html += '</div>';
        } else {
            html += '<div class="form-group" style="margin-top:1rem;">';
            html += '<label class="form-label">Enter baseline risk to see natural frequency framing:</label>';
            html += '<input type="number" class="form-input" id="baselineRiskInput" placeholder="e.g., 0.15 for 15%" step="0.01" min="0" max="1">';
            html += '<button class="btn btn-secondary" onclick="updateNaturalFrequency()" style="margin-top:0.5rem;">Calculate</button>';
            html += '</div>';
        }

        // Clinical relevance
        if (unc.clinicalRelevance) {
            html += '<h4>Clinical Relevance</h4>';
            html += '<p>' + unc.clinicalRelevance + '</p>';
        }

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

    function updateNaturalFrequency() {
        var baseRisk = parseFloat(document.getElementById('baselineRiskInput').value);
        if (isNaN(baseRisk) || baseRisk <= 0 || baseRisk >= 1) {
            alert('Enter a valid baseline risk between 0 and 1');
            return;
        }
        APP.config.baselineRisk = baseRisk;
        displayUncertaintyReport();
    }

'''

    if 'communicateUncertainty' not in content:
        content = content.replace('const APP = {', uncertainty_framework + '\n    const APP = {')
        enhancements.append("1. Added Uncertainty Communication Framework (Spiegelhalter 2017)")

    # ==========================================================================
    # ENHANCEMENT 2: CREDIBILITY OF SUBGROUP EFFECTS (ICEMAN)
    # ==========================================================================
    iceman_tool = '''
    // ============================================================================
    // CREDIBILITY OF SUBGROUP EFFECTS - ICEMAN INSTRUMENT
    // Reference: Schandelmaier S, et al. BMJ 2020;368:l6998
    // Instrument for assessing Credibility of Effect Modification Analyses in RCTs
    // ============================================================================
    function assessSubgroupCredibility(subgroupAnalysis) {
        var criteria = [
            {
                name: "A priori hypothesis",
                question: "Was the subgroup analysis pre-specified?",
                options: ["Definitely yes (protocol)", "Probably yes", "Probably no", "Definitely no"],
                scores: [0, 1, 2, 3],
                answer: null
            },
            {
                name: "Direction predicted",
                question: "Was the direction of effect modification predicted a priori?",
                options: ["Yes, correctly predicted", "No prediction made", "Prediction was wrong"],
                scores: [0, 1, 3],
                answer: null
            },
            {
                name: "Limited number",
                question: "Is the subgroup analysis one of a small number of subgroup analyses?",
                options: ["1-2 subgroups", "3-5 subgroups", "6-10 subgroups", ">10 subgroups"],
                scores: [0, 1, 2, 3],
                answer: null
            },
            {
                name: "Biological plausibility",
                question: "Is there a strong biological rationale for effect modification?",
                options: ["Strong rationale", "Moderate rationale", "Weak rationale", "No rationale"],
                scores: [0, 1, 2, 3],
                answer: null
            },
            {
                name: "Within-study comparison",
                question: "Is the subgroup effect based on within-study comparisons?",
                options: ["Yes, within-study", "Mixed", "Between-study only"],
                scores: [0, 1, 3],
                answer: null
            },
            {
                name: "Statistical significance",
                question: "Is the interaction test statistically significant?",
                options: ["p < 0.01", "p < 0.05", "p < 0.10", "p >= 0.10"],
                scores: [0, 1, 2, 3],
                answer: null
            },
            {
                name: "Consistency",
                question: "Is the effect modification consistent across studies/outcomes?",
                options: ["Highly consistent", "Moderately consistent", "Inconsistent", "Not assessed"],
                scores: [0, 1, 2, 3],
                answer: null
            },
            {
                name: "Independent replication",
                question: "Has the effect modification been replicated independently?",
                options: ["Yes, replicated", "Partially replicated", "Not replicated", "Not tested"],
                scores: [0, 1, 2, 3],
                answer: null
            }
        ];

        return {
            criteria: criteria,
            calculateScore: function(answers) {
                var totalScore = 0;
                for (var i = 0; i < criteria.length; i++) {
                    if (answers[i] !== null && answers[i] !== undefined) {
                        totalScore += criteria[i].scores[answers[i]];
                    }
                }
                return totalScore;
            },
            interpretScore: function(score) {
                if (score <= 4) return { level: "High", color: "#10b981", text: "High credibility - effect modification is likely real" };
                if (score <= 8) return { level: "Moderate", color: "#f59e0b", text: "Moderate credibility - effect modification may be real" };
                if (score <= 12) return { level: "Low", color: "#ef4444", text: "Low credibility - effect modification is questionable" };
                return { level: "Very Low", color: "#991b1b", text: "Very low credibility - effect modification is likely spurious" };
            },
            reference: "Schandelmaier S, et al. BMJ 2020;368:l6998"
        };
    }

    function showICEMANAssessment() {
        var iceman = assessSubgroupCredibility();

        var html = '<div class="analysis-results">';
        html += '<h3>ICEMAN: Credibility of Effect Modification</h3>';
        html += '<p><em>Instrument for assessing Credibility of Effect Modification Analyses (Schandelmaier et al., BMJ 2020)</em></p>';

        html += '<form id="icemanForm">';
        iceman.criteria.forEach(function(c, i) {
            html += '<div class="form-group" style="margin-bottom:1.5rem; padding:1rem; background:var(--bg-tertiary); border-radius:8px;">';
            html += '<label class="form-label"><strong>' + (i+1) + '. ' + c.name + '</strong></label>';
            html += '<p style="color:var(--text-secondary); font-size:0.9rem;">' + c.question + '</p>';
            c.options.forEach(function(opt, j) {
                html += '<label class="checkbox-item" style="display:block; margin:0.5rem 0;">';
                html += '<input type="radio" name="iceman_' + i + '" value="' + j + '"> ' + opt;
                html += '</label>';
            });
            html += '</div>';
        });
        html += '</form>';

        html += '<button class="btn btn-primary" onclick="calculateICEMANScore()">Assess Credibility</button>';
        html += '<div id="icemanResult" style="margin-top:1rem;"></div>';
        html += '</div>';

        document.getElementById('results').innerHTML = html;
    }

    function calculateICEMANScore() {
        var iceman = assessSubgroupCredibility();
        var answers = [];

        for (var i = 0; i < iceman.criteria.length; i++) {
            var selected = document.querySelector('input[name="iceman_' + i + '"]:checked');
            answers.push(selected ? parseInt(selected.value) : null);
        }

        if (answers.includes(null)) {
            alert('Please answer all questions');
            return;
        }

        var score = iceman.calculateScore(answers);
        var interpretation = iceman.interpretScore(score);

        var html = '<div class="stat-box" style="text-align:center; margin:1rem 0; background:' + interpretation.color + '20; border:2px solid ' + interpretation.color + ';">';
        html += '<div class="stat-value" style="color:' + interpretation.color + ';">' + score + '/24</div>';
        html += '<div class="stat-label">ICEMAN Score</div>';
        html += '<div style="font-size:1.1rem; margin-top:0.5rem; color:' + interpretation.color + ';"><strong>' + interpretation.level + ' Credibility</strong></div>';
        html += '<div style="font-size:0.9rem; color:var(--text-secondary); margin-top:0.5rem;">' + interpretation.text + '</div>';
        html += '</div>';

        html += '<p style="font-size:0.85rem; color:var(--text-muted);">Reference: ' + iceman.reference + '</p>';

        document.getElementById('icemanResult').innerHTML = html;
    }

'''

    if 'assessSubgroupCredibility' not in content:
        content = content.replace('const APP = {', iceman_tool + '\n    const APP = {')
        enhancements.append("2. Added ICEMAN Subgroup Credibility Assessment (BMJ 2020)")

    # ==========================================================================
    # ENHANCEMENT 3: ECOLOGICAL BIAS WARNINGS
    # ==========================================================================
    ecological_bias = '''
    // ============================================================================
    // ECOLOGICAL BIAS DETECTION AND WARNINGS
    // Reference: Berlin JA, et al. J Clin Epidemiol 2002;55:719-725
    // IPD-MA specific: Warn when aggregate-level associations may mislead
    // ============================================================================
    function checkEcologicalBias(ipdData, aggregateResults) {
        var warnings = [];
        var checks = [];

        // 1. Simpson's paradox check
        if (ipdData && ipdData.length > 0) {
            var overallEffect = calculateOverallEffect(ipdData);
            var studyEffects = calculateStudySpecificEffects(ipdData);

            var oppositeDirection = studyEffects.filter(function(se) {
                return (se.effect > 0) !== (overallEffect > 0);
            });

            if (oppositeDirection.length > studyEffects.length * 0.3) {
                warnings.push({
                    type: "SIMPSON'S PARADOX",
                    severity: "HIGH",
                    message: oppositeDirection.length + " of " + studyEffects.length + " studies show opposite direction to pooled effect",
                    recommendation: "Investigate study-level confounding; consider stratified analysis"
                });
            }

            checks.push({
                name: "Simpson's paradox",
                passed: oppositeDirection.length <= studyEffects.length * 0.3,
                details: oppositeDirection.length + " studies with opposite direction"
            });
        }

        // 2. Aggregation bias in covariates
        if (aggregateResults && aggregateResults.metaRegression) {
            warnings.push({
                type: "AGGREGATION BIAS WARNING",
                severity: "MODERATE",
                message: "Meta-regression with aggregate covariates may suffer from ecological bias",
                recommendation: "Use IPD to model within-study covariate-treatment interactions"
            });

            checks.push({
                name: "Aggregation bias",
                passed: false,
                details: "Meta-regression uses aggregate-level covariates"
            });
        }

        // 3. Treatment-covariate confounding
        warnings.push({
            type: "IPD ADVANTAGE NOTE",
            severity: "INFO",
            message: "IPD allows separation of within-study and between-study effects",
            recommendation: "Model treatment effects at patient level while controlling for study"
        });

        return {
            hasWarnings: warnings.filter(function(w) { return w.severity !== "INFO"; }).length > 0,
            warnings: warnings,
            checks: checks,
            ipdAdvantages: [
                "Avoid ecological bias by modeling at individual level",
                "Separate within-study from between-study covariate effects",
                "Investigate treatment-covariate interactions directly",
                "Handle missing covariate data with individual-level imputation",
                "Standardize covariate definitions across studies"
            ],
            reference: "Berlin JA, et al. J Clin Epidemiol 2002;55:719-725"
        };
    }

    function calculateOverallEffect(data) {
        var treated = data.filter(function(d) { return d.treatment === 1; });
        var control = data.filter(function(d) { return d.treatment === 0; });
        var meanT = treated.reduce(function(s, d) { return s + d.outcome; }, 0) / treated.length;
        var meanC = control.reduce(function(s, d) { return s + d.outcome; }, 0) / control.length;
        return meanT - meanC;
    }

    function calculateStudySpecificEffects(data) {
        var studies = [...new Set(data.map(function(d) { return d.study; }))];
        return studies.map(function(study) {
            var studyData = data.filter(function(d) { return d.study === study; });
            return {
                study: study,
                effect: calculateOverallEffect(studyData),
                n: studyData.length
            };
        });
    }

    function displayEcologicalBiasCheck() {
        var biasCheck = checkEcologicalBias(APP.data, APP.results);

        var html = '<div class="analysis-results">';
        html += '<h3>Ecological Bias Assessment</h3>';
        html += '<p><em>IPD-specific checks for aggregation bias (Berlin et al., J Clin Epidemiol 2002)</em></p>';

        // Warnings
        if (biasCheck.warnings.length > 0) {
            html += '<h4>Warnings and Notes</h4>';
            biasCheck.warnings.forEach(function(w) {
                var alertClass = w.severity === 'HIGH' ? 'alert-danger' :
                                w.severity === 'MODERATE' ? 'alert-warning' : 'alert-info';
                html += '<div class="alert ' + alertClass + '">';
                html += '<strong>' + w.type + ':</strong> ' + w.message;
                html += '<br><em>Recommendation: ' + w.recommendation + '</em>';
                html += '</div>';
            });
        }

        // IPD advantages
        html += '<h4>IPD Advantages Over Aggregate Data</h4>';
        html += '<ul>';
        biasCheck.ipdAdvantages.forEach(function(adv) {
            html += '<li>' + adv + '</li>';
        });
        html += '</ul>';

        // Checks summary
        html += '<h4>Bias Checks</h4>';
        html += '<table class="results-table">';
        html += '<tr><th>Check</th><th>Status</th><th>Details</th></tr>';
        biasCheck.checks.forEach(function(c) {
            html += '<tr>';
            html += '<td>' + c.name + '</td>';
            html += '<td style="color:' + (c.passed ? 'var(--accent-success)' : 'var(--accent-warning)') + ';">' +
                    (c.passed ? 'PASSED' : 'ATTENTION') + '</td>';
            html += '<td>' + c.details + '</td>';
            html += '</tr>';
        });
        html += '</table>';

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

'''

    if 'checkEcologicalBias' not in content:
        content = content.replace('const APP = {', ecological_bias + '\n    const APP = {')
        enhancements.append("3. Added Ecological Bias Detection (Berlin 2002)")

    # ==========================================================================
    # ENHANCEMENT 4: COMPREHENSIVE RISK OF BIAS VISUALIZATION
    # ==========================================================================
    rob_visualization = '''
    // ============================================================================
    // RISK OF BIAS VISUALIZATION (TRAFFIC LIGHT & SUMMARY)
    // Reference: Sterne JAC, et al. BMJ 2019;366:l4898 (RoB 2)
    // ============================================================================
    function createRiskOfBiasAssessment() {
        var domains = [
            { id: 'D1', name: 'Randomization process', description: 'Bias arising from the randomization process' },
            { id: 'D2', name: 'Deviations from interventions', description: 'Bias due to deviations from intended interventions' },
            { id: 'D3', name: 'Missing outcome data', description: 'Bias due to missing outcome data' },
            { id: 'D4', name: 'Measurement of outcome', description: 'Bias in measurement of the outcome' },
            { id: 'D5', name: 'Selection of reported result', description: 'Bias in selection of the reported result' }
        ];

        var judgments = [
            { value: 'low', label: 'Low risk', color: '#10b981', symbol: '+' },
            { value: 'some', label: 'Some concerns', color: '#f59e0b', symbol: '?' },
            { value: 'high', label: 'High risk', color: '#ef4444', symbol: '-' }
        ];

        return { domains: domains, judgments: judgments };
    }

    function showRiskOfBiasAssessment() {
        var rob = createRiskOfBiasAssessment();
        var studies = APP.results ? APP.results.studies : [{ study: 'Study 1' }, { study: 'Study 2' }, { study: 'Study 3' }];

        var html = '<div class="analysis-results">';
        html += '<h3>Risk of Bias Assessment (RoB 2)</h3>';
        html += '<p><em>Cochrane Risk of Bias tool for randomized trials (Sterne et al., BMJ 2019)</em></p>';

        // Create assessment table
        html += '<div style="overflow-x:auto;">';
        html += '<table class="results-table" id="robTable">';

        // Header
        html += '<tr><th>Study</th>';
        rob.domains.forEach(function(d) {
            html += '<th title="' + d.description + '">' + d.id + '</th>';
        });
        html += '<th>Overall</th></tr>';

        // Study rows
        studies.forEach(function(s, i) {
            html += '<tr>';
            html += '<td>' + (s.study || 'Study ' + (i+1)) + '</td>';
            rob.domains.forEach(function(d, j) {
                html += '<td>';
                html += '<select class="form-select" style="width:80px;padding:0.25rem;" id="rob_' + i + '_' + j + '" onchange="updateRoBSummary()">';
                html += '<option value="">-</option>';
                rob.judgments.forEach(function(jud) {
                    html += '<option value="' + jud.value + '">' + jud.symbol + '</option>';
                });
                html += '</select>';
                html += '</td>';
            });
            html += '<td id="robOverall_' + i + '">-</td>';
            html += '</tr>';
        });

        html += '</table>';
        html += '</div>';

        // Legend
        html += '<div style="margin-top:1rem; display:flex; gap:1rem; flex-wrap:wrap;">';
        rob.judgments.forEach(function(j) {
            html += '<span style="display:flex; align-items:center; gap:0.25rem;">';
            html += '<span style="width:20px; height:20px; background:' + j.color + '; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:white; font-weight:bold;">' + j.symbol + '</span>';
            html += j.label;
            html += '</span>';
        });
        html += '</div>';

        // Domain descriptions
        html += '<h4 style="margin-top:1.5rem;">Domain Descriptions</h4>';
        html += '<ul style="font-size:0.9rem;">';
        rob.domains.forEach(function(d) {
            html += '<li><strong>' + d.id + ':</strong> ' + d.description + '</li>';
        });
        html += '</ul>';

        // Summary chart placeholder
        html += '<div id="robSummaryChart" style="margin-top:1.5rem;"></div>';

        // Export button
        html += '<button class="btn btn-secondary" onclick="exportRoBAssessment()" style="margin-top:1rem;">Export Assessment</button>';

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

    function updateRoBSummary() {
        var rob = createRiskOfBiasAssessment();
        var studies = APP.results ? APP.results.studies.length : 3;

        // Calculate overall for each study
        for (var i = 0; i < studies; i++) {
            var domainJudgments = [];
            for (var j = 0; j < rob.domains.length; j++) {
                var select = document.getElementById('rob_' + i + '_' + j);
                if (select) domainJudgments.push(select.value);
            }

            var overall = '-';
            var overallColor = 'inherit';
            if (domainJudgments.every(function(d) { return d !== ''; })) {
                if (domainJudgments.includes('high')) {
                    overall = 'High';
                    overallColor = '#ef4444';
                } else if (domainJudgments.includes('some')) {
                    overall = 'Some concerns';
                    overallColor = '#f59e0b';
                } else {
                    overall = 'Low';
                    overallColor = '#10b981';
                }
            }

            var overallCell = document.getElementById('robOverall_' + i);
            if (overallCell) {
                overallCell.textContent = overall;
                overallCell.style.color = overallColor;
                overallCell.style.fontWeight = 'bold';
            }
        }

        // Update summary chart
        updateRoBSummaryChart();
    }

    function updateRoBSummaryChart() {
        var rob = createRiskOfBiasAssessment();
        var studies = APP.results ? APP.results.studies.length : 3;

        // Count judgments per domain
        var domainCounts = rob.domains.map(function(d, j) {
            var counts = { low: 0, some: 0, high: 0 };
            for (var i = 0; i < studies; i++) {
                var select = document.getElementById('rob_' + i + '_' + j);
                if (select && select.value) counts[select.value]++;
            }
            return { domain: d.id, counts: counts };
        });

        // Create stacked bar chart
        var html = '<h4>Risk of Bias Summary</h4>';
        html += '<div style="max-width:600px;">';

        domainCounts.forEach(function(dc) {
            var total = dc.counts.low + dc.counts.some + dc.counts.high;
            if (total === 0) return;

            var lowPct = (dc.counts.low / total) * 100;
            var somePct = (dc.counts.some / total) * 100;
            var highPct = (dc.counts.high / total) * 100;

            html += '<div style="display:flex; align-items:center; margin:0.5rem 0;">';
            html += '<span style="width:40px; font-weight:bold;">' + dc.domain + '</span>';
            html += '<div style="flex:1; height:24px; display:flex; border-radius:4px; overflow:hidden;">';
            if (lowPct > 0) html += '<div style="width:' + lowPct + '%; background:#10b981;"></div>';
            if (somePct > 0) html += '<div style="width:' + somePct + '%; background:#f59e0b;"></div>';
            if (highPct > 0) html += '<div style="width:' + highPct + '%; background:#ef4444;"></div>';
            html += '</div>';
            html += '</div>';
        });

        html += '</div>';

        document.getElementById('robSummaryChart').innerHTML = html;
    }

    function exportRoBAssessment() {
        var rob = createRiskOfBiasAssessment();
        var studies = APP.results ? APP.results.studies : [];

        var csv = 'Study,' + rob.domains.map(function(d) { return d.name; }).join(',') + ',Overall\\n';

        studies.forEach(function(s, i) {
            var row = [s.study || 'Study ' + (i+1)];
            rob.domains.forEach(function(d, j) {
                var select = document.getElementById('rob_' + i + '_' + j);
                row.push(select ? select.value : '');
            });
            var overall = document.getElementById('robOverall_' + i);
            row.push(overall ? overall.textContent : '');
            csv += row.join(',') + '\\n';
        });

        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'risk_of_bias_assessment.csv';
        a.click();
    }

'''

    if 'createRiskOfBiasAssessment' not in content:
        content = content.replace('const APP = {', rob_visualization + '\n    const APP = {')
        enhancements.append("4. Added Risk of Bias Visualization (RoB 2, Sterne 2019)")

    # ==========================================================================
    # ENHANCEMENT 5: MINIMALLY IMPORTANT DIFFERENCE (MID) INTEGRATION
    # ==========================================================================
    mid_integration = '''
    // ============================================================================
    // MINIMALLY IMPORTANT DIFFERENCE (MID) INTEGRATION
    // Reference: Johnston BC, et al. BMJ 2015;350:h2600
    // Contextualizes statistical significance with clinical importance
    // ============================================================================
    var COMMON_MIDS = {
        // Pain scales
        'VAS_pain': { mid: 10, unit: 'mm', scale: '0-100mm VAS', source: 'Ostelo RW, et al. Spine 2008' },
        'NRS_pain': { mid: 1, unit: 'points', scale: '0-10 NRS', source: 'Farrar JT, et al. Pain 2001' },

        // Quality of life
        'SF36_physical': { mid: 3, unit: 'points', scale: 'SF-36 PCS', source: 'Samsa G, et al. J Clin Epidemiol 1999' },
        'SF36_mental': { mid: 3, unit: 'points', scale: 'SF-36 MCS', source: 'Samsa G, et al. J Clin Epidemiol 1999' },
        'EQ5D': { mid: 0.07, unit: 'utility', scale: 'EQ-5D index', source: 'Walters SJ, Brazier JE. Qual Life Res 2005' },

        // Depression
        'HAMD': { mid: 3, unit: 'points', scale: 'HAM-D', source: 'Leucht S, et al. Br J Psychiatry 2013' },
        'PHQ9': { mid: 5, unit: 'points', scale: 'PHQ-9', source: 'Lowe B, et al. J Affect Disord 2004' },
        'BDI': { mid: 5, unit: 'points', scale: 'BDI', source: 'Button KS, et al. BMJ 2015' },

        // Function
        'WOMAC_function': { mid: 6, unit: 'points', scale: 'WOMAC function', source: 'Tubach F, et al. Ann Rheum Dis 2005' },
        'ODI': { mid: 10, unit: 'points', scale: 'Oswestry Disability Index', source: 'Ostelo RW, et al. Spine 2008' },

        // Respiratory
        'FEV1_percent': { mid: 100, unit: 'mL', scale: 'FEV1', source: 'Cazzola M, et al. Eur Respir J 2008' },
        'SGRQ': { mid: 4, unit: 'points', scale: 'SGRQ total', source: 'Jones PW. Eur Respir J 2002' },

        // Generic effect sizes
        'SMD': { mid: 0.2, unit: 'SD', scale: 'Standardized', source: 'Cohen J. Statistical Power Analysis. 1988' }
    };

    function assessClinicalSignificance(effect, se, effectMeasure, outcomeScale) {
        var result = {
            effect: effect,
            statisticallySignificant: Math.abs(effect / se) > 1.96,
            clinicallySignificant: null,
            mid: null,
            interpretation: null
        };

        // Look up MID
        if (outcomeScale && COMMON_MIDS[outcomeScale]) {
            var midInfo = COMMON_MIDS[outcomeScale];
            result.mid = midInfo;

            // Compare to MID
            var absEffect = Math.abs(effect);
            if (absEffect >= midInfo.mid) {
                result.clinicallySignificant = true;
                result.interpretation = "Effect (" + effect.toFixed(2) + ") exceeds the MID of " + midInfo.mid + " " + midInfo.unit;
            } else {
                result.clinicallySignificant = false;
                result.interpretation = "Effect (" + effect.toFixed(2) + ") is below the MID of " + midInfo.mid + " " + midInfo.unit;
            }

            // Combined interpretation
            if (result.statisticallySignificant && result.clinicallySignificant) {
                result.overallConclusion = "CLINICALLY IMPORTANT: Statistically significant AND clinically meaningful";
            } else if (result.statisticallySignificant && !result.clinicallySignificant) {
                result.overallConclusion = "UNCERTAIN IMPORTANCE: Statistically significant but below MID";
            } else if (!result.statisticallySignificant && result.clinicallySignificant) {
                result.overallConclusion = "IMPRECISE: Effect exceeds MID but not statistically significant";
            } else {
                result.overallConclusion = "NOT IMPORTANT: Neither statistically nor clinically significant";
            }
        }

        return result;
    }

    function showMIDAssessment() {
        var html = '<div class="analysis-results">';
        html += '<h3>Clinical Significance Assessment</h3>';
        html += '<p><em>Minimally Important Difference (MID) integration (Johnston et al., BMJ 2015)</em></p>';

        if (APP.results && APP.results.pooled) {
            var effect = APP.results.pooled.effect;
            var se = APP.results.pooled.se;

            html += '<h4>Select Outcome Scale</h4>';
            html += '<select class="form-select" id="midScaleSelect" onchange="updateMIDAssessment()" style="max-width:400px;">';
            html += '<option value="">-- Select outcome scale --</option>';
            Object.keys(COMMON_MIDS).forEach(function(key) {
                var mid = COMMON_MIDS[key];
                html += '<option value="' + key + '">' + mid.scale + ' (MID: ' + mid.mid + ' ' + mid.unit + ')</option>';
            });
            html += '<option value="custom">Custom MID...</option>';
            html += '</select>';

            html += '<div id="customMIDInput" style="display:none; margin-top:1rem;">';
            html += '<label class="form-label">Enter custom MID value:</label>';
            html += '<input type="number" class="form-input" id="customMIDValue" step="0.1" style="max-width:200px;">';
            html += '</div>';

            html += '<div id="midResults" style="margin-top:1.5rem;"></div>';
        } else {
            html += '<div class="alert alert-warning">Run analysis first to assess clinical significance</div>';
        }

        // Reference MIDs table
        html += '<h4 style="margin-top:2rem;">Common Minimally Important Differences</h4>';
        html += '<table class="results-table">';
        html += '<tr><th>Scale</th><th>MID</th><th>Source</th></tr>';
        Object.keys(COMMON_MIDS).forEach(function(key) {
            var mid = COMMON_MIDS[key];
            html += '<tr><td>' + mid.scale + '</td><td>' + mid.mid + ' ' + mid.unit + '</td><td>' + mid.source + '</td></tr>';
        });
        html += '</table>';

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

    function updateMIDAssessment() {
        var scale = document.getElementById('midScaleSelect').value;
        var customDiv = document.getElementById('customMIDInput');

        if (scale === 'custom') {
            customDiv.style.display = 'block';
            return;
        } else {
            customDiv.style.display = 'none';
        }

        if (!scale) {
            document.getElementById('midResults').innerHTML = '';
            return;
        }

        var assessment = assessClinicalSignificance(
            APP.results.pooled.effect,
            APP.results.pooled.se,
            APP.config.effectMeasure,
            scale
        );

        var html = '<div class="card" style="border-left:4px solid ' +
                   (assessment.clinicallySignificant ? 'var(--accent-success)' : 'var(--accent-warning)') + ';">';
        html += '<h4>Clinical Significance Assessment</h4>';

        html += '<div class="stats-grid">';
        html += '<div class="stat-box"><div class="stat-value">' + assessment.effect.toFixed(3) + '</div>';
        html += '<div class="stat-label">Observed Effect</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + assessment.mid.mid + '</div>';
        html += '<div class="stat-label">MID (' + assessment.mid.unit + ')</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + (Math.abs(assessment.effect) / assessment.mid.mid * 100).toFixed(0) + '%</div>';
        html += '<div class="stat-label">% of MID</div></div>';
        html += '</div>';

        html += '<div class="alert ' +
                (assessment.overallConclusion.includes('CLINICALLY IMPORTANT') ? 'alert-success' :
                 assessment.overallConclusion.includes('UNCERTAIN') ? 'alert-warning' : 'alert-info') + '">';
        html += '<strong>' + assessment.overallConclusion + '</strong><br>';
        html += assessment.interpretation;
        html += '</div>';

        html += '<p style="font-size:0.85rem; color:var(--text-muted);">MID source: ' + assessment.mid.source + '</p>';
        html += '</div>';

        document.getElementById('midResults').innerHTML = html;
    }

'''

    if 'COMMON_MIDS' not in content:
        content = content.replace('const APP = {', mid_integration + '\n    const APP = {')
        enhancements.append("5. Added Minimally Important Difference (MID) Integration (Johnston 2015)")

    # ==========================================================================
    # ENHANCEMENT 6: COMPLETE PRISMA-IPD CHECKLIST
    # ==========================================================================
    prisma_ipd_checklist = '''
    // ============================================================================
    // COMPLETE PRISMA-IPD CHECKLIST
    // Reference: Stewart LA, et al. JAMA 2015;313:1657-1665
    // ============================================================================
    var PRISMA_IPD_ITEMS = [
        { section: "TITLE", num: 1, item: "Identify the report as a systematic review and meta-analysis of individual participant data" },
        { section: "ABSTRACT", num: 2, item: "Provide a structured abstract including: background; objectives; data sources; study eligibility criteria; participants and interventions; study appraisal and synthesis methods; results; limitations; conclusions and implications; systematic review registration number" },
        { section: "INTRODUCTION", num: 3, item: "Describe the rationale for the review in the context of what is already known" },
        { section: "INTRODUCTION", num: 4, item: "Provide an explicit statement of questions being addressed with reference to PICOS" },
        { section: "METHODS", num: 5, item: "Indicate if a review protocol exists and where it can be accessed; if available, provide registration information" },
        { section: "METHODS", num: 6, item: "Specify study characteristics and report characteristics used as criteria for eligibility" },
        { section: "METHODS", num: 7, item: "Describe all information sources and date last searched" },
        { section: "METHODS", num: 8, item: "Present full electronic search strategy for at least one database" },
        { section: "METHODS", num: 9, item: "State the process for identifying and selecting studies and obtaining and confirming IPD" },
        { section: "METHODS", num: 10, item: "Describe methods of data checking and the variables and data requested and/or obtained" },
        { section: "METHODS", num: 11, item: "Describe methods used for risk of bias assessment of individual studies" },
        { section: "METHODS", num: 12, item: "State principal summary measures" },
        { section: "METHODS", num: 13, item: "Describe methods of synthesis including how IPD were checked, how studies were combined, and whether one-stage or two-stage methods were used" },
        { section: "METHODS", num: 14, item: "Describe any methods for exploring variation in effects across studies and participants" },
        { section: "METHODS", num: 15, item: "Specify any assessment of risk of bias that may affect the cumulative evidence" },
        { section: "METHODS", num: 16, item: "Describe methods of additional analyses if done" },
        { section: "RESULTS", num: 17, item: "Describe studies, participants, and data obtained including process and agreement for IPD" },
        { section: "RESULTS", num: 18, item: "Present data on risk of bias of each study and any assessment at outcome level" },
        { section: "RESULTS", num: 19, item: "Present summary data for each intervention group and effect estimates with CIs, preferably with forest plot" },
        { section: "RESULTS", num: 20, item: "Present results of any assessment of variation in effects and exploration of participant-level effect modifiers" },
        { section: "RESULTS", num: 21, item: "Present results of any assessment of risk of bias across studies" },
        { section: "RESULTS", num: 22, item: "Present results of additional analyses" },
        { section: "DISCUSSION", num: 23, item: "Summarize main findings including strength of evidence for each main outcome" },
        { section: "DISCUSSION", num: 24, item: "Discuss limitations at study and outcome level and at review level including data not obtained" },
        { section: "DISCUSSION", num: 25, item: "Provide general interpretation of results and implications for future research" },
        { section: "FUNDING", num: 26, item: "Describe sources of funding and role of funders" }
    ];

    function showPRISMAIPDChecklist() {
        var html = '<div class="analysis-results">';
        html += '<h3>PRISMA-IPD Reporting Checklist</h3>';
        html += '<p><em>Preferred Reporting Items for Systematic Review and Meta-Analyses of IPD (Stewart et al., JAMA 2015)</em></p>';

        var sections = [...new Set(PRISMA_IPD_ITEMS.map(function(i) { return i.section; }))];

        html += '<form id="prismaForm">';
        sections.forEach(function(section) {
            html += '<h4 style="margin-top:1.5rem; color:var(--accent-primary);">' + section + '</h4>';

            var items = PRISMA_IPD_ITEMS.filter(function(i) { return i.section === section; });
            items.forEach(function(item) {
                html += '<div style="display:flex; gap:1rem; padding:0.75rem; margin:0.5rem 0; background:var(--bg-tertiary); border-radius:8px;">';
                html += '<div style="min-width:80px;">';
                html += '<select class="form-select" style="width:75px;padding:0.25rem;" id="prisma_' + item.num + '">';
                html += '<option value="">-</option>';
                html += '<option value="yes">Yes</option>';
                html += '<option value="no">No</option>';
                html += '<option value="na">N/A</option>';
                html += '</select>';
                html += '</div>';
                html += '<div style="flex:1;">';
                html += '<strong>Item ' + item.num + ':</strong> ' + item.item;
                html += '</div>';
                html += '</div>';
            });
        });
        html += '</form>';

        html += '<div style="margin-top:1.5rem; display:flex; gap:1rem;">';
        html += '<button class="btn btn-primary" onclick="calculatePRISMACompletion()">Check Completion</button>';
        html += '<button class="btn btn-secondary" onclick="exportPRISMAChecklist()">Export Checklist</button>';
        html += '</div>';

        html += '<div id="prismaResults" style="margin-top:1rem;"></div>';

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

    function calculatePRISMACompletion() {
        var total = PRISMA_IPD_ITEMS.length;
        var completed = 0;
        var notReported = 0;

        PRISMA_IPD_ITEMS.forEach(function(item) {
            var select = document.getElementById('prisma_' + item.num);
            if (select && select.value === 'yes') completed++;
            if (select && select.value === 'no') notReported++;
        });

        var pct = (completed / total * 100).toFixed(0);

        var html = '<div class="stats-grid">';
        html += '<div class="stat-box"><div class="stat-value">' + completed + '/' + total + '</div>';
        html += '<div class="stat-label">Items Reported</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + pct + '%</div>';
        html += '<div class="stat-label">Completion</div></div>';
        html += '<div class="stat-box"><div class="stat-value" style="color:' + (notReported > 0 ? 'var(--accent-danger)' : 'var(--accent-success)') + ';">' + notReported + '</div>';
        html += '<div class="stat-label">Not Reported</div></div>';
        html += '</div>';

        if (notReported > 0) {
            html += '<h4>Items Not Reported</h4>';
            html += '<ul>';
            PRISMA_IPD_ITEMS.forEach(function(item) {
                var select = document.getElementById('prisma_' + item.num);
                if (select && select.value === 'no') {
                    html += '<li><strong>Item ' + item.num + ':</strong> ' + item.item + '</li>';
                }
            });
            html += '</ul>';
        }

        document.getElementById('prismaResults').innerHTML = html;
    }

    function exportPRISMAChecklist() {
        var csv = 'Section,Item Number,Checklist Item,Reported\\n';
        PRISMA_IPD_ITEMS.forEach(function(item) {
            var select = document.getElementById('prisma_' + item.num);
            var value = select ? select.value : '';
            csv += '"' + item.section + '",' + item.num + ',"' + item.item.replace(/"/g, '""') + '",' + value + '\\n';
        });

        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'prisma_ipd_checklist.csv';
        a.click();
    }

'''

    if 'PRISMA_IPD_ITEMS' not in content:
        content = content.replace('const APP = {', prisma_ipd_checklist + '\n    const APP = {')
        enhancements.append("6. Added Complete PRISMA-IPD Checklist (Stewart 2015)")

    # ==========================================================================
    # ENHANCEMENT 7: ADD EDITORIAL BUTTONS TO UI
    # ==========================================================================
    editorial_buttons = '''
                            <button class="btn btn-secondary" onclick="displayUncertaintyReport()" title="Transparent uncertainty communication">Uncertainty Report</button>
                            <button class="btn btn-secondary" onclick="showICEMANAssessment()" title="Assess subgroup credibility">ICEMAN Tool</button>
                            <button class="btn btn-secondary" onclick="displayEcologicalBiasCheck()" title="Check for ecological bias">Ecological Bias</button>
                            <button class="btn btn-secondary" onclick="showRiskOfBiasAssessment()" title="Risk of Bias assessment">RoB 2 Assessment</button>
                            <button class="btn btn-secondary" onclick="showMIDAssessment()" title="Clinical significance">MID Assessment</button>
                            <button class="btn btn-secondary" onclick="showPRISMAIPDChecklist()" title="PRISMA-IPD checklist">PRISMA-IPD</button>
                            <button class="btn btn-secondary" onclick="showPowerCalculator()" title="Sample size planning">Power Calculator</button>
'''

    if 'displayUncertaintyReport()' not in content:
        # Add after existing editorial buttons
        content = content.replace(
            '<button class="btn btn-secondary" onclick="exportAllFormats()" title="Export all formats at once">Export All</button>',
            '<button class="btn btn-secondary" onclick="exportAllFormats()" title="Export all formats at once">Export All</button>\n' + editorial_buttons
        )
        enhancements.append("7. Added Editorial Assessment Buttons to UI")

    # ==========================================================================
    # ENHANCEMENT 8: STUDY QUALITY WEIGHTING OPTIONS
    # ==========================================================================
    quality_weighting = '''
    // ============================================================================
    // STUDY QUALITY WEIGHTING OPTIONS
    // Reference: Doi SA, et al. Epidemiol Biostat Public Health 2015
    // Allows downweighting of low-quality studies
    // ============================================================================
    function calculateQualityAdjustedWeights(studies, qualityScores, method) {
        method = method || 'variance_quality';
        var k = studies.length;

        var adjustedResults = {
            method: method,
            originalWeights: studies.map(function(s) { return s.weight; }),
            adjustedWeights: [],
            qualityScores: qualityScores
        };

        if (method === 'variance_quality') {
            // Multiply inverse-variance weights by quality score
            var totalWeight = 0;
            adjustedResults.adjustedWeights = studies.map(function(s, i) {
                var qWeight = s.weight * (qualityScores[i] || 1);
                totalWeight += qWeight;
                return qWeight;
            });
            // Normalize
            adjustedResults.adjustedWeights = adjustedResults.adjustedWeights.map(function(w) {
                return w / totalWeight;
            });
        } else if (method === 'quality_only') {
            // Weight purely by quality
            var totalQ = qualityScores.reduce(function(a, b) { return a + b; }, 0);
            adjustedResults.adjustedWeights = qualityScores.map(function(q) { return q / totalQ; });
        } else if (method === 'binary_exclude') {
            // Exclude low quality (< 0.5)
            var includedWeight = 0;
            adjustedResults.adjustedWeights = studies.map(function(s, i) {
                if (qualityScores[i] >= 0.5) {
                    includedWeight += s.weight;
                    return s.weight;
                }
                return 0;
            });
            adjustedResults.adjustedWeights = adjustedResults.adjustedWeights.map(function(w) {
                return includedWeight > 0 ? w / includedWeight : 0;
            });
            adjustedResults.excludedStudies = studies.filter(function(s, i) { return qualityScores[i] < 0.5; });
        }

        // Recalculate pooled effect with adjusted weights
        var effects = studies.map(function(s) { return s.effect; });
        adjustedResults.adjustedPooled = adjustedResults.adjustedWeights.reduce(function(sum, w, i) {
            return sum + w * effects[i];
        }, 0);

        adjustedResults.weightChange = adjustedResults.adjustedWeights.map(function(w, i) {
            return ((w - adjustedResults.originalWeights[i]) / adjustedResults.originalWeights[i] * 100).toFixed(1) + '%';
        });

        return adjustedResults;
    }

    function showQualityWeightingOptions() {
        if (!APP.results) {
            alert('Run analysis first');
            return;
        }

        var html = '<div class="analysis-results">';
        html += '<h3>Quality-Adjusted Weighting</h3>';
        html += '<p><em>Downweight studies based on methodological quality (Doi et al., 2015)</em></p>';

        html += '<h4>Assign Quality Scores (0-1 scale)</h4>';
        html += '<table class="results-table">';
        html += '<tr><th>Study</th><th>Original Weight</th><th>Quality Score</th></tr>';

        APP.results.studies.forEach(function(s, i) {
            html += '<tr>';
            html += '<td>' + s.study + '</td>';
            html += '<td>' + (s.weight * 100).toFixed(1) + '%</td>';
            html += '<td><input type="number" class="form-input" id="quality_' + i + '" value="1" min="0" max="1" step="0.1" style="width:80px;"></td>';
            html += '</tr>';
        });
        html += '</table>';

        html += '<div class="form-group" style="margin-top:1rem;">';
        html += '<label class="form-label">Weighting Method:</label>';
        html += '<select class="form-select" id="qualityMethod" style="max-width:400px;">';
        html += '<option value="variance_quality">Multiply IV weights by quality score</option>';
        html += '<option value="quality_only">Weight by quality score only</option>';
        html += '<option value="binary_exclude">Exclude low quality (score < 0.5)</option>';
        html += '</select>';
        html += '</div>';

        html += '<button class="btn btn-primary" onclick="applyQualityWeighting()" style="margin-top:1rem;">Apply Weighting</button>';
        html += '<div id="qualityResults" style="margin-top:1.5rem;"></div>';

        html += '</div>';
        document.getElementById('results').innerHTML = html;
    }

    function applyQualityWeighting() {
        var qualityScores = APP.results.studies.map(function(s, i) {
            var input = document.getElementById('quality_' + i);
            return input ? parseFloat(input.value) : 1;
        });

        var method = document.getElementById('qualityMethod').value;
        var adjusted = calculateQualityAdjustedWeights(APP.results.studies, qualityScores, method);

        var isRatio = ['HR', 'OR', 'RR'].includes(APP.config.effectMeasure);
        var originalPooled = isRatio ? Math.exp(APP.results.pooled.effect) : APP.results.pooled.effect;
        var adjustedPooled = isRatio ? Math.exp(adjusted.adjustedPooled) : adjusted.adjustedPooled;

        var html = '<h4>Quality-Adjusted Results</h4>';
        html += '<div class="stats-grid">';
        html += '<div class="stat-box"><div class="stat-value">' + originalPooled.toFixed(3) + '</div>';
        html += '<div class="stat-label">Original Pooled Effect</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + adjustedPooled.toFixed(3) + '</div>';
        html += '<div class="stat-label">Quality-Adjusted Effect</div></div>';
        html += '<div class="stat-box"><div class="stat-value">' + ((adjustedPooled - originalPooled) / originalPooled * 100).toFixed(1) + '%</div>';
        html += '<div class="stat-label">Change</div></div>';
        html += '</div>';

        html += '<h4>Weight Comparison</h4>';
        html += '<table class="results-table">';
        html += '<tr><th>Study</th><th>Original</th><th>Quality</th><th>Adjusted</th><th>Change</th></tr>';
        APP.results.studies.forEach(function(s, i) {
            html += '<tr>';
            html += '<td>' + s.study + '</td>';
            html += '<td>' + (adjusted.originalWeights[i] * 100).toFixed(1) + '%</td>';
            html += '<td>' + qualityScores[i].toFixed(2) + '</td>';
            html += '<td>' + (adjusted.adjustedWeights[i] * 100).toFixed(1) + '%</td>';
            html += '<td>' + adjusted.weightChange[i] + '</td>';
            html += '</tr>';
        });
        html += '</table>';

        if (adjusted.excludedStudies && adjusted.excludedStudies.length > 0) {
            html += '<div class="alert alert-warning">';
            html += '<strong>Excluded studies (quality < 0.5):</strong> ' +
                    adjusted.excludedStudies.map(function(s) { return s.study; }).join(', ');
            html += '</div>';
        }

        document.getElementById('qualityResults').innerHTML = html;
    }

'''

    if 'calculateQualityAdjustedWeights' not in content:
        content = content.replace('const APP = {', quality_weighting + '\n    const APP = {')
        enhancements.append("8. Added Study Quality Weighting Options (Doi 2015)")

    # ==========================================================================
    # SAVE FILE
    # ==========================================================================
    with open('ipd-meta-pro.html', 'w', encoding='utf-8') as f:
        f.write(content)

    new_length = len(content)

    print("=" * 70)
    print("RSM EDITORIAL REVIEW V3 - ENHANCEMENTS APPLIED")
    print("=" * 70)
    print(f"\nOriginal: {original_length:,} characters")
    print(f"New: {new_length:,} characters")
    print(f"Added: +{new_length - original_length:,} characters")
    print(f"\n{len(enhancements)} editorial enhancements applied:")
    for e in enhancements:
        print(f"  + {e}")

    print("\n" + "=" * 70)
    print("EDITORIAL IMPROVEMENTS SUMMARY:")
    print("=" * 70)
    print("""
    UNCERTAINTY COMMUNICATION:
    + Natural frequency framing (per 1000 patients)
    + Probability of benefit/harm
    + Precision categorization
    + Clinical relevance assessment

    SUBGROUP ANALYSIS CREDIBILITY:
    + ICEMAN instrument (8 criteria)
    + Credibility scoring
    + Interpretation guidance

    BIAS DETECTION:
    + Ecological bias warnings
    + Simpson's paradox detection
    + IPD advantages documentation

    RISK OF BIAS:
    + RoB 2 interactive assessment
    + Traffic light visualization
    + Summary bar charts
    + CSV export

    CLINICAL SIGNIFICANCE:
    + Minimally Important Differences (MIDs)
    + Common MID reference database
    + Combined statistical/clinical interpretation

    REPORTING STANDARDS:
    + Complete PRISMA-IPD checklist (26 items)
    + Completion tracking
    + Export functionality

    QUALITY WEIGHTING:
    + Multiple weighting methods
    + Sensitivity to study quality
    + Weight comparison visualization

    ALL EXISTING FEATURES PRESERVED - NOTHING REMOVED
    """)
    print("=" * 70)

if __name__ == '__main__':
    apply_editorial_enhancements()
