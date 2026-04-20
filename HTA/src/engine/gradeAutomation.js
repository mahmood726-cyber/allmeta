/**
 * GRADE Evidence Automation Engine for HTA
 * Automated GRADE evidence profile and Summary of Findings (SoF) tables.
 *
 * Implements the GRADE framework:
 * - Risk of bias assessment (from RoB data)
 * - Inconsistency (from I-squared, prediction intervals)
 * - Indirectness (from user-provided notes)
 * - Imprecision (from CI width, optimal information size)
 * - Publication bias (from Egger, trim-fill)
 * - Overall certainty (High minus downgrades)
 *
 * Also supports CINeMA (Confidence in NMA) framework for network meta-analysis.
 *
 * References:
 * - Guyatt et al. (2008) GRADE guidelines series, BMJ
 * - Balshem et al. (2011) GRADE guidelines: rating quality of evidence, J Clin Epidemiol
 * - Salanti et al. (2014) CINeMA framework for NMA confidence
 * - Nikolakopoulou et al. (2020) CINeMA: Confidence in Network Meta-Analysis, J Clin Epidemiol
 */

class GRADEAutomationEngine {
    constructor(options = {}) {
        this.options = {
            clinicalThreshold: null, // null-crossing check for imprecision
            robCutoff: 0.5,          // proportion high-risk for "Serious"
            i2Cutoff: 50,            // I-squared cutoff for inconsistency
            eggerAlpha: 0.1,         // significance threshold for publication bias
            trimFillChangeThreshold: 0.1, // proportional change in estimate
            ...options
        };

        this.CERTAINTY_LEVELS = ['High', 'Moderate', 'Low', 'Very low'];
        this.DOMAIN_RATINGS = ['Not serious', 'Serious', 'Very serious'];
    }

    // ============================================================
    // MAIN GRADE ASSESSMENT
    // ============================================================

    /**
     * Assess evidence for all outcomes using GRADE framework
     * @param {Object} maResults - Meta-analysis results
     * @param {Object} options - Assessment options
     * @returns {Object} GRADE assessment with evidence profile and SoF
     */
    assessEvidence(maResults, options = {}) {
        const results = maResults || {};
        const outcomeSpecs = options.outcomes || [];
        const robData = options.riskOfBias || [];
        const indirectnessNotes = options.indirectnessNotes || '';

        // Build evidence profile for each outcome
        const evidenceProfile = this._buildEvidenceProfile(results, outcomeSpecs, robData, indirectnessNotes);

        // Build Summary of Findings table
        const summaryOfFindings = this._buildSoFTable(evidenceProfile, results);

        // Build explanations for each rating
        const explanations = this._buildExplanations(evidenceProfile);

        return {
            evidenceProfile,
            summaryOfFindings,
            explanations
        };
    }

    // ============================================================
    // EVIDENCE PROFILE BUILDER
    // ============================================================

    _buildEvidenceProfile(results, outcomeSpecs, robData, indirectnessNotes) {
        // If no outcome specs provided, try to infer from results
        const outcomes = outcomeSpecs.length > 0
            ? outcomeSpecs
            : this._inferOutcomes(results);

        if (outcomes.length === 0) {
            // Create a single generic outcome entry
            return [this._assessSingleOutcome('Primary outcome', results, robData, indirectnessNotes, 'critical', 'beneficial')];
        }

        return outcomes.map(o => {
            const name = o.name || o.outcome || 'Unnamed outcome';
            const importance = o.importance || 'important';
            const direction = o.direction || 'beneficial';
            const outcomeResults = this._findOutcomeResults(results, name);
            return this._assessSingleOutcome(name, outcomeResults || results, robData, indirectnessNotes, importance, direction);
        });
    }

    _assessSingleOutcome(name, results, robData, indirectnessNotes, importance, direction) {
        const nStudies = results.nStudies ?? results.k ?? (results.studies ? results.studies.length : null) ?? 0;
        const nParticipants = results.nParticipants ?? results.totalN ?? results.n ?? null;

        // Assess each GRADE domain
        const riskOfBias = this._assessRiskOfBias(robData, results);
        const inconsistency = this._assessInconsistency(results);
        const indirectness = this._assessIndirectness(indirectnessNotes, results);
        const imprecision = this._assessImprecision(results);
        const publicationBias = this._assessPublicationBias(results);

        // Calculate overall certainty
        const overallCertainty = this._calculateOverallCertainty(
            riskOfBias, inconsistency, indirectness, imprecision, publicationBias
        );

        // Format effect estimate
        const effectEstimate = this._formatEffectEstimate(results);
        const absoluteEffect = this._formatAbsoluteEffect(results, direction);

        return {
            outcome: name,
            nStudies,
            nParticipants,
            riskOfBias: riskOfBias.rating,
            inconsistency: inconsistency.rating,
            indirectness: indirectness.rating,
            imprecision: imprecision.rating,
            publicationBias: publicationBias.rating,
            overallCertainty,
            effectEstimate,
            absoluteEffect,
            importance,
            _details: {
                riskOfBias,
                inconsistency,
                indirectness,
                imprecision,
                publicationBias
            }
        };
    }

    // ============================================================
    // DOMAIN ASSESSORS
    // ============================================================

    /**
     * Risk of Bias: "Serious" if >50% of studies have high risk in any domain
     */
    _assessRiskOfBias(robData, results) {
        if (!robData || (Array.isArray(robData) && robData.length === 0)) {
            return { rating: 'Not serious', reason: 'Risk of bias data not provided; default to not serious' };
        }

        const studies = Array.isArray(robData) ? robData : [robData];
        const totalStudies = studies.length;

        if (totalStudies === 0) {
            return { rating: 'Not serious', reason: 'No studies with RoB data' };
        }

        // Count high-risk domains across studies
        let highRiskCount = 0;
        for (const study of studies) {
            const domains = Object.entries(study).filter(([k]) =>
                k !== 'study' && k !== 'id' && k !== 'name' && k !== 'overall'
            );
            const hasHighRisk = domains.some(([, v]) => {
                const val = typeof v === 'string' ? v.toLowerCase() : '';
                return val === 'high' || val === 'high risk' || val === 'critical';
            });
            if (hasHighRisk) highRiskCount++;
        }

        const proportion = highRiskCount / totalStudies;

        if (proportion > this.options.robCutoff) {
            return {
                rating: 'Serious',
                reason: `${highRiskCount}/${totalStudies} studies (${(proportion * 100).toFixed(0)}%) have high risk of bias`,
                proportion
            };
        }

        return {
            rating: 'Not serious',
            reason: `${highRiskCount}/${totalStudies} studies (${(proportion * 100).toFixed(0)}%) have high risk of bias (below ${this.options.robCutoff * 100}% threshold)`,
            proportion
        };
    }

    /**
     * Inconsistency: "Serious" if I-squared > 50% OR prediction interval crosses null
     */
    _assessInconsistency(results) {
        const i2 = results.I2 ?? results.i2 ?? results.heterogeneity?.I2 ?? results.heterogeneity?.i2 ?? null;
        const piLower = results.predictionInterval?.lower ?? results.pi?.lower ?? null;
        const piUpper = results.predictionInterval?.upper ?? results.pi?.upper ?? null;
        const nStudies = results.nStudies ?? results.k ?? 1;

        // Single study: inconsistency not applicable
        if (nStudies <= 1) {
            return {
                rating: 'Not serious',
                reason: 'Single study — inconsistency not applicable',
                i2: null
            };
        }

        const reasons = [];
        let serious = false;

        // Check I-squared
        if (i2 !== null && i2 > this.options.i2Cutoff) {
            serious = true;
            reasons.push(`I² = ${typeof i2 === 'number' ? i2.toFixed(1) : i2}% (> ${this.options.i2Cutoff}%)`);
        } else if (i2 !== null) {
            reasons.push(`I² = ${typeof i2 === 'number' ? i2.toFixed(1) : i2}% (≤ ${this.options.i2Cutoff}%)`);
        }

        // Check prediction interval crossing null
        if (piLower !== null && piUpper !== null) {
            const crossesNull = (piLower < 0 && piUpper > 0) || (piLower < 1 && piUpper > 1);
            if (crossesNull) {
                serious = true;
                reasons.push(`Prediction interval crosses null (${piLower.toFixed(2)} to ${piUpper.toFixed(2)})`);
            }
        }

        return {
            rating: serious ? 'Serious' : 'Not serious',
            reason: reasons.length > 0 ? reasons.join('; ') : 'Heterogeneity data not available',
            i2
        };
    }

    /**
     * Indirectness: "Serious" if notes indicate important indirectness
     */
    _assessIndirectness(notes, results) {
        if (!notes || notes.trim() === '') {
            return {
                rating: 'Not serious',
                reason: 'No indirectness concerns noted'
            };
        }

        const lower = notes.toLowerCase();
        const seriousKeywords = ['serious', 'indirect', 'surrogate', 'different population', 'proxy'];
        const hasConcern = seriousKeywords.some(kw => lower.includes(kw));

        return {
            rating: hasConcern ? 'Serious' : 'Not serious',
            reason: notes
        };
    }

    /**
     * Imprecision: "Serious" if CI crosses clinical decision threshold OR OIS not met
     */
    _assessImprecision(results) {
        const ci = results.ci95 ?? results.ci ?? results.confidenceInterval ?? null;
        const ciLower = ci?.lower ?? ci?.[0] ?? results.ciLower ?? null;
        const ciUpper = ci?.upper ?? ci?.[1] ?? results.ciUpper ?? null;
        const estimate = results.estimate ?? results.effect ?? results.pooledEffect ?? null;
        const nParticipants = results.nParticipants ?? results.totalN ?? results.n ?? null;
        const se = results.se ?? results.standardError ?? null;

        const reasons = [];
        let serious = false;

        // Check if CI crosses clinical decision threshold (default: null line)
        if (ciLower !== null && ciUpper !== null) {
            const threshold = this.options.clinicalThreshold;

            // If no explicit threshold, check if CI crosses null (0 for MD/SMD, 1 for RR/OR/HR)
            const nullLine = threshold ?? this._inferNullLine(results);

            if (nullLine !== null) {
                const crossesNull = (ciLower < nullLine && ciUpper > nullLine);
                if (crossesNull) {
                    serious = true;
                    reasons.push(`95% CI crosses clinical threshold (${ciLower.toFixed(2)} to ${ciUpper.toFixed(2)})`);
                }
            }

            // Check CI width (wide CI regardless of null crossing)
            const ciWidth = Math.abs(ciUpper - ciLower);
            if (estimate !== null && Math.abs(estimate) > 0) {
                const relativeWidth = ciWidth / Math.abs(estimate);
                if (relativeWidth > 2) {
                    serious = true;
                    reasons.push(`CI width relative to estimate is ${relativeWidth.toFixed(1)}`);
                }
            }
        }

        // Check optimal information size
        if (nParticipants !== null) {
            const ois = this.optimalInformationSize(results);
            if (ois !== null && nParticipants < ois) {
                serious = true;
                reasons.push(`Total N (${nParticipants}) below OIS (${ois})`);
            }
        }

        return {
            rating: serious ? 'Serious' : 'Not serious',
            reason: reasons.length > 0 ? reasons.join('; ') : 'Precision appears adequate',
            ciLower,
            ciUpper
        };
    }

    /**
     * Publication Bias: "Serious" if Egger p < 0.1 OR trim-fill changes estimate substantially
     */
    _assessPublicationBias(results) {
        const eggerP = results.eggerP ?? results.egger?.p ?? results.publicationBias?.eggerP ?? null;
        const trimFill = results.trimFill ?? results.publicationBias?.trimFill ?? null;
        const nStudies = results.nStudies ?? results.k ?? 0;

        const reasons = [];
        let serious = false;

        // Egger's test
        if (eggerP !== null) {
            if (eggerP < this.options.eggerAlpha) {
                serious = true;
                reasons.push(`Egger's test p = ${eggerP.toFixed(3)} (< ${this.options.eggerAlpha})`);
            } else {
                reasons.push(`Egger's test p = ${eggerP.toFixed(3)} (non-significant)`);
            }
        }

        // Trim-and-fill
        if (trimFill !== null) {
            const originalEstimate = trimFill.original ?? results.estimate ?? null;
            const adjustedEstimate = trimFill.adjusted ?? null;
            if (originalEstimate !== null && adjustedEstimate !== null && originalEstimate !== 0) {
                const change = Math.abs((adjustedEstimate - originalEstimate) / originalEstimate);
                if (change > this.options.trimFillChangeThreshold) {
                    serious = true;
                    reasons.push(`Trim-and-fill changed estimate by ${(change * 100).toFixed(1)}%`);
                }
            }
        }

        // Too few studies to detect
        if (nStudies < 10 && eggerP === null) {
            reasons.push('Fewer than 10 studies — publication bias tests unreliable');
            return {
                rating: 'Undetected',
                reason: reasons.join('; ')
            };
        }

        if (!serious && reasons.length === 0) {
            return {
                rating: 'Undetected',
                reason: 'No formal tests for publication bias available'
            };
        }

        return {
            rating: serious ? 'Serious' : 'Undetected',
            reason: reasons.join('; ')
        };
    }

    // ============================================================
    // OVERALL CERTAINTY
    // ============================================================

    _calculateOverallCertainty(rob, inconsistency, indirectness, imprecision, pubBias) {
        // Start at "High" (index 0), downgrade 1 level per "Serious", 2 per "Very serious"
        let downgrades = 0;

        const domains = [rob, inconsistency, indirectness, imprecision, pubBias];
        for (const domain of domains) {
            const rating = domain.rating || '';
            if (rating === 'Very serious') {
                downgrades += 2;
            } else if (rating === 'Serious') {
                downgrades += 1;
            }
            // "Not serious" or "Undetected" → no downgrade
        }

        const index = Math.min(downgrades, this.CERTAINTY_LEVELS.length - 1);
        return this.CERTAINTY_LEVELS[index];
    }

    // ============================================================
    // CINeMA (Confidence in NMA)
    // ============================================================

    /**
     * Generate CINeMA assessment for network meta-analysis
     * 6 domains: within-study bias, reporting bias, indirectness, imprecision, heterogeneity, incoherence
     * @param {Object} nmaResults - NMA results
     * @returns {Object} CINeMA assessment
     */
    generateCINEMA(nmaResults) {
        const results = nmaResults || {};

        const withinStudyBias = this._assessCINEMAWithinStudyBias(results);
        const reportingBias = this._assessCINEMAReportingBias(results);
        const indirectness = this._assessCINEMAIndirectness(results);
        const imprecision = this._assessCINEMAImprecision(results);
        const heterogeneity = this._assessCINEMAHeterogeneity(results);
        const incoherence = this._assessCINEMAIncoherence(results);

        return {
            framework: 'CINeMA',
            domains: {
                withinStudyBias,
                reportingBias,
                indirectness,
                imprecision,
                heterogeneity,
                incoherence
            },
            overallConfidence: this._calculateCINEMAOverall(
                withinStudyBias, reportingBias, indirectness, imprecision, heterogeneity, incoherence
            )
        };
    }

    _assessCINEMAWithinStudyBias(results) {
        const rob = results.riskOfBias || results.robTable || {};
        const rating = this._assessRiskOfBias(Array.isArray(rob) ? rob : [], results);
        return {
            domain: 'Within-study bias',
            level: rating.rating === 'Serious' ? 'Some concerns' : 'No concerns',
            reason: rating.reason
        };
    }

    _assessCINEMAReportingBias(results) {
        const pubBias = this._assessPublicationBias(results);
        return {
            domain: 'Reporting bias',
            level: pubBias.rating === 'Serious' ? 'Some concerns' : 'No concerns',
            reason: pubBias.reason
        };
    }

    _assessCINEMAIndirectness(results) {
        return {
            domain: 'Indirectness',
            level: results.indirectness ? 'Some concerns' : 'No concerns',
            reason: results.indirectness || 'No indirectness noted'
        };
    }

    _assessCINEMAImprecision(results) {
        const imp = this._assessImprecision(results);
        return {
            domain: 'Imprecision',
            level: imp.rating === 'Serious' ? 'Some concerns' : 'No concerns',
            reason: imp.reason
        };
    }

    _assessCINEMAHeterogeneity(results) {
        const i2 = results.I2 ?? results.i2 ?? results.heterogeneity?.I2 ?? null;
        const tau2 = results.tau2 ?? results.heterogeneity?.tau2 ?? null;

        let level = 'No concerns';
        let reason = 'Heterogeneity not assessed';

        if (i2 !== null) {
            if (i2 > 75) {
                level = 'Major concerns';
                reason = `I² = ${i2.toFixed(1)}% — substantial heterogeneity`;
            } else if (i2 > 50) {
                level = 'Some concerns';
                reason = `I² = ${i2.toFixed(1)}% — moderate heterogeneity`;
            } else {
                reason = `I² = ${i2.toFixed(1)}% — low heterogeneity`;
            }
        }

        return { domain: 'Heterogeneity', level, reason };
    }

    _assessCINEMAIncoherence(results) {
        const consistency = results.consistency ?? results.incoherence ?? null;

        let level = 'No concerns';
        let reason = 'Incoherence not assessed';

        if (consistency !== null) {
            const pInconsistency = consistency.p ?? consistency.pValue ?? null;
            if (pInconsistency !== null && pInconsistency < 0.05) {
                level = 'Some concerns';
                reason = `Inconsistency test p = ${pInconsistency.toFixed(3)} — evidence of incoherence`;
            } else if (pInconsistency !== null) {
                reason = `Inconsistency test p = ${pInconsistency.toFixed(3)} — no evidence of incoherence`;
            }
        }

        return { domain: 'Incoherence', level, reason };
    }

    _calculateCINEMAOverall(wsb, rb, ind, imp, het, inc) {
        const domains = [wsb, rb, ind, imp, het, inc];
        const majorCount = domains.filter(d => d.level === 'Major concerns').length;
        const someCount = domains.filter(d => d.level === 'Some concerns').length;

        if (majorCount > 0) return 'Very low';
        if (someCount >= 3) return 'Very low';
        if (someCount >= 2) return 'Low';
        if (someCount >= 1) return 'Moderate';
        return 'High';
    }

    // ============================================================
    // OPTIMAL INFORMATION SIZE (OIS)
    // ============================================================

    /**
     * Calculate optimal information size for imprecision assessment
     * @param {Object} maResults - Meta-analysis results
     * @param {number} rr - Relative risk reduction (default: 0.25)
     * @param {number} alpha - Significance level (default: 0.05)
     * @param {number} power - Statistical power (default: 0.80)
     * @returns {number|null} Optimal information size
     */
    optimalInformationSize(maResults, rr, alpha, power) {
        const targetRR = rr ?? 0.25;
        const a = alpha ?? 0.05;
        const b = power ?? 0.80;

        if (targetRR <= 0 || targetRR >= 1) return null;

        // Normal quantiles
        const zAlpha = this._normalQuantile(1 - a / 2);
        const zBeta = this._normalQuantile(b);

        // Event rate from results
        const controlRate = maResults.controlRate ?? maResults.baselineRisk ?? 0.2;

        if (controlRate <= 0 || controlRate >= 1) return null;

        // OIS formula for binary outcomes (per group)
        const pC = controlRate;
        const pI = pC * (1 - targetRR);

        const numerator = Math.pow(zAlpha + zBeta, 2) * (pC * (1 - pC) + pI * (1 - pI));
        const denominator = Math.pow(pC - pI, 2);

        if (denominator <= 0) return null;

        const nPerGroup = Math.ceil(numerator / denominator);
        const totalOIS = nPerGroup * 2;

        return totalOIS;
    }

    // ============================================================
    // SUMMARY OF FINDINGS TABLE
    // ============================================================

    _buildSoFTable(evidenceProfile, results) {
        return {
            title: 'Summary of Findings',
            outcomes: evidenceProfile.map(ep => ({
                outcome: ep.outcome,
                nStudies: ep.nStudies,
                nParticipants: ep.nParticipants,
                certainty: ep.overallCertainty,
                certaintySymbol: this._certaintySymbol(ep.overallCertainty),
                relativeEffect: ep.effectEstimate,
                absoluteEffect: ep.absoluteEffect,
                importance: ep.importance
            }))
        };
    }

    _certaintySymbol(level) {
        switch (level) {
            case 'High': return '(+)(+)(+)(+)';
            case 'Moderate': return '(+)(+)(+)(O)';
            case 'Low': return '(+)(+)(O)(O)';
            case 'Very low': return '(+)(O)(O)(O)';
            default: return '(?)(?)(?)(?)'
        }
    }

    // ============================================================
    // EXPLANATIONS
    // ============================================================

    _buildExplanations(evidenceProfile) {
        const explanations = {};

        for (const ep of evidenceProfile) {
            const details = ep._details || {};
            explanations[ep.outcome] = {
                riskOfBias: details.riskOfBias?.reason || 'Not assessed',
                inconsistency: details.inconsistency?.reason || 'Not assessed',
                indirectness: details.indirectness?.reason || 'Not assessed',
                imprecision: details.imprecision?.reason || 'Not assessed',
                publicationBias: details.publicationBias?.reason || 'Not assessed',
                overallCertainty: `${ep.overallCertainty} — ${this._certaintyExplanation(ep)}`
            };
        }

        return explanations;
    }

    _certaintyExplanation(ep) {
        const domains = ['riskOfBias', 'inconsistency', 'indirectness', 'imprecision', 'publicationBias'];
        const serious = domains.filter(d => ep[d] === 'Serious' || ep[d] === 'Very serious');

        if (serious.length === 0) return 'No downgrades from High';
        return `Downgraded for: ${serious.map(d => d.replace(/([A-Z])/g, ' $1').toLowerCase().trim()).join(', ')}`;
    }

    // ============================================================
    // EXPORT METHODS
    // ============================================================

    /**
     * Export GRADE assessment as HTML or Markdown table
     * @param {Object} assessment - GRADE assessment from assessEvidence()
     * @param {string} format - 'html' or 'markdown'
     * @returns {string} Formatted table
     */
    exportGRADETable(assessment, format = 'html') {
        if (!assessment || !assessment.evidenceProfile) {
            return format === 'html'
                ? '<p>No GRADE assessment data available</p>'
                : 'No GRADE assessment data available\n';
        }

        if (format === 'markdown') {
            return this._exportMarkdownTable(assessment.evidenceProfile);
        }

        return this._exportHTMLTable(assessment.evidenceProfile);
    }

    _exportHTMLTable(profile) {
        let html = '<table class="grade-evidence-profile">\n';
        html += '<thead>\n<tr>';
        html += '<th>Outcome</th>';
        html += '<th>Studies (N)</th>';
        html += '<th>Risk of bias</th>';
        html += '<th>Inconsistency</th>';
        html += '<th>Indirectness</th>';
        html += '<th>Imprecision</th>';
        html += '<th>Publication bias</th>';
        html += '<th>Certainty</th>';
        html += '<th>Effect</th>';
        html += '<th>Importance</th>';
        html += '</tr>\n</thead>\n<tbody>\n';

        for (const ep of profile) {
            html += '<tr>';
            html += `<td>${ep.outcome}</td>`;
            html += `<td>${ep.nStudies}${ep.nParticipants ? ` (${ep.nParticipants})` : ''}</td>`;
            html += `<td>${ep.riskOfBias}</td>`;
            html += `<td>${ep.inconsistency}</td>`;
            html += `<td>${ep.indirectness}</td>`;
            html += `<td>${ep.imprecision}</td>`;
            html += `<td>${ep.publicationBias}</td>`;
            html += `<td>${ep.overallCertainty}</td>`;
            html += `<td>${ep.effectEstimate || '-'}</td>`;
            html += `<td>${ep.importance}</td>`;
            html += '</tr>\n';
        }

        html += '</tbody>\n</table>';
        return html;
    }

    _exportMarkdownTable(profile) {
        let md = '| Outcome | Studies (N) | Risk of bias | Inconsistency | Indirectness | Imprecision | Pub. bias | Certainty | Effect | Importance |\n';
        md += '|---------|-------------|--------------|---------------|--------------|-------------|-----------|-----------|--------|------------|\n';

        for (const ep of profile) {
            md += `| ${ep.outcome}`;
            md += ` | ${ep.nStudies}${ep.nParticipants ? ` (${ep.nParticipants})` : ''}`;
            md += ` | ${ep.riskOfBias}`;
            md += ` | ${ep.inconsistency}`;
            md += ` | ${ep.indirectness}`;
            md += ` | ${ep.imprecision}`;
            md += ` | ${ep.publicationBias}`;
            md += ` | ${ep.overallCertainty}`;
            md += ` | ${ep.effectEstimate || '-'}`;
            md += ` | ${ep.importance} |\n`;
        }

        return md;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    _inferOutcomes(results) {
        const outcomes = results.outcomes || results.effectEstimates || [];
        if (Array.isArray(outcomes) && outcomes.length > 0) {
            return outcomes.map(o => ({
                name: o.name || o.outcome || 'Unnamed',
                importance: o.importance || 'important',
                direction: o.direction || 'beneficial'
            }));
        }
        return [];
    }

    _findOutcomeResults(results, name) {
        // Try to find outcome-specific results within the results object
        if (results.outcomeResults && results.outcomeResults[name]) {
            return results.outcomeResults[name];
        }
        // Otherwise return the main results
        return results;
    }

    _formatEffectEstimate(results) {
        const estimate = results.estimate ?? results.effect ?? results.pooledEffect ?? null;
        const ciLower = results.ci95?.lower ?? results.ci?.[0] ?? results.ciLower ?? null;
        const ciUpper = results.ci95?.upper ?? results.ci?.[1] ?? results.ciUpper ?? null;
        const measure = results.measure || results.effectMeasure || '';

        if (estimate === null) return null;

        const prefix = measure ? `${measure} ` : '';
        if (ciLower !== null && ciUpper !== null) {
            return `${prefix}${estimate.toFixed(2)} (${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)})`;
        }
        return `${prefix}${estimate.toFixed(2)}`;
    }

    _formatAbsoluteEffect(results, direction) {
        const estimate = results.estimate ?? results.effect ?? results.pooledEffect ?? null;
        const baselineRisk = results.controlRate ?? results.baselineRisk ?? null;

        if (estimate === null || baselineRisk === null) return null;

        // For RR/OR type: absolute difference per 1000
        if (Math.abs(estimate) < 10) {
            const riskDiff = (baselineRisk * estimate - baselineRisk) * 1000;
            const verb = riskDiff < 0 ? 'fewer' : 'more';
            return `${Math.abs(Math.round(riskDiff))} ${verb} per 1000`;
        }

        return null;
    }

    _inferNullLine(results) {
        const measure = (results.measure || results.effectMeasure || '').toLowerCase();

        // For ratio measures (RR, OR, HR): null is 1
        if (measure.includes('rr') || measure.includes('or') || measure.includes('hr') ||
            measure.includes('ratio') || measure.includes('hazard')) {
            return 1;
        }

        // For difference measures (MD, SMD, RD): null is 0
        return 0;
    }

    /**
     * Normal quantile (inverse CDF) approximation
     * Rational approximation by Abramowitz & Stegun (1964), formula 26.2.23
     */
    _normalQuantile(p) {
        if (p <= 0 || p >= 1) return null;

        // Rational approximation
        const a1 = -3.969683028665376e1;
        const a2 = 2.209460984245205e2;
        const a3 = -2.759285104469687e2;
        const a4 = 1.383577518672690e2;
        const a5 = -3.066479806614716e1;
        const a6 = 2.506628277459239e0;

        const b1 = -5.447609879822406e1;
        const b2 = 1.615858368580409e2;
        const b3 = -1.556989798598866e2;
        const b4 = 6.680131188771972e1;
        const b5 = -1.328068155288572e1;

        const c1 = -7.784894002430293e-3;
        const c2 = -3.223964580411365e-1;
        const c3 = -2.400758277161838e0;
        const c4 = -2.549732539343734e0;
        const c5 = 4.374664141464968e0;
        const c6 = 2.938163982698783e0;

        const d1 = 7.784695709041462e-3;
        const d2 = 3.224671290700398e-1;
        const d3 = 2.445134137142996e0;
        const d4 = 3.754408661907416e0;

        const pLow = 0.02425;
        const pHigh = 1 - pLow;

        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
                ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
                (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
                ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
        }
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.GRADEAutomationEngine = GRADEAutomationEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GRADEAutomationEngine };
}
