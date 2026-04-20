/**
 * Tests for src/ui/beginnerMode.js - BeginnerMode controller
 */

'use strict';

// ---- Mock globals ----
global.MetaAnalysisMethods = class {
    constructor() {}
    calculatePooledEffect(studies) {
        return {
            random: { effect: -0.5, ci_lower: -0.8, ci_upper: -0.2 },
            heterogeneity: { I2: 65.3, tau2: 0.1, Q: 20.5, pValue: 0.001 }
        };
    }
    eggerTest() { return { pValue: 0.3 }; }
    beggTest() { return { pValue: 0.5 }; }
    trimAndFill() {
        return {
            nMissing: 0,
            adjusted: { effect: -0.5 },
            original: { effect: -0.5 }
        };
    }
};

global.NetworkMetaAnalysis = class {
    constructor() { this.results = {}; }
    setData() {}
    async run() { return this.results; }
};

// ---- Minimal DOM fixture ----
function setupDOM() {
    document.body.innerHTML = `
        <div id="drop-zone"></div>
        <div id="toast-container"></div>
    `;
}

// Set up DOM before require
setupDOM();

const { BeginnerMode } = require('../../src/ui/beginnerMode');

describe('BeginnerMode', () => {

    let bm;

    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        localStorage.clear();
        // Mark tutorial as seen to skip the setTimeout auto-show
        localStorage.setItem('hta_tutorial_seen', 'true');
        bm = new BeginnerMode();
    });

    // ---- Constructor ----

    describe('constructor', () => {
        test('initializes tutorialStep to 0', () => {
            expect(bm.tutorialStep).toBe(0);
        });

        test('reads hasSeenTutorial from localStorage', () => {
            expect(bm.hasSeenTutorial).toBe(true);
        });

        test('creates welcome modal in DOM', () => {
            const modal = document.getElementById('welcome-modal');
            expect(modal).not.toBeNull();
        });
    });

    // ---- Styles ----

    describe('injectStyles', () => {
        test('adds a style element to the document', () => {
            const styles = document.querySelectorAll('style');
            expect(styles.length).toBeGreaterThan(0);
        });
    });

    // ---- Welcome Modal ----

    describe('welcome modal', () => {
        test('createWelcomeModal adds overlay to DOM', () => {
            const overlay = document.querySelector('.welcome-modal-overlay');
            expect(overlay).not.toBeNull();
        });

        test('showWelcome adds active class', () => {
            bm.showWelcome();
            const modal = document.getElementById('welcome-modal');
            expect(modal.classList.contains('active')).toBe(true);
        });

        test('closeWelcome removes active class', () => {
            bm.showWelcome();
            bm.closeWelcome();
            const modal = document.getElementById('welcome-modal');
            expect(modal.classList.contains('active')).toBe(false);
        });

        test('closeWelcome sets localStorage flag', () => {
            bm.closeWelcome();
            expect(localStorage.getItem('hta_tutorial_seen')).toBe('true');
            expect(bm.hasSeenTutorial).toBe(true);
        });
    });

    // ---- Tutorial Steps ----

    describe('updateTutorialStep', () => {
        test('activates correct step', () => {
            const modal = document.getElementById('welcome-modal');
            const steps = modal.querySelectorAll('.welcome-step');
            const dots = modal.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 2;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(steps[2].classList.contains('active')).toBe(true);
            expect(steps[0].classList.contains('active')).toBe(false);
            expect(dots[2].classList.contains('active')).toBe(true);
        });

        test('hides prev button on step 0', () => {
            const modal = document.getElementById('welcome-modal');
            const steps = modal.querySelectorAll('.welcome-step');
            const dots = modal.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 0;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);
            expect(prevBtn.style.display).toBe('none');
        });

        test('changes next button text on last step', () => {
            const modal = document.getElementById('welcome-modal');
            const steps = modal.querySelectorAll('.welcome-step');
            const dots = modal.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 3;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);
            expect(nextBtn.textContent).toBe('Get Started');
        });
    });

    // ---- Welcome Events ----

    describe('setupWelcomeEvents', () => {
        test('next button advances step', () => {
            bm.tutorialStep = 0;
            const nextBtn = document.getElementById('welcome-next');
            nextBtn.click();
            expect(bm.tutorialStep).toBe(1);
        });

        test('prev button goes back', () => {
            bm.tutorialStep = 0;
            document.getElementById('welcome-next').click();
            expect(bm.tutorialStep).toBe(1);
            document.getElementById('welcome-prev').click();
            expect(bm.tutorialStep).toBe(0);
        });

        test('skip button closes welcome', () => {
            bm.showWelcome();
            document.getElementById('welcome-skip').click();
            const modal = document.getElementById('welcome-modal');
            expect(modal.classList.contains('active')).toBe(false);
        });
    });

    // ---- Sample Datasets ----

    describe('getSampleDatasets', () => {
        test('returns 4 datasets', () => {
            const datasets = bm.getSampleDatasets();
            expect(Object.keys(datasets)).toEqual(['bcg', 'amlodipine', 'smoking', 'diabetes']);
        });

        test('BCG has 13 studies', () => {
            const datasets = bm.getSampleDatasets();
            expect(datasets.bcg.studies.length).toBe(13);
        });

        test('smoking is NMA type', () => {
            const datasets = bm.getSampleDatasets();
            expect(datasets.smoking.type).toBe('nma');
        });

        test('diabetes is DTA type', () => {
            const datasets = bm.getSampleDatasets();
            expect(datasets.diabetes.type).toBe('dta');
        });
    });

    // ---- loadSampleDataset ----

    describe('loadSampleDataset', () => {
        test('sets window.currentDataset', () => {
            bm.loadSampleDataset('bcg');
            expect(window.currentDataset).toBeDefined();
            expect(window.currentDataset.name).toBe('BCG Vaccine Trials');
        });

        test('does nothing for unknown dataset', () => {
            bm.loadSampleDataset('nonexistent');
            // Should not throw
        });

        test('calls runPairwiseAnalysis for pairwise type', () => {
            const spy = jest.spyOn(bm, 'runPairwiseAnalysis').mockImplementation(() => {});
            bm.loadSampleDataset('amlodipine');
            expect(spy).toHaveBeenCalled();
        });
    });

    // ---- Help Panel ----

    describe('createHelpPanel', () => {
        test('creates help button', () => {
            const helpBtn = document.querySelector('.help-btn');
            expect(helpBtn).not.toBeNull();
        });

        test('creates help panel', () => {
            const helpPanel = document.querySelector('.help-panel');
            expect(helpPanel).not.toBeNull();
        });
    });

    // ---- Data Entry Panel ----

    describe('createDataEntryPanel', () => {
        test('creates data entry panel', () => {
            const panel = document.querySelector('.data-entry-panel');
            expect(panel).not.toBeNull();
        });
    });

    // ---- showToast ----

    describe('showToast', () => {
        test('creates fallback toast when app not available', () => {
            window.app = undefined;
            bm.showToast('Test message', 'success');
            const toasts = document.querySelectorAll('[style*="position: fixed"]');
            expect(toasts.length).toBeGreaterThan(0);
        });

        test('delegates to window.app.showToast if available', () => {
            const mockToast = jest.fn();
            window.app = { showToast: mockToast };
            bm.showToast('Hello', 'info');
            expect(mockToast).toHaveBeenCalledWith('Hello', 'info');
            window.app = undefined;
        });
    });

    // ---- downloadFile ----

    describe('downloadFile', () => {
        test('creates and clicks a link element', () => {
            global.URL.createObjectURL = jest.fn(() => 'blob:test');
            global.URL.revokeObjectURL = jest.fn();

            bm.downloadFile('test content', 'test.txt', 'text/plain');
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(global.URL.revokeObjectURL).toHaveBeenCalled();
        });
    });
});
