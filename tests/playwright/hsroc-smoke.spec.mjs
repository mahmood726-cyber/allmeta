/** Smoke + numeric consistency: hsroc example pools, renders ρ/DOR/LR/AUC, no errors. */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/hsroc/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('hsroc runs example; rho/DOR/LR/AUC render and are internally consistent', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-example');
  await page.click('#btn-run');
  await page.waitForFunction(() => /ρ \(empirical\)/.test(document.body.textContent || ''), { timeout: 8000 });

  const r = await page.evaluate(() => {
    const chip = (label) => {
      const k = Array.from(document.querySelectorAll('.stat .k')).find(e => e.textContent.trim().startsWith(label));
      return k ? k.nextElementSibling.textContent.trim() : null;
    };
    const num = (s) => s == null ? null : parseFloat(String(s).replace('%', ''));
    const bodyHas = (t) => (document.body.textContent || '').includes(t);
    return {
      rho: chip('ρ'),
      seePct: num(chip('Pooled Se')),
      spPct: num(chip('Pooled Sp')),
      dor: num(chip('DOR')),
      auc: num(chip('SROC AUC')),
      hasLRpos: bodyHas('Positive LR (LR+)'),
      hasLRneg: bodyHas('Negative LR (LR-)'),
    };
  });
  console.log('  hsroc:', JSON.stringify(r));

  expect(r.hasLRpos && r.hasLRneg, 'LR+ and LR- rows present').toBe(true);
  expect(r.dor, 'DOR rendered').toBeGreaterThan(0);
  // SROC AUC must now be a proper diagnostic area (corrected symmetric slope).
  expect(r.auc, 'AUC rendered').not.toBeNull();
  expect(r.auc, 'AUC in (0.5, 1]').toBeGreaterThan(0.5);
  expect(r.auc).toBeLessThanOrEqual(1.0);
  // DOR must equal (Se*Sp)/((1-Se)(1-Sp)) from the displayed pooled Se/Sp (exact by construction).
  const Se = r.seePct / 100, Sp = r.spPct / 100;
  const dorExpected = (Se * Sp) / ((1 - Se) * (1 - Sp));
  console.log(`  DOR displayed=${r.dor} expected=${dorExpected.toFixed(2)}`);
  expect(Math.abs(r.dor - dorExpected) / dorExpected, 'DOR matches Se/Sp formula').toBeLessThan(0.02);

  expect(errors, 'no console/page errors:\n' + errors.join('\n')).toEqual([]);
});
