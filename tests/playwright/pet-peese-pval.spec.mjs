/**
 * Regression: pet-peese PET/PEESE intercept p-values now use t(k-2) everywhere.
 * The displayed table used the normal CDF while the export used t — two different
 * p's for the same WLS-regression coefficient. They must now agree.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/pet-peese/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('pet-peese: table PET/PEESE p matches the t-based export', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-run');
  await page.waitForFunction(() => /PET intercept/.test(document.getElementById('res-body')?.textContent || ''), { timeout: 8000 });

  const r = await page.evaluate(() => {
    const cellP = (label) => {
      const tr = Array.from(document.querySelectorAll('#res-body tr')).find(t => t.textContent.includes(label));
      if (!tr) return null;
      const tds = tr.querySelectorAll('td');
      return parseFloat(tds[tds.length - 1].textContent);
    };
    const exp = (window.__almResults && window.__almResults()) || {};
    return {
      tablePetP: cellP('PET intercept'),
      tablePeeseP: cellP('PEESE intercept'),
      exportPetP: exp.pet_p,
      exportPeeseP: exp.peese_p,
    };
  });
  console.log('  pet-peese:', JSON.stringify(r));

  expect(r.tablePetP, 'PET p in table').not.toBeNull();
  expect(Number.isFinite(r.exportPetP), 'export pet_p present').toBe(true);
  // Table (now t-based, fmt-rounded) must match the full-precision t export.
  expect(Math.abs(r.tablePetP - r.exportPetP), 'PET p table==export (both t)').toBeLessThan(0.005);
  expect(Math.abs(r.tablePeeseP - r.exportPeeseP), 'PEESE p table==export (both t)').toBeLessThan(0.005);
  expect(errors, 'no console errors').toEqual([]);
});
