/**
 * cumulative-subgroup: usability defects U2, U4, U5, U6, U7 of the paper-14 wave-1 audit stay fixed.
 *
 * U2  the pooled-result cards are inside the first 1366 x 900 viewport (they were below the input forms, y ~ 1,330 px);
 * U4  no horizontal page scroll at 390 px width (the page was 404 px wide: the grid track had min-content width);
 * U5  no effect-axis tick prints as "-0.00" (niceTicks lands a rounding error below zero, e.g. -2.8e-17);
 * U6  "Load example" is inside the first viewport, before the data box (it was the 5th button of the action row, y ~ 1,660 px);
 * U7  the fixed "<- allmeta" badge (#hub-back) does not cover the H1 title (hub/app-style.css header padding-top 28px !important).
 * Every test measures the rendered page, so it fails on the pre-fix page (7564da7) on its own assertion.
 */
import { test, expect } from '@playwright/test';

const APP = '/cumulative-subgroup/index.html';

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastCumSub === 'function' && window._almLastCumSub() && document.querySelector('#svg-host svg'));
}
const box = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, sel);
const intersects = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

test('U2: pooled-result cards are inside the first 1366 x 900 viewport', async ({ page }) => {
  await open(page, 1366, 900);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#stats-wrap .stat')].map(c => { const r = c.getBoundingClientRect(); return { k: c.querySelector('.k').textContent, top: r.top, bottom: r.bottom }; }));
  expect(cards.map(c => c.k)).toEqual(['k', 'Final pooled', 'Final τ²']);
  for (const c of cards) { expect(c.top, c.k).toBeGreaterThanOrEqual(0); expect(c.bottom, c.k).toBeLessThanOrEqual(900); }
});

test('U4: no horizontal page scroll at 390 px width', async ({ page }) => {
  await open(page, 390, 844);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(w[0], 'scrollWidth vs clientWidth').toBeLessThanOrEqual(w[1]);
});

test('U5: no axis tick reads "-0.00" (cumulative and subgroup plots of the built-in example, and a zero-straddling fixture)', async ({ page }) => {
  await open(page, 1366, 900);
  const ticks = () => page.evaluate(() => [...document.querySelectorAll('#svg-host svg text')].map(t => t.textContent).filter(t => /^-?\d+\.\d\d$/.test(t)));
  const cum = await ticks();
  expect(cum).toContain('0.00');
  expect(cum.filter(t => /^-0\.0+$/.test(t))).toEqual([]);
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub()?.view === 'subgroup');
  expect((await ticks()).filter(t => /^-0\.0+$/.test(t))).toEqual([]);
  await page.selectOption('#f-view', 'cumulative');
  await page.locator('#f-data').fill('A, -0.3, 0.1\nB, 0.2, 0.1\nC, -0.1, 0.12\nD, 0.05, 0.2');
  await page.locator('#f-data').dispatchEvent('input');   // as the label-layout spec does; fill() alone raced once on a loaded host
  await page.waitForFunction(() => window._almLastCumSub()?.k === 4, null, { timeout: 30_000 });
  expect((await ticks()).filter(t => /^-0\.0+$/.test(t))).toEqual([]);
});

test('U6: "Load example" is inside the first 1366 x 900 viewport, before the data box, and loads the example', async ({ page }) => {
  await open(page, 1366, 900);
  const b = await box(page, '#btn-example');
  expect(b.top).toBeGreaterThanOrEqual(0);
  expect(b.bottom).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => !!(document.getElementById('btn-example').compareDocumentPosition(document.getElementById('f-data')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.click('#btn-reset');
  await page.waitForFunction(() => window._almLastCumSub() === null);
  await page.click('#btn-example');
  await page.waitForFunction(() => window._almLastCumSub()?.k === 9);
});

for (const [w, h] of [[1366, 900], [390, 844]]) test(`U7: the "allmeta" badge does not cover the page title at ${w} px`, async ({ page }) => {
  await open(page, w, h);
  const badge = await box(page, '#hub-back'), title = await box(page, 'header h1');
  expect(intersects(badge, title), JSON.stringify({ badge, title })).toBe(false);
});
