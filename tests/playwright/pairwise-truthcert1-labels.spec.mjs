import { test, expect } from '@playwright/test';

// Requirement: in TruthCert Pairwise Pro (Truthcert1 production + app.min.js) a study / subgroup / trial label
// is shown as text wherever it is rendered -- markup in a label is never parsed -- and the Code tab's Copy
// buttons copy the code shown (lane pwrest3).
// Defects guarded:
//  - the Code tab put the R / Python code into innerHTML (<code>${rCode}</code>), and the code embeds the study
//    names, so a label like <img src=x onerror=alert(1)> ran; the Copy buttons put the whole code into an
//    onclick="navigator.clipboard.writeText(`...`)" attribute, so the first double quote in the code (R has
//    many: library(metafor) ... method="REML") ended the attribute: SyntaxError on every click, nothing copied.
//  - unescaped labels in innerHTML: leave-one-out table (Bias tab), influence-diagnostics list and summary,
//    subgroup table, outlier table, cumulative fallback table, multi-outcome load warnings.

const PATH = '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html';
const EVIL = ['<img src=x onerror=alert(1)>', '"><img src=x onerror="window.__xss=(window.__xss||0)+1">',
  "'><svg onload=alert(2)>", '</td><img src=x onerror=alert(3)>'];

// dat.bcg (13 trials) so that leave-one-out, influence diagnostics and subgroups all have something to show
const BCG = [
  [4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619], [33, 5036, 47, 5761],
  [180, 1361, 372, 1079], [8, 2537, 10, 619], [505, 87886, 499, 87892], [29, 7470, 45, 7232],
  [17, 1699, 65, 1600], [186, 50448, 141, 27197], [5, 2493, 3, 2338], [27, 16886, 29, 17825],
].map(([tp, tn, cp, cn], i) => ({ name: `${EVIL[i % EVIL.length]} #${i + 1}`, events_t: tp, n_t: tp + tn, events_c: cp, n_c: cp + cn,
  subgroup: i < 6 ? EVIL[1] + ' A' : EVIL[0] + ' B' }));

async function setup(page) {
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  await page.evaluate(rows => {
    window.__xss = 0;
    DEMO_DATASETS.__EVIL = { name: 'labels', dataType: 'binary', measure: 'RR', studies: rows };
    loadDemoDataset('__EVIL');
  }, BCG);
  await page.waitForTimeout(400);
  await page.evaluate(() => { AppState.settings.effectMeasure = 'RR'; window.__prev = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev, null, { timeout: 30000 });
  return { errors, dialogs };
}

const injected = page => page.evaluate(() => ({
  imgs: document.querySelectorAll('img[src="x"]').length,
  svgs: document.querySelectorAll('svg[onload]').length,
  xss: window.__xss || 0,
}));

test('study, subgroup and trial labels render as text in every panel', async ({ page }) => {
  test.setTimeout(120000);
  const { errors, dialogs } = await setup(page);
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const b of document.querySelectorAll('[data-tab]')) { b.click(); await wait(250); }
    // the deferred analyses (leave-one-out, influence diagnostics, ...) and the panels drawn on demand
    runFullAnalysis();
    for (let i = 0; i < 300 && !(AppState.results.loo && AppState.results.loo.loo_results); i++) await wait(100);
    try { runMLOutlierDetection(); } catch (e) { window.__xerr = String(e); }
    window.__xerrOutlier = window.__xerr || null;   // asserted below (agy review of #573)
    const res = AppState.results;
    renderOutlierDetection(mlOutlierDetection(res.studies.map(s => s.yi), res.studies.map(s => s.vi), res.studies.map(s => s.name)), 'outlierResults');
    const tmp = document.createElement('div'); tmp.id = '__cumFallback'; document.body.appendChild(tmp);
    const P = window.Plotly; window.Plotly = undefined;
    try { renderCumulativePlot(cumulativeByPrecision(res.studies.map(s => s.yi), res.studies.map(s => s.vi), res.studies.map(s => s.name)), '__cumFallback', 'x'); }
    finally { window.Plotly = P; }
    const mo = document.getElementById('multiOutcomeInput');
    if (mo) { mo.value = JSON.stringify([{ trial: '<img src=x onerror=alert(4)>', outcomes: {} }]); loadMultiOutcomeData(); }
    for (const b of document.querySelectorAll('[data-tab]')) { b.click(); await wait(250); }
  });
  await page.waitForTimeout(500);
  const got = await injected(page);
  expect(got, 'markup from a label was parsed into the page').toEqual({ imgs: 0, svgs: 0, xss: 0 });
  expect(dialogs, 'a label ran script').toEqual([]);
  // the labels are still there, as text
  const txt = await page.evaluate(() => ({
    loo: (AppState.results.loo && AppState.results.loo.loo_results || []).length,
    bias: document.getElementById('panel-bias').innerText,
    code: document.getElementById('panel-code').innerText,
    out: (document.getElementById('outlierResults') || {}).innerText || '',
    cum: document.getElementById('__cumFallback').innerText,
    mo: (document.getElementById('multiOutcomeStatus') || {}).innerText || '',
    subgroups: (AppState.results.subgroups && AppState.results.subgroups.subgroups || []).length,
  }));
  expect(txt.loo, 'leave-one-out ran').toBeGreaterThan(0);
  expect(txt.bias).toContain('<img src=x onerror=alert(1)> #1');
  expect(txt.code).toContain('"<img src=x onerror=alert(1)> #1"');
  expect(txt.out).toContain('<img src=x onerror=alert(1)> #1');
  expect(txt.cum).toContain('<img src=x onerror=alert(1)> #1');
  expect(txt.mo).toContain('<img src=x onerror=alert(4)>');
  // subgroup labels: the subgroup table (Bias tab, after the Full analyses) shows them as text
  expect(txt.subgroups, 'subgroup analysis ran').toBe(2);
  expect(txt.bias).toContain(EVIL[1] + ' A');
  expect(txt.bias).toContain(EVIL[0] + ' B');
  expect(await page.evaluate(() => window.__xerrOutlier), 'runMLOutlierDetection (the Detect Outliers button) threw').toBeNull();
  expect(errors).toEqual([]);
});

test('the Copy R / Copy Python buttons copy exactly the code shown', async ({ page }) => {
  test.setTimeout(90000);
  const { errors } = await setup(page);
  const got = await page.evaluate(async () => {
    const copied = [];
    navigator.clipboard.writeText = t => { copied.push(t); return Promise.resolve(); };
    document.querySelector('[data-tab="code"]').click();
    await new Promise(r => setTimeout(r, 300));
    const panel = document.getElementById('panel-code');
    const btns = [...panel.querySelectorAll('button')].filter(b => /Copy (R|Python) Code/.test(b.textContent));
    for (const b of btns) b.click();
    await new Promise(r => setTimeout(r, 300));
    return { n: btns.length, copied, shown: [...panel.querySelectorAll('pre code')].map(c => c.textContent) };
  });
  expect(got.n).toBe(2);
  expect(got.copied.length, 'each Copy click copied something').toBe(2);
  expect(got.copied[0]).toBe(got.shown[0]);
  expect(got.copied[1]).toBe(got.shown[1]);
  expect(got.copied[0]).toContain('library(metafor)');
  expect(got.copied[0]).toContain('method="');
  expect(got.copied[0]).toContain('"<img src=x onerror=alert(1)> #1"');
  expect(errors).toEqual([]);
});
