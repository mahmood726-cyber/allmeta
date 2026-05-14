/**
 * p-curve retrofit sanity spec — Cycle 2.5 Task 2 do-no-harm gate.
 *
 * Mirror kept at hub/shared/tests/p-curve-sanity.spec.mjs — kept here so
 * the local tests/ dir also carries the spec.
 *
 * To run from hub/shared/tests/:
 *   copy C:\Projects\allmeta\p-curve\tests\sanity.spec.mjs .\p-curve-sanity.spec.mjs
 *   npx playwright test p-curve-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * p-curve specifics:
 *   - 6 wired modules (csvUpload, axisControls, resultsExport, urlState,
 *     resetUndo, tooltips)
 *   - The histogram renders into #plot (inline SVG rect elements)
 *   - T4 checks #plot has rendered bars for the default 12 p-values
 *   - T5 checks pcurve-results-v1 schema with fisher_chisq / fisher_p keys
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
        // CSP frame-ancestors in <meta> is benign — enforcement path is HTTP header
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

  // Cycle 7.15: real JS-engine R-parity (13th app). p-curve Fisher's combined
  // statistic + flatness test vs R pchisq + pnorm.
  test('JS engine R-parity vs R pchisq + pnorm (pcurve-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'Study1', p: 0.003 },
      { study: 'Study2', p: 0.012 },
      { study: 'Study3', p: 0.021 },
      { study: 'Study4', p: 0.038 },
      { study: 'Study5', p: 0.047 },
    ];
    const expected = {
      fisher_chisq: 10.88867977905,
      fisher_df:    10,
      fisher_p:     0.3662564540401,
      prop_low:     0.6,
      z_flat:       0.4472135955,
      p_flat:       0.6547208460186,
      k:            5,
    };
    const TOL = 1e-6;
    // JS uses A&S pnorm (max abs err 7.5e-8) and a series-based pchisq
    // approximation (max err ~2e-4 on the tail).  Allow 1e-3 on p-values
    // that propagate through either CDF.
    const NORM_TOL = 1e-3;

    await page.goto(PCURVE_URL);
    await waitForAlm(page);
    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastPcurve && window._almLastPcurve() !== null,
      { timeout: 5_000 }
    );
    const r = await page.evaluate(() => window._almLastPcurve());

    expect(r.k, 'k mismatch').toBe(expected.k);
    expect(r.fisher_df, 'fisher_df mismatch').toBe(expected.fisher_df);
    expect(Math.abs(r.fisher_chisq - expected.fisher_chisq),
      `fisher_chisq: ${r.fisher_chisq} vs R=${expected.fisher_chisq}`).toBeLessThan(TOL);
    expect(Math.abs(r.fisher_p - expected.fisher_p),
      `fisher_p: ${r.fisher_p} vs R=${expected.fisher_p}`).toBeLessThan(NORM_TOL);
    expect(Math.abs(r.prop_low - expected.prop_low),
      `prop_low: ${r.prop_low} vs R=${expected.prop_low}`).toBeLessThan(TOL);
    expect(Math.abs(r.z_flat - expected.z_flat),
      `z_flat: ${r.z_flat} vs R=${expected.z_flat}`).toBeLessThan(TOL);
    expect(Math.abs(r.p_flat - expected.p_flat),
      `p_flat: ${r.p_flat} vs R=${expected.p_flat}`).toBeLessThan(NORM_TOL);
  });

});
