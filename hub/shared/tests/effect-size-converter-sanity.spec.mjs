/**
 * effect-size-converter retrofit sanity spec — Cycle 2.2 Task 3 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy to effect-size-converter-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\effect-size-converter\tests\sanity.spec.mjs .\effect-size-converter-sanity.spec.mjs
 *   npx playwright test effect-size-converter-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, axis-controls, results-export,
 * url-state, reset-undo, tooltips (6 total).
 * Skipped (N/A): chart-download — inline SVG forest plot, no download button.
 */
import { test, expect } from '@playwright/test';

const ESC_URL = 'http://localhost:8088/effect-size-converter/';

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

/** Wait until the results table has at least one row (conversion has run). */
async function waitForResults(page) {
  await page.waitForFunction(() => {
    const tbody = document.getElementById('results-body');
    return tbody && tbody.querySelectorAll('tr').length > 0;
  }, { timeout: 10_000 });
}

test.describe('effect-size-converter retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign browser informational messages (CSP frame-ancestors in meta)
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        if (text.includes('ERR_CONNECTION_REFUSED')) return; // benign: optional loopback service (e.g. local LLM) absent
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(ESC_URL);
    await waitForAlm(page);
    await waitForResults(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(ESC_URL);
    await waitForAlm(page);
    const present = await page.evaluate(() => ({
      csvUpload:     typeof window.alm.csvUpload,
      axisControls:  typeof window.alm.axisControls,
      resultsExport: typeof window.alm.resultsExport,
      urlState:      typeof window.alm.urlState,
      resetUndo:     typeof window.alm.resetUndo,
      tooltips:      typeof window.alm.tooltips,
    }));
    expect(present.csvUpload,     'alm.csvUpload not a function')    .toBe('function');
    expect(present.axisControls,  'alm.axisControls not a function') .toBe('function');
    expect(present.resultsExport, 'alm.resultsExport not a function').toBe('function');
    expect(present.urlState,      'alm.urlState not a function')     .toBe('function');
    expect(present.resetUndo,     'alm.resetUndo not a function')    .toBe('function');
    expect(present.tooltips,      'alm.tooltips not a function')     .toBe('function');
  });

  // T3 — all 4 mount points initialise (tooltips + url-state have no mount divs)
  test('all 4 mount points have been initialised', async ({ page }) => {
    await page.goto(ESC_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  // T4 — pre-retrofit feature: inline forest plot SVG still renders
  test('inline forest plot SVG still renders after retrofit', async ({ page }) => {
    await page.goto(ESC_URL);
    await waitForResults(page);
    const svgCount = await page.locator('#forest-plot').count();
    expect(svgCount, 'Expected #forest-plot SVG to exist').toBeGreaterThan(0);
  });

  // T5 — results-export JSON has esc-results-v1 schema and table rows
  test('results-export JSON contains esc-results-v1 schema with conversion rows', async ({ page }) => {
    await page.goto(ESC_URL);
    await waitForAlm(page);
    await waitForResults(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="json"]').click(),
    ]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf-8');
    const obj = JSON.parse(text);

    expect(obj._schema, 'Missing or wrong _schema field').toBe('esc-results-v1');
    expect(obj.rows, 'rows array missing').toBeDefined();
    expect(Array.isArray(obj.rows), 'rows should be an array').toBe(true);
    expect(obj.rows.length, 'Expected at least one conversion row').toBeGreaterThan(0);
  });

  // Cycle 7.16: real JS-engine R-parity (14th app).
  //
  // For SMD via raw cell-mean inputs the JS engine uses Hedges' simple-J
  // approximation (1 - 3/(4*df-1)) instead of metafor's log-gamma exact J.
  // These agree to ~1e-5 on yi and ~1e-5 on vi.  Test against the metafor
  // reference at tol=1e-4 for SMD derived from m1/sd1/n1 + m2/sd2/n2.
  test('JS engine R-parity vs metafor::escalc SMD (esc-tiny row 1)', async ({ page }) => {
    // First SMD row from esc-tiny.csv
    const fixture = [
      { mode: 'SMD', m1: 52.5, sd1: 8.2, n1: 30, m2: 47.1, sd2: 7.9, n2: 30 },
    ];
    // metafor::escalc(measure='SMD', m1i, sd1i, n1i, m2i, sd2i, n2i) row 1
    const expected = { yi: 0.6619744469902, vi: 0.07031841807057 };
    const TOL = 1e-4;  // simple-J approximation matches metafor to ~1e-5

    await page.goto(ESC_URL);
    await waitForAlm(page);
    await page.evaluate((rows) => window.__almLoadCSV(rows), fixture);
    // Wait for runConvert to populate the form fields after __almLoadCSV
    await page.waitForFunction(() => {
      const v = document.getElementById('in-est')?.value;
      return v && parseFloat(v) > 0;
    }, { timeout: 5_000 });

    const out = await page.evaluate(() => {
      const est = parseFloat(document.getElementById('in-est').value);
      const se  = parseFloat(document.getElementById('in-se').value);
      const type = document.getElementById('in-type').value;
      return { est, se, type, vi: se * se };
    });

    expect(out.type, 'type should be SMD').toBe('SMD');
    expect(Math.abs(out.est - expected.yi),
      `SMD yi: ${out.est} vs metafor=${expected.yi}`).toBeLessThan(TOL);
    expect(Math.abs(out.vi - expected.vi),
      `SMD vi: ${out.vi} vs metafor=${expected.vi}`).toBeLessThan(TOL);
  });

});
