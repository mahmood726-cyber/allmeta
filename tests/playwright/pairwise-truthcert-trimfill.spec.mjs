import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Requirement: the TruthCert verdict's trim-and-fill (AppState.truthcert.results.trimAndFill) is the
// Duval-Tweedie trim-and-fill of the studies the verdict was computed from, as metafor::trimfill computes
// it, and the verdict tab shows it (lane pwrest3).
// Defect guarded: runTruthCertAnalysis called trimAndFill(studyObjects, results) -- trimAndFill takes
// (yi[], vi[], side, estimator, maxIter, tau2Method) -- so it threw on every run, the error was swallowed
// and the verdict always carried an empty trim-and-fill ({}); the verdict tab's Trim-and-Fill section was
// never shown. Same defect in the Pairwise AI bundle and in Truthcert1/app.min.js.
// Same class, same function: breakdownPoint(studies, results) was given the results object, which has no
// theta or CI (they are in results.pooled), so it always returned "Effect already inconclusive" with
// fractionNull 0 -- the "Breakdown Robustness" ledger entry was always red and "Low breakdown point" always
// added to the severity score.
// Reference: Pairwiseai/tests/bias_metafor521.json (R 4.6.0, metafor 5.2.1; dat.bcg, log RR).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || path.join(HERE, '..', '..');
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'Pairwiseai', 'tests', 'bias_metafor521.json'), 'utf8')).bcg;

// metadat dat.bcg (tpos, tneg, cpos, cneg) as 2x2 rows; the page's log RR must equal REF.yi.
const BCG = [
  ['Aronson 1948', 4, 119, 11, 128], ['Ferguson & Simes 1949', 6, 300, 29, 274], ['Rosenthal 1960', 3, 228, 11, 209],
  ['Hart & Sutherland 1977', 62, 13536, 248, 12619], ['Frimodt-Moller 1973', 33, 5036, 47, 5761],
  ['Stein & Aronson 1953', 180, 1361, 372, 1079], ['Vandiviere 1973', 8, 2537, 10, 619],
  ['TPT Madras 1980', 505, 87886, 499, 87892], ['Coetzee & Berjak 1968', 29, 7470, 45, 7232],
  ['Rosenthal 1961', 17, 1699, 65, 1600], ['Comstock 1974', 186, 50448, 141, 27197],
  ['Comstock & Webster 1969', 5, 2493, 3, 2338], ['Comstock 1976', 27, 16886, 29, 17825],
].map(([name, tp, tn, cp, cn]) => ({ name, events_t: tp, n_t: tp + tn, events_c: cp, n_c: cp + cn }));

const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
];

for (const [name, url] of PAGES) {
  test(`${name}: the TruthCert trim-and-fill is computed (metafor trimfill, dat.bcg) and shown`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
    await page.evaluate(rows => {
      DEMO_DATASETS.__BCG = { name: 'dat.bcg', dataType: 'binary', measure: 'RR', studies: rows };
      loadDemoDataset('__BCG');
    }, BCG);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      AppState.settings.effectMeasure = 'RR'; AppState.settings.tau2Method = 'REML';
      window.__prev = AppState.results; runAnalysis();
    });
    await page.waitForFunction(() => AppState.results && AppState.results !== window.__prev && AppState.truthcert
      && AppState.truthcert.results && AppState.truthcert.results.theta === AppState.results.pooled.theta, null, { timeout: 30000 });
    const got = await page.evaluate(() => {
      const tf = AppState.truthcert.results.trimAndFill || {};
      const box = document.getElementById('trimFillContainer');
      const bp = AppState.truthcert.results.breakdownPoint, P = AppState.results.pooled;
      return { yi: AppState.results.yi, measure: AppState.results.measure, tf, bp,
        ciExcludesNull: P.ci_lower > 0 || P.ci_upper < 0,
        shown: !!box && box.style.display !== 'none', text: (document.getElementById('trimFillResults') || {}).innerText || '' };
    });
    expect(got.measure).toBe('RR');
    expect(got.yi.length).toBe(REF.yi.length);
    got.yi.forEach((y, i) => expect(Math.abs(y - REF.yi[i]), `yi[${i}]`).toBeLessThan(1e-12));
    const r = REF.trimfill.REML_L0;
    expect(got.tf.k0_imputed, 'k0 (metafor trimfill REML, L0)').toBe(r.k0);
    expect(got.tf.side).toBe(r.side);
    expect(Math.abs(got.tf.adjusted.theta - r.b), `adjusted ${got.tf.adjusted && got.tf.adjusted.theta} vs R ${r.b}`).toBeLessThan(1e-6);
    expect(Math.abs(got.tf.adjusted.ci_lower - r.ci_lb)).toBeLessThan(1e-6);
    expect(Math.abs(got.tf.adjusted.ci_upper - r.ci_ub)).toBeLessThan(1e-6);
    expect(got.shown, 'the verdict tab shows its trim-and-fill').toBe(true);
    expect(got.text).toContain(`${r.k0} stud`);
    expect(got.text).toContain(r.side);
    // breakdown point of the pooled estimate (dat.bcg: CI excludes no effect, so it is not "already inconclusive")
    expect(got.ciExcludesNull).toBe(true);
    expect(got.bp.reason, 'breakdown point read the pooled estimate').not.toBe('Effect already inconclusive');
    expect(got.bp.fractionNull).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
