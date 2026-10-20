import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const PAGE = '/dta-sroc/index.html';
const FIELDS = ['TP', 'FP', 'FN', 'TN'];
const GOOD = [
  'Study A,85,10,15,140', 'Study B,62,12,18,108', 'Study C,110,25,40,200',
  'Study D,55,6,8,90', 'Study E,130,40,30,300', 'Study F,92,18,25,185',
  'Study G,74,8,12,130',
].join('\n');
const HEADER = 'study,TP,FP,FN,TN\n';

// Captured from the unmodified app's EXAMPLE through its own analyse() and
// unchanged shared engine, using REML / all. These are displayed precisions,
// not new reference estimates or substitutes for the lead's full R corpus.
const HEADLINES = {
  'Summary Se (REML)': '0.811 [0.767, 0.848]',
  'Summary Sp (REML)': '0.910 [0.886, 0.929]',
  'LR+': '9.01 [6.92, 11.74]',
  'LR−': '0.21 [0.17, 0.26]',
  'AUC (partial AUC)': '0.932 (0.792)',
};

async function current(page) {
  return page.evaluate(() => window.__almResults());
}
async function ready(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__almResults === 'function');
  await expect(page.locator('#analysis-status')).toHaveText('Analysis updated');
  expect((await current(page)).bivariate).not.toBeNull();
}
async function headlines(page) {
  for (const [label, value] of Object.entries(HEADLINES)) {
    const card = page.locator('#stats-wrap .stat').filter({
      has: page.getByText(label, { exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(value);
  }
}
async function noExports(page, all = false) {
  const buttons = all
    ? page.locator('#alm-export-mount button, #alm-plot-mount button').filter({ hasText: /^(Methods\+Results|\.txt|Export results|CSV|Data|Download)/ })
    : page.locator('#alm-export-mount [data-action="json"], #alm-plot-mount button').filter({ hasText: /^(Export results \(JSON\)|Download selected)$/ });
  expect(await buttons.count()).toBe(all ? 9 : 2);
  const downloads = [];
  const record = download => downloads.push(download.suggestedFilename());
  page.on('download', record);
  try {
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).click();
      await expect(page.locator('#analysis-status')).toBeVisible();
      await expect(page.locator('#analysis-status')).toHaveText('No valid results to export');
    }
    // Observe deferred downloads as well as synchronous ones during the clicks.
    await page.waitForEvent('download', { timeout: 600 }).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    });
    expect(downloads).toEqual([]);
  } finally {
    page.off('download', record);
  }
}
async function rejected(page, row, field, csv = false) {
  const warning = page.locator('#warn-banner');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning).toHaveAttribute('aria-live', 'polite');
  await expect(warning).toContainText(csv ? 'CSV rejected' : 'Analysis blocked');
  await expect(warning).toContainText(row);
  await expect(warning).toContainText(field);
  const result = await current(page);
  expect(result.k).toBe(0);
  expect(result.rows).toEqual([]);
  expect(result.bivariate).toBeNull();
  expect(result.meta_regression).toBeNull();
  expect(result.alpha).toBeNull();
  expect(result.beta).toBeNull();
  expect(await page.evaluate(() => [
    window.__almBivariate(), window.__almMetaRegression(), window.__almDeeks(),
  ])).toEqual([null, null, null]);
  await expect(page.locator('#stats-wrap')).toBeEmpty();
  await expect(page.locator('#svg-host svg, #fagan-host svg, #deeks-host svg')).toHaveCount(0);
  await noExports(page);
  // Export refusals must not overwrite the row/field explanation.
  await expect(warning).toContainText(row);
  await expect(warning).toContainText(field);
}
async function csvPaste(page, body) {
  await page.locator('#alm-csv-mount textarea').fill(body);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
}
async function jsonDownload(page, button) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button.click(),
  ]);
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
function withoutTimestamp(result) {
  const { _savedAt, ...rest } = result;
  return rest;
}

test('default example retains full displayed headline precision', async ({ page }) => {
  await ready(page);
  expect((await current(page)).k).toBe(7);
  await headlines(page);
});

for (const count of [0, 1, 2, 3]) {
  test('U1: ' + count + ' studies explains the four-study minimum and recovers', async ({ page }) => {
    await ready(page);
    await page.locator('#f-data').fill(GOOD.split('\n').slice(0, count).join('\n'));
    const warning = page.locator('#warn-banner');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('aria-live', 'polite');
    await expect(warning).toContainText('needs at least 4 studies');
    await expect(warning).toContainText('currently ' + count);
    expect((await current(page)).bivariate).toBeNull();
    await expect(page.locator('#stats-wrap')).not.toContainText('Summary Se');
    if (count === 0) {
      await expect(page.locator('#svg-host')).toContainText('Enter at least 4 studies');
      await expect(page.locator('#svg-host svg')).toHaveCount(0);
    } else {
      await expect(warning).toContainText('no bivariate fit is available');
    }
    await noExports(page);
    await page.locator('#f-data').fill(GOOD);
    await expect(page.locator('#analysis-status')).toHaveText('Analysis updated');
    await headlines(page);
  });
}

test('U2: fixed ROC axes are visibly explained and all controls disabled', async ({ page }) => {
  await ready(page);
  const note = page.locator('#roc-axis-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('fixed [0,1] domain on both axes');
  await expect(page.locator('#alm-axis-mount')).toHaveAttribute('aria-describedby', 'roc-axis-note');
  const controls = page.locator('#alm-axis-mount input, #alm-axis-mount select, #alm-axis-mount button');
  expect(await controls.count()).toBeGreaterThan(0);
  for (let i = 0; i < await controls.count(); i++) await expect(controls.nth(i)).toBeDisabled();
  const svg = await page.locator('#svg-host').innerHTML();
  await page.locator('#f-title').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#alm-axis-mount'))).toBe(false);
  expect(await page.locator('#svg-host').innerHTML()).toBe(svg);
});

test('U3: distinct JSON labels download input session and results schemas', async ({ page }) => {
  await ready(page);
  const save = page.getByRole('button', { name: 'Save input session (JSON)', exact: true });
  const exportResults = page.getByRole('button', { name: 'Export results (JSON)', exact: true });
  await expect(save).toHaveAttribute('id', 'btn-json');
  const state = await jsonDownload(page, save);
  expect(state._schema).toBe('dta-sroc-v1');
  expect(state.data).toBe(await page.locator('#f-data').inputValue());
  expect(state.method).toBe('reml');
  expect(state).not.toHaveProperty('bivariate');
  const result = await jsonDownload(page, exportResults);
  expect(result._schema).toBe('dta-sroc-results-v2');
  expect(withoutTimestamp(result)).toEqual(withoutTimestamp(await current(page)));
  expect(result.k).toBe(7);
  expect(result.bivariate.method).toBe('reml');
  expect(result.bivariate.sens.toFixed(3)).toBe('0.811');
  expect(result.bivariate.spec.toFixed(3)).toBe('0.910');
  expect(result).not.toHaveProperty('data');
});

for (const input of ['native', 'CSV']) {
  for (const [fieldIndex, field] of FIELDS.entries()) {
    for (const [kind, token] of [
      ['numeric suffix', '0.2oops'], ['text', 'oops'], ['empty cell', ''], ['blank cell', '   '],
    ]) {
      test(input + ': rejects ' + kind + ' in ' + field + ' with study and field, no partial fit or exports', async ({ page }) => {
        await ready(page);
        const counts = ['85', '10', '15', '140'];
        counts[fieldIndex] = token;
        const body = ['Bad study,' + counts.join(','), GOOD].join('\n');
        if (input === 'CSV') await csvPaste(page, HEADER + body);
        else await page.locator('#f-data').fill(body);
        await rejected(page, 'Bad study', field, input === 'CSV');
        await expect(page.locator('#warn-banner')).toContainText(input === 'CSV' ? 'Row 1' : 'Line 1');
        await page.locator('#f-data').fill(GOOD);
        await headlines(page);
      });
    }
  }
  for (const [kind, token] of [
    ['negative', '-1'], ['fractional', '1.5'], ['non-finite', 'Infinity'],
    ['NaN', 'NaN'], ['overflow', '1e999'], ['unsafe integer', '9007199254740992'],
    ['hexadecimal', '0x10'], ['incomplete exponent', '1e'],
  ]) {
    test(input + ': rejects ' + kind + ' count in a middle row', async ({ page }) => {
      await ready(page);
      const rows = GOOD.split('\n');
      rows.splice(3, 0, 'Bad middle,85,10,15,' + token);
      if (input === 'CSV') await csvPaste(page, HEADER + rows.join('\n'));
      else await page.locator('#f-data').fill(rows.join('\n'));
      await rejected(page, 'Bad middle', 'TN', input === 'CSV');
      await expect(page.locator('#warn-banner')).toContainText(input === 'CSV' ? 'Row 4' : 'Line 4');
    });
  }
}

test('incomplete native row names missing TN and clears preceding results', async ({ page }) => {
  await ready(page);
  await page.locator('#f-data').fill('Incomplete,85,10,15\n' + GOOD);
  await rejected(page, 'Incomplete', 'TN');
});

test('malformed CSV file upload names the row and field and clears preceding results', async ({ page }) => {
  await ready(page);
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({
    name: 'bad-counts.csv', mimeType: 'text/csv',
    buffer: Buffer.from(HEADER + '"Bad, quoted study",85,0.2oops,15,140\n' + GOOD),
  });
  await rejected(page, 'Bad, quoted study', 'FP', true);
});

test('all result and plot export buttons refuse invalid input; session saving remains available', async ({ page }) => {
  await ready(page);
  await page.locator('#f-data').fill('Bad study,85,10,oops,140\n' + GOOD);
  await noExports(page, true);
  const session = await jsonDownload(page, page.locator('#btn-json'));
  expect(session._schema).toBe('dta-sroc-v1');
  expect(session.data).toContain('oops');
  await page.locator('#f-data').fill(GOOD);
  const result = await jsonDownload(page, page.locator('#alm-export-mount [data-action="json"]'));
  expect(result.k).toBe(7);
  expect(result.bivariate.sens.toFixed(3)).toBe('0.811');
  const [plot] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.locator('#alm-plot-mount').getByLabel('Format', { exact: true }).selectOption('svg');
      await page.getByRole('button', { name: 'Download SROC plot', exact: true }).click();
    })(),
  ]);
  expect(plot.suggestedFilename()).toBe('dta-sroc-sroc.svg');
  expect(await readFile(await plot.path(), 'utf8')).toContain('<svg');
});

test('native headers, comments, blank lines, tab separators and quoted labels remain accepted', async ({ page }) => {
  await ready(page);
  const baseline = await current(page);
  const body = GOOD.replace('Study A', '"Study, Alpha"');
  await page.locator('#f-data').fill('# Counts only\n\nstudy,TP,FP,FN,TN\n' + body + '\n\n# End');
  let result = await current(page);
  expect(result.k).toBe(7);
  expect(result.bivariate).toEqual(baseline.bivariate);
  await headlines(page);
  await page.locator('#f-data').fill(HEADER + GOOD.replaceAll(',', '\t'));
  result = await current(page);
  expect(withoutTimestamp(result)).toEqual(withoutTimestamp(baseline));
});

test('CSV preserves quoted labels and accepted integer-valued numeric notation', async ({ page }) => {
  await ready(page);
  const baseline = await current(page);
  const body = GOOD.replace('Study A,85,10,15,140', '"Study, Alpha",+85,1e1,15.0,1.4e2');
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({
    name: 'quoted-counts.csv', mimeType: 'text/csv', buffer: Buffer.from(HEADER + body),
  });
  await expect(page.locator('#f-data')).toHaveValue(/^Study, Alpha, 85, 10, 15, 140/);
  const result = await current(page);
  expect(result.rows[0].study).toBe('Study, Alpha');
  expect([result.rows[0].TP, result.rows[0].FP, result.rows[0].FN, result.rows[0].TN]).toEqual([85, 10, 15, 140]);
  expect(result.bivariate).toEqual(baseline.bivariate);
  await headlines(page);
});

test('CSV without a study header retains all rows with generated labels', async ({ page }) => {
  await ready(page);
  const baseline = await current(page);
  const rows = GOOD.split('\n').map(row => row.slice(row.indexOf(',') + 1));
  await csvPaste(page, 'TP,FP,FN,TN\n' + rows.join('\n'));
  const result = await current(page);
  expect(result.rows.map(row => row.study)).toEqual(rows.map((_, i) => 'Study ' + (i + 1)));
  expect(result.bivariate).toEqual(baseline.bivariate);
});

test('zero cells retain the selected correction; a refused fit cannot export', async ({ page }) => {
  await ready(page);
  await page.locator('#f-data').fill(GOOD.replace('Study A,85', 'Study A,0'));
  expect((await current(page)).bivariate).not.toBeNull();
  expect((await current(page)).rows[0].corrected).toBe(1);
  await page.locator('#f-cc').selectOption('none');
  expect((await current(page)).bivariate).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('zero cell');
  await noExports(page);
  await page.locator('#f-cc').selectOption('all');
  expect((await current(page)).bivariate).not.toBeNull();
});

for (const [example, count] of [
  ['AuditC', 14], ['Dementia', 33], ['IAQ', 20], ['SAQ', 31], ['skin_tests', 10], ['smoking', 51],
]) {
  test('built-in ' + example + ' remains usable with all source rows', async ({ page }) => {
    await ready(page);
    await page.locator('#f-example').selectOption(example);
    await page.locator('#btn-example').click();
    await expect(page.locator('#analysis-status')).toHaveText('Analysis updated');
    const result = await current(page);
    expect(result.k).toBe(count);
    expect(result.bivariate).not.toBeNull();
    if (example === 'smoking') expect(result.meta_regression).not.toBeNull();
    const sourceCounts = await page.evaluate(key => window.DTA_EXAMPLES[key].data.split(/\r?\n/)
      .filter(line => line.trim() && !line.trim().startsWith('#'))
      .map(line => line.split(',').slice(1, 5).map(Number)), example);
    expect(result.rows.map(row => [row.TP, row.FP, row.FN, row.TN])).toEqual(sourceCounts);
  });
}

for (const key of ['Enter', 'Space']) {
  test('keyboard: Tab from study data reaches Run and ' + key + ' recalculates', async ({ page }) => {
    await ready(page);
    await page.locator('#f-data').fill('');
    // Change only the DOM value so this specifically tests the Run handler,
    // rather than the app's existing input-event automatic recalculation.
    await page.locator('#f-data').evaluate((el, value) => { el.value = value; }, GOOD);
    await page.locator('#f-data').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#btn-run')).toBeFocused();
    await page.keyboard.press(key);
    await expect(page.locator('#analysis-status')).toBeVisible();
    await expect(page.locator('#analysis-status')).toHaveText('Analysis updated');
    await headlines(page);
  });
}
