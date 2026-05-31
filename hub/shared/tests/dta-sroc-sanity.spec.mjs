/**
 * dta-sroc retrofit sanity spec — Cycle 2.2 Task 4 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\dta-sroc\tests\sanity.spec.mjs .\dta-sroc-sanity.spec.mjs
 *   npx playwright test dta-sroc-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, axis-controls, results-export,
 * url-state, reset-undo, tooltips (6 total).
 * Skipped (present-good): chart-download — native buildSvg() + PNG/SVG buttons
 * already implemented correctly; do-no-harm principle applies.
 *
 * DTA-specific notes:
 *   - The ROC chart renders in #svg-host (not #funnel or #forest-plot)
 *   - T4 checks that the SVG still renders inside #svg-host after retrofit
 *   - T5 checks dta-sroc-results-v1 schema with alpha, beta, k fields
 *   - tooltips uses src: '../hub/shared/glossary.json' (not glossaryUrl)
 */
import { test, expect } from '@playwright/test';

const DTA_URL = 'http://localhost:8088/dta-sroc/';

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

/** Wait until the ROC SVG has been rendered into #svg-host */
async function waitForSvg(page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('svg-host');
    return host && host.querySelector('svg') !== null;
  }, { timeout: 10_000 });
}

test.describe('dta-sroc retrofit sanity', () => {

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
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        if (text.includes('ERR_CONNECTION_REFUSED')) return; // benign: optional loopback service (e.g. local LLM) absent
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(DTA_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(DTA_URL);
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
    await page.goto(DTA_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
  });

  // T4 — pre-retrofit feature: ROC SVG still renders in #svg-host (chart-download present-good intact)
  test('ROC SVG still renders in #svg-host after retrofit', async ({ page }) => {
    await page.goto(DTA_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#svg-host svg').count();
    expect(svgCount, 'Expected SVG inside #svg-host').toBeGreaterThan(0);
    // Also verify the SROC curve polyline is present (Moses OLS fit rendered)
    const polylineCount = await page.locator('#svg-host polyline').count();
    expect(polylineCount, 'Expected SROC curve polyline in SVG').toBeGreaterThan(0);
  });

  // T5 — results-export JSON has dta-sroc-results-v1 schema and SROC fields
  test('results-export JSON contains dta-sroc-results-v1 schema with SROC stats', async ({ page }) => {
    await page.goto(DTA_URL);
    await waitForAlm(page);
    await waitForSvg(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="json"]').click(),
    ]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf-8');
    const obj = JSON.parse(text);

    expect(obj._schema, 'Missing or wrong _schema field').toBe('dta-sroc-results-v1');
    expect(obj.k,       'k field missing').toBeGreaterThan(0);
    expect(obj.alpha,   'alpha (Moses SROC intercept) missing').not.toBeNull();
    expect(obj.beta,    'beta (Moses SROC slope) missing').not.toBeNull();
    expect(obj.rows,    'rows array missing').toBeDefined();
    expect(Array.isArray(obj.rows), 'rows should be an array').toBe(true);
    expect(obj.rows.length, 'Expected at least one study row').toBeGreaterThan(0);
    // Each row should have DTA cell counts and derived Se/Sp/FPR
    const row0 = obj.rows[0];
    expect(row0.TP,  'row.TP missing').toBeDefined();
    expect(row0.Se,  'row.Se (sensitivity) missing').toBeDefined();
    expect(row0.FPR, 'row.FPR missing').toBeDefined();
  });

  // Cycle 7.17: real JS-engine R-parity (15th app). Moses SROC vs R lm(D ~ S).
  test('JS engine R-parity vs R Moses SROC (sroc-tiny)', async ({ page }) => {
    // sroc-tiny.csv (6 studies) — drive via the form textarea since dta-sroc
    // has no __almLoad helper (the CSV upload onParse handler manipulates the
    // textarea directly).
    const csvText = `S1, 80, 12, 20, 88
S2, 75, 15, 25, 85
S3, 90, 8, 10, 92
S4, 70, 18, 30, 82
S5, 85, 10, 15, 90
S6, 78, 14, 22, 86`;

    // R 4.5.2 / sroc-tiny.R: Moses unweighted OLS of D = logit(Se) - logit(FPR)
    // on S = logit(Se) + logit(FPR).
    const expected = {
      alpha: 5.965318230251,
      beta:  4.912027004731,
      k:     6,
    };
    const TOL = 1e-6;
    // JS rounds alpha/beta to 8 decimals at export; honour that.
    const ROUNDED_TOL = 1e-7;

    await page.goto(DTA_URL);
    await waitForAlm(page);
    await page.evaluate((csv) => {
      const ta = document.getElementById('f-data');
      ta.value = csv;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // The render() function reads from the textarea on every change;
      // an explicit programmatic call is the most reliable trigger.
      if (typeof render === 'function') render();
    }, csvText);

    await page.waitForFunction(() => {
      const r = window.__almResults && window.__almResults();
      return r && r.alpha !== null && r.beta !== null;
    }, { timeout: 5_000 });

    const r = await page.evaluate(() => window.__almResults());

    expect(r.k, 'k mismatch').toBe(expected.k);
    expect(Math.abs(r.alpha - expected.alpha),
      `Moses alpha: ${r.alpha} vs R=${expected.alpha}`).toBeLessThan(ROUNDED_TOL);
    expect(Math.abs(r.beta - expected.beta),
      `Moses beta: ${r.beta} vs R=${expected.beta}`).toBeLessThan(ROUNDED_TOL);
  });

});
