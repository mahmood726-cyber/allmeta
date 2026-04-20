/**
 * HTA Artifact Standard - Interoperability Module
 * TreeAge import, R export, Excel I/O, FHIR compatibility
 * @version 0.6.0
 */

'use strict';

// ============================================================================
// SECTION 1: TREEAGE PRO IMPORT
// ============================================================================

class TreeAgeImporter {
    constructor() {
        this.supportedVersions = ['2020', '2021', '2022', '2023', '2024'];
    }

    /**
     * Parse TreeAge Pro XML file
     */
    async parseXML(xmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');

        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Invalid XML format: ' + parserError.textContent);
        }

        const model = {
            version: '0.1',
            metadata: this._extractMetadata(doc),
            settings: this._extractSettings(doc),
            parameters: this._extractParameters(doc),
            states: this._extractStates(doc),
            transitions: this._extractTransitions(doc),
            strategies: this._extractStrategies(doc)
        };

        return model;
    }

    _extractMetadata(doc) {
        const root = doc.documentElement;
        return {
            id: this._generateId(),
            name: root.getAttribute('name') || 'Imported TreeAge Model',
            author: root.getAttribute('author') || 'Unknown',
            created: new Date().toISOString(),
            description: root.querySelector('Description')?.textContent || '',
            source: 'TreeAge Pro Import'
        };
    }

    _extractSettings(doc) {
        const settings = doc.querySelector('Settings, ModelSettings');
        return {
            time_horizon: this._parseNumber(settings?.querySelector('TimeHorizon')?.textContent, 20),
            cycle_length: this._parseNumber(settings?.querySelector('CycleLength')?.textContent, 1),
            discount_rate_costs: this._parseNumber(settings?.querySelector('DiscountRateCosts')?.textContent, 0.035),
            discount_rate_outcomes: this._parseNumber(settings?.querySelector('DiscountRateOutcomes')?.textContent, 0.035),
            half_cycle_correction: settings?.querySelector('HalfCycleCorrection')?.textContent === 'true',
            initial_age: this._parseNumber(settings?.querySelector('InitialAge')?.textContent, 40)
        };
    }

    _extractParameters(doc) {
        const params = {};
        const variables = doc.querySelectorAll('Variable, Parameter');

        variables.forEach((v, i) => {
            const id = v.getAttribute('name') || `param_${i}`;
            const value = this._parseNumber(v.querySelector('Value, BaseValue')?.textContent, 0);
            const dist = v.querySelector('Distribution');

            const param = { value };

            if (dist) {
                const distType = dist.getAttribute('type')?.toLowerCase();
                param.distribution = this._convertDistribution(distType, dist);
            }

            const description = v.querySelector('Description')?.textContent;
            if (description) param.description = description;

            params[id] = param;
        });

        return params;
    }

    _extractStates(doc) {
        const states = {};
        const stateNodes = doc.querySelectorAll('State, HealthState, MarkovState');

        stateNodes.forEach((s, i) => {
            const id = s.getAttribute('name') || s.getAttribute('id') || `state_${i}`;

            states[id] = {
                label: s.querySelector('Label')?.textContent || id,
                cost: s.querySelector('Cost')?.textContent || '0',
                utility: s.querySelector('Utility, QALY')?.textContent || '1',
                initial_proportion: this._parseNumber(s.querySelector('InitialProportion')?.textContent, i === 0 ? 1 : 0)
            };

            // Check for tunnel states
            if (s.getAttribute('tunnel') === 'true' || s.querySelector('Tunnel')) {
                states[id].tunnel_length = this._parseNumber(s.querySelector('TunnelLength')?.textContent, 1);
            }
        });

        return states;
    }

    _extractTransitions(doc) {
        const transitions = {};
        const transNodes = doc.querySelectorAll('Transition, Branch');

        transNodes.forEach((t, i) => {
            const id = t.getAttribute('name') || `trans_${i}`;
            const from = t.getAttribute('from') || t.querySelector('From')?.textContent;
            const to = t.getAttribute('to') || t.querySelector('To')?.textContent;
            const prob = t.querySelector('Probability, Prob')?.textContent || '0';

            transitions[id] = {
                from,
                to,
                probability: prob
            };

            // Check for time-dependent probability
            if (t.querySelector('TimeDependent')) {
                transitions[id].time_dependent = true;
            }
        });

        return transitions;
    }

    _extractStrategies(doc) {
        const strategies = {};
        const stratNodes = doc.querySelectorAll('Strategy, Alternative, Comparator');

        stratNodes.forEach((s, i) => {
            const id = s.getAttribute('name') || `strategy_${i}`;

            strategies[id] = {
                label: s.querySelector('Label')?.textContent || id,
                parameter_overrides: {}
            };

            const overrides = s.querySelectorAll('Override, ParameterOverride');
            overrides.forEach(o => {
                const param = o.getAttribute('parameter');
                const value = o.textContent;
                if (param) {
                    strategies[id].parameter_overrides[param] = value;
                }
            });
        });

        return strategies;
    }

    _convertDistribution(type, distNode) {
        const getAttr = (name) => this._parseNumber(distNode.getAttribute(name) || distNode.querySelector(name)?.textContent);

        switch (type) {
            case 'beta':
                return { type: 'beta', alpha: getAttr('alpha'), beta: getAttr('beta') };
            case 'gamma':
                return { type: 'gamma', shape: getAttr('shape'), rate: getAttr('rate') };
            case 'normal':
            case 'gaussian':
                return { type: 'normal', mean: getAttr('mean'), sd: getAttr('sd') || getAttr('stdev') };
            case 'lognormal':
                return { type: 'lognormal', meanlog: getAttr('meanlog'), sdlog: getAttr('sdlog') };
            case 'uniform':
                return { type: 'uniform', min: getAttr('min'), max: getAttr('max') };
            case 'triangular':
                return { type: 'triangular', min: getAttr('min'), mode: getAttr('mode'), max: getAttr('max') };
            default:
                return null;
        }
    }

    _parseNumber(str, defaultVal = 0) {
        if (!str) return defaultVal;
        const num = parseFloat(str);
        return isNaN(num) ? defaultVal : num;
    }

    _generateId() {
        return 'hta_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
}

// ============================================================================
// SECTION 2: R CODE EXPORT
// ============================================================================

class RCodeExporter {
    constructor() {
        this.indentSize = 2;
    }

    /**
     * Export HTA model to R code for metafor/netmeta
     */
    exportMetaAnalysis(data, options = {}) {
        const { package: pkg = 'metafor', method = 'REML' } = options;

        let code = this._generateHeader();

        // Load packages
        code += `# Load required packages\n`;
        code += `library(${pkg})\n`;
        if (pkg === 'netmeta') {
            code += `library(meta)\n`;
        }
        code += `\n`;

        // Create data frame
        code += `# Study data\n`;
        code += this._generateDataFrame(data);
        code += `\n`;

        // Run analysis
        if (pkg === 'metafor') {
            code += this._generateMetaforCode(data, method);
        } else if (pkg === 'netmeta') {
            code += this._generateNetmetaCode(data);
        }

        // Generate forest plot
        code += `\n# Forest plot\n`;
        code += `forest(result)\n`;

        // Funnel plot for publication bias
        code += `\n# Funnel plot\n`;
        code += `funnel(result)\n`;

        return code;
    }

    /**
     * Export Markov model to R code
     */
    exportMarkovModel(model) {
        let code = this._generateHeader();

        code += `# Load packages\n`;
        code += `library(heemod)\n`;
        code += `library(dplyr)\n\n`;

        // Parameters
        code += `# Define parameters\n`;
        code += `params <- define_parameters(\n`;
        const paramLines = [];
        for (const [name, param] of Object.entries(model.parameters || {})) {
            if (param.distribution) {
                paramLines.push(`  ${name} = ${param.value}  # ${param.distribution.type}`);
            } else {
                paramLines.push(`  ${name} = ${param.value}`);
            }
        }
        code += paramLines.join(',\n') + `\n)\n\n`;

        // States
        code += `# Define health states\n`;
        for (const [name, state] of Object.entries(model.states || {})) {
            code += `state_${name} <- define_state(\n`;
            code += `  cost = ${state.cost || 0},\n`;
            code += `  utility = ${state.utility || 1}\n`;
            code += `)\n\n`;
        }

        // Transition matrix
        code += `# Define transition matrix\n`;
        code += `mat_trans <- define_transition(\n`;
        code += this._generateTransitionMatrix(model);
        code += `)\n\n`;

        // Strategy
        code += `# Define strategy\n`;
        code += `strat_base <- define_strategy(\n`;
        code += `  transition = mat_trans,\n`;
        const stateList = Object.keys(model.states || {}).map(s => `  ${s} = state_${s}`).join(',\n');
        code += stateList + `\n)\n\n`;

        // Run model
        code += `# Run Markov model\n`;
        code += `result <- run_model(\n`;
        code += `  base = strat_base,\n`;
        code += `  parameters = params,\n`;
        code += `  cycles = ${model.settings?.time_horizon || 20},\n`;
        code += `  cost = cost,\n`;
        code += `  effect = utility\n`;
        code += `)\n\n`;

        code += `# View results\n`;
        code += `summary(result)\n`;
        code += `plot(result)\n`;

        return code;
    }

    /**
     * Export survival analysis to R
     */
    exportSurvivalAnalysis(data, options = {}) {
        let code = this._generateHeader();

        code += `# Load packages\n`;
        code += `library(survival)\n`;
        code += `library(flexsurv)\n`;
        code += `library(survminer)\n\n`;

        // Create data
        code += `# Survival data\n`;
        code += `surv_data <- data.frame(\n`;
        code += `  time = c(${data.times.join(', ')}),\n`;
        code += `  status = c(${data.events.join(', ')})\n`;
        code += `)\n\n`;

        // Kaplan-Meier
        code += `# Kaplan-Meier estimate\n`;
        code += `km_fit <- survfit(Surv(time, status) ~ 1, data = surv_data)\n`;
        code += `print(km_fit)\n`;
        code += `ggsurvplot(km_fit, data = surv_data)\n\n`;

        // Parametric fits
        const dists = ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma'];
        code += `# Parametric model comparison\n`;
        for (const dist of dists) {
            code += `fit_${dist} <- flexsurvreg(Surv(time, status) ~ 1, data = surv_data, dist = "${dist}")\n`;
        }
        code += `\n`;

        // AIC comparison
        code += `# Model comparison\n`;
        code += `aic_table <- data.frame(\n`;
        code += `  Distribution = c(${dists.map(d => `"${d}"`).join(', ')}),\n`;
        code += `  AIC = c(${dists.map(d => `AIC(fit_${d})`).join(', ')}),\n`;
        code += `  BIC = c(${dists.map(d => `BIC(fit_${d})`).join(', ')})\n`;
        code += `)\n`;
        code += `print(aic_table[order(aic_table$AIC), ])\n`;

        return code;
    }

    _generateHeader() {
        return `# HTA Artifact Standard - R Export
# Generated: ${new Date().toISOString()}
# Version: 0.6.0
#
# This code was automatically generated from an HTA model.
# Please verify all parameters before use.

`;
    }

    _generateDataFrame(data) {
        let code = `study_data <- data.frame(\n`;
        code += `  study = c(${data.map(d => `"${d.study}"`).join(', ')}),\n`;
        code += `  yi = c(${data.map(d => d.effect).join(', ')}),\n`;
        code += `  vi = c(${data.map(d => d.variance).join(', ')})\n`;
        code += `)\n`;
        return code;
    }

    _generateMetaforCode(data, method) {
        return `# Random-effects meta-analysis
result <- rma(yi = yi, vi = vi, data = study_data, method = "${method}")
summary(result)
`;
    }

    _generateNetmetaCode(data) {
        return `# Network meta-analysis
result <- netmeta(TE = yi, seTE = sqrt(vi), treat1 = treat1, treat2 = treat2,
                  studlab = study, data = study_data, sm = "MD")
summary(result)
netgraph(result)
`;
    }

    _generateTransitionMatrix(model) {
        const states = Object.keys(model.states || {});
        const n = states.length;
        const matrix = Array(n).fill(null).map(() => Array(n).fill('0'));

        for (const [_, trans] of Object.entries(model.transitions || {})) {
            const fromIdx = states.indexOf(trans.from);
            const toIdx = states.indexOf(trans.to);
            if (fromIdx >= 0 && toIdx >= 0) {
                matrix[fromIdx][toIdx] = trans.probability;
            }
        }

        // Set complement probabilities
        for (let i = 0; i < n; i++) {
            const sum = matrix[i].filter(x => x !== '0' && x !== 'C').join(' + ');
            matrix[i][i] = sum ? `C` : '1';
        }

        return states.map((s, i) => `  ${matrix[i].join(', ')}  # ${s}`).join(',\n');
    }
}

// ============================================================================
// SECTION 3: EXCEL IMPORT/EXPORT
// ============================================================================

class ExcelHandler {
    constructor() {
        this.dateFormats = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];
    }

    /**
     * Parse CSV/TSV data (Excel export format)
     */
    parseCSV(content, options = {}) {
        const { delimiter = ',', hasHeader = true } = options;

        const lines = content.trim().split(/\r?\n/);
        if (lines.length === 0) return { headers: [], rows: [] };

        const parseRow = (line) => {
            const values = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === delimiter && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());

            return values.map(v => this._parseValue(v));
        };

        const headers = hasHeader ? parseRow(lines[0]) : [];
        const dataStart = hasHeader ? 1 : 0;
        const rows = lines.slice(dataStart).map(parseRow);

        return { headers, rows };
    }

    /**
     * Export data to CSV format
     */
    toCSV(data, options = {}) {
        const { headers = null, delimiter = ',' } = options;

        let csv = '';

        // Headers
        if (headers) {
            csv += headers.map(h => this._escapeCSV(h, delimiter)).join(delimiter) + '\n';
        } else if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
            const keys = Object.keys(data[0]);
            csv += keys.map(k => this._escapeCSV(k, delimiter)).join(delimiter) + '\n';
        }

        // Rows
        for (const row of data) {
            if (Array.isArray(row)) {
                csv += row.map(v => this._escapeCSV(v, delimiter)).join(delimiter) + '\n';
            } else {
                csv += Object.values(row).map(v => this._escapeCSV(v, delimiter)).join(delimiter) + '\n';
            }
        }

        return csv;
    }

    /**
     * Import study data from Excel format
     */
    importStudyData(csvContent) {
        const { headers, rows } = this.parseCSV(csvContent);

        // Map common column names
        const columnMap = {
            study: ['study', 'study_id', 'studyid', 'author', 'trial'],
            effect: ['effect', 'yi', 'es', 'estimate', 'mean', 'smd', 'or', 'rr', 'hr'],
            se: ['se', 'stderr', 'standard_error', 'sei'],
            variance: ['variance', 'vi', 'var'],
            lower: ['lower', 'ci_lower', 'lcl', 'lower_ci', 'lo'],
            upper: ['upper', 'ci_upper', 'ucl', 'upper_ci', 'hi'],
            n: ['n', 'n_total', 'sample_size', 'total'],
            treatment: ['treatment', 'treat', 'intervention', 'arm'],
            control: ['control', 'comparator', 'placebo']
        };

        const findColumn = (candidates) => {
            for (const c of candidates) {
                const idx = headers.findIndex(h => h.toLowerCase() === c);
                if (idx >= 0) return idx;
            }
            return -1;
        };

        const colIndices = {};
        for (const [key, candidates] of Object.entries(columnMap)) {
            colIndices[key] = findColumn(candidates);
        }

        // Parse rows
        const studies = [];
        for (const row of rows) {
            const study = {};

            if (colIndices.study >= 0) study.study = row[colIndices.study];
            if (colIndices.effect >= 0) study.effect = row[colIndices.effect];
            if (colIndices.se >= 0) study.se = row[colIndices.se];
            if (colIndices.variance >= 0) study.variance = row[colIndices.variance];
            if (colIndices.lower >= 0) study.lower = row[colIndices.lower];
            if (colIndices.upper >= 0) study.upper = row[colIndices.upper];
            if (colIndices.n >= 0) study.n = row[colIndices.n];
            if (colIndices.treatment >= 0) study.treatment = row[colIndices.treatment];
            if (colIndices.control >= 0) study.control = row[colIndices.control];

            // Calculate missing values
            if (!study.variance && study.se) {
                study.variance = study.se * study.se;
            }
            if (!study.se && study.variance) {
                study.se = Math.sqrt(study.variance);
            }
            if (!study.se && study.lower && study.upper) {
                study.se = (study.upper - study.lower) / (2 * 1.96);
                study.variance = study.se * study.se;
            }

            studies.push(study);
        }

        return studies;
    }

    /**
     * Export results to Excel-compatible format
     */
    exportResults(results, type = 'psa') {
        switch (type) {
            case 'psa':
                return this._exportPSAResults(results);
            case 'markov':
                return this._exportMarkovTrace(results);
            case 'meta':
                return this._exportMetaResults(results);
            default:
                return this.toCSV(results);
        }
    }

    _exportPSAResults(results) {
        const headers = ['Iteration', 'Strategy', 'Cost', 'Effect', 'ICER', 'NMB_20000', 'NMB_50000', 'NMB_100000'];
        const rows = [];

        for (let i = 0; i < results.iterations?.length; i++) {
            const iter = results.iterations[i];
            for (const strategy of Object.keys(iter.strategies || {})) {
                const s = iter.strategies[strategy];
                rows.push([
                    i + 1,
                    strategy,
                    s.cost,
                    s.effect,
                    s.icer || '',
                    s.effect * 20000 - s.cost,
                    s.effect * 50000 - s.cost,
                    s.effect * 100000 - s.cost
                ]);
            }
        }

        return this.toCSV(rows, { headers });
    }

    _exportMarkovTrace(results) {
        const headers = ['Cycle', ...Object.keys(results.states || {})];
        const rows = [];

        const nCycles = results.trace?.[Object.keys(results.trace)[0]]?.length || 0;
        for (let c = 0; c < nCycles; c++) {
            const row = [c];
            for (const state of Object.keys(results.states || {})) {
                row.push(results.trace[state]?.[c] || 0);
            }
            rows.push(row);
        }

        return this.toCSV(rows, { headers });
    }

    _exportMetaResults(results) {
        const headers = ['Study', 'Effect', 'SE', 'Weight', 'Lower_CI', 'Upper_CI'];
        const rows = results.studies?.map(s => [
            s.study,
            s.effect,
            s.se,
            s.weight,
            s.lower,
            s.upper
        ]) || [];

        // Add pooled estimate
        if (results.pooled) {
            rows.push(['Pooled', results.pooled.effect, results.pooled.se, '', results.pooled.lower, results.pooled.upper]);
        }

        return this.toCSV(rows, { headers });
    }

    _parseValue(str) {
        // Remove quotes
        str = str.replace(/^["']|["']$/g, '');

        // Try number
        const num = parseFloat(str);
        if (!isNaN(num) && str.trim() !== '') return num;

        // Try boolean
        if (str.toLowerCase() === 'true') return true;
        if (str.toLowerCase() === 'false') return false;

        // Try date
        const date = new Date(str);
        if (!isNaN(date.getTime()) && str.includes('-')) return date;

        return str;
    }

    _escapeCSV(value, delimiter) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }
}

// ============================================================================
// SECTION 4: FHIR COMPATIBILITY
// ============================================================================

class FHIRAdapter {
    constructor() {
        this.fhirVersion = 'R4';
    }

    /**
     * Convert HTA evidence to FHIR EvidenceVariable
     */
    toEvidenceVariable(htaModel) {
        return {
            resourceType: 'EvidenceVariable',
            id: htaModel.metadata?.id || this._generateId(),
            meta: {
                versionId: '1',
                lastUpdated: new Date().toISOString()
            },
            status: 'active',
            name: htaModel.metadata?.name || 'HTA Model',
            title: htaModel.metadata?.name || 'Health Technology Assessment Model',
            description: htaModel.metadata?.description || '',
            characteristic: this._extractCharacteristics(htaModel)
        };
    }

    /**
     * Convert study results to FHIR Evidence
     */
    toEvidence(results, htaModel) {
        return {
            resourceType: 'Evidence',
            id: this._generateId(),
            meta: {
                versionId: '1',
                lastUpdated: new Date().toISOString()
            },
            status: 'active',
            title: `Results: ${htaModel.metadata?.name || 'HTA Model'}`,
            description: 'Cost-effectiveness analysis results',
            statistic: this._convertStatistics(results)
        };
    }

    /**
     * Convert to FHIR Bundle
     */
    toBundle(htaModel, results) {
        const entries = [];

        // Evidence Variable
        entries.push({
            fullUrl: `urn:uuid:${this._generateId()}`,
            resource: this.toEvidenceVariable(htaModel)
        });

        // Evidence
        if (results) {
            entries.push({
                fullUrl: `urn:uuid:${this._generateId()}`,
                resource: this.toEvidence(results, htaModel)
            });
        }

        return {
            resourceType: 'Bundle',
            type: 'collection',
            timestamp: new Date().toISOString(),
            entry: entries
        };
    }

    /**
     * Parse FHIR resources to HTA format
     */
    fromFHIR(resource) {
        switch (resource.resourceType) {
            case 'EvidenceVariable':
                return this._fromEvidenceVariable(resource);
            case 'Evidence':
                return this._fromEvidence(resource);
            case 'Bundle':
                return this._fromBundle(resource);
            default:
                throw new Error(`Unsupported FHIR resource type: ${resource.resourceType}`);
        }
    }

    _extractCharacteristics(model) {
        const characteristics = [];

        // Population
        if (model.metadata?.population) {
            characteristics.push({
                description: model.metadata.population,
                definitionCodeableConcept: {
                    coding: [{
                        system: 'http://hl7.org/fhir/resource-types',
                        code: 'Patient',
                        display: 'Population'
                    }]
                }
            });
        }

        // States
        for (const [id, state] of Object.entries(model.states || {})) {
            characteristics.push({
                description: state.label || id,
                definitionCodeableConcept: {
                    coding: [{
                        system: 'urn:hta:state',
                        code: id,
                        display: state.label || id
                    }]
                }
            });
        }

        return characteristics;
    }

    _convertStatistics(results) {
        const statistics = [];

        // ICER
        if (results.icer !== undefined) {
            statistics.push({
                statisticType: {
                    coding: [{
                        system: 'urn:hta:statistic',
                        code: 'ICER',
                        display: 'Incremental Cost-Effectiveness Ratio'
                    }]
                },
                quantity: {
                    value: results.icer,
                    unit: '$/QALY'
                }
            });
        }

        // Total costs
        if (results.costs !== undefined) {
            statistics.push({
                statisticType: {
                    coding: [{
                        system: 'urn:hta:statistic',
                        code: 'cost',
                        display: 'Total Cost'
                    }]
                },
                quantity: {
                    value: results.costs,
                    unit: 'USD'
                }
            });
        }

        // QALYs
        if (results.qalys !== undefined) {
            statistics.push({
                statisticType: {
                    coding: [{
                        system: 'urn:hta:statistic',
                        code: 'QALY',
                        display: 'Quality-Adjusted Life Years'
                    }]
                },
                quantity: {
                    value: results.qalys,
                    unit: 'QALY'
                }
            });
        }

        return statistics;
    }

    _fromEvidenceVariable(resource) {
        const model = {
            version: '0.1',
            metadata: {
                id: resource.id,
                name: resource.title || resource.name,
                description: resource.description
            },
            states: {},
            parameters: {}
        };

        for (const char of resource.characteristic || []) {
            if (char.definitionCodeableConcept?.coding?.[0]?.system === 'urn:hta:state') {
                const id = char.definitionCodeableConcept.coding[0].code;
                model.states[id] = {
                    label: char.description || id
                };
            }
        }

        return model;
    }

    _fromEvidence(resource) {
        const results = {};

        for (const stat of resource.statistic || []) {
            const code = stat.statisticType?.coding?.[0]?.code;
            const value = stat.quantity?.value;

            if (code && value !== undefined) {
                results[code.toLowerCase()] = value;
            }
        }

        return results;
    }

    _fromBundle(bundle) {
        const result = {
            models: [],
            results: []
        };

        for (const entry of bundle.entry || []) {
            const resource = entry.resource;
            if (resource.resourceType === 'EvidenceVariable') {
                result.models.push(this._fromEvidenceVariable(resource));
            } else if (resource.resourceType === 'Evidence') {
                result.results.push(this._fromEvidence(resource));
            }
        }

        return result;
    }

    _generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}

// ============================================================================
// SECTION 5: BIBTEX EXPORT
// ============================================================================

class BibTeXExporter {
    constructor() {
        this.entryTypes = ['article', 'book', 'inproceedings', 'techreport', 'misc'];
    }

    /**
     * Export citations to BibTeX format
     */
    export(citations) {
        return citations.map(c => this._formatEntry(c)).join('\n\n');
    }

    /**
     * Generate citation for HTA model
     */
    generateModelCitation(model, results) {
        const year = new Date().getFullYear();
        const author = model.metadata?.author || 'HTA Artifact Standard';

        return {
            type: 'techreport',
            key: `hta_${model.metadata?.id || Date.now()}`,
            title: model.metadata?.name || 'Health Technology Assessment Model',
            author: author,
            year: year,
            institution: 'HTA Artifact Standard',
            note: `Generated using HTA Artifact Standard v0.6.0. ICER: ${results?.icer?.toFixed(0) || 'N/A'}/QALY`
        };
    }

    _formatEntry(citation) {
        const type = citation.type || 'misc';
        const key = citation.key || this._generateKey(citation);

        let entry = `@${type}{${key},\n`;

        const fields = ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages',
            'publisher', 'institution', 'booktitle', 'doi', 'url', 'note'];

        for (const field of fields) {
            if (citation[field]) {
                const value = this._escapeValue(citation[field]);
                entry += `  ${field} = {${value}},\n`;
            }
        }

        entry = entry.replace(/,\n$/, '\n');
        entry += '}';

        return entry;
    }

    _generateKey(citation) {
        const firstAuthor = (citation.author || 'unknown').split(',')[0].split(' ')[0].toLowerCase();
        const year = citation.year || new Date().getFullYear();
        return `${firstAuthor}${year}`;
    }

    _escapeValue(value) {
        return String(value)
            .replace(/\\/g, '\\\\')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/"/g, '\\"');
    }
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TreeAgeImporter,
        RCodeExporter,
        ExcelHandler,
        FHIRAdapter,
        BibTeXExporter
    };
} else if (typeof window !== 'undefined') {
    window.TreeAgeImporter = TreeAgeImporter;
    window.RCodeExporter = RCodeExporter;
    window.ExcelHandler = ExcelHandler;
    window.FHIRAdapter = FHIRAdapter;
    window.BibTeXExporter = BibTeXExporter;
}
