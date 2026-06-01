/**
 * R-parity for the meta-analysis fragility index (shared/fragility.js) vs
 * fragility::frag.ma(measure="OR", method="DL"). On a 5-study binary MA with pooled
 * OR<1 (p=0.00115): FI = 13 event modifications, FQ = 0.0125. Surfaced in mh-peto.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/mh-peto/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const STUDIES = [
  { e1: 12, n1: 100, e0: 20, n0: 100 }, { e1: 8, n1: 90, e0: 15, n0: 92 },
  { e1: 20, n1: 150, e0: 28, n0: 148 }, { e1: 5, n1: 60, e0: 11, n0: 62 },
  { e1: 15, n1: 120, e0: 24, n0: 118 },
];

test('fragility index matches fragility::frag.ma (OR, DL) → FI=13', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((studies) => window.AlmFragility.fragility(studies, { measure: 'OR' }), STUDIES);
  expect(r.FI).toBe(13);
  expect(r.FQ).toBeCloseTo(0.0125, 4);
  expect(r.dir).toContain('non-significance');
  expect(errs, 'no console errors').toEqual([]);
});

test('mh-peto surfaces the fragility index in its results', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastMhPeto === 'function' && window._almLastMhPeto(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastMhPeto());
  expect('fragility_index' in o).toBe(true);
  const note = await page.textContent('#fragility-note');
  expect(note.length).toBeGreaterThan(0);
});
