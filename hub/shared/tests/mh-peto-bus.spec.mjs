/**
 * mh-peto cross-tool bus producer spec (ma-studies-v1).
 *
 * mh-peto takes 2x2 cell counts and is a WRITE-only bus producer: clicking
 * "Send to bus" must push per-study {label, est, se} rows to localStorage
 * key "ma-studies-v1", on the contract scale (log for OR/RR, identity for RD).
 *
 * Verifies the two things that matter for cross-tool correctness:
 *   1. The envelope is schema-valid and has one row per input study.
 *   2. The scale is right — OR rows are LOG-scale (not the raw ratio), RD rows
 *      are identity-scale. This is the contract that lets forest-plot / funnel
 *      / influence pool the data without double-logging or mis-scaling.
 *
 * Expected values independently derived (Python) from the default fixture's
 * first study (StudyA: 3/500 vs 8/500, no zero cells):
 *   OR: est = ln((3*492)/(497*8)) = -0.990941, se = sqrt(1/3+1/497+1/8+1/492) = 0.679984
 *   RD: est = 3/500 - 8/500 = -0.01,           se = sqrt(.006*.994/500 + .016*.984/500) = 0.00658908
 *
 * Run from hub/shared/tests/:
 *   npx playwright test mh-peto-bus.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/mh-peto/';
const TOL = 1e-6;

async function waitForBus(page) {
  await page.waitForFunction(
    () => window.MaStudies && typeof window.MaStudies.read === 'function'
       && typeof window.__mhPetoBusStudies === 'function',
    { timeout: 10_000 }
  );
}

/** Read + parse the bus envelope straight from localStorage. */
async function readEnvelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ma-studies-v1');
    return raw ? JSON.parse(raw) : null;
  });
}

test.describe('mh-peto → ma-studies-v1 bus producer', () => {

  test('page exposes the bus helper and producer hook', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await expect(page.locator('#btn-bus-save')).toBeVisible();
    await expect(page.locator('#btn-verify-in-r')).toBeVisible();
  });

  test('Send to bus writes a schema-valid envelope, one row per study, OR on log scale', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    // Default measure is OR; click Send to bus.
    await page.locator('#btn-bus-save').click();

    const env = await readEnvelope(page);
    expect(env, 'bus envelope missing after Send to bus').not.toBeNull();
    expect(env._schema).toBe('ma-studies-v1');
    expect(typeof env._savedAt).toBe('string');
    expect(env.studies.length, 'expected 5 rows for the 5-study fixture').toBe(5);

    // Envelope must pass the canonical validator.
    const v = await page.evaluate((e) => window.MaStudies.validate(e), env);
    expect(v.ok, 'validator errors: ' + JSON.stringify(v.errors)).toBe(true);

    // Labels carried through.
    expect(env.studies.map(s => s.label)).toEqual(['StudyA', 'StudyB', 'StudyC', 'StudyD', 'StudyE']);

    // First study, OR on LOG scale (not the raw ratio ~0.371).
    expect(Math.abs(env.studies[0].est - (-0.990941)), `est=${env.studies[0].est}`).toBeLessThan(1e-4);
    expect(Math.abs(env.studies[0].se - 0.679984), `se=${env.studies[0].se}`).toBeLessThan(1e-4);
    // Sanity: a log-OR is small; the raw ratio would be ~0.37 (positive, < 1).
    expect(env.studies[0].est).toBeLessThan(0);
  });

  test('RD measure writes identity-scale rows (not logged)', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    await page.selectOption('#measure', 'RD');
    await page.locator('#btn-bus-save').click();

    const env = await readEnvelope(page);
    expect(env, 'bus envelope missing for RD').not.toBeNull();
    expect(env.studies.length).toBe(5);
    // RD is linear: est = 3/500 - 8/500 = -0.01, se = 0.00658908.
    expect(Math.abs(env.studies[0].est - (-0.01)), `est=${env.studies[0].est}`).toBeLessThan(TOL);
    expect(Math.abs(env.studies[0].se - 0.00658908), `se=${env.studies[0].se}`).toBeLessThan(1e-6);
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
