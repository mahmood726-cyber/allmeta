import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL('./fixtures/features/component-nma/review-cases.js', import.meta.url), 'utf8'), sandbox);
const cases = sandbox.AlmReviewCases;
const heterogeneous = JSON.parse(fs.readFileSync(new URL('../../../component-nma/tests/fixtures/cnma-validation-oracle.json', import.meta.url), 'utf8')).cases.heterogeneous;

for (const name of Object.keys(cases)) {
  test(name, async ({ page }) => {
    await page.goto('/component-nma/index.html');
    await page.addScriptTag({ url: '/hub/shared/tests/fixtures/features/component-nma/review-cases.js' });
    await page.evaluate(({ name, ref }) => AlmReviewCases[name](ref), { name, ref: heterogeneous });
  });
}

test('ENTRY: unsupported confirmation is unavailable and pasted contrasts remain usable', async ({ page }) => {
  await page.goto('/component-nma/index.html');
  await page.evaluate(() => AlmFeatures.open('component-nma', 'entry'));
  const panel = page.locator('#alm-f-panel-entry');
  const paste = panel.locator('textarea');
  const text = 'study\tt1\tt2\tyi\tsei\none\ta\tcontrol\t-.3\t.1\ntwo\tb\tcontrol\t.2\t.1';
  await paste.fill(text);
  // Current v2-core omits this action for schemas without paper extraction.
  await expect(panel.getByRole('button', { name: 'Extract paper text with source confirmation', exact: true })).toHaveCount(0);
  await expect(panel.locator('.alm-entry-no-paper')).toContainText("Extracting from paper text is not available for this app's inputs");
  await expect(panel).toContainText('Source confirmation is not available for contrast tables');
  await expect(paste).toHaveValue(text);
  await panel.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 rows.');
  await expect(paste).toHaveValue(text);
  await expect(page.locator('#src')).toHaveValue('a | control | -0.3 | 0.1\nb | control | 0.2 | 0.1');
  await expect(page.locator('#comp-body tr')).toHaveCount(2);
  expect(await page.evaluate(() => _almLastCnma().comps)).toEqual(['a', 'b']);
});
