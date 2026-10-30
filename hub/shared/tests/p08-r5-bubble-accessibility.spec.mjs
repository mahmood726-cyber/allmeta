import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const exampleName = 'Example meta-regression. Bubble plot: Effect (logOR) versus Baseline LVEF (%), with fitted regression line and 95% confidence band.';

async function namedPlot(page, name) {
  const svg = page.locator('#svg-host svg');
  await expect(svg).toHaveAttribute('role', 'img');
  await expect(svg).toHaveAccessibleName(name);
  await expect(svg.locator(':scope > title')).toHaveText(name);
  await expect(page.locator('#svg-host').getByRole('img', { name, exact: true })).toBeVisible();
}

test('P08-R5 browser: preview and downloaded SVG expose current labels; fallbacks and unfittable data stay accurate', async ({ page, context }) => {
  await page.goto('/meta-regression/');
  await namedPlot(page, exampleName);
  await expect(page.locator('#svg-host svg circle')).toHaveCount(8);
  await expect(page.locator('#svg-host svg polygon')).toHaveCount(1);

  for (const [id, value] of Object.entries({ title: 'Trial "A" & <B>', modlabel: 'Dose <5 & "high"', effectlabel: "Effect >0 & 'risk'" })) {
    await page.locator('#f-' + id).fill(value);
  }
  await page.locator('#btn-run').click();
  const customName = 'Trial "A" & <B>. Bubble plot: Effect >0 & \'risk\' versus Dose <5 & "high", with fitted regression line and 95% confidence band.';
  await namedPlot(page, customName);
  await expect(page.locator('#svg-host svg B')).toHaveCount(0);

  const panel = page.getByRole('group', { name: 'Download plots', exact: true });
  await panel.getByLabel('Format', { exact: true }).selectOption('svg');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download Bubble plot', exact: true }).click()
  ]);
  const exported = readFileSync(await download.path(), 'utf8');
  const standalone = await context.newPage();
  try {
    // Exercise the browser's SVG parser and accessible-name computation on the
    // actual downloaded bytes, independently of the preview's DOM.
    await standalone.setContent(exported);
    await expect(standalone.getByRole('img', { name: customName, exact: true })).toBeVisible();
    await expect(standalone.locator('svg > title')).toHaveText(customName);
    await expect(standalone.locator('svg > metadata#truthcert')).toHaveCount(1);
    await expect(standalone.locator('svg circle')).toHaveCount(8);
  } finally {
    await standalone.close();
  }
  await namedPlot(page, customName);

  for (const id of ['title', 'modlabel', 'effectlabel']) await page.locator('#f-' + id).fill('');
  await page.locator('#btn-run').click();
  await namedPlot(page, 'Bubble plot: Effect versus Moderator, with fitted regression line and 95% confidence band.');
  await page.locator('#f-data').fill('A, 0.1, 0.1, 5\nB, 0.2, 0.1, 5\nC, 0.3, 0.1, 5');
  await page.locator('#btn-run').click();
  await namedPlot(page, 'Bubble plot: Effect versus Moderator.');
  await expect(page.locator('#svg-host svg polygon, #svg-host svg polyline')).toHaveCount(0);
  expect(await page.evaluate(() => window._almLastFitted())).toBeNull();
});

test('P08-R5 browser plant: removing image metadata fails the same name assertion while geometry and statistics stay intact', async ({ page }) => {
  await page.goto('/meta-regression/');
  await namedPlot(page, exampleName);
  const snapshot = () => page.evaluate(() => {
    const svg = document.querySelector('#svg-host svg').cloneNode(true);
    for (const attr of ['role', 'aria-label', 'aria-labelledby']) svg.removeAttribute(attr);
    svg.querySelector('title')?.remove();
    return { svg: svg.outerHTML, stats: document.querySelector('#stats-wrap').innerHTML,
      fit: window._almLastFitted() };
  });
  const before = await snapshot();
  await page.locator('#svg-host svg').evaluate(svg => {
    svg.removeAttribute('role');
    svg.removeAttribute('aria-label');
    svg.querySelector('title').remove();
  });
  // This assertion must fail for the metadata defect. Do not mark the test as
  // an expected failure: the control assertions below must still execute.
  await expect(expect(page.locator('#svg-host svg')).toHaveAccessibleName(exampleName, { timeout: 250 })).rejects.toThrow();
  await expect(page.locator('#svg-host svg')).toHaveCount(1);
  await expect(page.locator('#svg-host svg circle')).toHaveCount(8);
  expect(await snapshot()).toEqual(before);
  await page.locator('#btn-run').click();
  await namedPlot(page, exampleName);
});
