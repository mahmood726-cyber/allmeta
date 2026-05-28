/**
 * Regression spec for the "plots don't display under a lot of tabs" + "really
 * slow" fixes in nma-pro-v8.0.html.
 *
 * Verifies that after running an analysis, every plot-bearing tab shows a
 * Plotly chart with real (non-zero) rendered dimensions once the tab is made
 * visible — i.e. resizePlotsInActivePanel + deferred rendering produce a
 * correctly sized chart, not a 0x0 blank. Also asserts no console/page errors.
 *
 * Run: npx playwright test nma-pro-v8-plot-size.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8080/nma-pro-v2/nma-pro-v8.0.html';

// Each plot-bearing tab and the Plotly graph div that must render with size.
const PLOT_TABS = [
  { tab: 'network',       plot: '#networkPlot' },
  { tab: 'results',       plot: '#forestPlot' },
  { tab: 'ranking',       plot: '#rankogramPlot' },
  { tab: 'heterogeneity', plot: '#funnelPlot' },
  { tab: 'consistency',   plot: '#consistencyPlot' },
];

test('every plot tab renders a non-zero-size Plotly chart after analysis', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('runAnalysisBtn') !== null, { timeout: 20_000 });

  await page.evaluate(() => BenchmarkDatasets?.loadDataset?.('thrombolytics'));
  await page.waitForFunction(() => (window.AppState?.studies?.length ?? 0) > 0, { timeout: 10_000 });

  const t0 = Date.now();
  await page.click('#runAnalysisBtn');
  // runAnalysis sets AppState.results early but keeps running for several more
  // seconds and ends by hiding the overlay + switchTab('results'). Wait for the
  // overlay to be hidden so the app won't yank the active tab out from under us.
  await page.waitForFunction(() => window.AppState?.results != null, { timeout: 30_000 });
  await page.waitForFunction(
    () => document.getElementById('loadingOverlay')?.getAttribute('aria-hidden') === 'true',
    { timeout: 45_000 }
  );
  const runMs = Date.now() - t0;

  for (const { tab, plot } of PLOT_TABS) {
    await page.evaluate((t) => window.switchTab(t), tab);
    // Wait for the deferred render + resize to give the chart real dimensions.
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const svg = el.querySelector('svg.main-svg');
      const sr = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
      return r.width > 50 && r.height > 50 && sr.width > 50 && sr.height > 50;
    }, plot, { timeout: 8_000 }).catch(() => {});

    const size = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el ? el.getBoundingClientRect() : null;
      const svg = el ? el.querySelector('svg.main-svg') : null;
      const sr = svg ? svg.getBoundingClientRect() : null;
      return {
        plotW: r ? Math.round(r.width) : 0, plotH: r ? Math.round(r.height) : 0,
        svgW: sr ? Math.round(sr.width) : 0, svgH: sr ? Math.round(sr.height) : 0,
        isPlotly: !!(el && el.classList.contains('js-plotly-plot')),
      };
    }, plot);

    console.log(`  ${tab.padEnd(14)} ${plot.padEnd(16)} plot=${size.plotW}x${size.plotH} svg=${size.svgW}x${size.svgH} plotly=${size.isPlotly}`);

    expect(size.isPlotly, `${plot} should be a Plotly chart`).toBe(true);
    expect(size.svgW, `${plot} svg width should be non-zero in tab "${tab}"`).toBeGreaterThan(50);
    expect(size.svgH, `${plot} svg height should be non-zero in tab "${tab}"`).toBeGreaterThan(50);
  }

  console.log(`\n  runAnalysis -> results available in ${runMs} ms`);
  expect(errors, 'no console/page errors:\n' + errors.join('\n')).toEqual([]);
});
