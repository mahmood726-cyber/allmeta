/**
 * Regression for the zero-config chart export (hub/shared/chart-export-auto.js):
 * every app that includes it gets a download bar on each chart, and the bar
 * actually produces files in multiple formats (SVG/PNG/JPG/PDF — jsPDF is
 * lazy-loaded from vendor/ on the first PDF click). Auto-injection must not
 * raise console errors.
 */
import { test, expect } from '@playwright/test';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

// Representative sample of apps wired with chart-export-auto.js (the full rollout
// covers ~30 apps; this sample keeps the spec fast while spanning SVG/canvas/RoB types).
const WIRED = ['nma-meta-reg', 'km-reconstructor', 'pet-peese', 'median-to-mean',
  'component-nma', 'powerma', 'sequential-ma', 'bayesian-mcmc', 'rob2', 'cross-design'];

for (const app of WIRED) {
  test(`chart export bar present, no errors — ${app}`, async ({ page }) => {
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => errs.push('PAGE:' + e.message));
    await page.goto('http://localhost:8088/' + app + '/index.html', { waitUntil: 'load' });
    for (const sel of ['#btn-run', '#btn-example']) { const b = await page.$(sel); if (b) await b.click().catch(() => {}); }
    await page.waitForTimeout(1500);
    const bars = await page.$$eval('.alm-xbar', els => els.length);
    expect(bars, 'at least one export bar').toBeGreaterThan(0);
    const fmts = await page.$$eval('.alm-xbar button', els => [...new Set(els.map(e => e.textContent))]);
    expect(fmts).toEqual(expect.arrayContaining(['SVG', 'PNG', 'JPG', 'PDF']));
    expect(errs, 'no console errors').toEqual([]);
  });
}

test('export actually downloads files with correct extensions', async ({ page }) => {
  await page.goto('http://localhost:8088/nma-meta-reg/index.html', { waitUntil: 'load' });
  const b = await page.$('#btn-run'); if (b) await b.click();
  await page.waitForTimeout(1200);
  for (const fmt of ['SVG', 'PNG', 'JPG']) {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.click('.alm-xbar button:has-text("' + fmt + '")'),
    ]);
    expect(dl.suggestedFilename().endsWith('.' + fmt.toLowerCase())).toBe(true);
  }
});

test('PDF export lazy-loads jsPDF from vendor/ and downloads a .pdf', async ({ page }) => {
  await page.goto('http://localhost:8088/nma-meta-reg/index.html', { waitUntil: 'load' });
  const b = await page.$('#btn-run'); if (b) await b.click();
  await page.waitForTimeout(1200);
  // jsPDF must NOT be present until the first PDF click (lazy-loaded).
  expect(await page.evaluate(() => !!(window.jspdf || window.jsPDF))).toBe(false);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.click('.alm-xbar button:has-text("PDF")'),
  ]);
  expect(dl.suggestedFilename().endsWith('.pdf')).toBe(true);
  expect(await page.evaluate(() => !!(window.jspdf && window.jspdf.jsPDF))).toBe(true);
});
