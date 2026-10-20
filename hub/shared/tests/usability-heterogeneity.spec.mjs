import { test, expect } from '@playwright/test';

// Fail-closed study input for the heterogeneity page (fix/usability-heterogeneity).
//
// CARDS is every summary card the unmodified page shows for its own built-in example, at the precision it displays.
// It is read off the page, not taken from anywhere else, and its only job here is to prove that refusing malformed
// rows changed nothing a user sees for valid input. Agreement with metafor stays where it belongs: the 131,781-check
// corpus replay in validate-heterogeneity.spec.mjs and the parity specs. Nothing here replaces those.
const CARDS = [
  'k=8',
  'Q (df=7)=18.82  p=0.009',
  'I² (Q-based)=62.8%',
  'I² (model-based)=65.1% [15.1, 92.3] (Q-profile)',
  'τ² 95% CI (Q-profile)=[0.0028, 0.1872]',
  'τ² (PM)=0.0294',
  'τ² (REML)=0.0279',
  'τ² (DL)=k<10 (skipped)',
  'τ² used=0.0294 (PM)',
  'RE pooled (z)=-0.207 [-0.357, -0.056]',
  'RE pooled (modified HK + t)=-0.207 [-0.388, -0.025]',
  '95% PI (model SE + t)=[-0.651, 0.237]',
];

const cards = page => page.evaluate(() =>
  [...document.querySelectorAll('#stats-wrap .stat')]
    .map(s => s.querySelector('.k').textContent.trim() + '=' + s.querySelector('.v').textContent.trim()));
const fitted = page => page.evaluate(() => !!window._almLastFE());
const summary = page => page.evaluate(() => JSON.stringify(window._almLastFE()));

test.beforeEach(async ({ page }) => {
  await page.goto('heterogeneity/index.html');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('heterogeneity/index.html');
  await expect(page.locator('#stats-wrap .stat')).toHaveCount(CARDS.length);
  expect(await cards(page)).toEqual(CARDS);
});

const data = page => page.locator('#f-data').inputValue();

function changeCell(text, row, column, value) {
  const lines = text.split('\n'), cells = lines[row - 1].split(',');
  cells[column] = ' ' + value;
  lines[row - 1] = cells.join(',');
  return lines.join('\n');
}

// A refusal must name the row and study, clear the cards and the leave-one-out table, mark the textarea invalid,
// leave no fitted result behind, and block every result and plot export.
async function expectRefusal(page, message) {
  const warning = page.locator('#warn-banner');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning).toHaveAttribute('aria-live', 'polite');
  await expect(warning).toContainText(message);
  await expect(page.locator('#stats-wrap')).toBeEmpty();
  await expect(page.locator('#loo-table')).toBeEmpty();
  await expect(page.locator('#f-data')).toHaveAttribute('aria-invalid', 'true');
  expect(await fitted(page)).toBe(false);

  const downloads = [];
  const record = d => downloads.push(d.suggestedFilename());
  page.on('download', record);
  try {
    const buttons = page.locator('#alm-export-mount button')
      .or(page.locator('#alm-plot-mount button').filter({ hasText: /^Download/ }))
      .or(page.locator('#btn-json'));
    expect(await buttons.count()).toBeGreaterThan(5);
    for (const button of await buttons.all()) {
      await button.click();
      await expect(page.locator('#warn-banner')).toContainText('No valid results to export');
    }
    await page.waitForEvent('download', { timeout: 600 }).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    });
    expect(downloads).toEqual([]);
  } finally {
    page.off('download', record);
  }
  await expect(page.locator('#warn-banner')).toContainText(message);   // the diagnosis survives the export attempts
}

test('built-in example: every displayed number is unchanged and a rerun is byte-identical', async ({ page }) => {
  const before = await summary(page);
  await page.locator('#btn-run').click();
  expect(await cards(page)).toEqual(CARDS);
  expect(await summary(page)).toBe(before);
  await expect(page.locator('#f-data')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#analysis-status')).toBeVisible();
});

// Row 2 of the built-in example is the first study. "0x10" is the important one: Number("0x10") is 16, so the old
// parser silently analysed a study at estimate 16 instead of refusing the row.
for (const [field, column] of [['estimate', 1], ['SE', 2]]) {
  // "1,5" is deliberately NOT in this list: in a comma-separated row the comma is a field separator, so a European
  // decimal becomes an extra field that the label absorbs. That is inherent to the format and unchanged from main.
  for (const token of ['oops', '0.2oops', '', 'NaN', 'Infinity', '1e309', '0x10']) {
    test(`refuses ${field} token ${JSON.stringify(token)} without a partial pool or export`, async ({ page }) => {
      const raw = changeCell(await data(page), 2, column, token);
      await page.locator('#f-data').fill(raw);
      await expectRefusal(page, 'Line 2');
      await expect(page.locator('#f-data')).toHaveValue(raw);
    });
  }
}

test('refuses a non-positive SE and a two-column row, naming the row', async ({ page }) => {
  const text = await data(page);
  for (const se of ['0', '-0.1']) {
    await page.locator('#f-data').fill(changeCell(text, 2, 2, se));
    await expectRefusal(page, 'positive, numerically representable SE required');
  }
  await page.locator('#f-data').fill(text + '\nShort row, 0.5');
  await expectRefusal(page, 'need label, estimate and SE fields');
});

test('a single valid study is refused with the two-study requirement, not silently', async ({ page }) => {
  const rows = (await data(page)).split('\n').filter(line => !line.startsWith('#'));
  await page.locator('#f-data').fill(rows[0]);
  await expect(page.locator('#warn-banner')).toContainText('Need ≥2 study rows');
  expect(await fitted(page)).toBe(false);
  await expect(page.locator('#stats-wrap')).toBeEmpty();
  await expect(page.locator('#svg-host')).toContainText('No fitted analysis');
});

test('keeps the documented format: comments, blank lines, tabs, quoted labels and full numeric tokens', async ({ page }) => {
  const text = await data(page), before = await summary(page);
  const rows = text.split('\n').filter(line => !line.startsWith('#'));
  const retyped = rows.map(line => {
    const cells = line.split(',').map(cell => cell.trim());
    const estimate = Number(cells[cells.length - 2]);
    cells[cells.length - 2] = (estimate < 0 ? '-' : '+') + Math.abs(estimate) + 'e0';
    cells[cells.length - 1] = cells[cells.length - 1].replace(/^0\./, '.');
    return cells.join('\t');
  }).join('\n');
  await page.locator('#f-data').fill('# leading comment\n\n' + retyped + '\n\n# trailing comment');
  expect(await cards(page)).toEqual(CARDS);
  expect(await summary(page)).toBe(before);
  // a header row, as the page's own header test accepts it
  await page.locator('#f-data').fill('label, estimate, se\n' + rows.join('\n'));
  expect(await cards(page)).toEqual(CARDS);
  expect(await summary(page)).toBe(before);
});

test('a label containing a comma is kept whole, not split into a bad row', async ({ page }) => {
  const rows = (await data(page)).split('\n').filter(line => !line.startsWith('#'));
  const relabelled = rows.map(line => 'Site A, ' + line).join('\n');
  await page.locator('#f-data').fill(relabelled);
  expect(await cards(page)).toEqual(CARDS);
  expect(await page.evaluate(() => window._almLastStudies()[0].label)).toBe('Site A, ' + rows[0].split(',')[0].trim());
});

test('"Verify in R" does not open the validator when there is nothing to save', async ({ page }) => {
  await page.locator('#f-data').fill(changeCell(await data(page), 2, 1, 'oops'));
  await expectRefusal(page, 'Line 2');
  const opened = [];
  page.on('popup', p => opened.push(p.url()));
  await page.locator('#btn-validate-webr').click();
  await page.waitForTimeout(400);
  expect(opened).toEqual([]);
  await expect(page.locator('#warn-banner')).toContainText('Cannot save: fit at least two valid studies first.');
});

test('exports work again as soon as the data are valid', async ({ page }) => {
  const text = await data(page);
  await page.locator('#f-data').fill(changeCell(text, 2, 1, 'oops'));
  await expectRefusal(page, 'Line 2');
  await page.locator('#f-data').fill(text);
  expect(await cards(page)).toEqual(CARDS);
  const session = page.waitForEvent('download');
  await page.locator('#btn-json').click();
  expect((await session).suggestedFilename()).toMatch(/\.json$/);
});

test('keyboard: Tab from the study box reaches Run analysis and Enter reruns', async ({ page }) => {
  await page.locator('#f-data').focus();
  await expect(page.locator('#f-data')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-run')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await cards(page)).toEqual(CARDS);
});
