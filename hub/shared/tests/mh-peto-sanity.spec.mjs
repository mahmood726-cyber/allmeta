/**
 * mh-peto retrofit sanity spec — Cycle 2.6 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (mirror copied to mh-peto-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\mh-peto\tests\sanity.spec.mjs .\mh-peto-sanity.spec.mjs
 *   npx playwright test mh-peto-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const MHPETO_URL = 'http://localhost:8088/mh-peto/';

/**
 * Wait until all 7 alm modules have registered on window.alm
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

/** Wait until the forest SVG has been rendered with content */
async function waitForForest(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('forest');
    return svg && svg.innerHTML.trim().length > 0;
  }, { timeout: 10_000 });
}

test.describe('mh-peto retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign browser informational messages:
        //   - CSP frame-ancestors in <meta>: browser info, not a JS error
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    await waitForForest(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(MHPETO_URL);
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
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    // csv-upload widget
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    // results-export widget
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    // reset-undo widget
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    // chart-download widget
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — forest SVG renders with content for default data
  test('forest SVG renders with content for default data', async ({ page }) => {
    await page.goto(MHPETO_URL);
    await waitForForest(page);
    // SVG should have polygon elements (pooled diamonds)
    const polyCount = await page.locator('#forest polygon').count();
    expect(polyCount, 'Expected at least one polygon in #forest (pooled diamond)').toBeGreaterThan(0);
    // SVG should have line elements (study CI whiskers)
    const lineCount = await page.locator('#forest line').count();
    expect(lineCount, 'Expected at least one line in #forest (CI or null line)').toBeGreaterThan(0);
  });

  // T5 — results-export JSON download contains real pooled values
  test('results-export JSON download contains real mh/peto pooled values', async ({ page }) => {
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    await waitForForest(page);
    await page.waitForFunction(() =>
      window._almLastMhPeto && window._almLastMhPeto() !== null,
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

    // Must have the results schema marker
    expect(obj._schema, 'Missing _schema field').toBe('mhpeto-results-v1');
    // Must have at least one study
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain pooled MH estimate
    expect(obj.mh_est, 'mh_est missing — MH pooled estimate not computed').toBeDefined();
    expect(obj.mh_lo,  'mh_lo missing').toBeDefined();
    expect(obj.mh_hi,  'mh_hi missing').toBeDefined();
    // For OR measure: Peto results should also be present
    expect(obj.peto_est, 'peto_est missing — Peto OR not computed for OR measure').toBeDefined();
  });

});
