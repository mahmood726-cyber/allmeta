/**
 * funnel-plot retrofit sanity spec — Cycle 2.1 Task 21 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\funnel-plot\tests\sanity.spec.mjs .\funnel-plot-sanity.spec.mjs
 *   npx playwright test funnel-plot-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Funnel-plot differences from forest-plot sanity spec:
 *   - 6 wired modules (adds tooltips vs forest-plot's 5)
 *   - SVG renders in #svg-host (same selector, different plot shape)
 *   - T5 checks funnel-plot-results-v1 schema with Egger keys, not RE/tau2 keys
 *   - waitForAlm includes alm.tooltips
 */
import { test, expect } from '@playwright/test';

const FUNNEL_URL = 'http://localhost:8088/funnel-plot/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 * Funnel-plot wires: csvUpload, axisControls, resultsExport, urlState,
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

test.describe('funnel-plot retrofit sanity', () => {

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
    await page.goto(FUNNEL_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(FUNNEL_URL);
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
    await page.goto(FUNNEL_URL);
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

  // T4 — pre-retrofit feature: funnel-plot SVG still renders (chart-download present-good intact)
  test('existing funnel-plot SVG still renders', async ({ page }) => {
    await page.goto(FUNNEL_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#svg-host svg').count();
    expect(svgCount, 'Expected at least one SVG in #svg-host').toBeGreaterThan(0);
    // Verify SVG has line elements (funnel arms + centre line) — the plot is not empty
    const lineCount = await page.locator('#svg-host svg line').count();
    expect(lineCount, 'SVG appears to have no drawn lines — funnel arms may be missing').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real Egger values (not just form state)
  //
  // Checks __almResults() output via the results-export module's JSON button.
  // The JSON schema should be 'funnel-plot-results-v1' and must include computed
  // Egger intercept fields — proving getResults() ran the engine, not just returning
  // form state the way the legacy btn-json/onDownloadJson did.
  test('results-export JSON download contains real Egger values', async ({ page }) => {
    await page.goto(FUNNEL_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    // Give the engine one extra tick to propagate _lastFE / _lastEgg via
    // the render() call that fires on DOMContentLoaded (example data is loaded
    // automatically when no localStorage state is present).
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

    // Must have the funnel-plot results schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('funnel-plot-results-v1');
    // Must have at least one study (example data has 10 studies)
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain FE pooled estimate (proves the engine ran)
    expect(obj.fe_mu,    'fe_mu missing — pooled FE result not computed').toBeDefined();
    expect(obj.fe_ci_lb, 'fe_ci_lb missing').toBeDefined();
    expect(obj.fe_ci_ub, 'fe_ci_ub missing').toBeDefined();
    // Must contain Egger fields (the key gap vs legacy btn-json)
    expect(obj.egger_intercept,    'egger_intercept missing — Egger regression not wired').toBeDefined();
    expect(obj.egger_intercept_se, 'egger_intercept_se missing').toBeDefined();
    expect(obj.egger_p,            'egger_p missing').toBeDefined();
  });

  // Cycle 7.5: real JS-engine R-parity. Drives the JS engines with the
  // funnel-tiny fixture used by test_against_metafor.py and asserts every
  // *comparable* output matches metafor at 1e-6.
  //
  // IMPORTANT: the Egger-test values from this app are NOT compared to R
  // here. The reason is a documented methodology difference:
  //   - JS implements Egger's original 1997 formulation — unweighted least-
  //     squares regression of (effect/SE) on precision (1/SE).
  //   - metafor::regtest() on an rma.uni object inherits inverse-variance
  //     weights (1/(SE^2 + tau^2)), i.e. a weighted regression on SE.
  // These give different intercept t-statistics and different slope/SE pairs
  // by construction.  Both are correct for their conventions.  Fixing the
  // gap requires either re-implementing the JS engine on metafor's
  // formulation or capturing a different R reference.  Tracked separately.
  test('JS engine R-parity vs metafor REML pool (funnel-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'S1', yi:  0.20, sei: 0.20 },
      { study: 'S2', yi: -0.10, sei: 0.18 },
      { study: 'S3', yi:  0.30, sei: 0.15 },
      { study: 'S4', yi:  0.05, sei: 0.22 },
      { study: 'S5', yi:  0.15, sei: 0.10 },
      { study: 'S6', yi: -0.05, sei: 0.12 },
      { study: 'S7', yi:  0.40, sei: 0.25 },
      { study: 'S8', yi:  0.18, sei: 0.14 },
    ];
    // metafor::rma.uni(method='REML') output. For this fixture REML
    // estimates tau^2 = 0 so FE and REML pool coincide.
    const expected = { pool_b: 0.1213967993407, pool_se: 0.05289342302168, k: 8 };
    const TOL = 1e-6;

    await page.goto(FUNNEL_URL);
    await waitForAlm(page);
    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastFE && window._almLastFE() !== null,
      { timeout: 5_000 }
    );
    const result = await page.evaluate(() => ({
      fe: window._almLastFE(),
      studies: window._almLastStudies(),
    }));

    expect(result.studies.length, 'k mismatch').toBe(expected.k);
    expect(Math.abs(result.fe.mu - expected.pool_b),
      `pool mu: ${result.fe.mu} vs metafor b=${expected.pool_b}`).toBeLessThan(TOL);
    expect(Math.abs(result.fe.se - expected.pool_se),
      `pool se: ${result.fe.se} vs metafor se=${expected.pool_se}`).toBeLessThan(TOL);
  });

});
