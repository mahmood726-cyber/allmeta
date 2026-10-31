import { test, expect } from '@playwright/test';

// GOSH share state carries six axis-control values. When page setup stops before the axis controls mount
// (a script such as hub/shared/csv-upload.js, plot-export.js or axis-controls.js fails to load), Run analysis
// still works, so the share adapter used to write a link with axes: [] that its own set() refuses
// ("Missing axis settings."). The adapter must refuse to create such a link, and must refuse to restore
// into a page without axis controls instead of silently skipping the axes.
const blockable = ['hub/shared/csv-upload.js', 'hub/shared/plot-export.js', 'hub/shared/axis-controls.js'];

async function open(page, blocked) {
  if (blocked) await page.route('**/' + blocked, route => route.abort('connectionreset'));
  await page.goto('/gosh/index.html');
  await page.waitForFunction(() => !!window.AlmFeatures?.get('gosh')?.share);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('#plot')).toBeVisible();
  await page.evaluate(() => AlmFeatures.open('gosh', 'share'));
}

test('GOSH share control: a fully loaded page creates a link that restores', async ({ page, browser, baseURL }) => {
  await open(page, null);
  expect(await page.locator('#alm-axis-mount input').count()).toBe(6);
  await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link ready');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const context = await browser.newContext({ baseURL });
  const restored = await context.newPage(); await restored.goto(link);
  await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  await context.close();
});

for (const blocked of blockable) {
  test('GOSH share refuses to create a link when ' + blocked + ' did not load (axis controls missing)', async ({ page }) => {
    await open(page, blocked);
    expect(await page.locator('#alm-axis-mount input').count()).toBe(0);
    await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
    await expect(page.locator('[data-testid=share-status]')).toHaveText('Could not create a share link: Axis controls did not load; reload the page.');
    await expect(page.getByLabel('Share link', { exact: true })).toHaveValue('');
  });
}

test('GOSH share refuses to restore a valid link into a page without axis controls', async ({ page, browser, baseURL }) => {
  await open(page, null);
  await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link ready');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const context = await browser.newContext({ baseURL });
  const restored = await context.newPage();
  await restored.route('**/hub/shared/axis-controls.js', route => route.abort('connectionreset'));
  await restored.goto(link);
  await expect(restored.locator('[data-testid=share-status]')).toHaveText(
    'This share link could not be opened (Axis controls did not load; reload the page.). Nothing was changed.');
  await context.close();
});
