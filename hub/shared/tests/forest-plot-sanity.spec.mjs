/**
 * forest-plot retrofit sanity spec — Cycle 2.1 Task 17 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copies to forest-plot-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\forest-plot\tests\sanity.spec.mjs .\forest-plot-sanity.spec.mjs
 *   npx playwright test forest-plot-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const FOREST_URL = 'http://localhost:8088/forest-plot/';

/** Wait until all 5 alm modules have registered on window.alm */
async function waitForAlm(page) {
  await page.waitForFunction(() =>
    window.alm &&
    typeof window.alm.csvUpload     === 'function' &&
    typeof window.alm.axisControls  === 'function' &&
    typeof window.alm.resultsExport === 'function' &&
    typeof window.alm.urlState      === 'function' &&
    typeof window.alm.resetUndo     === 'function',
    { timeout: 10_000 }
  );
}

/** Wait until the SVG has been rendered into #svg-host */
async function waitForSvg(page) {
  await page.waitForSelector('#svg-host svg', { timeout: 10_000 });
}

test.describe('forest-plot retrofit sanity', () => {

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
    await page.goto(FOREST_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 5 wired alm modules register themselves on window.alm
  test('all 5 wired alm modules are loaded', async ({ page }) => {
    await page.goto(FOREST_URL);
    await waitForAlm(page);
    const present = await page.evaluate(() => ({
      csvUpload:     typeof window.alm.csvUpload,
      axisControls:  typeof window.alm.axisControls,
      resultsExport: typeof window.alm.resultsExport,
      urlState:      typeof window.alm.urlState,
      resetUndo:     typeof window.alm.resetUndo,
    }));
    expect(present.csvUpload,     'alm.csvUpload not a function')     .toBe('function');
    expect(present.axisControls,  'alm.axisControls not a function')  .toBe('function');
    expect(present.resultsExport, 'alm.resultsExport not a function') .toBe('function');
    expect(present.urlState,      'alm.urlState not a function')      .toBe('function');
    expect(present.resetUndo,     'alm.resetUndo not a function')     .toBe('function');
  });

  // T3 — all 4 mount points render their widget root elements
  test('all 4 mount points have been initialised', async ({ page }) => {
    await page.goto(FOREST_URL);
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

  // T4 — pre-retrofit feature: forest-plot SVG still renders (chart-download intact)
  test('existing forest-plot SVG still renders', async ({ page }) => {
    await page.goto(FOREST_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#svg-host svg').count();
    expect(svgCount, 'Expected at least one SVG in #svg-host').toBeGreaterThan(0);
    // Verify SVG has line elements (study rows) — the plot is not empty
    const lineCount = await page.locator('#svg-host svg line').count();
    expect(lineCount, 'SVG appears to have no drawn lines — plot may be empty').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real pooled values (not just form state)
  test('results-export JSON download contains real pooled values', async ({ page }) => {
    await page.goto(FOREST_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    // Give the engine one extra tick to propagate _lastFE / _lastRE via
    // the render() call that fires on DOMContentLoaded
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

    // Must have the results schema marker
    expect(obj._schema, 'Missing _schema field').toBe('forest-plot-results-v1');
    // Must have at least one study
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain at least FE pooled estimate (proves getResults() ran)
    expect(obj.fe_mu,    'fe_mu missing — pooled FE result not computed').toBeDefined();
    expect(obj.fe_ci_lb, 'fe_ci_lb missing').toBeDefined();
    expect(obj.fe_ci_ub, 'fe_ci_ub missing').toBeDefined();
    // RE fields should also be present (Paule-Mandel + HKSJ wired)
    expect(obj.re_mu,  're_mu missing — pooled RE result not computed').toBeDefined();
    expect(obj.tau2,   'tau2 missing').toBeDefined();
    expect(obj.I2,     'I2 missing').toBeDefined();
  });

  // Cycle 7.7: real JS-engine R-parity. Drives the JS pooling engine with the
  // forest-tiny fixture and asserts FE pool matches metafor::rma.uni at 1e-6.
  // For this dataset Q < df so REML (R) and PM (JS) both estimate tau^2 = 0,
  // making FE = REML.  The JS engine uses Paule-Mandel for RE; under tau^2=0
  // its FE pool is what R reports as the (degenerate) REML pool.
  test('JS engine R-parity vs metafor::rma.uni (forest-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'A', yi:  0.20, vi: 0.040 },
      { study: 'B', yi: -0.10, vi: 0.030 },
      { study: 'C', yi:  0.15, vi: 0.025 },
      { study: 'D', yi:  0.05, vi: 0.020 },
      { study: 'E', yi: -0.02, vi: 0.015 },
    ];
    const expected = {
      b:     0.04108527131783,
      se:    0.06819943394705,
      ci_lb: -0.0925831629844,
      ci_ub: 0.1747537056201,
      k:     5,
    };
    const TOL = 1e-6;

    await page.goto(FOREST_URL);
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
    expect(Math.abs(result.fe.mu - expected.b),
      `FE mu: ${result.fe.mu} vs metafor b=${expected.b}`).toBeLessThan(TOL);
    expect(Math.abs(result.fe.se - expected.se),
      `FE se: ${result.fe.se} vs metafor se=${expected.se}`).toBeLessThan(TOL);
    expect(Math.abs(result.fe.lo - expected.ci_lb),
      `FE lo: ${result.fe.lo} vs metafor ci.lb=${expected.ci_lb}`).toBeLessThan(TOL);
    expect(Math.abs(result.fe.hi - expected.ci_ub),
      `FE hi: ${result.fe.hi} vs metafor ci.ub=${expected.ci_ub}`).toBeLessThan(TOL);
  });

});
