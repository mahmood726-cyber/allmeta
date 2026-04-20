/**
 * HTA Artifact Standard - Main Application
 * Reviewer Mode UI Controller
 */

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

class HTAApp {
    constructor() {
        this.project = null;
        this.results = null;
        this.psaResults = null;
        this.dsaResults = null;
        this.evpiResults = null;
        this.validationResults = null;
        this.currentSection = 'summary';
        this.charts = {};

        this.validator = new HTAValidator();

        // Engine registration
        this.engines = {
            'markov_cohort': new MarkovEngine(),
            'partitioned_survival': typeof PartitionedSurvivalEngine !== 'undefined' ? new PartitionedSurvivalEngine() : null,
            'microsimulation': typeof MicrosimulationEngine !== 'undefined' ? new MicrosimulationEngine() : null,
            'des': typeof DESEngine !== 'undefined' ? new DESEngine() : null
        };
        // Filter out unavailable engines
        this.engines = Object.fromEntries(Object.entries(this.engines).filter(([_, v]) => v !== null));


        this.psaEngine = new PSAEngine();
        this.dsaEngine = typeof DSAEngine !== 'undefined' ? new DSAEngine() : null;
        this.evpiCalculator = typeof EVPICalculator !== 'undefined' ? new EVPICalculator() : null;
        this.auditLogger = typeof getAuditLogger !== 'undefined' ? getAuditLogger() : null;

        this.init();
    }

    init() {
        this.setupDropZone();
        this.setupNavigation();
        this.setupButtons();
        this.setupTabs();
    }

    escapeHTML(value) {
        if (typeof HTMLSanitizer !== 'undefined' && HTMLSanitizer && typeof HTMLSanitizer.escapeHTML === 'function') {
            return HTMLSanitizer.escapeHTML(value ?? '');
        }
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    setSafeInnerHTML(element, html) {
        if (!element) return;
        if (typeof HTMLSanitizer !== 'undefined' && HTMLSanitizer && typeof HTMLSanitizer.setInnerHTML === 'function') {
            HTMLSanitizer.setInnerHTML(element, html);
            return;
        }
        element.innerHTML = html;
    }

    // ============ DROP ZONE & FILE HANDLING ============

    setupDropZone() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.setAttribute('role', 'button');
        dropZone.setAttribute('tabindex', '0');
        dropZone.setAttribute('aria-label', 'Click or press Enter to upload a model file');
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadFile(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadFile(e.target.files[0]);
            }
        });
    }

    async loadFile(file) {
        this.showLoading('Loading file...');

        try {
            if (file.name.endsWith('.json')) {
                const text = await file.text();
                const project = JSON.parse(text);
                await this.loadProject(project);
            } else if (file.name.endsWith('.zip') || file.name.endsWith('.hta.zip')) {
                const arrayBuffer = await file.arrayBuffer();
                await this.loadZip(arrayBuffer);
            } else {
                throw new Error('Unsupported file type. Please use .json or .hta.zip');
            }
        } catch (e) {
            this.hideLoading();
            this.showToast(`Error: ${e.message}`, 'error');
        }
    }

    async loadZip(arrayBuffer) {
        this.showLoading('Validating package...');

        // Validate ZIP
        this.validationResults = await this.validator.validateZip(arrayBuffer);

        if (this.validationResults.project) {
            this.project = this.validationResults.project;
            this.hideLoading();
            this.showMainContent();
            this.populateUI();

            if (!this.validationResults.valid) {
                this.showToast(`Validation completed with ${this.validationResults.errors.length} errors`, 'warning');
            } else if (this.validationResults.warnings.length > 0) {
                this.showToast(`Loaded successfully with ${this.validationResults.warnings.length} warnings`, 'warning');
            } else {
                this.showToast('Model loaded and validated successfully', 'success');
            }
        } else {
            this.hideLoading();
            this.showToast('Failed to load project from ZIP', 'error');
        }
    }

    async loadProject(project) {
        this.showLoading('Validating model...');

        this.project = project;
        this.validationResults = this.validator._validateProjectObject(project);

        this.hideLoading();
        this.showMainContent();
        this.populateUI();

        if (!this.validationResults.valid) {
            this.showToast(`Validation completed with ${this.validationResults.errors.length} errors`, 'warning');
        } else {
            this.showToast('Model loaded successfully', 'success');
        }
    }

    loadDemoModel() {
        const demoProject = this.createDemoProject();
        this.loadProject(demoProject);
    }

    createDemoProject() {
        return {
            version: "0.1",
            metadata: {
                id: "demo_markov_oncology",
                name: "Oncology Drug A vs Standard Care",
                description: "Demonstration Markov cohort model for oncology",
                author: "HTA Standard Demo",
                created: new Date().toISOString(),
                version: "1.0.0"
            },
            settings: {
                time_horizon: 40,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                half_cycle_correction: "trapezoidal",
                currency: "GBP",
                starting_age: 55
            },
            model: {
                type: "markov_cohort"
            },
            parameters: {
                p_progression_drugA: {
                    value: 0.15,
                    label: "Progression probability (Drug A)",
                    distribution: { type: "beta", alpha: 15, beta: 85 }
                },
                p_progression_soc: {
                    value: 0.25,
                    label: "Progression probability (SoC)",
                    distribution: { type: "beta", alpha: 25, beta: 75 }
                },
                p_death_stable: {
                    value: 0.02,
                    label: "Death probability (Stable)",
                    distribution: { type: "beta", alpha: 2, beta: 98 }
                },
                p_death_progressed: {
                    value: 0.15,
                    label: "Death probability (Progressed)",
                    distribution: { type: "beta", alpha: 15, beta: 85 }
                },
                c_drugA: {
                    value: 5000,
                    label: "Annual cost Drug A",
                    unit: "GBP",
                    distribution: { type: "gamma", mean: 5000, se: 500 }
                },
                c_soc: {
                    value: 1000,
                    label: "Annual cost SoC",
                    unit: "GBP",
                    distribution: { type: "gamma", mean: 1000, se: 100 }
                },
                c_progressed: {
                    value: 8000,
                    label: "Annual cost progressed disease",
                    unit: "GBP",
                    distribution: { type: "gamma", mean: 8000, se: 800 }
                },
                u_stable: {
                    value: 0.85,
                    label: "Utility stable disease",
                    distribution: { type: "beta", alpha: 85, beta: 15 }
                },
                u_progressed: {
                    value: 0.60,
                    label: "Utility progressed disease",
                    distribution: { type: "beta", alpha: 60, beta: 40 }
                }
            },
            states: {
                stable: {
                    label: "Stable Disease",
                    description: "Patient has stable disease under treatment",
                    type: "transient",
                    initial_probability: 1.0,
                    cost: "c_drugA",
                    utility: "u_stable"
                },
                progressed: {
                    label: "Progressed Disease",
                    description: "Patient has progressive disease",
                    type: "transient",
                    initial_probability: 0,
                    cost: "c_progressed",
                    utility: "u_progressed"
                },
                dead: {
                    label: "Dead",
                    description: "Absorbing state",
                    type: "absorbing",
                    initial_probability: 0,
                    cost: 0,
                    utility: 0
                }
            },
            transitions: {
                stable_to_stable: {
                    from: "stable",
                    to: "stable",
                    probability: "1 - p_progression_drugA - p_death_stable"
                },
                stable_to_progressed: {
                    from: "stable",
                    to: "progressed",
                    probability: "p_progression_drugA"
                },
                stable_to_dead: {
                    from: "stable",
                    to: "dead",
                    probability: "p_death_stable"
                },
                progressed_to_progressed: {
                    from: "progressed",
                    to: "progressed",
                    probability: "1 - p_death_progressed"
                },
                progressed_to_dead: {
                    from: "progressed",
                    to: "dead",
                    probability: "p_death_progressed"
                },
                dead_to_dead: {
                    from: "dead",
                    to: "dead",
                    probability: 1.0
                }
            },
            strategies: {
                drug_a: {
                    label: "Drug A",
                    description: "New intervention",
                    is_comparator: false,
                    parameter_overrides: {
                        p_progression_drugA: "p_progression_drugA"
                    }
                },
                soc: {
                    label: "Standard of Care",
                    description: "Comparator",
                    is_comparator: true,
                    parameter_overrides: {
                        c_drugA: "c_soc",
                        p_progression_drugA: "p_progression_soc"
                    }
                }
            },
            evidence: {
                ev_001: {
                    source: "KEYNOTE-001",
                    citation: "Trial data",
                    notes: "Phase III trial"
                }
            }
        };
    }

    // ============ NAVIGATION ============

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateToSection(section);
            });
        });
    }

    navigateToSection(section) {
        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Update content
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.style.display = 'none';
        });
        const sectionEl = document.getElementById(`section-${section}`);
        if (sectionEl) {
            sectionEl.style.display = 'block';
        }

        this.currentSection = section;
    }

    // ============ BUTTONS ============

    setupButtons() {
        document.getElementById('btn-demo').addEventListener('click', () => this.loadDemoModel());
        document.getElementById('btn-open').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        // Dark mode toggle
        const darkModeBtn = document.getElementById('btn-dark-mode');
        if (darkModeBtn) {
            darkModeBtn.addEventListener('click', () => this.toggleDarkMode());
            // Check for saved preference
            if (localStorage.getItem('darkMode') === 'true') {
                document.body.classList.add('dark-mode');
                document.getElementById('dark-mode-icon').textContent = '☀️';
            }
        }

        document.getElementById('btn-run').addEventListener('click', () => this.runBaseCase());
        document.getElementById('btn-revalidate').addEventListener('click', () => this.revalidate());
        document.getElementById('btn-run-psa').addEventListener('click', () => this.runPSA());

        document.getElementById('btn-run-deterministic').addEventListener('click', () => this.runBaseCase());
        document.getElementById('btn-run-psa-full').addEventListener('click', () => this.runPSA());

        // DSA button
        const dsaBtn = document.getElementById('btn-run-dsa');
        if (dsaBtn) {
            dsaBtn.addEventListener('click', () => this.runDSA());
        }

        // EVPI button
        const evpiBtn = document.getElementById('btn-calc-evpi');
        if (evpiBtn) {
            evpiBtn.addEventListener('click', () => this.calculateEVPI());
        }

        // Export buttons
        document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSON());
        document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());
        document.getElementById('btn-export-validation').addEventListener('click', () => this.exportValidation());
        document.getElementById('btn-export-hta').addEventListener('click', () => this.exportHTAZip());

        // Audit export button
        const auditBtn = document.getElementById('btn-export-audit');
        if (auditBtn) {
            auditBtn.addEventListener('click', () => this.exportAuditLog());
        }

        // NICE report button
        const niceBtn = document.getElementById('btn-export-nice-report');
        if (niceBtn) {
            niceBtn.addEventListener('click', () => this.exportNICEReport());
        }
    }

    setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }

    // ============ UI POPULATION ============

    showMainContent() {
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('main-content').classList.add('active');
    }

    populateUI() {
        this.populateSummary();
        this.populateValidation();
        this.populateParameters();
        this.populateStates();
        this.populateTransitions();
        this.updateBadges();
    }

    populateSummary() {
        const p = this.project;
        const meta = p.metadata || {};
        const settings = p.settings || {};

        document.getElementById('model-type').textContent = p.model?.type || 'Unknown';
        document.getElementById('param-count').textContent = Object.keys(p.parameters || {}).length;
        document.getElementById('state-count').textContent = Object.keys(p.states || {}).length;
        document.getElementById('time-horizon').textContent = `${settings.time_horizon || '-'} years`;

        document.getElementById('model-name').textContent = meta.name || 'Unnamed';
        document.getElementById('model-version').textContent = meta.version || '-';
        document.getElementById('model-author').textContent = meta.author || '-';
        document.getElementById('model-created').textContent = meta.created ?
            new Date(meta.created).toLocaleDateString() : '-';

        this.renderStateDiagram();
    }

    renderStateDiagram() {
        const container = document.getElementById('state-diagram');
        const states = this.project.states || {};

        let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 60px; flex-wrap: wrap;">';

        for (const [stateId, state] of Object.entries(states)) {
            const isAbsorbing = state.type === 'absorbing';
            const safeLabel = this.escapeHTML(state.label?.substring(0, 8) || stateId);
            const safeStateId = this.escapeHTML(stateId);
            html += `
                <div class="state-node">
                    <div class="state-circle ${isAbsorbing ? 'absorbing' : ''}">
                        ${safeLabel}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">${safeStateId}</div>
                </div>
            `;
        }

        html += '</div>';
        this.setSafeInnerHTML(container, html);
    }

    populateValidation() {
        const v = this.validationResults;
        if (!v) return;

        const statusEl = document.getElementById('validation-status');
        if (v.valid) {
            statusEl.className = 'validation-status pass';
            statusEl.innerHTML = `<span>✅</span> Validation PASSED ${v.warnings.length > 0 ? `(${v.warnings.length} warnings)` : ''}`;
        } else {
            statusEl.className = 'validation-status fail';
            statusEl.innerHTML = `<span>❌</span> Validation FAILED (${v.errors.length} errors)`;
        }

        // Populate issues
        const issuesEl = document.getElementById('validation-issues');
        let html = '';

        for (const err of v.errors) {
            html += this.renderIssue(err, 'error');
        }
        for (const warn of v.warnings) {
            html += this.renderIssue(warn, 'warning');
        }
        for (const info of (v.infos || []).slice(0, 10)) {
            html += this.renderIssue(info, 'info');
        }

        this.setSafeInnerHTML(issuesEl, html || '<p style="color: var(--text-muted);">No issues found.</p>');

        // Update badge
        document.getElementById('validation-badge').textContent =
            v.errors.length > 0 ? v.errors.length : (v.warnings.length > 0 ? v.warnings.length : '✓');
        document.getElementById('validation-badge').className =
            `nav-badge ${v.errors.length > 0 ? 'error' : (v.warnings.length > 0 ? 'warning' : 'success')}`;
    }

    renderIssue(issue, severity) {
        const safeCode = this.escapeHTML(issue.code);
        const safePath = this.escapeHTML(issue.path);
        const safeMessage = this.escapeHTML(issue.message);
        const safeRecommendation = issue.recommendation ? this.escapeHTML(issue.recommendation) : '';
        return `
            <div class="validation-issue ${severity}">
                <div class="issue-header">
                    <span class="issue-code">${safeCode}</span>
                    <span class="issue-path">${safePath}</span>
                </div>
                <div>${safeMessage}</div>
                ${safeRecommendation ? `<div style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">→ ${safeRecommendation}</div>` : ''}
            </div>
        `;
    }

    populateParameters() {
        const params = this.project.parameters || {};
        const tbody = document.getElementById('params-table-body');

        let html = '';
        for (const [id, param] of Object.entries(params)) {
            const dist = param.distribution;
            const safeId = this.escapeHTML(id);
            const safeLabel = this.escapeHTML(param.label || '-');
            const safeValue = this.escapeHTML(typeof param.value === 'number' ? param.value.toFixed(4) : param.value);
            const safeDist = this.escapeHTML(dist ? `${dist.type}` : 'Fixed');
            const safeEvidence = this.escapeHTML(param.evidence_id || '-');
            html += `
                <tr>
                    <td class="mono">${safeId}</td>
                    <td>${safeLabel}</td>
                    <td class="mono">${safeValue}</td>
                    <td>${safeDist}</td>
                    <td>${safeEvidence}</td>
                </tr>
            `;
        }

        this.setSafeInnerHTML(tbody, html || '<tr><td colspan="5">No parameters defined</td></tr>');
        document.getElementById('params-badge').textContent = Object.keys(params).length;
    }

    populateStates() {
        const states = this.project.states || {};
        const tbody = document.getElementById('states-table-body');

        let html = '';
        for (const [id, state] of Object.entries(states)) {
            const safeId = this.escapeHTML(id);
            const safeLabel = this.escapeHTML(state.label || '-');
            const safeType = this.escapeHTML(state.type || 'transient');
            const safeCost = this.escapeHTML(state.cost ?? '-');
            const safeUtility = this.escapeHTML(state.utility ?? '-');
            html += `
                <tr>
                    <td class="mono">${safeId}</td>
                    <td>${safeLabel}</td>
                    <td>${safeType}</td>
                    <td class="mono">${safeCost}</td>
                    <td class="mono">${safeUtility}</td>
                </tr>
            `;
        }

        this.setSafeInnerHTML(tbody, html || '<tr><td colspan="5">No states defined</td></tr>');
        document.getElementById('states-badge').textContent = Object.keys(states).length;
    }

    populateTransitions() {
        const transitions = this.project.transitions || {};
        const tbody = document.getElementById('transitions-table-body');

        let html = '';
        for (const [id, trans] of Object.entries(transitions)) {
            const isExpr = typeof trans.probability === 'string';
            const safeFrom = this.escapeHTML(trans.from);
            const safeTo = this.escapeHTML(trans.to);
            const safeProb = this.escapeHTML(isExpr ? '-' : trans.probability?.toFixed(4));
            const safeExpr = this.escapeHTML(isExpr ? trans.probability : '-');
            html += `
                <tr>
                    <td class="mono">${safeFrom}</td>
                    <td class="mono">${safeTo}</td>
                    <td class="mono">${safeProb}</td>
                    <td class="mono" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${safeExpr}</td>
                </tr>
            `;
        }

        this.setSafeInnerHTML(tbody, html || '<tr><td colspan="4">No transitions defined</td></tr>');
        document.getElementById('transitions-badge').textContent = Object.keys(transitions).length;
    }

    updateBadges() {
        // Already done in individual populate methods
    }

    // ============ MODEL EXECUTION ============

    async runBaseCase() {
        if (!this.project) {
            this.showToast('No model loaded', 'error');
            return;
        }

        const modelType = this.project.model?.type;
        if (!modelType) {
            this.showToast('Model type not specified in project', 'error');
            return;
        }

        const engine = this.engines[modelType];
        if (!engine) {
            this.showToast(`Unsupported model type: ${modelType}`, 'error');
            return;
        }


        this.showLoading('Running model...');
        this.log(`Starting deterministic simulation for ${modelType}...`);

        try {
            this.results = engine.runAllStrategies(this.project);

            const firstStrategyResult = this.results.strategies[Object.keys(this.results.strategies)[0]];
            this.log(`Simulation complete in ${firstStrategyResult?.computation_time_ms || 0}ms`);
            
            this.displayResults();
            this.hideLoading();
            this.showToast('Simulation complete', 'success');

        } catch (e) {
            this.hideLoading();
            this.log(`Error: ${e.message}`);
            this.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayResults() {
        const r = this.results;
        if (!r) return;

        // Get first non-comparator strategy and comparator
        const strategies = this.project.strategies || {};
        let intId = null, compId = null;

        for (const [id, strat] of Object.entries(strategies)) {
            if (strat.is_comparator) compId = id;
            else if (!intId) intId = id;
        }

        if (!intId) intId = Object.keys(r.strategies)[0];
        if (!compId) compId = Object.keys(r.strategies)[1] || intId;

        const intResults = r.strategies[intId];
        const compResults = r.strategies[compId];

        // Display base case results
        document.getElementById('result-costs-int').textContent = `£${Math.round(intResults?.total_costs || 0).toLocaleString()}`;
        document.getElementById('result-costs-comp').textContent = `£${Math.round(compResults?.total_costs || 0).toLocaleString()}`;
        document.getElementById('result-qalys-int').textContent = (intResults?.total_qalys || 0).toFixed(3);
        document.getElementById('result-qalys-comp').textContent = (compResults?.total_qalys || 0).toFixed(3);

        // ICER
        if (r.incremental && r.incremental.comparisons.length > 0) {
            const comp = r.incremental.comparisons[0];
            if (typeof comp.icer === 'number') {
                document.getElementById('result-icer').textContent = `£${Math.round(comp.icer).toLocaleString()}`;
            } else {
                document.getElementById('result-icer').textContent = comp.dominance || comp.icer;
            }
        }

        // Render trace chart
        this.renderTraceChart(intResults);

        // Navigate to results
        this.navigateToSection('deterministic');
    }

    renderTraceChart(results) {
        if (!results?.trace) return;

        const ctx = document.getElementById('trace-chart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.trace) {
            this.charts.trace.destroy();
        }

        const trace = results.trace;
        const datasets = [];
        const colors = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed'];

        let i = 0;
        for (const [stateId, values] of Object.entries(trace.states)) {
            datasets.push({
                label: stateId,
                data: values,
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '20',
                fill: true,
                tension: 0.4
            });
            i++;
        }

        this.charts.trace = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trace.cycles,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1,
                        title: { display: true, text: 'Proportion in State' }
                    },
                    x: {
                        title: { display: true, text: 'Cycle' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    async runPSA() {
        if (!this.project) {
            this.showToast('No model loaded', 'error');
            return;
        }

        const iterations = parseInt(document.getElementById('psa-iterations')?.value || '1000');
        const seed = parseInt(document.getElementById('engine-seed')?.value || '12345');

        this.showLoading('Running PSA...');
        document.getElementById('psa-progress').style.display = 'block';

        try {
            const engine = new PSAEngine({ iterations, seed });

            engine.onProgress(async (current, total, results) => {
                const pct = Math.round((current / total) * 100);
                document.getElementById('psa-progress-bar').style.width = `${pct}%`;
                document.getElementById('psa-progress-text').textContent = `${pct}%`;

                // Yield to update UI
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            // Get strategy overrides
            const strategies = this.project.strategies || {};
            let intOverrides = {}, compOverrides = {};

            for (const [id, strat] of Object.entries(strategies)) {
                if (strat.is_comparator) {
                    compOverrides = strat.parameter_overrides || {};
                } else {
                    intOverrides = strat.parameter_overrides || {};
                }
            }

            this.psaResults = await engine.run(this.project, intOverrides, compOverrides);

            this.displayPSAResults();
            this.hideLoading();
            document.getElementById('psa-progress').style.display = 'none';
            this.showToast('PSA complete', 'success');

        } catch (e) {
            this.hideLoading();
            document.getElementById('psa-progress').style.display = 'none';
            this.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayPSAResults() {
        const r = this.psaResults;
        if (!r) return;

        const s = r.summary;

        document.getElementById('psa-mean-icer').textContent =
            s.mean_icer ? `£${Math.round(s.mean_icer).toLocaleString()}` : '-';
        document.getElementById('psa-ci-lower').textContent =
            s.ci_lower_icer ? `£${Math.round(s.ci_lower_icer).toLocaleString()}` : '-';
        document.getElementById('psa-ci-upper').textContent =
            s.ci_upper_icer ? `£${Math.round(s.ci_upper_icer).toLocaleString()}` : '-';
        document.getElementById('psa-prob-ce').textContent =
            s.prob_ce_30k ? `${(s.prob_ce_30k * 100).toFixed(1)}%` : '-';

        this.renderCEPlane();
        this.renderCEAC();
        this.displayConvergenceDiagnostics();
        this.updateAuditSummary();
        this.navigateToSection('psa');
    }

    renderCEPlane() {
        const r = this.psaResults;
        if (!r?.scatter) return;

        const ctx = document.getElementById('ce-plane-chart');
        if (!ctx) return;

        if (this.charts.cePlane) {
            this.charts.cePlane.destroy();
        }

        // Prepare scatter data
        const data = [];
        for (let i = 0; i < r.scatter.incremental_qalys.length; i++) {
            data.push({
                x: r.scatter.incremental_qalys[i],
                y: r.scatter.incremental_costs[i]
            });
        }

        // WTP line at £30k
        const maxQ = Math.max(...r.scatter.incremental_qalys.map(Math.abs)) * 1.2;
        const wtpLine = [
            { x: -maxQ, y: -maxQ * 30000 },
            { x: maxQ, y: maxQ * 30000 }
        ];

        this.charts.cePlane = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'PSA Iterations',
                        data: data,
                        backgroundColor: '#2563eb40',
                        borderColor: '#2563eb',
                        pointRadius: 2
                    },
                    {
                        label: 'WTP £30k',
                        data: wtpLine,
                        type: 'line',
                        borderColor: '#dc2626',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Incremental QALYs' }
                    },
                    y: {
                        title: { display: true, text: 'Incremental Costs (£)' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    renderCEAC() {
        const r = this.psaResults;
        if (!r?.ceac) return;

        const ctx = document.getElementById('ceac-chart');
        if (!ctx) return;

        if (this.charts.ceac) {
            this.charts.ceac.destroy();
        }

        this.charts.ceac = new Chart(ctx, {
            type: 'line',
            data: {
                labels: r.ceac.map(p => `£${(p.wtp / 1000).toFixed(0)}k`),
                datasets: [{
                    label: 'Probability Cost-Effective',
                    data: r.ceac.map(p => p.probability),
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb20',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1,
                        title: { display: true, text: 'Probability CE' }
                    },
                    x: {
                        title: { display: true, text: 'Willingness-to-Pay Threshold' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    displayConvergenceDiagnostics() {
        const r = this.psaResults;
        if (!r?.convergence) return;

        const panel = document.getElementById('convergence-panel');
        if (!panel) return;

        panel.style.display = 'block';

        const conv = r.convergence;
        document.getElementById('conv-status').textContent = conv.converged ? 'Converged' : 'Not Converged';
        document.getElementById('conv-status').style.color = conv.converged ? 'var(--success)' : 'var(--error)';

        document.getElementById('conv-cost-se').textContent = conv.costSE ? `£${conv.costSE.toFixed(2)}` : '-';
        document.getElementById('conv-qaly-se').textContent = conv.qalySE ? conv.qalySE.toFixed(6) : '-';

        const warningEl = document.getElementById('conv-warning');
        if (!conv.converged) {
            warningEl.style.display = 'block';
            warningEl.textContent = `Warning: PSA may not have converged. Consider running more iterations. Cost CV: ${(conv.costCV * 100).toFixed(2)}%, QALY CV: ${(conv.qalyCV * 100).toFixed(2)}%`;
        } else {
            warningEl.style.display = 'none';
        }
    }

    // ============ DSA (DETERMINISTIC SENSITIVITY ANALYSIS) ============

    async runDSA() {
        if (!this.project) {
            this.showToast('No model loaded', 'error');
            return;
        }

        if (!this.dsaEngine) {
            this.showToast('DSA engine not available', 'error');
            return;
        }

        const range = parseFloat(document.getElementById('dsa-range')?.value || '20') / 100;
        const metric = document.getElementById('dsa-metric')?.value || 'icer';
        const maxParams = document.getElementById('dsa-max-params')?.value || '15';

        this.showLoading('Running DSA...');
        document.getElementById('dsa-progress').style.display = 'block';
        document.getElementById('dsa-placeholder').style.display = 'none';

        try {
            // Get strategy overrides
            const strategies = this.project.strategies || {};
            let intOverrides = {}, compOverrides = {};

            for (const [id, strat] of Object.entries(strategies)) {
                if (strat.is_comparator) {
                    compOverrides = strat.parameter_overrides || {};
                } else {
                    intOverrides = strat.parameter_overrides || {};
                }
            }

            this.dsaEngine.onProgress((current, total) => {
                const pct = Math.round((current / total) * 100);
                document.getElementById('dsa-progress-bar').style.width = `${pct}%`;
                document.getElementById('dsa-progress-text').textContent = `${pct}%`;
            });

            this.dsaResults = await this.dsaEngine.run(
                this.project,
                intOverrides,
                compOverrides,
                { range, metric }
            );

            this.displayDSAResults(maxParams);
            this.hideLoading();
            document.getElementById('dsa-progress').style.display = 'none';
            this.showToast('DSA complete', 'success');

            // Log to audit
            if (this.auditLogger) {
                this.auditLogger.logDSAResults(this.dsaResults);
            }

        } catch (e) {
            this.hideLoading();
            document.getElementById('dsa-progress').style.display = 'none';
            this.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayDSAResults(maxParams) {
        const r = this.dsaResults;
        if (!r?.parameters) return;

        document.getElementById('tornado-container').style.display = 'block';
        document.getElementById('dsa-placeholder').style.display = 'none';

        // Sort by swing and limit
        let params = [...r.parameters].sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));
        if (maxParams !== 'all') {
            params = params.slice(0, parseInt(maxParams));
        }

        // Populate table
        const tbody = document.getElementById('dsa-results-body');
        let html = '';
        params.forEach((p, i) => {
            html += `
                <tr>
                    <td>${i + 1}</td>
                    <td class="mono">${p.parameter}</td>
                    <td class="mono">${p.baseValue.toFixed(4)}</td>
                    <td class="mono">${p.lowResult?.toFixed(2) || '-'}</td>
                    <td class="mono">${p.highResult?.toFixed(2) || '-'}</td>
                    <td class="mono" style="font-weight: 600;">${Math.abs(p.swing).toFixed(2)}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        // Render tornado chart
        this.renderTornadoChart(params, r.baseline);
    }

    renderTornadoChart(params, baseline) {
        const ctx = document.getElementById('tornado-chart');
        if (!ctx) return;

        if (this.charts.tornado) {
            this.charts.tornado.destroy();
        }

        // Prepare data - params should be in reverse order for tornado (most influential at top)
        const reversed = [...params].reverse();
        const labels = reversed.map(p => p.parameter);
        const lowDeltas = reversed.map(p => (p.lowResult || baseline) - baseline);
        const highDeltas = reversed.map(p => (p.highResult || baseline) - baseline);

        this.charts.tornado = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Low Value',
                        data: lowDeltas,
                        backgroundColor: '#dc2626',
                        barPercentage: 0.8
                    },
                    {
                        label: 'High Value',
                        data: highDeltas,
                        backgroundColor: '#16a34a',
                        barPercentage: 0.8
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: `Change in ${this.dsaResults.metric.toUpperCase()} from Baseline` }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' },
                    title: {
                        display: true,
                        text: `Baseline ${this.dsaResults.metric.toUpperCase()}: ${baseline?.toFixed(2) || '-'}`
                    }
                }
            }
        });
    }

    // ============ EVPI CALCULATION ============

    calculateEVPI() {
        if (!this.psaResults?.scatter) {
            this.showToast('Run PSA first to calculate EVPI', 'warning');
            return;
        }

        if (!this.evpiCalculator) {
            this.showToast('EVPI calculator not available', 'error');
            return;
        }

        const wtp = parseFloat(document.getElementById('evpi-wtp')?.value || '30000');
        const population = parseInt(document.getElementById('evpi-population')?.value || '50000');
        const years = parseInt(document.getElementById('evpi-years')?.value || '10');

        try {
            this.evpiResults = this.evpiCalculator.calculate(
                this.psaResults,
                wtp,
                population,
                years
            );

            this.displayEVPIResults();
            this.showToast('EVPI calculated', 'success');

            // Log to audit
            if (this.auditLogger) {
                this.auditLogger.logEVPI(this.evpiResults);
            }

        } catch (e) {
            this.showToast(`Error: ${e.message}`, 'error');
        }
    }

    displayEVPIResults() {
        const r = this.evpiResults;
        if (!r) return;

        document.getElementById('evpi-results').style.display = 'block';

        document.getElementById('evpi-per-patient').textContent = `£${r.evpiPerPatient?.toFixed(2) || '-'}`;
        document.getElementById('evpi-population-value').textContent = r.populationEVPI ?
            `£${(r.populationEVPI / 1e6).toFixed(2)}M` : '-';
        document.getElementById('evpi-prob-wrong').textContent = r.probWrongDecision ?
            `${(r.probWrongDecision * 100).toFixed(1)}%` : '-';
        document.getElementById('evpi-optimal').textContent = r.optimalStrategy || '-';
    }

    // ============ VALIDATION ============

    async revalidate() {
        if (!this.project) return;
        this.validationResults = this.validator._validateProjectObject(this.project);
        this.populateValidation();
        this.showToast('Validation complete', 'success');
    }

    // ============ EXPORT ============

    exportJSON() {
        const data = {
            project: this.project,
            results: this.results,
            psa: this.psaResults,
            validation: this.validationResults
        };

        this.downloadFile(JSON.stringify(data, null, 2), 'hta-results.json', 'application/json');
    }

    exportCSV() {
        if (!this.results) {
            this.showToast('No results to export', 'warning');
            return;
        }

        let csv = 'Strategy,Total Costs,Total QALYs,Life Years\n';
        for (const [id, r] of Object.entries(this.results.strategies)) {
            csv += `${r.label || id},${r.total_costs.toFixed(2)},${r.total_qalys.toFixed(4)},${r.life_years.toFixed(4)}\n`;
        }

        this.downloadFile(csv, 'hta-results.csv', 'text/csv');
    }

    exportValidation() {
        if (!this.validationResults) return;
        const report = this.validator.generateReport(this.validationResults);
        this.downloadFile(report, 'validation-report.txt', 'text/plain');
    }

    exportAuditLog() {
        if (!this.auditLogger) {
            this.showToast('Audit logger not available', 'warning');
            return;
        }

        const auditData = this.auditLogger.export();
        this.downloadFile(
            JSON.stringify(auditData, null, 2),
            `audit_${auditData.metadata.sessionId}.json`,
            'application/json'
        );
        this.showToast('Audit log exported', 'success');
    }

    exportNICEReport() {
        if (!this.project) {
            this.showToast('No model loaded', 'warning');
            return;
        }

        // Generate NICE-style submission report
        const report = this.generateNICEReport();
        this.downloadFile(report, 'nice-submission-report.txt', 'text/plain');
        this.showToast('NICE report generated', 'success');
    }

    generateNICEReport() {
        const p = this.project;
        const v = this.validationResults;
        const r = this.results;
        const psa = this.psaResults;
        const evpi = this.evpiResults;

        let report = `
================================================================================
                    NICE TECHNOLOGY APPRAISAL REPORT
                    HTA Artifact Standard v0.1
================================================================================

Generated: ${new Date().toISOString()}
Model ID: ${p.metadata?.id || 'Unknown'}
Model Name: ${p.metadata?.name || 'Unnamed'}
Version: ${p.metadata?.version || '-'}
Author: ${p.metadata?.author || '-'}

================================================================================
1. MODEL SPECIFICATION
================================================================================

Model Type: ${p.model?.type || 'Unknown'}
Time Horizon: ${p.settings?.time_horizon || '-'} years
Cycle Length: ${p.settings?.cycle_length || '-'} years
Starting Age: ${p.settings?.starting_age || '-'} years
Discount Rate (Costs): ${((p.settings?.discount_rate_costs || 0) * 100).toFixed(1)}%
Discount Rate (QALYs): ${((p.settings?.discount_rate_qalys || 0) * 100).toFixed(1)}%
Half-Cycle Correction: ${p.settings?.half_cycle_correction || 'None'}
Perspective: NHS & PSS (assumed)

Health States: ${Object.keys(p.states || {}).length}
${Object.entries(p.states || {}).map(([id, s]) => `  - ${id}: ${s.label} (${s.type})`).join('\n')}

Parameters: ${Object.keys(p.parameters || {}).length}
${Object.entries(p.parameters || {}).slice(0, 10).map(([id, param]) =>
    `  - ${id}: ${param.value} ${param.distribution ? `(${param.distribution.type})` : '(fixed)'}`
).join('\n')}
${Object.keys(p.parameters || {}).length > 10 ? `  ... and ${Object.keys(p.parameters || {}).length - 10} more` : ''}

================================================================================
2. VALIDATION SUMMARY
================================================================================

Validation Status: ${v?.valid ? 'PASSED' : 'FAILED'}
Errors: ${v?.errors?.length || 0}
Warnings: ${v?.warnings?.length || 0}
Informational: ${v?.infos?.length || 0}

${v?.errors?.length > 0 ? 'Critical Issues:\n' + v.errors.map(e => `  [${e.code}] ${e.message}`).join('\n') : ''}
${v?.warnings?.length > 0 ? '\nWarnings:\n' + v.warnings.map(w => `  [${w.code}] ${w.message}`).join('\n') : ''}

================================================================================
3. BASE CASE RESULTS
================================================================================
`;

        if (r?.strategies) {
            const strategies = Object.entries(r.strategies);
            report += `
Strategy Outcomes:
${strategies.map(([id, s]) => `
  ${s.label || id}:
    Total Costs: £${s.total_costs?.toFixed(2) || '-'}
    Total QALYs: ${s.total_qalys?.toFixed(4) || '-'}
    Life Years: ${s.life_years?.toFixed(4) || '-'}
`).join('')}
`;
            if (r.incremental?.comparisons?.length > 0) {
                const comp = r.incremental.comparisons[0];
                report += `
Incremental Analysis:
  Incremental Costs: £${comp.incremental_costs?.toFixed(2) || '-'}
  Incremental QALYs: ${comp.incremental_qalys?.toFixed(4) || '-'}
  ICER: ${typeof comp.icer === 'number' ? `£${comp.icer.toFixed(2)}` : comp.icer || '-'}
`;
            }
        } else {
            report += '\n  [No base case results available - run model first]\n';
        }

        report += `
================================================================================
4. PROBABILISTIC SENSITIVITY ANALYSIS
================================================================================
`;

        if (psa?.summary) {
            const s = psa.summary;
            report += `
PSA Configuration:
  Iterations: ${psa.iterations || '-'}
  Random Seed: ${psa.seed || '-'}
  Convergence Status: ${psa.convergence?.converged ? 'Converged' : 'Not Converged'}

PSA Results:
  Mean Incremental Costs: £${s.mean_incremental_costs?.toFixed(2) || '-'}
  Mean Incremental QALYs: ${s.mean_incremental_qalys?.toFixed(4) || '-'}
  Mean ICER: £${s.mean_icer?.toFixed(2) || '-'}

95% Credible Intervals:
  ICER Lower: £${s.ci_lower_icer?.toFixed(2) || '-'}
  ICER Upper: £${s.ci_upper_icer?.toFixed(2) || '-'}

Cost-Effectiveness Probabilities:
  P(CE) at £20,000/QALY: ${s.prob_ce_20k ? (s.prob_ce_20k * 100).toFixed(1) + '%' : '-'}
  P(CE) at £30,000/QALY: ${s.prob_ce_30k ? (s.prob_ce_30k * 100).toFixed(1) + '%' : '-'}
`;
            if (psa.convergence) {
                report += `
Convergence Diagnostics:
  Cost Standard Error: £${psa.convergence.costSE?.toFixed(2) || '-'}
  QALY Standard Error: ${psa.convergence.qalySE?.toFixed(6) || '-'}
  Cost CV: ${(psa.convergence.costCV * 100)?.toFixed(2) || '-'}%
  QALY CV: ${(psa.convergence.qalyCV * 100)?.toFixed(2) || '-'}%
`;
            }
        } else {
            report += '\n  [No PSA results available - run PSA first]\n';
        }

        report += `
================================================================================
5. VALUE OF INFORMATION ANALYSIS
================================================================================
`;

        if (evpi) {
            report += `
EVPI Analysis:
  Willingness-to-Pay: £${evpi.wtp?.toLocaleString() || '-'}/QALY
  EVPI per Patient: £${evpi.evpiPerPatient?.toFixed(2) || '-'}
  Population Size: ${evpi.population?.toLocaleString() || '-'}
  Time Horizon: ${evpi.years || '-'} years
  Population EVPI: £${evpi.populationEVPI?.toLocaleString() || '-'}
  Probability of Wrong Decision: ${evpi.probWrongDecision ? (evpi.probWrongDecision * 100).toFixed(1) + '%' : '-'}
  Optimal Strategy (current info): ${evpi.optimalStrategy || '-'}
`;
        } else {
            report += '\n  [No EVPI analysis available - run EVPI calculation first]\n';
        }

        report += `
================================================================================
6. NICE REFERENCE CASE COMPLIANCE
================================================================================

Discount Rate Costs: ${p.settings?.discount_rate_costs === 0.035 ? 'COMPLIANT (3.5%)' : `NON-COMPLIANT (${(p.settings?.discount_rate_costs * 100).toFixed(1)}%)`}
Discount Rate QALYs: ${p.settings?.discount_rate_qalys === 0.035 ? 'COMPLIANT (3.5%)' : `NON-COMPLIANT (${(p.settings?.discount_rate_qalys * 100).toFixed(1)}%)`}
Half-Cycle Correction: ${p.settings?.half_cycle_correction ? 'APPLIED' : 'NOT APPLIED'}
PSA Iterations: ${psa?.iterations >= 10000 ? `COMPLIANT (${psa.iterations})` : `${psa?.iterations || 'N/A'} (minimum 10,000 recommended)`}
Time Horizon: ${p.settings?.time_horizon >= 20 ? 'ADEQUATE' : 'May be insufficient for lifetime analysis'}

================================================================================
7. AUDIT TRAIL
================================================================================
`;

        if (this.auditLogger) {
            const summary = this.auditLogger.getSummary();
            report += `
Session ID: ${summary.sessionId}
Start Time: ${summary.startTime}
Total Log Entries: ${summary.totalEntries}
Errors Logged: ${summary.errorCount}
Warnings Logged: ${summary.warningCount}
Probability Clamping Events: ${summary.clampingEvents}
Parameter Overrides: ${summary.parameterChanges}
`;
        } else {
            report += '\n  [Audit logging not available]\n';
        }

        report += `
================================================================================
                            END OF REPORT
================================================================================
`;

        return report;
    }

    updateAuditSummary() {
        if (!this.auditLogger) return;

        const summary = this.auditLogger.getSummary();

        const sessionEl = document.getElementById('audit-session-id');
        if (sessionEl) sessionEl.textContent = summary.sessionId;

        const eventsEl = document.getElementById('audit-total-events');
        if (eventsEl) eventsEl.textContent = summary.totalEntries;

        const warningsEl = document.getElementById('audit-warnings');
        if (warningsEl) warningsEl.textContent = summary.warningCount;

        const clampingEl = document.getElementById('audit-clamping');
        if (clampingEl) clampingEl.textContent = summary.clampingEvents;
    }

    async exportHTAZip() {
        if (!this.project) return;

        const zip = new JSZip();

        // Add project.json
        zip.file('project.json', JSON.stringify(this.project, null, 2));

        // Add results if available
        if (this.results) {
            zip.file('results.json', JSON.stringify({
                version: '0.1',
                run_id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                deterministic: this.results,
                psa: this.psaResults
            }, null, 2));
        }

        // Generate manifest
        const manifest = {
            version: '0.1',
            created: new Date().toISOString(),
            files: []
        };

        // Calculate checksums
        for (const filename of Object.keys(zip.files)) {
            const content = await zip.file(filename).async('arraybuffer');
            const hash = await this.validator.computeSHA256(content);
            manifest.files.push({
                path: filename,
                sha256: hash,
                size: content.byteLength
            });
        }

        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // Generate ZIP
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.project.metadata?.id || 'model'}.hta.zip`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Package exported', 'success');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    // ============ UI HELPERS ============

    showLoading(text = 'Loading...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    log(message) {
        const logEl = document.getElementById('engine-log');
        if (!logEl) return;

        const time = new Date().toLocaleTimeString();
        logEl.innerHTML += `<div><span style="color: #64748b;">[${escapeHtml(time)}]</span> ${escapeHtml(message)}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
    }

    toggleDarkMode() {
        const body = document.body;
        const icon = document.getElementById('dark-mode-icon');
        const isDark = body.classList.toggle('dark-mode');

        // Update icon
        if (icon) {
            icon.textContent = isDark ? '☀️' : '🌙';
        }

        // Save preference
        localStorage.setItem('darkMode', isDark.toString());

        // Update charts for dark mode
        this.updateChartsForTheme(isDark);
    }

    updateChartsForTheme(isDark) {
        const textColor = isDark ? '#f1f5f9' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        // Update all Chart.js instances
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = textColor;
            Chart.defaults.borderColor = gridColor;

            // Update existing charts
            Object.values(Chart.instances || {}).forEach(chart => {
                if (chart.options.scales) {
                    Object.values(chart.options.scales).forEach(scale => {
                        if (scale.ticks) scale.ticks.color = textColor;
                        if (scale.grid) scale.grid.color = gridColor;
                    });
                }
                chart.update('none');
            });
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HTAApp();

    // Expose global functions for external access and testing
    window.showSection = (section) => window.app.navigateToSection(section);
    window.runDeterministicAnalysis = () => window.app.runBaseCase();
    window.runPSA = () => window.app.runPSA();
    window.exportResults = () => window.app.exportResults && window.app.exportResults();
    window.loadDemoData = () => window.app.loadDemoModel();
    window.runMetaAnalysis = () => window.app.runMetaAnalysis && window.app.runMetaAnalysis();
    window.runNMA = () => window.app.runNMA && window.app.runNMA();
    window.runSurvivalAnalysis = () => window.app.runSurvivalAnalysis && window.app.runSurvivalAnalysis();
    window.runEVPPI = () => window.app.runEVPPI && window.app.runEVPPI();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HTAApp, escapeHtml };
}
if (typeof window !== 'undefined') {
    window.HTAApp = HTAApp;
}
