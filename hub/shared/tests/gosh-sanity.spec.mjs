/**
 * gosh retrofit sanity spec — Cycle 2.8 Task 2 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\gosh\tests\sanity.spec.mjs .\gosh-sanity.spec.mjs
 *   npx playwright test gosh-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, chart-download, axis-controls,
 * results-export, url-state, reset-undo, tooltips (7 total).
 *
 * gosh-specific notes:
 *   - Default data: 9 studies → full enumeration (k <= 15), subsets of size >= 2
 *   - GOSH scatter renders as circles in #plot SVG (one per subset)
 *   - T4 checks that the SVG has circle elements (subset data points)
 *   - T5 checks gosh-results-v1 schema with n_subsets, median_est, etc.
 *   - Engine: FE (default) or DL RE for each subset
 *   - R-parity: full enumeration (k=5) verified vs metafor::gosh(rma.uni(...))
 */
import { test, expect } from '@playwright/test';

const GOSH_URL = 'http://localhost:8088/gosh/';

/**
 * Wait until all 7 alm modules have registered on window.alm.
 */
async function waitForAlm(page) {
  await page.waitForFunction(() =>
    window.alm &&
    typeof window.alm.csvUpload      === 'function' &&
    typeof window.alm.chartDownload  === 'function' &&
    typeof window.alm.axisControls   === 'function' &&
    typeof window.alm.resultsExport  === 'function' &&
    typeof window.alm.urlState       === 'function' &&
    typeof window.alm.resetUndo      === 'function' &&
    typeof window.alm.tooltips       === 'function',
    { timeout: 10_000 }
  );
}

/** Wait until the GOSH SVG has been rendered into #plot with at least one circle */
async function waitForGoshPlot(page) {
  await page.waitForFunction(() => {
    const plot = document.getElementById('plot');
    return plot && plot.querySelector('circle') !== null;
  }, { timeout: 10_000 });
}

/** Wait until the summary metrics have been populated */
async function waitForMetrics(page) {
  await page.waitForFunction(() => {
    const mn = document.getElementById('m-n');
    return mn && mn.textContent.trim() !== '0' && mn.textContent.trim() !== '—';
  }, { timeout: 10_000 });
}

test.describe('gosh retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign CSP frame-ancestors informational messages
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(GOSH_URL);
    await waitForAlm(page);
    await waitForGoshPlot(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(GOSH_URL);
    await waitForAlm(page);
    const present = await page.evaluate(() => ({
      csvUpload:     typeof window.alm.csvUpload,
      chartDownload: typeof window.alm.chartDownload,
      axisControls:  typeof window.alm.axisControls,
      resultsExport: typeof window.alm.resultsExport,
      urlState:      typeof window.alm.urlState,
      resetUndo:     typeof window.alm.resetUndo,
      tooltips:      typeof window.alm.tooltips,
    }));
    expect(present.csvUpload,     'alm.csvUpload not a function')     .toBe('function');
    expect(present.chartDownload, 'alm.chartDownload not a function') .toBe('function');
    expect(present.axisControls,  'alm.axisControls not a function')  .toBe('function');
    expect(present.resultsExport, 'alm.resultsExport not a function') .toBe('function');
    expect(present.urlState,      'alm.urlState not a function')      .toBe('function');
    expect(present.resetUndo,     'alm.resetUndo not a function')     .toBe('function');
    expect(present.tooltips,      'alm.tooltips not a function')      .toBe('function');
  });

  // T3 — mount points are initialised
  test('key mount points have been initialised', async ({ page }) => {
    await page.goto(GOSH_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — GOSH scatter SVG renders with data-point circles for default data (9 studies)
  test('GOSH scatter SVG renders with circles in #plot', async ({ page }) => {
    await page.goto(GOSH_URL);
    await waitForGoshPlot(page);
    const circleCount = await page.locator('#plot circle').count();
    // k=9 default data → up to 2^9-1 - 9 = 502 subsets of size >= 2
    // actual count: sum(C(9,r) for r in 2..9) = 502
    expect(circleCount, 'Expected many circles in #plot (one per subset)')
      .toBeGreaterThanOrEqual(50);
    // Axis lines should be present
    const lineCount = await page.locator('#plot line').count();
    expect(lineCount, 'Expected axis/grid lines in #plot')
      .toBeGreaterThanOrEqual(2);
  });

  // T5 — results-export JSON contains gosh-results-v1 schema
  test('results-export JSON contains gosh-results-v1 schema', async ({ page }) => {
    await page.goto(GOSH_URL);
    await waitForAlm(page);
    await waitForMetrics(page);
    await page.waitForFunction(() =>
      window._almLastGosh && window._almLastGosh() !== null,
      { timeout: 5_000 }
    );

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="json"]').click(),
    ]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf-8');
    const obj = JSON.parse(text);

    expect(obj._schema, 'Missing or wrong _schema').toBe('gosh-results-v1');
    expect(obj.k,        'k (study count) missing').toBeGreaterThan(0);
    expect(obj.n_subsets,'n_subsets missing').toBeGreaterThan(0);
    expect(obj.median_est, 'median_est missing').toBeDefined();
    expect(typeof obj.median_est, 'median_est should be number').toBe('number');
    expect(obj.min_est, 'min_est missing').toBeDefined();
    expect(obj.max_est, 'max_est missing').toBeDefined();
    // min <= median <= max
    expect(obj.min_est, 'min_est should be <= median_est')
      .toBeLessThanOrEqual(obj.median_est + 1e-9);
    expect(obj.median_est, 'median_est should be <= max_est')
      .toBeLessThanOrEqual(obj.max_est + 1e-9);
    expect(obj.median_i2, 'median_i2 missing').toBeDefined();
    expect(obj.median_i2, 'median_i2 should be in [0, 100]')
      .toBeGreaterThanOrEqual(0);
    expect(obj.median_i2, 'median_i2 should be <= 100')
      .toBeLessThanOrEqual(100 + 1e-9);
  });

  // T6 — summary metric cards are populated after computation
  test('summary cards show subset count and median estimate', async ({ page }) => {
    await page.goto(GOSH_URL);
    await waitForMetrics(page);
    const nText = await page.locator('#m-n').textContent();
    const estText = await page.locator('#m-est').textContent();
    const i2Text  = await page.locator('#m-i2').textContent();
    // n should be a positive number (formatted with locale separators)
    expect(parseInt(nText.replace(/,/g, ''), 10), 'Subset count should be > 0')
      .toBeGreaterThan(0);
    // Median estimate should be a number (not '—')
    expect(estText.trim(), 'Median estimate should not be placeholder').not.toBe('—');
    // Median I² should end with %
    expect(i2Text.trim(), 'Median I² should include %').toContain('%');
  });

});
