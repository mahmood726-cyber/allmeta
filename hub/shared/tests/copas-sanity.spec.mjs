/**
 * copas retrofit sanity spec — Cycle 2.8 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\copas\tests\sanity.spec.mjs .\copas-sanity.spec.mjs
 *   npx playwright test copas-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, chart-download, axis-controls,
 * results-export, url-state, reset-undo, tooltips (7 total).
 *
 * copas-specific notes:
 *   - The sensitivity curve renders inside #plot (SVG via drawSens())
 *   - T4 checks that the SVG has circle elements (data points on curve)
 *   - T5 checks copas-results-v1 schema with sensitivity_grid array
 *   - Engine: simplified HT Copas (Phi(a - gamma/sei) reweighting)
 *   - R-parity: direction + attenuation + slope verified vs metasens::copas
 */
import { test, expect } from '@playwright/test';

const COPAS_URL = 'http://localhost:8088/copas/';

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

/** Wait until the sensitivity SVG has been rendered into #plot */
async function waitForSvg(page) {
  await page.waitForFunction(() => {
    const plot = document.getElementById('plot');
    return plot && plot.querySelector('circle') !== null;
  }, { timeout: 10_000 });
}

/** Wait until the results table body has been populated */
async function waitForResults(page) {
  await page.waitForFunction(() => {
    const body = document.getElementById('body');
    return body && body.innerHTML.trim().length > 0;
  }, { timeout: 10_000 });
}

test.describe('copas retrofit sanity', () => {

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
    await page.goto(COPAS_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(COPAS_URL);
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
    await page.goto(COPAS_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — sensitivity SVG renders with data-point circles for default data
  test('sensitivity SVG renders with circles in #plot', async ({ page }) => {
    await page.goto(COPAS_URL);
    await waitForSvg(page);
    const circleCount = await page.locator('#plot circle').count();
    // 7 gamma steps → 7 circles
    expect(circleCount, 'Expected 7 circles in #plot (one per gamma step)')
      .toBeGreaterThanOrEqual(7);
    // CI band path should be present
    const pathCount = await page.locator('#plot path').count();
    expect(pathCount, 'Expected path elements (CI band + curve) in #plot')
      .toBeGreaterThanOrEqual(2);
  });

  // T5 — results-export JSON contains copas-results-v1 schema
  test('results-export JSON contains copas-results-v1 schema', async ({ page }) => {
    await page.goto(COPAS_URL);
    await waitForAlm(page);
    await waitForResults(page);
    await page.waitForFunction(() =>
      window._almLastCopas && window._almLastCopas() !== null,
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

    expect(obj._schema, 'Missing or wrong _schema').toBe('copas-results-v1');
    expect(obj.k,       'k (study count) missing').toBeGreaterThan(0);
    expect(obj.fe_pooled, 'fe_pooled missing').toBeDefined();
    expect(obj.sensitivity_grid, 'sensitivity_grid missing').toBeDefined();
    expect(Array.isArray(obj.sensitivity_grid), 'sensitivity_grid should be array').toBe(true);
    expect(obj.sensitivity_grid.length, 'Expected 7 gamma steps').toBe(7);
    // First grid row: gamma=0 (no adjustment)
    const row0 = obj.sensitivity_grid[0];
    expect(row0.gamma, 'grid[0].gamma should be 0').toBe(0);
    expect(row0.te_adj, 'grid[0].te_adj missing').toBeDefined();
    // Last grid row: gamma=3.0 (strongest selection)
    const rowLast = obj.sensitivity_grid[6];
    expect(rowLast.gamma, 'grid[6].gamma should be 3').toBe(3);
    // Attenuation: at gamma=3, te_adj should be less than at gamma=0
    expect(rowLast.te_adj, 'grid last te_adj should attenuate vs gamma=0')
      .toBeLessThanOrEqual(row0.te_adj + 0.01);
  });

});
