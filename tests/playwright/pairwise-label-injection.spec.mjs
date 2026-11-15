import { test, expect } from '@playwright/test';

// Requirement: in the Pairwise AI bundle and in TruthCert Pairwise Pro (Truthcert1), every user-supplied string
// -- study labels, subgroup names, the free-text inputs (HTA names / currency, search topic, method-critic
// fields, multi-outcome JSON) -- is shown as text wherever it is rendered, on every tab and by every button, and
// the exported R / Python / Stata scripts carry a study label as one string literal, whatever it contains
// (lane pwrest4, follow-up to #572, which fixed the same class in the Truthcert1 Bias / influence / subgroup /
// outlier / cumulative / multi-outcome output).
// Defects guarded (before the fix, with these labels and this sweep: bundle 52 elements parsed and 67 handlers run,
// Truthcert1 14 parsed and 20 run; after: 0 and 0):
//  - bundle Bias tab: leave-one-out table (t.study), subgroup table (t.name), influential-study list (e.name)
//    and the influence interpretation, which lists study names, all went into innerHTML unescaped;
//  - both pages: the "Run LOO" (corrected CIs) table and its "Most influential" line (r.omitted);
//  - bundle: outlier-detection table (s.name) and the cumulative fallback table (d.label);
//  - both pages: the search-strategy panel put the typed topic into innerHTML;
//  - the R / Python export wrote "${name}" into the script, so a label with a double quote ended the string and
//    the rest of the label ran as R / Python code when the script was sourced.

const PAGES = {
  'Pairwise AI bundle': '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'TruthCert Pairwise Pro': '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
};
const HIT = 'window.__xss=(window.__xss||0)+1';
const EVIL = [`<img src=x onerror="${HIT}">`, `"><img src=x onerror="${HIT}">`,
  `'><img src=x onerror="${HIT}">`, `</td><svg onload="${HIT}">`];
const RCODE = 'x"); cat("INJECTED"); c("';
// dat.bcg (13 trials) so that leave-one-out, influence diagnostics, outliers and subgroups all have something to show
const BCG = [[4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619], [33, 5036, 47, 5761],
  [180, 1361, 372, 1079], [8, 2537, 10, 619], [505, 87886, 499, 87892], [29, 7470, 45, 7232],
  [17, 1699, 65, 1600], [186, 50448, 141, 27197], [5, 2493, 3, 2338], [27, 16886, 29, 17825]]
  .map(([tp, tn, cp, cn], i) => ({ name: i === 12 ? RCODE : `${EVIL[i % 4]} #${i + 1}`, events_t: tp, n_t: tp + tn,
    events_c: cp, n_c: cp + cn, subgroup: i < 6 ? EVIL[1] + ' A' : EVIL[0] + ' B' }));
// buttons the sweep does not press: they replace the data, open a file dialog, or leave the page
const SKIP = 'clear|reset|delete|remove|new project|sample|demo|import|upload|×|close|undo|redo|add study|theme|dark|print';

async function setup(page, path) {
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  await page.evaluate(rows => {
    window.__xss = 0;
    DEMO_DATASETS.__EVIL = { name: 'labels', dataType: 'binary', measure: 'RR', studies: rows };
    loadDemoDataset('__EVIL');
  }, BCG);
  await page.waitForTimeout(400);
  await page.evaluate(() => { AppState.settings.effectMeasure = 'RR'; window.__prev = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return { errors, dialogs };
}

const injected = page => page.evaluate(() => ({
  parsed: document.querySelectorAll('img[src="x"], svg[onload]').length,
  ran: window.__xss || 0,
}));

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name}: labels and typed text render as text on every tab and after every button`, async ({ page }) => {
    test.setTimeout(400000);
    const { errors, dialogs } = await setup(page, path);
    await page.evaluate(async ([ev, SKIP]) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      // Copy buttons: headless Chrome refuses clipboard writes; that refusal is not what this test is about
      if (navigator.clipboard) navigator.clipboard.writeText = () => Promise.resolve();
      for (const el of document.querySelectorAll('input[type="text"], input:not([type]), textarea')) {
        if (el.closest('#studyTableBody') || el.id === 'mcidInput' || /Color/.test(el.id)) continue;
        el.value = el.id === 'multiOutcomeInput'
          ? JSON.stringify([{ trial: ev + ' T1', outcomes: { [ev + ' O1']: { yi: 0.1, vi: 0.01 } } },
            { trial: ev + ' T2', outcomes: { [ev + ' O1']: { yi: 0.2, vi: 0.02 } } }])
          : ev + ' ' + (el.id || 'x');
      }
      runFullAnalysis();
      for (let i = 0; i < 300 && !(AppState.results.loo && AppState.results.loo.loo_results); i++) await wait(100);
      // the panels drawn on demand, called directly so that a hidden button cannot hide them
      runLeaveOneOutCorrected();
      runMLOutlierDetection();
      generateSearchStrategyUI();
      const res = AppState.results, tmp = document.createElement('div');
      tmp.id = '__cumFallback'; document.body.appendChild(tmp);
      const P = window.Plotly; window.Plotly = undefined;
      try { renderCumulativePlot(cumulativeByPrecision(res.studies.map(s => s.yi), res.studies.map(s => s.vi), res.studies.map(s => s.name)), '__cumFallback', 'x'); }
      finally { window.Plotly = P; }
      // then every tab, and every button on it
      const skip = new RegExp(SKIP, 'i');
      for (const t of [...new Set([...document.querySelectorAll('[data-tab]')].map(b => b.dataset.tab))]) {
        const tab = document.querySelector(`[data-tab="${t}"]`); tab.click(); await wait(250);
        const panel = document.getElementById('panel-' + t);
        if (!panel) continue;
        for (const b of [...panel.querySelectorAll('button')]) {
          const label = (b.textContent || '').trim();
          if (!label || b.offsetParent === null || skip.test(label)) continue;
          try { b.click(); } catch (e) { /* a button's own failure is not what this test is about */ }
          await wait(300);
        }
      }
      for (const t of ['bias', 'advanced', 'analysis', 'heterogeneity']) { const b = document.querySelector(`[data-tab="${t}"]`); b && b.click(); await wait(250); }
    }, [EVIL[1], SKIP]);
    await page.waitForTimeout(1000);
    expect(await injected(page), 'markup from a label or typed text was parsed into the page').toEqual({ parsed: 0, ran: 0 });
    expect(dialogs.filter(d => /onerror|<img|<svg/.test(d)), 'a label reached a dialog as markup').toEqual([]);
    // the labels are still there, as text
    const txt = await page.evaluate(() => {
      const t = id => (document.getElementById(id) || {}).textContent || '';
      return { loo: t('looResults'), out: t('outlierResults'), cum: t('__cumFallback'), search: t('searchStrategyPanel'),
        bias: t('panel-bias'), looRan: !!(AppState.results.loo && AppState.results.loo.loo_results) };
    });
    expect(txt.looRan, 'leave-one-out ran').toBe(true);
    expect(txt.loo).toContain(EVIL[0] + ' #1');
    expect(txt.out).toContain(EVIL[0] + ' #1');
    expect(txt.cum).toContain(EVIL[0] + ' #1');
    expect(txt.search).toContain(EVIL[1] + ' searchTopic');
    expect(txt.bias).toContain(EVIL[0] + ' #1');
    // Requirement: pressing every button on every tab raises no page error at all. There is no allow-list:
    // until #604 (lane aitems) four buttons called functions these pages never defined (exportToR,
    // exportPRISMASVG, computeDDMA, runLiveValidation) and their ReferenceErrors were excused here by name;
    // those buttons are now wired or removed, so any such error reappearing must fail this test.
    expect(errors, 'page errors while sweeping every button').toEqual([]);
  });

  test(`${name}: the R and Python exports carry each study label as one string literal`, async ({ page }) => {
    test.setTimeout(90000);
    const { errors } = await setup(page, path);
    // The bundle's Code tab shows generateRCode / generatePythonCode. Truthcert1's Code tab is updateCodePanel
    // (its engine's generateRCode is never called): R labels as JSON strings, no labels in the Python code.
    const bundle = /bundle/.test(path);
    const got = await page.evaluate(bundle => {
      document.querySelector('[data-tab="code"]').click();
      const r = bundle ? generateRCode(AppState.results, {}) : document.querySelector('#panel-code pre').textContent;
      return { r, py: bundle ? generatePythonCode(AppState.results) : null, names: AppState.results.studies.map(s => s.name) };
    }, bundle);
    const lit = got.names.map(s => JSON.stringify(String(s))).join(', ');
    const rLine = got.r.split('\n').find(l => /^\s*(study|names)\s*<-\s*c\(/.test(l));
    expect(rLine.replace(/\s+/g, '').replace(/^names/, 'study')).toBe(('study <- c(' + lit + ')').replace(/\s+/g, ''));
    if (bundle) {
      const pyLine = got.py.split('\n').find(l => /^\s*studies\s*=\s*\[/.test(l));
      expect(pyLine.replace(/\s+/g, '')).toBe(('studies = [' + lit + ']').replace(/\s+/g, ''));
    }
    expect(got.r).not.toContain('"' + RCODE + '"');
    expect(errors).toEqual([]);
  });
}
