/**
 * mh-peto retrofit sanity spec — Cycle 2.6 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (mirror copied to mh-peto-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\mh-peto\tests\sanity.spec.mjs .\mh-peto-sanity.spec.mjs
 *   npx playwright test mh-peto-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const MHPETO_URL = 'http://localhost:8088/mh-peto/';

/**
 * Wait until all 7 alm modules have registered on window.alm
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

/** Wait until the forest SVG has been rendered with content */
async function waitForForest(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('forest');
    return svg && svg.innerHTML.trim().length > 0;
  }, { timeout: 10_000 });
}

test.describe('mh-peto retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign browser informational messages:
        //   - CSP frame-ancestors in <meta>: browser info, not a JS error
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    await waitForForest(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(MHPETO_URL);
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
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    // csv-upload widget
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    // results-export widget
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    // reset-undo widget
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    // chart-download widget
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — forest SVG renders with content for default data
  test('forest SVG renders with content for default data', async ({ page }) => {
    await page.goto(MHPETO_URL);
    await waitForForest(page);
    // SVG should have polygon elements (pooled diamonds)
    const polyCount = await page.locator('#forest polygon').count();
    expect(polyCount, 'Expected at least one polygon in #forest (pooled diamond)').toBeGreaterThan(0);
    // SVG should have line elements (study CI whiskers)
    const lineCount = await page.locator('#forest line').count();
    expect(lineCount, 'Expected at least one line in #forest (CI or null line)').toBeGreaterThan(0);
  });

  // T5 — results-export JSON download contains real pooled values
  test('results-export JSON download contains real mh/peto pooled values', async ({ page }) => {
    await page.goto(MHPETO_URL);
    await waitForAlm(page);
    await waitForForest(page);
    await page.waitForFunction(() =>
      window._almLastMhPeto && window._almLastMhPeto() !== null,
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
    expect(obj._schema, 'Missing _schema field').toBe('mhpeto-results-v1');
    // Must have at least one study
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain pooled MH estimate
    expect(obj.mh_est, 'mh_est missing — MH pooled estimate not computed').toBeDefined();
    expect(obj.mh_lo,  'mh_lo missing').toBeDefined();
    expect(obj.mh_hi,  'mh_hi missing').toBeDefined();
    // For OR measure: Peto results should also be present
    expect(obj.peto_est, 'peto_est missing — Peto OR not computed for OR measure').toBeDefined();
  });

  // Cycle 7.1: TRUE JS-engine R-parity. Drives the actual JS pooling engine
  // with the fixture data and asserts every numeric output matches metafor
  // within 1e-6. Replaces the fixture-drift-only check in
  // test_against_metafor.py — that test only proves the hardcoded expected
  // values still match a fresh Rscript run; it never touches the JS engine.
  test('JS engine R-parity vs metafor::rma.mh and rma.peto (mhpeto-tiny)', async ({ page }) => {
    // mhpeto-tiny.csv inlined so the test is self-contained.  Same 5 rows
    // also live in mh-peto/tests/fixtures/mhpeto-tiny.csv used by the R run.
    const fixture = [
      { study: 'StudyA', e1: 3, n1: 500, e2:  8, n2: 500 },
      { study: 'StudyB', e1: 1, n1: 200, e2:  5, n2: 200 },
      { study: 'StudyC', e1: 0, n1: 150, e2:  4, n2: 150 },
      { study: 'StudyD', e1: 2, n1: 400, e2:  6, n2: 400 },
      { study: 'StudyE', e1: 4, n1: 600, e2: 10, n2: 600 },
    ];
    // metafor 4.x derived values (log scale for *_b / *_ci_*), captured
    // 2026-05-14 via fixtures/mhpeto-tiny.R.  Kept in sync with the same
    // constants in test_against_metafor.py.
    const expected = {
      peto_b:     -1.081012806542,
      peto_ci_lb: -1.681929944791,
      peto_ci_ub: -0.4800956682933,
      mh_b:       -1.205880041393,
      mh_ci_lb:   -1.916110050453,
      mh_ci_ub:   -0.4956500323332,
    };
    const TOL = 1e-6;

    await page.goto(MHPETO_URL);
    await waitForAlm(page);

    // Inject the fixture into the engine.  __almLoad calls run() internally.
    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastMhPeto && window._almLastMhPeto() !== null,
      { timeout: 5_000 }
    );

    const r = await page.evaluate(() => window._almLastMhPeto());

    // JS exposes natural-scale OR; metafor exposes log-OR.  Convert and
    // compare on the same scale.
    const ln = Math.log;
    expect(Math.abs(ln(r.mh_est) - expected.mh_b),
      `mh_est: log(${r.mh_est}) vs metafor b=${expected.mh_b}`)
      .toBeLessThan(TOL);
    expect(Math.abs(ln(r.mh_lo) - expected.mh_ci_lb),
      `mh_lo: log(${r.mh_lo}) vs metafor ci.lb=${expected.mh_ci_lb}`)
      .toBeLessThan(TOL);
    expect(Math.abs(ln(r.mh_hi) - expected.mh_ci_ub),
      `mh_hi: log(${r.mh_hi}) vs metafor ci.ub=${expected.mh_ci_ub}`)
      .toBeLessThan(TOL);

    expect(Math.abs(ln(r.peto_est) - expected.peto_b),
      `peto_est: log(${r.peto_est}) vs metafor b=${expected.peto_b}`)
      .toBeLessThan(TOL);
    expect(Math.abs(ln(r.peto_lo) - expected.peto_ci_lb),
      `peto_lo: log(${r.peto_lo}) vs metafor ci.lb=${expected.peto_ci_lb}`)
      .toBeLessThan(TOL);
    expect(Math.abs(ln(r.peto_hi) - expected.peto_ci_ub),
      `peto_hi: log(${r.peto_hi}) vs metafor ci.ub=${expected.peto_ci_ub}`)
      .toBeLessThan(TOL);

    // k (study count) sanity
    expect(r.k, 'k mismatch').toBe(fixture.length);
  });

});
