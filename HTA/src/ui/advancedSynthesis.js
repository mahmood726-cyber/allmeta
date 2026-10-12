/* Persistent HTA synthesis panels: explicit input contracts and saved fits.
 * Plots and exports consume the same fit. Revealing/resizing never refits.
 */
class HTAAdvancedSynthesis {
    constructor(app) {
        this.app = app;
        this.fits = { ma: null, nma: null, pb: null };
        this.generation = { ma: 0, nma: 0, pb: 0 };
        this.plots = new Map();
        for (const kind of ['ma', 'nma']) {
            document.getElementById(`btn-import-${kind}-data`)?.addEventListener('click', () => document.getElementById(`${kind}-file-input`).click());
            document.getElementById(`${kind}-file-input`)?.addEventListener('change', e => this.importFile(kind, e.target));
            document.getElementById(`${kind}-data-input`)?.addEventListener('input', () => {
                this.clear(kind);
                if (kind === 'nma') this.refreshTreatments();
            });
            const section = document.getElementById(kind === 'ma' ? 'section-meta-methods' : 'section-nma');
            section?.querySelectorAll('select').forEach(el => el.addEventListener('change', () => this.clear(kind)));
            document.getElementById(`btn-export-${kind}-fit`)?.addEventListener('click', () => this.exportFit(kind));
            document.getElementById(`btn-export-${kind}-csv`)?.addEventListener('click', () => this.exportCSV(kind));
        }
        document.querySelectorAll('.pub-bias-test').forEach(el => el.addEventListener('change', () => this.clear('pb')));
        document.addEventListener('hta:tab-shown', () => this.redraw());
        window.addEventListener('resize', () => this.redraw());
    }

    static parse(text) {
        text = text.replace(/^\uFEFF/, '').trim();
        if (!text) return [];
        if (/^[\[{]/.test(text)) {
            const value = JSON.parse(text);
            const rows = Array.isArray(value) ? value : value?.studies;
            if (!Array.isArray(rows)) throw new Error('JSON must be an array or an object with a studies array.');
            if (rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Each JSON row must be an object.');
            return rows;
        }
        // CSV with quoted commas, doubled quotes and embedded newlines.
        const records = []; let row = [], cell = '', quoted = false, closed = false;
        const field = () => { row.push(cell.trim()); cell = ''; closed = false; };
        const record = () => { field(); if (row.some(v => v !== '')) records.push(row); row = []; };
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quoted) {
                if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
                else if (ch === '"') { quoted = false; closed = true; }
                else cell += ch;
            } else if (ch === ',') field();
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; record(); }
            else if (ch === '"' && !cell.trim() && !closed) quoted = true;
            else if (closed && ch.trim()) throw new Error('Invalid CSV text after closing quote.');
            else if (ch === '"') throw new Error('Quote inside an unquoted CSV field.');
            else cell += ch;
        }
        if (quoted) throw new Error('CSV contains an unclosed quoted field.');
        record();
        const headers = records.shift()?.map(h => h.toLowerCase());
        if (!headers?.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('CSV requires unique, non-empty column headers.');
        return records.map((values, i) => {
            if (values.length !== headers.length) throw new Error(`CSV row ${i + 2}: column count does not match the header.`);
            return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
        });
    }

    static number(value, field, row) {
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) {
            throw new Error(`Row ${row + 1}: ${field} must be a finite number.`);
        }
        return Number(value);
    }

    static name(value, field, row) {
        if (typeof value !== 'string' || !value.trim()) throw new Error(`Row ${row + 1}: ${field} is required.`);
        return value.trim();
    }

    rows(kind) { return HTAAdvancedSynthesis.parse(document.getElementById(`${kind}-data-input`)?.value || ''); }

    pairwiseData() {
        const names = new Set();
        return this.rows('ma').map((r, i) => {
            const study = HTAAdvancedSynthesis.name(r.study ?? r.label, 'study', i);
            if (names.has(study)) throw new Error(`Row ${i + 1}: duplicate study name; provide one independent estimate per study.`);
            names.add(study);
            const effect = HTAAdvancedSynthesis.number(r.effect ?? r.yi, 'effect', i);
            const se = HTAAdvancedSynthesis.number(r.se ?? r.sei, 'se', i);
            if (se <= 0) throw new Error(`Row ${i + 1}: se must be positive.`);
            const s = { study, label: study, effect, se };
            if (r.year != null && String(r.year).trim() !== '') {
                s.year = HTAAdvancedSynthesis.number(r.year, 'year', i);
                if (!Number.isInteger(s.year) || s.year <= 0) throw new Error(`Row ${i + 1}: year must be a positive integer.`);
            }
            return s;
        });
    }

    networkData() {
        const type = this.value('nma-outcome', 'binary');
        if (!['binary', 'continuous'].includes(type)) throw new Error('Time-to-event NMA is unavailable in this panel; no hazard-ratio model has been fitted.');
        const groups = new Map();
        const data = this.rows('nma').map((r, i) => {
            const study = HTAAdvancedSynthesis.name(r.study, 'study', i);
            const treatment = HTAAdvancedSynthesis.name(r.treatment, 'treatment', i);
            const n = HTAAdvancedSynthesis.number(r.n, 'n', i);
            if (!Number.isInteger(n) || n <= 1) throw new Error(`Row ${i + 1}: n must be an integer greater than one.`);
            const seen = groups.get(study) || new Set();
            if (seen.has(treatment)) throw new Error(`Row ${i + 1}: treatment is repeated within study ${study}.`);
            seen.add(treatment); groups.set(study, seen);
            const arm = { study, treatment, n };
            if (type === 'binary') {
                arm.events = HTAAdvancedSynthesis.number(r.events, 'events', i);
                if (!Number.isInteger(arm.events) || arm.events < 0 || arm.events > n) throw new Error(`Row ${i + 1}: events must be an integer between zero and n.`);
            } else {
                arm.mean = HTAAdvancedSynthesis.number(r.mean, 'mean', i);
                arm.sd = HTAAdvancedSynthesis.number(r.sd, 'sd', i);
                if (arm.sd <= 0) throw new Error(`Row ${i + 1}: sd must be positive.`);
            }
            return arm;
        });
        if ([...groups.values()].some(s => s.size !== 2)) throw new Error('This panel supports exactly two arms per independent study. Multi-arm covariance is not validated here; no model has been fitted.');
        return data;
    }

    value(id, fallback) { return document.getElementById(id)?.value ?? fallback; }
    text(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value); }
    fmt(x) { return Number.isFinite(x) ? x.toFixed(4) : 'Unavailable'; }
    interval(r) { return `${this.fmt(r.ci_lower)} to ${this.fmt(r.ci_upper)}`; }
    message(kind, message) { this.text(`${kind}-analysis-message`, message); }

    clear(kind) {
        this.generation[kind]++;
        this.fits[kind] = null;
        document.getElementById(kind === 'pb' ? 'pub-bias-results' : `${kind}-results`)?.style.setProperty('display', 'none');
        this.message(kind, '');
        for (const [id, entry] of this.plots) {
            if (entry.kind === kind) { entry.observer?.disconnect(); entry.host.remove(); this.plots.delete(id); }
        }
        for (const suffix of ['fit', 'csv']) {
            const b = document.getElementById(`btn-export-${kind}-${suffix}`); if (b) b.disabled = true;
        }
        if (kind === 'ma') this.clear('pb');
    }

    async importFile(kind, input) {
        const file = input.files?.[0]; if (!file) return;
        this.clear(kind);
        const generation = this.generation[kind];
        try {
            const area = document.getElementById(`${kind}-data-input`);
            const content = await file.text();
            if (generation !== this.generation[kind]) return;
            area.value = content;
            const data = kind === 'ma' ? this.pairwiseData() : this.networkData();
            if (!data.length) throw new Error('The file contains no study rows.');
            if (kind === 'nma') this.refreshTreatments();
            this.message(kind, `Imported ${data.length} ${kind === 'ma' ? 'studies' : 'study arms'}. Check the selected effect measure before running.`);
        } catch (e) {
            if (generation !== this.generation[kind]) return;
            document.getElementById(`${kind}-data-input`).value = '';
            if (kind === 'nma') this.refreshTreatments();
            this.message(kind, `Import failed: ${e.message}`);
            this.app.showToast(`Import failed: ${e.message}`, 'error');
        } finally { if (generation === this.generation[kind]) input.value = ''; }
    }

    refreshTreatments() {
        const select = document.getElementById('nma-reference'); if (!select) return;
        const previous = select.value;
        let rows = []; try { rows = this.rows('nma'); } catch (_) { /* incomplete manual input */ }
        const names = [...new Set(rows.map(r => r.treatment).filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()))];
        select.replaceChildren(new Option('Auto (most connected)', 'auto'), ...names.map(t => new Option(t, t)));
        select.value = previous === 'auto' || names.includes(previous) ? previous : 'auto';
    }

    settingsMA() {
        const method = this.value('ma-tau-method', 'REML');
        const confidenceLevel = Number(this.value('ma-ci-level', '.95'));
        const effectMeasure = this.value('ma-effect-measure', 'SMD');
        if (!['REML', 'DL', 'PM'].includes(method)) throw new Error('This panel supports REML, DL and PM. The legacy EB implementation duplicates DL and is not offered as empirical Bayes.');
        if (![.90, .95, .99].includes(confidenceLevel)) throw new Error('Unsupported confidence level.');
        if (!['SMD', 'MD', 'OR', 'RR', 'HR'].includes(effectMeasure)) throw new Error('Unsupported effect measure.');
        if (this.value('ma-hksj', 'false') !== 'false' || this.value('ma-small-study', 'none') !== 'none') throw new Error('HKSJ and small-study interval adjustments are not implemented in this panel. Select normal-approximation intervals.');
        const biasTest = this.value('ma-pub-bias', 'none');
        if (!['none', 'egger', 'begg'].includes(biasTest)) throw new Error('The selected publication-bias test is unavailable for this input contract.');
        return { method, confidenceLevel, alpha: 1 - confidenceLevel, ciLevel: confidenceLevel,
            effectMeasure, analysisScale: ['OR', 'RR', 'HR'].includes(effectMeasure) ? `log(${effectMeasure})` : effectMeasure,
            predictionInterval: this.value('ma-pred-int', 'true') === 'true',
            showI2CI: this.value('ma-i2-ci', 'false') === 'true', biasTest,
            autoHKSJ: false, useHKSJ: false, model: 'random', intervalMethod: 'normal approximation' };
    }

    enableExports(kind) { for (const suffix of ['fit', 'csv']) { const b = document.getElementById(`btn-export-${kind}-${suffix}`); if (b) b.disabled = false; } }

    async runMA() {
        this.clear('ma'); this.app.showLoading('Running meta-analysis...');
        try {
            const data = this.pairwiseData();
            if (data.length < 2) throw new Error('Please enter at least 2 studies.');
            const settings = this.settingsMA();
            if (typeof MetaAnalysisMethods === 'undefined') throw new Error('Meta-analysis engine not available');
            const engine = new MetaAnalysisMethods(settings), results = engine.calculatePooledEffect(data);
            if (results.warnings) results.warnings = results.warnings.map(w => ({ ...w,
                message: w.type === 'HKSJ_RECOMMENDED' ? 'HKSJ is unavailable in this panel. Normal intervals may have poor coverage with few studies.' : 'Between-study variance estimation is unstable with very few studies.' }));
            const dated = data.every(s => Number.isFinite(s.year));
            const cumulative = engine.cumulativeMetaAnalysis(data.map((s, i) => ({ ...s, year: dated ? s.year : i + 1 })), 'year');
            const bias = data.length >= 3 && settings.biasTest !== 'none' ? (settings.biasTest === 'egger' ? engine.eggerTest(data) : engine.beggTest(data)) : null;
            const fit = { data, settings, results, dated, cumulative, leaveOneOut: engine.leaveOneOut(data), influence: engine.influenceDiagnostics(data), bias };
            if (![results.random.effect, results.random.se, results.random.ci_lower, results.random.ci_upper, results.heterogeneity.tauSquared].every(Number.isFinite)) throw new Error('The fit did not produce finite estimates. Check effect and SE magnitudes.');
            this.fits.ma = fit; this.displayMA(fit); this.enableExports('ma');
            this.app.showToast('Meta-analysis completed', 'success');
        } catch (e) { this.clear('ma'); this.message('ma', e.message); this.app.showToast(`Meta-analysis: ${e.message}`, 'error'); }
        finally { this.app.hideLoading(); }
    }

    displayMA(fit) {
        const { data, settings: s, results: r } = fit;
        document.getElementById('ma-results').style.display = 'block';
        this.text('ma-model-description', `Random effects (${s.method}); ${s.confidenceLevel * 100}% normal-approximation intervals, without HKSJ. Analysis scale: ${s.analysisScale}. ${data.length < 10 ? 'With few studies these intervals may have poor coverage.' : ''}`);
        this.text('ma-pooled-effect', this.fmt(r.random.effect)); this.text('ma-pooled-ci', this.interval(r.random));
        this.text('ma-fixed-effect', `${this.fmt(r.fixed.effect)} [${this.interval(r.fixed)}]`);
        this.text('ma-i2', `${this.fmt(r.heterogeneity.I2)}%`); this.text('ma-tau2', this.fmt(r.heterogeneity.tauSquared));
        const pi = r.heterogeneity.predictionInterval;
        this.text('ma-pred-interval', pi ? `${this.fmt(pi.lower)} to ${this.fmt(pi.upper)} (${pi.method})` : 'Not requested');
        document.getElementById('high-i2-warning')?.style.setProperty('display', r.heterogeneity.I2 > 75 ? 'block' : 'none');
        this.tableBody('ma-heterogeneity-body', [
            ['Q', this.fmt(r.heterogeneity.Q), '—', this.fmt(r.heterogeneity.pValueQ), `df = ${r.heterogeneity.df}`],
            ['I²', `${this.fmt(r.heterogeneity.I2)}%`, s.showI2CI ? `${this.fmt(r.heterogeneity.I2_lower)} to ${this.fmt(r.heterogeneity.I2_upper)}%` : 'Not requested', '—', s.showI2CI ? 'Approximate test-based 95% interval' : 'Q-based percentage'],
            ['τ²', this.fmt(r.heterogeneity.tauSquared), 'Unavailable', '—', s.method]
        ]);
        this.tableBody('ma-study-body', data.map((d, i) => [d.study, this.fmt(d.effect), this.fmt(d.se), this.fmt(r.weights.random[i]) + '%']));
        this.tableBody('ma-loo-body', fit.leaveOneOut.results?.map(d => [d.studyLabel, this.fmt(d.effect), this.interval(d), this.fmt(d.I2) + '%', this.fmt(d.change)]) || [[fit.leaveOneOut.error, '—', '—', '—', '—']]);
        this.tableBody('ma-influence-body', fit.influence.diagnostics?.map(d => [d.study, this.fmt(d.cooksD), this.fmt(d.dffits), this.fmt(d.dfbetas), this.fmt(d.hatValue), d.isInfluential ? 'Yes' : 'No']) || [[fit.influence.error, '—', '—', '—', '—', '—']]);
        this.text('ma-cumulative-note', fit.dated ? 'Cumulative fits ordered by year; ties retain input order.' : 'Year is missing: cumulative fits use input order.');
        this.text('ma-bias-note', s.biasTest === 'none' ? 'No asymmetry test requested.' : `${s.biasTest === 'egger' ? "Egger's" : "Begg's"} asymmetry test: ${fit.bias && !fit.bias.error ? 'p = ' + this.fmt(fit.bias.pValue) : 'requires at least three suitable studies'}. These tests do not prove the presence or absence of publication bias.`);
        const z = new MetaAnalysisMethods(s).normalQuantile(1 - s.alpha / 2);
        this.plot('ma', 'ma-forest-chart', host => HTASynthesisPlots.forest(host, 'hta-advanced-ma-forest', `Forest plot (${s.confidenceLevel * 100}% CI; ${s.analysisScale})`, data.map((d, i) => ({ name: d.study, effect: d.effect, lo: d.effect - z * d.se, hi: d.effect + z * d.se, weight: r.weights.random[i] })), { name: 'Pooled random effects', effect: r.random.effect, lo: r.random.ci_lower, hi: r.random.ci_upper }, `${s.analysisScale}; ${s.confidenceLevel * 100}% normal intervals`));
        this.plot('ma', 'ma-cumulative-chart', host => HTASynthesisPlots.forest(host, 'hta-advanced-ma-cumulative', `Cumulative meta-analysis (${s.confidenceLevel * 100}% CI)`, fit.cumulative.results.map(d => ({ name: `${d.nStudies}: ${d.lastStudy}`, effect: d.effect, lo: d.ci_lower, hi: d.ci_upper })), null, `${s.analysisScale}; ${s.confidenceLevel * 100}% normal intervals`));
    }

    async runNMA() {
        this.clear('nma'); this.app.showLoading('Running network meta-analysis...');
        const generation = this.generation.nma;
        try {
            const data = this.networkData();
            if (new Set(data.map(d => d.study)).size < 2) throw new Error('Please enter at least 2 studies for NMA.');
            if (this.value('nma-method', 'frequentist') !== 'frequentist' || this.value('nma-model', 'fixed') !== 'fixed') throw new Error('This advanced panel currently supports frequentist fixed-effect NMA only. Random effects and Bayesian inference are unavailable here.');
            const outcomeType = this.value('nma-outcome', 'binary'), reference = this.value('nma-reference', 'auto');
            if (reference !== 'auto' && !data.some(d => d.treatment === reference)) throw new Error('Reference treatment is not present in the input.');
            const direction = this.value('nma-direction', 'higher');
            if (!['higher', 'lower'].includes(direction)) throw new Error('Select a ranking direction.');
            if (typeof NetworkMetaAnalysis === 'undefined') throw new Error('NMA engine not available');
            const settings = { method: 'frequentist', model: 'fixed', referenceArm: reference === 'auto' ? null : reference,
                outcomeType, confidenceLevel: .95, intervalMethod: 'normal approximation',
                analysisScale: outcomeType === 'binary' ? 'log(OR)' : "SMD (Hedges' g)", rankingDirection: direction,
                contrastDirection: outcomeType === 'binary' ? 'log odds(treatment) / odds(reference)' : 'treatment mean minus reference mean, standardised' };
            const engine = new NetworkMetaAnalysis(settings);
            engine.setData(data, outcomeType);
            const fitted = await engine.run();
            if (generation !== this.generation.nma) return;
            // Do not export unvalidated node-split/geometry diagnostics or
            // frequentist P-score aliases labelled SUCRA as validated results.
            const { consistency: _consistency, networkGeometry: _networkGeometry, heterogeneity: _heterogeneity, sucra: _sucra, ...results } = fitted;
            if (!results.effects.length || !results.effects.every(e => [e.mean, e.se, e.ci_lower, e.ci_upper].every(Number.isFinite))) throw new Error('The network fit did not produce finite estimates.');
            const scores = engine.calculatePScores().map(r => ({ treatment: r.treatment, pScore: direction === 'lower' ? 100 - r.pScore : r.pScore })).sort((a, b) => b.pScore - a.pScore);
            const fit = { data, settings, results, scores, network: engine.network, funnel: engine.generateFunnelPlot(), fittedTauSquared: 0 };
            this.fits.nma = fit; this.displayNMA(fit); this.enableExports('nma');
            this.app.showToast('NMA completed successfully', 'success');
        } catch (e) {
            if (generation !== this.generation.nma) return;
            this.clear('nma'); this.message('nma', e.message); this.app.showToast(`NMA: ${e.message}`, 'error');
        }
        finally { this.app.hideLoading(); }
    }

    displayNMA(fit) {
        const { settings: s, results: r } = fit;
        document.getElementById('nma-results').style.display = 'block';
        this.text('nma-model-description', `Frequentist fixed-effect NMA; 95% normal-approximation intervals. Scale: ${s.analysisScale}; ${s.contrastDirection}. Reference: ${r.reference}. P-scores favour ${s.rankingDirection} values; they are not rank probabilities. Two-arm studies only.`);
        this.text('nma-n-treatments', fit.network.nodes.length); this.text('nma-n-studies', new Set(fit.data.map(d => d.study)).size);
        this.text('nma-n-comparisons', fit.network.edges.length); this.text('nma-connected', 'Yes');
        this.text('nma-i2', this.fmt(r.I2) + '%'); this.text('nma-tau2', '0 (fixed-effect fit)'); this.text('nma-q', this.fmt(r.Q)); this.text('nma-q-pvalue', r.df > 0 ? this.fmt(r.pValueQ) : 'Not estimable (df = 0)');
        this.text('nma-heterogeneity-note', `Residual Q has ${r.df} degrees of freedom. The engine's diagnostic τ² (${this.fmt(r.tauSquared)}) is not used in fixed-effect weights. Node splitting is not validated in this panel.`);
        this.tableBody('nma-sucra-body', fit.scores.map((d, i) => [i + 1, d.treatment, this.fmt(d.pScore) + '%']));
        this.tableBody('nma-consistency-body', [['Node splitting unavailable in this validated workflow', '—', '—', '—', '—', '—']]);
        this.tableBody('nma-study-results-body', r.effects.map(e => [e.treatment, r.reference, this.fmt(e.mean), this.interval(e), this.fmt(e.se), this.fmt(e.pValue)]));
        const league = document.getElementById('nma-league-table'); league.replaceChildren();
        HTASynthesisPlots.table(league, ['Column vs row (' + s.analysisScale + ')', ...r.leagueTable.treatments], r.leagueTable.table.map((row, i) => [r.leagueTable.treatments[i], ...row.map(c => c.isSelf ? '—' : `${this.fmt(c.effect)} [${this.interval(c)}]`)]));
        this.plot('nma', 'nma-network-chart', host => HTASynthesisPlots.network(host, 'hta-advanced-nma-network', 'Observed treatment network', fit.network));
        this.plot('nma', 'nma-ranking-chart', host => HTASynthesisPlots.ranking(host, 'hta-advanced-nma-ranking', 'Frequentist P-scores', fit.scores));
        this.plot('nma', 'nma-forest-chart', host => HTASynthesisPlots.forest(host, 'hta-advanced-nma-forest', `Fitted contrasts vs ${r.reference} (${s.analysisScale})`, r.effects.map(e => ({ name: `${e.treatment} vs ${r.reference}`, effect: e.mean, lo: e.ci_lower, hi: e.ci_upper })), null, `${s.analysisScale}; 95% normal intervals`));
        this.plot('nma', 'nma-funnel-chart', host => HTASynthesisPlots.funnel(host, 'hta-advanced-nma-funnel', 'Comparison-adjusted funnel plot', fit.funnel.data.map(d => ({ name: d.study, effect: d.adjustedEffect, se: d.se })), 0));
    }

    async runBias() {
        this.clear('pb'); this.app.showLoading('Running publication-bias diagnostics...');
        try {
            const data = this.pairwiseData(), settings = this.settingsMA();
            if (data.length < 3) throw new Error('Need at least 3 studies for bias assessment.');
            const tests = [...document.querySelectorAll('.pub-bias-test:checked')].map(el => el.value);
            if (tests.includes('selection')) throw new Error('Selection models are unavailable in this panel.');
            const engine = new MetaAnalysisMethods(settings);
            const fit = { data, settings, tests, results: engine.calculatePooledEffect(data),
                egger: tests.includes('egger') ? engine.eggerTest(data) : null,
                begg: tests.includes('begg') ? engine.beggTest(data) : null,
                trimFill: tests.includes('trim-fill') ? engine.trimAndFill(data) : null };
            this.fits.pb = fit;
            document.getElementById('pub-bias-results').style.display = 'block';
            this.text('pub-bias-summary', 'Small-study-effect diagnostics are not proof for or against publication bias. Trim-and-fill is an exploratory fixed-effect adjustment, distinct from the primary random-effects fit.');
            for (const [key, field] of [['intercept', 'intercept'], ['se', 'se'], ['pvalue', 'pValue']]) this.text('egger-' + key, fit.egger ? this.fmt(fit.egger[field]) : 'Not requested');
            this.text('egger-conclusion', fit.egger?.error || (fit.egger ? 'Interpret as an asymmetry test' : 'Not requested'));
            this.text('begg-tau', fit.begg ? this.fmt(fit.begg.tau) : 'Not requested'); this.text('begg-pvalue', fit.begg ? this.fmt(fit.begg.pValue) : 'Not requested');
            this.text('begg-conclusion', fit.begg?.error || (fit.begg ? 'Interpret as an asymmetry test' : 'Not requested'));
            const tf = fit.trimFill;
            this.text('tf-imputed', tf?.nMissing ?? 'Not requested'); this.text('tf-original', tf?.original ? this.fmt(tf.original.effect) : 'Not requested');
            this.text('tf-adjusted', tf?.adjusted ? this.fmt(tf.adjusted.effect) : 'Unavailable'); this.text('tf-change', tf?.adjusted ? this.fmt(tf.adjusted.effect - tf.original.effect) : '—');
            const observed = data.map(d => ({ name: d.study, effect: d.effect, se: d.se }));
            this.plot('pb', 'pub-bias-funnel-chart', host => HTASynthesisPlots.funnel(host, 'hta-advanced-pb-funnel', 'Observed-study funnel', observed, fit.results.random.effect));
            this.plot('pb', 'trim-fill-chart', host => {
                if (tf?.adjusted) HTASynthesisPlots.funnel(host, 'hta-advanced-pb-trimfill', 'Trim-and-fill funnel (fixed-effect adjustment)', observed, tf.adjusted.effect, tf.imputedStudies || []);
                else { const p = document.createElement('p'); p.textContent = tf?.error || 'Trim-and-fill not requested.'; host.appendChild(p); }
            });
        } catch (e) { this.clear('pb'); this.message('pb', e.message); this.app.showToast(`Publication-bias diagnostics: ${e.message}`, 'error'); }
        finally { this.app.hideLoading(); }
    }

    tableBody(id, rows) {
        const body = document.getElementById(id); if (!body) return;
        body.replaceChildren();
        for (const values of rows) { const tr = document.createElement('tr'); for (const value of values) { const td = document.createElement('td'); td.textContent = String(value); tr.appendChild(td); } body.appendChild(tr); }
    }

    plot(kind, canvasId, draw) {
        const canvas = document.getElementById(canvasId); if (!canvas) return;
        const chart = typeof Chart !== 'undefined' && Chart.getChart?.(canvas); chart?.destroy();
        canvas.hidden = true;
        const parent = canvas.parentElement; parent.style.height = 'auto'; parent.style.minWidth = '0';
        const host = document.createElement('div'); host.className = 'hta-advanced-plot'; parent.appendChild(host);
        const entry = { kind, host, draw, width: -1 };
        if (typeof ResizeObserver !== 'undefined') { entry.observer = new ResizeObserver(() => this.redraw()); entry.observer.observe(host); }
        this.plots.set(canvasId, entry); this.redraw();
    }

    redraw() {
        for (const entry of this.plots.values()) {
            const width = Math.round(entry.host.getBoundingClientRect().width);
            if (width > 0 && width !== entry.width) {
                entry.width = width; entry.host.replaceChildren(); entry.draw(entry.host);
                for (const svg of entry.host.querySelectorAll('svg')) {
                    const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
                    metadata.setAttribute('data-hta-fit-metadata', 'true');
                    metadata.textContent = JSON.stringify({ schema: 'hta-advanced-synthesis-v1', settings: this.fits[entry.kind].settings });
                    svg.prepend(metadata);
                }
            }
        }
    }

    download(name, body, type) {
        const url = URL.createObjectURL(new Blob([body], { type }));
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    exportFit(kind) {
        if (!this.fits[kind]) return;
        this.download(`hta-advanced-${kind}-fit.json`, JSON.stringify({ schema: 'hta-advanced-synthesis-v1', ...this.fits[kind] }, null, 2), 'application/json');
    }

    exportCSV(kind) {
        const fit = this.fits[kind]; if (!fit) return;
        const s = fit.settings;
        const header = ['row_type', 'study_or_treatment', 'reference', 'effect', 'se', 'ci_lower', 'ci_upper', 'weight_percent', 'tau_squared_used', 'model', 'method', 'interval_method', 'confidence_level', 'analysis_scale'];
        const metadata = [s.model, s.method, s.intervalMethod, s.confidenceLevel, s.analysisScale];
        const z = new MetaAnalysisMethods({ alpha: 1 - s.confidenceLevel }).normalQuantile((1 + s.confidenceLevel) / 2);
        const rows = kind === 'ma' ? [
            ...fit.data.map((d, i) => ['study', d.study, '', d.effect, d.se, d.effect - z * d.se, d.effect + z * d.se, fit.results.weights.random[i], fit.results.heterogeneity.tauSquared, ...metadata]),
            ['pooled', 'Pooled random effects', '', fit.results.random.effect, fit.results.random.se, fit.results.random.ci_lower, fit.results.random.ci_upper, 100, fit.results.heterogeneity.tauSquared, ...metadata]
        ] : fit.results.effects.map(e => ['contrast', e.treatment, fit.results.reference, e.mean, e.se, e.ci_lower, e.ci_upper, '', 0, ...metadata]);
        const csv = [header, ...rows].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        this.download(`hta-advanced-${kind}-results.csv`, csv, 'text/csv;charset=utf-8');
    }
}

if (typeof window !== 'undefined') window.HTAAdvancedSynthesis = HTAAdvancedSynthesis;
if (typeof module !== 'undefined' && module.exports) module.exports = { HTAAdvancedSynthesis };
