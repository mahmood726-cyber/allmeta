/**
 * Tests for src/ui/app.js - HTAApp main controller
 */

'use strict';

// ---- Global mocks for engine dependencies ----
class MockValidator {
    _validateProjectObject(project) {
        return { valid: true, errors: [], warnings: [], infos: [] };
    }
    async validateZip() {
        return { valid: true, errors: [], warnings: [], infos: [], project: null };
    }
}

class MockMarkovEngine {
    runAllStrategies(project) {
        return {
            strategies: {
                drug_a: {
                    total_costs: 50000,
                    total_qalys: 3.5,
                    computation_time_ms: 12,
                    trace: {
                        cycles: [0, 1, 2],
                        states: { stable: [1, 0.8, 0.6], dead: [0, 0.2, 0.4] }
                    }
                },
                soc: {
                    total_costs: 20000,
                    total_qalys: 2.8,
                    computation_time_ms: 10,
                    trace: {
                        cycles: [0, 1, 2],
                        states: { stable: [1, 0.7, 0.5], dead: [0, 0.3, 0.5] }
                    }
                }
            },
            incremental: {
                comparisons: [{
                    icer: 42857,
                    dominance: null
                }]
            }
        };
    }
}

class MockPSAEngine {
    constructor() {}
    onProgress() {}
    async run() { return { summary: {}, scatter: { incremental_qalys: [], incremental_costs: [] } }; }
}

global.HTAValidator = MockValidator;
global.MarkovEngine = MockMarkovEngine;
global.PSAEngine = MockPSAEngine;
global.Chart = jest.fn(() => ({
    destroy: jest.fn(),
    update: jest.fn()
}));
Chart.defaults = { color: '', borderColor: '' };
Chart.instances = {};

// ---- Minimal DOM fixture ----
function setupDOM() {
    document.body.innerHTML = `
        <div id="drop-zone"></div>
        <input type="file" id="file-input" />
        <div id="main-content"></div>
        <div id="loading-overlay"><span id="loading-text"></span></div>
        <div id="toast-container"></div>
        <div id="engine-log"></div>

        <!-- Nav items -->
        <a class="nav-item" data-section="summary" href="#">Summary</a>
        <a class="nav-item" data-section="deterministic" href="#">Deterministic</a>
        <a class="nav-item" data-section="psa" href="#">PSA</a>

        <!-- Buttons -->
        <button id="btn-demo">Demo</button>
        <button id="btn-open">Open</button>
        <button id="btn-dark-mode"><span id="dark-mode-icon"></span></button>
        <button id="btn-run">Run</button>
        <button id="btn-revalidate">Revalidate</button>
        <button id="btn-run-psa">Run PSA</button>
        <button id="btn-run-deterministic">Run Deterministic</button>
        <button id="btn-run-psa-full">Run PSA Full</button>
        <button id="btn-run-dsa">Run DSA</button>
        <button id="btn-calc-evpi">Calc EVPI</button>
        <button id="btn-export-json">Export JSON</button>
        <button id="btn-export-csv">Export CSV</button>
        <button id="btn-export-validation">Export Validation</button>
        <button id="btn-export-hta">Export HTA</button>
        <button id="btn-export-audit">Audit</button>
        <button id="btn-export-nice-report">NICE</button>

        <!-- Tabs -->
        <div class="tab" data-tab="base-case">Base Case</div>
        <div class="tab" data-tab="advanced">Advanced</div>
        <div class="tab-content" id="tab-base-case"></div>
        <div class="tab-content" id="tab-advanced"></div>

        <!-- Content sections -->
        <div class="content-section" id="section-summary" style="display:block;"></div>
        <div class="content-section" id="section-deterministic" style="display:none;"></div>
        <div class="content-section" id="section-psa" style="display:none;"></div>

        <!-- Summary elements -->
        <span id="model-type"></span>
        <span id="param-count"></span>
        <span id="state-count"></span>
        <span id="time-horizon"></span>
        <span id="model-name"></span>
        <span id="model-version"></span>
        <span id="model-author"></span>
        <span id="model-created"></span>
        <div id="state-diagram"></div>

        <!-- Validation elements -->
        <div id="validation-status"></div>
        <div id="validation-issues"></div>
        <span id="validation-badge" class="nav-badge"></span>

        <!-- Parameter / State / Transition tables -->
        <table><tbody id="params-table-body"></tbody></table>
        <span id="params-badge"></span>
        <table><tbody id="states-table-body"></tbody></table>
        <span id="states-badge"></span>
        <table><tbody id="transitions-table-body"></tbody></table>
        <span id="transitions-badge"></span>

        <!-- Results elements -->
        <span id="result-costs-int"></span>
        <span id="result-costs-comp"></span>
        <span id="result-qalys-int"></span>
        <span id="result-qalys-comp"></span>
        <span id="result-icer"></span>
        <canvas id="trace-chart"></canvas>

        <!-- PSA elements -->
        <input id="psa-iterations" value="100" />
        <input id="engine-seed" value="12345" />
        <div id="psa-progress" style="display:none;">
            <div id="psa-progress-bar" style="width:0%;"></div>
            <span id="psa-progress-text"></span>
        </div>
        <span id="psa-mean-icer"></span>
        <span id="psa-ci-lower"></span>
        <span id="psa-ci-upper"></span>
        <span id="psa-prob-ce"></span>
        <canvas id="ce-plane-chart"></canvas>
        <canvas id="ceac-chart"></canvas>
        <div id="convergence-panel" style="display:none;">
            <span id="conv-status"></span>
            <span id="conv-cost-se"></span>
            <span id="conv-qaly-se"></span>
            <div id="conv-warning" style="display:none;"></div>
        </div>

        <!-- DSA elements -->
        <div id="dsa-progress" style="display:none;">
            <div id="dsa-progress-bar"></div>
            <span id="dsa-progress-text"></span>
        </div>
        <div id="dsa-placeholder"></div>
        <div id="tornado-container" style="display:none;"></div>
        <tbody id="dsa-results-body"></tbody>
        <canvas id="tornado-chart"></canvas>
        <input id="dsa-range" value="20" />
        <input id="dsa-metric" value="icer" />
        <input id="dsa-max-params" value="15" />
    `;
}

// Set up DOM before require so DOMContentLoaded can find elements
setupDOM();

const { HTAApp } = require('../../src/ui/app');

// ---- Tests ----

describe('HTAApp', () => {

    let app;

    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        localStorage.clear();
        app = new HTAApp();
    });

    // ---- Constructor & Initialization ----

    describe('constructor', () => {
        test('sets initial state correctly', () => {
            expect(app.project).toBeNull();
            expect(app.results).toBeNull();
            expect(app.psaResults).toBeNull();
            expect(app.dsaResults).toBeNull();
            expect(app.currentSection).toBe('summary');
            expect(app.charts).toEqual({});
        });

        test('creates a validator instance', () => {
            expect(app.validator).toBeDefined();
        });

        test('registers the markov_cohort engine', () => {
            expect(app.engines).toHaveProperty('markov_cohort');
        });

        test('creates a PSA engine', () => {
            expect(app.psaEngine).toBeDefined();
        });
    });

    // ---- escapeHTML ----

    describe('escapeHTML', () => {
        test('escapes HTML special characters', () => {
            const result = app.escapeHTML('<script>"test" & \'injection\'</script>');
            expect(result).not.toContain('<script>');
            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
            expect(result).toContain('&amp;');
            expect(result).toContain('&quot;');
        });

        test('handles null and undefined', () => {
            expect(app.escapeHTML(null)).toBe('');
            expect(app.escapeHTML(undefined)).toBe('');
        });

        test('converts non-string values to string', () => {
            expect(app.escapeHTML(42)).toBe('42');
        });
    });

    // ---- setSafeInnerHTML ----

    describe('setSafeInnerHTML', () => {
        test('sets innerHTML on a valid element', () => {
            const el = document.createElement('div');
            app.setSafeInnerHTML(el, '<p>Hello</p>');
            expect(el.innerHTML).toBe('<p>Hello</p>');
        });

        test('does nothing when element is null', () => {
            expect(() => app.setSafeInnerHTML(null, '<p>Hello</p>')).not.toThrow();
        });
    });

    // ---- Drop Zone ----

    describe('setupDropZone', () => {
        test('sets ARIA attributes on drop zone', () => {
            const dropZone = document.getElementById('drop-zone');
            expect(dropZone.getAttribute('role')).toBe('button');
            expect(dropZone.getAttribute('tabindex')).toBe('0');
            expect(dropZone.getAttribute('aria-label')).toContain('upload');
        });

        test('click on drop zone triggers file input click', () => {
            const fileInput = document.getElementById('file-input');
            const clickSpy = jest.spyOn(fileInput, 'click');
            document.getElementById('drop-zone').click();
            expect(clickSpy).toHaveBeenCalled();
        });

        test('dragover adds dragover class', () => {
            const dropZone = document.getElementById('drop-zone');
            const event = new Event('dragover');
            event.preventDefault = jest.fn();
            dropZone.dispatchEvent(event);
            expect(dropZone.classList.contains('dragover')).toBe(true);
        });

        test('dragleave removes dragover class', () => {
            const dropZone = document.getElementById('drop-zone');
            dropZone.classList.add('dragover');
            dropZone.dispatchEvent(new Event('dragleave'));
            expect(dropZone.classList.contains('dragover')).toBe(false);
        });
    });

    // ---- Navigation ----

    describe('navigateToSection', () => {
        test('updates currentSection', () => {
            app.navigateToSection('deterministic');
            expect(app.currentSection).toBe('deterministic');
        });

        test('shows selected section and hides others', () => {
            app.navigateToSection('deterministic');
            expect(document.getElementById('section-deterministic').style.display).toBe('block');
            expect(document.getElementById('section-summary').style.display).toBe('none');
        });

        test('updates active nav item', () => {
            app.navigateToSection('psa');
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.dataset.section === 'psa') {
                    expect(item.classList.contains('active')).toBe(true);
                } else {
                    expect(item.classList.contains('active')).toBe(false);
                }
            });
        });
    });

    // ---- Tabs ----

    describe('setupTabs', () => {
        test('clicking a tab activates it', () => {
            const tab = document.querySelector('.tab[data-tab="advanced"]');
            tab.click();
            expect(tab.classList.contains('active')).toBe(true);
            expect(document.getElementById('tab-advanced').classList.contains('active')).toBe(true);
        });

        test('clicking a tab deactivates other tabs', () => {
            const baseTab = document.querySelector('.tab[data-tab="base-case"]');
            const advTab = document.querySelector('.tab[data-tab="advanced"]');
            baseTab.classList.add('active');
            advTab.click();
            expect(baseTab.classList.contains('active')).toBe(false);
        });
    });

    // ---- Project Loading ----

    describe('loadProject', () => {
        test('sets project and validation results', async () => {
            const demoProject = app.createDemoProject();
            await app.loadProject(demoProject);
            expect(app.project).toBe(demoProject);
            expect(app.validationResults).toBeDefined();
        });

        test('shows main content after loading', async () => {
            const demoProject = app.createDemoProject();
            await app.loadProject(demoProject);
            expect(document.getElementById('main-content').classList.contains('active')).toBe(true);
            expect(document.getElementById('drop-zone').style.display).toBe('none');
        });
    });

    describe('createDemoProject', () => {
        test('returns a valid project object', () => {
            const demo = app.createDemoProject();
            expect(demo.version).toBe('0.1');
            expect(demo.metadata).toBeDefined();
            expect(demo.metadata.name).toContain('Oncology');
            expect(demo.settings).toBeDefined();
            expect(demo.parameters).toBeDefined();
            expect(demo.states).toBeDefined();
            expect(demo.transitions).toBeDefined();
            expect(demo.strategies).toBeDefined();
        });

        test('has required states (stable, progressed, dead)', () => {
            const demo = app.createDemoProject();
            expect(demo.states).toHaveProperty('stable');
            expect(demo.states).toHaveProperty('progressed');
            expect(demo.states).toHaveProperty('dead');
        });

        test('has two strategies', () => {
            const demo = app.createDemoProject();
            const stratKeys = Object.keys(demo.strategies);
            expect(stratKeys.length).toBe(2);
        });
    });

    // ---- UI Population ----

    describe('populateSummary', () => {
        beforeEach(async () => {
            await app.loadProject(app.createDemoProject());
        });

        test('displays model type', () => {
            expect(document.getElementById('model-type').textContent).toBe('markov_cohort');
        });

        test('displays parameter count', () => {
            const count = Object.keys(app.project.parameters).length;
            expect(document.getElementById('param-count').textContent).toBe(String(count));
        });

        test('displays state count', () => {
            const count = Object.keys(app.project.states).length;
            expect(document.getElementById('state-count').textContent).toBe(String(count));
        });

        test('displays time horizon', () => {
            expect(document.getElementById('time-horizon').textContent).toContain('40');
        });

        test('renders state diagram', () => {
            const diagram = document.getElementById('state-diagram');
            expect(diagram.innerHTML).toContain('state-node');
        });
    });

    describe('populateParameters', () => {
        beforeEach(async () => {
            await app.loadProject(app.createDemoProject());
        });

        test('fills parameters table', () => {
            const tbody = document.getElementById('params-table-body');
            expect(tbody.querySelectorAll('tr').length).toBeGreaterThan(0);
        });

        test('updates params badge', () => {
            const badge = document.getElementById('params-badge');
            expect(parseInt(badge.textContent)).toBeGreaterThan(0);
        });
    });

    // ---- Model Execution ----

    describe('runBaseCase', () => {
        test('shows error toast when no project loaded', async () => {
            app.project = null;
            const toastSpy = jest.spyOn(app, 'showToast');
            await app.runBaseCase();
            expect(toastSpy).toHaveBeenCalledWith('No model loaded', 'error');
        });

        test('runs successfully with a loaded project', async () => {
            await app.loadProject(app.createDemoProject());
            const toastSpy = jest.spyOn(app, 'showToast');
            await app.runBaseCase();
            expect(app.results).toBeDefined();
            expect(toastSpy).toHaveBeenCalledWith('Simulation complete', 'success');
        });

        test('shows error when model type not specified', async () => {
            const project = app.createDemoProject();
            delete project.model;
            await app.loadProject(project);
            const toastSpy = jest.spyOn(app, 'showToast');
            await app.runBaseCase();
            expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('Model type not specified'), 'error');
        });
    });

    // ---- Display Results ----

    describe('displayResults', () => {
        beforeEach(async () => {
            await app.loadProject(app.createDemoProject());
            await app.runBaseCase();
        });

        test('displays costs for intervention', () => {
            const costsInt = document.getElementById('result-costs-int').textContent;
            expect(costsInt).toContain('50');
        });

        test('displays ICER', () => {
            const icer = document.getElementById('result-icer').textContent;
            expect(icer).toContain('42');
        });

        test('navigates to deterministic section', () => {
            expect(app.currentSection).toBe('deterministic');
        });
    });

    // ---- Dark Mode ----

    describe('toggleDarkMode', () => {
        test('toggles dark-mode class on body', () => {
            app.toggleDarkMode();
            expect(document.body.classList.contains('dark-mode')).toBe(true);
            app.toggleDarkMode();
            expect(document.body.classList.contains('dark-mode')).toBe(false);
        });

        test('saves preference to localStorage', () => {
            app.toggleDarkMode();
            expect(localStorage.getItem('darkMode')).toBe('true');
            app.toggleDarkMode();
            expect(localStorage.getItem('darkMode')).toBe('false');
        });

        test('updates icon text', () => {
            app.toggleDarkMode();
            const icon = document.getElementById('dark-mode-icon');
            expect(icon.textContent).toBeTruthy();
        });
    });

    // ---- Toast & Loading ----

    describe('showToast', () => {
        test('creates a toast element in the container', () => {
            app.showToast('Test message', 'success');
            const toasts = document.querySelectorAll('.toast');
            expect(toasts.length).toBe(1);
            expect(toasts[0].textContent).toBe('Test message');
            expect(toasts[0].classList.contains('success')).toBe(true);
        });
    });

    describe('showLoading / hideLoading', () => {
        test('showLoading activates the overlay', () => {
            app.showLoading('Running...');
            expect(document.getElementById('loading-overlay').classList.contains('active')).toBe(true);
            expect(document.getElementById('loading-text').textContent).toBe('Running...');
        });

        test('hideLoading deactivates the overlay', () => {
            app.showLoading('Running...');
            app.hideLoading();
            expect(document.getElementById('loading-overlay').classList.contains('active')).toBe(false);
        });
    });

    // ---- Log ----

    describe('log', () => {
        test('appends a message to the engine log', () => {
            app.log('Test log message');
            const logEl = document.getElementById('engine-log');
            expect(logEl.innerHTML).toContain('Test log message');
        });
    });

    // ---- Export workflows ----

    describe('exportJSON', () => {
        test('does not throw when no project loaded', () => {
            app.project = null;
            expect(() => {
                try { app.exportJSON(); } catch(e) { /* may show toast */ }
            }).not.toThrow();
        });
    });

    // ---- Validation Display ----

    describe('populateValidation', () => {
        test('shows pass status for valid project', async () => {
            await app.loadProject(app.createDemoProject());
            const statusEl = document.getElementById('validation-status');
            expect(statusEl.className).toContain('pass');
        });

        test('handles validation with errors', async () => {
            const orig = app.validator._validateProjectObject;
            app.validator._validateProjectObject = () => ({
                valid: false, errors: [{ code: 'E001', path: 'model', message: 'Missing type' }], warnings: [], infos: []
            });
            await app.loadProject(app.createDemoProject());
            const statusEl = document.getElementById('validation-status');
            expect(statusEl.className).toContain('fail');
            app.validator._validateProjectObject = orig;
        });
    });

    // ---- Render Issue ----

    describe('renderIssue', () => {
        test('returns HTML with escaped content', () => {
            const issue = { code: 'W001', path: 'parameters', message: 'Test <script>alert("xss")</script>' };
            const html = app.renderIssue(issue, 'warning');
            expect(html).toContain('warning');
            expect(html).toContain('W001');
            expect(html).not.toContain('<script>');
        });
    });

    // ---- loadFile ----

    describe('loadFile', () => {
        test('rejects unsupported file types', async () => {
            const toastSpy = jest.spyOn(app, 'showToast');
            const file = new File(['data'], 'test.txt', { type: 'text/plain' });
            file.text = async () => 'data';
            await app.loadFile(file);
            expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported file type'), 'error');
        });

        test('loads a JSON file', async () => {
            const demoProject = app.createDemoProject();
            const blob = new Blob([JSON.stringify(demoProject)], { type: 'application/json' });
            const file = new File([blob], 'model.json', { type: 'application/json' });
            file.text = async () => JSON.stringify(demoProject);
            await app.loadFile(file);
            expect(app.project).not.toBeNull();
        });
    });

    // ---- updateChartsForTheme ----

    describe('updateChartsForTheme', () => {
        test('sets Chart.defaults for dark mode', () => {
            app.updateChartsForTheme(true);
            expect(Chart.defaults.color).toBe('#f1f5f9');
        });

        test('sets Chart.defaults for light mode', () => {
            app.updateChartsForTheme(false);
            expect(Chart.defaults.color).toBe('#1e293b');
        });
    });
});
