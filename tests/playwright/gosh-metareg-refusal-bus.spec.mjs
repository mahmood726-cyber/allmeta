import { test, expect } from '@playwright/test';

// gosh-metareg: (1) a refused run must not leave the previous result behind for export
// (window.__almLastMetaregGosh, read by the results export); (2) "Load from bus" must keep each
// study one line with its whole label: a comma in a label used to cut it short (parse() kept only
// the 4th field) and a newline split one study into two lines (or injected a second "study").
const APP = '/gosh-metareg/index.html';
const lastResult = page => page.evaluate(() => window.__almLastMetaregGosh());
async function runWith(page, text, minK) {
  await page.locator('#src').fill(text);
  if (minK != null) await page.locator('#min-k').fill(String(minK));
  await page.locator('#btn-run').click();
  await expect(page.locator('#btn-run')).toBeEnabled();
}

test('a refused run clears the exported result', async ({ page }) => {
  await page.goto(APP);
  await expect.poll(() => lastResult(page)).not.toBeNull();       // the default example ran
  const rows = n => Array.from({ length: n }, (_, i) => `${(0.1 * i).toFixed(2)}, 0.2, ${i}, S${i}`).join('\n');
  for (const [why, text, minK] of [['k < 3', rows(2), 4], ['k > 18', rows(19), 4], ['min k > k', rows(5), 9]]) {
    await runWith(page, rows(6), 4);
    expect(await lastResult(page), 'valid run publishes a result').not.toBeNull();
    await runWith(page, text, minK);
    expect(await lastResult(page), why + ': refused run must clear the result').toBeNull();
    expect(await page.evaluate(() => window.__almValidatorStudies().length), why).toBe(0);
  }
});

test('Load from bus keeps commas and newlines inside a label', async ({ page }) => {
  await page.goto(APP);
  await expect.poll(() => lastResult(page)).not.toBeNull();
  await page.evaluate(() => MaStudies.write([
    { label: 'Smith, 2010', est: 0.1, se: 0.2, moderator: 1 },
    { label: 'Jones\n2012', est: 0.3, se: 0.25, moderator: 2 },
    { label: 'Lee 2014\n0.9, 0.1, 5, Injected', est: -0.2, se: 0.3, moderator: 3 },
    { label: 'Kim', est: 0.05, se: 0.15, moderator: 4 },
  ]));
  await page.locator('#btn-bus-load').click();
  await expect(page.locator('#btn-run')).toBeEnabled();
  const src = await page.locator('#src').inputValue();
  expect(src.split('\n')).toHaveLength(4);
  const studies = await page.evaluate(() => window.__almValidatorStudies());
  expect(studies.map(s => s.label)).toEqual(['Smith, 2010', 'Jones 2012', 'Lee 2014 0.9, 0.1, 5, Injected', 'Kim']);
  expect(studies.map(s => [s.est, s.se, s.mod])).toEqual([[0.1, 0.2, 1], [0.3, 0.25, 2], [-0.2, 0.3, 3], [0.05, 0.15, 4]]);
  expect((await lastResult(page)).k).toBe(4);
});
