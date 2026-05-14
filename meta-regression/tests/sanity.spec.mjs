/**
 * meta-regression retrofit sanity spec — Cycle 2.1 Task 25 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\meta-regression\tests\sanity.spec.mjs .\meta-regression-sanity.spec.mjs
 *   npx playwright test meta-regression-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Meta-regression differences from forest/funnel sanity specs:
 *   - 6 wired modules (same as funnel-plot: adds tooltips vs forest-plot's 5)
 *   - SVG renders in #svg-host (bubble plot with fitted regression line)
 *   - T5 checks meta-regression-results-v1 schema with intercept/slope/R2 keys
 *   - waitForAlm includes alm.tooltips
 *   - readiness sentinel is _almLastFitted (not _almLastFE as in forest/funnel)
 */
import { test, expect } from '@playwright/test';

const MR_URL = 'http://localhost:8088/meta-regression/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 * Meta-regression wires: csvUpload, axisControls, resultsExport, urlState,
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

test.describe('meta-regression retrofit sanity', () => {

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
    await page.goto(MR_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(MR_URL);
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
    await page.goto(MR_URL);
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

  // T4 — pre-retrofit feature: bubble plot SVG still renders (chart-download present-good intact)
  test('existing bubble plot SVG still renders', async ({ page }) => {
    await page.goto(MR_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#svg-host svg').count();
    expect(svgCount, 'Expected at least one SVG in #svg-host').toBeGreaterThan(0);
    // Verify SVG has line/polyline elements (fitted regression line, axis tick marks)
    // — the plot is not empty. Bubbles are <circle>; the fit line is a <polyline>.
    const polylineCount = await page.locator('#svg-host svg polyline').count();
    expect(polylineCount, 'SVG appears to have no polyline — fitted regression line may be missing').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real coefficient values (not just form state)
  //
  // Checks __almResults() output via the results-export module's JSON button.
  // The JSON schema should be 'meta-regression-results-v1' and must include
  // computed coefficient fields — proving getResults() ran the engine, not just
  // returning form state the way the legacy btn-json/onDownloadJson did.
  test('results-export JSON download contains real coefficient values', async ({ page }) => {
    await page.goto(MR_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    // Give the engine one extra tick to propagate _lastFitted via the render()
    // call that fires on DOMContentLoaded (example data is loaded automatically
    // when no localStorage state is present).
    await page.waitForFunction(() =>
      window._almLastFitted && window._almLastFitted() !== null,
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

    // Must have the meta-regression results schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('meta-regression-results-v1');
    // Must have at least one study (example data has 8 studies)
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain intercept (β₀) — proves the engine ran WLS regression
    expect(obj.intercept,    'intercept (β₀) missing — WLS regression not wired').toBeDefined();
    expect(typeof obj.intercept, 'intercept should be a number').toBe('number');
    // Must contain slope (β₁) — the moderator coefficient
    expect(obj.slope,        'slope (β₁) missing').toBeDefined();
    expect(typeof obj.slope, 'slope should be a number').toBe('number');
    // Must contain R² — proportion of τ² explained by the moderator (the key gap
    // vs legacy btn-json, which only exported raw form state)
    expect(obj.R2_tau2,      'R2_tau2 missing — τ² explained by moderator not exported').toBeDefined();
    // Must contain τ² (Paule-Mandel) — confirms RE model ran
    expect(obj.tau2_pm,      'tau2_pm missing — PM τ² not computed').toBeDefined();
    // Must contain HKSJ q (Knapp-Hartung scaling factor with floor)
    expect(obj.hksj_q,       'hksj_q missing — HKSJ floor not applied').toBeDefined();
  });

  // Cycle 7.11: real JS-engine R-parity. Point estimates (intercept, slope,
  // tau^2) match metafor::rma.uni(method='PM', test='knha') at 1e-6.
  //
  // The SEs are NOT compared here because of a deliberate methodology choice
  // that diverges from metafor's default behaviour:
  //
  // The JS engine applies the HKSJ q-floor q* = max(1, RSS/(k-p)) per
  // advanced-stats.md rule "HKSJ floor".  metafor's test='knha' uses the raw
  // q* without the floor.  For data with very-good fit (small RSS) like
  // mr-tiny, the floor inflates SE to a conservative value while metafor's
  // raw HKSJ yields a smaller (anti-conservative) SE.  This is the documented
  // behaviour in the project's advanced-stats rule set; the floor is the
  // safer convention even though it diverges from metafor.
  test('JS engine R-parity vs metafor PM point estimates (mr-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'A', yi: 0.10, vi: 0.05,  year: 2010 },
      { study: 'B', yi: 0.30, vi: 0.04,  year: 2014 },
      { study: 'C', yi: 0.45, vi: 0.03,  year: 2018 },
      { study: 'D', yi: 0.55, vi: 0.02,  year: 2020 },
      { study: 'E', yi: 0.70, vi: 0.025, year: 2022 },
      { study: 'F', yi: 0.20, vi: 0.06,  year: 2012 },
    ];
    const expected = {
      intercept: -95.650381993419,
      slope:       0.04763457921955,
      tau2:        0,
      k:           6,
    };
    const TOL = 1e-6;

    await page.goto(MR_URL);
    await waitForAlm(page);
    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastFitted && window._almLastFitted() !== null,
      { timeout: 5_000 }
    );

    const out = await page.evaluate(() => {
      const f = window._almLastFitted();
      return {
        intercept: f.fit.b0,
        slope: f.fit.b1,
        tau2_pm: f.tau2,
        k: window._almLastStudies().length,
      };
    });

    expect(out.k, 'k mismatch').toBe(expected.k);
    expect(Math.abs(out.intercept - expected.intercept),
      `intercept: ${out.intercept} vs metafor=${expected.intercept}`).toBeLessThan(TOL);
    expect(Math.abs(out.slope - expected.slope),
      `slope: ${out.slope} vs metafor=${expected.slope}`).toBeLessThan(TOL);
    expect(Math.abs(out.tau2_pm - expected.tau2),
      `tau2_pm: ${out.tau2_pm} vs metafor=${expected.tau2}`).toBeLessThan(TOL);
  });

});
