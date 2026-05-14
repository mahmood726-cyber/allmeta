/**
 * cumulative-subgroup retrofit sanity spec — Cycle 2.7 Task 2 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (mirror copied to cumulative-subgroup-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\cumulative-subgroup\tests\sanity.spec.mjs .\cumulative-subgroup-sanity.spec.mjs
 *   npx playwright test cumulative-subgroup-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/cumulative-subgroup/';

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

/** Wait until the SVG plot has been rendered with content */
async function waitForPlot(page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('svg-host');
    return host && host.innerHTML.trim().length > 0;
  }, { timeout: 10_000 });
}

test.describe('cumulative-subgroup retrofit sanity', () => {

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
    await page.goto(APP_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(APP_URL);
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
    await page.goto(APP_URL);
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

  // T4 — cumulative SVG renders with polyline for default data
  test('cumulative SVG renders with polyline for default data', async ({ page }) => {
    await page.goto(APP_URL);
    await waitForPlot(page);
    // SVG should have a polyline (the cumulative line)
    const polylineCount = await page.locator('#svg-host polyline').count();
    expect(polylineCount, 'Expected at least one polyline in #svg-host (cumulative line)').toBeGreaterThan(0);
    // SVG should have circles (per-step points)
    const circleCount = await page.locator('#svg-host circle').count();
    expect(circleCount, 'Expected at least one circle in #svg-host (study points)').toBeGreaterThan(0);
  });

  // T5 — results-export JSON download contains cumsub schema
  test('results-export JSON download contains cumsub schema', async ({ page }) => {
    await page.goto(APP_URL);
    await waitForAlm(page);
    await waitForPlot(page);
    await page.waitForFunction(() =>
      window._almLastCumSub && window._almLastCumSub() !== null,
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
    expect(obj._schema, 'Missing _schema field').toBe('cumsub-results-v1');
    // Must contain final pooled estimate
    expect(obj.mu_final,   'mu_final missing').toBeDefined();
    expect(obj.se_final,   'se_final missing').toBeDefined();
    expect(obj.lo_final,   'lo_final missing').toBeDefined();
    expect(obj.hi_final,   'hi_final missing').toBeDefined();
    expect(obj.tau2_final, 'tau2_final missing').toBeDefined();
    // Must contain series
    expect(Array.isArray(obj.series), 'series must be an array').toBe(true);
    expect(obj.series.length, 'series must have ≥2 steps').toBeGreaterThan(1);
  });

  // Cycle 7.10: real JS-engine R-parity vs metafor cumul (cumul-tiny).
  test('JS engine R-parity vs metafor cumul ordered by year (cumul-tiny)', async ({ page }) => {
    // cumul-tiny.csv: study,year,yi,vi -> JS rows: { study, yi, se=sqrt(vi), year }
    const fixture = [
      { study: 'S1', yi: -0.30, se: Math.sqrt(0.040), year: 2010 },
      { study: 'S2', yi: -0.45, se: Math.sqrt(0.050), year: 2012 },
      { study: 'S3', yi: -0.20, se: Math.sqrt(0.030), year: 2014 },
      { study: 'S4', yi: -0.55, se: Math.sqrt(0.060), year: 2017 },
      { study: 'S5', yi: -0.35, se: Math.sqrt(0.025), year: 2020 },
    ];
    // R captures (Cycle 7.9 updated: qnorm(0.975) exact, not 1.96)
    const expected = {
      mu_final: -0.3432098765432097, se_final: 0.08606629658238701,
      lo_final: -0.511896718127431,  hi_final: -0.1745230349589884,
      mu_penu:  -0.3403508771929825, se_penu:  0.1025978352085154,
      lo_penu:  -0.5414389390934481, hi_penu:  -0.1392628152925168,
      tau2:     0,
      Q:        1.672942386831276,
      k:        5,
    };
    const TOL = 1e-6;

    await page.goto(APP_URL);
    await waitForAlm(page);
    await page.evaluate((rows) => window.__almLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastCumSub && window._almLastCumSub() !== null,
      { timeout: 5_000 }
    );
    const r = await page.evaluate(() => window._almLastCumSub());

    expect(r.k, 'k mismatch').toBe(expected.k);
    // Final pool
    expect(Math.abs(r.mu_final - expected.mu_final),
      `mu_final: ${r.mu_final} vs metafor=${expected.mu_final}`).toBeLessThan(TOL);
    expect(Math.abs(r.se_final - expected.se_final),
      `se_final: ${r.se_final} vs metafor=${expected.se_final}`).toBeLessThan(TOL);
    expect(Math.abs(r.lo_final - expected.lo_final),
      `lo_final: ${r.lo_final} vs metafor=${expected.lo_final}`).toBeLessThan(TOL);
    expect(Math.abs(r.hi_final - expected.hi_final),
      `hi_final: ${r.hi_final} vs metafor=${expected.hi_final}`).toBeLessThan(TOL);
    expect(Math.abs(r.tau2_final - expected.tau2),
      `tau2_final: ${r.tau2_final} vs metafor=${expected.tau2}`).toBeLessThan(TOL);
    // Penultimate (k-1 step) from series array
    const penu = r.series[r.series.length - 2];
    expect(Math.abs(penu.mu - expected.mu_penu),
      `series[k-2].mu (penultimate): ${penu.mu} vs metafor=${expected.mu_penu}`).toBeLessThan(TOL);
    expect(Math.abs(penu.se - expected.se_penu),
      `series[k-2].se: ${penu.se} vs metafor=${expected.se_penu}`).toBeLessThan(TOL);
    expect(Math.abs(penu.lo - expected.lo_penu),
      `series[k-2].lo: ${penu.lo} vs metafor=${expected.lo_penu}`).toBeLessThan(TOL);
    expect(Math.abs(penu.hi - expected.hi_penu),
      `series[k-2].hi: ${penu.hi} vs metafor=${expected.hi_penu}`).toBeLessThan(TOL);
  });

});
