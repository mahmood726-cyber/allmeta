/**
 * DTA Deeks inference integrity: an asymmetry slope cannot be inferred when
 * the effective study sizes do not vary. Genuine app URL, file input and
 * plot-download/refusal/recovery test. This is NOT mada parity certification.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP = 'http://localhost:8088/dta-sroc/';
const header = 'study,TP,FP,FN,TN\n';
const equalESS = header + [
  'A,60,10,40,90',
  'B,65,8,35,92',
  'C,70,7,30,93',
  'D,75,6,25,94',
].join('\n');
const variedESS = header + [
  'A,60,10,40,90',
  'B,82,20,18,180',
  'C,45,25,55,75',
  'D,90,30,10,270',
  'E,110,50,20,210',
].join('\n');

async function upload(page, csv, name) {
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
  });
  await page.locator('#btn-run').click();
}

test('Deeks non-identification is refused; real CSV upload, plot, export and Undo recover', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await upload(page, equalESS, 'equal-effective-sample-size.csv');
  await expect(page.locator('#warn-banner')).toContainText("Deeks' test not estimable");
  await expect(page.locator('#deeks-host svg')).toHaveCount(0);
  await expect(page.locator('#svg-host svg')).toHaveCount(1);
  await expect(page.locator('#stats-wrap')).not.toContainText("Deeks' test p");
  expect(await page.evaluate(() => window.__almDeeks())).toBeNull();

  // The export control must refuse absent/undefined Deeks plot data.
  await page.getByRole('button', { name: 'Download Deeks plot', exact: true }).click();
  await expect(page.locator('#alm-plot-mount [role="status"]')).toContainText('Export failed: No SVG');

  // A valid, varying-ESS dataset can be fitted and exported without stale invalid data.
  await upload(page, variedESS, 'variable-effective-sample-size.csv');
  await expect(page.locator('#warn-banner')).not.toContainText("Deeks' test not estimable");
  await expect(page.locator('#deeks-host svg')).toHaveCount(1);
  expect(await page.evaluate(() => Number.isFinite(window.__almDeeks()?.p))).toBe(true);
  await page.locator('#alm-plot-mount select').first().selectOption('svg');
  const transfer = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Deeks plot', exact: true }).click();
  const file = await transfer;
  expect(file.suggestedFilename()).toMatch(/dta-sroc-deeks\.svg$/);
  const svg = readFileSync(await file.path(), 'utf8');
  expect(svg).toMatch(/<svg/);
  expect(svg).not.toMatch(/NaN|Infinity/);

  // Undo the upload: the preceding non-identified state is restored and refused.
  await page.locator('#alm-undo-mount [data-action="undo"]').click();
  await expect(page.locator('#warn-banner')).toContainText("Deeks' test not estimable");
  await expect(page.locator('#deeks-host svg')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#warn-banner')).toBeVisible();
});
