/**
 * bucher retrofit sanity spec — Cycle 2.7 Task 1 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (mirror copied to bucher-sanity.spec.mjs there so
 * playwright.config.mjs picks it up and starts the webserver at port 8088):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\bucher\tests\sanity.spec.mjs .\bucher-sanity.spec.mjs
 *   npx playwright test bucher-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/bucher/';

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

/** Wait until the results table has been rendered */
async function waitForResults(page) {
  await page.waitForFunction(() => {
    const body = document.getElementById('body');
    return body && body.innerHTML.trim().length > 0;
  }, { timeout: 10_000 });
}

test.describe('bucher retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign browser informational messages:
        //   - CSP frame-ancestors in <meta>: browser info, not a JS error
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        if (text.includes('ERR_CONNECTION_REFUSED')) return; // benign: optional loopback service (e.g. local LLM) absent
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(APP_URL);
    await waitForAlm(page);
    await waitForResults(page);
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

  // T4 — forest SVG renders with content for default data
  test('forest SVG renders with content for default data', async ({ page }) => {
    await page.goto(APP_URL);
    await waitForResults(page);
    // SVG should have rect elements (study squares and indirect square)
    const rectCount = await page.locator('#plot rect').count();
    expect(rectCount, 'Expected at least one rect in #plot').toBeGreaterThan(0);
    // SVG should have line elements (CI whiskers)
    const lineCount = await page.locator('#plot line').count();
    expect(lineCount, 'Expected at least one line in #plot').toBeGreaterThan(0);
  });

  // T5 — results-export JSON download contains bucher schema
  test('results-export JSON download contains bucher schema', async ({ page }) => {
    await page.goto(APP_URL);
    await waitForAlm(page);
    await waitForResults(page);
    await page.waitForFunction(() =>
      window._almLastBucher && window._almLastBucher() !== null,
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
    expect(obj._schema, 'Missing _schema field').toBe('bucher-results-v1');
    // Must contain indirect estimate
    expect(obj.d_indirect_AB,  'd_indirect_AB missing').toBeDefined();
    expect(obj.se_indirect_AB, 'se_indirect_AB missing').toBeDefined();
    expect(obj.lo_AB, 'lo_AB missing').toBeDefined();
    expect(obj.hi_AB, 'hi_AB missing').toBeDefined();
    expect(obj.p_AB,  'p_AB missing').toBeDefined();
  });

  // Cycle 7.12: real JS-engine R-parity test (10th app).
  //
  // The R script bucher-tiny.R reports "indirect B vs C" = mu_ac - mu_ab,
  // while the JS engine reports "indirect A vs B" = dAC - dBC = mu_ab - mu_ac.
  // Same Bucher computation, opposite reference direction.  The magnitude
  // and SE match; the sign of the indirect estimate flips.
  test('JS engine R-parity vs metafor pool + Bucher (bucher-tiny)', async ({ page }) => {
    const fixture = [
      { study: 'S1', treat1: 'A', treat2: 'B', TE: -0.30, seTE: 0.10 },
      { study: 'S2', treat1: 'A', treat2: 'C', TE: -0.50, seTE: 0.12 },
      { study: 'S3', treat1: 'B', treat2: 'C', TE: -0.22, seTE: 0.09 },
      { study: 'S4', treat1: 'A', treat2: 'B', TE: -0.28, seTE: 0.11 },
      { study: 'S5', treat1: 'A', treat2: 'C', TE: -0.48, seTE: 0.14 },
    ];
    // R 4.5.2 / bucher-tiny.R output (kept in sync with test_against_netmeta.py)
    const expected = {
      mu_ab:         -0.2909502262443439,
      se_ab:          0.07399400733959438,
      mu_ac:         -0.4915294117647059,
      se_ac:          0.09111079228383559,
      mu_bc_indirect:-0.200579185520362,
      se_bc_indirect: 0.1173724396643445,
    };
    const TOL = 1e-6;

    await page.goto(APP_URL);
    await waitForAlm(page);
    // Bucher uses __almBucherLoad (its own loader name; not __almLoad).
    await page.evaluate((rows) => window.__almBucherLoad(rows), fixture);
    await page.waitForFunction(
      () => window._almLastBucher && window._almLastBucher() !== null,
      { timeout: 5_000 }
    );
    const r = await page.evaluate(() => window._almLastBucher());

    // Each pair-pool: JS dAC ↔ R mu_ab (first alphabetical pair), JS dBC ↔ R mu_ac
    expect(Math.abs(r.dAC - expected.mu_ab),
      `dAC: ${r.dAC} vs metafor mu_ab=${expected.mu_ab}`).toBeLessThan(TOL);
    expect(Math.abs(r.seAC - expected.se_ab),
      `seAC: ${r.seAC} vs metafor se_ab=${expected.se_ab}`).toBeLessThan(TOL);
    expect(Math.abs(r.dBC - expected.mu_ac),
      `dBC: ${r.dBC} vs metafor mu_ac=${expected.mu_ac}`).toBeLessThan(TOL);
    expect(Math.abs(r.seBC - expected.se_ac),
      `seBC: ${r.seBC} vs metafor se_ac=${expected.se_ac}`).toBeLessThan(TOL);
    // Indirect: JS reports d_indirect_AB = dAC - dBC = mu_ab - mu_ac (opposite
    // sign from R's mu_bc_indirect).  Compare magnitudes.
    expect(Math.abs(Math.abs(r.d_indirect_AB) - Math.abs(expected.mu_bc_indirect)),
      `|d_indirect_AB|: ${Math.abs(r.d_indirect_AB)} vs |mu_bc_indirect|=${Math.abs(expected.mu_bc_indirect)}`).toBeLessThan(TOL);
    expect(Math.abs(r.se_indirect_AB - expected.se_bc_indirect),
      `se_indirect_AB: ${r.se_indirect_AB} vs se_bc_indirect=${expected.se_bc_indirect}`).toBeLessThan(TOL);
  });

});
