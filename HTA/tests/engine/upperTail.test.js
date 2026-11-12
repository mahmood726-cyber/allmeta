/**
 * Upper-tail p-values must be computed as upper tails, never as 1 - CDF, and must agree
 * with R 4.6.0 (lower.tail = FALSE). Reference values: tests/reference/upper_tail_r460.json,
 * produced by tests/reference/upper_tail_reference.R.
 *
 * The defects these tests pin (all reproduced on the code before the fix):
 *  - series-only incomplete gamma (100 terms, no continued fraction): for a large Q statistic
 *    the CDF came out near 0, so p = 1 - CDF = 1 (MetaRegression QM = 5169 on 1 df gave p = 1;
 *    MR-IVW Q = 3000 on 4 df gave p = 1). A decisive test read as "no evidence".
 *  - Wilson-Hilferty chi-square in competing risks / joint model (Gray p 3.1e-5 vs R 1.35e-5).
 *  - a broken t CDF in PublicationBiasTests (Egger p 0.23 vs R 0.26 at 1 df).
 *  - a 3-term erf in AdvancedSurvivalMethods (RMST p off at the 4th digit, Phi(0) = 0.557).
 *  - A&S 7.1.26 normal CDF clipped at |z| > 8: p = 0 exactly for z = 31.7 (R 3.8e-220).
 *  - gamma survival returning 0 whenever x > 50 regardless of shape (R 6.9e-6 at x = 60, shape 30).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const R = require('../reference/upper_tail_r460.json');

// Some engine files export class names that are defined in other files (pre-existing; the
// browser loads every file into one global scope). Shim any such missing global so the file
// under test can be required on its own.
function loadEngine(rel) {
    const p = path.join(__dirname, '../../src/engine', rel);
    for (let i = 0; i < 30; i++) {
        try {
            delete require.cache[require.resolve(p)];
            return require(p);
        } catch (e) {
            const m = /^(\w+) is not defined/.exec(e.message);
            if (!(e instanceof ReferenceError) || !m) throw e;
            globalThis[m[1]] = class {};
        }
    }
    throw new Error('could not load ' + rel);
}

function relErr(a, b) {
    if (a === b) return 0;
    return Math.abs(a - b) / Math.abs(b);
}

describe('upper-tail p-values agree with R lower.tail = FALSE', () => {
    test('MetaRegression: QM = 5169 on 1 df is significant (was p = 1)', () => {
        const { MetaRegression } = loadEngine('advancedStatistics.js');
        const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const eff = x.map(v => 0.5 * v + (v % 2 ? 0.01 : -0.01));
        const r = new MetaRegression().fit(eff, x.map(() => 0.004), x.map(v => [v]));
        expect(relErr(r.QM, R.metareg_qm.stat)).toBeLessThan(1e-9);
        expect(R.metareg_qm.p).toBe(0);           // underflows in R as well
        expect(r.pQM).toBeLessThan(1e-300);
    });

    test('MendelianRandomizationMA.ivw: heterogeneity Q = 3000 on 4 df is significant (was p = 1)', () => {
        const { MendelianRandomizationMA } = loadEngine('frontierMeta.js');
        const d = [];
        for (let i = 0; i < 5; i++) {
            d.push({ betaExposure: 1, seBetaExposure: 0.01, betaOutcome: (i % 2 ? 1 : -1) * 0.5, seBetaOutcome: 0.02 });
        }
        const h = new MendelianRandomizationMA().ivw(d).heterogeneity;
        expect(relErr(h.Q, R.mr_ivw_q.stat)).toBeLessThan(1e-9);
        expect(h.df).toBe(R.mr_ivw_q.df);
        expect(h.pValue).toBeLessThan(1e-300);
    });

    test("CompetingRisksEngine.grayTest: p equals pchisq(stat, 1, lower.tail = FALSE)", () => {
        const { CompetingRisksEngine } = loadEngine('competingRisks.js');
        const treatment = [], control = [];
        for (let i = 0; i < 60; i++) {
            treatment.push({ time: 1 + i * 0.5, event: i < 8 ? 'relapse' : 'censored' });
            control.push({ time: 1 + i * 0.4, event: i < 35 ? 'relapse' : 'censored' });
        }
        const g = new CompetingRisksEngine({ confLevel: 0.95 })
            .grayTest([{ name: 'T', data: treatment }, { name: 'C', data: control }], 'relapse');
        expect(relErr(g.statistic, R.gray.stat)).toBeLessThan(1e-9);
        expect(relErr(g.pValue, R.gray.p)).toBeLessThan(1e-9);
    });

    test('AdvancedSurvivalMethods.rmstAnalysis: two-sided p equals R', () => {
        const { AdvancedSurvivalMethods } = loadEngine('frontierMeta.js');
        const c = Array.from({ length: 30 }, (_, i) => ({ treatment: 0, time: 1 + i * 0.8, event: i < 20 ? 1 : 0 }));
        const t = Array.from({ length: 30 }, (_, i) => ({ treatment: 1, time: 2 + i * 1.0, event: i < 15 ? 1 : 0 }));
        const r = new AdvancedSurvivalMethods().rmstAnalysis([...c, ...t], { restrictionTime: 20 });
        expect(relErr(Math.abs(r.difference.estimate / r.difference.se), R.rmst_z.stat)).toBeLessThan(1e-9);
        expect(relErr(r.difference.pValue, R.rmst_z.p)).toBeLessThan(1e-9);
    });

    test('MetaAnalysisMethods: fixed-effect p for z = 31.7 is 3.8e-220, not 0', () => {
        const { MetaAnalysisMethods } = loadEngine('metaMethods.js');
        const m = new MetaAnalysisMethods().calculatePooledEffect(
            [{ effect: 2.0, se: 0.1 }, { effect: 2.1, se: 0.12 }, { effect: 1.9, se: 0.11 }], { method: 'FE' });
        expect(relErr(m.fixed.z, R.fe_z.stat)).toBeLessThan(1e-9);
        expect(relErr(m.fixed.pValue, R.fe_z.p)).toBeLessThan(1e-9);
    });

    test('PublicationBiasTests.eggerTest: p at 1 df equals 2 * pt(|t|, 1, lower.tail = FALSE)', () => {
        const { PublicationBiasTests } = loadEngine('editorialRevisions.js');
        const eg = new PublicationBiasTests().eggerTest([0.1, 0.3, 1.2], [0.1, 0.2, 0.3]);
        expect(relErr(eg.t, R.egger_t.stat)).toBeLessThan(1e-9);
        expect(eg.df).toBe(1);
        expect(relErr(eg.pValue, R.egger_t.p)).toBeLessThan(1e-9);
    });

    test('BayesianModelAveraging gamma survival at x = 60, shape 30 is 6.9e-6, not 0', () => {
        const { BayesianModelAveraging } = loadEngine('advancedStatistics.js');
        const b = new BayesianModelAveraging({ seed: 1 });
        const s = b._survivalFunction(R.bma_gamma_surv.t, { shape: R.bma_gamma_surv.shape, rate: R.bma_gamma_surv.rate }, 'gamma');
        expect(relErr(s, R.bma_gamma_surv.p)).toBeLessThan(1e-9);
    });
});

describe('CDFs that were crude approximations now agree with R (lower tail)', () => {
    // (competingRisks' module-level chi2CDF is not exported; it is covered by the grayTest case above.)
    test('jointModel _chi2CDF (was Wilson-Hilferty)', () => {
        const { JointModelEngine } = loadEngine('jointModel.js');
        const jm = new JointModelEngine();
        R.chi2_lower.x.forEach((x, i) => {
            expect(Math.abs(jm._chi2CDF(x, 1) - R.chi2_lower.p[i])).toBeLessThan(1e-12);
        });
    });

    test('editorialRevisions _tCDF at 1 df', () => {
        const { PublicationBiasTests } = loadEngine('editorialRevisions.js');
        const pb = new PublicationBiasTests();
        R.t_df1.t.forEach((t, i) => {
            expect(relErr(2 * (1 - pb._tCDF(t, 1)), R.t_df1.p2[i])).toBeLessThan(1e-9);
        });
    });

    test('frontierMeta AdvancedSurvivalMethods _normalCDF (was a 3-term erf)', () => {
        const { AdvancedSurvivalMethods } = loadEngine('frontierMeta.js');
        const a = new AdvancedSurvivalMethods();
        R.norm_lower.z.forEach((z, i) => {
            expect(Math.abs(a._normalCDF(z) - R.norm_lower.p[i])).toBeLessThan(1e-12);
        });
    });

    test('series-only gamma CDFs give the lower tail at large x (advancedStatistics, frontierMeta)', () => {
        const { MetaRegression } = loadEngine('advancedStatistics.js');
        const { MendelianRandomizationMA, IPDMetaAnalysis, AdvancedNMAMethods } = loadEngine('frontierMeta.js');
        const objs = [new MetaRegression(), new MendelianRandomizationMA(), new IPDMetaAnalysis(), new AdvancedNMAMethods()];
        for (const o of objs) {
            R.chisq_large.x.forEach((x, i) => {
                expect(Math.abs(o._chiSquareCDF(x, R.chisq_large.df[i]) - 1)).toBeLessThan(1e-12);
            });
            R.chi2_lower.x.forEach((x, i) => {
                expect(Math.abs(o._chiSquareCDF(x, 1) - R.chi2_lower.p[i])).toBeLessThan(1e-12);
            });
        }
    });
});

describe('no upper tail is computed as 1 - CDF in the HTA engines', () => {
    // Same detector as the tails-lane inventory (sites of the form `1 - <cdf>(`), restricted to live code.
    const CDF = '(?:pnorm|normalCDF|normalCdf|normCDF|normCdf|_normalCDF|Phi|_Phi|phi|tcNormalCdf|pt|tCDF|_tCDF|tcdf|_tcdf|' +
        'pchisq|pchi|chiSqCDF|chiSquareCDF|chiSquaredCDF|chi2CDF|_chi2cdf|_chi2CDF|_chiSquareCDF|chi2cdf|pf|fCDF|fcdf|' +
        '_gammaCDF|gammaCDF|gammainc|gammaIncompleteCDF|gammp|_gammp|gammaP|lowerGamma)';
    const SITE = new RegExp('(?<![\\w.$])1(?:\\.0)?\\s*-\\s*((?:[A-Za-z_$][\\w$]*\\.)*' + CDF + ')\\s*\\(', 'g');
    // Documented exception: incomplete-beta symmetry relation (lower tail by reflection), not a p-value.
    const ALLOW = new Set(['utils/mathUtils.js:110']);

    test('every engine/util file is free of 1 - CDF sites (comments excluded)', () => {
        const root = path.join(__dirname, '../../src');
        const offenders = [];
        for (const dir of ['engine', 'utils']) {
            for (const f of fs.readdirSync(path.join(root, dir)).filter(n => n.endsWith('.js'))) {
                const lines = fs.readFileSync(path.join(root, dir, f), 'utf8').split(/\r?\n/);
                lines.forEach((line, i) => {
                    const code = line.replace(/\/\/.*$/, '');
                    if (/^\s*\*/.test(line)) return;
                    SITE.lastIndex = 0;
                    if (SITE.test(code) && !ALLOW.has(dir + '/' + f + ':' + (i + 1))) offenders.push(dir + '/' + f + ':' + (i + 1) + '  ' + line.trim());
                });
            }
        }
        expect(offenders).toEqual([]);
    });
});
