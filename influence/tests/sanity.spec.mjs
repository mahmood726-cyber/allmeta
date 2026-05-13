/**
 * influence retrofit sanity spec — Cycle 2.5 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (mirror kept at hub/shared/tests/influence-sanity.spec.mjs
 * so playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\influence\tests\sanity.spec.mjs .\influence-sanity.spec.mjs
 *   npx playwright test influence-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const INF_URL = 'http://localhost:8088/influence/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 * Influence wires: csvUpload, axisControls, resultsExport, urlState,
 * resetUndo, tooltips.
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

/** Wait until the LOO SVG has rendered (at least one rect = study square) */
async function waitForSvg(page) {
  await page.waitForSelector('#loo-plot rect', { timeout: 10_000 });
}

test.describe('influence retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign CSP frame-ancestors informational message
        if (text.includes("frame-ancestors") && text.includes("Content Security Policy")) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(INF_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(INF_URL);
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

  // T3 — all 4 mount points initialise (tooltips + url-state have no mount divs)
  test('all 4 mount points have been initialised', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForAlm(page);
    // csv-upload widget
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    // axis-controls widget
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    // results-export widget
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    // reset-undo widget
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  // T4 — pre-retrofit feature: LOO plot SVG still renders (do-no-harm gate)
  test('existing LOO plot SVG still renders with study squares', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForSvg(page);
    // rect elements are the study-square markers in the LOO forest plot
    const rectCount = await page.locator('#loo-plot rect').count();
    expect(rectCount, 'Expected at least one rect in #loo-plot — plot may be empty').toBeGreaterThan(0);
    // Cook's D x Hat influence-plot circles
    const circleCount = await page.locator('#influence-plot circle').count();
    expect(circleCount, 'Expected at least one circle in #influence-plot').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real pooled values (not just form state)
  test('results-export JSON download contains real influence diagnostics', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    // Give the engine one tick to propagate _almLastInfluence via the initial run()
    await page.waitForFunction(() =>
      window._almLastInfluence && window._almLastInfluence() !== null,
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

    // Must have the influence results schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('influence-results-v1');
    // Must have at least one study
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain pooled diagnostics (proves getResults() ran the engine)
    expect(obj.pooled_mu,   'pooled_mu missing — engine not computed').toBeDefined();
    expect(obj.tau2,        'tau2 missing').toBeDefined();
    expect(obj.Q,           'Q missing').toBeDefined();
    expect(obj.loo_estimates, 'loo_estimates missing').toBeDefined();
    expect(Array.isArray(obj.loo_estimates), 'loo_estimates should be array').toBe(true);
    expect(obj.loo_estimates.length, 'loo_estimates should have at least 1 entry').toBeGreaterThan(0);
  });

});
