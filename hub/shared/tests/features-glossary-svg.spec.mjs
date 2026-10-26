import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tooltips.js', import.meta.url), 'utf8');
const plot = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100">' +
  '<title>SROC plot</title><desc>Moses SROC unavailable</desc>' +
  '<metadata>{"method":"Moses","curve":"SROC"}</metadata>' +
  '<text x="10" y="25">Moses SROC unavailable</text>' +
  '<text x="10" y="50"><tspan font-weight="bold">SROC</tspan> curve</text>' +
  '<foreignObject x="10" y="60" width="200" height="30"><code xmlns="http://www.w3.org/1999/xhtml">SROC</code></foreignObject>' +
  '</svg>';

async function fixture(page, baseURL, code = source) {
  const url = new URL('/glossary-svg-fixture', baseURL).href;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="en"><head><title>Glossary SVG regression</title></head><body>' +
    '<main><p id="prose">Moses SROC unavailable</p><code id="method">SROC</code>' +
    '<div id="plot">' + plot + '</div><div id="dynamic"></div></main></body></html>' }));
  await page.goto(url);
  const before = await page.locator('#plot svg').evaluate(el => new XMLSerializer().serializeToString(el));
  await page.addScriptTag({ content: code });
  await page.evaluate(() => window.alm.tooltips({
    glossary: { Moses: { short: 'Moses method' }, SROC: { short: 'Summary ROC curve' } },
    terms: { Moses: 'Moses', SROC: 'SROC' }
  }));
  return before;
}

test('automatic glossary scans preserve static and dynamic SVG exports while retaining prose help', async ({ page, baseURL }) => {
  const before = await fixture(page, baseURL);
  await expect(page.locator('#prose [data-gloss]')).toHaveCount(2);
  await expect(page.locator('#method')).toHaveAttribute('data-gloss', 'SROC');
  const term = page.locator('#prose [data-gloss="SROC"]');
  await term.focus();
  await expect(page.locator('#' + await term.getAttribute('data-alm-tip'))).toHaveClass(/is-visible/);
  await page.keyboard.press('Escape');
  await page.locator('#dynamic').evaluate((el, markup) => { el.innerHTML = markup + '<p>SROC</p>'; }, plot);
  // Wait for the mutation observer, then check explicit rescans are also safe.
  await expect(page.locator('#dynamic p [data-gloss]')).toHaveCount(1);
  await page.evaluate(() => { window.alm.tooltips.rescan(); window.alm.tooltips.rescan(); });
  for (const selector of ['#plot svg', '#dynamic svg']) {
    const serialized = await page.locator(selector).evaluate(el => new XMLSerializer().serializeToString(el.cloneNode(true)));
    expect(serialized).toBe(before);
    expect(serialized).toContain('Moses SROC unavailable');
    expect(serialized).not.toMatch(/data-gloss|data-alm-tip|aria-describedby|tabindex/);
  }
});

test('authored SVG glossary marks retain keyboard help without splitting their text', async ({ page, baseURL }) => {
  await fixture(page, baseURL);
  await page.locator('#dynamic').evaluate(el => {
    el.innerHTML = '<svg viewBox="0 0 100 50"><text x="0" y="25" data-gloss="SROC">SROC</text></svg>';
  });
  const term = page.locator('#dynamic [data-gloss="SROC"]');
  await expect(term).toHaveAttribute('tabindex', '0');
  await expect(term.locator('tspan')).toHaveCount(0);
  await term.focus();
  await expect(page.locator('#' + await term.getAttribute('data-alm-tip'))).toHaveClass(/is-visible/);
});

test('control and planted defect: SVG warning serialization', async ({ page, baseURL }) => {
  const marker = 'samp,svg,';
  expect(source.split(marker)).toHaveLength(2);
  for (const broken of [false, true]) {
    const before = await fixture(page, baseURL, broken ? source.replace(marker, 'samp,') : source);
    const after = await page.locator('#plot svg').evaluate(el => new XMLSerializer().serializeToString(el));
    expect(after === before).toBe(!broken);
    expect(after.includes('Moses SROC unavailable')).toBe(!broken);
  }
});
