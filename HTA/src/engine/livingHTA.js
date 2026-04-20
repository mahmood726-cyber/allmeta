/**
 * Living HTA Monitoring Engine
 * Detects new evidence and auto-updates meta-analyses for HTA decisions.
 *
 * Integrates with LivingReviewEngine (advancedMeta.js) for sequential
 * monitoring boundaries, and WorldDataIntegration for API patterns.
 *
 * References:
 * - Simmonds et al. (2017) Living systematic reviews. J Clin Epidemiol.
 * - Créquit et al. (2020) Living network meta-analysis. Ann Intern Med.
 * - O'Brien & Fleming (1979) Multiple testing procedure. Biometrics.
 * - Pocock (1977) Group sequential methods. Biometrika.
 * - Haybittle (1971) Repeated assessment of results. J R Stat Soc.
 * - Lan & DeMets (1983) Discrete sequential boundaries. Biometrika.
 */

class LivingHTAEngine {
    constructor(options = {}) {
        this.options = {
            alpha: 0.05,
            maxLooks: 20,
            defaultMethod: 'DL',
            seed: 54321,
            ...options
        };

        this.monitors = new Map();
        this._idCounter = 0;
        // Seeded PRNG (LCG) for deterministic mock data — avoid Math.random()
        this._rngState = this.options.seed;
    }

    /** Seeded uniform random in (0, 1) */
    _seededRandom() {
        this._rngState = (this._rngState * 1103515245 + 12345) & 0x7fffffff;
        return this._rngState / 0x7fffffff || 1e-10;
    }

    // ============================================================
    // UUID GENERATION (deterministic)
    // ============================================================

    _generateId() {
        this._idCounter++;
        const hex = (n) => {
            const h = n.toString(16);
            return h.length < 4 ? ('0000' + h).slice(-4) : h.slice(0, 4);
        };
        const a = hex(this._idCounter);
        const b = hex(this._idCounter * 7 + 3);
        const c = hex(this._idCounter * 13 + 5);
        const d = hex(this._idCounter * 19 + 11);
        return `lhta-${a}-${b}-${c}-${d}`;
    }

    // ============================================================
    // MONITOR CREATION
    // ============================================================

    /**
     * Create a living HTA monitor.
     *
     * @param {Object} config
     * @param {Object} config.query - {condition, intervention}
     * @param {string[]} config.sources - ['clinicaltrials', 'pubmed']
     * @param {Object} config.currentEvidence - {studies, pooledEffect, heterogeneity}
     * @param {Object} config.thresholds - {clinicalSignificance, statisticalAlpha, monitoringMethod}
     * @param {string} config.updateSchedule - 'weekly' | 'monthly' | 'quarterly'
     * @returns {Object} monitor object
     */
    createMonitor(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Config must be a non-null object');
        }
        if (!config.query || !config.query.condition) {
            throw new Error('Config must include query with condition');
        }

        const monitor = {
            monitorId: this._generateId(),
            status: 'active',
            lastChecked: null,
            totalChecks: 0,
            newStudiesFound: 0,
            currentEvidence: this._cloneEvidence(config.currentEvidence || {
                studies: [],
                pooledEffect: null,
                heterogeneity: { I2: 0, tau2: 0 }
            }),
            alerts: [],
            config: {
                query: { ...config.query },
                sources: Array.isArray(config.sources) ? [...config.sources] : ['clinicaltrials'],
                thresholds: {
                    clinicalSignificance: 0.1,
                    statisticalAlpha: this.options.alpha,
                    monitoringMethod: 'obrienFleming',
                    ...(config.thresholds || {})
                },
                updateSchedule: config.updateSchedule || 'monthly'
            },
            history: [],
            createdAt: new Date().toISOString()
        };

        this.monitors.set(monitor.monitorId, monitor);
        return monitor;
    }

    // ============================================================
    // CHECK FOR UPDATES
    // ============================================================

    /**
     * Check for new evidence relevant to the monitor's query.
     * In browser, this would call real APIs. For testing, uses deterministic mock data.
     *
     * @param {Object} monitor
     * @param {Object} [mockData] - Optional mock data for testing
     * @returns {Object} update report
     */
    checkForUpdates(monitor, mockData = null) {
        if (!monitor || !monitor.monitorId) {
            throw new Error('Invalid monitor object');
        }

        const now = new Date().toISOString();
        monitor.lastChecked = now;
        monitor.totalChecks++;

        // Use mock data if provided, otherwise generate deterministic mock
        const newStudies = mockData
            ? mockData.newStudies || []
            : this._generateMockNewStudies(monitor);

        // Calculate relevance score based on query matching
        const relevanceScore = this._calculateRelevance(newStudies, monitor.config.query);

        // Determine recommendation
        let recommendation;
        let reason;

        if (newStudies.length === 0) {
            recommendation = 'no_update';
            reason = 'No new studies found matching query';
        } else if (relevanceScore >= 0.7) {
            recommendation = 'update';
            reason = `${newStudies.length} new study(ies) with high relevance (${(relevanceScore * 100).toFixed(0)}%) found matching query`;
        } else {
            recommendation = 'alert';
            reason = `${newStudies.length} new study(ies) found but relevance is moderate (${(relevanceScore * 100).toFixed(0)}%); manual review recommended`;
        }

        monitor.newStudiesFound += newStudies.length;

        const report = {
            newStudies,
            relevanceScore,
            recommendation,
            reason,
            checkedAt: now,
            sources: monitor.config.sources
        };

        // Record in history
        monitor.history.push({
            type: 'check',
            timestamp: now,
            studiesFound: newStudies.length,
            relevanceScore,
            recommendation
        });

        return report;
    }

    // ============================================================
    // APPLY UPDATE
    // ============================================================

    /**
     * Incorporate new studies into the existing meta-analysis using sequential methods.
     *
     * @param {Object} monitor
     * @param {Array} newStudies - [{id, yi, vi, ...}]
     * @returns {Object} updated analysis result
     */
    applyUpdate(monitor, newStudies) {
        if (!monitor || !monitor.monitorId) {
            throw new Error('Invalid monitor object');
        }
        if (!Array.isArray(newStudies)) {
            throw new Error('newStudies must be an array');
        }

        const previousStudies = monitor.currentEvidence.studies || [];
        const previousPooled = monitor.currentEvidence.pooledEffect;

        // Add new studies to the evidence base
        const allStudies = [
            ...previousStudies,
            ...newStudies.map(s => ({
                id: s.id || `new-${previousStudies.length + newStudies.indexOf(s)}`,
                yi: s.yi ?? s.effect ?? 0,
                vi: s.vi ?? s.variance ?? 0.05,
                study: s.title || s.id || 'New Study',
                source: s.source || 'unknown',
                addedAt: new Date().toISOString()
            }))
        ];

        // Re-run pooled analysis (DerSimonian-Laird)
        const pooledResult = this._runPooledAnalysis(allStudies);

        // Check monitoring boundary
        const boundaryCheck = this._checkBoundary(
            pooledResult,
            allStudies,
            monitor.config.thresholds
        );

        // Determine if conclusion changed
        const previousConclusion = this._deriveConclusion(
            previousPooled,
            monitor.config.thresholds.statisticalAlpha
        );
        const newConclusion = this._deriveConclusion(
            pooledResult.mu,
            monitor.config.thresholds.statisticalAlpha,
            pooledResult.se
        );
        const conclusionChanged = previousConclusion !== newConclusion;

        const changeMagnitude = previousPooled !== null && previousPooled !== undefined
            ? Math.abs(pooledResult.mu - previousPooled)
            : Math.abs(pooledResult.mu);

        // Generate alert if warranted
        let alert = null;
        if (conclusionChanged) {
            alert = {
                severity: 'high',
                message: `Conclusion reversed: was '${previousConclusion}', now '${newConclusion}'`,
                timestamp: new Date().toISOString()
            };
            monitor.alerts.push(alert);
        } else if (changeMagnitude >= monitor.config.thresholds.clinicalSignificance) {
            alert = {
                severity: 'medium',
                message: `Effect changed by ${changeMagnitude.toFixed(3)}, exceeding clinical significance threshold`,
                timestamp: new Date().toISOString()
            };
            monitor.alerts.push(alert);
        } else if (boundaryCheck.crossed) {
            alert = {
                severity: 'low',
                message: 'Monitoring boundary crossed but conclusion unchanged',
                timestamp: new Date().toISOString()
            };
            monitor.alerts.push(alert);
        }

        // Update monitor's evidence
        const updatedEvidence = {
            studies: allStudies,
            pooledEffect: pooledResult.mu,
            heterogeneity: {
                I2: pooledResult.I2,
                tau2: pooledResult.tau2
            }
        };
        monitor.currentEvidence = updatedEvidence;

        const result = {
            updatedEvidence,
            boundaryCheck,
            conclusionChanged,
            previousConclusion,
            newConclusion,
            changeMagnitude,
            alert,
            pooledSE: pooledResult.se,
            nStudiesTotal: allStudies.length,
            nStudiesNew: newStudies.length
        };

        // Record in history
        monitor.history.push({
            type: 'update',
            timestamp: new Date().toISOString(),
            nStudiesAdded: newStudies.length,
            pooledEffect: pooledResult.mu,
            heterogeneity: updatedEvidence.heterogeneity,
            boundaryCheck: { crossed: boundaryCheck.crossed, method: boundaryCheck.method },
            conclusionChanged
        });

        return result;
    }

    // ============================================================
    // GENERATE UPDATE REPORT
    // ============================================================

    /**
     * Generate a Markdown-formatted report summarizing an update.
     *
     * @param {Object} monitor
     * @param {Object} updateResult - from applyUpdate()
     * @returns {string} Markdown report
     */
    generateUpdateReport(monitor, updateResult) {
        if (!monitor || !updateResult) {
            throw new Error('Monitor and updateResult are required');
        }

        const lines = [];
        lines.push(`# Living HTA Update Report`);
        lines.push('');
        lines.push(`**Monitor:** ${monitor.monitorId}`);
        lines.push(`**Condition:** ${monitor.config.query.condition}`);
        lines.push(`**Intervention:** ${monitor.config.query.intervention || 'N/A'}`);
        lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
        lines.push('');

        // New studies
        lines.push(`## New Studies`);
        lines.push(`- **${updateResult.nStudiesNew}** new studies added`);
        lines.push(`- **${updateResult.nStudiesTotal}** total studies in evidence base`);
        lines.push('');

        // Updated pooled estimate
        lines.push(`## Updated Pooled Estimate`);
        const pe = updateResult.updatedEvidence.pooledEffect;
        const se = updateResult.pooledSE;
        lines.push(`- Pooled effect: **${pe.toFixed(4)}** (SE: ${se.toFixed(4)})`);
        lines.push(`- 95% CI: [${(pe - 1.96 * se).toFixed(4)}, ${(pe + 1.96 * se).toFixed(4)}]`);
        lines.push(`- I\u00B2: ${updateResult.updatedEvidence.heterogeneity.I2.toFixed(1)}%`);
        lines.push(`- \u03C4\u00B2: ${updateResult.updatedEvidence.heterogeneity.tau2.toFixed(4)}`);
        lines.push('');

        // Monitoring boundary
        lines.push(`## Monitoring Boundary`);
        const bc = updateResult.boundaryCheck;
        lines.push(`- Method: ${bc.method}`);
        lines.push(`- Test statistic: ${bc.statistic.toFixed(4)}`);
        lines.push(`- Threshold: ${bc.threshold.toFixed(4)}`);
        lines.push(`- Boundary crossed: **${bc.crossed ? 'YES' : 'No'}**`);
        lines.push('');

        // Conclusion
        lines.push(`## Conclusion`);
        lines.push(`- Previous: ${updateResult.previousConclusion}`);
        lines.push(`- Current: ${updateResult.newConclusion}`);
        lines.push(`- Changed: **${updateResult.conclusionChanged ? 'YES' : 'No'}**`);
        lines.push(`- Effect change magnitude: ${updateResult.changeMagnitude.toFixed(4)}`);
        lines.push('');

        // Recommendation
        lines.push(`## Recommendation`);
        if (updateResult.conclusionChanged) {
            lines.push(`- **URGENT ALERT**: Conclusion has reversed. Guideline update recommended.`);
        } else if (updateResult.boundaryCheck.crossed) {
            lines.push(`- **UPDATE**: Monitoring boundary crossed. Consider updating guidelines.`);
        } else {
            lines.push(`- **CONTINUE MONITORING**: No significant change detected.`);
        }
        lines.push('');

        // Alert
        if (updateResult.alert) {
            lines.push(`## Alert`);
            lines.push(`- Severity: **${updateResult.alert.severity}**`);
            lines.push(`- ${updateResult.alert.message}`);
        }

        return lines.join('\n');
    }

    // ============================================================
    // ASSESS IMPACT ON DECISION
    // ============================================================

    /**
     * Assess how an update affects an HTA decision context.
     *
     * @param {Object} updateResult - from applyUpdate()
     * @param {Object} decisionContext - {currentICER, wtp, currentDecision}
     * @returns {Object} impact assessment
     */
    assessImpactOnDecision(updateResult, decisionContext) {
        if (!updateResult || !decisionContext) {
            throw new Error('updateResult and decisionContext are required');
        }

        const { currentICER, wtp, currentDecision } = decisionContext;

        // Estimate new ICER based on the change magnitude and direction
        // If effect increases, ICER generally decreases (better value)
        // Simple linear model: ICER_new = ICER_old * (old_effect / new_effect)
        const oldEffect = updateResult.updatedEvidence.pooledEffect - updateResult.changeMagnitude;
        const newEffect = updateResult.updatedEvidence.pooledEffect;

        let newICER;
        if (Math.abs(oldEffect) > 1e-10 && Math.abs(newEffect) > 1e-10) {
            newICER = currentICER * (oldEffect / newEffect);
        } else if (Math.abs(newEffect) > 1e-10) {
            // Old effect was near zero, new effect is non-zero
            newICER = currentICER * 0.5;
        } else {
            // New effect near zero — ICER deteriorates
            newICER = currentICER * 2;
        }

        const icerChange = newICER - currentICER;

        // Check if decision reversed
        const oldDecision = currentDecision || (currentICER <= wtp ? 'adopt' : 'reject');
        const newDecisionVal = newICER <= wtp ? 'adopt' : 'reject';
        const decisionReversed = oldDecision !== newDecisionVal;

        // Urgency classification
        let urgency;
        if (decisionReversed) {
            urgency = 'high';
        } else if (Math.abs(icerChange) > wtp * 0.2) {
            urgency = 'medium';
        } else {
            urgency = 'low';
        }

        return {
            newICER,
            icerChange,
            previousICER: currentICER,
            wtp,
            decisionReversed,
            previousDecision: oldDecision,
            newDecision: newDecisionVal,
            urgency,
            interpretation: decisionReversed
                ? `Decision reversed from '${oldDecision}' to '${newDecisionVal}'. New ICER: ${newICER.toFixed(0)} vs WTP: ${wtp}`
                : `Decision unchanged ('${oldDecision}'). ICER change: ${icerChange.toFixed(0)}`
        };
    }

    // ============================================================
    // MONITORING HISTORY & TIMELINE
    // ============================================================

    /**
     * Get the full monitoring history for a monitor.
     *
     * @param {Object} monitor
     * @returns {Object} timeline of all checks and updates
     */
    getMonitoringHistory(monitor) {
        if (!monitor || !monitor.monitorId) {
            throw new Error('Invalid monitor object');
        }

        return {
            monitorId: monitor.monitorId,
            status: monitor.status,
            totalChecks: monitor.totalChecks,
            totalUpdates: monitor.history.filter(h => h.type === 'update').length,
            newStudiesFound: monitor.newStudiesFound,
            alerts: [...monitor.alerts],
            entries: [...monitor.history],
            currentEvidence: this._cloneEvidence(monitor.currentEvidence),
            createdAt: monitor.createdAt,
            lastChecked: monitor.lastChecked
        };
    }

    /**
     * Export timeline data suitable for plotting.
     *
     * @param {Object} history - from getMonitoringHistory()
     * @param {string} format - 'chartjs' | 'raw'
     * @returns {Object} timeline data
     */
    exportTimeline(history, format = 'raw') {
        if (!history || !history.entries) {
            throw new Error('Invalid history object');
        }

        const entries = history.entries;

        // Sort chronologically
        const sorted = [...entries].sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        const timelineData = sorted.map((entry, idx) => ({
            index: idx,
            timestamp: entry.timestamp,
            type: entry.type,
            pooledEffect: entry.pooledEffect ?? null,
            studiesFound: entry.studiesFound ?? entry.nStudiesAdded ?? 0,
            boundaryCheck: entry.boundaryCheck ?? null,
            conclusionChanged: entry.conclusionChanged ?? false
        }));

        if (format === 'chartjs') {
            return {
                labels: timelineData.map(d => d.timestamp),
                datasets: [
                    {
                        label: 'Pooled Effect',
                        data: timelineData.filter(d => d.pooledEffect !== null).map(d => d.pooledEffect)
                    },
                    {
                        label: 'Studies Added',
                        data: timelineData.map(d => d.studiesFound)
                    }
                ],
                annotations: timelineData
                    .filter(d => d.conclusionChanged)
                    .map(d => ({ timestamp: d.timestamp, label: 'Conclusion Changed' }))
            };
        }

        // Raw format
        return {
            monitorId: history.monitorId,
            timeline: timelineData,
            summary: {
                totalEntries: timelineData.length,
                checks: timelineData.filter(d => d.type === 'check').length,
                updates: timelineData.filter(d => d.type === 'update').length,
                conclusionChanges: timelineData.filter(d => d.conclusionChanged).length
            }
        };
    }

    // ============================================================
    // PRIVATE: Pooled Analysis (DerSimonian-Laird)
    // ============================================================

    _runPooledAnalysis(studies) {
        if (!studies || studies.length === 0) {
            return { mu: 0, se: 1, tau2: 0, I2: 0 };
        }

        if (studies.length === 1) {
            const s = studies[0];
            return {
                mu: s.yi,
                se: Math.sqrt(s.vi),
                tau2: 0,
                I2: 0
            };
        }

        const yi = studies.map(s => s.yi);
        const vi = studies.map(s => s.vi);

        // Fixed-effect weights
        const wi = vi.map(v => 1 / Math.max(v, 1e-10));
        const sumW = wi.reduce((a, b) => a + b, 0);
        const muFE = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

        // Q statistic
        const Q = wi.reduce((s, w, i) => s + w * Math.pow(yi[i] - muFE, 2), 0);
        const df = studies.length - 1;

        // DL tau2
        const c = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;
        const tau2 = Math.max(0, (Q - df) / c);

        // Random-effects weights
        const wiRE = vi.map(v => 1 / (v + tau2));
        const sumWRE = wiRE.reduce((a, b) => a + b, 0);
        const mu = wiRE.reduce((s, w, i) => s + w * yi[i], 0) / sumWRE;
        const se = Math.sqrt(1 / sumWRE);

        // I2
        const I2 = df > 0 ? Math.max(0, ((Q - df) / Q) * 100) : 0;

        return { mu, se, tau2, I2, Q, df };
    }

    // ============================================================
    // PRIVATE: Monitoring Boundary Check
    // ============================================================

    _checkBoundary(pooledResult, studies, thresholds) {
        const method = thresholds.monitoringMethod || 'obrienFleming';
        const alpha = thresholds.statisticalAlpha || this.options.alpha;

        // Z-statistic
        const zStat = pooledResult.se > 0 ? pooledResult.mu / pooledResult.se : 0;

        // Information fraction (simple heuristic: studies.length / expected total)
        const infoFraction = Math.min(studies.length / (this.options.maxLooks * 2), 1);

        // Compute boundary threshold
        let threshold;
        if (method === 'obrienFleming') {
            // O'Brien-Fleming: very conservative early, lenient late
            // z_k = z_{alpha/2} / sqrt(t_k)
            const zAlpha = this._normalQuantile(1 - alpha / 2);
            threshold = zAlpha / Math.sqrt(Math.max(infoFraction, 0.01));
        } else if (method === 'pocock') {
            // Pocock: constant boundary
            // Uses repeated-significance-test with uniform spending
            const zAlpha = this._normalQuantile(1 - alpha / 2);
            // Approximate Pocock boundary
            threshold = zAlpha + 0.2 * Math.log(1 / Math.max(infoFraction, 0.01));
            threshold = Math.min(threshold, zAlpha + 0.5); // Cap it
        } else if (method === 'haybittle') {
            // Haybittle-Peto: fixed threshold of 3 for interim, z_alpha for final
            threshold = infoFraction < 1 ? 3.0 : this._normalQuantile(1 - alpha / 2);
        } else {
            // Linear spending fallback
            const zAlpha = this._normalQuantile(1 - alpha / 2);
            threshold = zAlpha;
        }

        const crossed = Math.abs(zStat) > threshold;

        return {
            crossed,
            threshold,
            statistic: zStat,
            method,
            infoFraction,
            alpha
        };
    }

    // ============================================================
    // PRIVATE: Conclusion Derivation
    // ============================================================

    _deriveConclusion(effect, alpha, se) {
        if (effect === null || effect === undefined) {
            return 'insufficient_evidence';
        }

        // If SE is available, use significance test
        if (se !== undefined && se !== null && se > 0) {
            const z = this._normalQuantile(1 - (alpha || 0.05) / 2);
            const lower = effect - z * se;
            const upper = effect + z * se;

            if (lower > 0) return 'effective';
            if (upper < 0) return 'harmful';
            return 'inconclusive';
        }

        // Without SE, use sign of effect
        if (effect > 0) return 'effective';
        if (effect < 0) return 'harmful';
        return 'inconclusive';
    }

    // ============================================================
    // PRIVATE: Relevance Scoring
    // ============================================================

    _calculateRelevance(newStudies, query) {
        if (!newStudies || newStudies.length === 0) return 0;

        const conditionLower = (query.condition || '').toLowerCase();
        const interventionLower = (query.intervention || '').toLowerCase();

        let totalScore = 0;
        for (const study of newStudies) {
            let score = 0;
            const titleLower = (study.title || '').toLowerCase();
            const statusLower = (study.status || '').toLowerCase();

            // Condition match
            if (conditionLower && titleLower.includes(conditionLower)) {
                score += 0.5;
            }
            // Intervention match
            if (interventionLower && titleLower.includes(interventionLower)) {
                score += 0.3;
            }
            // Completed studies are more relevant
            if (statusLower === 'completed' || statusLower === 'published') {
                score += 0.2;
            }
            // Has results
            if (study.results || study.yi !== undefined) {
                score += 0.1;
            }

            totalScore += Math.min(score, 1.0);
        }

        return Math.min(totalScore / newStudies.length, 1.0);
    }

    // ============================================================
    // PRIVATE: Mock Study Generation (deterministic)
    // ============================================================

    _generateMockNewStudies(monitor) {
        // Deterministic: use check count as basis
        const checkNum = monitor.totalChecks;

        // Every 3rd check finds new studies
        if (checkNum % 3 !== 0) {
            return [];
        }

        const condition = monitor.config.query.condition || 'condition';
        const intervention = monitor.config.query.intervention || 'intervention';
        const nNew = 1 + (checkNum % 5);

        const studies = [];
        for (let i = 0; i < nNew; i++) {
            const r = this._seededRandom();
            studies.push({
                id: `NCT${(10000000 + checkNum * 100 + i).toString()}`,
                title: `${intervention} for ${condition} - Study ${checkNum}-${i}`,
                status: r > 0.3 ? 'Completed' : 'Active',
                results: r > 0.5 ? { hasResults: true } : null,
                source: monitor.config.sources[i % monitor.config.sources.length],
                yi: (r - 0.5) * 0.8,
                vi: 0.02 + r * 0.05
            });
        }

        return studies;
    }

    // ============================================================
    // PRIVATE: Helpers
    // ============================================================

    _cloneEvidence(evidence) {
        return {
            studies: (evidence.studies || []).map(s => ({ ...s })),
            pooledEffect: evidence.pooledEffect ?? null,
            heterogeneity: evidence.heterogeneity
                ? { ...evidence.heterogeneity }
                : { I2: 0, tau2: 0 }
        };
    }

    _normalQuantile(p) {
        // Rational approximation for the normal quantile (Abramowitz & Stegun 26.2.23)
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        const sign = p < 0.5 ? -1 : 1;
        const pp = p < 0.5 ? p : 1 - p;
        const t = Math.sqrt(-2 * Math.log(pp));

        const c0 = 2.515517;
        const c1 = 0.802853;
        const c2 = 0.010328;
        const d1 = 1.432788;
        const d2 = 0.189269;
        const d3 = 0.001308;

        return sign * (t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
    }

    _normalCDF(x) {
        // Horner approximation (Abramowitz & Stegun 7.1.26)
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        const t = 1.0 / (1.0 + p * Math.abs(x));
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);

        return 0.5 * (1.0 + sign * y);
    }
}

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.LivingHTAEngine = LivingHTAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LivingHTAEngine };
}
