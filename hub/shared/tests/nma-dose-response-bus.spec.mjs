/**
 * nma-dose-response-app cross-tool bus reader spec (ma-comparisons-v1).
 *
 * "Load from bus" maps the shared arm-level network via
 * MaComparisons.toDoseResponse into the app's CSV format
 * (study,treatment,dose,effect,se), writes it to the data box, and triggers the
 * existing Parse CSV → analysis flow. The lowest-dose arm becomes the (dose,0)
 * reference anchor; other arms carry log-OR-vs-reference + SE.
 *
 * Expected (seed S1: control 20/100 @0, drugLo 30/100 @10, drugHi 45/100 @20, OR),
 * derived in Python:
 *   control → dose 0, effect 0, se "" (anchor)
 *   drugLo  → dose 10, effect 0.538997, se 0.331842
 *   drugHi  → dose 20, effect 1.185624, se 0.320787
 *
 * Run from hub/shared/tests/:
 *   npx playwright test nma-dose-response-bus.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/nma-dose-response-app/';

const SEED = {
  _schema: 'ma-comparisons-v1',
  effectMeasure: 'OR',
  studies: [
    { id: 'S1', arms: [
      { treatment: 'control', events: 20, n: 100, dose: 0 },
      { treatment: 'drugLo', events: 30, n: 100, dose: 10 },
      { treatment: 'drugHi', events: 45, n: 100, dose: 20 },
    ] },
  ],
};

async function ready(page) {
  await page.waitForFunction(
    () => window.MaComparisons && typeof window.MaComparisons.toDoseResponse === 'function'
       && document.getElementById('btn-bus-load') && document.getElementById('csvInput'),
    { timeout: 20_000 }
  );
  // The app auto-loads a sample on init (async, after a heavy WASM load). Wait
  // for that to settle so our subsequent bus import is the last write to #csvInput.
  await page.waitForFunction(
    () => document.getElementById('csvInput').value.trim().length > 0,
    { timeout: 20_000 }
  );
}

test.describe('nma-dose-response-app ← ma-comparisons-v1 reader', () => {
  // Heavy WASM-backed app: give init + analysis generous headroom under load.
  test.describe.configure({ timeout: 60_000 });

  // The app shows several full-screen onboarding overlays (setup wizard,
  // quick-start guide, tutorial) that would intercept clicks. Pre-set every
  // "completed/dismissed" flag so none appear during the test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('nma_wizard_completed', 'true');
        localStorage.setItem('nma_tutorial_completed', 'true');
        localStorage.setItem('nma-quickstart-dismissed', 'true');
      } catch (_) { /* ignore */ }
    });
  });

  test('Load from bus writes the dose-response CSV and parses it', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
    expect(wrote).toBe(true);

    await page.locator('#btn-bus-load').click();

    // Wait for our import to land in the box (absorbs init-time async writes).
    await page.waitForFunction(() => {
      const v = document.getElementById('csvInput').value.trim();
      return v.split('\n').length === 4 && v.includes('drugHi');
    }, { timeout: 20_000 });

    const text = await page.inputValue('#csvInput');
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('study,treatment,dose,effect,se'); // header
    expect(lines.length).toBe(4); // header + 3 arms

    const byT = {};
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(',');
      byT[p[1]] = { dose: parseFloat(p[2]), effect: parseFloat(p[3]), seRaw: p[4] };
    }
    // Reference anchor: lowest dose, effect 0, empty SE.
    expect(byT['control'].dose).toBe(0);
    expect(byT['control'].effect).toBe(0);
    expect(byT['control'].seRaw).toBe('');
    // Dose arms: log-OR vs reference.
    expect(byT['drugLo'].dose).toBe(10);
    expect(byT['drugLo'].effect).toBeCloseTo(0.538997, 5);
    expect(byT['drugHi'].dose).toBe(20);
    expect(byT['drugHi'].effect).toBeCloseTo(1.185624, 5);
  });

  test('dose-less bus yields no dose-response rows (no-op)', async ({ page }) => {
    // The app auto-loads a sample on init, so assert the no-op at the helper
    // level (deterministic) rather than racing the DOM.
    await page.goto(URL);
    await ready(page);
    const rows = await page.evaluate(() => window.MaComparisons.toDoseResponse({
      _schema: 'ma-comparisons-v1', effectMeasure: 'OR',
      studies: [{ id: 'X', arms: [
        { treatment: 'a', events: 10, n: 100 },   // no dose on the arms
        { treatment: 'b', events: 20, n: 100 },
      ] }],
    }));
    expect(rows).toEqual([]);
  });

  test('import flow raises no uncaught JS errors', async ({ page }) => {
    // NB: this app has a pre-existing, benign init-time 404 on app.wasm (it
    // falls back to an embedded base64 module), so resource-load failures are
    // filtered. We still assert zero uncaught JS exceptions (pageerror) and
    // zero non-resource console errors from the import path.
    const errors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
      if (t.includes('ERR_CONNECTION_REFUSED')) return;
      if (t.includes('Failed to load resource')) return; // pre-existing app.wasm 404 (base64 fallback)
      errors.push(t);
    });
    page.on('pageerror', err => errors.push('pageerror: ' + err.message));
    await page.goto(URL);
    await ready(page);
    await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
    await page.locator('#btn-bus-load').click();
    await page.waitForFunction(
      () => document.getElementById('csvInput').value.includes('drugHi'),
      { timeout: 20_000 }
    );
    expect(errors, 'unexpected errors: ' + errors.join('; ')).toEqual([]);
  });

});
