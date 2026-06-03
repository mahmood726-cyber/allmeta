/**
 * bma-tau-priors cross-tool bus producer/consumer spec (ma-studies-v1).
 *
 * bma-tau-priors works in (yi, vi) = (effect, VARIANCE), while the shared bus
 * stores (est, se). The app already READ the bus (se² → vi on load); this spec
 * covers the newly-added WRITE side and the round-trip:
 *   - "Save to bus" pushes {label, est:yi, se:sqrt(vi)} rows to localStorage
 *     key "ma-studies-v1" — a schema-valid envelope, one row per study.
 *   - se on the bus is sqrt(vi): saving then loading reproduces the original
 *     vi exactly (se² = vi), so a save→load round-trip is stable.
 *
 * Default fixture first study "Trial 1, -0.42, 0.012":
 *   est = -0.42, se = sqrt(0.012) = 0.1095445115.
 *
 * Run from hub/shared/tests/:  npx playwright test bma-tau-priors-bus.spec.mjs
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/bma-tau-priors/';

async function waitForBus(page) {
  await page.waitForFunction(
    () => window.MaStudies && typeof window.MaStudies.read === 'function',
    { timeout: 10_000 }
  );
}

async function readEnvelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ma-studies-v1');
    return raw ? JSON.parse(raw) : null;
  });
}

test.describe('bma-tau-priors ↔ ma-studies-v1 bus', () => {

  test('page exposes the bus helper and both load/save buttons', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await expect(page.locator('#btn-bus-load')).toBeVisible();
    await expect(page.locator('#btn-bus-save')).toBeVisible();
  });

  test('Save to bus writes a schema-valid envelope, one row per study, se = sqrt(vi)', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    await page.locator('#btn-bus-save').click();

    const env = await readEnvelope(page);
    expect(env, 'bus envelope missing after Save to bus').not.toBeNull();
    expect(env._schema).toBe('ma-studies-v1');
    expect(typeof env._savedAt).toBe('string');
    expect(env.studies.length, 'expected 5 rows for the 5-study fixture').toBe(5);

    const v = await page.evaluate((e) => window.MaStudies.validate(e), env);
    expect(v.ok, 'validator errors: ' + JSON.stringify(v.errors)).toBe(true);

    expect(env.studies.map(s => s.label)).toEqual(
      ['Trial 1', 'Trial 2', 'Trial 3', 'Trial 4', 'Trial 5']);

    // First study: est = yi = -0.42, se = sqrt(vi) = sqrt(0.012).
    expect(Math.abs(env.studies[0].est - (-0.42)), `est=${env.studies[0].est}`).toBeLessThan(1e-9);
    expect(Math.abs(env.studies[0].se - Math.sqrt(0.012)), `se=${env.studies[0].se}`).toBeLessThan(1e-9);
  });

  test('save → load round-trip reproduces the original vi (se² = vi)', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    await page.locator('#btn-bus-save').click();
    // Mutate the textarea, then reload from the bus — must restore the originals.
    await page.fill('#src', 'Junk, 9, 9');
    await page.locator('#btn-bus-load').click();

    const text = await page.inputValue('#src');
    const firstRow = text.trim().split('\n')[0].split(/\s*,\s*/);
    expect(firstRow[0]).toBe('Trial 1');
    expect(Math.abs(parseFloat(firstRow[1]) - (-0.42))).toBeLessThan(1e-9);
    // Loader writes label, est, se² (= vi) — so column 3 is the original variance.
    expect(Math.abs(parseFloat(firstRow[2]) - 0.012)).toBeLessThan(1e-9);
  });

  test('no console errors during the producer flow', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
      if (t.includes('ERR_CONNECTION_REFUSED')) return;
      errors.push(t);
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(URL);
    await waitForBus(page);
    await page.locator('#btn-bus-save').click();
    expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
  });

});
