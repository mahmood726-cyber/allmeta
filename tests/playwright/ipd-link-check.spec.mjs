/**
 * Regression for the IPD-Meta-Pro landing link: it pointed at the e156-submission
 * copy, which 404s on ../shared and ../hub assets (wrong relative depth). It now
 * points at the canonical ipd-meta-pro.html whose relative paths resolve.
 */
import { test, expect } from '@playwright/test';
const BASE = 'http://127.0.0.1:8080/IPD-Meta-Pro';

test('landing links to canonical app, which loads shared/hub assets without 404', async ({ page }) => {
  // 1. Landing page now points at the sibling canonical app, not the e156 copy.
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  const appHref = await page.getAttribute('a.card.app', 'href');
  console.log('  app link href:', appHref);
  expect(appHref).toBe('ipd-meta-pro.html');

  // 2. The canonical app loads its shared/hub assets without 404 (the bug symptom).
  const notFound = [];
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
  await page.goto(`${BASE}/ipd-meta-pro.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const assetMisses = notFound.filter(u => /\/(shared|hub)\//.test(u));
  console.log('  404s on shared/hub assets:', assetMisses.length, assetMisses.slice(0, 5).join(', '));
  expect(assetMisses, 'no 404 on shared/hub assets').toEqual([]);
});
