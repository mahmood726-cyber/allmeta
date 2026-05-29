/**
 * R-parity regression for p-curve's right-skew Fisher test p-value. The χ² tail
 * was a Wilson-Hilferty approximation (off by up to ~1.4% relatively at the small
 * df = 2·k_sig typical of a p-curve) — replaced with the exact regularised lower
 * incomplete gamma. Ground truth from R:
 *
 *   T <- -2*sum(log(p/0.05)); 1 - pchisq(T, 2*length(p))
 *
 * The k=5 case lands at p≈0.0562, just over the 0.05 line — exactly where the old
 * approximation's tail error could flip the conclusion. Tolerance 1e-5 (exact code
 * matches R to ~1e-12; Wilson-Hilferty would miss by ~3e-4 here).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/p-curve/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const CASES = [
  { name: 'k=3', ps: [0.01, 0.02, 0.005], T: 9.656627, df: 6, fisher_p: 0.13987696 },
  { name: 'k=5 (borderline ~0.056)', ps: [0.001, 0.01, 0.02, 0.04, 0.005], T: 17.926961, df: 10, fisher_p: 0.05620828 },
];

for (const c of CASES) {
  test(`p-curve Fisher p matches R pchisq (exact χ²) — ${c.name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(URL, { waitUntil: 'load' });
    const r = await page.evaluate((cc) => {
      window.__almLoad(cc.ps.map(p => ({ p })));
      return window.__almResults();
    }, c);
    console.log('  ', c.name, JSON.stringify(r));

    expect(r.k).toBe(c.ps.length);
    expect(r.fisher_df).toBe(c.df);
    expect(r.fisher_chisq).toBeCloseTo(c.T, 4);
    expect(r.fisher_p).toBeCloseTo(c.fisher_p, 5);
    expect(errors, 'no console errors').toEqual([]);
  });
}
