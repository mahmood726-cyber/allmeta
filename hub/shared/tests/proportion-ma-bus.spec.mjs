/**
 * proportion-ma cross-tool bus producer spec (ma-studies-v1).
 *
 * proportion-ma takes events/total counts and is a WRITE-only bus producer:
 * "Send to bus" pushes per-study {label, est, se} rows to localStorage key
 * "ma-studies-v1". It always emits LOGIT-scale proportions (metafor
 * escalc(measure="PLO")) — ln(p/(1-p)), var = 1/x + 1/(n-x) — regardless of
 * the on-screen display transform, so the bus payload is single-scale.
 *
 * Expected values independently derived (Python) from the default fixture's
 * first study (Study A: 12/150, not extreme):
 *   est = ln(0.08/0.92) = -2.442347,  se = sqrt(1/12 + 1/138) = 0.300965
 *
 * The default display transform is Freeman-Tukey, NOT logit — so a passing
 * logit assertion proves the bus exports the poolable scale independent of
 * the display choice.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test proportion-ma-bus.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/proportion-ma/';

async function waitForBus(page) {
  await page.waitForFunction(
    () => window.MaStudies && typeof window.MaStudies.read === 'function'
       && typeof window.__propMaBusStudies === 'function',
    { timeout: 10_000 }
  );
}

async function readEnvelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ma-studies-v1');
    return raw ? JSON.parse(raw) : null;
  });
}

test.describe('proportion-ma → ma-studies-v1 bus producer', () => {

  test('page exposes the bus helper and producer hook', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await expect(page.locator('#btn-bus-save')).toBeVisible();
    await expect(page.locator('#btn-verify-in-r')).toBeVisible();
  });

  test('Send to bus writes a schema-valid envelope, one row per study, on logit scale', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    // Default display transform is FT — bus must still export logit.
    await page.locator('#btn-bus-save').click();

    const env = await readEnvelope(page);
    expect(env, 'bus envelope missing after Send to bus').not.toBeNull();
    expect(env._schema).toBe('ma-studies-v1');
    expect(typeof env._savedAt).toBe('string');
    expect(env.studies.length, 'expected 7 rows for the 7-study fixture').toBe(7);

    const v = await page.evaluate((e) => window.MaStudies.validate(e), env);
    expect(v.ok, 'validator errors: ' + JSON.stringify(v.errors)).toBe(true);

    expect(env.studies.map(s => s.label)).toEqual(
      ['Study A', 'Study B', 'Study C', 'Study D', 'Study E', 'Study F', 'Study G']
    );

    // First study, LOGIT scale (not the raw proportion 0.08).
    expect(Math.abs(env.studies[0].est - (-2.442347)), `est=${env.studies[0].est}`).toBeLessThan(1e-5);
    expect(Math.abs(env.studies[0].se - 0.300965), `se=${env.studies[0].se}`).toBeLessThan(1e-5);
    // Sanity: a logit of a small proportion is clearly negative and far from 0.08.
    expect(env.studies[0].est).toBeLessThan(-1);
  });

  test('bus export stays logit even when display transform is switched to FT explicitly', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));
    await page.selectOption('#trans', 'ft');
    await page.locator('#btn-bus-save').click();
    const env = await readEnvelope(page);
    expect(env.studies[0].est, 'FT display must not change the logit bus export')
      .toBeCloseTo(-2.442347, 5);
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
