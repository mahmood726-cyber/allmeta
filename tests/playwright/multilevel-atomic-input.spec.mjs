/** Genuine HTTP-served Chromium regression for the multilevel app input contract.
 * Source-exact bug: parsed CSV numeric effect=0 was serialized as blank; manual
 * malformed rows were silently dropped or parseFloat-truncated.
 * Exercises upload, visible outcomes/plots, report exports, refusal/recovery, undo,
 * and mobile layout. Does NOT validate metafor numerical parity.
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const URL = '/multilevel-ma/index.html';
const data = (name, csv) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
const csvZero = 'study,effect,SE,label\nA,0,0.1,zero\nB,0.30,0.12,two\nC,-0.20,0.15,three';
const csvOther = 'study,effect,SE,label\nA,0.2,0.1,one\nB,0.30,0.12,two\nC,-0.20,0.15,three';
const csvInvalid = 'study,effect,SE,label\nA,0,0.1,zero\nB,invalid,0.12,two\nC,-0.20,0.15,three';

test('multilevel: genuine CSV upload retains effect=0, plot, JSON + SVG exports, and Undo', async ({ page }) => {
  await page.goto(URL);
  const src = page.locator('#src');
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles(data('zero-valid.csv', csvZero));
  await expect(src).toHaveValue(/A, 0, 0\.1, zero/);
  await expect(page.locator('#input-error')).toBeHidden();
  await expect(page.locator('#body tr')).toHaveCount(4);
  await expect(page.locator('#forest rect')).toHaveCount(3);
  let fitted = await page.evaluate(() => window._almLastMlma());
  expect(fitted?.k).toBe(3);

  const exported = page.waitForEvent('download');
  await page.locator('#alm-export-mount [data-action="json"]').click();
  const jsonDownload = await exported;
  const json = JSON.parse(await readFile(await jsonDownload.path(), 'utf8'));
  expect(json.k).toBe(3);
  expect(json._schema).toBe('mlma-results-v1');

  await page.locator('#alm-plot-mount select').first().selectOption('svg');
  const plotExported = page.waitForEvent('download');
  await page.locator('#alm-plot-mount').getByRole('button', { name: 'Download Forest plot' }).click();
  const svgDownload = await plotExported;
  const svg = await readFile(await svgDownload.path(), 'utf8');
  expect(svg).toMatch(/<svg/);
  expect(svg).toMatch(/<rect/);

  const previous = await src.inputValue();
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles(data('different.csv', csvOther));
  await expect(src).toHaveValue(/A, 0\.2, 0\.1, one/);
  await page.locator('#alm-undo-mount [data-action="undo"]').click();
  await expect(src).toHaveValue(previous);
  expect((await page.evaluate(() => window._almLastMlma()))?.k).toBe(3);
});

test('multilevel: malformed CSV refuses atomically while preserving prior data and recoverability', async ({ page }) => {
  await page.goto(URL);
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles(data('first-valid.csv', csvZero));
  await expect(page.locator('#src')).toHaveValue(/A, 0, 0\.1, zero/);
  const before = await page.locator('#src').inputValue();
  const undoBefore = await page.evaluate(() => window.alm.resetUndo.size());
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles(data('bad-row.csv', csvInvalid));
  await expect(page.locator('#input-error')).toContainText(/CSV import refused.*Line 2/i);
  await expect(page.locator('#src')).toHaveValue(before);
  expect(await page.evaluate(() => window.alm.resetUndo.size())).toBe(undoBefore);
  expect((await page.evaluate(() => window._almLastMlma()))?.k).toBe(3);

  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles(data('recovery.csv', csvOther));
  await expect(page.locator('#input-error')).toBeHidden();
  await expect(page.locator('#src')).toHaveValue(/A, 0\.2, 0\.1, one/);
});

test('multilevel: malformed manual effect and unusable SE fail closed; corrected input recovers', async ({ page }) => {
  await page.goto(URL);
  const initial = await page.locator('#src').inputValue();
  const suffix = '\nB, 0.2, 0.12, b\nC, -0.1, 0.14, c';
  for (const invalid of ['A, 0junk, 0.1, a', 'A, 0x10, 0.1, a', 'A, 0, Infinity, a', 'A, 0, 0, a', 'A, 0, 1e-200, a']) {
    await page.locator('#src').fill(invalid + suffix);
    await page.locator('#btn-run').click();
    await expect(page.locator('#input-error')).toContainText(/Analysis refused: Line 1/);
    expect(await page.evaluate(() => window._almLastMlma())).toBe(null);
    await expect(page.locator('#body tr')).toHaveCount(0);
    await expect(page.locator('#forest > *')).toHaveCount(0);
  }
  await page.locator('#src').fill(initial);
  await page.locator('#btn-run').click();
  await expect(page.locator('#input-error')).toBeHidden();
  expect((await page.evaluate(() => window._almLastMlma()))?.k).toBeGreaterThan(3);
});

test('multilevel: small-screen keyboard workflow remains operable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL);
  await page.locator('#src').fill('A, 0, 0.1\nB, 0.2, 0.12\nC, -0.1, 0.14');
  await page.locator('#btn-run').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#input-error')).toBeHidden();
  await expect(page.locator('#body tr')).toHaveCount(4);
  expect((await page.evaluate(() => window._almLastMlma()))?.k).toBe(3);
});
