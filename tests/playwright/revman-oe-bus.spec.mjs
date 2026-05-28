/**
 * Regression for the silent O-E/Variance corruption: comparisonToBus used to push
 * placeholder events:0/n:1 arms + a precomputed sidecar for O-E (log-HR/Peto)
 * outcomes, but MaComparisons.normalizeStudy strips precomputed, so the bus stored
 * 0/1-vs-0/1 garbage while the UI said "Saved". Now it prefers a DICH/CONTINUOUS
 * outcome and refuses O-E-only comparisons (no fake counts written).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/revman-importer/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('revman: O-E outcomes are refused (not silently corrupted); DICH still pushes', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RevmanReader && window.MaComparisons, { timeout: 10000 });

  const r = await page.evaluate(() => {
    const R = window.RevmanReader;
    const oeStudy = { id: 'S1', year: 2020, precomputed: { est: -0.3, se: 0.1 },
      arms: [{ treatment: 'Drug', oeVarianceEst: -0.3, se: 0.1 }, { treatment: 'Placebo', isReference: true }] };
    const dichStudy = { id: 'S1', year: 2020, arms: [{ treatment: 'Drug', events: 5, n: 50 }, { treatment: 'Placebo', events: 12, n: 50 }] };
    const oeOut = { type: 'o_e_var', name: 'Mortality (HR)', effectMeasure: 'HR', arm1Name: 'Drug', arm2Name: 'Placebo', studies: [oeStudy] };
    const dichOut = { type: 'dich', name: 'Death', effectMeasure: 'OR', arm1Name: 'Drug', arm2Name: 'Placebo', studies: [dichStudy] };

    const oeEnv = R.comparisonToBus({ outcomes: [oeOut] });
    const dichEnv = R.comparisonToBus({ outcomes: [dichOut] });
    const mixedEnv = R.comparisonToBus({ outcomes: [oeOut, dichOut] }); // O-E first, DICH second

    // Confirm a DICH push survives the bus round-trip with REAL counts (not 0/1).
    window.MaComparisons.clear && window.MaComparisons.clear();
    const wrote = window.MaComparisons.write(dichEnv);
    const stored = JSON.parse(localStorage.getItem('ma-comparisons-v1') || 'null');
    const a0 = stored && stored.studies[0].arms[0];
    return {
      oeUnsupported: oeEnv && oeEnv._unsupported || null,
      dichPushable: !!(dichEnv && dichEnv.studies && dichEnv.studies.length),
      mixedPicksDich: !!(mixedEnv && mixedEnv.studies && !mixedEnv._unsupported),
      wrote,
      storedArm0: a0,                          // should be {treatment:Drug, events:5, n:50}
      noPlaceholder01: !!(a0 && !(a0.events === 0 && a0.n === 1)),
    };
  });
  console.log('  revman:', JSON.stringify(r));

  expect(r.oeUnsupported, 'O-E-only comparison is refused, not corrupted').toBe('o_e_var');
  expect(r.dichPushable, 'DICH comparison still produces a pushable envelope').toBe(true);
  expect(r.mixedPicksDich, 'mixed comparison prefers the pushable DICH outcome').toBe(true);
  expect(r.wrote, 'DICH writes to the bus').toBe(true);
  expect(r.storedArm0.events, 'real events stored (not placeholder 0)').toBe(5);
  expect(r.storedArm0.n, 'real n stored (not placeholder 1)').toBe(50);
  expect(r.noPlaceholder01, 'no 0/1 placeholder arm written').toBe(true);
  expect(errors, 'no console errors').toEqual([]);
});

test('revman: one impossible row (events>n) is dropped per-row, good studies survive + counted', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RevmanReader && window.MaComparisons, { timeout: 10000 });

  const r = await page.evaluate(() => {
    const R = window.RevmanReader;
    const good = { id: 'GOOD', year: 2020, arms: [{ treatment: 'Drug', events: 5, n: 50 }, { treatment: 'Placebo', events: 12, n: 50 }] };
    // events (60) > n (50): impossible. Under the old code this whole envelope
    // failed validate() and write() returned false → GOOD lost too.
    const bad = { id: 'BAD', year: 2021, arms: [{ treatment: 'Drug', events: 60, n: 50 }, { treatment: 'Placebo', events: 3, n: 50 }] };
    const out = { type: 'dich', name: 'Death', effectMeasure: 'OR', arm1Name: 'Drug', arm2Name: 'Placebo', studies: [good, bad] };

    const env = R.comparisonToBus({ outcomes: [out] });
    window.MaComparisons.clear && window.MaComparisons.clear();
    const wrote = window.MaComparisons.write(env);
    const stored = JSON.parse(localStorage.getItem('ma-comparisons-v1') || 'null');
    return {
      dropped: env._dropped || 0,
      survivingIds: (env.studies || []).map(s => s.id),
      wrote,
      storedIds: stored ? stored.studies.map(s => s.id) : [],
    };
  });
  console.log('  revman-salvage:', JSON.stringify(r));

  expect(r.dropped, 'the one impossible row is counted as dropped').toBe(1);
  expect(r.survivingIds, 'the good study survives the build').toEqual(['GOOD']);
  expect(r.wrote, 'write succeeds on the salvaged remainder').toBe(true);
  expect(r.storedIds, 'only the good study is on the bus').toEqual(['GOOD']);
  expect(errors, 'no console errors').toEqual([]);
});
