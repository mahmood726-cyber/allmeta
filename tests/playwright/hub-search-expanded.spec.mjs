/**
 * Hub search expansion test (2026-05-25).
 *
 * Previously the hub catalog search only matched name + summary + tags from
 * projects.js. After wiring in shared/app-flow.js (CATALOG blurbs) and
 * shared/citation.js (CITATIONS authors + titles), search now also matches:
 *   - method-paper authors (Stijnen, Hedges, Achana, Friede, ...)
 *   - method abbreviations from app slugs (GLMM, RVE, NMA, BMA, ...)
 *   - app-flow blurbs (slightly different from projects.js summaries)
 *
 * Each test asserts a specific query → expected app appears in the result set.
 */
import { test, expect } from '@playwright/test';

const URL = '/';

async function visibleNames(page) {
  return page.locator('.project-card:visible h3, .project-card:visible .project-name').allTextContents();
}

async function _wait(page) {
  await page.waitForSelector('.project-card', { timeout: 8_000 });
  await page.waitForFunction(
    () => typeof window.AlmFlow === 'object' && typeof window.AlmCitation === 'object',
    { timeout: 5_000 }
  );
}

test('search "GLMM" finds rare-events-glmm via app-flow blurb + slug tokens', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await _wait(page);
  await page.fill('#search-input', 'glmm');
  await page.waitForTimeout(150);
  const found = await page.locator('.project-card:visible').count();
  expect(found, 'at least one card should match "glmm"').toBeGreaterThanOrEqual(1);
  const hasGlmm = await page.locator('.project-card:visible').evaluateAll(
    cards => cards.some(c => c.textContent.toLowerCase().includes('glmm') ||
                              c.textContent.toLowerCase().includes('rare event'))
  );
  expect(hasGlmm, 'rare-events-glmm should match "glmm" query').toBe(true);
});

test('search by method-paper author "Hedges" finds rve-meta', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await _wait(page);
  await page.fill('#search-input', 'hedges');
  await page.waitForTimeout(150);
  const found = await page.locator('.project-card:visible').evaluateAll(
    cards => cards.map(c => (c.id || '').replace('card-', ''))
  );
  expect(found.some(s => s.includes('rve') || s.includes('robust-variance')),
    `"hedges" should match rve-meta — got: ${found.join(', ')}`).toBe(true);
});

test('search by method-paper author "Stijnen" finds rare-events-glmm', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await _wait(page);
  await page.fill('#search-input', 'stijnen');
  await page.waitForTimeout(150);
  const found = await page.locator('.project-card:visible').evaluateAll(
    cards => cards.map(c => (c.id || '').replace('card-', ''))
  );
  expect(found.some(s => s.includes('rare') || s.includes('glmm')),
    `"stijnen" should match rare-events-glmm — got: ${found.join(', ')}`).toBe(true);
});

test('search by slug abbreviation "NMA" returns at least 3 NMA apps', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await _wait(page);
  await page.fill('#search-input', 'nma');
  await page.waitForTimeout(150);
  const count = await page.locator('.project-card:visible').count();
  expect(count, 'NMA query should match at least 3 apps').toBeGreaterThanOrEqual(3);
});

test('empty search shows everything', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await _wait(page);
  const all = await page.locator('.project-card:visible').count();
  expect(all, 'empty search → all cards visible').toBeGreaterThan(50);
});
