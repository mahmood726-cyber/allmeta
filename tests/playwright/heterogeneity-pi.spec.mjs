/**
 * Regression for the heterogeneity prediction-interval fix: now uses t_{k-1}
 * (Cochrane Handbook v6.5), defined for k>=2, instead of the superseded t_{k-2}
 * (which was ~3x too wide at k=3). Smoke: example renders a numeric PI that is
 * wider than the pooled CI (PI must contain the CI), no console errors.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/heterogeneity/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('heterogeneity: prediction interval renders (t_{k-1}) and contains the pooled CI', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-example');
  await page.waitForFunction(() => /95% PI/.test(document.body.textContent || ''), { timeout: 8000 });

  const r = await page.evaluate(() => {
    const cardVal = (label) => {
      const el = Array.from(document.querySelectorAll('*')).find(n =>
        n.children.length <= 3 && n.textContent.trim().startsWith(label) && /\[/.test(n.textContent));
      return el ? el.textContent : '';
    };
    const nums = (s) => (s.match(/-?\d+\.?\d+/g) || []).map(Number);
    const piN = nums(cardVal('95% PI'));            // [lo, hi]
    const ciN = nums(cardVal('RE pooled (z)'));     // mu, lo, hi
    return { piText: cardVal('95% PI'), pi: piN.slice(-2), ci: ciN.slice(-2) };
  });
  console.log('  heterogeneity:', JSON.stringify(r));

  expect(r.piText, 'PI is numeric, not undefined').not.toMatch(/undefined/);
  expect(r.pi.length, 'PI has two bounds').toBe(2);
  expect(Number.isFinite(r.pi[0]) && Number.isFinite(r.pi[1])).toBe(true);
  // PI must be wider than (contain) the pooled CI.
  const piW = r.pi[1] - r.pi[0], ciW = r.ci[1] - r.ci[0];
  expect(piW, 'PI wider than CI').toBeGreaterThan(ciW);
  expect(errors, 'no console errors').toEqual([]);
});
