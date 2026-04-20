/**
 * Tests for NewEngineExporter — 10 new v0.8 engine exports to R, CSV, Python
 */

'use strict';

const { NewEngineExporter } = require('../../src/utils/newEngineExports');

// ============================================================================
// SHARED FIXTURES
// ============================================================================

const biaResult = {
    years: [1, 2, 3, 4, 5],
    budget: [100000, 120000, 135000, 140000, 150000],
    strategyName: 'DrugA'
};

const mcdaResult = {
    alternatives: ['DrugA', 'DrugB', 'Placebo'],
    criteria: ['Efficacy', 'Safety', 'Cost'],
    scores: [
        [0.8, 0.6, 0.4],
        [0.7, 0.8, 0.5],
        [0.3, 0.9, 0.9]
    ],
    weights: [0.5, 0.3, 0.2]
};

const crResult = {
    times: [0, 1, 2, 3, 4, 5],
    causes: ['Relapse', 'Death'],
    cif: {
        Relapse: [0, 0.05, 0.12, 0.18, 0.22, 0.25],
        Death: [0, 0.02, 0.04, 0.07, 0.10, 0.14]
    },
    se: {
        Relapse: [0, 0.01, 0.02, 0.02, 0.03, 0.03],
        Death: [0, 0.005, 0.01, 0.015, 0.02, 0.025]
    }
};

const cureResult = {
    times: [0, 1, 2, 3, 5, 10],
    survival: [1, 0.85, 0.72, 0.65, 0.55, 0.45],
    hazard: [0, 0.15, 0.10, 0.08, 0.05, 0.02],
    curedProb: 0.4,
    distribution: 'weibull'
};

const smResult = {
    states: ['Healthy', 'Sick', 'Dead'],
    cycles: 5,
    trace: {
        Healthy: [1, 0.85, 0.72, 0.61, 0.52],
        Sick: [0, 0.10, 0.18, 0.22, 0.24],
        Dead: [0, 0.05, 0.10, 0.17, 0.24]
    },
    transitionMatrix: [
        [0.85, 0.10, 0.05],
        [0.05, 0.80, 0.15],
        [0, 0, 1]
    ]
};

const psaResult = {
    iterations: [
        { params: { pDeath: 0.02, cDrug: 5000 }, cost: 45000, qaly: 8.2 },
        { params: { pDeath: 0.03, cDrug: 5500 }, cost: 48000, qaly: 7.9 },
        { params: { pDeath: 0.015, cDrug: 4800 }, cost: 42000, qaly: 8.5 }
    ],
    paramNames: ['pDeath', 'cDrug']
};

const threshResult = {
    parameters: [
        { name: 'Drug cost', low: 15000, high: 45000, swing: 30000, baseValue: 30000 },
        { name: 'Efficacy', low: 20000, high: 55000, swing: 35000, baseValue: 0.8 },
        { name: 'Discount rate', low: 28000, high: 35000, swing: 7000, baseValue: 0.035 }
    ],
    icer: 32000
};

const scenResult = {
    scenarios: [
        { name: 'Base case', cost: 50000, qaly: 8.5, icer: 32000 },
        { name: 'Optimistic', cost: 45000, qaly: 9.0, icer: 25000 },
        { name: 'Pessimistic', cost: 55000, qaly: 7.8, icer: 42000 }
    ],
    baseScenario: 'Base case'
};

const maResult = {
    distributions: [
        { name: 'Weibull', aic: 120.5, bic: 125.3, weight: 0.45, params: { shape: 1.2, scale: 5.5 } },
        { name: 'Lognormal', aic: 122.1, bic: 126.9, weight: 0.35, params: { meanlog: 1.5, sdlog: 0.8 } },
        { name: 'Gompertz', aic: 125.0, bic: 129.8, weight: 0.20, params: { shape: 0.1, rate: 0.05 } }
    ],
    times: [0, 1, 2, 3, 4, 5],
    survivalCurves: {
        Weibull: [1, 0.88, 0.75, 0.62, 0.50, 0.40],
        Lognormal: [1, 0.90, 0.78, 0.65, 0.53, 0.42],
        Gompertz: [1, 0.86, 0.71, 0.58, 0.46, 0.36]
    }
};

const evsiResult = {
    sampleSizes: [50, 100, 200, 500, 1000],
    evsi: [5000, 12000, 22000, 35000, 42000],
    cost: [2000, 4000, 8000, 20000, 40000],
    netValue: [3000, 8000, 14000, 15000, 2000],
    optimalN: 500
};

// ============================================================================
// TESTS
// ============================================================================

describe('NewEngineExporter', () => {
    let exporter;

    beforeEach(() => {
        exporter = new NewEngineExporter();
    });

    // ========================================================================
    // 1. BIA
    // ========================================================================
    describe('exportBIA', () => {
        test('R export contains library and data.frame', () => {
            const code = exporter.exportBIA(biaResult, 'r');
            expect(code).toContain('library');
            expect(code).toContain('data.frame');
            expect(code).toContain('Budget Impact Analysis');
            expect(code).toContain('ggplot');
        });

        test('CSV export has correct headers', () => {
            const csv = exporter.exportBIA(biaResult, 'csv');
            expect(csv).toContain('Year,Budget,Strategy');
            expect(csv).toContain('1,100000,DrugA');
            expect(csv).toContain('5,150000,DrugA');
        });

        test('Python export contains import pandas', () => {
            const code = exporter.exportBIA(biaResult, 'python');
            expect(code).toContain('import pandas as pd');
            expect(code).toContain('import matplotlib.pyplot as plt');
            expect(code).toContain('pd.DataFrame');
        });
    });

    // ========================================================================
    // 2. MCDA
    // ========================================================================
    describe('exportMCDA', () => {
        test('R export contains criteria names and MCDA package', () => {
            const code = exporter.exportMCDA(mcdaResult, 'r');
            expect(code).toContain('library(MCDA)');
            expect(code).toContain('"Efficacy"');
            expect(code).toContain('"Safety"');
            expect(code).toContain('"Cost"');
            expect(code).toContain('alternatives');
            expect(code).toContain('criteria');
        });

        test('CSV has alternatives as rows', () => {
            const csv = exporter.exportMCDA(mcdaResult, 'csv');
            expect(csv).toContain('Alternative');
            expect(csv).toContain('DrugA');
            expect(csv).toContain('DrugB');
            expect(csv).toContain('Placebo');
            // Verify criteria as columns
            expect(csv).toContain('Efficacy');
            expect(csv).toContain('Safety');
        });

        test('Python export contains radar chart code', () => {
            const code = exporter.exportMCDA(mcdaResult, 'python');
            expect(code).toContain('import pandas as pd');
            expect(code).toContain('polar=True');
            expect(code).toContain('Radar Chart');
        });
    });

    // ========================================================================
    // 3. Competing Risks
    // ========================================================================
    describe('exportCompetingRisks', () => {
        test('R export contains cmprsk', () => {
            const code = exporter.exportCompetingRisks(crResult, 'r');
            expect(code).toContain('library(cmprsk)');
            expect(code).toContain('Competing Risks');
            expect(code).toContain('cif_Relapse');
            expect(code).toContain('cif_Death');
        });

        test('CSV has Time and CIF columns', () => {
            const csv = exporter.exportCompetingRisks(crResult, 'csv');
            expect(csv).toContain('Time');
            expect(csv).toContain('CIF_Relapse');
            expect(csv).toContain('CIF_Death');
            expect(csv).toContain('SE_Relapse');
        });

        test('Python export has step plot code', () => {
            const code = exporter.exportCompetingRisks(crResult, 'python');
            expect(code).toContain('import pandas as pd');
            expect(code).toContain('plt.step');
            expect(code).toContain('Competing Risks');
        });
    });

    // ========================================================================
    // 4. Cure Model
    // ========================================================================
    describe('exportCureModel', () => {
        test('R export contains flexsurvcure', () => {
            const code = exporter.exportCureModel(cureResult, 'r');
            expect(code).toContain('library(flexsurvcure)');
            expect(code).toContain('cured_prob');
            expect(code).toContain('Cure Model');
        });

        test('CSV has survival column', () => {
            const csv = exporter.exportCureModel(cureResult, 'csv');
            expect(csv).toContain('Survival');
            expect(csv).toContain('Hazard');
            expect(csv).toContain('Cured_Prob');
            expect(csv).toContain('Time');
        });

        test('Python export has survival curve plot', () => {
            const code = exporter.exportCureModel(cureResult, 'python');
            expect(code).toContain('import pandas as pd');
            expect(code).toContain('Survival');
            expect(code).toContain('cured_prob');
        });
    });

    // ========================================================================
    // 5. Semi-Markov
    // ========================================================================
    describe('exportSemiMarkov', () => {
        test('R export contains state names and heemod/msm', () => {
            const code = exporter.exportSemiMarkov(smResult, 'r');
            expect(code).toContain('library(heemod)');
            expect(code).toContain('library(msm)');
            expect(code).toContain('"Healthy"');
            expect(code).toContain('"Sick"');
            expect(code).toContain('"Dead"');
        });

        test('CSV has state trace with Cycle column', () => {
            const csv = exporter.exportSemiMarkov(smResult, 'csv');
            expect(csv).toContain('Cycle');
            expect(csv).toContain('Healthy');
            expect(csv).toContain('Sick');
            expect(csv).toContain('Dead');
            // First row: cycle 0, proportions 1, 0, 0
            const lines = csv.trim().split('\n');
            expect(lines.length).toBe(6); // header + 5 cycles
        });

        test('Python export has numpy state trace', () => {
            const code = exporter.exportSemiMarkov(smResult, 'python');
            expect(code).toContain('import numpy as np');
            expect(code).toContain('states');
            expect(code).toContain('Semi-Markov');
        });
    });

    // ========================================================================
    // 6. Correlated PSA
    // ========================================================================
    describe('exportCorrelatedPSA', () => {
        test('R export contains BCEA', () => {
            const code = exporter.exportCorrelatedPSA(psaResult, 'r');
            expect(code).toContain('library(BCEA)');
            expect(code).toContain('costs');
            expect(code).toContain('qalys');
            expect(code).toContain('psa_data');
        });

        test('CSV has iteration rows with params, cost, qaly', () => {
            const csv = exporter.exportCorrelatedPSA(psaResult, 'csv');
            expect(csv).toContain('Iteration');
            expect(csv).toContain('pDeath');
            expect(csv).toContain('cDrug');
            expect(csv).toContain('Cost');
            expect(csv).toContain('QALY');
            // 3 iterations + header
            const lines = csv.trim().split('\n');
            expect(lines.length).toBe(4);
        });

        test('Python export contains seaborn scatter', () => {
            const code = exporter.exportCorrelatedPSA(psaResult, 'python');
            expect(code).toContain('import seaborn as sns');
            expect(code).toContain('sns.scatterplot');
            expect(code).toContain('CE Plane');
        });
    });

    // ========================================================================
    // 7. Threshold
    // ========================================================================
    describe('exportThreshold', () => {
        test('R export contains ggplot tornado', () => {
            const code = exporter.exportThreshold(threshResult, 'r');
            expect(code).toContain('ggplot');
            expect(code).toContain('Tornado');
            expect(code).toContain('"Drug cost"');
            expect(code).toContain('"Efficacy"');
        });

        test('CSV has parameter, low, high, swing columns', () => {
            const csv = exporter.exportThreshold(threshResult, 'csv');
            expect(csv).toContain('Parameter');
            expect(csv).toContain('Low');
            expect(csv).toContain('High');
            expect(csv).toContain('Swing');
            expect(csv).toContain('Drug cost');
        });

        test('Python export has matplotlib tornado', () => {
            const code = exporter.exportThreshold(threshResult, 'python');
            expect(code).toContain('import matplotlib.pyplot as plt');
            expect(code).toContain('barh');
            expect(code).toContain('Tornado');
        });
    });

    // ========================================================================
    // 8. Scenario
    // ========================================================================
    describe('exportScenario', () => {
        test('R export contains scenario names', () => {
            const code = exporter.exportScenario(scenResult, 'r');
            expect(code).toContain('"Base case"');
            expect(code).toContain('"Optimistic"');
            expect(code).toContain('"Pessimistic"');
            expect(code).toContain('scenario_data');
        });

        test('CSV has comparison table', () => {
            const csv = exporter.exportScenario(scenResult, 'csv');
            expect(csv).toContain('Scenario');
            expect(csv).toContain('Cost');
            expect(csv).toContain('QALY');
            expect(csv).toContain('ICER');
            expect(csv).toContain('Base case');
            expect(csv).toContain('Optimistic');
        });

        test('Python export has scatter comparison', () => {
            const code = exporter.exportScenario(scenResult, 'python');
            expect(code).toContain('import pandas as pd');
            expect(code).toContain('scatter');
            expect(code).toContain('Scenario Analysis');
        });
    });

    // ========================================================================
    // 9. Model Averaging
    // ========================================================================
    describe('exportModelAveraging', () => {
        test('R export contains distribution names and flexsurv', () => {
            const code = exporter.exportModelAveraging(maResult, 'r');
            expect(code).toContain('library(flexsurv)');
            expect(code).toContain('"Weibull"');
            expect(code).toContain('"Lognormal"');
            expect(code).toContain('"Gompertz"');
            expect(code).toContain('AIC');
        });

        test('CSV has AIC/BIC/Weight columns', () => {
            const csv = exporter.exportModelAveraging(maResult, 'csv');
            expect(csv).toContain('Distribution');
            expect(csv).toContain('AIC');
            expect(csv).toContain('BIC');
            expect(csv).toContain('Weight');
            expect(csv).toContain('Weibull');
        });

        test('Python export has scipy survival plots', () => {
            const code = exporter.exportModelAveraging(maResult, 'python');
            expect(code).toContain('from scipy import stats');
            expect(code).toContain('Model Averaging');
            expect(code).toContain('Survival');
        });
    });

    // ========================================================================
    // 10. EVSI
    // ========================================================================
    describe('exportEVSI', () => {
        test('R export contains evsi variable and curve plot', () => {
            const code = exporter.exportEVSI(evsiResult, 'r');
            expect(code).toContain('evsi');
            expect(code).toContain('sample_size');
            expect(code).toContain('optimal_n');
            expect(code).toContain('ggplot');
        });

        test('CSV has sample_size column', () => {
            const csv = exporter.exportEVSI(evsiResult, 'csv');
            expect(csv).toContain('Sample_Size');
            expect(csv).toContain('EVSI');
            expect(csv).toContain('Cost');
            expect(csv).toContain('Net_Value');
            expect(csv).toContain('50');
            expect(csv).toContain('1000');
        });

        test('Python export has EVSI curve plot', () => {
            const code = exporter.exportEVSI(evsiResult, 'python');
            expect(code).toContain('import matplotlib.pyplot as plt');
            expect(code).toContain('EVSI');
            expect(code).toContain('optimal_n');
        });
    });

    // ========================================================================
    // exportAll
    // ========================================================================
    describe('exportAll', () => {
        test('detects BIA result type', () => {
            const code = exporter.exportAll(biaResult, 'r');
            expect(code).toContain('Budget Impact Analysis');
        });

        test('detects MCDA result type', () => {
            const code = exporter.exportAll(mcdaResult, 'r');
            expect(code).toContain('MCDA');
        });

        test('detects Competing Risks result type', () => {
            const code = exporter.exportAll(crResult, 'r');
            expect(code).toContain('cmprsk');
        });

        test('detects Cure Model result type', () => {
            const code = exporter.exportAll(cureResult, 'r');
            expect(code).toContain('flexsurvcure');
        });

        test('detects EVSI result type via _type field', () => {
            const result = { ...evsiResult, _type: 'evsi' };
            const code = exporter.exportAll(result, 'csv');
            expect(code).toContain('Sample_Size');
        });

        test('returns empty string for null results', () => {
            const code = exporter.exportAll(null, 'r');
            expect(code).toBe('');
        });

        test('returns unknown message for unrecognizable results', () => {
            const code = exporter.exportAll({ foo: 'bar' }, 'r');
            expect(code).toContain('Unknown result type');
        });
    });

    // ========================================================================
    // Format validation & edge cases
    // ========================================================================
    describe('format validation and edge cases', () => {
        test('unknown format throws error', () => {
            expect(() => exporter.exportBIA(biaResult, 'xml'))
                .toThrow('Unsupported export format: "xml"');
        });

        test('empty BIA result handles gracefully', () => {
            const code = exporter.exportBIA({}, 'r');
            expect(code).toContain('Budget Impact Analysis');
            expect(code).not.toContain('undefined');
        });

        test('empty MCDA result handles gracefully', () => {
            const csv = exporter.exportMCDA({}, 'csv');
            expect(csv).toContain('Alternative');
            expect(csv).not.toContain('undefined');
        });

        test('R exports have no undefined values in output', () => {
            const engines = [
                ['exportBIA', biaResult],
                ['exportMCDA', mcdaResult],
                ['exportCompetingRisks', crResult],
                ['exportCureModel', cureResult],
                ['exportSemiMarkov', smResult],
                ['exportCorrelatedPSA', psaResult],
                ['exportThreshold', threshResult],
                ['exportScenario', scenResult],
                ['exportModelAveraging', maResult],
                ['exportEVSI', evsiResult]
            ];
            for (const [method, data] of engines) {
                const code = exporter[method](data, 'r');
                expect(code).not.toContain('undefined');
            }
        });

        test('CSV exports have no undefined in cells', () => {
            const engines = [
                ['exportBIA', biaResult],
                ['exportMCDA', mcdaResult],
                ['exportCompetingRisks', crResult],
                ['exportCureModel', cureResult],
                ['exportSemiMarkov', smResult],
                ['exportCorrelatedPSA', psaResult],
                ['exportThreshold', threshResult],
                ['exportScenario', scenResult],
                ['exportModelAveraging', maResult],
                ['exportEVSI', evsiResult]
            ];
            for (const [method, data] of engines) {
                const csv = exporter[method](data, 'csv');
                expect(csv).not.toContain('undefined');
            }
        });

        test('R exports contain comment header with date and engine name', () => {
            const code = exporter.exportBIA(biaResult, 'r');
            expect(code).toMatch(/# Generated: \d{4}-\d{2}/);
            expect(code).toContain('Engine: Budget Impact Analysis');
            expect(code).toContain('Version: 0.8.0');
        });

        test('Python exports contain import statements', () => {
            const engines = [
                ['exportBIA', biaResult],
                ['exportMCDA', mcdaResult],
                ['exportCompetingRisks', crResult],
                ['exportCureModel', cureResult],
                ['exportSemiMarkov', smResult],
                ['exportCorrelatedPSA', psaResult],
                ['exportThreshold', threshResult],
                ['exportScenario', scenResult],
                ['exportModelAveraging', maResult],
                ['exportEVSI', evsiResult]
            ];
            for (const [method, data] of engines) {
                const code = exporter[method](data, 'python');
                expect(code).toContain('import pandas');
                expect(code).toContain('import numpy');
                expect(code).toContain('import matplotlib');
            }
        });
    });
});
