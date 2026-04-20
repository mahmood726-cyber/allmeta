/**
 * Tests for src/ui/advancedUI.js - AdvancedFeaturesUI controller
 */

'use strict';

// ---- Mock engines (all undefined in test env unless we define them) ----
// None of the advanced engines exist in test env, so all this.xxxEngine will be null

// Mock Chart.js
global.Chart = jest.fn(() => ({
    destroy: jest.fn(),
    update: jest.fn(),
    data: { datasets: [] }
}));
Chart.defaults = {};

// ---- Minimal DOM fixture ----
function setupDOM() {
    document.body.innerHTML = `
        <!-- Microsimulation -->
        <button id="btn-run-microsim">Run Microsim</button>
        <input id="microsim-patients" value="1000" />
        <input id="microsim-record-history" type="checkbox" />
        <input id="microsim-seed" value="12345" />
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

        <!-- DES -->
        <button id="btn-run-des">Run DES</button>

        <!-- Calibration -->
        <button id="btn-run-calibration">Calibrate</button>

        <!-- EVPPI -->
        <button id="btn-calc-evppi">Calc EVPPI</button>

        <!-- Meta-Analysis buttons -->
        <button id="btn-run-nma">NMA</button>
        <button id="btn-run-ma">MA</button>
        <button id="btn-run-pub-bias">Pub Bias</button>
        <button id="btn-run-3level">3-Level</button>
        <button id="btn-run-mv">MV</button>
        <button id="btn-add-mv-outcome">Add MV Outcome</button>
        <button id="btn-run-dr">Dose-Response</button>
        <button id="btn-run-cnma">Component NMA</button>
        <button id="btn-run-ipd">IPD</button>
        <button id="btn-run-dta">DTA</button>
        <button id="btn-run-advanced-pb">Advanced PB</button>
        <button id="btn-run-fabrication">Fabrication</button>
        <button id="btn-run-mr">MR</button>
        <button id="btn-run-historical">Historical</button>
        <button id="btn-run-survival-ma">Survival MA</button>
        <button id="btn-run-threshold">Threshold</button>
        <button id="btn-run-federated">Federated</button>

        <!-- Federated fields -->
        <textarea id="federated-data"></textarea>
        <select id="federated-method"><option value="distributed">Distributed</option></select>
        <input id="federated-epsilon" value="1.0" />
        <span id="fed-estimate"></span>
        <span id="fed-ci"></span>
        <span id="fed-privacy"></span>
        <span id="fed-privacy-desc"></span>
        <canvas id="fed-weights-chart"></canvas>
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
        showToast: jest.fn(),
        showLoading: jest.fn(),
        hideLoading: jest.fn(),
        log: jest.fn()
    };
}

// ---- Tests ----

describe('AdvancedFeaturesUI', () => {

    let ui, mockApp;

    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        mockApp = createMockApp();
        ui = new AdvancedFeaturesUI(mockApp);
    });

    // ---- Constructor ----

    describe('constructor', () => {
        test('stores app reference', () => {
            expect(ui.app).toBe(mockApp);
        });

        test('initializes all engine references to null when unavailable', () => {
            expect(ui.survivalEngine).toBeNull();
            expect(ui.microsimEngine).toBeNull();
            expect(ui.desEngine).toBeNull();
            expect(ui.calibrationEngine).toBeNull();
            expect(ui.evppiCalculator).toBeNull();
            expect(ui.advancedMetaEngine).toBeNull();
            expect(ui.ipdEngine).toBeNull();
            expect(ui.dtaEngine).toBeNull();
        });

        test('sets up event listeners without errors', () => {
            // The constructor calls setupEventListeners — no throw = pass
            expect(ui).toBeDefined();
        });
    });

    // ---- initEngines ----

    describe('initEngines', () => {
        test('initializes engines when globals are defined', () => {
            global.SurvivalAnalysisEngine = class { };
            const ui2 = new AdvancedFeaturesUI(mockApp);
            expect(ui2.survivalEngine).not.toBeNull();
            delete global.SurvivalAnalysisEngine;
        });

        test('leaves engine null when global is not defined', () => {
            expect(ui.survivalEngine).toBeNull();
        });
    });

    // ---- Event Listeners ----

    describe('setupEventListeners', () => {
        test('microsim button wired', () => {
            const btn = document.getElementById('btn-run-microsim');
            const spy = jest.spyOn(ui, 'runMicrosimulation').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('nma button wired', () => {
            const btn = document.getElementById('btn-run-nma');
            const spy = jest.spyOn(ui, 'runNMA').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('DES button wired', () => {
            const btn = document.getElementById('btn-run-des');
            const spy = jest.spyOn(ui, 'runDES').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('calibration button wired', () => {
            const btn = document.getElementById('btn-run-calibration');
            const spy = jest.spyOn(ui, 'runCalibration').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('EVPPI button wired', () => {
            const btn = document.getElementById('btn-calc-evppi');
            const spy = jest.spyOn(ui, 'calculateEVPPI').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('pub bias button wired', () => {
            const btn = document.getElementById('btn-run-pub-bias');
            const spy = jest.spyOn(ui, 'runPublicationBias').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('threshold button wired', () => {
            const btn = document.getElementById('btn-run-threshold');
            const spy = jest.spyOn(ui, 'runThresholdAnalysis').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });

        test('federated button wired', () => {
            const btn = document.getElementById('btn-run-federated');
            const spy = jest.spyOn(ui, 'runFederatedMA').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });
    });

    // ---- Microsimulation ----

    describe('runMicrosimulation', () => {
        test('shows error when no project loaded', async () => {
            mockApp.project = null;
            await ui.runMicrosimulation();
            expect(mockApp.showToast).toHaveBeenCalledWith('No model loaded', 'error');
        });

        test('shows error when engine not available', async () => {
            mockApp.project = { strategies: {} };
            ui.microsimEngine = null;
            await ui.runMicrosimulation();
            expect(mockApp.showToast).toHaveBeenCalledWith('Microsimulation engine not available', 'error');
        });
    });

    // ---- CSV Parsing ----

    describe('parseCSV', () => {
        test('parses survival CSV data', () => {
            const csv = 'time,survival,atrisk\n0,1.0,100\n1,0.9,90\n2,0.8,80';
            const result = ui.parseCSV(csv);
            expect(result.length).toBe(3);
            expect(result[0].time).toBe(0);
            expect(result[0].survival).toBe(1.0);
        });

        test('throws for CSV missing required columns', () => {
            const csv = 'foo,bar\n1,2\n3,4';
            expect(() => ui.parseCSV(csv)).toThrow('CSV must have time and survival columns');
        });

        test('filters out NaN rows', () => {
            const csv = 'time,survival\n0,1.0\nabc,xyz\n2,0.8';
            const result = ui.parseCSV(csv);
            expect(result.length).toBe(2);
        });
    });

    // ---- showUnavailableMethod ----

    describe('showUnavailableMethod', () => {
        test('shows warning toast', () => {
            ui.showUnavailableMethod('Test Method');
            expect(mockApp.showToast).toHaveBeenCalledWith(
                'Test Method is not implemented in this build yet',
                'warning'
            );
        });
    });

    // ---- displayMicrosimResults ----

    describe('displayMicrosimResults', () => {
        test('shows results container', () => {
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
            const container = document.getElementById('microsim-results');
            expect(container.style.display).toBe('block');
        });

        test('returns gracefully if container not found', () => {
            document.getElementById('microsim-results').remove();
            expect(() => ui.displayMicrosimResults({ summary: { meanCost: 0, meanQALY: 0, meanLY: 0 } })).not.toThrow();
        });
    });

    // ---- Pairwise MA button ----

    describe('runMetaAnalysis', () => {
        test('button click calls runMetaAnalysis', () => {
            const btn = document.getElementById('btn-run-ma');
            const spy = jest.spyOn(ui, 'runMetaAnalysis').mockImplementation(() => {});
            btn.click();
            expect(spy).toHaveBeenCalled();
        });
    });

    // ---- IPD / DTA buttons ----

    describe('IPD and DTA buttons', () => {
        test('IPD button calls runIPDMetaAnalysis', () => {
            const spy = jest.spyOn(ui, 'runIPDMetaAnalysis').mockImplementation(() => {});
            document.getElementById('btn-run-ipd').click();
            expect(spy).toHaveBeenCalled();
        });

        test('DTA button calls runDTAMetaAnalysis', () => {
            const spy = jest.spyOn(ui, 'runDTAMetaAnalysis').mockImplementation(() => {});
            document.getElementById('btn-run-dta').click();
            expect(spy).toHaveBeenCalled();
        });
    });

    // ---- Fabrication / MR / Historical ----

    describe('additional method buttons', () => {
        test('fabrication button wired', () => {
            const spy = jest.spyOn(ui, 'runFabricationDetection').mockImplementation(() => {});
            document.getElementById('btn-run-fabrication').click();
            expect(spy).toHaveBeenCalled();
        });

        test('MR button wired', () => {
            const spy = jest.spyOn(ui, 'runMRMetaAnalysis').mockImplementation(() => {});
            document.getElementById('btn-run-mr').click();
            expect(spy).toHaveBeenCalled();
        });

        test('historical button wired', () => {
            const spy = jest.spyOn(ui, 'runHistoricalMA').mockImplementation(() => {});
            document.getElementById('btn-run-historical').click();
            expect(spy).toHaveBeenCalled();
        });

        test('survival MA button wired', () => {
            const spy = jest.spyOn(ui, 'runSurvivalMA').mockImplementation(() => {});
            document.getElementById('btn-run-survival-ma').click();
            expect(spy).toHaveBeenCalled();
        });
    });
});
