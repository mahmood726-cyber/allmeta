/** Verifies bayesian-nma SUCRA/rank output is now reproducible (seeded sampler). */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/bayesian-nma/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('bayesian-nma SUCRA is identical across repeated runs (seeded)', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });

  const runOnce = async () => {
    await page.click('#btn-run');
    await page.waitForFunction(() => {
      const el = document.getElementById('sucra');
      return el && /\d/.test(el.textContent || '');
    }, { timeout: 15000 });
    // small settle
    await page.waitForTimeout(200);
    return page.evaluate(() => document.getElementById('sucra').textContent.replace(/\s+/g, ' ').trim());
  };

  const a = await runOnce();
  const b = await runOnce();
  console.log('  run1:', a.slice(0, 120));
  console.log('  run2:', b.slice(0, 120));
  expect(a.length, 'SUCRA rendered').toBeGreaterThan(0);
  expect(a, 'two runs produce identical SUCRA').toBe(b);
  expect(errors, 'no console/page errors').toEqual([]);
});
