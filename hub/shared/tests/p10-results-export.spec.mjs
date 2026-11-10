import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../results-export.js', import.meta.url), 'utf8');
const valid = 'Alpha, 3, 50, 8, 50\nBeta, 4, 60, 9, 60';
for (const action of ['csv', 'json', 'md', 'report-md', 'report-txt']) {
  test(`P10 browser: ${action} refuses a failed mh-peto run visibly without a download`, async ({ page }) => {
    const errors = [], downloads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('/mh-peto/index.html');
    await page.locator('#src').fill(valid);
    await page.locator('#btn-run').click();
    expect(await page.evaluate(() => _almLastMhPeto().k)).toBe(2);
    await page.locator('#src').fill('Broken, 51, 50, 8, 50');
    await page.locator('#btn-run').click();
    expect(await page.evaluate(() => _almLastMhPeto())).toBeNull();
    await page.locator(`#alm-export-mount [data-action="${action}"]`).click();
    const status = page.locator('#alm-export-mount [role="status"]');
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveText('Run a successful analysis before exporting results.');
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    // Control: retry through the real app, then inspect the downloaded fresh result.
    await page.locator('#src').fill(valid + '\nGamma, 5, 70, 10, 70');
    await page.locator('#btn-run').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(`#alm-export-mount [data-action="${action}"]`).click(),
    ]);
    const text = readFileSync(await download.path(), 'utf8');
    if (action === 'csv') expect(text.split('\r\n')).toContain('k,3');
    else if (action === 'json') expect(JSON.parse(text).k).toBe(3);
    else if (action === 'report-txt') expect(text).toMatch(/^k: 3$/m);
    else expect(text).toMatch(/\| k\s*\| 3\s*\|/);
    await expect(status).toHaveText('');
    expect(downloads).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test('P10 browser: undefined results never invoke receipt collection or signing', async ({ page }) => {
  await page.goto('/');
  await page.setContent('<div id="export"></div>');
  await page.addScriptTag({ content: source });
  await page.evaluate(() => {
    window.receiptCalls = 0;
    window.AlmTruthCertExport = { buildReceipt() { receiptCalls++; throw Error('must not sign'); } };
    alm.resultsExport({ target: '#export', getResults: () => undefined,
      getReceiptInput() { receiptCalls++; return {}; } });
  });
  const downloads = [], errors = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  page.on('pageerror', error => errors.push(error.message));
  for (const action of ['csv', 'json', 'md', 'report-md', 'report-txt']) {
    await page.locator(`[data-action="${action}"]`).click();
    await expect(page.getByRole('status')).toHaveText('Run a successful analysis before exporting results.');
  }
  expect(await page.evaluate(() => receiptCalls)).toBe(0);
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
});
