/**
 * Diagnostic for nma-pro-v2 plot rendering.
 *
 * Scenario: load demo + click main #runAnalysisBtn ONCE, then iterate tabs.
 * For each tab, check whether the named plot container has a real SVG/canvas
 * or whether it's still showing "Click 'Run X'" placeholder text. This is
 * what the user actually experiences when they navigate the UI.
 */
import { test, expect } from '@playwright/test';

const URL = '/nma-pro-v2/nma-pro-v8.0.html';

const TABS = [
  { tab: 'data',            check: { kind: 'rows',  sel: '#studyTableBody' } },
  { tab: 'guardian',        check: { kind: 'stat',  sel: '#healthScore' } },
  { tab: 'network',         check: { kind: 'plot',  sel: '#networkPlot' } },
  { tab: 'results',         check: { kind: 'plot',  sel: '#forestPlot' } },
  { tab: 'ranking',         check: { kind: 'plot',  sel: '#rankogramPlot' } },
  { tab: 'heterogeneity',   check: { kind: 'plot',  sel: '#funnelPlot' } },
  { tab: 'consistency',     check: { kind: 'plot',  sel: '#consistencyPlot' } },
  { tab: 'bayesian',        check: { kind: 'text',  sel: '#bayesianContainer' } },
  { tab: 'pubbias',         check: { kind: 'text',  sel: '#pubBiasResults' } },
  { tab: 'metareg',         check: { kind: 'text',  sel: '#metaRegResults' } },
  { tab: 'cnma',            check: { kind: 'text',  sel: '#cnmaResults' } },
  { tab: 'transportability',check: { kind: 'text',  sel: '#cstreamResults' } },
  { tab: 'cinema',          check: { kind: 'text',  sel: '#cinemaMatrix' } },
  { tab: 'grade',           check: { kind: 'text',  sel: '#gradeMatrix' } },
  { tab: 'sensitivity',     check: { kind: 'text',  sel: '#evalueOuterContainer' } },
  { tab: 'cumulative',      check: { kind: 'text',  sel: '#cumulativeResults' } },
  { tab: 'doseresponse',    check: { kind: 'text',  sel: '#doseResults' } },
  { tab: 'advanced',        check: { kind: 'text',  sel: '#advancedResultsContainer' } },
  { tab: 'survival',        check: { kind: 'rows',  sel: '#survDataBody' } },
  { tab: 'validation',      check: { kind: 'text',  sel: '#validationResults' } },
];

test('after one click of Run Analysis: which tabs render vs show placeholders', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('runAnalysisBtn') !== null, { timeout: 20_000 });

  await page.evaluate(() => {
    if (typeof BenchmarkDatasets?.loadDataset === 'function') BenchmarkDatasets.loadDataset('thrombolytics');
  });
  await page.waitForFunction(() => (window.AppState?.studies?.length ?? 0) > 0, { timeout: 10_000 });

  await page.click('#runAnalysisBtn');
  await page.waitForFunction(() => window.AppState?.results != null, { timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const findings = [];
  for (const { tab, check } of TABS) {
    await page.evaluate((t) => window.switchTab && window.switchTab(t), tab);
    await page.waitForTimeout(150);
    const state = await page.evaluate(({ tab, check }) => {
      const panel = document.getElementById('panel-' + tab);
      if (!panel) return { tab, missing: true };
      const el = document.querySelector(check.sel);
      if (!el) return { tab, found: false };
      const svg = el.querySelectorAll('svg').length;
      const canvas = el.querySelectorAll('canvas').length;
      const plotly = el.querySelectorAll('.js-plotly-plot, .main-svg').length;
      const tbody_rows = el.querySelectorAll('tbody tr, tr').length;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      let ok = false;
      if (check.kind === 'plot') ok = plotly > 0 || svg > 0 || canvas > 0;
      else if (check.kind === 'rows') ok = tbody_rows > 0;
      else if (check.kind === 'stat') ok = txt.length > 0 && txt !== '--';
      else if (check.kind === 'text') ok = txt.length > 80;
      return { tab, found: true, kind: check.kind, svg, canvas, plotly, tbody_rows, txt: txt.slice(0, 120), ok };
    }, { tab, check });
    findings.push(state);
  }

  console.log('\n=== TAB POST-RUN-ANALYSIS STATE ===');
  let missAfter = 0;
  for (const f of findings) {
    if (f.missing) { console.log(`  ${f.tab.padEnd(20)} PANEL MISSING`); missAfter++; continue; }
    if (!f.found) { console.log(`  ${f.tab.padEnd(20)} TARGET ELEM MISSING`); missAfter++; continue; }
    const flag = f.ok ? 'OK   ' : 'EMPTY';
    if (!f.ok) missAfter++;
    console.log(`  ${flag} ${f.tab.padEnd(20)} [${f.kind}] svg=${f.svg} canvas=${f.canvas} plotly=${f.plotly} rows=${f.tbody_rows} txt="${f.txt.slice(0,60)}"`);
  }
  console.log(`\nTotal tabs without rendered content: ${missAfter}/${findings.length}`);
  if (errors.length) {
    console.log('\n=== JS ERRORS ===');
    for (const e of errors) console.log('  ' + e);
  }
  expect(true).toBe(true);
});
