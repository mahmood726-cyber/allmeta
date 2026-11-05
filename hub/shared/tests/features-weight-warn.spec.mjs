// Extreme sampling-variance ratio: non-blocking warning (Mahmood 2026-10-31, "Extreme weight ratios: add a non-blocking
// warning"). shared/variance-ratio.js applies metafor's own condition (rma.uni: max(vi)/min(vi) >= 1/evtol = 1e7).
// For a sample of apps:
//   - enter data with one study far more precise than the rest (SE = 1e-6, or counts of ~1e8-1e9 where the app takes
//     counts) -> the warning is VISIBLE in the app's own warning/note UI and starts with the shared message;
//   - the numbers are UNCHANGED by the warning: the same data re-run with the helper switched off (window.AlmVarianceRatio
//     removed) gives identical result objects and no warning — results are never blocked;
//   - CONTROL: the built-in-style ordinary data shows no such warning.
// Run: npx playwright test -c playwright.features.config.mjs features-weight-warn
import { test, expect } from '@playwright/test';

const START = 'Ratio of largest to smallest sampling variance is extremely large';

// Each case: url, how to enter data + run, where the warning shows, how to read the numbers.
const CASES = [
  {
    app: 'proportion-ma', url: '/proportion-ma/index.html', ready: '#res-body .pooled-row',
    extreme: '500000000, 1000000000, Registry\n8, 90, Study B\n12, 80, Study C\n5, 60, Study D',
    ordinary: '20, 100, Study A\n8, 90, Study B\n12, 80, Study C\n5, 60, Study D',
    enter: async (page, text) => { await page.locator('#src').fill(text); await page.locator('#btn-run').click(); },
    warning: '#k-warn',
    numbers: () => { const r = window._almLastPropMA(); const c = Object.assign({}, r); delete c.varianceRatioWarning; return c; },
  },
  {
    app: 'heterogeneity', url: '/heterogeneity/index.html', ready: '#stats-wrap .stats',
    extreme: 'Trial A, -0.20, 0.10\nTrial B, 0.10, 0.000001\nTrial C, 0.30, 0.20\nTrial D, 0.05, 0.15\nTrial E, -0.10, 0.12',
    ordinary: 'Trial A, -0.20, 0.10\nTrial B, 0.10, 0.08\nTrial C, 0.30, 0.20\nTrial D, 0.05, 0.15\nTrial E, -0.10, 0.12',
    enter: async (page, text) => { await page.locator('#f-data').fill(text); await page.locator('#btn-run').click(); },
    warning: '#warn-banner',
    numbers: () => window._almLastFE(),
  },
  {
    app: 'meta-regression', url: '/meta-regression/index.html', ready: '#stats-wrap .stats',
    extreme: 'Trial A, -0.28, 0.12, 32\nTrial B, -0.10, 0.000001, 40\nTrial C, 0.05, 0.20, 55\nTrial D, -0.30, 0.15, 28\nTrial E, 0.10, 0.18, 60\nTrial F, -0.05, 0.11, 47',
    ordinary: 'Trial A, -0.28, 0.12, 32\nTrial B, -0.10, 0.09, 40\nTrial C, 0.05, 0.20, 55\nTrial D, -0.30, 0.15, 28\nTrial E, 0.10, 0.18, 60\nTrial F, -0.05, 0.11, 47',
    enter: async (page, text) => { await page.locator('#f-data').fill(text); await page.locator('#btn-run').click(); },
    warning: '#warn-banner',
    numbers: () => window.__almResults(),
  },
  {
    app: 'nma', url: '/nma/index.html', ready: '#league-host table',
    extreme: 'T1, Placebo, DrugA, -0.22, 0.12\nT2, Placebo, DrugB, -0.35, 0.000001\nT3, DrugA, DrugB, -0.10, 0.15\nT4, Placebo, DrugA, -0.18, 0.14',
    ordinary: 'T1, Placebo, DrugA, -0.22, 0.12\nT2, Placebo, DrugB, -0.35, 0.10\nT3, DrugA, DrugB, -0.10, 0.15\nT4, Placebo, DrugA, -0.18, 0.14',
    enter: async (page, text) => { await page.locator('#f-data').fill(text); await page.locator('#btn-run').click(); },
    warning: '#warn-banner',
    // The page keeps its analysis private: compare what it displays (league table + stats) and the pure hook.
    numbers: () => ({ league: document.getElementById('league-host').innerText, stats: document.getElementById('stats-wrap').innerText,
      compute: JSON.stringify(window.__almNmaCompute(document.getElementById('f-data').value, document.getElementById('f-ref').value)) }),
  },
  {
    app: 'rve-meta', url: '/rve-meta/index.html', ready: '#coef-body tr',
    extreme: 'studyid,effectsize,var\n1,0.22,0.032\n1,0.31,0.041\n2,0.10,0.000000000001\n3,0.45,0.050\n3,0.38,0.044\n4,0.05,0.036\n5,0.27,0.029\n6,0.15,0.047',
    ordinary: 'studyid,effectsize,var\n1,0.22,0.032\n1,0.31,0.041\n2,0.10,0.025\n3,0.45,0.050\n3,0.38,0.044\n4,0.05,0.036\n5,0.27,0.029\n6,0.15,0.047',
    enter: async (page, text) => { await page.locator('#src').fill(text); await page.locator('#f-names').fill(''); await page.locator('#btn-run').click(); },
    warning: '#meta-row',
    numbers: () => { const r = JSON.parse(JSON.stringify(window.__almLastRVE())); delete r.warnings; delete r.buildInfo; delete r.generatedAt; delete r.timestamp; return r; },
  },
  {
    app: 'dta-sroc', url: '/dta-sroc/index.html', ready: '#stats-wrap .stats',
    extreme: 'Study A, 6, 3, 4, 20\nStudy B, 85, 10, 15, 140\nStudy C, 40, 8, 10, 90\nStudy D, 60, 12, 9, 120\nRegistry, 1000000000, 50000000, 200000000, 3000000000',
    ordinary: 'Study A, 30, 6, 8, 70\nStudy B, 85, 10, 15, 140\nStudy C, 40, 8, 10, 90\nStudy D, 60, 12, 9, 120\nStudy E, 55, 9, 14, 110',
    enter: async (page, text) => { await page.locator('#f-data').fill(text); await page.locator('#btn-run').click(); },
    warning: '#warn-banner',
    numbers: () => window.__almBivariate(),
  },
];

function watchErrors(page) { const errors = []; page.on('pageerror', e => errors.push(e.message)); return errors; }

for (const c of CASES) test(`${c.app}: extreme variance ratio warns visibly, numbers unchanged, never blocks`, async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(c.url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage may be unavailable */ } });
  await page.reload();
  await expect(page.locator(c.ready).first()).toBeVisible({ timeout: 30_000 });

  // CONTROL: ordinary data -> no variance-ratio warning.
  await c.enter(page, c.ordinary);
  await expect(page.locator(c.ready).first()).toBeVisible();
  await expect(page.locator(c.warning)).not.toContainText(START);

  // Extreme data -> warning visible in the app's own warning UI; results still shown.
  await c.enter(page, c.extreme);
  await expect(page.locator(c.ready).first()).toBeVisible();
  const warn = page.locator(c.warning);
  await expect(warn).toBeVisible();
  await expect(warn).toContainText(START);
  await expect(warn).toContainText('metafor');
  const withWarning = await page.evaluate(c.numbers);
  expect(withWarning).toBeTruthy();
  console.log(`WEIGHTWARN ${c.app} warning="${(await warn.innerText()).replace(/\s+/g, ' ').slice(0, 160)}"`);

  // Same data with the helper removed: identical numbers, no warning.
  await page.evaluate(() => { window.__savedVR = window.AlmVarianceRatio; window.AlmVarianceRatio = undefined; });
  await c.enter(page, c.extreme);
  await expect(page.locator(c.ready).first()).toBeVisible();
  await expect(page.locator(c.warning)).not.toContainText(START);
  const without = await page.evaluate(c.numbers);
  expect(without).toEqual(withWarning);
  await page.evaluate(() => { window.AlmVarianceRatio = window.__savedVR; });
  expect(errors).toEqual([]);
});

// The other wired apps: the warning appears where the app shows its notes, and the page throws nothing.
const fillRun = (sel, btn) => async (page, text) => { await page.locator(sel).fill(text); if (btn) await page.locator(btn).click(); };
const MORE = [
  { app: 'component-nma', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: 'drug | control | -0.40 | 0.12\nexercise | control | -0.20 | 0.000001\ndrug+exercise | control | -0.55 | 0.15\ndrug+exercise | drug | -0.18 | 0.14' },
  { app: 'correlation-ma', enter: fillRun('#f-data'), warning: '#alm-plus-prose',
    text: 'Study A, 0.45, 40\nRegistry, 0.30, 1000000000\nStudy C, 0.20, 60\nStudy D, 0.35, 25' },
  { app: 'cumulative-subgroup', enter: fillRun('#f-data'), warning: '#warn-banner',
    text: 'Trial A, -0.22, 0.14, 2015, Low\nTrial B, -0.10, 0.000001, 2016, High\nTrial C, -0.30, 0.20, 2017, Low\nTrial D, 0.05, 0.15, 2018, High' },
  { app: 'dose-response-ma', warning: '#msgs', text: null,
    // The built-in example with one dose-level SE set to 1e-6 (study 5, dose 6).
    enter: async page => {
      const v = await page.locator('#f-data').inputValue();
      expect(v).toContain('0.144215');
      await page.locator('#f-data').fill(v.replace('0.144215', '0.000001'));
      await page.locator('#btn-run').click();
    } },
  { app: 'gosh', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: '0.22, 0.08, Study A\n0.10, 0.000001, Study B\n0.35, 0.12, Study C\n0.05, 0.10, Study D\n0.28, 0.15, Study E' },
  { app: 'influence', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: '0.25, 0.08, Smith\n0.10, 0.000001, Jones\n0.40, 0.12, Lee\n0.05, 0.10, Khan\n0.30, 0.15, Ito' },
  { app: 'limit-ma', enter: fillRun('#src', '#btn-run'), warning: '#limit-diagnostics',
    text: '0.55, 0.08, S01\n0.20, 0.000001, S02\n0.40, 0.12, S03\n0.10, 0.10, S04\n0.35, 0.15, S05' },
  { app: 'mh-peto', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: 'StudyA, 3, 50, 8, 50\nRegistry, 400000000, 1000000000, 500000000, 1000000000\nStudyC, 10, 120, 15, 118\nStudyD, 7, 80, 12, 82' },
  { app: 'multilevel-ma', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: '1, 0.35, 0.12, a\n1, 0.30, 0.000001, b\n2, 0.20, 0.15, c\n3, 0.10, 0.20, d\n3, 0.25, 0.10, e\n4, 0.15, 0.18, f' },
  { app: 'multivariate-ma', enter: fillRun('#f-data'), warning: '#plus-interpretation',
    text: 'T1, 0.47, 0.0075, -0.32, 0.0077, 0.003\nT2, 0.20, 0.000000000001, -0.10, 0.010, 0\nT3, 0.30, 0.010, -0.20, 0.012, 0.002\nT4, 0.40, 0.009, -0.30, 0.008, 0.001\nT5, 0.35, 0.011, -0.25, 0.009, 0.001' },
  { app: 'nma-inconsistency', enter: fillRun('#src', '#btn-run'), warning: '#plus-interpret-list',
    text: 'A, B, -0.30, 0.10\nB, C, -0.10, 0.000001\nA, C, -0.35, 0.12\nA, B, -0.25, 0.14\nA, C, -0.40, 0.15' },
  { app: 'pubbias-tests', enter: fillRun('#src', '#btn-run'), warning: '#varratio-note',
    text: '0.25, 0.08\n0.10, 0.000001\n0.40, 0.12\n0.05, 0.10\n0.30, 0.15\n0.20, 0.09' },
];
for (const c of MORE) test(`${c.app}: extreme variance ratio warning shown in the app's notes`, async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/${c.app}/index.html`);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage may be unavailable */ } });
  await page.reload();
  await page.waitForLoadState('load');
  await c.enter(page, c.text);
  const warn = page.locator(c.warning);
  await expect(warn).toContainText(START, { timeout: 15_000 });
  await expect(warn).toBeVisible();
  console.log(`WEIGHTWARN ${c.app} ok`);
  expect(errors).toEqual([]);
});

test('proportion-ma: the warning is in the exported results and in the Report text Notes', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const flags = () => page.evaluate(() => {
    const spec = window.AlmTextSpecs['proportion-ma'];
    return window.AlmText.render(spec.templates, spec.results(), {}).flags.map(f => f.text);
  });
  expect((await flags()).some(t => /sampling variance is extremely large/.test(t))).toBe(false);
  await page.locator('#src').fill(CASES[0].extreme);
  await page.locator('#btn-run').click();
  await expect(page.locator('#k-warn')).toContainText(START);
  expect(await page.evaluate(() => window._almLastPropMA().varianceRatioWarning)).toContain(START);
  const f = await flags();
  expect(f.some(t => /sampling variance is extremely large/.test(t) && /metafor/.test(t))).toBe(true);
});
