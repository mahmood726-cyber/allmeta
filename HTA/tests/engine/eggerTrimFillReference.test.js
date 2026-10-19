'use strict';
// Egger's test and trim-and-fill pinned to R 4.6.0 / metafor 5.0.1.
// Reference script: HTA/tests/reference/egger_trimfill_reference.R
// (regtest(rma(yi, vi, method = "FE"), model = "lm");
//  trimfill(rma(yi, vi, method = "FE"), estimator = "L0" | "R0" | "Q0")).
const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');
const oracle = require('../reference/egger_trimfill_oracle.json');

const close = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
const estimators = { L0: 'L0', R0: 'R0', Q0: 'Q' };

describe('Egger and trim-and-fill match metafor', () => {
    test('oracle covers both sides, every estimator and an undefined-Q0 case', () => {
        const sides = new Set(oracle.cases.flatMap(c => c.trimfill.filter(t => !t.error).map(t => t.side)));
        expect([...sides].sort()).toEqual(['left', 'right']);
        for (const e of Object.keys(estimators)) expect(oracle.cases.some(c => c.trimfill.some(t => t.estimator === e && !t.error && t.k0 > 0))).toBe(true);
        expect(oracle.cases.some(c => c.trimfill.some(t => t.error))).toBe(true);
    });

    test.each(oracle.cases.map(c => [c.name, c]))('%s: Egger regression test', (_name, c) => {
        const r = new MetaAnalysisMethods().eggerTest(c.studies);
        close(r.intercept, c.egger.intercept);
        close(r.se, c.egger.se);
        close(r.t, c.egger.t);
        close(r.pValue, c.egger.p);
        expect(r.df).toBe(c.egger.df);
    });

    const tfCases = oracle.cases.flatMap(c => c.trimfill.map(t => [c.name, t.estimator, c, t]));
    test.each(tfCases)('%s: trim-and-fill %s', (_name, _e, c, t) => {
        const r = new MetaAnalysisMethods().trimAndFill(c.studies, 'auto', { estimator: estimators[t.estimator] });
        if (t.error) {
            // metafor stops (sqrt of a negative); the engine must refuse, not invent k0.
            expect(r.error).toMatch(/undefined/);
            expect(r.adjusted).toBeUndefined();
            return;
        }
        expect(r.nMissing).toBe(t.k0);
        expect(r.side).toBe(t.side);
        close(r.original.effect, t.original);
        close(r.adjusted.effect, t.adjusted);
        close(r.adjusted.ci_lower, t.adjusted_ci_lower);
        close(r.adjusted.ci_upper, t.adjusted_ci_upper);
        const got = r.imputedStudies.map(s => s.effect).sort((a, b) => a - b);
        const want = [...t.imputed].sort((a, b) => a - b);
        expect(got).toHaveLength(want.length);
        got.forEach((v, i) => close(v, want[i]));
    });

    test('explicit side is honoured and an unknown estimator is refused', () => {
        const c = oracle.cases[0];
        const ma = new MetaAnalysisMethods();
        expect(ma.trimAndFill(c.studies, 'right').side).toBe('right');
        expect(ma.trimAndFill(c.studies, 'auto', { estimator: 'XX' }).error).toMatch(/Unknown/);
    });
});
