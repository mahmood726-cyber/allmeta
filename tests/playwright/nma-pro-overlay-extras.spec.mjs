import { test, expect } from '@playwright/test';
// runAnalysis started runAutoExtras() (pub bias, cumulative) without awaiting it; _autoRunSilent replaces the global
// showLoading / hideLoading with no-ops while each extra runs, so when the extras were still running 300 ms after
// "Complete!", runAnalysis's own hideLoading() was the no-op and the overlay stayed up for good. Slow the extras
// down (as a loaded machine does) and require the overlay to go away, and a tab switch right after it to work (the
// swapped switchTab must not outlive the overlay).
const APP = process.env.APP || '/nma-pro-v2/nma-pro-v8.0.html';
test('overlay is hidden even when the auto extras outlast the 300 ms "Complete!" pause', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof Plotly !== 'undefined' && !!window.AppState);
  await page.evaluate(() => {
    BenchmarkDatasets.loadDataset('painkillers');
    const slow = fn => async function () { await new Promise(r => setTimeout(r, 1500)); return fn.apply(this, arguments); };
    window.runPubBias = slow(window.runPubBias);
  });
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => !!AppState.autoRobustnessResults, null, { timeout: 60_000 });
  await expect(page.locator('#loadingOverlay')).toHaveAttribute('aria-hidden', 'true', { timeout: 10_000 });
  await page.evaluate(() => switchTab('network'));
  await expect(page.locator('#panel-network')).toHaveClass(/tab-panel--active/);
  // and the extras still ran
  await page.waitForFunction(() => document.body.innerText.includes('Cumulative analysis complete') || !!AppState.cumulativeResults, null, { timeout: 30_000 });
  // the loading helpers are the real ones again afterwards
  expect(await page.evaluate(() => { showLoading('x', 1); const a = document.getElementById('loadingOverlay').getAttribute('aria-hidden'); hideLoading(); return a; })).toBe('false');
});
