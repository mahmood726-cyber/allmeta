/**
 * p-curve retrofit sanity spec — Cycle 2.5 Task 2 do-no-harm gate.
 *
 * Mirror of p-curve/tests/sanity.spec.mjs — kept here so
 * playwright.config.mjs (testDir: '.') picks it up alongside the other
 * shared-test specs and reuses the port-8088 webserver.
 *
 * To regenerate this file:
 *   copy C:\Projects\allmeta\p-curve\tests\sanity.spec.mjs .\p-curve-sanity.spec.mjs
 */
import { test, expect } from '@playwright/test';

const PCURVE_URL = 'http://localhost:8088/p-curve/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 */
async function waitForAlm(page) {
  await page.waitForFunction(() =>
    window.alm &&
    typeof window.alm.csvUpload     === 'function' &&
    typeof window.alm.axisControls  === 'function' &&
    typeof window.alm.resultsExport === 'function' &&
    typeof window.alm.urlState      === 'function' &&
    typeof window.alm.resetUndo     === 'function' &&
    typeof window.alm.tooltips      === 'function',
    { timeout: 10_000 }
  );
}

/** Wait until the p-curve histogram SVG has rendered bars */
async function waitForPlot(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('plot');
    return svg && svg.querySelectorAll('rect').length > 0;
  }, { timeout: 10_000 });
}

test.describe('p-curve retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes("frame-ancestors") && text.includes("Content Security Policy")) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(PCURVE_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(PCURVE_URL);
    await waitForAlm(page);
    const present = await page.evaluate(() => ({
      csvUpload:     typeof window.alm.csvUpload,
      axisControls:  typeof window.alm.axisControls,
      resultsExport: typeof window.alm.resultsExport,
      urlState:      typeof window.alm.urlState,
      resetUndo:     typeof window.alm.resetUndo,
      tooltips:      typeof window.alm.tooltips,
    }));
    expect(present.csvUpload,     'alm.csvUpload not a function')     .toBe('function');
    expect(present.axisControls,  'alm.axisControls not a function')  .toBe('function');
    expect(present.resultsExport, 'alm.resultsExport not a function') .toBe('function');
    expect(present.urlState,      'alm.urlState not a function')      .toBe('function');
    expect(present.resetUndo,     'alm.resetUndo not a function')     .toBe('function');
    expect(present.tooltips,      'alm.tooltips not a function')      .toBe('function');
  });

  // T3 — key mount points are initialised
  test('all 3 visible mount points have been initialised', async ({ page }) => {
    await page.goto(PCURVE_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  // T4 — existing p-curve histogram SVG still renders bars
  test('p-curve histogram SVG renders rect bars for default data', async ({ page }) => {
    await page.goto(PCURVE_URL);
    await waitForPlot(page);
    const rectCount = await page.locator('#plot rect').count();
    expect(rectCount, 'Expected at least one rect in #plot').toBeGreaterThan(0);
  });

  // T5 — results-export JSON download contains real p-curve output
  test('results-export JSON download contains real p-curve diagnostics', async ({ page }) => {
    await page.goto(PCURVE_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    await page.waitForFunction(() =>
      window._almLastPcurve && window._almLastPcurve() !== null,
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

    expect(obj._schema,       'Missing or wrong _schema field').toBe('pcurve-results-v1');
    expect(obj.k,             'k should be > 0').toBeGreaterThan(0);
    expect(obj.fisher_chisq,  'fisher_chisq missing').toBeDefined();
    expect(obj.fisher_p,      'fisher_p missing').toBeDefined();
    expect(obj.delta_puniform,'delta_puniform missing').toBeDefined();
    expect(typeof obj.fisher_chisq, 'fisher_chisq should be number').toBe('number');
    expect(obj.fisher_chisq,  'fisher_chisq should be positive').toBeGreaterThan(0);
  });

});
