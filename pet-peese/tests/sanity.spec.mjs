/**
 * pet-peese retrofit sanity spec — Cycle 2.2 Task 2 do-no-harm gate.
 *
 * Run from hub/shared/tests/ (copy this file there so playwright.config.mjs
 * picks it up; the webserver starts at port 8088 serving the allmeta root):
 *
 *   cd C:\Projects\allmeta\hub\shared\tests
 *   copy ..\..\pet-peese\tests\sanity.spec.mjs .\pet-peese-sanity.spec.mjs
 *   npx playwright test pet-peese-sanity.spec.mjs --reporter=list
 *
 * NOTE: Do NOT use waitForLoadState('networkidle') — python http.server keeps
 * connections alive and networkidle never fires. Use waitForFunction instead.
 *
 * PET-PEESE differences from other sanity specs:
 *   - 6 wired modules (csvUpload, axisControls, resultsExport, urlState,
 *     resetUndo, tooltips)
 *   - The funnel SVG renders in #funnel (inline SVG, not #svg-host)
 *   - T4 checks the native #funnel SVG still renders (chart-download present-good)
 *   - T5 checks pet-peese-results-v1 schema with pet_b0 / peese_b0 keys
 *   - waitForAlm includes alm.tooltips
 */
import { test, expect } from '@playwright/test';

const PETPEESE_URL = 'http://localhost:8088/pet-peese/';

/**
 * Wait until all 6 alm modules have registered on window.alm.
 * PET-PEESE wires: csvUpload, axisControls, resultsExport, urlState,
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

/** Wait until the native funnel SVG has been rendered into #funnel */
async function waitForFunnel(page) {
  await page.waitForFunction(() => {
    const svg = document.getElementById('funnel');
    return svg && svg.children.length > 0;
  }, { timeout: 10_000 });
}

test.describe('pet-peese retrofit sanity', () => {

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
    await page.goto(PETPEESE_URL);
    await waitForAlm(page);
    await waitForFunnel(page);
    expect(errors, 'Unexpected console errors: ' + errors.join('; ')).toEqual([]);
  });

  // T2 — all 6 wired alm.* modules expose their init function
  test('all 6 wired alm.* modules expose their init function', async ({ page }) => {
    await page.goto(PETPEESE_URL);
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
    await page.goto(PETPEESE_URL);
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

  // T4 — pre-retrofit feature: native #funnel SVG still renders (chart-download present-good intact)
  test('existing funnel SVG still renders', async ({ page }) => {
    await page.goto(PETPEESE_URL);
    await waitForFunnel(page);
    const lineCount = await page.locator('#funnel line').count();
    expect(lineCount, 'SVG appears to have no drawn lines — funnel/regression lines may be missing').toBeGreaterThan(0);
    // PET-PEESE draws circles for observed studies
    const circleCount = await page.locator('#funnel circle').count();
    expect(circleCount, 'SVG appears to have no circles — study points may be missing').toBeGreaterThan(0);
  });

  // T5 — results-export JSON contains real PET-PEESE values (not just form state)
  //
  // Checks __almResults() output via the results-export module's JSON button.
  // The JSON schema should be 'pet-peese-results-v1' and must include computed
  // PET intercept and PEESE intercept fields.
  test('results-export JSON download contains real PET-PEESE values', async ({ page }) => {
    await page.goto(PETPEESE_URL);
    await waitForAlm(page);
    await waitForFunnel(page);
    // Give the engine one extra tick to propagate _almLastPET via the run()
    // call that fires on DOMContentLoaded (example data is loaded automatically).
    await page.waitForFunction(() =>
      window._almLastPET && window._almLastPET() !== null,
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

    // Must have the pet-peese results schema marker
    expect(obj._schema, 'Missing or wrong _schema field').toBe('pet-peese-results-v1');
    // Must have at least one study (example data has 10 studies)
    expect(obj.k, 'k (study count) should be > 0').toBeGreaterThan(0);
    // Must contain PET intercept (proves the engine ran)
    expect(obj.pet_b0,    'pet_b0 missing — PET regression not wired').toBeDefined();
    expect(obj.pet_se_b0, 'pet_se_b0 missing').toBeDefined();
    expect(obj.pet_p,     'pet_p missing').toBeDefined();
    // Must contain PEESE intercept
    expect(obj.peese_b0,    'peese_b0 missing — PEESE regression not wired').toBeDefined();
    expect(obj.peese_se_b0, 'peese_se_b0 missing').toBeDefined();
  });

});
