/**
 * hsroc retrofit sanity spec — Cycle 2.7 Task 3 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\hsroc\tests\sanity.spec.mjs .\hsroc-sanity.spec.mjs
 *   npx playwright test hsroc-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, chart-download, axis-controls,
 * results-export, url-state, reset-undo, tooltips (7 total).
 *
 * HSROC-specific notes:
 *   - The SROC chart renders inside #sroc-host (an SVG via drawSROC())
 *   - T4 checks that the SVG still renders inside #sroc-host after retrofit
 *   - T5 checks hsroc-results-v1 schema with mu_se, mu_fpr, rho fields
 *   - tooltips uses src: '../hub/shared/glossary.json'
 *   - Parameterisation: logit(FPR) — matches mada::reitsma
 */
import { test, expect } from '@playwright/test';

const HSROC_URL = 'http://localhost:8088/hsroc/';

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

/** Wait until the SROC SVG has been rendered into #sroc-host */
async function waitForSvg(page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('sroc-host');
    return host && host.querySelector('svg') !== null;
  }, { timeout: 10_000 });
}

test.describe('hsroc retrofit sanity', () => {

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
    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(HSROC_URL);
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

  // T3 — all 5 mount points initialise (tooltips + url-state have no mount divs)
  // CSS class per module: csv-upload → .alm-csv, axis-controls → .alm-axis,
  //   results-export → .alm-export, reset-undo → .alm-undo, chart-download → .alm-dl
  test('all 5 mount points have been initialised', async ({ page }) => {
    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — SROC SVG renders inside #sroc-host
  test('SROC SVG renders in #sroc-host after retrofit', async ({ page }) => {
    await page.goto(HSROC_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#sroc-host svg').count();
    expect(svgCount, 'Expected SVG inside #sroc-host').toBeGreaterThan(0);
    // Verify HSROC curve polyline is present
    const polylineCount = await page.locator('#sroc-host polyline').count();
    expect(polylineCount, 'Expected HSROC curve polyline in SVG').toBeGreaterThan(0);
  });

  // T5 — results-export JSON has hsroc-results-v1 schema and bivariate fields
  test('results-export JSON contains hsroc-results-v1 schema with bivariate stats', async ({ page }) => {
    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await waitForSvg(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="json"]').click(),
    ]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf-8');
    const obj = JSON.parse(text);

    expect(obj._schema, 'Missing or wrong _schema').toBe('hsroc-results-v1');
    expect(obj.k,       'k field missing').toBeGreaterThan(0);
    expect(obj.mu_se,   'mu_se (mean logit Se) missing').not.toBeNull();
    expect(obj.mu_fpr,  'mu_fpr (mean logit FPR) missing').not.toBeNull();
    expect(obj.rho,     'rho (correlation) missing').not.toBeNull();
    expect(obj.rows,    'rows array missing').toBeDefined();
    expect(Array.isArray(obj.rows), 'rows should be array').toBe(true);
    expect(obj.rows.length, 'Expected at least one study row').toBeGreaterThan(0);
    // Each row should have DTA counts and derived Se/Sp/FPR
    const row0 = obj.rows[0];
    expect(row0.TP,  'row.TP missing').toBeDefined();
    expect(row0.Se,  'row.Se missing').toBeDefined();
    expect(row0.FPR, 'row.FPR missing').toBeDefined();
  });

});
