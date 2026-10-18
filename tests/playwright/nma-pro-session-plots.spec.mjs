import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const APP = '/nma-pro-v2/nma-pro-v8.0.html';
const CHARTS = [
  ['network', ['networkPlot']],
  ['results', ['forestPlot', 'caterpillarPlotContainer', 'comparisonHeatmapPlot']],
  ['ranking', ['rankogramPlot', 'sucraCurvePlot', 'classicRankogramPlot']],
  ['heterogeneity', ['funnelPlot']],
];

async function expectCharts(page) {
  for (const [tab, ids] of CHARTS) {
    await page.evaluate(t => switchTab(t), tab);
    for (const id of ids) {
      const chart = page.locator(`#${id}`);
      await expect(chart).toBeVisible();
      await expect(chart.locator('svg.main-svg').first()).toBeVisible();
      await expect.poll(() => chart.evaluate(el => el.data?.length || 0)).toBeGreaterThan(0);
      await expect.poll(() => chart.evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && el._fullLayout?.width > 0;
      })).toBe(true);
    }
  }
}

async function runExample(page, dataset) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#runAnalysisBtn')).toBeVisible();
  await page.waitForFunction(() => typeof Plotly !== 'undefined' && !!window.AppState);
  await page.evaluate(name => BenchmarkDatasets.loadDataset(name), dataset);
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => !!AppState.results);
  await expect(page.locator('#loadingOverlay')).toHaveAttribute('aria-hidden', 'true');
  await expectCharts(page);
}

for (const width of [1280, 390]) {
  test.describe(`NMA Pro plots at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const dataset of ['thrombolytics', 'painkillers']) {
      test(`save and reopen ${dataset}: restore all plots without refitting`, async ({ page }, testInfo) => {
        test.setTimeout(60_000);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await runExample(page, dataset);

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#saveSessionBtn').click();
        const download = await downloadPromise;
        const sessionPath = await download.path();
        const saved = JSON.parse(await readFile(sessionPath, 'utf8'));

        // A fresh document is essential: old SVGs can hide a missing redraw.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#loadSessionBtn')).toBeVisible();
        await page.evaluate(() => {
          window.__restoreRefits = 0;
          const analyze = FrequentistNMA.analyze;
          FrequentistNMA.analyze = function (...args) {
            window.__restoreRefits++;
            return analyze.apply(this, args);
          };
        });
        const chooserPromise = page.waitForEvent('filechooser');
        await page.locator('#loadSessionBtn').click();
        const chooser = await chooserPromise;
        await chooser.setFiles(sessionPath);
        await page.waitForFunction(() => !!AppState.results && !!AppState.ranking);
        await expectCharts(page);

        expect(await page.evaluate(() => window.__restoreRefits)).toBe(0);
        expect(await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)))).toEqual(saved.results);
        expect(await page.evaluate(() => JSON.parse(JSON.stringify(AppState.ranking)))).toEqual(saved.ranking);
        expect(errors).toEqual([]);
        await page.evaluate(() => switchTab('ranking'));
        await testInfo.attach('restored-ranking', { body: await page.screenshot(), contentType: 'image/png' });
      });
    }

    test('refresh repaints emptied caterpillar and ranking charts', async ({ page }) => {
      await runExample(page, 'thrombolytics');
      const before = await page.evaluate(() => JSON.stringify({ results: AppState.results, ranking: AppState.ranking }));
      await page.evaluate(() => {
        for (const id of ['caterpillarPlotContainer', 'sucraCurvePlot', 'classicRankogramPlot']) {
          Plotly.purge(document.getElementById(id));
        }
        refreshAllPlots();
      });
      await expectCharts(page);
      expect(await page.evaluate(() => JSON.stringify({ results: AppState.results, ranking: AppState.ranking }))).toBe(before);
    });
  });
}
