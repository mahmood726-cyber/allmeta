/** Smoke: hsroc loads the example, pools, renders the (relabeled) ρ chip, no errors. */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/hsroc/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('hsroc runs the example and shows the empirical-rho chip', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-example');
  await page.click('#btn-run');
  await page.waitForFunction(() => /ρ \(empirical\)/.test(document.body.textContent || ''), { timeout: 8000 });

  const chip = await page.evaluate(() => {
    const k = Array.from(document.querySelectorAll('.stat .k')).find(e => /empirical/.test(e.textContent));
    return { label: k ? k.textContent.trim() : null, value: k ? k.nextElementSibling?.textContent?.trim() : null };
  });
  console.log('  rho chip:', JSON.stringify(chip));
  expect(chip.label).toBe('ρ (empirical)');
  expect(chip.value).toMatch(/-?\d/);  // a numeric rho rendered
  expect(errors, 'no console/page errors:\n' + errors.join('\n')).toEqual([]);
});
