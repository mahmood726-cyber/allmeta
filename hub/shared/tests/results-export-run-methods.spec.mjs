import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function report(page, action = 'report-md') {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#alm-export-mount [data-action="' + action + '"]').click()
  ]);
  return readFileSync(await download.path(), 'utf8');
}
function methods(text) {
  return text.split('## Methods\n')[1]?.split('## Results\n')[0] || '';
}
const cases = [
  { app: 'dose-response-ma', selector: '#f-method', value: 'FE', chosen: /fixed effect \(FE\)/i, other: /random.effects|REML/i },
  { app: 'dta-sroc', selector: '#f-method', value: 'fixed', chosen: /fixed effect \(FE\)/i, other: /random.effects|REML/i },
  { app: 'heterogeneity', selector: '#f-tau2', value: 'reml', chosen: /REML/, other: /Paule.Mandel|DerSimonian/i },
  { app: 'pubbias-tests', selector: '#format', value: 'binary', chosen: /binary 2x2.*log odds ratio/i, other: /generic effect.*SE/i },
  // The main multilevel app has no model/estimator selector. Change its actual
  // clustering specification, retaining the shipped example effect/SE values.
  { app: 'multilevel-ma', grouping: true, chosen: /5 study clusters/, other: /6 study clusters/ },
  { app: 'meta-regression', selector: '#f-scale', check: true, chosen: /location-scale model: enabled.*ML/s, other: /location-scale model: disabled/ },
  { app: 'proportion-ma', selector: '#tau-est', value: 'FE', chosen: /fixed effect \(FE\)/i, other: /random.effects|Paule.Mandel|DerSimonian/i },
  { app: 'mh-peto', selector: '#measure', value: 'RR', chosen: /risk ratio \(RR\)/i, other: /odds ratio|Peto OR/i }
];

for (const c of cases) {
  test('Methods describe the completed run: ' + c.app, async ({ page, baseURL }) => {
    await page.goto(new URL('/' + c.app + '/index.html', baseURL).href);
    // A new browser context loads the shipped example. Some apps also expose a
    // dedicated reload button; use it where present.
    if (await page.locator('#btn-example').count()) await page.locator('#btn-example').click();
    await page.locator('#btn-run').click();
    const before = methods(await report(page));
    if (c.grouping) {
      const input = page.locator('#src');
      const data = await input.inputValue();
      expect(data).toMatch(/^6,/m);
      await input.fill(data.replace(/^6,/gm, '5,'));
    } else if (c.check) {
      await page.locator(c.selector).check();
    } else {
      await page.locator(c.selector).selectOption(c.value);
    }
    await page.locator('#btn-run').click();
    const text = await report(page);
    const actual = methods(text);
    expect(actual).toMatch(c.chosen);
    expect(actual).not.toMatch(c.other);
    expect(actual).not.toContain('not recorded by this app');
    expect(actual).not.toEqual(before);
    expect(text).toContain('## Results');
    // The plain-text download must use the same Methods.
    const plain = await report(page, 'report-txt');
    expect(plain.split('METHODS\n')[1].split('RESULTS\n')[0]).toContain(actual.trim());

    // Direct DOM edits without an event do not trigger a new analysis. Exports
    // must remain bound to the exported results, not read pending selectors.
    // DTA intentionally re-computes after validating current state on export.
    if (c.selector && c.app !== 'dta-sroc') {
      await page.evaluate(({ selector, check }) => {
        const el = document.querySelector(selector);
        if (check) el.checked = false;
        else el.selectedIndex = 0;
      }, c);
      expect(methods(await report(page))).toBe(actual);
    }
  });
}

test('export fallback never presents footer or intro as run Methods', async ({ page }) => {
  await page.setContent('<h1>Fallback</h1><header><p>STATIC INTRO</p></header><footer>STATIC FOOTER REML and DL</footer><div id="alm-export-mount"></div>');
  await page.addScriptTag({ content: readFileSync(new URL('../results-export.js', import.meta.url), 'utf8') });
  await page.evaluate(() => window.alm.resultsExport({
    target: '#alm-export-mount', getResults: () => ({ method: 'FE', model: 'fixed', estimator: 'none' })
  }));
  const text = await report(page);
  expect(methods(text)).toContain('Methods of this run: not recorded by this app; the settings used are listed under Results.');
  expect(text).not.toContain('STATIC');
  for (const key of ['method', 'model', 'estimator']) expect(text.split('## Results')[1]).toContain(key);
});

// Opt-in mutations replace only responses in this browser context. No source or
// Git writes: the exact normal regression assertions must fail for each mutant.
test.beforeEach(async ({ page }) => {
  if (process.env.V181_MUTANT === 'footer') {
    const src = readFileSync(new URL('../results-export.js', import.meta.url), 'utf8');
    const mutant = src.replace(/const methods = typeof opts\.methods[\s\S]*?;\n    return \{ title, methods \};/,
      "const methods = _grab('.footer-note') || _grab('footer');\n    return { title, methods };");
    if (mutant === src) throw new Error('Footer mutation target must exist');
    await page.route('**/hub/shared/results-export.js', route => route.fulfill({ contentType: 'application/javascript', body: mutant }));
  }
});
