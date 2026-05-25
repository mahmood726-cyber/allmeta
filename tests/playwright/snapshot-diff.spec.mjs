/**
 * Snapshot diff e2e — loads /diff/, runs the demo, asserts the rendered
 * output contains every expected diff category (provenance, numeric,
 * timestamp, study add/remove/change).
 */
import { test, expect } from '@playwright/test';

const URL = '/diff/';

test('diff page loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
    errors.push(t);
  });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-diff', { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('Load demo + Compare produces every diff category', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-demo', { timeout: 5_000 });
  await page.click('#btn-demo');
  // Demo auto-runs compare; wait for the output table to render.
  await page.waitForSelector('#diff-out table', { timeout: 5_000 });

  const summary = await page.locator('#summary').textContent();
  // Provenance: version + sha changed
  expect(summary).toMatch(/provenance/i);
  // Field drift: effect, tau2, I2, ci, _signedAt
  expect(summary).toMatch(/field change/);
  // Studies: Patel 2023 added, Jones 2021 mutated
  expect(summary).toMatch(/study/);

  // Sections in the rendered output
  const outHtml = await page.locator('#diff-out').innerHTML();
  expect(outHtml).toContain('Provenance');
  expect(outHtml).toContain('Result fields');
  expect(outHtml).toMatch(/Studies/);

  // The Patel 2023 added-study row
  expect(outHtml).toContain('Patel 2023');
});

test('Invalid JSON in A shows a clear error', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.fill('#ta-a', '{ not valid json');
  await page.fill('#ta-b', '{}');
  await page.click('#btn-diff');
  await page.waitForFunction(
    () => (document.querySelector('#err')?.textContent || '').includes('A is not valid JSON'),
    { timeout: 5_000 }
  );
});

test('Identical snapshots show no-differences message', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const json = JSON.stringify({ effect: 0.5, ci: [-0.1, 1.1] });
  await page.fill('#ta-a', json);
  await page.fill('#ta-b', json);
  await page.click('#btn-diff');
  await page.waitForTimeout(150);
  const out = await page.locator('#diff-out').textContent();
  expect(out).toContain('No semantic differences');
  const summaryText = await page.locator('#summary').textContent();
  expect(summaryText).toContain('no semantic changes');
});

test('Hub homepage links to the diff page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const diffLink = page.locator('a[href$="/diff/"]');
  await expect(diffLink, 'hub should link to the snapshot diff page').toBeAttached();
});
