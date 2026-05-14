/**
 * Sanity tests for hub/shared/stats-helpers.js.
 *
 * Loads the module in a blank page that has just <script src="stats-helpers.js">
 * and asserts: Z constants are exact qnorm values; pnorm matches R within 7e-8
 * across a representative grid; qnorm is the inverse of pnorm to within
 * Beasley-Springer-Moro precision.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(__dirname, '../stats-helpers.js');

/** Load the module into a blank chromium page via inline <script>. */
async function loadInBlank(page) {
  const src = readFileSync(MODULE_PATH, 'utf-8');
  await page.setContent(`<!doctype html><meta charset="utf-8"><script>${src}</script>`);
  await page.waitForFunction(() => window.alm && window.alm.stats && typeof window.alm.stats.pnorm === 'function');
}

test.describe('hub/shared/stats-helpers', () => {

  test('Z constants are exact qnorm values', async ({ page }) => {
    await loadInBlank(page);
    const Z = await page.evaluate(() => window.alm.stats.Z);
    // Verified against R 4.5.2:  qnorm(0.975) etc.
    expect(Z.Z975).toBeCloseTo(1.959963984540054, 14);
    expect(Z.Z995).toBeCloseTo(2.5758293035489004, 14);
    expect(Z.Z90).toBeCloseTo(1.6448536269514722, 14);
    expect(Z.Z99).toBeCloseTo(2.3263478740408408, 14);
    expect(Z.Z80).toBeCloseTo(0.8416212335729143, 14);
  });

  test('pnorm matches R within 7e-8 across a grid', async ({ page }) => {
    await loadInBlank(page);
    // R 4.5.2 reference: pnorm(c(-3, -2, -1, -0.5, 0, 0.5, 1, 1.96, 2, 3))
    const ref = {
      '-3':   0.00134989803163,
      '-2':   0.02275013194818,
      '-1':   0.15865525393146,
      '-0.5': 0.30853753872599,
       '0':   0.5,
       '0.5': 0.69146246127401,
       '1':   0.84134474606854,
       '1.96': 0.97500210485178,
       '2':   0.97724986805182,
       '3':   0.99865010196837,
    };
    const xs = Object.keys(ref).map(parseFloat);
    const got = await page.evaluate((xs) => xs.map(x => window.alm.stats.pnorm(x)), xs);
    const TOL = 7.5e-8;  // A&S 7.1.26 max abs error
    Object.entries(ref).forEach(([xs, rVal], i) => {
      const diff = Math.abs(got[i] - rVal);
      expect(diff, `pnorm(${xs}): got=${got[i]} r=${rVal} diff=${diff}`).toBeLessThan(TOL);
    });
  });

  test('qnorm is the inverse of pnorm to within BSM precision', async ({ page }) => {
    await loadInBlank(page);
    // Test grid in p-space, round-trip through qnorm then pnorm
    const ps = [0.001, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.975, 0.995, 0.999];
    const result = await page.evaluate((ps) => {
      const s = window.alm.stats;
      return ps.map(p => ({ p, z: s.qnorm(p), pBack: s.pnorm(s.qnorm(p)) }));
    }, ps);
    // BSM accuracy is ~1.15e-9 in z; pnorm A&S adds ~7.5e-8.  Allow 2e-7 in p.
    const TOL = 2e-7;
    for (const { p, z, pBack } of result) {
      expect(Math.abs(pBack - p), `qnorm/pnorm round-trip at p=${p}: z=${z} pBack=${pBack}`).toBeLessThan(TOL);
    }
  });

  test('qnorm matches the canonical Z constants', async ({ page }) => {
    await loadInBlank(page);
    const result = await page.evaluate(() => {
      const s = window.alm.stats;
      return {
        z90:  s.qnorm(0.95),
        z975: s.qnorm(0.975),
        z995: s.qnorm(0.995),
      };
    });
    // BSM Beasley-Springer-Moro real-world abs error around the central
    // region is ~1e-8 (the 1.15e-9 figure in some refs is for ULP, not the
    // polynomial residual). Allow 5e-8.
    expect(Math.abs(result.z90  - 1.6448536269514722)).toBeLessThan(5e-8);
    expect(Math.abs(result.z975 - 1.959963984540054)).toBeLessThan(5e-8);
    expect(Math.abs(result.z995 - 2.5758293035489004)).toBeLessThan(5e-8);
  });

  test('pTwoSided gives expected p-values for canonical z', async ({ page }) => {
    await loadInBlank(page);
    const result = await page.evaluate(() => {
      const s = window.alm.stats;
      return { p_z196: s.pTwoSided(1.96), p_z0: s.pTwoSided(0), p_z3: s.pTwoSided(3) };
    });
    // pTwoSided(1.96) ≈ 0.05 (the canonical 95% boundary)
    expect(Math.abs(result.p_z196 - 0.05)).toBeLessThan(1e-3);
    // A&S 7.1.26 has ~5e-10 residual at z=0 even though analytically exact;
    // accept 5e-8 to leave headroom.
    expect(Math.abs(result.p_z0 - 1.0)).toBeLessThan(5e-8);
    expect(Math.abs(result.p_z3 - 0.0027)).toBeLessThan(1e-3);
  });

  test('module is idempotent (safe to load twice)', async ({ page }) => {
    await loadInBlank(page);
    const src = readFileSync(MODULE_PATH, 'utf-8');
    // Load again — should not throw, should not reset
    const ok = await page.evaluate((src) => {
      const before = window.alm.stats;
      const s = document.createElement('script');
      s.textContent = src;
      document.head.appendChild(s);
      return window.alm.stats === before;  // same object reference
    }, src);
    expect(ok, 'Second load mutated window.alm.stats — module not idempotent').toBe(true);
  });

});
