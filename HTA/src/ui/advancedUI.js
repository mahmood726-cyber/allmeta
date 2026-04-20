/**
 * Advanced Features UI Module for HTA Artifact Standard v0.2
 *
 * Adds UI support for:
 * - Microsimulation
 * - EVPPI with metamodeling
 * - Model Calibration
 * - Survival Curve Fitting
 * - Discrete Event Simulation (DES)
 */

class AdvancedFeaturesUI {
    constructor(app) {
        this.app = app;
        this.survivalEngine = null;
        this.microsimEngine = null;
        this.desEngine = null;
        this.calibrationEngine = null;
        this.evppiCalculator = null;
        this.advancedMetaEngine = null;
        this.ipdEngine = null;
        this.dtaEngine = null;
        this.advancedPbEngine = null;
        this.fabricationEngine = null;
        this.mrEngine = null;
        this.historicalEngine = null;
        this.survivalMetaEngine = null;
        this.thresholdEngine = null;
        this.federatedEngine = null;

        this.initEngines();
        this.setupEventListeners();
    }

    initEngines() {
        // Initialize engines if available
        if (typeof SurvivalAnalysisEngine !== 'undefined') {
            this.survivalEngine = new SurvivalAnalysisEngine();
        }
        if (typeof MicrosimulationEngine !== 'undefined') {
            this.microsimEngine = new MicrosimulationEngine();
        }
        if (typeof DiscreteEventSimulationEngine !== 'undefined') {
            this.desEngine = new DiscreteEventSimulationEngine();
        }
        if (typeof CalibrationEngine !== 'undefined') {
            this.calibrationEngine = new CalibrationEngine();
        }
        if (typeof EVPPICalculator !== 'undefined') {
            this.evppiCalculator = new EVPPICalculator();
        }
        if (typeof AdvancedMetaAnalysis !== 'undefined') {
            this.advancedMetaEngine = new AdvancedMetaAnalysis();
        }
        if (typeof IPDMetaAnalysis !== 'undefined') {
            this.ipdEngine = new IPDMetaAnalysis();
        }
        if (typeof DTAMetaAnalysis !== 'undefined') {
            this.dtaEngine = new DTAMetaAnalysis();
        }
        if (typeof AdvancedPublicationBias !== 'undefined') {
            this.advancedPbEngine = new AdvancedPublicationBias();
        }
        if (typeof DataFabricationDetection !== 'undefined') {
            this.fabricationEngine = new DataFabricationDetection();
        }
        if (typeof MendelianRandomizationMA !== 'undefined') {
            this.mrEngine = new MendelianRandomizationMA();
        }
        if (typeof HistoricalBorrowing !== 'undefined') {
            this.historicalEngine = new HistoricalBorrowing();
        }
        if (typeof SurvivalMetaAnalysis !== 'undefined') {
            this.survivalMetaEngine = new SurvivalMetaAnalysis();
        }
        if (typeof ThresholdAnalysis !== 'undefined') {
            this.thresholdEngine = new ThresholdAnalysis();
        }
        if (typeof FederatedMetaAnalysis !== 'undefined') {
            this.federatedEngine = new FederatedMetaAnalysis();
        }
    }

    setupEventListeners() {
        // Microsimulation
        const microsimBtn = document.getElementById('btn-run-microsim');
        if (microsimBtn) {
            microsimBtn.addEventListener('click', () => this.runMicrosimulation());
        }

        // Survival Fitting
        const survivalBtn = document.getElementById('btn-fit-survival');
        if (survivalBtn) {
            survivalBtn.addEventListener('click', () => this.fitSurvivalCurves());
        }

        // DES
        const desBtn = document.getElementById('btn-run-des');
        if (desBtn) {
            desBtn.addEventListener('click', () => this.runDES());
        }

        // Calibration
        const calibrationBtn = document.getElementById('btn-run-calibration');
        if (calibrationBtn) {
            calibrationBtn.addEventListener('click', () => this.runCalibration());
        }

        // EVPPI
        const evppiBtn = document.getElementById('btn-calc-evppi');
        if (evppiBtn) {
            evppiBtn.addEventListener('click', () => this.calculateEVPPI());
        }

        // KM Data import
        const kmImportBtn = document.getElementById('btn-import-km');
        if (kmImportBtn) {
            kmImportBtn.addEventListener('click', () => this.importKaplanMeier());
        }

        // File input for KM data
        const kmFileInput = document.getElementById('km-file-input');
        if (kmFileInput) {
            kmFileInput.addEventListener('change', (e) => this.handleKMFileUpload(e));
        }

        // Network Meta-Analysis
        const nmaBtn = document.getElementById('btn-run-nma');
        if (nmaBtn) {
            nmaBtn.addEventListener('click', () => this.runNMA());
        }

        // Pairwise Meta-Analysis
        const maBtn = document.getElementById('btn-run-ma');
        if (maBtn) {
            maBtn.addEventListener('click', () => this.runMetaAnalysis());
        }

        // Publication Bias
        const pubBiasBtn = document.getElementById('btn-run-pub-bias');
        if (pubBiasBtn) {
            pubBiasBtn.addEventListener('click', () => this.runPublicationBias());
        }

        // Three-Level Meta-Analysis
        const threeLevelBtn = document.getElementById('btn-run-3level');
        if (threeLevelBtn) {
            threeLevelBtn.addEventListener('click', () => this.runThreeLevelMA());
        }

        // Multivariate Meta-Analysis
        const mvBtn = document.getElementById('btn-run-mv');
        if (mvBtn) {
            mvBtn.addEventListener('click', () => this.runMultivariateMA());
        }
        const addMvOutcomeBtn = document.getElementById('btn-add-mv-outcome');
        if (addMvOutcomeBtn) {
            addMvOutcomeBtn.addEventListener('click', () => this.addMVOutcomeRow());
        }

        // Dose-Response Meta-Analysis
        const drBtn = document.getElementById('btn-run-dr');
        if (drBtn) {
            drBtn.addEventListener('click', () => this.runDoseResponseMA());
        }

        // Component NMA
        const cnmaBtn = document.getElementById('btn-run-cnma');
        if (cnmaBtn) {
            cnmaBtn.addEventListener('click', () => this.runComponentNMA());
        }

        // IPD Meta-Analysis
        const ipdBtn = document.getElementById('btn-run-ipd');
        if (ipdBtn) {
            ipdBtn.addEventListener('click', () => this.runIPDMetaAnalysis());
        }

        // DTA Meta-Analysis
        const dtaBtn = document.getElementById('btn-run-dta');
        if (dtaBtn) {
            dtaBtn.addEventListener('click', () => this.runDTAMetaAnalysis());
        }

        // Advanced Publication Bias
        const advPbBtn = document.getElementById('btn-run-advanced-pb');
        if (advPbBtn) {
            advPbBtn.addEventListener('click', () => this.runAdvancedPubBias());
        }

        // Fabrication Detection
        const fabBtn = document.getElementById('btn-run-fabrication');
        if (fabBtn) {
            fabBtn.addEventListener('click', () => this.runFabricationDetection());
        }

        // MR Meta-Analysis
        const mrBtn = document.getElementById('btn-run-mr');
        if (mrBtn) {
            mrBtn.addEventListener('click', () => this.runMRMetaAnalysis());
        }

        // Historical Meta-Analysis
        const histBtn = document.getElementById('btn-run-historical');
        if (histBtn) {
            histBtn.addEventListener('click', () => this.runHistoricalMA());
        }

        // Survival Meta-Analysis
        const survMaBtn = document.getElementById('btn-run-survival-ma');
        if (survMaBtn) {
            survMaBtn.addEventListener('click', () => this.runSurvivalMA());
        }

        // Threshold Analysis
        const threshBtn = document.getElementById('btn-run-threshold');
        if (threshBtn) {
            threshBtn.addEventListener('click', () => this.runThresholdAnalysis());
        }

        // Federated Meta-Analysis
        const fedBtn = document.getElementById('btn-run-federated');
        if (fedBtn) {
            fedBtn.addEventListener('click', () => this.runFederatedMA());
        }
    }

    // ============ MICROSIMULATION ============

    async runMicrosimulation() {
        if (!this.app.project) {
            this.app.showToast('No model loaded', 'error');
            return;
        }

        if (!this.microsimEngine) {
            this.app.showToast('Microsimulation engine not available', 'error');
            return;
        }

        const numPatients = parseInt(document.getElementById('microsim-patients')?.value || '10000');
        const recordHistory = document.getElementById('microsim-record-history')?.checked || false;
        const seed = parseInt(document.getElementById('microsim-seed')?.value || '12345');

        this.app.showLoading('Running microsimulation...');
        const progressBar = document.getElementById('microsim-progress-bar');
        const progressText = document.getElementById('microsim-progress-text');
        document.getElementById('microsim-progress').style.display = 'block';

        try {
            this.microsimEngine.options = {
                patients: numPatients,
                seed: seed,
                recordHistory: recordHistory
            };

            this.microsimEngine.onProgress = (current, total) => {
                const pct = Math.round((current / total) * 100);
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressText) progressText.textContent = `${pct}%`;
            };

            // Get strategy overrides
            const strategies = this.app.project.strategies || {};
            let intOverrides = {}, compOverrides = {};

            for (const [id, strat] of Object.entries(strategies)) {
                if (strat.is_comparator) {
                    compOverrides = strat.parameter_overrides || {};
                } else {
                    intOverrides = strat.parameter_overrides || {};
                }
            }

            const results = await this.microsimEngine.run(this.app.project, intOverrides, compOverrides);

            this.displayMicrosimResults(results);
            this.app.hideLoading();
            document.getElementById('microsim-progress').style.display = 'none';
            this.app.showToast(`Microsimulation complete (${numPatients} patients)`, 'success');

        } catch (e) {
            this.app.hideLoading();
            document.getElementById('microsim-progress').style.display = 'none';
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayMicrosimResults(results) {
        const container = document.getElementById('microsim-results');
        if (!container) return;

        container.style.display = 'block';

        // Summary statistics
        const s = results.summary;
        document.getElementById('microsim-mean-cost').textContent = `£${s.meanCost.toFixed(2)}`;
        document.getElementById('microsim-mean-qaly').textContent = s.meanQALY.toFixed(4);
        document.getElementById('microsim-mean-ly').textContent = s.meanLY.toFixed(2);

        if (s.costCI) {
            document.getElementById('microsim-cost-ci').textContent =
                `[£${s.costCI[0].toFixed(0)} - £${s.costCI[1].toFixed(0)}]`;
        }
        if (s.qalyCI) {
            document.getElementById('microsim-qaly-ci').textContent =
                `[${s.qalyCI[0].toFixed(4)} - ${s.qalyCI[1].toFixed(4)}]`;
        }

        // State time distribution
        if (results.stateTimeDistribution) {
            this.renderStateTimeChart(results.stateTimeDistribution);
        }

        // Trace comparison
        if (results.intervention && results.comparator) {
            this.renderMicrosimTraceComparison(results);
        }
    }

    renderStateTimeChart(distribution) {
        const ctx = document.getElementById('microsim-state-chart');
        if (!ctx) return;

        if (this.app.charts.microsimState) {
            this.app.charts.microsimState.destroy();
        }

        const labels = Object.keys(distribution);
        const data = Object.values(distribution).map(d => d.mean);

        this.app.charts.microsimState = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Mean Time in State',
                    data: data,
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { title: { display: true, text: 'Years' } }
                }
            }
        });
    }

    renderMicrosimTraceComparison(results) {
        const ctx = document.getElementById('microsim-trace-chart');
        if (!ctx) return;

        if (this.app.charts.microsimTrace) {
            this.app.charts.microsimTrace.destroy();
        }

        const intTrace = results.intervention.trace;
        const compTrace = results.comparator.trace;

        const datasets = [];
        const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6'];

        // Add traces for each state
        const stateNames = Object.keys(intTrace);
        stateNames.forEach((state, i) => {
            const color = colors[i % colors.length];
            datasets.push({
                label: `Int: ${state}`,
                data: intTrace[state].map((v, j) => ({ x: j, y: v })),
                borderColor: color,
                fill: false,
                tension: 0.1
            });
            datasets.push({
                label: `Comp: ${state}`,
                data: compTrace[state].map((v, j) => ({ x: j, y: v })),
                borderColor: color,
                borderDash: [5, 5],
                fill: false,
                tension: 0.1
            });
        });

        this.app.charts.microsimTrace = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Cycle' } },
                    y: { title: { display: true, text: 'Proportion' }, min: 0, max: 1 }
                }
            }
        });
    }

    // ============ SURVIVAL CURVE FITTING ============

    importKaplanMeier() {
        const input = document.getElementById('km-file-input');
        if (input) input.click();
    }

    async handleKMFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            let data;

            if (file.name.endsWith('.json')) {
                data = JSON.parse(text);
            } else if (file.name.endsWith('.csv')) {
                data = this.parseCSV(text);
            } else {
                throw new Error('Unsupported file format. Use .json or .csv');
            }

            this.kmData = this.survivalEngine.importKaplanMeier(data);
            this.displayKMData();
            this.app.showToast('Kaplan-Meier data imported', 'success');

        } catch (error) {
            this.app.showToast(`Error: ${error.message}`, 'error');
        }
    }

    parseCSV(text) {
        const lines = text.trim().split('\n');
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const timeIdx = header.findIndex(h => h === 'time' || h === 't');
        const survIdx = header.findIndex(h => h === 'survival' || h === 's' || h === 'surv');
        const riskIdx = header.findIndex(h => h === 'atrisk' || h === 'n' || h === 'at_risk');

        if (timeIdx === -1 || survIdx === -1) {
            throw new Error('CSV must have time and survival columns');
        }

        return lines.slice(1).map(line => {
            const parts = line.split(',').map(p => parseFloat(p.trim()));
            return {
                time: parts[timeIdx],
                survival: parts[survIdx],
                atRisk: riskIdx >= 0 ? parts[riskIdx] : undefined
            };
        }).filter(p => !isNaN(p.time) && !isNaN(p.survival));
    }

    displayKMData() {
        const container = document.getElementById('km-data-summary');
        if (!container || !this.kmData) return;

        container.innerHTML = `
            <p><strong>Points:</strong> ${this.kmData.points.length}</p>
            <p><strong>Total Patients:</strong> ${this.kmData.raw.totalPatients}</p>
            <p><strong>Total Events:</strong> ${this.kmData.raw.totalEvents}</p>
            <p><strong>Median Survival:</strong> ${this.kmData.medianSurvival?.toFixed(2) || 'Not reached'}</p>
            <p><strong>RMST:</strong> ${this.kmData.meanSurvival?.toFixed(2)}</p>
        `;

        this.renderKMChart();
    }

    renderKMChart() {
        const ctx = document.getElementById('km-chart');
        if (!ctx || !this.kmData) return;

        if (this.app.charts.km) {
            this.app.charts.km.destroy();
        }

        const data = this.kmData.points.map(p => ({ x: p.time, y: p.survival }));

        this.app.charts.km = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Kaplan-Meier',
                    data: data,
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb20',
                    stepped: 'before',
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Time' } },
                    y: { min: 0, max: 1, title: { display: true, text: 'Survival Probability' } }
                }
            }
        });
    }

    async fitSurvivalCurves() {
        if (!this.kmData) {
            this.app.showToast('Import Kaplan-Meier data first', 'warning');
            return;
        }

        if (!this.survivalEngine) {
            this.app.showToast('Survival engine not available', 'error');
            return;
        }

        this.app.showLoading('Fitting survival curves...');

        try {
            const distributions = [];
            const checkboxes = document.querySelectorAll('.dist-checkbox:checked');
            checkboxes.forEach(cb => distributions.push(cb.value));

            if (distributions.length === 0) {
                distributions.push('exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma');
            }

            this.survivalFitResults = this.survivalEngine.fitAllDistributions(this.kmData, {
                distributions
            });

            this.displaySurvivalFitResults();
            this.app.hideLoading();
            this.app.showToast('Survival curves fitted', 'success');

        } catch (e) {
            this.app.hideLoading();
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displaySurvivalFitResults() {
        const container = document.getElementById('survival-fit-results');
        if (!container || !this.survivalFitResults) return;

        container.style.display = 'block';

        // Best model
        const best = this.survivalFitResults.best;
        document.getElementById('best-model').textContent = best?.distribution || '-';
        document.getElementById('best-aic').textContent = best?.aic?.toFixed(2) || '-';
        document.getElementById('best-bic').textContent = best?.bic?.toFixed(2) || '-';
        document.getElementById('best-r2').textContent = best?.r2?.toFixed(4) || '-';

        // Recommendation
        document.getElementById('model-recommendation').textContent =
            this.survivalFitResults.recommendation || '';

        // Fit comparison table
        const tbody = document.getElementById('survival-fit-body');
        let html = '';
        for (const result of this.survivalFitResults.ranked) {
            const deltaAIC = result.deltaAIC?.toFixed(2) || '0.00';
            html += `
                <tr class="${result.rank === 1 ? 'best-fit' : ''}">
                    <td>${result.rank}</td>
                    <td>${result.distribution}</td>
                    <td>${result.aic?.toFixed(2) || '-'}</td>
                    <td>${result.bic?.toFixed(2) || '-'}</td>
                    <td>${deltaAIC}</td>
                    <td>${result.r2?.toFixed(4) || '-'}</td>
                    <td>${result.convergence ? '✓' : '✗'}</td>
                </tr>
            `;
        }
        tbody.innerHTML = html;

        // Render comparison chart
        this.renderSurvivalComparisonChart();
    }

    renderSurvivalComparisonChart() {
        const ctx = document.getElementById('survival-comparison-chart');
        if (!ctx || !this.survivalFitResults || !this.kmData) return;

        if (this.app.charts.survivalComparison) {
            this.app.charts.survivalComparison.destroy();
        }

        const maxTime = Math.max(...this.kmData.points.map(p => p.time));
        const datasets = [];

        // KM curve
        datasets.push({
            label: 'Kaplan-Meier',
            data: this.kmData.points.map(p => ({ x: p.time, y: p.survival })),
            borderColor: '#000000',
            borderWidth: 2,
            stepped: 'before',
            fill: false,
            pointRadius: 0
        });

        // Fitted curves
        const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'];
        this.survivalFitResults.ranked.slice(0, 6).forEach((result, i) => {
            if (!result.fitted) return;

            const curve = this.survivalEngine.generateCurve(result.fitted, maxTime * 1.2, 100);
            datasets.push({
                label: result.distribution,
                data: curve.map(p => ({ x: p.time, y: p.survival })),
                borderColor: colors[i],
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0
            });
        });

        this.app.charts.survivalComparison = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Time' } },
                    y: { min: 0, max: 1, title: { display: true, text: 'Survival Probability' } }
                },
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    }

    // ============ DISCRETE EVENT SIMULATION ============

    async runDES() {
        if (!this.app.project) {
            this.app.showToast('No model loaded', 'error');
            return;
        }

        if (!this.desEngine) {
            this.app.showToast('DES engine not available', 'error');
            return;
        }

        const numPatients = parseInt(document.getElementById('des-patients')?.value || '1000');
        const maxTime = parseInt(document.getElementById('des-max-time')?.value || '50');
        const seed = parseInt(document.getElementById('des-seed')?.value || '12345');

        this.app.showLoading('Running DES...');
        const progressBar = document.getElementById('des-progress-bar');
        const progressText = document.getElementById('des-progress-text');
        document.getElementById('des-progress').style.display = 'block';

        try {
            this.desEngine.options = {
                patients: numPatients,
                maxTime: maxTime,
                seed: seed,
                recordHistory: true
            };

            // Convert Markov model to DES model
            const desModel = this.convertToDesModel(this.app.project);

            const results = await this.desEngine.run(desModel, null, {
                discountRate: this.app.project.settings?.discount_rate_costs || 0.035,
                onProgress: (progress) => {
                    const pct = Math.round(progress.percent);
                    if (progressBar) progressBar.style.width = `${pct}%`;
                    if (progressText) progressText.textContent = `${pct}%`;
                }
            });

            this.displayDESResults(results);
            this.app.hideLoading();
            document.getElementById('des-progress').style.display = 'none';
            this.app.showToast(`DES complete (${numPatients} patients)`, 'success');

        } catch (e) {
            this.app.hideLoading();
            document.getElementById('des-progress').style.display = 'none';
            this.app.showToast(`Error: ${e.message}`, 'error');
            console.error(e);
        }
    }

    convertToDesModel(project) {
        // Convert Markov cohort to DES model structure
        const states = {};
        const events = {};
        const transitions = [];

        // Get parameter values
        const params = {};
        for (const [id, param] of Object.entries(project.parameters || {})) {
            params[id] = typeof param === 'object' ? param.value : param;
        }

        // Convert states
        for (const [id, state] of Object.entries(project.states || {})) {
            const costExpr = state.cost;
            const utilExpr = state.utility;

            let costValue = 0;
            if (typeof costExpr === 'number') {
                costValue = costExpr;
            } else if (typeof costExpr === 'string' && params[costExpr] !== undefined) {
                costValue = params[costExpr];
            }

            let utilValue = 0;
            if (typeof utilExpr === 'number') {
                utilValue = utilExpr;
            } else if (typeof utilExpr === 'string' && params[utilExpr] !== undefined) {
                utilValue = params[utilExpr];
            }

            states[id] = {
                costPerTime: costValue,
                utilityPerTime: utilValue,
                terminal: state.type === 'absorbing',
                scheduledEvents: []
            };
        }

        // Convert transitions to events
        for (const [id, trans] of Object.entries(project.transitions || {})) {
            const from = trans.from;
            const to = trans.to;

            if (from === to) continue; // Skip self-loops

            let prob = 0;
            if (typeof trans.probability === 'number') {
                prob = trans.probability;
            } else if (typeof trans.probability === 'string') {
                try {
                    prob = this.evaluateExpression(trans.probability, params);
                } catch (e) {
                    prob = 0.1; // Default
                }
            }

            if (prob > 0 && prob < 1) {
                const eventName = `${from}_to_${to}`;
                const rate = -Math.log(1 - prob); // Convert probability to rate

                events[eventName] = {
                    cost: 0
                };

                // Add to state's scheduled events
                if (states[from] && !states[from].terminal) {
                    states[from].scheduledEvents.push({
                        event: eventName,
                        distribution: 'exponential',
                        parameters: { rate: rate }
                    });
                }

                transitions.push({
                    trigger: eventName,
                    from: from,
                    to: to
                });
            }
        }

        // Determine initial state
        let initialState = 'stable';
        for (const [id, state] of Object.entries(project.states || {})) {
            if (state.initial_probability > 0) {
                initialState = id;
                break;
            }
        }

        return {
            initialState,
            states,
            events,
            transitions
        };
    }

    evaluateExpression(expr, params) {
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') {
            throw new Error('Expression must be a string or number');
        }

        if (typeof ExpressionParser !== 'undefined') {
            return ExpressionParser.evaluate(expr, params || {});
        }

        const trimmed = expr.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && Object.hasOwn(params || {}, trimmed)) {
            return params[trimmed];
        }

        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric;
        }

        throw new Error('Expression parser unavailable for non-trivial expression');
    }

    displayDESResults(results) {
        const container = document.getElementById('des-results');
        if (!container) return;

        container.style.display = 'block';

        const s = results.summary;
        document.getElementById('des-mean-cost').textContent = `£${s.meanDiscountedCost?.toFixed(2) || s.meanCost?.toFixed(2)}`;
        document.getElementById('des-mean-qaly').textContent = (s.meanDiscountedQALY || s.meanQALY)?.toFixed(4);
        document.getElementById('des-mean-ly').textContent = s.meanLY?.toFixed(2);

        // State statistics
        const stateBody = document.getElementById('des-state-stats-body');
        let stateHtml = '';
        for (const [name, stats] of Object.entries(results.stateStatistics || {})) {
            stateHtml += `
                <tr>
                    <td>${name}</td>
                    <td>${stats.entries}</td>
                    <td>${stats.meanTime?.toFixed(2) || '-'}</td>
                    <td>${stats.totalTime?.toFixed(2) || '-'}</td>
                </tr>
            `;
        }
        if (stateBody) stateBody.innerHTML = stateHtml;

        // Event statistics
        const eventBody = document.getElementById('des-event-stats-body');
        let eventHtml = '';
        for (const [name, stats] of Object.entries(results.eventStatistics || {})) {
            eventHtml += `
                <tr>
                    <td>${name}</td>
                    <td>${stats.count}</td>
                    <td>${stats.meanTime?.toFixed(2) || '-'}</td>
                </tr>
            `;
        }
        if (eventBody) eventBody.innerHTML = eventHtml;
    }

    // ============ MODEL CALIBRATION ============

    async runCalibration() {
        if (!this.app.project) {
            this.app.showToast('No model loaded', 'error');
            return;
        }

        if (!this.calibrationEngine) {
            this.app.showToast('Calibration engine not available', 'error');
            return;
        }

        // Get calibration settings
        const method = document.getElementById('calibration-method')?.value || 'nelder-mead';
        const maxIter = parseInt(document.getElementById('calibration-iterations')?.value || '1000');

        // Get calibration parameters and targets from UI
        const calibParams = this.getCalibrationParameters();
        const targets = this.getCalibrationTargets();

        if (calibParams.length === 0 || targets.length === 0) {
            this.app.showToast('Define calibration parameters and targets', 'warning');
            return;
        }

        this.app.showLoading(`Running calibration (${method})...`);
        document.getElementById('calibration-progress').style.display = 'block';

        try {
            this.calibrationEngine.onProgress = (iteration, maxIter, currentFit) => {
                const pct = Math.round((iteration / maxIter) * 100);
                const bar = document.getElementById('calibration-progress-bar');
                const text = document.getElementById('calibration-progress-text');
                if (bar) bar.style.width = `${pct}%`;
                if (text) text.textContent = `${pct}% (fit: ${currentFit?.toFixed(4) || '-'})`;
            };

            const results = await this.calibrationEngine.calibrate(
                this.app.project,
                calibParams,
                targets,
                { method, maxIterations: maxIter }
            );

            this.displayCalibrationResults(results);
            this.app.hideLoading();
            document.getElementById('calibration-progress').style.display = 'none';
            this.app.showToast('Calibration complete', 'success');

        } catch (e) {
            this.app.hideLoading();
            document.getElementById('calibration-progress').style.display = 'none';
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    getCalibrationParameters() {
        // Parse calibration parameters from UI
        const params = [];
        const rows = document.querySelectorAll('.calibration-param-row');

        rows.forEach(row => {
            const name = row.querySelector('.calib-param-name')?.value;
            const lower = parseFloat(row.querySelector('.calib-param-lower')?.value);
            const upper = parseFloat(row.querySelector('.calib-param-upper')?.value);

            if (name && !isNaN(lower) && !isNaN(upper)) {
                params.push({ name, bounds: [lower, upper] });
            }
        });

        return params;
    }

    getCalibrationTargets() {
        // Parse calibration targets from UI
        const targets = [];
        const rows = document.querySelectorAll('.calibration-target-row');

        rows.forEach(row => {
            const name = row.querySelector('.calib-target-name')?.value;
            const observed = parseFloat(row.querySelector('.calib-target-observed')?.value);
            const type = row.querySelector('.calib-target-type')?.value || 'state_proportion';
            const time = parseFloat(row.querySelector('.calib-target-time')?.value);
            const weight = parseFloat(row.querySelector('.calib-target-weight')?.value) || 1;

            if (name && !isNaN(observed)) {
                targets.push({ name, observed, type, time, weight });
            }
        });

        return targets;
    }

    displayCalibrationResults(results) {
        const container = document.getElementById('calibration-results');
        if (!container) return;

        container.style.display = 'block';

        // Summary
        document.getElementById('calib-converged').textContent = results.converged ? 'Yes' : 'No';
        document.getElementById('calib-iterations').textContent = results.iterations;
        document.getElementById('calib-log-likelihood').textContent = results.logLikelihood?.toFixed(4) || '-';

        // Goodness of fit
        const gof = results.goodnessOfFit;
        if (gof) {
            document.getElementById('calib-r2').textContent = gof.r2?.toFixed(4) || '-';
            document.getElementById('calib-rmse').textContent = gof.rmse?.toFixed(4) || '-';
            document.getElementById('calib-aic').textContent = gof.aic?.toFixed(2) || '-';
            document.getElementById('calib-bic').textContent = gof.bic?.toFixed(2) || '-';
        }

        // Calibrated parameters
        const paramBody = document.getElementById('calib-param-results-body');
        let paramHtml = '';
        for (const [name, value] of Object.entries(results.calibratedParameters || {})) {
            const original = this.app.project.parameters[name]?.value || '-';
            paramHtml += `
                <tr>
                    <td>${name}</td>
                    <td>${original}</td>
                    <td><strong>${value.toFixed(6)}</strong></td>
                    <td>${results.uncertainty?.[name]?.se?.toFixed(6) || '-'}</td>
                </tr>
            `;
        }
        if (paramBody) paramBody.innerHTML = paramHtml;

        // Target comparison
        const targetBody = document.getElementById('calib-target-results-body');
        let targetHtml = '';
        for (const target of results.targetComparison || []) {
            const diff = target.predicted - target.observed;
            const pctDiff = (diff / target.observed * 100).toFixed(1);
            targetHtml += `
                <tr>
                    <td>${target.name}</td>
                    <td>${target.observed.toFixed(4)}</td>
                    <td>${target.predicted.toFixed(4)}</td>
                    <td class="${Math.abs(diff) < 0.01 ? 'good-fit' : 'poor-fit'}">${pctDiff}%</td>
                </tr>
            `;
        }
        if (targetBody) targetBody.innerHTML = targetHtml;
    }

    // ============ EVPPI CALCULATION ============

    async calculateEVPPI() {
        if (!this.app.psaResults?.scatter) {
            this.app.showToast('Run PSA first to calculate EVPPI', 'warning');
            return;
        }

        if (!this.evppiCalculator) {
            this.app.showToast('EVPPI calculator not available', 'error');
            return;
        }

        const wtp = parseFloat(document.getElementById('evppi-wtp')?.value || '30000');

        this.app.showLoading('Calculating EVPPI...');

        try {
            // Get parameter samples from PSA
            const parameterSamples = this.app.psaResults.parameterSamples || {};

            // Calculate EVPPI for all parameters
            const results = this.evppiCalculator.calculateAll(
                this.app.psaResults,
                wtp,
                parameterSamples
            );

            this.displayEVPPIResults(results);
            this.app.hideLoading();
            this.app.showToast('EVPPI calculated', 'success');

        } catch (e) {
            this.app.hideLoading();
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayEVPPIResults(results) {
        const container = document.getElementById('evppi-results');
        if (!container) return;

        container.style.display = 'block';

        // Total EVPI
        document.getElementById('evppi-total-evpi').textContent =
            `£${results.evpi?.toFixed(2) || '-'}`;

        // EVPPI table
        const tbody = document.getElementById('evppi-results-body');
        let html = '';

        for (const param of results.parameters || []) {
            const pctOfEvpi = ((param.evppi / results.evpi) * 100).toFixed(1);
            html += `
                <tr>
                    <td>${param.rank}</td>
                    <td>${param.parameter}</td>
                    <td>£${param.evppi.toFixed(2)}</td>
                    <td>${pctOfEvpi}%</td>
                    <td>${this.getResearchPriority(pctOfEvpi)}</td>
                </tr>
            `;
        }
        if (tbody) tbody.innerHTML = html;

        // Render EVPPI chart
        this.renderEVPPIChart(results);
    }

    getResearchPriority(pctOfEvpi) {
        const pct = parseFloat(pctOfEvpi);
        if (pct >= 20) return '<span class="priority-high">High</span>';
        if (pct >= 10) return '<span class="priority-medium">Medium</span>';
        return '<span class="priority-low">Low</span>';
    }

    renderEVPPIChart(results) {
        const ctx = document.getElementById('evppi-chart');
        if (!ctx) return;

        if (this.app.charts.evppi) {
            this.app.charts.evppi.destroy();
        }

        const topParams = (results.parameters || []).slice(0, 10);
        const labels = topParams.map(p => p.parameter);
        const data = topParams.map(p => p.evppi);

        this.app.charts.evppi = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'EVPPI (£)',
                    data: data,
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'EVPPI (£ per patient)' } }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Top 10 Parameters by EVPPI' }
                }
            }
        });
    }

    // ============ NETWORK META-ANALYSIS ============

    async runNMA() {
        this.app.showLoading('Running Network Meta-Analysis...');
        try {
            // Get NMA data from input
            const nmaData = this.getNMADataFromInputs();
            if (!nmaData || nmaData.length < 2) {
                this.app.showToast('Please enter at least 2 studies for NMA', 'warning');
                this.app.hideLoading();
                return;
            }

            // Initialize NMA engine
            const nmaEngine = typeof NetworkMetaAnalysis !== 'undefined' ? new NetworkMetaAnalysis() : null;
            if (!nmaEngine) {
                this.app.showToast('NMA engine not available', 'error');
                this.app.hideLoading();
                return;
            }

            const results = await nmaEngine.run(nmaData);
            this.displayNMAResults(results);
            this.app.hideLoading();
            this.app.showToast('NMA completed successfully', 'success');
        } catch (e) {
            this.app.hideLoading();
            this.app.showToast(`NMA Error: ${e.message}`, 'error');
        }
    }

    getNMADataFromInputs() {
        // Get study data from NMA input table
        const rows = document.querySelectorAll('#nma-data-body tr');
        const studies = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('input');
            if (cells.length >= 4) {
                const study = cells[0]?.value || '';
                const treatment = cells[1]?.value || '';
                const effect = parseFloat(cells[2]?.value) || 0;
                const se = parseFloat(cells[3]?.value) || 0;
                if (study && treatment && se > 0) {
                    studies.push({ study, treatment, effect, se });
                }
            }
        });
        return studies;
    }

    displayNMAResults(results) {
        // Display network graph
        const networkContainer = document.getElementById('nma-network-graph');
        if (networkContainer && results.network) {
            this.renderNetworkGraph(networkContainer, results.network);
        }

        // Display results table
        const tbody = document.getElementById('nma-results-body');
        if (tbody && results.comparisons) {
            let html = '';
            results.comparisons.forEach(c => {
                html += `<tr>
                    <td>${c.comparison}</td>
                    <td>${c.effect.toFixed(3)}</td>
                    <td>${c.ci_lower.toFixed(3)} to ${c.ci_upper.toFixed(3)}</td>
                    <td>${c.p_value < 0.05 ? '<span class="significant">*</span>' : ''}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        // Display forest plot
        const forestContainer = document.getElementById('nma-forest-plot');
        if (forestContainer && results.comparisons) {
            this.renderForestPlot(forestContainer, results.comparisons, 'NMA Forest Plot');
        }
    }

    // ============ PAIRWISE META-ANALYSIS ============

    async runMetaAnalysis() {
        this.app.showLoading('Running Meta-Analysis...');
        try {
            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 2) {
                this.app.showToast('Please enter at least 2 studies', 'warning');
                this.app.hideLoading();
                return;
            }

            // Get analysis settings
            const method = document.getElementById('ma-method')?.value || 'REML';
            const useHKSJ = document.getElementById('ma-hksj')?.checked || false;

            // Initialize meta-analysis engine
            const maEngine = typeof MetaAnalysisMethods !== 'undefined' ? new MetaAnalysisMethods({ method, useHKSJ }) : null;
            if (!maEngine) {
                this.app.showToast('Meta-analysis engine not available', 'error');
                this.app.hideLoading();
                return;
            }

            const results = maEngine.analyze(maData);
            this.displayMAResults(results);
            this.app.hideLoading();
            this.app.showToast('Meta-analysis completed', 'success');
        } catch (e) {
            this.app.hideLoading();
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    getMADataFromInputs() {
        const rows = document.querySelectorAll('#ma-data-body tr');
        const studies = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('input');
            if (cells.length >= 3) {
                const study = cells[0]?.value || '';
                const effect = parseFloat(cells[1]?.value);
                const se = parseFloat(cells[2]?.value);
                if (study && !isNaN(effect) && !isNaN(se) && se > 0) {
                    studies.push({ study, yi: effect, sei: se });
                }
            }
        });
        return studies;
    }

    displayMAResults(results) {
        // Update summary statistics
        const summaryDiv = document.getElementById('ma-summary');
        if (summaryDiv && results.pooled) {
            summaryDiv.innerHTML = `
                <div class="result-highlight">
                    <span class="label">Pooled Effect</span>
                    <span class="value">${results.pooled.effect.toFixed(3)}</span>
                    <span class="ci">(${results.pooled.ci_lower.toFixed(3)} to ${results.pooled.ci_upper.toFixed(3)})</span>
                </div>
                <div class="stat-grid">
                    <div class="stat"><span class="label">I²</span> ${(results.heterogeneity?.I2 * 100 || 0).toFixed(1)}%</div>
                    <div class="stat"><span class="label">tau²</span> ${(results.heterogeneity?.tau2 || 0).toFixed(4)}</div>
                    <div class="stat"><span class="label">Q</span> ${(results.heterogeneity?.Q || 0).toFixed(2)}</div>
                </div>
            `;
        }

        // Render forest plot
        const forestContainer = document.getElementById('ma-forest-plot');
        if (forestContainer && results.studies) {
            this.renderForestPlot(forestContainer, results.studies, 'Forest Plot');
        }
    }

    // ============ PUBLICATION BIAS ============

    async runPublicationBias() {
        this.app.showLoading('Running Publication Bias Assessment...');
        try {
            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 3) {
                this.app.showToast('Need at least 3 studies for bias assessment', 'warning');
                this.app.hideLoading();
                return;
            }

            const maEngine = typeof MetaAnalysisMethods !== 'undefined' ? new MetaAnalysisMethods() : null;
            if (!maEngine) {
                this.app.showToast('Meta-analysis engine not available', 'error');
                this.app.hideLoading();
                return;
            }

            const pooled = maEngine.analyze(maData);
            const egger = maEngine.eggerTest(maData);
            const trimFill = maEngine.trimAndFill(maData);

            this.displayPubBiasResults({ pooled, egger, trimFill, studies: maData });
            this.app.hideLoading();
            this.app.showToast('Publication bias assessment completed', 'success');
        } catch (e) {
            this.app.hideLoading();
            this.app.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayPubBiasResults(results) {
        // Display Egger's test
        const eggerDiv = document.getElementById('pb-egger-results');
        if (eggerDiv && results.egger) {
            const significant = results.egger.p < 0.05;
            eggerDiv.innerHTML = `
                <p>Intercept: ${results.egger.intercept.toFixed(3)} (SE: ${results.egger.se.toFixed(3)})</p>
                <p>t = ${results.egger.t.toFixed(2)}, p = ${results.egger.p.toFixed(4)}</p>
                <p class="${significant ? 'warning' : 'success'}">
                    ${significant ? 'Evidence of asymmetry (potential publication bias)' : 'No significant asymmetry detected'}
                </p>
            `;
        }

        // Display trim and fill
        const tfDiv = document.getElementById('pb-trimfill-results');
        if (tfDiv && results.trimFill) {
            tfDiv.innerHTML = `
                <p>Studies imputed: ${results.trimFill.k0 || 0}</p>
                <p>Original effect: ${results.pooled?.pooled?.effect?.toFixed(3) || 'N/A'}</p>
                <p>Adjusted effect: ${results.trimFill.adjusted?.effect?.toFixed(3) || 'N/A'}</p>
            `;
        }

        // Render funnel plot
        const funnelContainer = document.getElementById('pb-funnel-plot');
        if (funnelContainer && results.studies) {
            this.renderFunnelPlot(funnelContainer, results.studies, results.pooled?.pooled?.effect);
        }
    }

    // ============ HELPER CHART METHODS ============

    renderNetworkGraph(container, network) {
        container.innerHTML = '';
        const width = container.clientWidth || 400;
        const height = 300;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // Simple force-directed graph
        const nodes = network.nodes || [];
        const links = network.edges || [];

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(80))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2));

        const link = svg.selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', '#999')
            .attr('stroke-width', d => Math.sqrt(d.weight || 1));

        const node = svg.selectAll('circle')
            .data(nodes)
            .enter().append('circle')
            .attr('r', d => Math.sqrt(d.size || 10) * 3)
            .attr('fill', '#2563eb')
            .call(d3.drag()
                .on('start', d => { if (!d.active) simulation.alphaTarget(0.3).restart(); })
                .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
                .on('end', d => { if (!d.active) simulation.alphaTarget(0); }));

        const label = svg.selectAll('text')
            .data(nodes)
            .enter().append('text')
            .text(d => d.id)
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle');

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('cx', d => d.x).attr('cy', d => d.y);
            label.attr('x', d => d.x).attr('y', d => d.y - 12);
        });
    }

    renderForestPlot(container, studies, title) {
        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const labels = studies.map(s => s.study || s.comparison || 'Study');
        const effects = studies.map(s => s.effect || s.yi || 0);
        const lowers = studies.map(s => s.ci_lower || (s.effect - 1.96 * s.se) || 0);
        const uppers = studies.map(s => s.ci_upper || (s.effect + 1.96 * s.se) || 0);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Effect Size',
                    data: effects,
                    backgroundColor: '#2563eb80',
                    borderColor: '#2563eb',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: title },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Effect Size' },
                        ticks: { callback: v => v.toFixed(2) }
                    }
                }
            }
        });
    }

    renderFunnelPlot(container, studies, pooledEffect) {
        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const data = studies.map(s => ({
            x: s.yi || s.effect || 0,
            y: s.sei || s.se || 0
        }));

        new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Studies',
                    data: data,
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Funnel Plot' }
                },
                scales: {
                    x: { title: { display: true, text: 'Effect Size' } },
                    y: { title: { display: true, text: 'Standard Error' }, reverse: true }
                }
            }
        });
    }

    // ============ ADDITIONAL META-ANALYSIS METHODS ============

    addMVOutcomeRow() {
        const container = document.getElementById('mv-outcomes-container');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'mv-outcome-row';
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.marginBottom = '8px';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mv-outcome-name';
        input.style.flex = '1';
        input.style.padding = '8px';
        input.style.border = '1px solid var(--border)';
        input.style.borderRadius = '4px';
        input.value = `Outcome ${container.querySelectorAll('.mv-outcome-name').length + 1}`;

        row.appendChild(input);
        container.appendChild(row);
    }

    normalizeHeader(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/[^\w]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    splitCSVLine(line) {
        const cells = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                cells.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        cells.push(current.trim());
        return cells;
    }

    parseCSVTextArea(id) {
        const el = document.getElementById(id);
        if (!el) return [];
        const text = String(el.value || '').trim();
        if (!text) return [];

        if (text.startsWith('[')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    return parsed.map(row => {
                        const out = {};
                        Object.entries(row || {}).forEach(([k, v]) => {
                            out[this.normalizeHeader(k)] = String(v ?? '').trim();
                        });
                        return out;
                    });
                }
            } catch (_err) {
                // Fall through to CSV parsing.
            }
        }

        const lines = text
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        if (lines.length < 2) return [];

        const headers = this.splitCSVLine(lines[0]).map(h => this.normalizeHeader(h));
        return lines.slice(1)
            .map(line => {
                const values = this.splitCSVLine(line);
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = String(values[idx] || '').trim();
                });
                return row;
            })
            .filter(row => Object.values(row).some(v => v !== ''));
    }

    getRowValue(row, keys, fallback = '') {
        for (const key of keys) {
            const normalized = this.normalizeHeader(key);
            if (Object.prototype.hasOwnProperty.call(row, normalized) && row[normalized] !== '') {
                return row[normalized];
            }
        }
        return fallback;
    }

    parseNumber(value, fallback = NaN) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    parseBooleanLike(value, fallback = null) {
        if (value === null || value === undefined) return fallback;
        const s = String(value).trim().toLowerCase();
        if (s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'event') return 1;
        if (s === '0' || s === 'false' || s === 'no' || s === 'n' || s === 'censor') return 0;
        const n = Number(s);
        if (Number.isFinite(n)) return n > 0 ? 1 : 0;
        return fallback;
    }

    parseCovariateList(id) {
        const raw = String(document.getElementById(id)?.value || '');
        return raw.split(',').map(v => this.normalizeHeader(v)).filter(Boolean);
    }

    parseComponentLabel(label) {
        const chunks = String(label || '')
            .split(/[+,&|/]/g)
            .map(v => v.trim())
            .filter(Boolean);
        return chunks.length > 0 ? chunks : (label ? [String(label).trim()] : []);
    }

    formatNum(value, digits = 3, fallback = 'N/A') {
        return Number.isFinite(value) ? Number(value).toFixed(digits) : fallback;
    }

    setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    showPanel(id, visible = true) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? 'block' : 'none';
    }

    escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    ensureChartStore() {
        if (!this.app.charts) this.app.charts = {};
    }

    destroyChart(key) {
        this.ensureChartStore();
        if (this.app.charts[key]) {
            this.app.charts[key].destroy();
            delete this.app.charts[key];
        }
    }

    computeUnadjustedFromEffects(data) {
        if (!Array.isArray(data) || data.length === 0) return NaN;
        const weights = data.map(d => 1 / Math.max((d.se || 0) ** 2, 1e-12));
        const sumW = weights.reduce((a, b) => a + b, 0);
        if (sumW <= 0) return NaN;
        return data.reduce((sum, d, i) => sum + weights[i] * d.effect, 0) / sumW;
    }

    renderDoseResponseChart(curve) {
        const ctx = document.getElementById('dr-curve-chart');
        if (!ctx || !Array.isArray(curve) || curve.length === 0) return;
        this.destroyChart('doseResponse');

        this.app.charts.doseResponse = new Chart(ctx, {
            type: 'line',
            data: {
                labels: curve.map(p => p.dose),
                datasets: [
                    {
                        label: 'Estimated Effect',
                        data: curve.map(p => p.effect),
                        borderColor: '#2563eb',
                        backgroundColor: '#2563eb22',
                        fill: false,
                        tension: 0.2
                    },
                    {
                        label: '95% CI Lower',
                        data: curve.map(p => p.ciLower),
                        borderColor: '#94a3b8',
                        borderDash: [4, 4],
                        fill: false,
                        pointRadius: 0,
                        tension: 0.2
                    },
                    {
                        label: '95% CI Upper',
                        data: curve.map(p => p.ciUpper),
                        borderColor: '#94a3b8',
                        borderDash: [4, 4],
                        fill: '-1',
                        backgroundColor: '#94a3b81f',
                        pointRadius: 0,
                        tension: 0.2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Dose' } },
                    y: { title: { display: true, text: 'Effect' } }
                }
            }
        });
    }

    renderDTASROCChart(studyPoints, summaryPoint = null) {
        const ctx = document.getElementById('dta-sroc-chart');
        if (!ctx || !Array.isArray(studyPoints)) return;
        this.destroyChart('dtaSROC');

        const datasets = [{
            label: 'Studies',
            type: 'scatter',
            data: studyPoints.map(point => ({
                x: Math.max(0, Math.min(1, 1 - point.specificity)),
                y: Math.max(0, Math.min(1, point.sensitivity))
            })),
            backgroundColor: '#2563eb'
        }];

        if (summaryPoint && Number.isFinite(summaryPoint.sensitivity) && Number.isFinite(summaryPoint.specificity)) {
            datasets.push({
                label: 'Summary Point',
                type: 'scatter',
                data: [{ x: 1 - summaryPoint.specificity, y: summaryPoint.sensitivity }],
                backgroundColor: '#dc2626',
                pointRadius: 8
            });
        }

        this.app.charts.dtaSROC = new Chart(ctx, {
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { min: 0, max: 1, title: { display: true, text: '1 - Specificity' } },
                    y: { min: 0, max: 1, title: { display: true, text: 'Sensitivity' } }
                }
            }
        });
    }

    renderPBSensitivityChart(labels, values, label) {
        const ctx = document.getElementById('pb-sensitivity-chart');
        if (!ctx || !Array.isArray(labels) || !Array.isArray(values)) return;
        this.destroyChart('pbSensitivity');

        this.app.charts.pbSensitivity = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb22',
                    fill: false,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    renderMRScatterChart(data, slope, intercept = 0) {
        const ctx = document.getElementById('mr-scatter-chart');
        if (!ctx || !Array.isArray(data) || data.length === 0) return;
        this.destroyChart('mrScatter');

        const xValues = data.map(point => point.betaExposure);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);

        this.app.charts.mrScatter = new Chart(ctx, {
            data: {
                datasets: [
                    {
                        type: 'scatter',
                        label: 'Instruments',
                        data: data.map(point => ({ x: point.betaExposure, y: point.betaOutcome })),
                        backgroundColor: '#2563eb'
                    },
                    {
                        type: 'line',
                        label: 'MR Fit',
                        data: [
                            { x: minX, y: intercept + slope * minX },
                            { x: maxX, y: intercept + slope * maxX }
                        ],
                        borderColor: '#dc2626',
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'SNP-Exposure Effect' } },
                    y: { title: { display: true, text: 'SNP-Outcome Effect' } }
                }
            }
        });
    }

    renderSurvivalMetaChart(curves) {
        const ctx = document.getElementById('survival-curves-chart');
        if (!ctx || !Array.isArray(curves) || curves.length === 0) return;
        this.destroyChart('survivalMA');

        const palette = ['#2563eb', '#16a34a', '#dc2626', '#ea580c', '#7c3aed', '#0f766e'];
        const datasets = curves.map((curve, idx) => ({
            label: curve.label,
            data: curve.points.map(point => ({ x: point.time, y: point.survival })),
            borderColor: palette[idx % palette.length],
            tension: 0.15,
            fill: false
        }));

        this.app.charts.survivalMA = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Time' } },
                    y: { min: 0, max: 1, title: { display: true, text: 'Survival Probability' } }
                }
            }
        });
    }

    renderFederatedWeightsChart(contributions) {
        const ctx = document.getElementById('federated-weights-chart');
        if (!ctx || !Array.isArray(contributions) || contributions.length === 0) return;
        this.destroyChart('federatedWeights');

        this.app.charts.federatedWeights = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: contributions.map(c => c.siteId),
                datasets: [{
                    label: 'Meta-analytic weight',
                    data: contributions.map(c => c.weight),
                    backgroundColor: '#2563eb80',
                    borderColor: '#2563eb',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 0, title: { display: true, text: 'Weight' } }
                }
            }
        });
    }

    async runThreeLevelMA() {
        const engine = typeof AdvancedMetaAnalysis !== 'undefined'
            ? new AdvancedMetaAnalysis({
                method: document.getElementById('3level-method')?.value || 'REML',
                alpha: 1 - (parseFloat(document.getElementById('3level-ci')?.value || '0.95'))
            })
            : this.advancedMetaEngine;
        if (!engine) {
            this.app.showToast('Three-level meta-analysis engine not available', 'error');
            return;
        }

        try {
            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 3) {
                this.app.showToast('Enter at least 3 studies in Pairwise MA data before running Three-Level MA', 'warning');
                return;
            }

            const studyVar = this.normalizeHeader(document.getElementById('3level-study-var')?.value || 'study');
            const data = maData.map((s, idx) => ({
                [studyVar]: s.study,
                effect_id: `${s.study}_${idx + 1}`,
                yi: s.yi,
                vi: Math.pow(s.sei, 2)
            }));

            const results = engine.threeLevel(data, {
                studyVar,
                effectVar: 'effect_id',
                yiVar: 'yi',
                viVar: 'vi',
                method: document.getElementById('3level-method')?.value || 'REML'
            });

            this.showPanel('3level-results', true);
            this.setText('3level-pooled', this.formatNum(results.mu));
            this.setText('3level-ci-display', `${this.formatNum(results.ci[0])} to ${this.formatNum(results.ci[1])}`);
            this.setText('3level-tau2-between', this.formatNum(results.tau2Between, 4));
            this.setText('3level-tau2-within', this.formatNum(results.tau2Within, 4));
            this.setText('3level-i2-l2', `${this.formatNum(results.I2Level2, 1)}%`);
            this.setText('3level-i2-l3', `${this.formatNum(results.I2Level3, 1)}%`);
            this.setText('3level-interpretation', results.interpretation || 'No interpretation available.');

            this.app.showToast(
                `Three-Level MA: effect ${results.mu.toFixed(3)} (${results.ci[0].toFixed(3)} to ${results.ci[1].toFixed(3)})`,
                'success'
            );
        } catch (e) {
            this.app.showToast(`Three-Level MA failed: ${e.message}`, 'error');
        }
    }

    async runMultivariateMA() {
        const engine = this.advancedMetaEngine || (typeof AdvancedMetaAnalysis !== 'undefined' ? new AdvancedMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('Multivariate meta-analysis engine not available', 'error');
            return;
        }

        try {
            const outcomes = Array.from(document.querySelectorAll('.mv-outcome-name'))
                .map(input => String(input.value || '').trim())
                .filter(Boolean);
            if (outcomes.length < 1) {
                this.app.showToast('Add at least one outcome name', 'warning');
                return;
            }

            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 2) {
                this.app.showToast('Enter pairwise study data first', 'warning');
                return;
            }

            const byStudy = {};
            maData.forEach(row => {
                const key = row.study || `Study_${Object.keys(byStudy).length + 1}`;
                if (!byStudy[key]) byStudy[key] = [];
                byStudy[key].push(row);
            });

            const multivariateRows = [];
            let fallbackCount = 0;
            Object.entries(byStudy).forEach(([study, rows]) => {
                const out = { study };
                outcomes.forEach((outcome, idx) => {
                    const src = rows[idx] || rows[0];
                    if (idx >= rows.length) fallbackCount++;
                    out[`${outcome}_yi`] = src.yi;
                    out[`${outcome}_vi`] = Math.pow(src.sei, 2);
                });
                multivariateRows.push(out);
            });

            const results = engine.multivariate(multivariateRows, { outcomes });
            this.showPanel('mv-results', true);

            const body = document.getElementById('mv-effects-body');
            if (body) {
                body.innerHTML = (results.effects || []).map(effect => `
                    <tr>
                        <td>${this.escapeHTML(effect.outcome)}</td>
                        <td>${this.formatNum(effect.estimate)}</td>
                        <td>${this.formatNum(effect.ci[0])} to ${this.formatNum(effect.ci[1])}</td>
                        <td>${this.formatNum(effect.zValue, 2)}</td>
                        <td>${this.formatNum(effect.pValue, 4)}</td>
                    </tr>
                `).join('');
            }

            const corrDiv = document.getElementById('mv-correlation-matrix');
            if (corrDiv) {
                const matrix = results.betweenStudyCorrelation || [];
                let html = '<table class="data-table"><thead><tr><th></th>';
                html += outcomes.map(o => `<th>${this.escapeHTML(o)}</th>`).join('');
                html += '</tr></thead><tbody>';
                matrix.forEach((row, i) => {
                    html += `<tr><th>${this.escapeHTML(outcomes[i] || `Outcome ${i + 1}`)}</th>`;
                    html += row.map(v => `<td>${this.formatNum(v, 3)}</td>`).join('');
                    html += '</tr>';
                });
                html += '</tbody></table>';
                corrDiv.innerHTML = html;
            }

            if (fallbackCount > 0) {
                this.app.showToast('Multivariate MA completed (some outcomes imputed from available study rows)', 'warning');
            } else {
                this.app.showToast('Multivariate MA completed', 'success');
            }
        } catch (e) {
            this.app.showToast(`Multivariate MA failed: ${e.message}`, 'error');
        }
    }

    async runDoseResponseMA() {
        const engine = this.advancedMetaEngine || (typeof AdvancedMetaAnalysis !== 'undefined' ? new AdvancedMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('Dose-response engine not available', 'error');
            return;
        }

        try {
            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 3) {
                this.app.showToast('Enter at least 3 rows in Pairwise MA data for dose-response analysis', 'warning');
                return;
            }

            const parsedRows = maData.map((row, idx) => {
                const label = String(row.study || `Study ${idx + 1}`);
                const match = label.match(/^(.*?)[_\s:|-]?(-?\d+(?:\.\d+)?)$/);
                const parsedDose = match ? this.parseNumber(match[2], NaN) : NaN;
                const parsedStudy = match && match[1].trim() ? match[1].trim() : label;
                return {
                    study: parsedStudy,
                    dose: Number.isFinite(parsedDose) ? parsedDose : idx + 1,
                    yi: row.yi,
                    vi: Math.pow(row.sei, 2)
                };
            });

            const groups = {};
            parsedRows.forEach(r => {
                if (!groups[r.study]) groups[r.study] = [];
                groups[r.study].push(r);
            });

            let data = [];
            const hasMultiDoseStudy = Object.values(groups).some(group => group.length > 1);
            if (hasMultiDoseStudy) {
                Object.values(groups).forEach(group => {
                    group.sort((a, b) => a.dose - b.dose);
                    group.forEach((item, idx) => data.push({ ...item, reference: idx === 0 }));
                });
            } else {
                const synthetic = [...parsedRows].sort((a, b) => a.dose - b.dose);
                data = synthetic.map((item, idx) => ({
                    ...item,
                    study: 'SyntheticStudy',
                    reference: idx === 0
                }));
            }

            const nKnots = parseInt(document.getElementById('dr-knots')?.value || '3', 10);
            const model = document.getElementById('dr-model')?.value || 'random';
            const results = engine.doseResponse(data, {
                doseVar: 'dose',
                yiVar: 'yi',
                viVar: 'vi',
                studyVar: 'study',
                referenceVar: 'reference',
                splineKnots: nKnots,
                model
            });

            this.showPanel('dr-results', true);
            this.setText('dr-nonlinearity', `Chi-square ${this.formatNum(results.nonLinearityTest?.statistic, 2)}`);
            this.setText('dr-nonlin-p', this.formatNum(results.nonLinearityTest?.pValue, 4));
            this.setText('dr-overall-p', this.formatNum(results.overallTest?.pValue, 4));
            this.setText('dr-tau2', this.formatNum(results.tau2, 4));
            this.renderDoseResponseChart(results.curve || []);

            this.app.showToast('Dose-response MA completed', 'success');
        } catch (e) {
            this.app.showToast(`Dose-response MA failed: ${e.message}`, 'error');
        }
    }

    async runComponentNMA() {
        const engine = this.advancedMetaEngine || (typeof AdvancedMetaAnalysis !== 'undefined' ? new AdvancedMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('Component NMA engine not available', 'error');
            return;
        }

        try {
            const nmaData = this.getNMADataFromInputs();
            if (!nmaData || nmaData.length < 2) {
                this.app.showToast('Enter NMA study-arm rows first', 'warning');
                return;
            }

            const byStudy = {};
            nmaData.forEach(row => {
                const key = row.study || 'Study';
                if (!byStudy[key]) byStudy[key] = [];
                byStudy[key].push(row);
            });

            let cnmaData = [];
            Object.values(byStudy).forEach(arms => {
                if (arms.length < 2) return;
                const base = arms[0];
                for (let i = 1; i < arms.length; i++) {
                    const comp = arms[i];
                    cnmaData.push({
                        yi: comp.effect - base.effect,
                        vi: Math.pow(comp.se, 2) + Math.pow(base.se, 2),
                        treat1Components: this.parseComponentLabel(base.treatment),
                        treat2Components: this.parseComponentLabel(comp.treatment)
                    });
                }
            });

            if (cnmaData.length === 0 && nmaData.length >= 2) {
                const base = nmaData[0];
                for (let i = 1; i < nmaData.length; i++) {
                    const comp = nmaData[i];
                    cnmaData.push({
                        yi: comp.effect - base.effect,
                        vi: Math.pow(comp.se, 2) + Math.pow(base.se, 2),
                        treat1Components: this.parseComponentLabel(base.treatment),
                        treat2Components: this.parseComponentLabel(comp.treatment)
                    });
                }
            }

            if (cnmaData.length === 0) {
                this.app.showToast('Need at least one study with two treatment arms for Component NMA', 'warning');
                return;
            }

            const model = document.getElementById('cnma-model')?.value || 'additive';
            const results = engine.componentNMA(cnmaData, { model });
            this.cnmaLatest = results;
            this.showPanel('cnma-results', true);

            const effectsBody = document.getElementById('cnma-effects-body');
            if (effectsBody) {
                const totalContribution = Math.max(
                    1e-12,
                    (results.componentEffects || []).reduce((sum, effect) => sum + Math.abs(effect.estimate), 0)
                );
                effectsBody.innerHTML = (results.componentEffects || []).map(effect => `
                    <tr>
                        <td>${this.escapeHTML(effect.component)}</td>
                        <td>${this.formatNum(effect.estimate)}</td>
                        <td>${this.formatNum(effect.ci[0])} to ${this.formatNum(effect.ci[1])}</td>
                        <td>${this.formatNum(effect.pValue, 4)}</td>
                        <td>${this.formatNum(100 * Math.abs(effect.estimate) / totalContribution, 1)}%</td>
                    </tr>
                `).join('');
            }

            const compSelect = document.getElementById('cnma-components-select');
            if (compSelect) {
                compSelect.innerHTML = '';
                (results.components || []).forEach(component => {
                    const label = document.createElement('label');
                    label.style.display = 'inline-flex';
                    label.style.alignItems = 'center';
                    label.style.gap = '6px';
                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.value = component;
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(` ${component}`));
                    compSelect.appendChild(label);
                });
            }

            const predictBtn = document.getElementById('btn-predict-cnma');
            if (predictBtn) {
                predictBtn.onclick = () => {
                    const selected = Array.from(document.querySelectorAll('#cnma-components-select input:checked'))
                        .map(el => el.value);
                    const pred = results.predictCombination(selected);
                    this.showPanel('cnma-prediction', true);
                    this.setText('cnma-pred-effect', this.formatNum(pred.effect));
                    this.setText('cnma-pred-ci', `(${this.formatNum(pred.ci[0])} to ${this.formatNum(pred.ci[1])})`);
                };
            }

            this.app.showToast('Component NMA completed', 'success');
        } catch (e) {
            this.app.showToast(`Component NMA failed: ${e.message}`, 'error');
        }
    }

    async runIPDMetaAnalysis() {
        const engine = this.ipdEngine || (typeof IPDMetaAnalysis !== 'undefined' ? new IPDMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('IPD meta-analysis engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('ipd-data-input');
            if (rows.length < 4) {
                this.app.showToast('Enter at least 4 IPD rows', 'warning');
                return;
            }

            const method = document.getElementById('ipd-method')?.value || 'one-stage';
            const outcomeType = document.getElementById('ipd-outcome')?.value || 'continuous';
            const randomSlopes = (document.getElementById('ipd-random-slopes')?.value || 'no') === 'yes';
            const covariates = this.parseCovariateList('ipd-covariates');

            const treatmentValues = [...new Set(rows.map(r => this.getRowValue(r, ['treatment', 'arm', 'group'], '0')))];
            const treatmentMap = new Map();
            treatmentValues.forEach((value, idx) => {
                const numeric = this.parseNumber(value, NaN);
                if (Number.isFinite(numeric) && method !== 'ipd-nma') {
                    treatmentMap.set(value, numeric > 0 ? 1 : 0);
                } else if (method === 'ipd-nma') {
                    treatmentMap.set(value, String(value));
                } else {
                    treatmentMap.set(value, idx === 0 ? 0 : 1);
                }
            });

            const covariateMaps = {};
            covariates.forEach(cov => {
                const values = [...new Set(rows.map(r => this.getRowValue(r, [cov], '')))];
                const allNumeric = values.every(v => Number.isFinite(this.parseNumber(v, NaN)));
                if (!allNumeric) {
                    covariateMaps[cov] = new Map(values.map((v, i) => [v, i]));
                }
            });

            const ipdData = rows.map((row, idx) => {
                const study = this.getRowValue(row, ['study', 'trial', 'study_id'], `Study${idx + 1}`);
                const patient = this.getRowValue(row, ['patient', 'patient_id', 'id'], String(idx + 1));
                const treatmentRaw = this.getRowValue(row, ['treatment', 'arm', 'group'], '0');
                const treatment = treatmentMap.get(treatmentRaw);
                let outcome;

                if (outcomeType === 'survival') {
                    const time = this.parseNumber(this.getRowValue(row, ['time', 'followup', 'duration', 'outcome'], ''), NaN);
                    const event = this.parseBooleanLike(this.getRowValue(row, ['event', 'status', 'outcome_event'], ''), 0);
                    outcome = { time, event };
                } else if (outcomeType === 'binary') {
                    outcome = this.parseBooleanLike(this.getRowValue(row, ['outcome', 'y', 'response'], ''), null);
                } else {
                    outcome = this.parseNumber(this.getRowValue(row, ['outcome', 'y', 'value'], ''), NaN);
                }

                const parsed = { study, patient, treatment, outcome };
                covariates.forEach(cov => {
                    const raw = this.getRowValue(row, [cov], '');
                    parsed[cov] = covariateMaps[cov] ? (covariateMaps[cov].get(raw) || 0) : this.parseNumber(raw, 0);
                });
                return parsed;
            }).filter(d => {
                if (method !== 'ipd-nma' && !Number.isFinite(d.treatment)) return false;
                if (outcomeType === 'survival') return Number.isFinite(d.outcome.time) && (d.outcome.event === 0 || d.outcome.event === 1);
                if (outcomeType === 'binary') return d.outcome === 0 || d.outcome === 1;
                return Number.isFinite(d.outcome);
            });

            if (ipdData.length < 4) {
                this.app.showToast('Could not parse enough valid IPD rows for the selected outcome type', 'warning');
                return;
            }

            const options = {
                outcome: outcomeType,
                treatmentVar: 'treatment',
                outcomeVar: 'outcome',
                studyVar: 'study',
                covariates,
                randomSlopes
            };
            let results;
            if (method === 'two-stage') {
                results = engine.twoStage(ipdData, options);
            } else if (method === 'ipd-nma') {
                results = engine.ipdNMA(ipdData, options);
            } else {
                results = engine.oneStage(ipdData, options);
            }

            const container = document.getElementById('ipd-results');
            if (container) {
                if (results.treatmentEffect) {
                    container.innerHTML = `
                        <div class="result-highlight">
                            <label>Treatment Effect (${this.escapeHTML(method)})</label>
                            <div class="value">${this.formatNum(results.treatmentEffect.estimate)}</div>
                            <div class="unit">${this.formatNum(results.treatmentEffect.ci95?.[0])} to ${this.formatNum(results.treatmentEffect.ci95?.[1])}</div>
                        </div>
                        <p style="margin-top: 12px;">Patients: ${this.escapeHTML(results.nPatients)} | Studies: ${this.escapeHTML(results.nStudies)}</p>
                    `;
                } else if (results.treatmentEffects) {
                    container.innerHTML = `
                        <div class="result-highlight">
                            <label>IPD-NMA Completed</label>
                            <div class="value">${this.escapeHTML(results.nTreatments || 0)} treatments</div>
                            <div class="unit">${this.escapeHTML(results.nStudies || 0)} studies, ${this.escapeHTML(results.nPatients || 0)} patients</div>
                        </div>
                    `;
                } else {
                    container.textContent = 'IPD analysis completed.';
                }
            }

            this.app.showToast(`IPD ${method} analysis completed`, 'success');
        } catch (e) {
            this.app.showToast(`IPD analysis failed: ${e.message}`, 'error');
        }
    }

    async runDTAMetaAnalysis() {
        const engine = this.dtaEngine || (typeof DTAMetaAnalysis !== 'undefined' ? new DTAMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('DTA meta-analysis engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('dta-data-input');
            const data = rows.map((row, idx) => ({
                id: this.getRowValue(row, ['study', 'id'], `Study${idx + 1}`),
                test: this.getRowValue(row, ['test', 'index_test', 'method'], 'IndexTest'),
                tp: this.parseNumber(this.getRowValue(row, ['tp', 'true_positive'], ''), NaN),
                fp: this.parseNumber(this.getRowValue(row, ['fp', 'false_positive'], ''), NaN),
                fn: this.parseNumber(this.getRowValue(row, ['fn', 'false_negative'], ''), NaN),
                tn: this.parseNumber(this.getRowValue(row, ['tn', 'true_negative'], ''), NaN)
            })).filter(item =>
                Number.isFinite(item.tp) && Number.isFinite(item.fp) &&
                Number.isFinite(item.fn) && Number.isFinite(item.tn)
            );

            if (data.length < 2) {
                this.app.showToast('Enter at least two DTA studies with TP/FP/FN/TN', 'warning');
                return;
            }

            const model = document.getElementById('dta-model')?.value || 'bivariate';
            const referenceTest = String(document.getElementById('dta-reference')?.value || '').trim();
            let results;
            if (model === 'hsroc') {
                results = engine.hsroc(data);
            } else if (model === 'network-dta') {
                results = engine.networkDTA(data, { referenceTest: referenceTest || null });
            } else {
                results = engine.bivariate(data);
            }

            if (model === 'network-dta') {
                const top = (results.rankings || [])[0];
                this.setText('dta-sensitivity', this.formatNum(top?.sensitivity, 3));
                this.setText('dta-specificity', this.formatNum(top?.specificity, 3));
                this.setText('dta-auc', this.formatNum(top?.auc, 3));
                const summaryPoints = (results.rankings || []).map(r => ({
                    sensitivity: r.sensitivity,
                    specificity: r.specificity
                }));
                this.renderDTASROCChart(summaryPoints, top ? {
                    sensitivity: top.sensitivity,
                    specificity: top.specificity
                } : null);
            } else if (model === 'hsroc') {
                this.setText('dta-sensitivity', this.formatNum(results.summaryPoint?.sensitivity, 3));
                this.setText('dta-specificity', this.formatNum(results.summaryPoint?.specificity, 3));
                this.setText('dta-auc', this.formatNum(results.srocCurve?.auc, 3));
                this.renderDTASROCChart(
                    data.map(study => ({
                        sensitivity: study.tp / Math.max(study.tp + study.fn, 1),
                        specificity: study.tn / Math.max(study.tn + study.fp, 1)
                    })),
                    results.summaryPoint
                );
            } else {
                this.setText('dta-sensitivity', this.formatNum(results.pooledEstimates?.sensitivity?.estimate, 3));
                this.setText('dta-specificity', this.formatNum(results.pooledEstimates?.specificity?.estimate, 3));
                this.setText('dta-auc', this.formatNum(results.sroc?.auc, 3));
                this.renderDTASROCChart(results.studyData || [], {
                    sensitivity: results.pooledEstimates?.sensitivity?.estimate,
                    specificity: results.pooledEstimates?.specificity?.estimate
                });
            }

            this.app.showToast(`DTA ${model} analysis completed`, 'success');
        } catch (e) {
            this.app.showToast(`DTA analysis failed: ${e.message}`, 'error');
        }
    }

    async runAdvancedPubBias() {
        const engine = this.advancedPbEngine || (typeof AdvancedPublicationBias !== 'undefined' ? new AdvancedPublicationBias() : null);
        if (!engine) {
            this.app.showToast('Advanced publication-bias engine not available', 'error');
            return;
        }

        try {
            const maData = this.getMADataFromInputs();
            if (!maData || maData.length < 3) {
                this.app.showToast('Enter at least 3 Pairwise MA studies before running advanced publication-bias methods', 'warning');
                return;
            }

            const data = maData.map(study => ({ effect: study.yi, se: study.sei }));
            const method = document.getElementById('pb-method')?.value || 'copas';
            const cutoffsRaw = String(document.getElementById('pb-cutoffs')?.value || '0.05,0.10');
            const cutoffs = cutoffsRaw.split(',').map(v => this.parseNumber(v.trim(), NaN)).filter(Number.isFinite);

            let results;
            let unadjusted = this.computeUnadjustedFromEffects(data);
            let adjusted = NaN;
            let chartLabels = [];
            let chartValues = [];
            let chartLabel = 'Sensitivity';
            let details = '';

            if (method === 'robma') {
                results = engine.robma(data);
                adjusted = results.modelAveragedEstimate?.effect;
                chartLabels = (results.modelWeights || []).map(weight => weight.model);
                chartValues = (results.modelWeights || []).map(weight => weight.weight);
                chartLabel = 'Posterior Model Weight';
                details = `
                    <p><strong>P(H1):</strong> ${this.formatNum(results.posteriorProbabilities?.H1, 3)}</p>
                    <p><strong>P(Publication Bias):</strong> ${this.formatNum(results.posteriorProbabilities?.publicationBias, 3)}</p>
                    <p><strong>BF(effect):</strong> ${this.formatNum(results.bayesFactor?.effect, 3)}</p>
                `;
            } else if (method === 'andrews-kasy') {
                results = engine.andrewsKasy(data, { cutoffs: cutoffs.length > 0 ? cutoffs : [0.05, 0.10] });
                adjusted = results.adjustedEstimate;
                chartLabels = (results.relativePublicationProbabilities || []).map(prob => `<=${prob.pValueCutoff}`);
                chartValues = (results.relativePublicationProbabilities || []).map(prob => prob.relativeWeight);
                chartLabel = 'Relative Publication Weight';
                details = `
                    <p><strong>Adjusted SE:</strong> ${this.formatNum(results.adjustedSE, 4)}</p>
                    <p><strong>Robust CI:</strong> ${this.formatNum(results.robustConfidenceInterval?.[0])} to ${this.formatNum(results.robustConfidenceInterval?.[1])}</p>
                `;
            } else if (method === 'mathur-vanderweele') {
                results = engine.mathurVanderWeele(data);
                unadjusted = results.standardEstimate?.effect;
                adjusted = results.sensitivityAnalysis?.combinedAdjustment;
                chartLabels = (results.sensitivityContour || []).map(point => this.formatNum(point.selectionRatio, 2));
                chartValues = (results.sensitivityContour || []).map(point => point.confoundingBias);
                chartLabel = 'Confounding Bias Needed';
                details = `
                    <p><strong>E-value:</strong> ${this.formatNum(results.eValue?.point, 3)}</p>
                    <p><strong>Interpretation:</strong> ${this.escapeHTML(results.eValue?.interpretation || '')}</p>
                `;
            } else {
                results = engine.copasModel(data);
                adjusted = results.adjustedEstimate?.effect;
                unadjusted = results.unadjustedEstimate?.effect;
                chartLabels = (results.sensitivityAnalysis || []).map(item => this.formatNum(item.severity, 2));
                chartValues = (results.sensitivityAnalysis || []).map(item => item.mu);
                chartLabel = 'Adjusted Effect vs Selection Severity';
                details = `
                    <p><strong>gamma0:</strong> ${this.formatNum(results.adjustedEstimate?.gamma0, 3)}</p>
                    <p><strong>gamma1:</strong> ${this.formatNum(results.adjustedEstimate?.gamma1, 3)}</p>
                    <p>${this.escapeHTML(results.interpretation || '')}</p>
                `;
            }

            this.setText('pb-unadjusted', this.formatNum(unadjusted, 3));
            this.setText('pb-adjusted', this.formatNum(adjusted, 3));
            const detailsDiv = document.getElementById('pb-detailed-results');
            if (detailsDiv) detailsDiv.innerHTML = details;
            if (chartLabels.length > 0 && chartValues.length > 0) {
                this.renderPBSensitivityChart(chartLabels, chartValues, chartLabel);
            }

            this.app.showToast(`Advanced publication-bias method (${method}) completed`, 'success');
        } catch (e) {
            this.app.showToast(`Advanced publication-bias analysis failed: ${e.message}`, 'error');
        }
    }

    async runFabricationDetection() {
        const engine = this.fabricationEngine || (typeof DataFabricationDetection !== 'undefined' ? new DataFabricationDetection() : null);
        if (!engine) {
            this.app.showToast('Fabrication-detection engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('fabrication-data-input');
            const data = rows.map((row, idx) => ({
                id: this.getRowValue(row, ['study', 'id'], `Study${idx + 1}`),
                n: this.parseNumber(this.getRowValue(row, ['n', 'sample_size'], ''), NaN),
                mean: this.parseNumber(this.getRowValue(row, ['mean'], ''), NaN),
                sd: this.parseNumber(this.getRowValue(row, ['sd', 'std_dev', 'standard_deviation'], ''), NaN),
                t: this.parseNumber(this.getRowValue(row, ['t'], ''), NaN),
                df: this.parseNumber(this.getRowValue(row, ['df'], ''), NaN),
                p: this.parseNumber(this.getRowValue(row, ['p', 'p_value'], ''), NaN),
                F: this.parseNumber(this.getRowValue(row, ['f'], ''), NaN),
                df1: this.parseNumber(this.getRowValue(row, ['df1'], ''), NaN),
                df2: this.parseNumber(this.getRowValue(row, ['df2'], ''), NaN),
                d: this.parseNumber(this.getRowValue(row, ['d'], ''), NaN),
                n1: this.parseNumber(this.getRowValue(row, ['n1'], ''), NaN),
                n2: this.parseNumber(this.getRowValue(row, ['n2'], ''), NaN)
            })).filter(item =>
                Number.isFinite(item.n) &&
                Number.isFinite(item.mean) &&
                Number.isFinite(item.sd)
            );

            if (data.length === 0) {
                this.app.showToast('Enter fabrication-test data with study,n,mean,sd', 'warning');
                return;
            }

            const decimals = parseInt(document.getElementById('fab-decimals')?.value || '2', 10);
            const runGrim = document.getElementById('test-grim')?.checked;
            const runGrimmer = document.getElementById('test-grimmer')?.checked;
            const runSprite = document.getElementById('test-sprite')?.checked;
            const runStatcheck = document.getElementById('test-statcheck')?.checked;

            const grim = runGrim ? engine.grim(data, { decimals }) : null;
            const grimmer = runGrimmer ? engine.grimmer(data, { decimals }) : null;
            const sprite = runSprite ? engine.sprite(data) : null;
            const statcheck = runStatcheck ? engine.statcheck(data) : null;

            const byStudy = {};
            data.forEach(study => {
                byStudy[study.id] = {
                    study: study.id,
                    grim: '-',
                    grimmer: '-',
                    sprite: '-',
                    statcheck: '-'
                };
            });

            if (grim) grim.results.forEach(result => { byStudy[result.study].grim = result.flag; });
            if (grimmer) grimmer.results.forEach(result => { byStudy[result.study].grimmer = result.flag; });
            if (sprite) sprite.results.forEach(result => { byStudy[result.study].sprite = result.flag; });
            if (statcheck) statcheck.results.forEach(result => { byStudy[result.study].statcheck = result.flag; });

            const tableBody = document.getElementById('fabrication-table-body');
            if (tableBody) {
                tableBody.innerHTML = Object.values(byStudy).map(row => {
                    const failed = [row.grim, row.grimmer, row.sprite, row.statcheck].some(flag =>
                        flag && flag !== '-' && flag !== 'OK' && flag !== 'POSSIBLE'
                    );
                    return `
                        <tr>
                            <td style="padding: 12px;">${this.escapeHTML(row.study)}</td>
                            <td style="padding: 12px; text-align: center;">${this.escapeHTML(row.grim)}</td>
                            <td style="padding: 12px; text-align: center;">${this.escapeHTML(row.grimmer)}</td>
                            <td style="padding: 12px; text-align: center; font-weight: 600; color: ${failed ? '#dc2626' : '#16a34a'};">
                                ${failed ? 'FLAG' : 'OK'}
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            const flagged = Object.values(byStudy).filter(row =>
                [row.grim, row.grimmer, row.sprite, row.statcheck].some(flag =>
                    flag && flag !== '-' && flag !== 'OK' && flag !== 'POSSIBLE'
                )
            ).length;
            this.app.showToast(`Fabrication screening completed (${flagged} flagged studies)`, flagged > 0 ? 'warning' : 'success');
        } catch (e) {
            this.app.showToast(`Fabrication detection failed: ${e.message}`, 'error');
        }
    }

    async runMRMetaAnalysis() {
        const engine = this.mrEngine || (typeof MendelianRandomizationMA !== 'undefined' ? new MendelianRandomizationMA() : null);
        if (!engine) {
            this.app.showToast('MR engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('mr-data-input');
            const data = rows.map(row => ({
                snp: this.getRowValue(row, ['snp', 'variant', 'id'], ''),
                betaExposure: this.parseNumber(this.getRowValue(row, ['beta_exposure', 'betaexposure', 'bx'], ''), NaN),
                seBetaExposure: this.parseNumber(this.getRowValue(row, ['se_exposure', 'sebetaexposure', 'se_bx'], ''), NaN),
                betaOutcome: this.parseNumber(this.getRowValue(row, ['beta_outcome', 'betaoutcome', 'by'], ''), NaN),
                seBetaOutcome: this.parseNumber(this.getRowValue(row, ['se_outcome', 'sebetaoutcome', 'se_by'], ''), NaN)
            })).filter(item =>
                Number.isFinite(item.betaExposure) &&
                Number.isFinite(item.seBetaExposure) &&
                Number.isFinite(item.betaOutcome) &&
                Number.isFinite(item.seBetaOutcome) &&
                Math.abs(item.betaExposure) > 1e-12
            );

            if (data.length < 3) {
                this.app.showToast('Enter at least 3 valid SNP rows for MR analysis', 'warning');
                return;
            }

            const method = document.getElementById('mr-method')?.value || 'ivw';
            const effectType = document.getElementById('mr-effect')?.value || 'random';
            let slope = 0;
            let intercept = 0;
            const outputRows = [];

            if (method === 'mr-egger') {
                const result = engine.mrEgger(data);
                slope = result.causalEstimate?.estimate || 0;
                intercept = result.pleiotropyTest?.intercept || 0;
                outputRows.push({
                    method: 'MR-Egger (causal)',
                    estimate: result.causalEstimate?.estimate,
                    ci: result.causalEstimate?.ci95,
                    pValue: result.causalEstimate?.pValue
                });
                outputRows.push({
                    method: 'MR-Egger intercept',
                    estimate: result.pleiotropyTest?.intercept,
                    ci: [
                        (result.pleiotropyTest?.intercept || 0) - 1.96 * (result.pleiotropyTest?.se || 0),
                        (result.pleiotropyTest?.intercept || 0) + 1.96 * (result.pleiotropyTest?.se || 0)
                    ],
                    pValue: result.pleiotropyTest?.pValue
                });
            } else if (method === 'weighted-median') {
                const result = engine.weightedMedian(data, { bootstrapIterations: 500 });
                slope = result.estimate || 0;
                outputRows.push({
                    method: 'Weighted median',
                    estimate: result.estimate,
                    ci: result.ci95,
                    pValue: result.pValue
                });
            } else if (method === 'mr-presso') {
                const result = engine.mrPresso(data, { nDistributions: 500 });
                slope = result.correctedEstimate?.estimate || 0;
                outputRows.push({
                    method: 'MR-PRESSO (corrected)',
                    estimate: result.correctedEstimate?.estimate,
                    ci: result.correctedEstimate?.ci95,
                    pValue: result.correctedEstimate?.pValue
                });
            } else {
                const result = engine.ivw(data, { fixedEffects: effectType === 'fixed' });
                slope = result.estimate || 0;
                outputRows.push({
                    method: result.method || 'IVW',
                    estimate: result.estimate,
                    ci: result.ci95,
                    pValue: result.pValue
                });
            }

            const tbody = document.getElementById('mr-results-table');
            if (tbody) {
                tbody.innerHTML = outputRows.map(row => `
                    <tr>
                        <td style="padding: 12px;">${this.escapeHTML(row.method)}</td>
                        <td style="padding: 12px; text-align: center;">${this.formatNum(row.estimate)}</td>
                        <td style="padding: 12px; text-align: center;">${this.formatNum(row.ci?.[0])} to ${this.formatNum(row.ci?.[1])}</td>
                        <td style="padding: 12px; text-align: center;">${this.formatNum(row.pValue, 4)}</td>
                    </tr>
                `).join('');
            }

            this.renderMRScatterChart(data, slope, intercept);
            this.app.showToast(`MR analysis (${method}) completed`, 'success');
        } catch (e) {
            this.app.showToast(`MR analysis failed: ${e.message}`, 'error');
        }
    }

    async runHistoricalMA() {
        const engine = this.historicalEngine || (typeof HistoricalBorrowing !== 'undefined' ? new HistoricalBorrowing() : null);
        if (!engine) {
            this.app.showToast('Historical borrowing engine not available', 'error');
            return;
        }

        try {
            const method = document.getElementById('historical-method')?.value || 'power-prior';
            const currentData = {
                n: this.parseNumber(document.getElementById('current-n')?.value, NaN),
                mean: this.parseNumber(document.getElementById('current-mean')?.value, NaN),
                sd: this.parseNumber(document.getElementById('current-sd')?.value, NaN)
            };
            const historicalData = {
                n: this.parseNumber(document.getElementById('historical-n')?.value, NaN),
                mean: this.parseNumber(document.getElementById('historical-mean')?.value, NaN),
                sd: this.parseNumber(document.getElementById('historical-sd')?.value, NaN)
            };

            if (!Number.isFinite(currentData.n) || !Number.isFinite(currentData.mean) || !Number.isFinite(currentData.sd) ||
                !Number.isFinite(historicalData.n) || !Number.isFinite(historicalData.mean) || !Number.isFinite(historicalData.sd)) {
                this.app.showToast('Please enter valid current and historical summary statistics', 'warning');
                return;
            }

            let result;
            if (method === 'map' || method === 'robust-map') {
                const h = historicalData;
                const historicalStudies = [
                    { mean: h.mean - 0.15 * h.sd, sd: h.sd * 1.05, n: Math.max(20, Math.round(h.n * 0.7)) },
                    { mean: h.mean, sd: h.sd, n: h.n },
                    { mean: h.mean + 0.15 * h.sd, sd: h.sd * 0.95, n: Math.max(20, Math.round(h.n * 1.2)) }
                ];
                result = engine.mapPrior(currentData, historicalStudies, {
                    robustWeight: method === 'robust-map' ? 0.2 : 0
                });
            } else if (method === 'commensurate') {
                result = engine.commensuratePrior(currentData, historicalData);
            } else {
                const a0 = this.parseNumber(document.getElementById('historical-a0')?.value, 0.5);
                result = engine.powerPrior(currentData, historicalData, { a0: Math.max(0, Math.min(1, a0)) });
            }

            this.setText('hist-current-only', this.formatNum(currentData.mean, 3));
            this.setText('hist-with-borrowing', this.formatNum(result.posteriorEstimate?.mean, 3));
            const effectiveN = result.effectiveBorrowing ??
                result.borrowingMetrics?.effectiveSampleSize ??
                result.mapPrior?.effectiveN;
            this.setText('hist-effective-n', this.formatNum(effectiveN, 1));

            this.app.showToast(`Historical borrowing (${method}) completed`, 'success');
        } catch (e) {
            this.app.showToast(`Historical borrowing failed: ${e.message}`, 'error');
        }
    }

    async runSurvivalMA() {
        const engine = this.survivalMetaEngine || (typeof SurvivalMetaAnalysis !== 'undefined' ? new SurvivalMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('Survival meta-analysis engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('survival-data-input');
            const grouped = {};
            rows.forEach((row, idx) => {
                const study = this.getRowValue(row, ['study', 'trial', 'id'], `Study${idx + 1}`);
                const treatment = this.getRowValue(row, ['treatment', 'arm'], 'Treatment');
                const time = this.parseNumber(this.getRowValue(row, ['time', 't'], ''), NaN);
                const cumHazard = this.parseNumber(this.getRowValue(row, ['cumhazard', 'cum_hazard', 'h'], ''), NaN);
                if (!Number.isFinite(time) || !Number.isFinite(cumHazard) || time < 0) return;
                const key = `${study}__${treatment}`;
                if (!grouped[key]) grouped[key] = { id: study, treatment, rows: [] };
                grouped[key].rows.push({ time, cumHazard });
            });

            const data = Object.values(grouped).map(group => {
                group.rows.sort((a, b) => a.time - b.time);
                const times = group.rows.map(row => row.time);
                const cumHazard = group.rows.map(row => row.cumHazard);
                const events = cumHazard.map((hazard, idx) => (idx === 0 ? 0 : (hazard > cumHazard[idx - 1] ? 1 : 0)));
                return { id: group.id, treatment: group.treatment, times, cumHazard, events };
            }).filter(entry => entry.times.length >= 2);

            if (data.length === 0) {
                this.app.showToast('Provide survival data with columns: study,treatment,time,cumHazard', 'warning');
                return;
            }

            const approach = document.getElementById('survival-approach')?.value || 'fp';
            const complexity = parseInt(document.getElementById('survival-complexity')?.value || '2', 10);
            if (approach === 'royston-parmar') {
                this.survivalMaResults = engine.roystonParmar(data, { nKnots: Math.max(1, complexity) });
            } else {
                this.survivalMaResults = engine.fractionalPolynomial(data, { maxDegree: Math.max(1, complexity) });
            }

            const curves = data.map(entry => ({
                label: `${entry.treatment} (${entry.id})`,
                points: entry.times.map((time, idx) => ({
                    time,
                    survival: Math.exp(-Math.max(0, entry.cumHazard[idx]))
                }))
            }));
            this.renderSurvivalMetaChart(curves);

            this.app.showToast(`Survival MA (${approach}) completed`, 'success');
        } catch (e) {
            this.app.showToast(`Survival MA failed: ${e.message}`, 'error');
        }
    }

    async runThresholdAnalysis() {
        const engine = this.thresholdEngine || (typeof ThresholdAnalysis !== 'undefined' ? new ThresholdAnalysis() : null);
        if (!engine) {
            this.app.showToast('Threshold analysis engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('threshold-data-input');
            const context = document.getElementById('threshold-context')?.value || 'nma';
            const tbody = document.getElementById('threshold-results-table');
            if (!tbody) return;

            if (context === 'cea') {
                const strategies = {};
                rows.forEach((row, idx) => {
                    const name = this.getRowValue(row, ['strategy', 'treatment', 'name'], `Strategy${idx + 1}`);
                    const costs = this.parseNumber(this.getRowValue(row, ['cost', 'costs'], ''), NaN);
                    const qalys = this.parseNumber(this.getRowValue(row, ['qaly', 'qalys', 'effect'], ''), NaN);
                    if (Number.isFinite(costs) && Number.isFinite(qalys)) {
                        strategies[name] = { costs, qalys };
                    }
                });

                if (Object.keys(strategies).length < 2) {
                    this.app.showToast('For CEA threshold analysis, provide at least two rows with treatment,cost,qaly', 'warning');
                    return;
                }

                const result = engine.voiThreshold({ strategies }, { willingnessToPay: 30000 });
                tbody.innerHTML = (result.thresholdWTP || []).map(point => `
                    <tr>
                        <td style="padding: 12px;">${this.escapeHTML(point.best)}</td>
                        <td style="padding: 12px; text-align: center;">NMB switch</td>
                        <td style="padding: 12px; text-align: center;">WTP ${this.formatNum(point.wtp, 0)}</td>
                        <td style="padding: 12px; text-align: center;">-</td>
                    </tr>
                `).join('');
                this.app.showToast('CEA threshold analysis completed', 'success');
            } else {
                const effects = {};
                rows.forEach((row, idx) => {
                    const name = this.getRowValue(row, ['treatment', 'name', 'strategy'], `Treatment${idx + 1}`);
                    const estimate = this.parseNumber(this.getRowValue(row, ['effect', 'estimate'], ''), NaN);
                    const se = this.parseNumber(this.getRowValue(row, ['se', 'std_error'], ''), NaN);
                    if (Number.isFinite(estimate) && Number.isFinite(se) && se > 0) {
                        effects[name] = { estimate, se };
                    }
                });

                if (Object.keys(effects).length < 2) {
                    this.app.showToast('Provide at least two treatment rows with treatment,effect,se', 'warning');
                    return;
                }

                const criterion = document.getElementById('threshold-criterion')?.value || 'best';
                const result = engine.nmaThreshold({ effects }, { decisionCriterion: criterion });
                tbody.innerHTML = (result.thresholds || []).map(row => {
                    const robust = (result.robustness || []).find(item => item.treatment === row.treatment);
                    return `
                        <tr>
                            <td style="padding: 12px;">${this.escapeHTML(row.treatment)}</td>
                            <td style="padding: 12px; text-align: center;">${this.formatNum(row.currentEffect)}</td>
                            <td style="padding: 12px; text-align: center;">${this.formatNum(row.threshold)}</td>
                            <td style="padding: 12px; text-align: center;">${this.formatNum(robust?.robustnessRatio, 2)}</td>
                        </tr>
                    `;
                }).join('');
                this.app.showToast('NMA threshold analysis completed', 'success');
            }
        } catch (e) {
            this.app.showToast(`Threshold analysis failed: ${e.message}`, 'error');
        }
    }

    async runFederatedMA() {
        const engine = this.federatedEngine || (typeof FederatedMetaAnalysis !== 'undefined' ? new FederatedMetaAnalysis() : null);
        if (!engine) {
            this.app.showToast('Federated meta-analysis engine not available', 'error');
            return;
        }

        try {
            const rows = this.parseCSVTextArea('federated-data-input');
            const siteSummaries = rows.map((row, idx) => ({
                siteId: this.getRowValue(row, ['site', 'siteid', 'hospital', 'center'], `Site${idx + 1}`),
                n: this.parseNumber(this.getRowValue(row, ['n', 'sample_size'], ''), NaN),
                mean: this.parseNumber(this.getRowValue(row, ['mean', 'effect'], ''), NaN),
                variance: this.parseNumber(this.getRowValue(row, ['variance', 'var'], ''), NaN)
            })).filter(item =>
                Number.isFinite(item.n) &&
                Number.isFinite(item.mean) &&
                Number.isFinite(item.variance) &&
                item.n > 0 &&
                item.variance > 0
            );

            if (siteSummaries.length < 2) {
                this.app.showToast('Provide at least two site summaries with site,n,mean,variance', 'warning');
                return;
            }

            const method = document.getElementById('federated-method')?.value || 'distributed';
            const epsilon = this.parseNumber(document.getElementById('federated-epsilon')?.value, 1.0);
            let result;
            if (method === 'differential-privacy') {
                result = engine.differentiallyPrivateMA(siteSummaries, { epsilon: Math.max(0.1, epsilon) });
            } else {
                result = engine.distributedMA(siteSummaries);
            }

            this.setText('fed-estimate', this.formatNum(result.pooledEstimate?.effect));
            this.setText('fed-ci', `95% CI: ${this.formatNum(result.pooledEstimate?.ci95?.[0])} to ${this.formatNum(result.pooledEstimate?.ci95?.[1])}`);
            this.setText('fed-privacy', result.privacyGuarantee || 'Summary statistics only');
            this.setText('fed-privacy-desc', result.dataShared || result.interpretation || 'Privacy-preserving evidence synthesis');

            const contributions = result.siteContributions || siteSummaries.map(site => ({
                siteId: site.siteId,
                weight: 1 / (site.variance / site.n)
            }));
            const totalWeight = contributions.reduce((sum, contrib) => sum + contrib.weight, 0);
            const normalized = contributions.map(contrib => ({
                siteId: contrib.siteId,
                weight: totalWeight > 0 ? contrib.weight / totalWeight : 0
            }));
            this.renderFederatedWeightsChart(normalized);

            this.app.showToast(`Federated MA (${method}) completed`, 'success');
        } catch (e) {
            this.app.showToast(`Federated MA failed: ${e.message}`, 'error');
        }
    }

    showUnavailableMethod(methodName) {
        this.app.showToast(`${methodName} is not implemented in this build yet`, 'warning');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for main app to initialize
    setTimeout(() => {
        // Check both window.app and window.htaApp for compatibility
        const app = window.app || window.htaApp;
        if (app) {
            window.advancedUI = new AdvancedFeaturesUI(app);
        }
    }, 100);
});

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedFeaturesUI };
}

if (typeof window !== 'undefined') {
    window.AdvancedFeaturesUI = AdvancedFeaturesUI;
}
