// proportion-ma paste path: rows the analysis cannot use (non-whole counts, events < 0 or > total, total <= 0,
// non-numeric or missing fields) are excluded AND listed in #src-excluded with a reason — never silently skipped,
// never truncated ("2.5,40" must not be analysed as 2/40). Valid rows give exactly the numbers they give alone.
// Run: npx playwright test -c playwright.features.config.mjs features-proportion-ma-rows.spec.mjs
import { test, expect } from '@playwright/test';

const PAGE = '/proportion-ma/index.html';
const VALID = ['5, 40, Alpha', '9, 60, Beta', '14, 75, Gamma'];
const BAD = [
  ['2.5, 40, Half', 'events not a whole number'],
  ['5, 40.5, Frac', 'total not a whole number'],
  ['45, 40, Over', 'events exceed the total'],
  ['-1, 40, Neg', 'events negative'],
  ['abc, 40, Text', 'events is not a number'],
  ['5, 0, Zero', 'total must be greater than 0'],
  ['7', 'fewer than 2 comma-separated fields (events, total)'],
];

async function analyse(page, text) {
  await page.locator('#src').fill(text);
  await page.locator('#btn-run').click();
  return page.evaluate(() => JSON.parse(JSON.stringify(window._almLastPropMA())));
}

test('ROWS: malformed rows are excluded and listed with a reason; valid rows analysed unchanged', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const notice = page.locator('#src-excluded');
  await expect(notice).toBeHidden(); // the built-in example has no unusable row

  const alone = await analyse(page, VALID.join('\n'));
  await expect(notice).toBeHidden();
  const aloneTable = await page.locator('#res-body').innerText();

  // Bad rows interleaved with the valid ones (valid rows keep their own labels, so the table is comparable).
  const mixed = [VALID[0], ...BAD.slice(0, 4).map(b => b[0]), VALID[1], ...BAD.slice(4).map(b => b[0]), VALID[2]];
  const withBad = await analyse(page, mixed.join('\n'));
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('7 rows were excluded (3 accepted).');
  const items = await notice.locator('li').allInnerTexts();
  expect(items).toEqual(BAD.map(([row, reason]) => 'Line ' + (mixed.indexOf(row) + 1) + ' (' + row + '): ' + reason));
  expect(withBad).toEqual(alone); // nothing truncated into the analysis: k = 3 and identical numbers
  expect(withBad.k).toBe(3);
  expect(await page.locator('#res-body').innerText()).toBe(aloneTable);
  await expect(page.locator('#res-body')).not.toContainText('Half');
  await expect(page.locator('#res-body')).not.toContainText('Frac');

  // One bad row: singular wording; fixing it clears the notice.
  await analyse(page, VALID.join('\n') + '\n2.5, 40, Half');
  await expect(notice).toContainText('1 row was excluded (3 accepted).');
  await analyse(page, VALID.join('\n'));
  await expect(notice).toBeHidden();
  expect(errors).toEqual([]);
});

test('ROWS: when too few rows remain the notice still says which rows were excluded and why', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await analyse(page, '2.5, 40, Half\n5, 40.5, Frac\n9, 60, Beta');
  await expect(page.locator('#res-body')).toContainText('Need at least 2 studies.');
  await expect(page.locator('#src-excluded')).toContainText('2 rows were excluded (1 accepted).');
  await expect(page.locator('#src-excluded li')).toHaveText(['Line 1 (2.5, 40, Half): events not a whole number',
    'Line 2 (5, 40.5, Frac): total not a whole number']);
});
