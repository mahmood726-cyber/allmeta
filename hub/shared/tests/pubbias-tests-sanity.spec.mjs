/**
 * pubbias-tests retrofit sanity spec — Cycle 2.8 Task 3 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\pubbias-tests\tests\sanity.spec.mjs .\pubbias-tests-sanity.spec.mjs
 *   npx playwright test pubbias-tests-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in Cycle 2.8 Task 3:
 *   csv-upload, chart-download, axis-controls, results-export,
 *   url-state, reset-undo, tooltips (7 total).
 *
 * pubbias-tests specific notes:
 *   - Default format: te-se (10 studies in textarea)
 *   - Funnel SVG renders into #funnel (inline SVG)
 *   - Results table populates #body with test rows
 *   - T5 checks pubbias-tests-results-v1 schema with egger_z / begg_tau / tf_k0 keys
 *   - waitForAlm includes all 7 modules
 */
import { test, expect } from '@playwright/test';

const PUBBIAS_URL = 'http://localhost:8088/pubbias-tests/';

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

/** Wait until the funnel SVG has been rendered into #funnel */
async function waitForFunnel(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('funnel');
    return svg && svg.children.length > 0;
  }, { timeout: 10_000 });
}

/** Wait until the results #body has at least one row */
async function waitForResults(page) {
  await page.waitForFunction(() => {
    const body = document.getElementById('body');
    return body && body.children.length > 0;
  }, { timeout: 10_000 });
}

test.describe('pubbias-tests retrofit sanity', () => {

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
    await page.goto(PUBBIAS_URL);
    await waitForAlm(page);
    await waitForFunnel(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(PUBBIAS_URL);
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

  // T3 — all 4 mount points have been initialised
  test('all 4 mount points have been initialised', async ({ page }) => {
    await page.goto(PUBBIAS_URL);
    await waitForAlm(page);
    // csv-upload widget
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    // chart-download widget
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
    // results-export widget
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    // reset-undo widget
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  // T4 — funnel SVG and results table populate on default data
  test('funnel SVG renders with circles and results table is populated', async ({ page }) => {
    await page.goto(PUBBIAS_URL);
    await waitForFunnel(page);
    await waitForResults(page);
    // Funnel has circles (study dots)
    const circleCount = await page.locator('#funnel circle').count();
    expect(circleCount, 'Expected study circles in #funnel').toBeGreaterThan(0);
    // Funnel has lines (axes / regression line)
    const lineCount = await page.locator('#funnel line').count();
    expect(lineCount, 'Expected axis lines in #funnel').toBeGreaterThan(0);
    // Results table has rows
    const rowCount = await page.locator('#body tr').count();
    expect(rowCount, 'Expected test rows in #body').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains pubbias-tests-results-v1 schema
  test('results-export JSON contains pubbias-tests-results-v1 schema', async ({ page }) => {
    await page.goto(PUBBIAS_URL);
    await waitForAlm(page);
    await waitForFunnel(page);
    await waitForResults(page);
    // Give the engine one extra tick to propagate _almLastPubbias
    await page.waitForFunction(() =>
      window._almLastPubbias && window._almLastPubbias() !== null,
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

    // Schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('pubbias-tests-results-v1');
    // Study count
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Egger fields
    expect(obj.egger_z,    'egger_z missing').toBeDefined();
    expect(obj.egger_p,    'egger_p missing').toBeDefined();
    expect(obj.egger_b0,   'egger_b0 missing').toBeDefined();
    // Begg fields
    expect(obj.begg_tau,   'begg_tau missing').toBeDefined();
    expect(obj.begg_p,     'begg_p missing').toBeDefined();
    // Trim-and-fill fields
    expect(obj.tf_k0,      'tf_k0 missing').toBeDefined();
    expect(obj.tf_est,     'tf_est missing').toBeDefined();
    // Sanity: egger_p in [0, 1]
    expect(obj.egger_p, 'egger_p should be in [0, 1]').toBeGreaterThanOrEqual(0);
    expect(obj.egger_p, 'egger_p should be in [0, 1]').toBeLessThanOrEqual(1);
  });

});
