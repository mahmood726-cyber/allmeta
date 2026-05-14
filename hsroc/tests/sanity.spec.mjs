/**
 * hsroc retrofit sanity spec — Cycle 2.7 Task 3 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\hsroc\tests\sanity.spec.mjs .\hsroc-sanity.spec.mjs
 *   npx playwright test hsroc-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * Modules wired in this cycle: csv-upload, chart-download, axis-controls,
 * results-export, url-state, reset-undo, tooltips (7 total).
 *
 * HSROC-specific notes:
 *   - The SROC chart renders inside #sroc-host (an SVG via drawSROC())
 *   - T4 checks that the SVG still renders inside #sroc-host after retrofit
 *   - T5 checks hsroc-results-v1 schema with mu_se, mu_fpr, rho fields
 *   - tooltips uses src: '../hub/shared/glossary.json'
 *   - Parameterisation: logit(FPR) — matches mada::reitsma
 */
import { test, expect } from '@playwright/test';

const HSROC_URL = 'http://localhost:8088/hsroc/';

/**
 * Wait until all 7 alm modules have registered on window.alm.
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

/** Wait until the SROC SVG has been rendered into #sroc-host */
async function waitForSvg(page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('sroc-host');
    return host && host.querySelector('svg') !== null;
  }, { timeout: 10_000 });
}

test.describe('hsroc retrofit sanity', () => {

  // T1 — page loads without throwing console errors
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-benign CSP frame-ancestors informational messages
        if (text.includes('frame-ancestors') && text.includes('Content Security Policy')) return;
        errors.push(text);
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await waitForSvg(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 7 wired alm.* modules expose their init function
  test('all 7 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(HSROC_URL);
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

  // T3 — all 5 mount points initialise (tooltips + url-state have no mount divs)
  // CSS class per module: csv-upload → .alm-csv, axis-controls → .alm-axis,
  //   results-export → .alm-export, reset-undo → .alm-undo, chart-download → .alm-dl
  test('all 5 mount points have been initialised', async ({ page }) => {
    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await expect(page.locator('#alm-csv-mount .alm-csv')).toBeVisible();
    await expect(page.locator('#alm-axis-mount .alm-axis')).toBeVisible();
    await expect(page.locator('#alm-export-mount .alm-export')).toBeVisible();
    await expect(page.locator('#alm-undo-mount .alm-undo')).toBeVisible();
    await expect(page.locator('#alm-chart-mount .alm-dl')).toBeVisible();
  });

  // T4 — SROC SVG renders inside #sroc-host
  test('SROC SVG renders in #sroc-host after retrofit', async ({ page }) => {
    await page.goto(HSROC_URL);
    await waitForSvg(page);
    const svgCount = await page.locator('#sroc-host svg').count();
    expect(svgCount, 'Expected SVG inside #sroc-host').toBeGreaterThan(0);
    // Verify HSROC curve polyline is present
    const polylineCount = await page.locator('#sroc-host polyline').count();
    expect(polylineCount, 'Expected HSROC curve polyline in SVG').toBeGreaterThan(0);
  });

  // T5 — results-export JSON has hsroc-results-v1 schema and bivariate fields
  test('results-export JSON contains hsroc-results-v1 schema with bivariate stats', async ({ page }) => {
    await page.goto(HSROC_URL);
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

    expect(obj._schema, 'Missing or wrong _schema').toBe('hsroc-results-v1');
    expect(obj.k,       'k field missing').toBeGreaterThan(0);
    expect(obj.mu_se,   'mu_se (mean logit Se) missing').not.toBeNull();
    expect(obj.mu_fpr,  'mu_fpr (mean logit FPR) missing').not.toBeNull();
    expect(obj.rho,     'rho (correlation) missing').not.toBeNull();
    expect(obj.rows,    'rows array missing').toBeDefined();
    expect(Array.isArray(obj.rows), 'rows should be array').toBe(true);
    expect(obj.rows.length, 'Expected at least one study row').toBeGreaterThan(0);
    // Each row should have DTA counts and derived Se/Sp/FPR
    const row0 = obj.rows[0];
    expect(row0.TP,  'row.TP missing').toBeDefined();
    expect(row0.Se,  'row.Se missing').toBeDefined();
    expect(row0.FPR, 'row.FPR missing').toBeDefined();
  });

  // Cycle 7.18: real JS-engine R-parity (16th app).  hsroc's JS engine uses
  // a DL approximation while mada::reitsma uses full bivariate REML — they
  // diverge by construction on mu1/mu2/tau²/rho.  Per-study transforms
  // (Se, Sp, FPR, logitSe, logitFPR) are method-agnostic — pure deterministic
  // math on 2x2 cell counts — and must match exactly.
  test('JS engine per-study transforms vs deterministic math (hsroc-tiny)', async ({ page }) => {
    const csvText = `S1, 80, 40, 20, 160
S2, 95, 5, 5, 95
S3, 60, 30, 40, 170
S4, 88, 12, 12, 88
S5, 70, 50, 30, 150
S6, 92, 8, 8, 192
S7, 55, 45, 45, 155`;
    const fixtureCounts = [
      { study: 'S1', TP: 80, FP: 40, FN: 20, TN: 160 },
      { study: 'S2', TP: 95, FP:  5, FN:  5, TN:  95 },
      { study: 'S3', TP: 60, FP: 30, FN: 40, TN: 170 },
      { study: 'S4', TP: 88, FP: 12, FN: 12, TN:  88 },
      { study: 'S5', TP: 70, FP: 50, FN: 30, TN: 150 },
      { study: 'S6', TP: 92, FP:  8, FN:  8, TN: 192 },
      { study: 'S7', TP: 55, FP: 45, FN: 45, TN: 155 },
    ];
    // Method-agnostic reference: pure 2x2 transforms.
    const expected = fixtureCounts.map(r => {
      const Se  = r.TP / (r.TP + r.FN);
      const Sp  = r.TN / (r.FP + r.TN);
      const FPR = r.FP / (r.FP + r.TN);  // = 1 - Sp
      return {
        Se, Sp, FPR,
        logitSe:  Math.log(Se  / (1 - Se)),
        logitFPR: Math.log(FPR / (1 - FPR)),
      };
    });
    const TOL = 1e-6;  // JS exports rows rounded to 6 decimals.

    await page.goto(HSROC_URL);
    await waitForAlm(page);
    await page.evaluate((csv) => {
      const ta = document.getElementById('f-data');
      ta.value = csv;
      if (typeof render === 'function') render();
    }, csvText);
    await page.waitForFunction(() => {
      const r = window.__almResults && window.__almResults();
      return r && r.rows && r.rows.length === 7;
    }, { timeout: 5_000 });
    const r = await page.evaluate(() => window.__almResults());

    expect(r.k, 'k mismatch').toBe(7);
    expect(r.rows.length, 'rows length').toBe(7);
    for (let i = 0; i < 7; i++) {
      const got = r.rows[i];
      const want = expected[i];
      expect(Math.abs(got.Se  - want.Se),
        `row[${i}].Se: ${got.Se} vs ${want.Se}`).toBeLessThan(TOL);
      expect(Math.abs(got.Sp  - want.Sp),
        `row[${i}].Sp: ${got.Sp} vs ${want.Sp}`).toBeLessThan(TOL);
      expect(Math.abs(got.FPR - want.FPR),
        `row[${i}].FPR: ${got.FPR} vs ${want.FPR}`).toBeLessThan(TOL);
      expect(Math.abs(got.logitSe  - want.logitSe),
        `row[${i}].logitSe: ${got.logitSe} vs ${want.logitSe}`).toBeLessThan(TOL);
      expect(Math.abs(got.logitFPR - want.logitFPR),
        `row[${i}].logitFPR: ${got.logitFPR} vs ${want.logitFPR}`).toBeLessThan(TOL);
    }
  });

});
