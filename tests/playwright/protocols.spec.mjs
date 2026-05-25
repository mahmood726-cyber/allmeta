/**
 * Protocols e2e — the "submit + immediately display" flow.
 *
 * Asserts:
 *  - editor renders with all sections
 *  - typing in a field updates the live preview
 *  - clicking Generate shareable link produces a URL with #p=...
 *  - opening that URL in a fresh page renders the protocol read-only
 *  - PRISMA-P gauge moves as fields are filled
 *  - downloads work (HTML / JSON / Markdown)
 *  - hub homepage links to /protocols/
 */
import { test, expect } from '@playwright/test';

const URL = '/protocols/';

test('protocols page loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
    errors.push(t);
  });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#form details', { timeout: 5_000 });
  // 9 sections (admin, team, background, eligibility, search, selection, rob, analysis, reporting)
  const sections = await page.locator('#form details').count();
  expect(sections).toBe(9);
  expect(errors).toEqual([]);
});

test('typing in title updates the preview live and moves PRISMA-P gauge', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pf-admin-title');
  await page.fill('#pf-admin-title', 'My systematic review protocol');
  // Debounce is 150 ms — wait a bit longer than that.
  await page.waitForTimeout(250);
  const previewH1 = await page.locator('#preview .protocol-header h1').textContent();
  expect(previewH1).toBe('My systematic review protocol');
  const gauge = await page.locator('#gauge-pct').textContent();
  expect(gauge).not.toBe('0% (0/0)');
  expect(gauge).toMatch(/[1-9]\d*%/);
});

test('Load demo populates every section, gauge hits ≥85%', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-demo');
  await page.waitForTimeout(300);
  const gaugeTxt = await page.locator('#gauge-pct').textContent();
  const pctMatch = gaugeTxt.match(/(\d+)%/);
  expect(pctMatch).not.toBeNull();
  expect(parseInt(pctMatch[1], 10)).toBeGreaterThanOrEqual(85);
  // Preview shows the SGLT2 demo title
  await expect(page.locator('#preview .protocol-header h1')).toContainText('SGLT2');
});

test('Generate shareable link produces a URL with #p= fragment', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-demo');
  await page.waitForTimeout(300);
  await page.click('#btn-share');
  await page.waitForFunction(
    () => document.getElementById('share').classList.contains('visible'),
    { timeout: 5_000 }
  );
  const url = await page.locator('#share-url').inputValue();
  expect(url).toMatch(/#p=[A-Za-z0-9_-]+$/);
  // The fragment should be reasonably sized for the demo
  const frag = url.split('#p=')[1];
  expect(frag.length).toBeGreaterThan(200);
  expect(frag.length).toBeLessThan(7000);
});

test('Opening a generated URL renders the protocol read-only', async ({ page, context }) => {
  // 1. Author the demo and grab its share URL.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-demo');
  await page.waitForTimeout(300);
  await page.click('#btn-share');
  await page.waitForFunction(
    () => document.getElementById('share').classList.contains('visible'),
    { timeout: 5_000 }
  );
  const shareUrl = await page.locator('#share-url').inputValue();
  expect(shareUrl).toContain('#p=');

  // 2. Open the share URL in a fresh page.
  const viewerPage = await context.newPage();
  await viewerPage.goto(shareUrl, { waitUntil: 'domcontentloaded' });
  await viewerPage.waitForFunction(
    () => document.body.classList.contains('viewer'),
    { timeout: 5_000 }
  );
  // Editor must be hidden, viewer banner visible.
  await expect(viewerPage.locator('.viewer-banner')).toBeVisible();
  await expect(viewerPage.locator('#editor-panel')).toBeHidden();
  // Preview must contain the demo title.
  await expect(viewerPage.locator('#preview .protocol-header h1')).toContainText('SGLT2');
  // Multiple sections rendered.
  const sectionCount = await viewerPage.locator('#preview .protocol-section').count();
  expect(sectionCount).toBeGreaterThanOrEqual(5);
});

test('Editing after share hides the stale share URL', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.fill('#pf-admin-title', 'Original title');
  await page.waitForTimeout(250);
  await page.click('#btn-share');
  await page.waitForFunction(() => document.getElementById('share').classList.contains('visible'));
  // Edit a field — share box should disappear because the protocol changed.
  await page.fill('#pf-admin-title', 'Original title — revised');
  await page.waitForTimeout(250);
  await expect(page.locator('#share')).not.toHaveClass(/visible/);
});

test('Hub homepage links to /protocols/', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const link = page.locator('a[href$="/protocols/"]');
  await expect(link, 'hub should link to /protocols/').toBeAttached();
});

test('Export JSON triggers a download with .json filename', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-demo');
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 });
  await page.click('#btn-export-json');
  const dl = await downloadPromise;
  expect(dl.suggestedFilename()).toMatch(/^protocol-.+-\d{4}-\d{2}-\d{2}\.json$/);
});

test('Export HTML triggers a download containing the rendered protocol', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-demo');
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 });
  await page.click('#btn-export-html');
  const dl = await downloadPromise;
  const fn = dl.suggestedFilename();
  expect(fn).toMatch(/^protocol-.+\.html$/);
  const tmpPath = await dl.path();
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(tmpPath, 'utf-8');
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('SGLT2');
  expect(html).toContain('protocol-section');
  // Self-contained: no external script/link refs apart from absolute mailto/etc.
  expect(html).not.toMatch(/<link[^>]+href="\.\./);
  expect(html).not.toMatch(/<script[^>]+src=/);
});
