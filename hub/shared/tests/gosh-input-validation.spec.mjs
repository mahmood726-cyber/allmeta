import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync(new URL('../../../gosh/tests/fixtures/input-validation.json', import.meta.url), 'utf8'));
const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';

async function seed(page) {
  await page.goto('/gosh/index.html');
  await page.locator('#alm-hero-mount select').selectOption('bcg');
  await expect(page.locator('#m-n')).toHaveText('8,191');
  await expect(page.locator('#plot circle')).toHaveCount(8191);
  await page.locator('#plus-refresh').click();
  await expect(page.locator('#plus-table tbody tr')).toHaveCount(13);
  await expect(page.locator('#plus-plot circle')).toHaveCount(8191);
}
async function refused(page, text, message) {
  await page.locator('#src').fill(text);
  await page.locator('#btn-run').click();
  const alert = page.locator('#input-error[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(message);
  await expect(page.locator('#plot')).toBeEmpty();
  for (const id of ['m-n', 'm-est', 'm-i2']) await expect(page.locator(`#${id}`)).toHaveText('\u2014');
  for (const id of ['plot-note', 'plot-error', 'sample-error']) await expect(page.locator(`#${id}`)).toHaveText('');
  expect(await page.evaluate(() => window._almLastGosh())).toBeNull();
  expect(await page.evaluate(() => window.AlmGoshPlus.state)).toBeNull();
  await expect(page.locator('#plus-table tbody tr')).toHaveCount(0);
  await expect(page.locator('#plus-table thead th')).toHaveCount(0);
  await expect(page.locator('#plus-plot')).toBeEmpty();
  await expect(page.locator('#plus-counts')).toHaveText('');
  await expect(page.locator('#sample-label')).toBeHidden();
  await expect(page.locator('#analysis-status')).toBeHidden();
}
for (const c of cases) test(`GOSH rejects ${c.name} with line number and clears previous BCG`, async ({ page }) => {
  await seed(page);
  await refused(page, good + '\n\n' + c.line, 'Line 5:');
  await expect(page.locator('#input-error')).toContainText(c.reason);
  // Selecting the same option again dispatches change and must recover cleanly.
  await page.locator('#alm-hero-mount select').selectOption('bcg');
  await expect(page.locator('#input-error')).toHaveText('');
  await expect(page.locator('#m-n')).toHaveText('8,191');
  expect(await page.evaluate(() => window._almLastGosh().k)).toBe(13);
});
for (const [name, text] of [['empty', ''], ['one row', '0.1, 0.2'], ['two rows', '0.1, 0.2\n0.2, 0.3']]) {
  test(`GOSH explains ${name} and clears previous BCG`, async ({ page }) => {
    await seed(page); await refused(page, text, 'at least 3 valid studies');
  });
}
test('GOSH reports every bad line with header/blank-line offsets and renders messages safely', async ({ page }) => {
  await seed(page);
  await refused(page, 'effect, SE, label\n\n0.4O, 1\n0.2, 0\n<img src=x onerror=alert(1)>, 1\n' + good, 'Line 3:');
  await expect(page.locator('#input-error')).toContainText('Line 4:');
  await expect(page.locator('#input-error')).toContainText('Line 5:');
  await expect(page.locator('#input-error img')).toHaveCount(0);
});
test('GOSH accepts first-line header, decimal/exponent forms and optional labels', async ({ page }) => {
  await page.goto('/gosh/index.html');
  await page.locator('#src').fill('effect, SE, label\n+.1e1, 2.e-1, A\n-.2, +.3\n3., .4, C');
  await page.locator('#btn-run').click();
  await expect(page.locator('#input-error')).toHaveText('');
  await expect(page.locator('#m-n')).toHaveText('7');
  await expect(page.locator('#plot circle')).toHaveCount(7);
});
