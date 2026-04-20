/**
 * Additional tests for src/ui/advancedUI.js - AdvancedFeaturesUI
 * Covers methods from line 241 onward that have 0% coverage.
 */

'use strict';

// ---- Mock Chart.js ----
global.Chart = jest.fn(() => ({
    destroy: jest.fn(),
    update: jest.fn(),
    data: { datasets: [] }
}));
Chart.defaults = {};

// ---- Comprehensive DOM fixture ----
function setupDOM() {
    document.body.innerHTML = `
        <!-- Microsimulation -->
        <button id="btn-run-microsim">Run Microsim</button>
        <input id="microsim-patients" value="500" />
        <input id="microsim-record-history" type="checkbox" checked />
        <input id="microsim-seed" value="42" />
        <div id="microsim-progress" style="display:none;">
            <div id="microsim-progress-bar" style="width:0%;"></div>
            <span id="microsim-progress-text"></span>
        </div>
        <div id="microsim-results" style="display:none;">
            <span id="microsim-mean-cost"></span>
            <span id="microsim-mean-qaly"></span>
            <span id="microsim-mean-ly"></span>
            <span id="microsim-cost-ci"></span>
            <span id="microsim-qaly-ci"></span>
        </div>
        <canvas id="microsim-state-chart"></canvas>
        <canvas id="microsim-trace-chart"></canvas>

        <!-- Survival Fitting -->
        <button id="btn-fit-survival">Fit Survival</button>
        <button id="btn-import-km">Import KM</button>
        <input id="km-file-input" type="file" />
        <div id="km-data-summary"></div>
        <canvas id="km-chart"></canvas>
        <div id="survival-fit-results" style="display:none;">
            <span id="best-model"></span>
            <span id="best-aic"></span>
            <span id="best-bic"></span>
            <span id="best-r2"></span>
            <span id="model-recommendation"></span>
            <table><tbody id="survival-fit-body"></tbody></table>
        </div>
        <canvas id="survival-comparison-chart"></canvas>

        <!-- DES -->
        <button id="btn-run-des">Run DES</button>
        <input id="des-patients" value="1000" />
        <input id="des-max-time" value="50" />
        <input id="des-seed" value="12345" />
        <div id="des-progress" style="display:none;">
            <div id="des-progress-bar" style="width:0%;"></div>
            <span id="des-progress-text"></span>
        </div>
        <div id="des-results" style="display:none;">
            <span id="des-mean-cost"></span>
            <span id="des-mean-qaly"></span>
            <span id="des-mean-ly"></span>
            <table><tbody id="des-state-stats-body"></tbody></table>
            <table><tbody id="des-event-stats-body"></tbody></table>
        </div>

        <!-- Calibration -->
        <button id="btn-run-calibration">Calibrate</button>
        <select id="calibration-method"><option value="nelder-mead">Nelder-Mead</option></select>
        <input id="calibration-iterations" value="500" />
        <div id="calibration-progress" style="display:none;">
            <div id="calibration-progress-bar"></div>
            <span id="calibration-progress-text"></span>
        </div>
        <div id="calibration-results" style="display:none;">
            <span id="calib-converged"></span>
            <span id="calib-iterations"></span>
            <span id="calib-log-likelihood"></span>
            <span id="calib-r2"></span>
            <span id="calib-rmse"></span>
            <span id="calib-aic"></span>
            <span id="calib-bic"></span>
            <table><tbody id="calib-param-results-body"></tbody></table>
            <table><tbody id="calib-target-results-body"></tbody></table>
        </div>

        <!-- EVPPI -->
        <button id="btn-calc-evppi">Calc EVPPI</button>
        <input id="evppi-wtp" value="30000" />
        <div id="evppi-results" style="display:none;">
            <span id="evppi-total-evpi"></span>
            <table><tbody id="evppi-results-body"></tbody></table>
        </div>
        <canvas id="evppi-chart"></canvas>

        <!-- NMA -->
        <button id="btn-run-nma">NMA</button>
        <table><tbody id="nma-data-body"></tbody></table>
        <div id="nma-network-graph"></div>
        <table><tbody id="nma-results-body"></tbody></table>
        <div id="nma-forest-plot"></div>

        <!-- MA -->
        <button id="btn-run-ma">MA</button>
        <select id="ma-method"><option value="REML">REML</option></select>
        <input id="ma-hksj" type="checkbox" />
        <table><tbody id="ma-data-body"></tbody></table>
        <div id="ma-summary"></div>
        <div id="ma-forest-plot"></div>

        <!-- Publication Bias -->
        <button id="btn-run-pub-bias">Pub Bias</button>
        <div id="pb-egger-results"></div>
        <div id="pb-trimfill-results"></div>
        <div id="pb-funnel-plot"></div>
        <span id="pb-unadjusted"></span>
        <span id="pb-adjusted"></span>
        <div id="pb-detailed-results"></div>
        <canvas id="pb-sensitivity-chart"></canvas>
        <select id="pb-method"><option value="copas">Copas</option></select>
        <input id="pb-cutoffs" value="0.05,0.10" />

        <!-- Three-Level MA -->
        <button id="btn-run-3level">3-Level</button>
        <select id="3level-method"><option value="REML">REML</option></select>
        <input id="3level-ci" value="0.95" />
        <input id="3level-study-var" value="study" />
        <div id="3level-results" style="display:none;">
            <span id="3level-pooled"></span>
            <span id="3level-ci-display"></span>
            <span id="3level-tau2-between"></span>
            <span id="3level-tau2-within"></span>
            <span id="3level-i2-l2"></span>
            <span id="3level-i2-l3"></span>
            <span id="3level-interpretation"></span>
        </div>

        <!-- Multivariate MA -->
        <button id="btn-run-mv">MV</button>
        <button id="btn-add-mv-outcome">Add MV Outcome</button>
        <div id="mv-outcomes-container"></div>
        <div id="mv-results" style="display:none;">
            <table><tbody id="mv-effects-body"></tbody></table>
            <div id="mv-correlation-matrix"></div>
        </div>

        <!-- Dose-Response -->
        <button id="btn-run-dr">Dose-Response</button>
        <input id="dr-knots" value="3" />
        <select id="dr-model"><option value="random">Random</option></select>
        <div id="dr-results" style="display:none;">
            <span id="dr-nonlinearity"></span>
            <span id="dr-nonlin-p"></span>
            <span id="dr-overall-p"></span>
            <span id="dr-tau2"></span>
        </div>
        <canvas id="dr-curve-chart"></canvas>

        <!-- Component NMA -->
        <button id="btn-run-cnma">Component NMA</button>
        <select id="cnma-model"><option value="additive">Additive</option></select>
        <div id="cnma-results" style="display:none;">
            <table><tbody id="cnma-effects-body"></tbody></table>
            <div id="cnma-components-select"></div>
            <button id="btn-predict-cnma">Predict</button>
            <div id="cnma-prediction" style="display:none;">
                <span id="cnma-pred-effect"></span>
                <span id="cnma-pred-ci"></span>
            </div>
        </div>

        <!-- IPD -->
        <button id="btn-run-ipd">IPD</button>
        <textarea id="ipd-data-input"></textarea>
        <select id="ipd-method"><option value="one-stage">One-stage</option></select>
        <select id="ipd-outcome"><option value="continuous">Continuous</option></select>
        <select id="ipd-random-slopes"><option value="no">No</option></select>
        <input id="ipd-covariates" value="" />
        <div id="ipd-results"></div>

        <!-- DTA -->
        <button id="btn-run-dta">DTA</button>
        <textarea id="dta-data-input"></textarea>
        <select id="dta-model"><option value="bivariate">Bivariate</option></select>
        <input id="dta-reference" value="" />
        <span id="dta-sensitivity"></span>
        <span id="dta-specificity"></span>
        <span id="dta-auc"></span>
        <canvas id="dta-sroc-chart"></canvas>

        <!-- Advanced Publication Bias -->
        <button id="btn-run-advanced-pb">Advanced PB</button>

        <!-- Fabrication -->
        <button id="btn-run-fabrication">Fabrication</button>
        <textarea id="fabrication-data-input"></textarea>
        <input id="fab-decimals" value="2" />
        <input id="test-grim" type="checkbox" checked />
        <input id="test-grimmer" type="checkbox" checked />
        <input id="test-sprite" type="checkbox" />
        <input id="test-statcheck" type="checkbox" />
        <table><tbody id="fabrication-table-body"></tbody></table>

        <!-- MR -->
        <button id="btn-run-mr">MR</button>
        <textarea id="mr-data-input"></textarea>
        <select id="mr-method"><option value="ivw">IVW</option></select>
        <select id="mr-effect"><option value="random">Random</option></select>
        <table><tbody id="mr-results-table"></tbody></table>
        <canvas id="mr-scatter-chart"></canvas>

        <!-- Historical -->
        <button id="btn-run-historical">Historical</button>
        <select id="historical-method"><option value="power-prior">Power Prior</option></select>
        <input id="current-n" value="50" />
        <input id="current-mean" value="5.0" />
        <input id="current-sd" value="1.2" />
        <input id="historical-n" value="100" />
        <input id="historical-mean" value="5.5" />
        <input id="historical-sd" value="1.5" />
        <input id="historical-a0" value="0.5" />
        <span id="hist-current-only"></span>
        <span id="hist-with-borrowing"></span>
        <span id="hist-effective-n"></span>

        <!-- Survival MA -->
        <button id="btn-run-survival-ma">Survival MA</button>
        <textarea id="survival-data-input"></textarea>
        <select id="survival-approach"><option value="fp">Fractional Polynomial</option></select>
        <input id="survival-complexity" value="2" />
        <canvas id="survival-curves-chart"></canvas>

        <!-- Threshold -->
        <button id="btn-run-threshold">Threshold</button>
        <textarea id="threshold-data-input"></textarea>
        <select id="threshold-context"><option value="nma">NMA</option></select>
        <select id="threshold-criterion"><option value="best">Best</option></select>
        <table><tbody id="threshold-results-table"></tbody></table>

        <!-- Federated -->
        <button id="btn-run-federated">Federated</button>
        <textarea id="federated-data"></textarea>
        <textarea id="federated-data-input"></textarea>
        <select id="federated-method"><option value="distributed">Distributed</option></select>
        <input id="federated-epsilon" value="1.0" />
        <span id="fed-estimate"></span>
        <span id="fed-ci"></span>
        <span id="fed-privacy"></span>
        <span id="fed-privacy-desc"></span>
        <canvas id="fed-weights-chart"></canvas>
        <canvas id="federated-weights-chart"></canvas>
    `;
}

// Prevent DOMContentLoaded from auto-initializing
const dcListeners = [];
const origAddEventListener = document.addEventListener.bind(document);
document.addEventListener = jest.fn((event, handler) => {
    if (event === 'DOMContentLoaded') {
        dcListeners.push(handler);
        return;
    }
    origAddEventListener(event, handler);
});

// ---- Load module ----
setupDOM();
const { AdvancedFeaturesUI } = require('../../src/ui/advancedUI');

// ---- Mock app object ----
function createMockApp() {
    return {
        project: null,
        charts: {},
        psaResults: null,
        showToast: jest.fn(),
        showLoading: jest.fn(),
        hideLoading: jest.fn(),
        log: jest.fn()
    };
}

// ---- Tests ----

describe('AdvancedFeaturesUI - Extended Coverage', () => {

    let ui, mockApp;

    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        Chart.mockClear();
        mockApp = createMockApp();
        ui = new AdvancedFeaturesUI(mockApp);
    });

    // ==================== MICROSIMULATION (full run) ====================

    describe('runMicrosimulation (full path)', () => {
        test('reads form values and runs engine successfully', async () => {
            mockApp.project = {
                strategies: {
                    strat1: { is_comparator: true, parameter_overrides: { p1: 0.1 } },
                    strat2: { is_comparator: false, parameter_overrides: { p2: 0.2 } }
                }
            };
            const mockResults = {
                summary: {
                    meanCost: 10000, meanQALY: 3.5, meanLY: 5.0,
                    costCI: [8000, 12000], qalyCI: [3.0, 4.0]
                }
            };
            ui.microsimEngine = {
                options: null,
                onProgress: null,
                run: jest.fn().mockResolvedValue(mockResults)
            };

            await ui.runMicrosimulation();

            expect(ui.microsimEngine.run).toHaveBeenCalled();
            expect(ui.microsimEngine.options.patients).toBe(500);
            expect(ui.microsimEngine.options.seed).toBe(42);
            expect(ui.microsimEngine.options.recordHistory).toBe(true);
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('500 patients'), 'success'
            );
        });

        test('handles engine error', async () => {
            mockApp.project = { strategies: {} };
            ui.microsimEngine = {
                options: null,
                onProgress: null,
                run: jest.fn().mockRejectedValue(new Error('Engine crash'))
            };

            await ui.runMicrosimulation();

            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Engine crash'), 'error'
            );
            expect(document.getElementById('microsim-progress').style.display).toBe('none');
        });

        test('progress callback updates DOM', async () => {
            mockApp.project = { strategies: {} };
            ui.microsimEngine = {
                options: null,
                onProgress: null,
                run: jest.fn(async function() {
                    // simulate progress callback
                    if (this.onProgress) this.onProgress(50, 100);
                    return {
                        summary: { meanCost: 0, meanQALY: 0, meanLY: 0 }
                    };
                })
            };

            await ui.runMicrosimulation();

            expect(document.getElementById('microsim-progress-bar').style.width).toBe('50%');
            expect(document.getElementById('microsim-progress-text').textContent).toBe('50%');
        });
    });

    // ==================== displayMicrosimResults (extended) ====================

    describe('displayMicrosimResults (extended)', () => {
        test('renders cost and QALY CIs', () => {
            const results = {
                summary: {
                    meanCost: 12345.67,
                    meanQALY: 3.456,
                    meanLY: 5.12,
                    costCI: [10000, 15000],
                    qalyCI: [3.0, 4.0]
                }
            };
            ui.displayMicrosimResults(results);

            expect(document.getElementById('microsim-mean-cost').textContent).toContain('12345.67');
            expect(document.getElementById('microsim-mean-qaly').textContent).toContain('3.4560');
            expect(document.getElementById('microsim-cost-ci').textContent).toContain('10000');
            expect(document.getElementById('microsim-qaly-ci').textContent).toContain('3.0000');
        });

        test('handles stateTimeDistribution', () => {
            const results = {
                summary: { meanCost: 0, meanQALY: 0, meanLY: 0 },
                stateTimeDistribution: {
                    stable: { mean: 5.2 },
                    progressed: { mean: 2.1 }
                }
            };
            ui.displayMicrosimResults(results);
            // Chart constructor should be called for the state chart
            expect(Chart).toHaveBeenCalled();
        });

        test('handles intervention and comparator traces', () => {
            const results = {
                summary: { meanCost: 0, meanQALY: 0, meanLY: 0 },
                intervention: { trace: { stable: [1, 0.9, 0.8], dead: [0, 0.1, 0.2] } },
                comparator: { trace: { stable: [1, 0.85, 0.7], dead: [0, 0.15, 0.3] } }
            };
            ui.displayMicrosimResults(results);
            expect(Chart).toHaveBeenCalled();
        });
    });

    // ==================== renderStateTimeChart ====================

    describe('renderStateTimeChart', () => {
        test('creates bar chart', () => {
            ui.renderStateTimeChart({ stable: { mean: 5 }, dead: { mean: 1 } });
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'bar' })
            );
        });

        test('destroys existing chart first', () => {
            const destroyFn = jest.fn();
            mockApp.charts.microsimState = { destroy: destroyFn };
            ui.renderStateTimeChart({ s1: { mean: 3 } });
            expect(destroyFn).toHaveBeenCalled();
        });

        test('returns if canvas not found', () => {
            document.getElementById('microsim-state-chart').remove();
            ui.renderStateTimeChart({ s1: { mean: 3 } });
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    // ==================== renderMicrosimTraceComparison ====================

    describe('renderMicrosimTraceComparison', () => {
        test('creates line chart with intervention and comparator traces', () => {
            const results = {
                intervention: { trace: { stable: [1, 0.9], dead: [0, 0.1] } },
                comparator: { trace: { stable: [1, 0.8], dead: [0, 0.2] } }
            };
            ui.renderMicrosimTraceComparison(results);
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'line' })
            );
        });

        test('returns if canvas not found', () => {
            document.getElementById('microsim-trace-chart').remove();
            ui.renderMicrosimTraceComparison({
                intervention: { trace: {} },
                comparator: { trace: {} }
            });
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    // ==================== Survival Curve Fitting ====================

    describe('importKaplanMeier', () => {
        test('triggers file input click', () => {
            const input = document.getElementById('km-file-input');
            const spy = jest.spyOn(input, 'click');
            ui.importKaplanMeier();
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('fitSurvivalCurves', () => {
        test('shows warning when no KM data', async () => {
            ui.kmData = null;
            await ui.fitSurvivalCurves();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Import Kaplan-Meier data first', 'warning'
            );
        });

        test('shows error when engine not available', async () => {
            ui.kmData = { points: [] };
            ui.survivalEngine = null;
            await ui.fitSurvivalCurves();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Survival engine not available', 'error'
            );
        });

        test('runs engine with default distributions', async () => {
            ui.kmData = { points: [{ time: 0, survival: 1 }] };
            const mockFitResults = {
                best: { distribution: 'weibull', aic: 100, bic: 110, r2: 0.95 },
                recommendation: 'Use weibull',
                ranked: []
            };
            ui.survivalEngine = {
                fitAllDistributions: jest.fn().mockReturnValue(mockFitResults)
            };

            await ui.fitSurvivalCurves();
            expect(ui.survivalEngine.fitAllDistributions).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith('Survival curves fitted', 'success');
        });

        test('handles engine error', async () => {
            ui.kmData = { points: [] };
            ui.survivalEngine = {
                fitAllDistributions: jest.fn(() => { throw new Error('Fit failed'); })
            };

            await ui.fitSurvivalCurves();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Fit failed'), 'error'
            );
        });
    });

    describe('displayKMData', () => {
        test('renders KM summary', () => {
            ui.kmData = {
                points: [{ time: 0, survival: 1 }, { time: 5, survival: 0.5 }],
                raw: { totalPatients: 100, totalEvents: 40 },
                medianSurvival: 6.2,
                meanSurvival: 7.5
            };
            ui.displayKMData();
            const summary = document.getElementById('km-data-summary').innerHTML;
            expect(summary).toContain('2'); // points count
            expect(summary).toContain('100'); // total patients
        });

        test('returns if container missing', () => {
            document.getElementById('km-data-summary').remove();
            ui.kmData = { points: [] };
            expect(() => ui.displayKMData()).not.toThrow();
        });

        test('returns if no kmData', () => {
            ui.kmData = null;
            expect(() => ui.displayKMData()).not.toThrow();
        });
    });

    describe('renderKMChart', () => {
        test('creates line chart for KM data', () => {
            ui.kmData = { points: [{ time: 0, survival: 1 }, { time: 5, survival: 0.5 }] };
            ui.renderKMChart();
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'line' })
            );
        });

        test('returns if no canvas', () => {
            document.getElementById('km-chart').remove();
            ui.kmData = { points: [] };
            ui.renderKMChart();
            expect(Chart).not.toHaveBeenCalled();
        });

        test('returns if no kmData', () => {
            ui.kmData = null;
            ui.renderKMChart();
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    // ==================== DES ====================

    describe('runDES', () => {
        test('shows error when no project', async () => {
            mockApp.project = null;
            await ui.runDES();
            expect(mockApp.showToast).toHaveBeenCalledWith('No model loaded', 'error');
        });

        test('shows error when no engine', async () => {
            mockApp.project = { states: {} };
            ui.desEngine = null;
            await ui.runDES();
            expect(mockApp.showToast).toHaveBeenCalledWith('DES engine not available', 'error');
        });
    });

    // ==================== convertToDesModel ====================

    describe('convertToDesModel', () => {
        test('converts basic Markov project to DES model', () => {
            const project = {
                parameters: { p1: { value: 0.1 } },
                states: {
                    stable: { cost: 1000, utility: 0.8, type: 'transient', initial_probability: 1 },
                    dead: { cost: 0, utility: 0, type: 'absorbing', initial_probability: 0 }
                },
                transitions: {
                    t1: { from: 'stable', to: 'dead', probability: 0.05 }
                }
            };

            const model = ui.convertToDesModel(project);

            expect(model.initialState).toBe('stable');
            expect(model.states.stable.costPerTime).toBe(1000);
            expect(model.states.stable.utilityPerTime).toBe(0.8);
            expect(model.states.dead.terminal).toBe(true);
            expect(model.transitions.length).toBeGreaterThan(0);
        });

        test('handles string parameter references for cost/utility', () => {
            const project = {
                parameters: { cost_stable: 500, util_stable: 0.7 },
                states: {
                    stable: { cost: 'cost_stable', utility: 'util_stable', type: 'transient', initial_probability: 1 }
                },
                transitions: {}
            };

            const model = ui.convertToDesModel(project);
            expect(model.states.stable.costPerTime).toBe(500);
            expect(model.states.stable.utilityPerTime).toBe(0.7);
        });

        test('handles string expression for transition probability', () => {
            const project = {
                parameters: { tp: 0.1 },
                states: {
                    A: { cost: 0, utility: 0, type: 'transient', initial_probability: 1 },
                    B: { cost: 0, utility: 0, type: 'absorbing', initial_probability: 0 }
                },
                transitions: {
                    t1: { from: 'A', to: 'B', probability: 'tp' }
                }
            };

            const model = ui.convertToDesModel(project);
            expect(model.transitions.length).toBe(1);
        });

        test('skips self-loop transitions', () => {
            const project = {
                parameters: {},
                states: {
                    A: { cost: 0, utility: 0, type: 'transient', initial_probability: 1 }
                },
                transitions: {
                    t1: { from: 'A', to: 'A', probability: 0.9 }
                }
            };

            const model = ui.convertToDesModel(project);
            expect(model.transitions.length).toBe(0);
        });

        test('handles empty project', () => {
            const model = ui.convertToDesModel({ parameters: {}, states: {}, transitions: {} });
            expect(model.initialState).toBe('stable');
            expect(Object.keys(model.states).length).toBe(0);
        });
    });

    // ==================== evaluateExpression ====================

    describe('evaluateExpression', () => {
        test('returns number directly', () => {
            expect(ui.evaluateExpression(42, {})).toBe(42);
        });

        test('throws for non-string/number', () => {
            expect(() => ui.evaluateExpression(null, {})).toThrow('Expression must be a string or number');
        });

        test('looks up parameter name', () => {
            expect(ui.evaluateExpression('myParam', { myParam: 0.5 })).toBe(0.5);
        });

        test('parses numeric string', () => {
            expect(ui.evaluateExpression('3.14', {})).toBe(3.14);
        });

        test('throws for complex expression when parser unavailable', () => {
            expect(() => ui.evaluateExpression('a + b', { a: 1, b: 2 })).toThrow(
                'Expression parser unavailable'
            );
        });

        test('uses ExpressionParser when available', () => {
            global.ExpressionParser = { evaluate: jest.fn().mockReturnValue(10) };
            expect(ui.evaluateExpression('a + b', { a: 1, b: 2 })).toBe(10);
            delete global.ExpressionParser;
        });
    });

    // ==================== displayDESResults ====================

    describe('displayDESResults', () => {
        test('populates DES results DOM', () => {
            // Create the needed container if not in DOM
            const container = document.getElementById('des-results');
            const results = {
                summary: {
                    meanDiscountedCost: 5000.12,
                    meanDiscountedQALY: 2.5678,
                    meanLY: 3.45
                },
                stateStatistics: {
                    stable: { entries: 100, meanTime: 3.5, totalTime: 350 }
                },
                eventStatistics: {
                    transition_1: { count: 50, meanTime: 2.1 }
                }
            };
            ui.displayDESResults(results);
            expect(container.style.display).toBe('block');
        });

        test('returns if container not found', () => {
            document.getElementById('des-results').remove();
            expect(() => ui.displayDESResults({ summary: {} })).not.toThrow();
        });
    });

    // ==================== Calibration ====================

    describe('runCalibration', () => {
        test('shows error when no project', async () => {
            mockApp.project = null;
            await ui.runCalibration();
            expect(mockApp.showToast).toHaveBeenCalledWith('No model loaded', 'error');
        });

        test('shows error when no engine', async () => {
            mockApp.project = { states: {} };
            ui.calibrationEngine = null;
            await ui.runCalibration();
            expect(mockApp.showToast).toHaveBeenCalledWith('Calibration engine not available', 'error');
        });

        test('shows warning when no params/targets', async () => {
            mockApp.project = { states: {} };
            ui.calibrationEngine = { calibrate: jest.fn() };
            // No calibration rows in DOM, so getCalibrationParameters returns []
            await ui.runCalibration();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Define calibration parameters and targets', 'warning'
            );
        });
    });

    describe('getCalibrationParameters', () => {
        test('returns empty array when no rows exist', () => {
            expect(ui.getCalibrationParameters()).toEqual([]);
        });

        test('parses calibration parameter rows', () => {
            const row = document.createElement('div');
            row.className = 'calibration-param-row';
            row.innerHTML = `
                <input class="calib-param-name" value="tp_prog" />
                <input class="calib-param-lower" value="0.01" />
                <input class="calib-param-upper" value="0.5" />
            `;
            document.body.appendChild(row);

            const params = ui.getCalibrationParameters();
            expect(params).toEqual([{ name: 'tp_prog', bounds: [0.01, 0.5] }]);
        });
    });

    describe('getCalibrationTargets', () => {
        test('returns empty array when no rows exist', () => {
            expect(ui.getCalibrationTargets()).toEqual([]);
        });

        test('parses calibration target rows', () => {
            const row = document.createElement('div');
            row.className = 'calibration-target-row';
            row.innerHTML = `
                <input class="calib-target-name" value="5yr_surv" />
                <input class="calib-target-observed" value="0.75" />
                <select class="calib-target-type"><option value="state_proportion" selected>State</option></select>
                <input class="calib-target-time" value="5" />
                <input class="calib-target-weight" value="2" />
            `;
            document.body.appendChild(row);

            const targets = ui.getCalibrationTargets();
            expect(targets.length).toBe(1);
            expect(targets[0].name).toBe('5yr_surv');
            expect(targets[0].observed).toBe(0.75);
            expect(targets[0].weight).toBe(2);
        });
    });

    describe('displayCalibrationResults', () => {
        test('renders calibration results', () => {
            mockApp.project = { parameters: { tp: { value: 0.1 } } };
            const results = {
                converged: true,
                iterations: 200,
                logLikelihood: -45.3,
                goodnessOfFit: { r2: 0.95, rmse: 0.012, aic: 100, bic: 110 },
                calibratedParameters: { tp: 0.15 },
                uncertainty: { tp: { se: 0.02 } },
                targetComparison: [
                    { name: '5yr_surv', observed: 0.75, predicted: 0.74 }
                ]
            };

            ui.displayCalibrationResults(results);
            expect(document.getElementById('calib-converged').textContent).toBe('Yes');
            expect(document.getElementById('calib-iterations').textContent).toBe('200');
        });

        test('returns if container not found', () => {
            document.getElementById('calibration-results').remove();
            expect(() => ui.displayCalibrationResults({})).not.toThrow();
        });
    });

    // ==================== EVPPI ====================

    describe('calculateEVPPI', () => {
        test('shows warning when no PSA results', async () => {
            mockApp.psaResults = null;
            await ui.calculateEVPPI();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Run PSA first to calculate EVPPI', 'warning'
            );
        });

        test('shows error when no engine', async () => {
            mockApp.psaResults = { scatter: [{}] };
            ui.evppiCalculator = null;
            await ui.calculateEVPPI();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'EVPPI calculator not available', 'error'
            );
        });
    });

    describe('getResearchPriority', () => {
        test('returns High for >= 20%', () => {
            expect(ui.getResearchPriority('25')).toContain('High');
        });

        test('returns Medium for 10-19%', () => {
            expect(ui.getResearchPriority('15')).toContain('Medium');
        });

        test('returns Low for < 10%', () => {
            expect(ui.getResearchPriority('5')).toContain('Low');
        });
    });

    describe('renderEVPPIChart', () => {
        test('creates horizontal bar chart', () => {
            ui.renderEVPPIChart({
                parameters: [{ parameter: 'p1', evppi: 100 }, { parameter: 'p2', evppi: 50 }]
            });
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'bar' })
            );
        });

        test('returns if canvas missing', () => {
            document.getElementById('evppi-chart').remove();
            ui.renderEVPPIChart({ parameters: [] });
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    // ==================== NMA ====================

    describe('runNMA', () => {
        test('shows warning when fewer than 2 studies', async () => {
            // No rows in nma-data-body
            await ui.runNMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 2 studies'), 'warning'
            );
        });

        test('shows error when engine not available', async () => {
            // Add some rows to pass data check
            const tbody = document.getElementById('nma-data-body');
            for (let i = 0; i < 2; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input value="Study${i}" /></td>
                    <td><input value="Treatment${i}" /></td>
                    <td><input value="${0.5 + i}" /></td>
                    <td><input value="0.1" /></td>
                `;
                tbody.appendChild(tr);
            }
            // No engine defined globally
            await ui.runNMA();
            expect(mockApp.showToast).toHaveBeenCalledWith('NMA engine not available', 'error');
        });
    });

    describe('getNMADataFromInputs', () => {
        test('returns empty for no rows', () => {
            expect(ui.getNMADataFromInputs()).toEqual([]);
        });

        test('parses NMA rows correctly', () => {
            const tbody = document.getElementById('nma-data-body');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input value="Smith2020" /></td>
                <td><input value="DrugA" /></td>
                <td><input value="0.5" /></td>
                <td><input value="0.1" /></td>
            `;
            tbody.appendChild(tr);

            const data = ui.getNMADataFromInputs();
            expect(data.length).toBe(1);
            expect(data[0].study).toBe('Smith2020');
            expect(data[0].treatment).toBe('DrugA');
            expect(data[0].effect).toBe(0.5);
            expect(data[0].se).toBe(0.1);
        });

        test('skips rows with zero SE', () => {
            const tbody = document.getElementById('nma-data-body');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input value="Study1" /></td>
                <td><input value="Drug" /></td>
                <td><input value="0.3" /></td>
                <td><input value="0" /></td>
            `;
            tbody.appendChild(tr);
            expect(ui.getNMADataFromInputs().length).toBe(0);
        });
    });

    // ==================== Pairwise MA ====================

    describe('runMetaAnalysis', () => {
        test('shows warning with fewer than 2 studies', async () => {
            await ui.runMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 2 studies'), 'warning'
            );
        });

        test('shows error when engine not available', async () => {
            const tbody = document.getElementById('ma-data-body');
            for (let i = 0; i < 2; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input value="Study${i}" /></td>
                    <td><input value="${0.3 + i * 0.1}" /></td>
                    <td><input value="0.1" /></td>
                `;
                tbody.appendChild(tr);
            }
            await ui.runMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith('Meta-analysis engine not available', 'error');
        });

        test('runs engine and displays results', async () => {
            const tbody = document.getElementById('ma-data-body');
            for (let i = 0; i < 2; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input value="Study${i}" /></td>
                    <td><input value="${0.3 + i * 0.1}" /></td>
                    <td><input value="0.1" /></td>
                `;
                tbody.appendChild(tr);
            }
            global.MetaAnalysisMethods = jest.fn(() => ({
                analyze: jest.fn().mockReturnValue({
                    pooled: { effect: 0.35, ci_lower: 0.2, ci_upper: 0.5 },
                    heterogeneity: { I2: 0.3, tau2: 0.01, Q: 2.5 },
                    studies: [
                        { study: 'Study0', effect: 0.3, se: 0.1 },
                        { study: 'Study1', effect: 0.4, se: 0.1 }
                    ]
                })
            }));

            await ui.runMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith('Meta-analysis completed', 'success');
            const summary = document.getElementById('ma-summary').innerHTML;
            expect(summary).toContain('0.350');
            delete global.MetaAnalysisMethods;
        });
    });

    describe('getMADataFromInputs', () => {
        test('returns empty for no rows', () => {
            expect(ui.getMADataFromInputs()).toEqual([]);
        });

        test('parses valid MA rows', () => {
            const tbody = document.getElementById('ma-data-body');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input value="Jones2021" /></td>
                <td><input value="0.8" /></td>
                <td><input value="0.15" /></td>
            `;
            tbody.appendChild(tr);

            const data = ui.getMADataFromInputs();
            expect(data.length).toBe(1);
            expect(data[0].study).toBe('Jones2021');
            expect(data[0].yi).toBe(0.8);
            expect(data[0].sei).toBe(0.15);
        });
    });

    // ==================== Publication Bias ====================

    describe('runPublicationBias', () => {
        test('shows warning with fewer than 3 studies', async () => {
            await ui.runPublicationBias();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 3 studies'), 'warning'
            );
        });
    });

    describe('renderForestPlot', () => {
        test('creates chart in container', () => {
            const container = document.getElementById('ma-forest-plot');
            const studies = [
                { study: 'S1', effect: 0.5, ci_lower: 0.2, ci_upper: 0.8 },
                { study: 'S2', effect: 0.7, ci_lower: 0.4, ci_upper: 1.0 }
            ];
            ui.renderForestPlot(container, studies, 'Test Plot');
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'bar' })
            );
        });
    });

    describe('renderFunnelPlot', () => {
        test('creates scatter chart', () => {
            const container = document.getElementById('pb-funnel-plot');
            const studies = [
                { yi: 0.5, sei: 0.1 },
                { yi: 0.7, sei: 0.15 }
            ];
            ui.renderFunnelPlot(container, studies, 0.6);
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'scatter' })
            );
        });
    });

    // ==================== Helper / Utility Methods ====================

    describe('normalizeHeader', () => {
        test('lowercases and replaces non-word chars', () => {
            expect(ui.normalizeHeader('Effect Size')).toBe('effect_size');
        });

        test('strips leading/trailing underscores', () => {
            expect(ui.normalizeHeader('_test_')).toBe('test');
        });

        test('handles null/undefined', () => {
            expect(ui.normalizeHeader(null)).toBe('');
            expect(ui.normalizeHeader(undefined)).toBe('');
        });
    });

    describe('splitCSVLine', () => {
        test('splits simple CSV', () => {
            expect(ui.splitCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
        });

        test('handles quoted fields', () => {
            expect(ui.splitCSVLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
        });

        test('handles escaped quotes', () => {
            expect(ui.splitCSVLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
        });

        test('handles empty fields', () => {
            expect(ui.splitCSVLine('a,,c')).toEqual(['a', '', 'c']);
        });
    });

    describe('parseCSVTextArea', () => {
        test('returns empty for missing element', () => {
            expect(ui.parseCSVTextArea('nonexistent')).toEqual([]);
        });

        test('returns empty for empty textarea', () => {
            expect(ui.parseCSVTextArea('ipd-data-input')).toEqual([]);
        });

        test('parses CSV text', () => {
            document.getElementById('ipd-data-input').value = 'study,outcome\nA,1.5\nB,2.0';
            const rows = ui.parseCSVTextArea('ipd-data-input');
            expect(rows.length).toBe(2);
            expect(rows[0].study).toBe('A');
            expect(rows[0].outcome).toBe('1.5');
        });

        test('parses JSON array', () => {
            document.getElementById('ipd-data-input').value = '[{"study":"A","outcome":"1.5"},{"study":"B","outcome":"2.0"}]';
            const rows = ui.parseCSVTextArea('ipd-data-input');
            expect(rows.length).toBe(2);
            expect(rows[0].study).toBe('A');
        });

        test('falls through to CSV on invalid JSON', () => {
            // Starts with [ but is not valid JSON, falls through to CSV parsing
            document.getElementById('ipd-data-input').value = '[not valid json\nstudy,val\nA,1';
            const rows = ui.parseCSVTextArea('ipd-data-input');
            // After JSON parse fails, falls to CSV: first line is header "[not valid json"
            // Second line "study,val" becomes a data row, third line "A,1" becomes a data row
            // Actually the header is "[not valid json" which has no commas, so it becomes 1 column
            // Then "study,val" has 2 values but header only has 1 key
            // Let's just verify it doesn't throw and returns something
            expect(Array.isArray(rows)).toBe(true);
        });

        test('returns empty for single-line text', () => {
            document.getElementById('ipd-data-input').value = 'just_header';
            const rows = ui.parseCSVTextArea('ipd-data-input');
            expect(rows.length).toBe(0);
        });
    });

    describe('getRowValue', () => {
        test('returns first matching key value', () => {
            const row = { study: 'A', trial: 'B' };
            expect(ui.getRowValue(row, ['study', 'trial'])).toBe('A');
        });

        test('falls back to second key', () => {
            const row = { trial: 'B' };
            expect(ui.getRowValue(row, ['study', 'trial'])).toBe('B');
        });

        test('returns fallback when no key matches', () => {
            expect(ui.getRowValue({}, ['study'], 'default')).toBe('default');
        });

        test('skips empty string values', () => {
            const row = { study: '', trial: 'B' };
            expect(ui.getRowValue(row, ['study', 'trial'])).toBe('B');
        });
    });

    describe('parseNumber', () => {
        test('parses valid number', () => {
            expect(ui.parseNumber('3.14')).toBe(3.14);
        });

        test('returns fallback for NaN', () => {
            expect(ui.parseNumber('abc', 0)).toBe(0);
        });

        test('returns fallback for Infinity', () => {
            expect(ui.parseNumber('Infinity', -1)).toBe(-1);
        });

        test('parses zero correctly', () => {
            expect(ui.parseNumber('0')).toBe(0);
        });
    });

    describe('parseBooleanLike', () => {
        test('returns 1 for truthy values', () => {
            expect(ui.parseBooleanLike('1')).toBe(1);
            expect(ui.parseBooleanLike('true')).toBe(1);
            expect(ui.parseBooleanLike('yes')).toBe(1);
            expect(ui.parseBooleanLike('y')).toBe(1);
            expect(ui.parseBooleanLike('event')).toBe(1);
        });

        test('returns 0 for falsy values', () => {
            expect(ui.parseBooleanLike('0')).toBe(0);
            expect(ui.parseBooleanLike('false')).toBe(0);
            expect(ui.parseBooleanLike('no')).toBe(0);
            expect(ui.parseBooleanLike('n')).toBe(0);
            expect(ui.parseBooleanLike('censor')).toBe(0);
        });

        test('returns fallback for null/undefined', () => {
            expect(ui.parseBooleanLike(null, 99)).toBe(99);
            expect(ui.parseBooleanLike(undefined, 99)).toBe(99);
        });

        test('parses numeric string > 0 as 1', () => {
            expect(ui.parseBooleanLike('5')).toBe(1);
        });

        test('returns fallback for non-numeric non-keyword', () => {
            expect(ui.parseBooleanLike('maybe', -1)).toBe(-1);
        });
    });

    describe('parseCovariateList', () => {
        test('parses comma-separated covariate list', () => {
            document.getElementById('ipd-covariates').value = 'age, sex, bmi';
            expect(ui.parseCovariateList('ipd-covariates')).toEqual(['age', 'sex', 'bmi']);
        });

        test('returns empty for missing element', () => {
            expect(ui.parseCovariateList('nonexistent')).toEqual([]);
        });

        test('filters out empty strings', () => {
            document.getElementById('ipd-covariates').value = ',age,,';
            expect(ui.parseCovariateList('ipd-covariates')).toEqual(['age']);
        });
    });

    describe('parseComponentLabel', () => {
        test('splits on + delimiter', () => {
            expect(ui.parseComponentLabel('A+B+C')).toEqual(['A', 'B', 'C']);
        });

        test('splits on mixed delimiters', () => {
            expect(ui.parseComponentLabel('A/B&C')).toEqual(['A', 'B', 'C']);
        });

        test('returns single element for simple label', () => {
            expect(ui.parseComponentLabel('Placebo')).toEqual(['Placebo']);
        });

        test('returns empty array for empty/null', () => {
            expect(ui.parseComponentLabel('')).toEqual([]);
            expect(ui.parseComponentLabel(null)).toEqual([]);
        });
    });

    describe('formatNum', () => {
        test('formats finite number', () => {
            expect(ui.formatNum(3.14159, 2)).toBe('3.14');
        });

        test('returns fallback for NaN', () => {
            expect(ui.formatNum(NaN, 3, 'N/A')).toBe('N/A');
        });

        test('returns fallback for undefined', () => {
            expect(ui.formatNum(undefined)).toBe('N/A');
        });

        test('defaults to 3 digits', () => {
            expect(ui.formatNum(1.23456789)).toBe('1.235');
        });
    });

    describe('setText', () => {
        test('sets textContent on element', () => {
            ui.setText('fed-estimate', 'Hello');
            expect(document.getElementById('fed-estimate').textContent).toBe('Hello');
        });

        test('does nothing for missing element', () => {
            expect(() => ui.setText('nonexistent', 'value')).not.toThrow();
        });
    });

    describe('showPanel', () => {
        test('shows panel', () => {
            ui.showPanel('3level-results', true);
            expect(document.getElementById('3level-results').style.display).toBe('block');
        });

        test('hides panel', () => {
            ui.showPanel('3level-results', false);
            expect(document.getElementById('3level-results').style.display).toBe('none');
        });

        test('does nothing for missing element', () => {
            expect(() => ui.showPanel('nonexistent')).not.toThrow();
        });
    });

    describe('escapeHTML', () => {
        test('escapes all special chars', () => {
            expect(ui.escapeHTML('<b>"test" & \'it\'</b>')).toBe(
                '&lt;b&gt;&quot;test&quot; &amp; &#39;it&#39;&lt;/b&gt;'
            );
        });
    });

    describe('ensureChartStore', () => {
        test('creates charts object if missing', () => {
            mockApp.charts = undefined;
            ui.ensureChartStore();
            expect(mockApp.charts).toEqual({});
        });

        test('preserves existing charts object', () => {
            mockApp.charts = { existing: true };
            ui.ensureChartStore();
            expect(mockApp.charts.existing).toBe(true);
        });
    });

    describe('destroyChart', () => {
        test('destroys and removes chart', () => {
            const destroyFn = jest.fn();
            mockApp.charts = { testChart: { destroy: destroyFn } };
            ui.destroyChart('testChart');
            expect(destroyFn).toHaveBeenCalled();
            expect(mockApp.charts.testChart).toBeUndefined();
        });

        test('does nothing for nonexistent key', () => {
            mockApp.charts = {};
            expect(() => ui.destroyChart('missing')).not.toThrow();
        });
    });

    describe('computeUnadjustedFromEffects', () => {
        test('computes inverse-variance weighted mean', () => {
            const data = [
                { effect: 0.5, se: 0.1 },
                { effect: 0.3, se: 0.2 }
            ];
            const result = ui.computeUnadjustedFromEffects(data);
            expect(result).toBeCloseTo(0.46, 1);
        });

        test('returns NaN for empty array', () => {
            expect(ui.computeUnadjustedFromEffects([])).toBeNaN();
        });

        test('returns NaN for non-array', () => {
            expect(ui.computeUnadjustedFromEffects(null)).toBeNaN();
        });
    });

    // ==================== Chart rendering methods ====================

    describe('renderDoseResponseChart', () => {
        test('creates line chart', () => {
            ui.renderDoseResponseChart([
                { dose: 0, effect: 0, ciLower: -0.1, ciUpper: 0.1 },
                { dose: 10, effect: 0.5, ciLower: 0.3, ciUpper: 0.7 }
            ]);
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'line' })
            );
        });

        test('returns if no canvas', () => {
            document.getElementById('dr-curve-chart').remove();
            ui.renderDoseResponseChart([{ dose: 0, effect: 0, ciLower: 0, ciUpper: 0 }]);
            expect(Chart).not.toHaveBeenCalled();
        });

        test('returns for empty curve', () => {
            ui.renderDoseResponseChart([]);
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    describe('renderDTASROCChart', () => {
        test('creates scatter chart for study points', () => {
            const studies = [
                { sensitivity: 0.9, specificity: 0.8 },
                { sensitivity: 0.85, specificity: 0.75 }
            ];
            ui.renderDTASROCChart(studies);
            expect(Chart).toHaveBeenCalled();
        });

        test('adds summary point when provided', () => {
            const studies = [{ sensitivity: 0.9, specificity: 0.8 }];
            const summary = { sensitivity: 0.88, specificity: 0.78 };
            ui.renderDTASROCChart(studies, summary);
            const chartArgs = Chart.mock.calls[0][1];
            expect(chartArgs.data.datasets.length).toBe(2);
        });

        test('returns if no canvas', () => {
            document.getElementById('dta-sroc-chart').remove();
            ui.renderDTASROCChart([{ sensitivity: 0.9, specificity: 0.8 }]);
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    describe('renderPBSensitivityChart', () => {
        test('creates line chart', () => {
            ui.renderPBSensitivityChart(['0.05', '0.10'], [0.8, 0.6], 'Test');
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'line' })
            );
        });

        test('returns if canvas missing', () => {
            document.getElementById('pb-sensitivity-chart').remove();
            ui.renderPBSensitivityChart(['a'], [1], 'Label');
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    describe('renderMRScatterChart', () => {
        test('creates chart with scatter and line datasets', () => {
            const data = [
                { betaExposure: 0.1, betaOutcome: 0.05 },
                { betaExposure: 0.2, betaOutcome: 0.1 }
            ];
            ui.renderMRScatterChart(data, 0.5, 0.01);
            expect(Chart).toHaveBeenCalled();
        });

        test('returns if canvas missing', () => {
            document.getElementById('mr-scatter-chart').remove();
            ui.renderMRScatterChart([{ betaExposure: 1, betaOutcome: 1 }], 1);
            expect(Chart).not.toHaveBeenCalled();
        });

        test('returns for empty data', () => {
            ui.renderMRScatterChart([], 1);
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    describe('renderSurvivalMetaChart', () => {
        test('creates multi-curve line chart', () => {
            const curves = [
                { label: 'DrugA', points: [{ time: 0, survival: 1 }, { time: 5, survival: 0.8 }] },
                { label: 'DrugB', points: [{ time: 0, survival: 1 }, { time: 5, survival: 0.6 }] }
            ];
            ui.renderSurvivalMetaChart(curves);
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'line' })
            );
        });

        test('returns if canvas missing', () => {
            document.getElementById('survival-curves-chart').remove();
            ui.renderSurvivalMetaChart([{ label: 'A', points: [{ time: 0, survival: 1 }] }]);
            expect(Chart).not.toHaveBeenCalled();
        });

        test('returns for empty curves', () => {
            ui.renderSurvivalMetaChart([]);
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    describe('renderFederatedWeightsChart', () => {
        test('creates bar chart', () => {
            ui.renderFederatedWeightsChart([
                { siteId: 'Hospital A', weight: 0.6 },
                { siteId: 'Hospital B', weight: 0.4 }
            ]);
            expect(Chart).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ type: 'bar' })
            );
        });

        test('returns for empty contributions', () => {
            ui.renderFederatedWeightsChart([]);
            expect(Chart).not.toHaveBeenCalled();
        });
    });

    // ==================== addMVOutcomeRow ====================

    describe('addMVOutcomeRow', () => {
        test('adds outcome row to container', () => {
            ui.addMVOutcomeRow();
            const container = document.getElementById('mv-outcomes-container');
            expect(container.querySelectorAll('.mv-outcome-row').length).toBe(1);
            expect(container.querySelector('.mv-outcome-name').value).toBe('Outcome 1');
        });

        test('increments outcome name', () => {
            ui.addMVOutcomeRow();
            ui.addMVOutcomeRow();
            const container = document.getElementById('mv-outcomes-container');
            const names = container.querySelectorAll('.mv-outcome-name');
            expect(names.length).toBe(2);
            expect(names[1].value).toBe('Outcome 2');
        });

        test('does nothing if container missing', () => {
            document.getElementById('mv-outcomes-container').remove();
            expect(() => ui.addMVOutcomeRow()).not.toThrow();
        });
    });

    // ==================== Three-Level MA ====================

    describe('runThreeLevelMA', () => {
        test('shows error when no engine', async () => {
            await ui.runThreeLevelMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Three-level meta-analysis engine not available', 'error'
            );
        });

        test('shows warning with fewer than 3 studies', async () => {
            global.AdvancedMetaAnalysis = jest.fn(() => ({
                threeLevel: jest.fn()
            }));
            // No MA data rows in DOM
            await ui.runThreeLevelMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 3 studies'), 'warning'
            );
            delete global.AdvancedMetaAnalysis;
        });

        test('runs and displays results', async () => {
            const mockResults = {
                mu: 0.5,
                ci: [0.3, 0.7],
                tau2Between: 0.01,
                tau2Within: 0.02,
                I2Level2: 25.0,
                I2Level3: 10.0,
                interpretation: 'Low heterogeneity'
            };
            global.AdvancedMetaAnalysis = jest.fn(() => ({
                threeLevel: jest.fn().mockReturnValue(mockResults)
            }));

            // Add 3 MA data rows
            const tbody = document.getElementById('ma-data-body');
            for (let i = 0; i < 3; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input value="Study${i}" /></td>
                    <td><input value="${0.3 + i * 0.1}" /></td>
                    <td><input value="0.1" /></td>
                `;
                tbody.appendChild(tr);
            }

            await ui.runThreeLevelMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Three-Level MA'), 'success'
            );
            expect(document.getElementById('3level-pooled').textContent).toContain('0.500');
            delete global.AdvancedMetaAnalysis;
        });
    });

    // ==================== Multivariate MA ====================

    describe('runMultivariateMA', () => {
        test('shows error when no engine', async () => {
            await ui.runMultivariateMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Multivariate meta-analysis engine not available', 'error'
            );
        });

        test('shows warning when no outcomes', async () => {
            ui.advancedMetaEngine = { multivariate: jest.fn() };
            await ui.runMultivariateMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Add at least one outcome name', 'warning'
            );
        });
    });

    // ==================== Dose-Response MA ====================

    describe('runDoseResponseMA', () => {
        test('shows error when no engine', async () => {
            await ui.runDoseResponseMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Dose-response engine not available', 'error'
            );
        });

        test('shows warning with fewer than 3 rows', async () => {
            ui.advancedMetaEngine = { doseResponse: jest.fn() };
            await ui.runDoseResponseMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 3 rows'), 'warning'
            );
        });
    });

    // ==================== Component NMA ====================

    describe('runComponentNMA', () => {
        test('shows error when no engine', async () => {
            await ui.runComponentNMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Component NMA engine not available', 'error'
            );
        });

        test('shows warning with fewer than 2 NMA rows', async () => {
            ui.advancedMetaEngine = { componentNMA: jest.fn() };
            await ui.runComponentNMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Enter NMA study-arm rows first', 'warning'
            );
        });
    });

    // ==================== IPD Meta-Analysis ====================

    describe('runIPDMetaAnalysis', () => {
        test('shows error when no engine', async () => {
            await ui.runIPDMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'IPD meta-analysis engine not available', 'error'
            );
        });

        test('shows warning with fewer than 4 rows', async () => {
            ui.ipdEngine = { oneStage: jest.fn() };
            document.getElementById('ipd-data-input').value = 'study,treatment,outcome\nA,0,1.5\nB,1,2.0';
            await ui.runIPDMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 4 IPD rows'), 'warning'
            );
        });

        test('runs one-stage analysis with valid data', async () => {
            const mockEngine = {
                oneStage: jest.fn().mockReturnValue({
                    treatmentEffect: { estimate: 0.5, ci95: [0.2, 0.8] },
                    nPatients: 100,
                    nStudies: 3
                })
            };
            ui.ipdEngine = mockEngine;
            document.getElementById('ipd-data-input').value =
                'study,treatment,outcome\nA,0,1.5\nA,1,2.0\nB,0,1.2\nB,1,1.8\nC,0,1.3\nC,1,1.9';

            await ui.runIPDMetaAnalysis();
            expect(mockEngine.oneStage).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('IPD one-stage analysis completed'), 'success'
            );
        });

        test('runs two-stage analysis', async () => {
            const mockEngine = {
                twoStage: jest.fn().mockReturnValue({
                    treatmentEffect: { estimate: 0.4, ci95: [0.1, 0.7] },
                    nPatients: 80,
                    nStudies: 2
                })
            };
            ui.ipdEngine = mockEngine;
            const sel = document.getElementById('ipd-method');
            const opt = document.createElement('option');
            opt.value = 'two-stage';
            opt.textContent = 'Two-stage';
            sel.appendChild(opt);
            sel.value = 'two-stage';
            document.getElementById('ipd-data-input').value =
                'study,treatment,outcome\nA,0,1.5\nA,1,2.0\nB,0,1.2\nB,1,1.8\nC,0,1.3\nC,1,1.9';

            await ui.runIPDMetaAnalysis();
            expect(mockEngine.twoStage).toHaveBeenCalled();
        });
    });

    // ==================== DTA Meta-Analysis ====================

    describe('runDTAMetaAnalysis', () => {
        test('shows error when no engine', async () => {
            await ui.runDTAMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'DTA meta-analysis engine not available', 'error'
            );
        });

        test('shows warning with fewer than 2 studies', async () => {
            ui.dtaEngine = { bivariate: jest.fn() };
            document.getElementById('dta-data-input').value = 'study,tp,fp,fn,tn\nA,50,10,5,100';
            await ui.runDTAMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least two DTA studies'), 'warning'
            );
        });

        test('runs bivariate DTA analysis', async () => {
            const mockEngine = {
                bivariate: jest.fn().mockReturnValue({
                    pooledEstimates: {
                        sensitivity: { estimate: 0.9 },
                        specificity: { estimate: 0.85 }
                    },
                    sroc: { auc: 0.95 },
                    studyData: [
                        { sensitivity: 0.9, specificity: 0.85 }
                    ]
                })
            };
            ui.dtaEngine = mockEngine;
            document.getElementById('dta-data-input').value =
                'study,tp,fp,fn,tn\nA,50,10,5,100\nB,45,12,8,95';

            await ui.runDTAMetaAnalysis();
            expect(mockEngine.bivariate).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('DTA bivariate analysis completed'), 'success'
            );
        });
    });

    // ==================== Advanced Pub Bias ====================

    describe('runAdvancedPubBias', () => {
        test('shows error when no engine', async () => {
            await ui.runAdvancedPubBias();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Advanced publication-bias engine not available', 'error'
            );
        });

        test('shows warning with fewer than 3 studies', async () => {
            ui.advancedPbEngine = { copasModel: jest.fn() };
            await ui.runAdvancedPubBias();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 3'), 'warning'
            );
        });
    });

    // ==================== Fabrication Detection ====================

    describe('runFabricationDetection', () => {
        test('shows error when no engine', async () => {
            await ui.runFabricationDetection();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Fabrication-detection engine not available', 'error'
            );
        });

        test('shows warning for empty data', async () => {
            ui.fabricationEngine = { grim: jest.fn(), grimmer: jest.fn() };
            document.getElementById('fabrication-data-input').value = '';
            await ui.runFabricationDetection();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Enter fabrication-test data'), 'warning'
            );
        });

        test('runs GRIM and GRIMMER on valid data', async () => {
            const mockEngine = {
                grim: jest.fn().mockReturnValue({
                    results: [{ study: 'Study1', flag: 'FAIL' }]
                }),
                grimmer: jest.fn().mockReturnValue({
                    results: [{ study: 'Study1', flag: 'OK' }]
                })
            };
            ui.fabricationEngine = mockEngine;
            document.getElementById('fabrication-data-input').value =
                'study,n,mean,sd\nStudy1,30,5.2,1.1\nStudy2,40,6.1,1.3';

            await ui.runFabricationDetection();
            expect(mockEngine.grim).toHaveBeenCalled();
            expect(mockEngine.grimmer).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Fabrication screening completed'), expect.any(String)
            );
        });
    });

    // ==================== MR Meta-Analysis ====================

    describe('runMRMetaAnalysis', () => {
        test('shows error when no engine', async () => {
            await ui.runMRMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith('MR engine not available', 'error');
        });

        test('shows warning with fewer than 3 SNPs', async () => {
            ui.mrEngine = { ivw: jest.fn() };
            document.getElementById('mr-data-input').value =
                'snp,beta_exposure,se_exposure,beta_outcome,se_outcome\nrs1,0.1,0.01,0.05,0.02';
            await ui.runMRMetaAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least 3 valid SNP rows'), 'warning'
            );
        });

        test('runs IVW analysis with valid data', async () => {
            const mockEngine = {
                ivw: jest.fn().mockReturnValue({
                    method: 'IVW',
                    estimate: 0.5,
                    ci95: [0.3, 0.7],
                    pValue: 0.01
                })
            };
            ui.mrEngine = mockEngine;
            document.getElementById('mr-data-input').value =
                'snp,beta_exposure,se_exposure,beta_outcome,se_outcome\n' +
                'rs1,0.1,0.01,0.05,0.02\n' +
                'rs2,0.2,0.02,0.12,0.03\n' +
                'rs3,0.15,0.015,0.08,0.025';

            await ui.runMRMetaAnalysis();
            expect(mockEngine.ivw).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('MR analysis (ivw) completed'), 'success'
            );
        });
    });

    // ==================== Historical MA ====================

    describe('runHistoricalMA', () => {
        test('shows error when no engine', async () => {
            await ui.runHistoricalMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Historical borrowing engine not available', 'error'
            );
        });

        test('shows warning for invalid inputs', async () => {
            ui.historicalEngine = { powerPrior: jest.fn() };
            document.getElementById('current-n').value = 'abc';
            await ui.runHistoricalMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('valid current and historical'), 'warning'
            );
        });

        test('runs power prior with valid data', async () => {
            const mockEngine = {
                powerPrior: jest.fn().mockReturnValue({
                    posteriorEstimate: { mean: 5.3 },
                    effectiveBorrowing: 75
                })
            };
            ui.historicalEngine = mockEngine;

            await ui.runHistoricalMA();
            expect(mockEngine.powerPrior).toHaveBeenCalled();
            expect(document.getElementById('hist-with-borrowing').textContent).toContain('5.300');
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('power-prior'), 'success'
            );
        });

        test('runs MAP prior when method is map', async () => {
            const mockEngine = {
                mapPrior: jest.fn().mockReturnValue({
                    posteriorEstimate: { mean: 5.4 },
                    mapPrior: { effectiveN: 80 }
                })
            };
            ui.historicalEngine = mockEngine;
            const sel = document.getElementById('historical-method');
            const opt = document.createElement('option');
            opt.value = 'map';
            opt.textContent = 'MAP';
            sel.appendChild(opt);
            sel.value = 'map';

            await ui.runHistoricalMA();
            expect(mockEngine.mapPrior).toHaveBeenCalled();
        });

        test('runs commensurate prior when method is commensurate', async () => {
            const mockEngine = {
                commensuratePrior: jest.fn().mockReturnValue({
                    posteriorEstimate: { mean: 5.2 },
                    borrowingMetrics: { effectiveSampleSize: 60 }
                })
            };
            ui.historicalEngine = mockEngine;
            const sel = document.getElementById('historical-method');
            const opt = document.createElement('option');
            opt.value = 'commensurate';
            opt.textContent = 'Commensurate';
            sel.appendChild(opt);
            sel.value = 'commensurate';

            await ui.runHistoricalMA();
            expect(mockEngine.commensuratePrior).toHaveBeenCalled();
        });
    });

    // ==================== Survival MA ====================

    describe('runSurvivalMA', () => {
        test('shows error when no engine', async () => {
            await ui.runSurvivalMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Survival meta-analysis engine not available', 'error'
            );
        });

        test('shows warning for empty data', async () => {
            ui.survivalMetaEngine = { fractionalPolynomial: jest.fn() };
            document.getElementById('survival-data-input').value = '';
            await ui.runSurvivalMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Provide survival data'), 'warning'
            );
        });

        test('runs fractional polynomial with valid data', async () => {
            const mockEngine = {
                fractionalPolynomial: jest.fn().mockReturnValue({})
            };
            ui.survivalMetaEngine = mockEngine;
            document.getElementById('survival-data-input').value =
                'study,treatment,time,cumHazard\n' +
                'TrialA,Drug,0,0\nTrialA,Drug,1,0.1\nTrialA,Drug,2,0.25';

            await ui.runSurvivalMA();
            expect(mockEngine.fractionalPolynomial).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Survival MA (fp) completed'), 'success'
            );
        });
    });

    // ==================== Threshold Analysis ====================

    describe('runThresholdAnalysis', () => {
        test('shows error when no engine', async () => {
            await ui.runThresholdAnalysis();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Threshold analysis engine not available', 'error'
            );
        });

        test('runs NMA threshold with valid data', async () => {
            const mockEngine = {
                nmaThreshold: jest.fn().mockReturnValue({
                    thresholds: [
                        { treatment: 'DrugA', currentEffect: 0.5, threshold: 0.2 }
                    ],
                    robustness: [
                        { treatment: 'DrugA', robustnessRatio: 2.5 }
                    ]
                })
            };
            ui.thresholdEngine = mockEngine;
            document.getElementById('threshold-data-input').value =
                'treatment,effect,se\nDrugA,0.5,0.1\nDrugB,0.3,0.12';

            await ui.runThresholdAnalysis();
            expect(mockEngine.nmaThreshold).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('NMA threshold'), 'success'
            );
        });

        test('runs CEA threshold with valid data', async () => {
            const mockEngine = {
                voiThreshold: jest.fn().mockReturnValue({
                    thresholdWTP: [{ best: 'DrugA', wtp: 25000 }]
                })
            };
            ui.thresholdEngine = mockEngine;
            const sel = document.getElementById('threshold-context');
            const opt = document.createElement('option');
            opt.value = 'cea';
            opt.textContent = 'CEA';
            sel.appendChild(opt);
            sel.value = 'cea';
            document.getElementById('threshold-data-input').value =
                'strategy,cost,qaly\nDrugA,50000,3.5\nDrugB,30000,3.0';

            await ui.runThresholdAnalysis();
            expect(mockEngine.voiThreshold).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('CEA threshold'), 'success'
            );
        });
    });

    // ==================== Federated MA ====================

    describe('runFederatedMA', () => {
        test('shows error when no engine', async () => {
            await ui.runFederatedMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Federated meta-analysis engine not available', 'error'
            );
        });

        test('shows warning with fewer than 2 sites', async () => {
            ui.federatedEngine = { distributedMA: jest.fn() };
            document.getElementById('federated-data-input').value = 'site,n,mean,variance\nA,50,5.0,1.0';
            await ui.runFederatedMA();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('at least two site summaries'), 'warning'
            );
        });

        test('runs distributed MA with valid data', async () => {
            const mockEngine = {
                distributedMA: jest.fn().mockReturnValue({
                    pooledEstimate: { effect: 5.2, ci95: [4.8, 5.6] },
                    privacyGuarantee: 'Summary stats only',
                    siteContributions: [
                        { siteId: 'A', weight: 0.6 },
                        { siteId: 'B', weight: 0.4 }
                    ]
                })
            };
            ui.federatedEngine = mockEngine;
            document.getElementById('federated-data-input').value =
                'site,n,mean,variance\nSiteA,50,5.0,1.0\nSiteB,40,5.5,1.2';

            await ui.runFederatedMA();
            expect(mockEngine.distributedMA).toHaveBeenCalled();
            expect(mockApp.showToast).toHaveBeenCalledWith(
                expect.stringContaining('Federated MA (distributed) completed'), 'success'
            );
        });

        test('runs differential privacy MA', async () => {
            const mockEngine = {
                differentiallyPrivateMA: jest.fn().mockReturnValue({
                    pooledEstimate: { effect: 5.1, ci95: [4.5, 5.7] },
                    privacyGuarantee: 'DP epsilon=1.0',
                    dataShared: 'Noisy summaries only'
                })
            };
            ui.federatedEngine = mockEngine;
            const sel = document.getElementById('federated-method');
            const opt = document.createElement('option');
            opt.value = 'differential-privacy';
            opt.textContent = 'DP';
            sel.appendChild(opt);
            sel.value = 'differential-privacy';
            document.getElementById('federated-data-input').value =
                'site,n,mean,variance\nSiteA,50,5.0,1.0\nSiteB,40,5.5,1.2';

            await ui.runFederatedMA();
            expect(mockEngine.differentiallyPrivateMA).toHaveBeenCalled();
        });
    });

    // ==================== displayPubBiasResults ====================

    describe('displayPubBiasResults', () => {
        test('renders Egger test results', () => {
            const results = {
                egger: { intercept: 1.5, se: 0.3, t: 5.0, p: 0.002 },
                trimFill: { k0: 2, adjusted: { effect: 0.4 } },
                pooled: { pooled: { effect: 0.5 } },
                studies: [{ yi: 0.5, sei: 0.1 }]
            };
            ui.displayPubBiasResults(results);
            const eggerHtml = document.getElementById('pb-egger-results').innerHTML;
            expect(eggerHtml).toContain('1.500');
            expect(eggerHtml).toContain('asymmetry');
        });

        test('renders trim-and-fill results', () => {
            const results = {
                egger: null,
                trimFill: { k0: 3, adjusted: { effect: 0.45 } },
                pooled: { pooled: { effect: 0.5 } },
                studies: []
            };
            ui.displayPubBiasResults(results);
            const tfHtml = document.getElementById('pb-trimfill-results').innerHTML;
            expect(tfHtml).toContain('3');
        });
    });

    // ==================== displayNMAResults ====================

    describe('displayNMAResults', () => {
        test('renders NMA results table', () => {
            const results = {
                comparisons: [
                    { comparison: 'A vs B', effect: 0.5, ci_lower: 0.2, ci_upper: 0.8, p_value: 0.01 }
                ]
            };
            ui.displayNMAResults(results);
            const tbody = document.getElementById('nma-results-body');
            expect(tbody.innerHTML).toContain('A vs B');
            expect(tbody.innerHTML).toContain('0.500');
        });
    });

    // ==================== displayMAResults ====================

    describe('displayMAResults', () => {
        test('renders MA summary', () => {
            const results = {
                pooled: { effect: 0.35, ci_lower: 0.2, ci_upper: 0.5 },
                heterogeneity: { I2: 0.3, tau2: 0.01, Q: 2.5 },
                studies: [{ study: 'S1', effect: 0.3, se: 0.1 }]
            };
            ui.displayMAResults(results);
            const summary = document.getElementById('ma-summary').innerHTML;
            expect(summary).toContain('0.350');
            expect(summary).toContain('30.0');
        });
    });

    // ==================== displaySurvivalFitResults ====================

    describe('displaySurvivalFitResults', () => {
        test('returns if container missing', () => {
            document.getElementById('survival-fit-results').remove();
            ui.survivalFitResults = { best: {}, ranked: [] };
            expect(() => ui.displaySurvivalFitResults()).not.toThrow();
        });

        test('returns if no results', () => {
            ui.survivalFitResults = null;
            expect(() => ui.displaySurvivalFitResults()).not.toThrow();
        });

        test('renders survival fit results when data present', () => {
            ui.survivalFitResults = {
                best: { distribution: 'weibull', aic: 100, bic: 110, r2: 0.95 },
                recommendation: 'Use weibull',
                ranked: [
                    { rank: 1, distribution: 'weibull', aic: 100, bic: 110, deltaAIC: 0, r2: 0.95, convergence: true },
                    { rank: 2, distribution: 'exponential', aic: 105, bic: 112, deltaAIC: 5, r2: 0.90, convergence: true }
                ]
            };
            ui.displaySurvivalFitResults();
            expect(document.getElementById('best-model').textContent).toBe('weibull');
            expect(document.getElementById('survival-fit-results').style.display).toBe('block');
        });
    });

    // ==================== displayEVPPIResults ====================

    describe('displayEVPPIResults', () => {
        test('renders EVPPI results table', () => {
            const results = {
                evpi: 1000,
                parameters: [
                    { rank: 1, parameter: 'tp', evppi: 500 },
                    { rank: 2, parameter: 'cost', evppi: 200 }
                ]
            };
            ui.displayEVPPIResults(results);
            const container = document.getElementById('evppi-results');
            expect(container.style.display).toBe('block');
        });

        test('returns if container missing', () => {
            document.getElementById('evppi-results').remove();
            expect(() => ui.displayEVPPIResults({ evpi: 100 })).not.toThrow();
        });
    });

    // ==================== renderSurvivalComparisonChart ====================

    describe('renderSurvivalComparisonChart', () => {
        test('returns if no canvas', () => {
            document.getElementById('survival-comparison-chart').remove();
            ui.survivalFitResults = { ranked: [] };
            ui.kmData = { points: [] };
            ui.renderSurvivalComparisonChart();
            expect(Chart).not.toHaveBeenCalled();
        });

        test('returns if no fit results', () => {
            ui.survivalFitResults = null;
            ui.renderSurvivalComparisonChart();
            expect(Chart).not.toHaveBeenCalled();
        });
    });
});
