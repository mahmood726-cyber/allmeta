/**
 * component-nma-parity.spec.mjs — additive CNMA R-parity vs netmeta.
 *
 * The app is contrast-based additive component NMA (Welton 2009) with
 * "control" -> empty component set and generalized DerSimonian-Laird random
 * effects. Every expected number below is an R value, never a value captured
 * from this page:
 *   - cnma-oracle.json: netmeta::discomb(inactive = "control") on cnma-tiny
 *     (component-nma/tests/fixtures/cnma-oracle.R).
 *   - cnma-validation-oracle.json: R 4.6.0 / netmeta 3.7.0 reference values
 *     (netmeta:::prepare + netmeta:::nma_additive, the engine of
 *     netcomb/discomb) copied from the P19 component-nma validation archive,
 *     which checked 72,150 page values against R on 595 configurations.
 * Closed-form estimators: 1e-9 relative to max(1, |R|), as in that archive.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = '/component-nma/';
const fixture = name => JSON.parse(readFileSync(
  new URL(`../../../component-nma/tests/fixtures/${name}`, import.meta.url), 'utf-8'));
const O = fixture('cnma-oracle.json');
const V = fixture('cnma-validation-oracle.json');
const FIXTURE = [
  'a | control | -0.40 | 0.12', 'b | control | -0.30 | 0.15',
  'a+b | control | -0.65 | 0.13', 'a+c | control | -0.55 | 0.16',
  'c | control | -0.20 | 0.18', 'b+c | control | -0.45 | 0.14',
  'a+b+c | control | -0.80 | 0.20',
].join('\n');
const TOL = 1e-4;
const near9 = (got, want, what) => expect(
  Math.abs(got - want) / Math.max(1, Math.abs(want)), `${what}: js=${got} R=${want}`,
).toBeLessThanOrEqual(1e-9);

async function open(page) {
  await page.goto(APP_URL);
  await page.waitForFunction(
    () => typeof window.__almCnmaLoad === 'function' && typeof window.Toast !== 'undefined',
    { timeout: 10_000 });
}
async function fitCase(page, text) {
  await page.evaluate(() => document.querySelectorAll('.toast-item').forEach(t => t.remove()));
  await page.evaluate((t) => window.__almCnmaLoad(t), text);
  // JSON round trip: Playwright's own deserializer assigns keys, which would turn a
  // component literally named "__proto__" into a prototype instead of a key.
  return JSON.parse(await page.evaluate(() => JSON.stringify({
    result: window._almLastCnma(),
    toasts: Array.from(document.querySelectorAll('.toast-item'), t => t.textContent),
    comp: Array.from(document.querySelectorAll('#comp-body tr'),
      r => Array.from(r.querySelectorAll('td'), c => c.textContent)),
    comb: Array.from(document.querySelectorAll('#int-body tr'),
      r => Array.from(r.querySelectorAll('td'), c => c.textContent)),
    forest: document.getElementById('forest').innerHTML,
  })));
}
function expectFit(r, ref) {
  expect(r, 'fit result').toBeTruthy();
  expect(r.df, 'df').toBe(ref.df);
  near9(r.Q, ref.Q, 'Q');
  if (ref.tau2 === null) expect(r.tau2, 'tau2 not estimable (R: NA)').toBeNull();
  else near9(r.tau2, ref.tau2, 'tau2');
  expect(Object.keys(r.components).sort()).toEqual(Object.keys(ref.components).sort());
  for (const [name, o] of Object.entries(ref.components)) {
    near9(r.components[name].est, o.est, `component ${name} est`);
    near9(r.components[name].se, o.se, `component ${name} se`);
  }
  for (const [name, o] of Object.entries(ref.combinations)) {
    near9(r.combinations[name].est, o.est, `combination ${name} est`);
    near9(r.combinations[name].se, o.se, `combination ${name} se`);
  }
}

test.describe('component-nma', () => {
  test('loads, renders forest, no console errors', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window._almLastCnma === 'function',
      { timeout: 10_000 });
    await expect(page.locator('#forest')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('netmeta::discomb additive R-parity (cnma-tiny)', async ({ page }) => {
    await open(page);
    await page.evaluate((t) => window.__almCnmaLoad(t), FIXTURE);
    const r = await page.evaluate(() => window._almLastCnma());
    expect(r, 'engine state not exposed').toBeTruthy();

    const near = (g, e, n) =>
      expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

    // DL tau2 (consistent fixture -> 0), additive Q decomposition.
    near(r.tau2, O.tau2, 'tau2 (DL, additive)');
    near(r.Q, O.Q_additive, 'Q.additive');
    expect(r.df, 'df.additive').toBe(O.df_additive);

    // Component effects + SE vs discomb (closed-form additive WLS).
    let sum = 0;
    for (const [name, o] of Object.entries(O.components)) {
      expect(r.components[name], `missing component ${name}`).toBeTruthy();
      near(r.components[name].est, o.est, `component ${name} est`);
      near(r.components[name].se, o.se, `component ${name} se`);
      sum += o.est;
    }
    // Combination machinery: a+b+c effect == additive sum of components
    // (== discomb Comb[a+b+c] = -0.8297864).
    near(r.combinations['a+b+c'].est, sum, 'combination a+b+c (additive sum)');
    near(r.combinations['a+b+c'].est, -0.8297864, 'combination a+b+c vs discomb');
  });

  for (const name of ['heterogeneous', 'disconnected-identifiable']) {
    test(`R reference parity at 1e-9: ${name}`, async ({ page }) => {
      const ref = V.cases[name];
      await open(page);
      const got = await fitCase(page, ref.text);
      expectFit(got.result, ref);
      // Displayed component estimates are the R values at 3 decimals.
      expect(got.comp.length).toBe(Object.keys(ref.components).length);
      for (const row of got.comp) {
        expect(row[1], `display ${row[0]}`).toBe(ref.components[row[0]].est.toFixed(3));
      }
    });
  }

  test('saturated design: df 0 and tau2 not estimable, as in R', async ({ page }) => {
    const ref = V.cases.saturated;
    expect(ref.df).toBe(0);
    await open(page);
    expectFit((await fitCase(page, ref.text)).result, ref);
  });

  for (const name of ['singular', 'numeric-junk']) {
    test(`refusal clears results: ${name}`, async ({ page }) => {
      const ref = V.cases[name];
      expect(ref.status).toBe('refused');
      await open(page);
      await fitCase(page, FIXTURE); // a prior valid fit must not survive the refusal
      const got = await fitCase(page, ref.text);
      expect(got.result, 'stale result after refusal').toBeNull();
      expect(got.toasts).toContain(ref.reason);
      expect(got.comp).toEqual([]);
      expect(got.comb).toEqual([]);
      expect(got.forest).toBe('');
    });
  }

  test('labels are text, not markup (R component names)', async ({ page }) => {
    const ref = V.cases['html-label'];
    await open(page);
    const got = await fitCase(page, ref.text);
    expectFit(got.result, ref);
    expect(got.comp.map(r => r[0]).sort()).toEqual(Object.keys(ref.components).sort());
    expect(await page.locator('#forest text', { hasText: '<tag>&x' }).count()).toBeGreaterThan(0);
    expect(await page.locator('#forest tag').count(), 'label parsed as an element').toBe(0);
  });

  test('roundoff of an exact zero is displayed unsigned', async ({ page }) => {
    // Hamza2021 nefazodone@300: its only link to control is a contrast with
    // te = 0, so the effect is exactly zero. R returned +8.6e-16 (prints
    // 0.000); the page computed -9.0e-17 and displayed -0.000 before the fix.
    const z = V.signed_zero.exact_zero;
    await open(page);
    const shown = await page.evaluate(([a, b]) => [fmt(a), fmt(b), fmt(-0), fmt(-0.00047), fmt(-1.5)],
      [z.js_est_before_fix, z.r_est]);
    expect(shown[0]).toBe(z.r_est.toFixed(3));
    expect(shown[1]).toBe('0.000');
    expect(shown[2]).toBe('0.000');
    expect(shown[3], 'a genuine small negative keeps its sign').toBe('-0.000');
    expect(shown[4]).toBe('-1.500');
  });
});
