/**
 * Tests for src/engine/modelLibrary.js
 */

'use strict';

const ModelLibrary = require('../../src/engine/modelLibrary');

describe('ModelLibrary', () => {
    let library;

    beforeEach(() => {
        library = new ModelLibrary();
    });

    // ============================================================
    // Initialization & Categories
    // ============================================================

    test('initializes with all expected categories', () => {
        const categories = library.getCategories();
        expect(categories).toContain('cvd');
        expect(categories).toContain('oncology');
        expect(categories).toContain('diabetes');
        expect(categories).toContain('mentalHealth');
        expect(categories).toContain('respiratory');
        expect(categories).toContain('infectious');
        expect(categories).toContain('neurology');
        expect(categories).toContain('rheumatology');
        expect(categories).toHaveLength(8);
    });

    test('getAllModels returns a flat array of all models with category field', () => {
        const all = library.getAllModels();
        expect(Array.isArray(all)).toBe(true);
        expect(all.length).toBeGreaterThan(20);
        // Each entry should have category and name
        for (const model of all) {
            expect(model.category).toBeTruthy();
            expect(model.name).toBeDefined();
        }
    });

    test('every model has required fields: id, name, description, type', () => {
        const all = library.getAllModels();
        for (const model of all) {
            expect(model.id).toBeTruthy();
            expect(model.name).toBeTruthy();
            expect(model.description).toBeTruthy();
            expect(model.type).toBeTruthy();
        }
    });

    // ============================================================
    // Retrieval Methods
    // ============================================================

    test('getModel retrieves a specific model by category and name', () => {
        const statin = library.getModel('cvd', 'statinTreatment');
        expect(statin).toBeDefined();
        expect(statin.id).toBe('statin-treatment');
        expect(statin.name).toBe('Statin Treatment Model');
    });

    test('getModel returns undefined for non-existent category', () => {
        const result = library.getModel('nonexistent', 'model');
        expect(result).toBeUndefined();
    });

    test('getModel returns undefined for non-existent model within valid category', () => {
        const result = library.getModel('cvd', 'nonexistent');
        expect(result).toBeUndefined();
    });

    test('getModelById finds model by its id field', () => {
        const model = library.getModelById('lung-nsclc');
        expect(model).toBeDefined();
        expect(model.name).toBe('NSCLC Treatment Model');
        expect(model.category).toBe('oncology');
    });

    test('getModelById returns undefined for non-existent id', () => {
        const model = library.getModelById('non-existent-id');
        expect(model).toBeUndefined();
    });

    // ============================================================
    // Model Content Validation
    // ============================================================

    test('CVD primary prevention model has complete states and transitions', () => {
        const cvdPrev = library.getModel('cvd', 'primaryPrevention');
        expect(cvdPrev.id).toBe('cvd-primary-prevention');
        expect(cvdPrev.type).toBe('Markov Cohort');
        expect(cvdPrev.states).toHaveLength(5);

        // Check absorbing states
        const absorbingStates = cvdPrev.states.filter(s => s.type === 'absorbing');
        expect(absorbingStates.length).toBe(2);

        // Check transitions exist
        expect(Object.keys(cvdPrev.transitions).length).toBeGreaterThan(0);

        // Check strategies
        expect(cvdPrev.strategies).toHaveLength(3);

        // Check parameters have distribution types
        expect(cvdPrev.parameters.baseline_risk_mi.type).toBe('beta');
        expect(cvdPrev.parameters.cost_mi.type).toBe('gamma');
    });

    test('NSCLC model has partitioned survival structure with survival curves', () => {
        const nsclc = library.getModel('oncology', 'lungNSCLC');
        expect(nsclc.type).toBe('Partitioned Survival');
        expect(nsclc.survivalCurves).toBeDefined();
        expect(nsclc.survivalCurves.PFS).toBeDefined();
        expect(nsclc.survivalCurves.OS).toBeDefined();

        // Control and intervention arms
        expect(nsclc.survivalCurves.PFS.control.type).toBe('weibull');
        expect(nsclc.survivalCurves.OS.intervention.type).toBe('lognormal');

        // 3 states: PFS, PD, Death
        expect(nsclc.states).toHaveLength(3);
    });

    test('T2D base model has risk equations and multiple strategies', () => {
        const t2d = library.getModel('diabetes', 't2dBase');
        expect(t2d.riskEquations).toBeDefined();
        expect(t2d.riskEquations.mi).toContain('ukpds_risk_mi');
        expect(t2d.strategies.length).toBeGreaterThanOrEqual(4);
        expect(t2d.states.length).toBeGreaterThanOrEqual(9);
    });

    test('depression model has correct states and strategies', () => {
        const depression = library.getModel('mentalHealth', 'depression');
        expect(depression.states).toHaveLength(4);
        const stateIds = depression.states.map(s => s.id);
        expect(stateIds).toContain('remission');
        expect(stateIds).toContain('depression');
        expect(stateIds).toContain('death');
        expect(depression.strategies).toHaveLength(4);
    });

    test('all models marked validated are flagged true', () => {
        const all = library.getAllModels();
        for (const model of all) {
            expect(model.validated).toBe(true);
        }
    });

    // ============================================================
    // Search
    // ============================================================

    test('searchModels finds models by keyword in name', () => {
        const results = library.searchModels('statin');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === 'statin-treatment' || r.id === 'cvd-primary-prevention')).toBe(true);
    });

    test('searchModels finds models by keyword in description', () => {
        const results = library.searchModels('vaccination');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('searchModels finds models by keyword in reference', () => {
        const results = library.searchModels('NICE TA 254');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('searchModels is case-insensitive', () => {
        const upper = library.searchModels('COVID');
        const lower = library.searchModels('covid');
        expect(upper.length).toBe(lower.length);
        expect(upper.length).toBeGreaterThanOrEqual(1);
    });

    test('searchModels returns empty array for non-matching keyword', () => {
        const results = library.searchModels('xyznonexistent12345');
        expect(results).toEqual([]);
    });

    // ============================================================
    // Edge Cases & Data Integrity
    // ============================================================

    test('COPD model has exacerbation state', () => {
        const copd = library.getModel('respiratory', 'copd');
        expect(copd.states.some(s => s.id === 'exacerbation')).toBe(true);
    });

    test('RA model states cover full DAS28 spectrum', () => {
        const ra = library.getModel('rheumatology', 'rheumatoidArthritis');
        const stateIds = ra.states.map(s => s.id);
        expect(stateIds).toContain('remission');
        expect(stateIds).toContain('lda');
        expect(stateIds).toContain('mda');
        expect(stateIds).toContain('hda');
        expect(stateIds).toContain('death');
    });

    test('stroke model includes multiple anticoagulant strategies', () => {
        const stroke = library.getModel('neurology', 'stroke');
        expect(stroke.strategies.length).toBeGreaterThanOrEqual(4);
        const strategyIds = stroke.strategies.map(s => s.id);
        expect(strategyIds).toContain('warfarin');
        expect(strategyIds).toContain('apixaban');
    });

    test('all model utilities are in [0, 1] range', () => {
        const all = library.getAllModels();
        for (const model of all) {
            if (model.states) {
                for (const state of model.states) {
                    expect(state.utility).toBeGreaterThanOrEqual(0);
                    expect(state.utility).toBeLessThanOrEqual(1);
                }
            }
        }
    });

    test('all model costs are non-negative', () => {
        const all = library.getAllModels();
        for (const model of all) {
            if (model.states) {
                for (const state of model.states) {
                    expect(state.cost).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });
});
