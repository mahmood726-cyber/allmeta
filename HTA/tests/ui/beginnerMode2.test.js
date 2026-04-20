/**
 * Tests for src/ui/beginnerMode.js — wizard flows, data entry, sample datasets,
 * help panel, result interpretation, export features
 */

'use strict';

// ---- Mock globals ----
global.MetaAnalysisMethods = class {
    constructor() {}
    calculatePooledEffect() {
        return {
            random: { effect: -0.5, ci_lower: -0.8, ci_upper: -0.2 },
            heterogeneity: { I2: 65.3, tau2: 0.1, Q: 20.5, pValue: 0.001 }
        };
    }
    eggerTest() { return { pValue: 0.3, intercept: 0.5, tStatistic: 1.2 }; }
    beggTest() { return { pValue: 0.5, tau: 0.12 }; }
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

global.DTAMetaAnalysis = undefined;

// ---- Minimal DOM fixture ----
function setupDOM() {
    document.body.innerHTML = '<div id="drop-zone"></div>';
    // Clear all styles
    document.head.innerHTML = '';
}

// Set up DOM before require
setupDOM();

const { BeginnerMode } = require('../../src/ui/beginnerMode');

describe('BeginnerMode — wizard flows and data entry', () => {
    let bm;

    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('hta_tutorial_seen', 'true');
        bm = new BeginnerMode();
    });

    // ================================================================
    // TUTORIAL WIZARD — step navigation
    // ================================================================

    describe('Tutorial wizard step navigation', () => {
        test('updateTutorialStep activates correct step and dot', () => {
            const steps = document.querySelectorAll('.welcome-step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 2;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(steps[2].classList.contains('active')).toBe(true);
            expect(steps[0].classList.contains('active')).toBe(false);
            expect(dots[2].classList.contains('active')).toBe(true);
        });

        test('prev button hidden on step 0', () => {
            const steps = document.querySelectorAll('.welcome-step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 0;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(prevBtn.style.display).toBe('none');
        });

        test('prev button visible on step > 0', () => {
            const steps = document.querySelectorAll('.welcome-step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 1;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(prevBtn.style.display).toBe('inline-flex');
        });

        test('next button shows "Get Started" on last step', () => {
            const steps = document.querySelectorAll('.welcome-step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 3;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(nextBtn.textContent).toBe('Get Started');
        });

        test('next button shows "Next" on non-last step', () => {
            const steps = document.querySelectorAll('.welcome-step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('welcome-prev');
            const nextBtn = document.getElementById('welcome-next');

            bm.tutorialStep = 1;
            bm.updateTutorialStep(steps, dots, prevBtn, nextBtn);

            expect(nextBtn.textContent).toBe('Next');
        });
    });

    // ================================================================
    // WELCOME MODAL — show/close
    // ================================================================

    describe('Welcome modal show/close', () => {
        test('showWelcome adds active class', () => {
            bm.showWelcome();
            const modal = document.getElementById('welcome-modal');
            expect(modal.classList.contains('active')).toBe(true);
        });

        test('closeWelcome removes active class and sets localStorage', () => {
            bm.showWelcome();
            bm.closeWelcome();
            const modal = document.getElementById('welcome-modal');
            expect(modal.classList.contains('active')).toBe(false);
            expect(localStorage.getItem('hta_tutorial_seen')).toBe('true');
            expect(bm.hasSeenTutorial).toBe(true);
        });
    });

    // ================================================================
    // SAMPLE DATASETS
    // ================================================================

    describe('Sample datasets', () => {
        test('getSampleDatasets returns 4 datasets', () => {
            const datasets = bm.getSampleDatasets();
            expect(Object.keys(datasets)).toEqual(['bcg', 'amlodipine', 'smoking', 'diabetes']);
        });

        test('BCG dataset has 13 studies', () => {
            const ds = bm.getSampleDatasets();
            expect(ds.bcg.studies).toHaveLength(13);
            expect(ds.bcg.type).toBe('pairwise');
        });

        test('smoking dataset is NMA type', () => {
            const ds = bm.getSampleDatasets();
            expect(ds.smoking.type).toBe('nma');
        });

        test('diabetes dataset is DTA type', () => {
            const ds = bm.getSampleDatasets();
            expect(ds.diabetes.type).toBe('dta');
        });

        test('loadSampleDataset sets window.currentDataset', () => {
            bm.loadSampleDataset('bcg');
            expect(window.currentDataset).toBeDefined();
            expect(window.currentDataset.name).toBe('BCG Vaccine Trials');
        });

        test('loadSampleDataset with invalid ID does nothing', () => {
            window.currentDataset = null;
            bm.loadSampleDataset('nonexistent');
            expect(window.currentDataset).toBeNull();
        });
    });

    // ================================================================
    // DATA ENTRY — rows, show/close
    // ================================================================

    describe('Data entry panel', () => {
        test('generateEmptyRows creates correct number of rows', () => {
            const html = bm.generateEmptyRows(3);
            const temp = document.createElement('tbody');
            temp.innerHTML = html;
            expect(temp.querySelectorAll('tr')).toHaveLength(3);
        });

        test('showDataEntry adds active class to panel', () => {
            bm.showDataEntry();
            const panel = document.getElementById('data-entry-panel');
            expect(panel.classList.contains('active')).toBe(true);
        });

        test('closeDataEntry removes active class', () => {
            bm.showDataEntry();
            bm.closeDataEntry();
            const panel = document.getElementById('data-entry-panel');
            expect(panel.classList.contains('active')).toBe(false);
        });

        test('showDataEntryModal is an alias for showDataEntry', () => {
            bm.showDataEntryModal();
            const panel = document.getElementById('data-entry-panel');
            expect(panel.classList.contains('active')).toBe(true);
        });

        test('addDataRow increases row count', () => {
            const tbody = document.getElementById('data-grid-body');
            const initialCount = tbody.querySelectorAll('tr').length;
            bm.addDataRow();
            expect(tbody.querySelectorAll('tr').length).toBe(initialCount + 1);
        });
    });

    // ================================================================
    // HELP PANEL
    // ================================================================

    describe('Help panel', () => {
        test('toggleHelp toggles open class on help panel', () => {
            const panel = document.getElementById('help-panel');
            expect(panel.classList.contains('open')).toBe(false);

            bm.toggleHelp();
            expect(panel.classList.contains('open')).toBe(true);

            bm.toggleHelp();
            expect(panel.classList.contains('open')).toBe(false);
        });

        test('toggleHelpPanel is backward-compatible alias', () => {
            const panel = document.getElementById('help-panel');
            bm.toggleHelpPanel();
            expect(panel.classList.contains('open')).toBe(true);
        });

        test('help button exists in DOM', () => {
            const btn = document.getElementById('help-button');
            expect(btn).not.toBeNull();
            expect(btn.textContent).toBe('?');
        });
    });

    // ================================================================
    // interpretResults — plain language interpretation
    // ================================================================

    describe('interpretResults', () => {
        test('OR with reduction (exp < 1) says reduction', () => {
            const results = {
                pooled: { effect: -0.5, ci: [-0.8, -0.2] },
                heterogeneity: { I2: 10 }
            };
            const text = bm.interpretResults('OR', results);
            expect(text).toContain('reduction in risk');
            expect(text).toContain('statistically significant');
            expect(text).toContain('low');
        });

        test('RR with increase (exp > 1) says increase', () => {
            const results = {
                pooled: { effect: 0.3, ci: [0.1, 0.5] },
                heterogeneity: { I2: 30 }
            };
            const text = bm.interpretResults('RR', results);
            expect(text).toContain('increase in risk');
            expect(text).toContain('moderate');
        });

        test('MD with non-significant result says not significant', () => {
            const results = {
                pooled: { effect: 0.1, ci: [-0.5, 0.7] },
                heterogeneity: { I2: 60 }
            };
            const text = bm.interpretResults('MD', results);
            expect(text).toContain('not statistically significant');
            expect(text).toContain('substantial');
        });

        test('high I2 (>75) says considerable heterogeneity', () => {
            const results = {
                pooled: { effect: 0.5, ci: [0.1, 0.9] },
                heterogeneity: { I2: 85 }
            };
            const text = bm.interpretResults('SMD', results);
            expect(text).toContain('considerable');
        });

        test('works with random key instead of pooled', () => {
            const results = {
                random: { effect: -0.3, ci_lower: -0.6, ci_upper: -0.1 },
                heterogeneity: { I2: 45 }
            };
            const text = bm.interpretResults('OR', results);
            expect(text).toContain('reduction');
        });
    });

    // ================================================================
    // EXPORT — exportToCSV, copyToClipboard
    // ================================================================

    describe('Export features', () => {
        test('exportToCSV with no data and no currentDataset shows error', () => {
            window.currentDataset = null;
            // Mock showToast
            bm.showToast = jest.fn();
            bm.exportToCSV(null);
            expect(bm.showToast).toHaveBeenCalledWith('No data to export', 'error');
        });

        test('exportToCSV uses currentDataset as fallback', () => {
            window.currentDataset = {
                name: 'Test',
                studies: [
                    { study: 'A', effect: 0.5, se: 0.1 },
                    { study: 'B', effect: 0.3, se: 0.2 }
                ]
            };
            window.lastResults = null;
            bm.downloadFile = jest.fn();
            bm.showToast = jest.fn();

            bm.exportToCSV(null);

            expect(bm.downloadFile).toHaveBeenCalled();
            const csv = bm.downloadFile.mock.calls[0][0];
            expect(csv).toContain('Study,Effect,SE,Weight');
            expect(csv).toContain('"A"');
        });

        test('exportToExcel delegates to exportToCSV', () => {
            bm.exportToCSV = jest.fn();
            bm.exportToExcel({ studies: [] }, 'test.xlsx');
            expect(bm.exportToCSV).toHaveBeenCalledWith({ studies: [] }, 'test.csv');
        });
    });

    // ================================================================
    // TOOLTIPS
    // ================================================================

    describe('Tooltips', () => {
        test('tooltipData is populated with statistical terms', () => {
            expect(bm.tooltipData).toBeDefined();
            expect(bm.tooltipData['ICER']).toBeDefined();
            expect(bm.tooltipData['QALY']).toBeDefined();
            expect(bm.tooltipData['NMA']).toBeDefined();
        });

        test('applyTooltipsToElement does nothing for null element', () => {
            expect(() => bm.applyTooltipsToElement(null)).not.toThrow();
        });

        test('applyTooltipsToElement adds tooltip for matching term', () => {
            const el = document.createElement('span');
            el.textContent = 'The ICER value';
            bm.applyTooltipsToElement(el);
            expect(el.querySelector('.stat-term-tooltip')).not.toBeNull();
        });
    });
});
