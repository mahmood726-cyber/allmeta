/**
 * Regression for the p-curve p-uniform sign bug: the conditional-CDF transform is
 * decreasing in delta, so the damped update must use (mean-0.5), not (0.5-mean).
 * The old sign diverged to a large NEGATIVE delta for clearly right-skewed data.
 * Also checks the (now right-skewed) default demo shows evidential value.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/p-curve/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('p-curve: p-uniform delta is sensible (>0) and default shows evidential value', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-run');
  await page.waitForFunction(() => (document.getElementById('pu-body')?.textContent || '').includes('effect estimate'), { timeout: 8000 });

  const r = await page.evaluate(() => {
    const puText = document.getElementById('pu-body').textContent;
    const m = puText.match(/effect estimate[^]*?(-?\d+\.?\d*)/);
    const delta = m ? parseFloat(m[1]) : null;
    const firstChip = document.querySelector('#tests-body .chip');
    return {
      delta,
      skewChipClass: firstChip ? firstChip.className : '',
      skewChipText: firstChip ? firstChip.textContent.trim() : '',
    };
  });
  console.log('  p-curve:', JSON.stringify(r));

  // delta must be finite, positive (right-skewed default), and not the divergent ~-5.
  expect(r.delta, 'delta finite').not.toBeNull();
  expect(Number.isFinite(r.delta)).toBe(true);
  expect(r.delta, 'delta positive for right-skewed data').toBeGreaterThan(0);
  expect(r.delta, 'delta not divergent').toBeGreaterThan(-9.9);
  // Right-skew test should now read "evidential value" on the demo data.
  expect(r.skewChipClass).toContain('ok');
  expect(r.skewChipText.toLowerCase()).toContain('evidential value');
  expect(r.skewChipText.toLowerCase()).not.toContain('no evidential');

  expect(errors, 'no console errors').toEqual([]);
});
