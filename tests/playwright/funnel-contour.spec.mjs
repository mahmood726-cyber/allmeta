/**
 * Verifies the contour-enhanced funnel (Peters 2008) renders: significance-shaded
 * triangular regions around the null at z=1.645/1.96/2.576. 5 contour polygons,
 * clipped to the plot frame, with the study points still drawn on top. No errors.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/funnel-plot/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('funnel-plot: significance contours render around the null', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#btn-example');
  await page.waitForFunction(() => document.querySelector('svg polygon') !== null, { timeout: 8000 });

  const r = await page.evaluate(() => {
    const fills = Array.from(document.querySelectorAll('svg polygon')).map(p => p.getAttribute('fill'));
    return {
      polygons: fills.length,
      hasInner: fills.includes('#e4e6ea'),       // p>0.10 wedge
      hasBand05: fills.includes('#eef0f3'),       // 0.05-0.10
      hasBand01: fills.includes('#f7f8fa'),       // 0.01-0.05
      clipped: !!document.querySelector('clipPath#funclip'),
      points: document.querySelectorAll('svg circle').length,
    };
  });
  console.log('  funnel:', JSON.stringify(r));

  expect(r.polygons, 'contour polygons drawn').toBeGreaterThanOrEqual(5);
  expect(r.hasInner && r.hasBand05 && r.hasBand01, 'all three contour shades present').toBe(true);
  expect(r.clipped, 'contours clipped to plot frame').toBe(true);
  expect(r.points, 'study points still drawn (over contours)').toBeGreaterThan(0);
  expect(errors, 'no console errors').toEqual([]);
});
