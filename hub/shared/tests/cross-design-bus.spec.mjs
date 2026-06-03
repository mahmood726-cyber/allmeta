/**
 * cross-design cross-tool bus producer/consumer spec (ma-studies-v1).
 *
 * cross-design works in (yi, vi) = (effect, VARIANCE) plus a design tag
 * (rct | obs); the bus stores (est, se) plus a free-form `group`. The wiring:
 *   - "Save to bus" writes {label, est:yi, se:sqrt(vi), group:design}.
 *   - "Load from bus" maps group→design (starts-with "obs" → obs, else rct —
 *     the anchor) and se² → vi.
 *   - A save→load round-trip reproduces yi, vi AND the design tag.
 *
 * Default fixture first study "RCT 1, -0.35, 0.020, rct":
 *   est = -0.35, se = sqrt(0.020) = 0.1414213562, group = "rct".
 *
 * Run from hub/shared/tests/:  npx playwright test cross-design-bus.spec.mjs
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/cross-design/';

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

test.describe('cross-design ↔ ma-studies-v1 bus', () => {

  test('page exposes the bus helper and both load/save buttons', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await expect(page.locator('#btn-bus-load')).toBeVisible();
    await expect(page.locator('#btn-bus-save')).toBeVisible();
  });

  test('Save writes a schema-valid envelope: one row per study, se=sqrt(vi), design→group', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    await page.locator('#btn-bus-save').click();

    const env = await readEnvelope(page);
    expect(env, 'bus envelope missing after Save to bus').not.toBeNull();
    expect(env._schema).toBe('ma-studies-v1');
    expect(env.studies.length, 'expected 9 rows for the default fixture').toBe(9);

    const v = await page.evaluate((e) => window.MaStudies.validate(e), env);
    expect(v.ok, 'validator errors: ' + JSON.stringify(v.errors)).toBe(true);

    // First study: est=-0.35, se=sqrt(0.020), group carries the design tag.
    expect(Math.abs(env.studies[0].est - (-0.35)), `est=${env.studies[0].est}`).toBeLessThan(1e-9);
    expect(Math.abs(env.studies[0].se - Math.sqrt(0.020)), `se=${env.studies[0].se}`).toBeLessThan(1e-9);
    expect(env.studies[0].group).toBe('rct');
    // The obs studies carry group="obs".
    expect(env.studies.some(s => s.group === 'obs')).toBe(true);
    expect(env.studies.filter(s => s.group === 'rct').length).toBe(5);
    expect(env.studies.filter(s => s.group === 'obs').length).toBe(4);
  });

  test('save → load round-trip reproduces vi and the design tag', async ({ page }) => {
    await page.goto(URL);
    await waitForBus(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));

    await page.locator('#btn-bus-save').click();
    await page.fill('#src', 'Junk, 9, 9, rct');
    await page.locator('#btn-bus-load').click();

    const text = await page.inputValue('#src');
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(9);
    const first = lines[0].split(/\s*,\s*/);
    expect(first[0]).toBe('RCT 1');
    expect(Math.abs(parseFloat(first[1]) - (-0.35))).toBeLessThan(1e-9);
    expect(Math.abs(parseFloat(first[2]) - 0.020)).toBeLessThan(1e-9); // se² = vi
    expect(first[3]).toBe('rct');
    // An obs row survives the round-trip as obs.
    const obs = lines.map(l => l.split(/\s*,\s*/)).find(p => p[0].startsWith('Obs'));
    expect(obs[3]).toBe('obs');
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
