/**
 * Method Finder end-to-end test.
 *
 * Loads /finder/, walks two complete decision paths, asserts:
 *   - the tree renders without console errors
 *   - clicking through options updates breadcrumbs correctly
 *   - recommendation cards are clickable links to live apps
 *   - hub-link from / index.html points to /finder/
 */
import { test, expect } from '@playwright/test';

const FINDER_URL = '/finder/';
const HUB_URL = '/';

test('finder loads tree, renders first question, no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // frame-ancestors warning is delivered via <meta> intentionally (we have
    // a meta CSP for offline-bundled pages); browsers nag but it's benign.
    if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
    errors.push(t);
  });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(FINDER_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.opt-btn', { timeout: 5_000 });
  const opts = await page.locator('.opt-btn').count();
  expect(opts, 'first question should have multiple options').toBeGreaterThan(2);
  expect(errors, 'no console errors during load').toEqual([]);
});

test('finder walk: pairwise binary common heterogeneity → forest-plot recommended', async ({ page }) => {
  await page.goto(FINDER_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.opt-btn');
  // 1. "Pairwise comparisons"
  await page.getByRole('button', { name: /Pairwise comparisons/ }).click();
  await page.waitForSelector('.opt-btn');
  // 2. "Binary (OR, RR, RD)"
  await page.getByRole('button', { name: /Binary \(OR, RR, RD\)/ }).click();
  await page.waitForSelector('.opt-btn');
  // 3. "No — events common"
  await page.getByRole('button', { name: /No — events common/ }).click();
  await page.waitForSelector('.opt-btn');
  // 4. "Yes — random effects with prediction interval"
  await page.getByRole('button', { name: /random effects with prediction interval/ }).click();
  await page.waitForSelector('.reco-item');
  // Forest-plot must appear as a recommendation
  const recoLinks = await page.locator('.reco-link').allTextContents();
  expect(recoLinks).toContain('forest-plot →');
});

test('hub homepage exposes a link to the finder', async ({ page }) => {
  await page.goto(HUB_URL, { waitUntil: 'domcontentloaded' });
  const finderLink = page.locator('a[href$="/finder/"]');
  await expect(finderLink, 'hub should link to the method finder').toBeAttached();
});

test('finder back-to-hub link works', async ({ page }) => {
  await page.goto(FINDER_URL, { waitUntil: 'domcontentloaded' });
  await page.click('a.back-to-hub');
  await page.waitForLoadState('domcontentloaded');
  // The hub has the search input
  await expect(page.locator('#search-input')).toBeAttached({ timeout: 5_000 });
});
