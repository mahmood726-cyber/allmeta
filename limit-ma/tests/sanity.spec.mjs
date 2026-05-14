/**
 * limit-ma retrofit sanity spec — Cycle 2.8 Task 4 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\limit-ma\tests\sanity.spec.mjs .\limit-ma-sanity.spec.mjs
 *   npx playwright test limit-ma-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in Cycle 2.8 Task 4:
 *   csv-upload, chart-download, axis-controls, results-export,
 *   url-state, reset-undo, tooltips (7 total).
 *
 * limit-ma specific notes:
 *   - Input: effect, SE, label (optional) — one per line in #src textarea
 *   - Funnel SVG renders into #plot (inline SVG)
 *   - Results table populates #body with 3 rows (FE, RE, Limit)
 *   - Export key: limit_est (the Rücker limit estimate)
 */
import { test, expect } from '@playwright/test';

const LIMIT_URL = 'http://localhost:8088/limit-ma/';

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

/** Wait until the funnel SVG has been rendered into #plot */
async function waitForPlot(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('plot');
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

test.describe('limit-ma retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 modules are registered on window.alm
  test('all 7 shared modules registered', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    const modules = await page.evaluate(() => ({
      csvUpload:     typeof window.alm.csvUpload      === 'function',
      chartDownload: typeof window.alm.chartDownload  === 'function',
      axisControls:  typeof window.alm.axisControls   === 'function',
      resultsExport: typeof window.alm.resultsExport  === 'function',
      urlState:      typeof window.alm.urlState       === 'function',
      resetUndo:     typeof window.alm.resetUndo      === 'function',
      tooltips:      typeof window.alm.tooltips       === 'function',
    }));
    for (const [name, ok] of Object.entries(modules)) {
      expect(ok, `Module ${name} not registered`).toBe(true);
    }
  });

  // T3 — funnel SVG renders on load
  test('funnel SVG renders on load', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    const childCount = await page.evaluate(() => document.getElementById('plot').children.length);
    expect(childCount).toBeGreaterThan(0);
  });

  // T4 — results table has 3 rows (FE, RE, Limit)
  test('results table has 3 rows after fit', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    await waitForResults(page);
    const rowCount = await page.evaluate(() => document.getElementById('body').children.length);
    expect(rowCount).toBe(3);
  });

  // T5 — results export contains expected limit-ma keys
  test('results export schema contains limit_est key', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    await waitForResults(page);
    const results = await page.evaluate(() => window._almLastLimit ? window._almLastLimit() : null);
    expect(results).not.toBeNull();
    expect(typeof results.limit_est).toBe('number');
    expect(typeof results.re_est).toBe('number');
    expect(typeof results.fe_est).toBe('number');
    expect(typeof results.tau2_dl).toBe('number');
    expect(typeof results.slope).toBe('number');
  });

  // T6 — limit estimate is attenuated vs RE (small-study effect direction)
  test('limit estimate < RE estimate for default fixture', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    await waitForResults(page);
    const results = await page.evaluate(() => window._almLastLimit ? window._almLastLimit() : null);
    expect(results).not.toBeNull();
    expect(results.limit_est).toBeLessThan(results.re_est);
  });

  // T7 — hub back link is present
  test('hub back link present', async ({ page }) => {
    await page.goto(LIMIT_URL);
    await waitForAlm(page);
    const hubLink = await page.locator('#hub-back');
    await expect(hubLink).toBeVisible();
  });

});
