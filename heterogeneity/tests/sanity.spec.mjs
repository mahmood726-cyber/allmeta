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

  // Cycle 7.4: real JS-engine R-parity. Drives the engine with the same
  // het-tiny fixture used by test_against_metafor.py and asserts every
  // numerical output matches metafor::rma.uni(method='REML') within 1e-6.
  // Replaces the fixture-drift check in the pytest file — that test only
  // verifies the hardcoded values still match R; it never touches JS.
  test('JS engine R-parity vs metafor::rma.uni (REML, het-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'A', yi:  0.20, vi: 0.040 },
      { study: 'B', yi: -0.10, vi: 0.030 },
      { study: 'C', yi:  0.15, vi: 0.025 },
      { study: 'D', yi:  0.05, vi: 0.020 },
      { study: 'E', yi: -0.02, vi: 0.015 },
    ];
    // metafor 4.x / R 4.5.2 output (kept in sync with test_against_metafor.py)
    // For REML on this data Q < df so tau2 estimates to 0 and CI uses Z975.
    const expected = {
      b: 0.04108527131783, se: 0.06819943394705,
      ci_lb: -0.0925831629844, ci_ub: 0.1747537056201,
      tau2: 0.0, I2: 0.0, Q: 2.022080103359,
      QEp: 0.7316975563492, k: 5,
    };
    const TOL = 1e-6;

    await page.goto(HET_URL);
    await waitForAlm(page);

    // Pin to REML so the JS engine matches what R is doing.
    await page.evaluate(() => {
      const reml = document.querySelector('input[name="tau2"][value="reml"]');
      if (reml) { reml.checked = true; reml.dispatchEvent(new Event('change', {bubbles:true})); }
      const sel = document.querySelector('select#tau2, select[name="tau2"]');
      if (sel) { sel.value = 'reml'; sel.dispatchEvent(new Event('change', {bubbles:true})); }
    });

    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastFE && window._almLastFE() !== null,
      { timeout: 5_000 }
    );

    const sum = await page.evaluate(() => window._almLastFE().sum);

    expect(sum.k, 'k mismatch').toBe(expected.k);
    expect(Math.abs(sum.mu - expected.b),
      `mu: ${sum.mu} vs metafor b=${expected.b}`).toBeLessThan(TOL);
    expect(Math.abs(sum.se - expected.se),
      `se: ${sum.se} vs metafor se=${expected.se}`).toBeLessThan(TOL);
    expect(Math.abs(sum.ciLo - expected.ci_lb),
      `ciLo: ${sum.ciLo} vs metafor ci.lb=${expected.ci_lb}`).toBeLessThan(TOL);
    expect(Math.abs(sum.ciHi - expected.ci_ub),
      `ciHi: ${sum.ciHi} vs metafor ci.ub=${expected.ci_ub}`).toBeLessThan(TOL);
    expect(Math.abs(sum.tau2 - expected.tau2),
      `tau2: ${sum.tau2} vs metafor tau2=${expected.tau2}`).toBeLessThan(TOL);
    expect(Math.abs(sum.I2 - expected.I2),
      `I2: ${sum.I2} vs metafor I2=${expected.I2}`).toBeLessThan(TOL);
    expect(Math.abs(sum.Q - expected.Q),
      `Q: ${sum.Q} vs metafor Q=${expected.Q}`).toBeLessThan(TOL);
    expect(Math.abs(sum.pQ - expected.QEp),
      `pQ: ${sum.pQ} vs metafor QEp=${expected.QEp}`).toBeLessThan(TOL);
  });

});
