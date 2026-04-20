/**
 * Audit Logger for HTA Models
 * Provides comprehensive logging of model execution for regulatory review
 *
 * Reference: NICE Methods Guide - Transparency and Reproducibility
 *
 * Features:
 * - Structured audit trail
 * - Parameter change tracking
 * - Validation event logging
 * - Export to JSON for review
 * - Probability clamping warnings
 */

class AuditLogger {
    constructor(modelId = 'unknown') {
        this.modelId = modelId;
        this.sessionId = this.generateSessionId();
        this.startTime = new Date().toISOString();
        this.entries = [];
        this.warnings = [];
        this.errors = [];
        this.parameterChanges = [];
        this.clampingEvents = [];
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Log an event
     * @param {string} level - 'info', 'warning', 'error', 'debug'
     * @param {string} category - Event category
     * @param {string} message - Event message
     * @param {Object} details - Additional details
     */
    log(level, category, message, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level,
            category: category,
            message: message,
            details: details
        };

        this.entries.push(entry);

        if (level === 'warning') {
            this.warnings.push(entry);
        } else if (level === 'error') {
            this.errors.push(entry);
        }

        // Console output for development
        if (typeof console !== 'undefined') {
            const prefix = `[HTA ${level.toUpperCase()}] [${category}]`;
            if (level === 'error') {
                console.error(prefix, message, details);
            } else if (level === 'warning') {
                console.warn(prefix, message, details);
            } else {
                console.log(prefix, message, details);
            }
        }

        return entry;
    }

    /**
     * Log info event
     */
    info(category, message, details = {}) {
        return this.log('info', category, message, details);
    }

    /**
     * Log warning event
     */
    warn(category, message, details = {}) {
        return this.log('warning', category, message, details);
    }

    /**
     * Log error event
     */
    error(category, message, details = {}) {
        return this.log('error', category, message, details);
    }

    /**
     * Log debug event (only in development)
     */
    debug(category, message, details = {}) {
        return this.log('debug', category, message, details);
    }

    /**
     * Log model initialization
     */
    logModelInit(project) {
        this.info('model', 'Model initialized', {
            modelId: project.metadata?.id,
            modelName: project.metadata?.name,
            modelType: project.model?.type,
            timeHorizon: project.settings?.time_horizon,
            cycleLength: project.settings?.cycle_length,
            startingAge: project.settings?.starting_age,
            discountRateCosts: project.settings?.discount_rate_costs,
            discountRateQalys: project.settings?.discount_rate_qalys,
            halfCycleCorrection: project.settings?.half_cycle_correction,
            stateCount: Object.keys(project.states || {}).length,
            parameterCount: Object.keys(project.parameters || {}).length,
            transitionCount: Object.keys(project.transitions || {}).length,
            strategyCount: Object.keys(project.strategies || {}).length
        });
    }

    /**
     * Log parameter override
     */
    logParameterOverride(paramId, originalValue, newValue, reason = '') {
        const change = {
            timestamp: new Date().toISOString(),
            parameter: paramId,
            originalValue: originalValue,
            newValue: newValue,
            reason: reason
        };
        this.parameterChanges.push(change);
        this.info('parameter', `Parameter override: ${paramId}`, change);
    }

    /**
     * Log probability clamping (important for regulatory review)
     */
    logProbabilityClamping(location, originalValue, clampedValue) {
        const event = {
            timestamp: new Date().toISOString(),
            location: location,
            originalValue: originalValue,
            clampedValue: clampedValue,
            reason: originalValue < 0 ? 'Negative probability clamped to 0' :
                   originalValue > 1 ? 'Probability > 1 clamped to 1' :
                   'Value clamped to valid range'
        };
        this.clampingEvents.push(event);
        this.warn('clamping', `Probability clamped at ${location}`, event);
    }

    /**
     * Log validation results
     */
    logValidation(results) {
        this.info('validation', 'Validation completed', {
            valid: results.valid,
            errorCount: results.errors,
            warningCount: results.warnings,
            infoCount: results.infos
        });

        // Log individual issues
        for (const issue of results.issues || []) {
            if (issue.severity === 'ERROR') {
                this.error('validation', issue.message, {
                    code: issue.code,
                    path: issue.path,
                    recommendation: issue.recommendation
                });
            } else if (issue.severity === 'WARNING') {
                this.warn('validation', issue.message, {
                    code: issue.code,
                    path: issue.path,
                    recommendation: issue.recommendation
                });
            }
        }
    }

    /**
     * Log simulation start
     */
    logSimulationStart(strategyId, cycles, overrides = {}) {
        this.info('simulation', 'Simulation started', {
            strategy: strategyId,
            cycles: cycles,
            overrideCount: Object.keys(overrides).length,
            overrides: Object.keys(overrides)
        });
    }

    /**
     * Log simulation end
     */
    logSimulationEnd(strategyId, results) {
        this.info('simulation', 'Simulation completed', {
            strategy: strategyId,
            totalCosts: results.total_costs,
            totalQalys: results.total_qalys,
            lifeYears: results.life_years,
            computationTimeMs: results.computation_time_ms
        });
    }

    /**
     * Log PSA start
     */
    logPSAStart(iterations, seed) {
        this.info('psa', 'PSA started', {
            iterations: iterations,
            seed: seed
        });
    }

    /**
     * Log PSA end
     */
    logPSAEnd(results) {
        this.info('psa', 'PSA completed', {
            iterations: results.iterations,
            meanIncrementalCosts: results.summary?.mean_incremental_costs,
            meanIncrementalQalys: results.summary?.mean_incremental_qalys,
            probCE30k: results.summary?.prob_ce_30k,
            computationTimeMs: results.computation_time_ms
        });

        // Check for convergence issues
        if (results.convergence && !results.convergence.converged) {
            this.warn('psa', 'PSA may not have converged', results.convergence);
        }
    }

    /**
     * Log DSA results
     */
    logDSAResults(results) {
        this.info('dsa', 'DSA completed', {
            baseline: results.baseline,
            metric: results.metric,
            parametersAnalyzed: results.parameters?.length,
            topInfluentialParameter: results.topParameters?.[0]?.parameter
        });
    }

    /**
     * Log EVPI calculation
     */
    logEVPI(results) {
        this.info('evpi', 'EVPI calculated', {
            wtp: results.wtp,
            evpiPerPatient: results.evpiPerPatient,
            populationEVPI: results.populationEVPI,
            probWrongDecision: results.probWrongDecision
        });
    }

    /**
     * Log file operations
     */
    logFileOperation(operation, filename, success, details = {}) {
        const level = success ? 'info' : 'error';
        this.log(level, 'file', `${operation}: ${filename}`, {
            success: success,
            ...details
        });
    }

    /**
     * Log export operation
     */
    logExport(format, filename) {
        this.info('export', `Results exported`, {
            format: format,
            filename: filename
        });
    }

    /**
     * Get summary of audit log
     */
    getSummary() {
        return {
            modelId: this.modelId,
            sessionId: this.sessionId,
            startTime: this.startTime,
            endTime: new Date().toISOString(),
            totalEntries: this.entries.length,
            errorCount: this.errors.length,
            warningCount: this.warnings.length,
            clampingEvents: this.clampingEvents.length,
            parameterChanges: this.parameterChanges.length
        };
    }

    /**
     * Export full audit log
     */
    export() {
        return {
            metadata: {
                modelId: this.modelId,
                sessionId: this.sessionId,
                startTime: this.startTime,
                endTime: new Date().toISOString(),
                engineVersion: '0.1',
                generatedBy: 'HTA Artifact Standard'
            },
            summary: this.getSummary(),
            entries: this.entries,
            parameterChanges: this.parameterChanges,
            clampingEvents: this.clampingEvents
        };
    }

    /**
     * Export to downloadable JSON
     */
    downloadAsJson(filename = null) {
        const data = this.export();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `audit_${this.sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Clear log
     */
    clear() {
        this.entries = [];
        this.warnings = [];
        this.errors = [];
        this.parameterChanges = [];
        this.clampingEvents = [];
        this.startTime = new Date().toISOString();
        this.sessionId = this.generateSessionId();
    }

    /**
     * Filter entries by category
     */
    getEntriesByCategory(category) {
        return this.entries.filter(e => e.category === category);
    }

    /**
     * Filter entries by level
     */
    getEntriesByLevel(level) {
        return this.entries.filter(e => e.level === level);
    }

    /**
     * Get entries in time range
     */
    getEntriesInRange(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        return this.entries.filter(e => {
            const time = new Date(e.timestamp);
            return time >= start && time <= end;
        });
    }
}

/**
 * Global audit logger instance
 */
let globalAuditLogger = null;

function getAuditLogger(modelId = 'default') {
    if (!globalAuditLogger || globalAuditLogger.modelId !== modelId) {
        globalAuditLogger = new AuditLogger(modelId);
    }
    return globalAuditLogger;
}

// Export
if (typeof window !== 'undefined') {
    window.AuditLogger = AuditLogger;
    window.getAuditLogger = getAuditLogger;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuditLogger, getAuditLogger };
}
