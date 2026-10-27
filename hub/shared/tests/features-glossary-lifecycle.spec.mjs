import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tooltips.js', import.meta.url), 'utf8');

async function fixture(page) {
  await page.goto('/');
  await page.setContent(`<html lang="en"><head><title>Glossary lifecycle</title></head><body>
    <main><h1>Analysis</h1><p id="explanation">Estimator explanation</p>
      <div id="result"><abbr data-gloss="REML" aria-describedby="explanation">REML</abbr></div>
      <section data-gloss-scope><h2>Method help</h2><p id="prose">REML</p><code id="method">REML</code>
        <svg width="200" height="100"><title>REML</title><desc>REML</desc><metadata>REML</metadata>
          <text y="30"><tspan>REML</tspan></text><foreignObject><code>REML</code></foreignObject></svg>
      </section>
    </main><div id="alm-features"></div></body></html>`);
  const svg = await page.locator('svg').evaluate(el => el.outerHTML);
  await page.addScriptTag({ content: source });
  await page.evaluate(() => window.alm.tooltips({ glossary: { REML: { short: 'Restricted maximum likelihood' } }, terms: { REML: 'REML' } }));
  return svg;
}

test('opted-in HTML gets help while embedded SVG and foreignObject markup stay intact', async ({ page }) => {
  const svg = await fixture(page);
  expect(await page.locator('svg').evaluate(el => el.outerHTML)).toBe(svg);
  await expect(page.locator('#prose [data-gloss]')).toHaveCount(1);
  await expect(page.locator('#method')).toHaveAttribute('data-gloss', 'REML');
  await page.evaluate(() => window.alm.tooltips.rescan());
  expect(await page.locator('svg').evaluate(el => el.outerHTML)).toBe(svg);
});

test('restored result markup retains IDs and receives working keyboard tooltip listeners', async ({ page }) => {
  await fixture(page);
  const before = await page.locator('#result').innerHTML();
  await page.locator('#result').evaluate(el => { el.innerHTML = el.innerHTML; });
  await page.evaluate(() => window.alm.tooltips.rescan());
  expect(await page.locator('#result').innerHTML()).toBe(before);
  await page.locator('#result abbr').focus();
  await expect(page.locator('.alm-tooltip.is-visible')).toHaveText('Restricted maximum likelihood');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alm-tooltip.is-visible')).toHaveCount(0);
  const ids = await page.locator('.alm-tooltip').evaluateAll(els => els.map(el => el.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('closed and open glossary UI has landmarks without overriding native details semantics', async ({ page }) => {
  await fixture(page);
  for (const open of [false, true]) {
    await page.locator('#alm-glossary-help').evaluate((el, value) => { el.open = value; }, open);
    const result = await new AxeBuilder({ page }).withRules(['region', 'aria-allowed-role']).analyze();
    expect(result.violations).toEqual([]);
  }
});
