/**
 * NMA-core review fixes:
 *  - nma: SUCRA now reproducible (seeded), + consistency-check banner
 *  - bucher: transitivity assumption disclosed
 *  - component-nma: multi-arm limitation disclosed
 */
import { test, expect } from '@playwright/test';
const B = 'http://127.0.0.1:8080';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

function errs(page) {
  const e = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) e.push(m.text()); });
  page.on('pageerror', x => e.push('PAGE: ' + x.message));
  return e;
}

test('nma: SUCRA reproducible + consistency banner', async ({ page }) => {
  const e = errs(page);
  await page.goto(`${B}/nma/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almNmaCompute === 'function', { timeout: 10000 });
  const r = await page.evaluate(() => {
    const text = document.getElementById('f-data').value;
    const a = window.__almNmaCompute(text);
    const b = window.__almNmaCompute(text);
    return { a: a.sucra, b: b.sucra, banner: /test consistency/i.test(document.body.textContent || '') };
  });
  console.log('  nma SUCRA a:', JSON.stringify(r.a));
  expect(r.a, 'SUCRA computed').toBeTruthy();
  expect(JSON.stringify(r.a), 'two runs identical SUCRA (seeded)').toBe(JSON.stringify(r.b));
  expect(r.banner, 'consistency banner present').toBe(true);
  expect(e, 'no console errors').toEqual([]);
});

test('bucher: discloses transitivity', async ({ page }) => {
  const e = errs(page);
  await page.goto(`${B}/bucher/index.html`, { waitUntil: 'load' });
  const has = await page.evaluate(() => /transitivity/i.test(document.body.textContent || ''));
  expect(has, 'transitivity disclosed').toBe(true);
  expect(e, 'no console errors').toEqual([]);
});

test('component-nma: discloses multi-arm limitation', async ({ page }) => {
  const e = errs(page);
  await page.goto(`${B}/component-nma/index.html`, { waitUntil: 'load' });
  const has = await page.evaluate(() => /multi-arm correction off/i.test(document.body.textContent || ''));
  expect(has, 'multi-arm limitation disclosed').toBe(true);
  expect(e, 'no console errors').toEqual([]);
});
