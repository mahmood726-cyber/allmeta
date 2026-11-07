// Diagnostic registered only by the disposable browser runner. This does not
// retire or alter the existing 375px expected-failure test.
import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageURL = '/multilevel-ma/index.html';
const source = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');
const branch = /if \(rows\.length < 3\) \{[\s\S]*?\n      \}/g;
assert.equal([...source.matchAll(branch)].length, 1);
const oldRefusal = source.replace(branch,
  'if (rows.length < 3) { _lastResults = null; _lastReml = null; return; }');

async function layout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main');
    return {
      width: root.scrollWidth,
      viewport: root.clientWidth,
      font: getComputedStyle(document.body).fontFamily,
      grid: getComputedStyle(main).gridTemplateColumns,
      stylesheets: [...document.styleSheets].filter(s => s.href).map(s => ({
        path: new URL(s.href).pathname, rules: s.cssRules.length,
      })),
      overflowing: [...document.querySelectorAll('body *')].map(e => ({
        tag: e.tagName, id: e.id, right: e.getBoundingClientRect().right,
      })).filter(e => e.right > root.clientWidth + 0.5),
    };
  });
}

test('P07 layout diagnostic: compare current and reconstructed old refusal at 375px', async ({ browser }, info) => {
  test.setTimeout(120000);
  const measurements = [];
  for (const [version, html] of [['current', source], ['old-refusal-reconstruction', oldRefusal]]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    try {
      const page = await context.newPage();
      const errors = [], failedAssets = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (['script', 'stylesheet'].includes(response.request().resourceType()) && !response.ok()) {
          failedAssets.push({ path: new URL(response.url()).pathname, status: response.status() });
        }
      });
      page.on('requestfailed', request => {
        if (['script', 'stylesheet'].includes(request.resourceType())) {
          failedAssets.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText });
        }
      });
      await page.route('**/multilevel-ma/index.html', route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto(new URL(pageURL, info.project.use.baseURL).href);
      await expect(page.locator('#summary')).toContainText('REML');
      await expect(page.locator('#summary')).toContainText('Pooled estimate');
      const immediate = await layout(page);
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)));
      await page.evaluate(() => document.fonts.ready);
      const settled = await layout(page);
      measurements.push({ version, immediate, settled, errors, failedAssets,
        summary: await page.locator('#summary').innerText() });
      expect(errors).toEqual([]);
      expect(failedAssets).toEqual([]);
      expect(settled.stylesheets.some(s => s.path === '/hub/app-style.css' && s.rules > 0)).toBe(true);
    } finally {
      await context.close();
    }
  }
  const evidence = { platform: process.platform, browser: browser.version(), measurements };
  console.log('P07 LAYOUT DIAGNOSTIC', JSON.stringify(evidence));
  await info.attach('layout-comparison', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(measurements[1].summary).toBe(measurements[0].summary);
  expect(measurements[1].settled.width).toBe(measurements[0].settled.width);
});
