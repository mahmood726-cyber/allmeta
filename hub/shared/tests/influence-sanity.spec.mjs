/**
 * influence retrofit sanity spec — Cycle 2.5 Task 1 do-no-harm gate.
 *
 * Mirror of influence/tests/sanity.spec.mjs — kept here so
 * playwright.config.mjs (testDir: '.') picks it up alongside the other
 * shared-test specs and reuses the port-8088 webserver.
 *
 * To regenerate this file:
 *   copy C:\Projects\allmeta\influence\tests\sanity.spec.mjs .\influence-sanity.spec.mjs
 */
import { test, expect } from '@playwright/test';

const INF_URL = 'http://localhost:8088/influence/';

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

async function waitForSvg(page) {
  await page.waitForSelector('#loo-plot rect', { timeout: 10_000 });
}

test.describe('influence retrofit sanity', () => {

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
    await page.goto(INF_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

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

  test('all 4 mount points have been initialised', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  test('existing LOO plot SVG still renders with study squares', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForSvg(page);
    const rectCount = await page.locator('#loo-plot rect').count();
    expect(rectCount, 'Expected at least one rect in #loo-plot').toBeGreaterThan(0);
    const circleCount = await page.locator('#influence-plot circle').count();
    expect(circleCount, 'Expected at least one circle in #influence-plot').toBeGreaterThan(0);
  });

  test('results-export JSON download contains real influence diagnostics', async ({ page }) => {
    await page.goto(INF_URL);
    await waitForAlm(page);
    await waitForSvg(page);
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

    expect(obj._schema, 'Missing or wrong _schema field').toBe('influence-results-v1');
    expect(obj.k, 'k should be > 0').toBeGreaterThan(0);
    expect(obj.pooled_mu,     'pooled_mu missing').toBeDefined();
    expect(obj.tau2,          'tau2 missing').toBeDefined();
    expect(obj.Q,             'Q missing').toBeDefined();
    expect(obj.loo_estimates, 'loo_estimates missing').toBeDefined();
    expect(Array.isArray(obj.loo_estimates), 'loo_estimates should be array').toBe(true);
    expect(obj.loo_estimates.length, 'loo_estimates should have entries').toBeGreaterThan(0);
  });

});
