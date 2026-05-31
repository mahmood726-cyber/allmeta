/**
 * Regression for the 2026-05-31 fix: a disconnected comparison network made the
 * NMA design matrix singular, and fitNMA()/run() had no guard — invert() threw an
 * uncaught exception in the click handler, leaving the effects table un-rendered
 * with no user-facing message. Added a connectivity guard (BFS from the reference)
 * plus a try/catch fallback. A disconnected network must now show a clear message;
 * a connected one must still pool.
 */
import { test, expect } from '@playwright/test';

test('bayesian-nma: disconnected network → clear message, no uncaught error', async ({ page }) => {
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto('http://localhost:8088/bayesian-nma/index.html', { waitUntil: 'load' });

  const disc = await page.evaluate(() => {
    document.getElementById('src').value = 'A, B, -0.30, 0.10\nA, B, -0.25, 0.12\nC, D, 0.10, 0.11\nC, D, 0.05, 0.13';
    document.getElementById('ref').value = 'A';
    document.getElementById('btn-run').click();
    return document.getElementById('eff-body').textContent;
  });
  expect(disc.toLowerCase()).toContain('disconnected');
  expect(pageErrs, 'no uncaught exception on a disconnected network').toEqual([]);

  const conn = await page.evaluate(() => {
    document.getElementById('src').value = 'A, B, -0.30, 0.10\nA, C, -0.20, 0.12\nB, C, 0.10, 0.11\nA, D, -0.40, 0.15';
    document.getElementById('btn-run').click();
    return document.getElementById('eff-body').textContent;
  });
  expect(conn.toLowerCase()).not.toContain('disconnected');
  expect(conn, 'connected network still pools').toMatch(/vs A/);
});
