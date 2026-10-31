import { test, expect } from '@playwright/test';

// DTA SROC share state carries exactly six axis-control values (x and y minimum, maximum and log, from the axisControls config in
// dta-sroc/index.html). When page setup stops before the axis controls mount (one of the helper scripts below fails
// to load), Run analysis still works, so the share adapter used to write a link with axes: [] that a healthy page
// refuses, and restoring a valid link into such a page skipped the axes and reported success. The adapter must
// refuse to create such a link, and must refuse to restore into a page without axis controls, changing nothing.
const APP = 'dta-sroc', AXES = '#alm-axis-mount input', COUNT = 6, EDIT = '#f-title';
const MESSAGE = 'Axis controls did not load; reload the page.';
const blockable = ['csv-upload.js', 'axis-controls.js', 'plot-export.js'];

async function open(page, blocked) {
  if (blocked) await page.route('**/' + blocked, route => route.abort('connectionreset'));
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(app => !!window.AlmFeatures?.get(app)?.share, APP);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('#svg-host svg')).toBeVisible();
}
async function share(page) {
  await page.evaluate(app => AlmFeatures.open(app, 'share'), APP);
  await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
}

test('DTA SROC share control: a fully loaded page creates a link that restores', async ({ page, browser, baseURL }) => {
  await open(page, null);
  expect(await page.locator(AXES).count()).toBe(COUNT);
  await share(page);
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link ready');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const context = await browser.newContext({ baseURL });
  const restored = await context.newPage(); await restored.goto(link);
  await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  await context.close();
});

for (const blocked of blockable) {
  test('DTA SROC share refuses to create a link when hub/shared/' + blocked + ' did not load (axis controls missing)', async ({ page }) => {
    await open(page, 'hub/shared/' + blocked);
    expect(await page.locator(AXES).count()).toBe(0);
    await share(page);
    await expect(page.locator('[data-testid=share-status]')).toHaveText('Could not create a share link: ' + MESSAGE);
    await expect(page.getByLabel('Share link', { exact: true })).toHaveValue('');
  });
}

test('DTA SROC share refuses to restore a valid link into a page without axis controls, changing nothing', async ({ page, browser, baseURL }) => {
  await open(page, null);
  const original = await page.locator(EDIT).inputValue();
  const edited = 'Shared \u00c9tude title';
  expect(edited).not.toBe(original);
  await page.locator(EDIT).fill(edited);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await share(page);
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link ready');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const context = await browser.newContext({ baseURL });
  const restored = await context.newPage();
  await restored.route('**/hub/shared/axis-controls.js', route => route.abort('connectionreset'));
  await restored.goto(link);
  await expect(restored.locator('[data-testid=share-status]')).toHaveText(
    'This share link could not be opened (' + MESSAGE + '). Nothing was changed.');
  await expect(restored.locator(EDIT)).toHaveValue(original);
  await context.close();
});
