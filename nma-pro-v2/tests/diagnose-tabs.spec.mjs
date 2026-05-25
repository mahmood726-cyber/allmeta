/**
 * Diagnostic spec: load the page, run analysis on a built-in dataset, then
 * iterate through every tab and report which plot containers + result divs
 * are populated vs empty. Intentionally exhaustive so we can identify which
 * panels need a fix.
 *
 * Run from F:/allmeta/tests/playwright/ via:
 *   copy ..\..\nma-pro-v2\tests\diagnose-tabs.spec.mjs .\nma-pro-v8-diagnose.spec.mjs
 *   npx playwright test nma-pro-v8-diagnose.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8080/nma-pro-v2/nma-pro-v8.0.html';

const TABS = [
  { tab: 'data',            mustHave: ['#studyTableBody'] },
  { tab: 'guardian',        mustHave: ['#healthScore'] },
  { tab: 'network',         mustHave: ['#networkPlot'] },
  { tab: 'results',         mustHave: ['#forestPlot', '#leagueTableContainer'] },
  { tab: 'ranking',         mustHave: ['#rankingTableBody', '#rankogramPlot'] },
  { tab: 'heterogeneity',   mustHave: ['#hetTau2', '#funnelPlot'] },
  { tab: 'consistency',     mustHave: ['#nodeSplitOuterContainer'] },
  { tab: 'bayesian',        mustHave: ['#bayesianContainer'] },
  { tab: 'pubbias',         mustHave: ['#pubBiasResults'] },
  { tab: 'metareg',         mustHave: ['#metaRegResults'] },
  { tab: 'cnma',            mustHave: ['#cnmaResults'] },
  { tab: 'transportability',mustHave: ['#cstreamResults'] },
  { tab: 'cinema',          mustHave: ['#cinemaMatrix'] },
  { tab: 'grade',           mustHave: ['#gradeMatrix'] },
  { tab: 'sensitivity',     mustHave: ['#evalueOuterContainer'] },
  { tab: 'cumulative',      mustHave: ['#cumulativeResults'] },
  { tab: 'doseresponse',    mustHave: ['#doseResults'] },
  { tab: 'advanced',        mustHave: ['#advancedResultsContainer'] },
  { tab: 'survival',        mustHave: ['#survDataBody'] },
  { tab: 'validation',      mustHave: ['#validationResults'] },
  { tab: 'export',          mustHave: ['#exportJsonBtn'] },
];

test('diagnose every tab — does the plot/result container exist + populate?', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('runAnalysisBtn') !== null, { timeout: 20_000 });

  // 1. Load the thrombolytics demo so the analysis has data
  await page.evaluate(() => {
    if (typeof BenchmarkDatasets?.loadDataset === 'function') {
      BenchmarkDatasets.loadDataset('thrombolytics');
    }
  });
  await page.waitForFunction(
    () => (window.AppState?.studies?.length ?? 0) > 0,
    { timeout: 10_000 }
  );

  // 2. Run main analysis (forest/league/ranking/heterogeneity/network all populate)
  await page.click('#runAnalysisBtn');
  await page.waitForFunction(
    () => window.AppState?.results != null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(500);  // let Plotly draw

  // 3. Iterate tabs and report state per panel
  const findings = [];
  for (const { tab, mustHave } of TABS) {
    await page.evaluate((t) => window.switchTab && window.switchTab(t), tab);
    await page.waitForTimeout(150);

    const state = await page.evaluate(({ tab, mustHave }) => {
      const panel = document.getElementById('panel-' + tab);
      if (!panel) return { tab, panelExists: false };

      const active = panel.classList.contains('tab-panel--active');
      const cs = window.getComputedStyle(panel);
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden';

      const containerReport = mustHave.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { sel, exists: false };
        const has = {
          svg: el.querySelectorAll('svg').length,
          canvas: el.querySelectorAll('canvas').length,
          plotly: el.querySelectorAll('.js-plotly-plot').length,
          tbody_rows: el.querySelectorAll('tbody tr').length,
          textLen: (el.textContent || '').replace(/\s+/g, ' ').trim().length,
        };
        const populated =
          has.svg > 0 || has.canvas > 0 || has.plotly > 0 ||
          has.tbody_rows > 0 || has.textLen > 40;
        return { sel, exists: true, populated, ...has };
      });

      return { tab, panelExists: true, active, visible, containerReport };
    }, { tab, mustHave });

    findings.push(state);
  }

  // Pretty-print findings to console so we can read them in the test output
  console.log('\n=== TAB DIAGNOSTIC ===');
  for (const f of findings) {
    if (!f.panelExists) {
      console.log(`  ${f.tab.padEnd(20)} PANEL MISSING`);
      continue;
    }
    const allOk = f.containerReport.every(c => c.exists && c.populated);
    const flag = allOk ? 'OK  ' : 'MISS';
    console.log(`  ${flag} ${f.tab.padEnd(20)} visible=${f.visible} active=${f.active}`);
    for (const c of f.containerReport) {
      if (!c.exists) console.log(`        - ${c.sel.padEnd(28)} MISSING from DOM`);
      else if (!c.populated)
        console.log(`        - ${c.sel.padEnd(28)} empty (svg=${c.svg} canvas=${c.canvas} plotly=${c.plotly} tbodyRows=${c.tbody_rows} text=${c.textLen})`);
    }
  }
  if (errors.length) {
    console.log('\n=== JS ERRORS DURING DIAGNOSTIC ===');
    for (const e of errors) console.log('  ' + e);
  }

  // Diagnostic is informational — don't fail. Always pass so we see the report.
  expect(true).toBe(true);
});
