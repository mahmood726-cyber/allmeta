/**
 * heterogeneity retrofit sanity spec — Cycle 2.2 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copies to heterogeneity-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\heterogeneity\tests\sanity.spec.mjs .\heterogeneity-sanity.spec.mjs
 *   npx playwright test heterogeneity-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Heterogeneity differences from forest-plot sanity spec:
 *   - 6 wired modules (adds tooltips vs forest-plot's 5)
 *   - SVG renders in #svg-host (same selector, Baujat scatter plot)
 *   - T5 checks heterogeneity-results-v1 schema with tau2/I2/Q keys
 *   - waitForAlm includes alm.tooltips
 */
import { test, expect } from '@playwright/test';

const HET_URL = 'http://localhost:8088/heterogeneity/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 * Heterogeneity wires: csvUpload, axisControls, resultsExport, urlState,
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

/** Wait until the SVG has been rendered into #svg-host */
async function waitForSvg(page) {
  await page.waitForSelector('#svg-host svg', { timeout: 10_000 });
}

test.describe('heterogeneity retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign browser informational messages that arrive on the
        // console 'error' channel but are NOT JavaScript runtime errors:
        //   - CSP frame-ancestors in <meta>: browsers reject the directive but
        //     it is not a regression — it was present pre-retrofit and the CSP
        //     header on the HTTP response is the enforcement path.
        if (text.includes("frame-ancestors") && text.includes("Content Security Policy")) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(HET_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(HET_URL);
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
    await page.goto(HET_URL);
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

  // T4 — pre-retrofit feature: Baujat SVG still renders (chart-download present-good intact)
  test('existing Baujat SVG still renders', async ({ page }) => {
    await page.goto(HET_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#svg-host svg').count();
    expect(svgCount, 'Expected at least one SVG in #svg-host').toBeGreaterThan(0);
    // Verify SVG has circle elements (Baujat scatter points) — the plot is not empty
    const circleCount = await page.locator('#svg-host svg circle').count();
    expect(circleCount, 'SVG appears to have no circles — Baujat points may be missing').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real heterogeneity stats (not just form state)
  //
  // Checks __almResults() output via the results-export module's JSON button.
  // The JSON schema should be 'heterogeneity-results-v1' and must include computed
  // tau2/I2/Q fields — proving getResults() ran the engine, not just returning
  // form state the way the legacy btn-json/onDownloadJson did.
  test('results-export JSON download contains real heterogeneity stats', async ({ page }) => {
    await page.goto(HET_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    // Give the engine one extra tick to propagate _lastInfo via the render() call
    // that fires on DOMContentLoaded (example data is loaded automatically when
    // no localStorage state is present).
    await page.waitForFunction(() =>
      window._almLastFE && window._almLastFE() !== null,
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

    // Must have the heterogeneity results schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('heterogeneity-results-v1');
    // Must have at least one study (example data has 8 studies)
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain heterogeneity stats (the key gap vs legacy btn-json)
    expect(obj.tau2, 'tau2 missing — heterogeneity not computed').toBeDefined();
    expect(obj.I2,   'I2 missing').toBeDefined();
    expect(obj.Q,    'Q missing').toBeDefined();
  });

});
