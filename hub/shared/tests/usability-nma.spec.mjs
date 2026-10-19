import { test, expect } from '@playwright/test';

// Fail-closed contrast input for the NMA page (fix/usability-nma).
//
// The displayed values below were read off the unmodified page running its own built-in example through its own
// shipped engine; they are not reference values from anywhere else. Their job is to prove that refusing malformed
// rows changed nothing a user sees for valid input. The engine's agreement with netmeta is the separate, permanent
// gate in validate-nma.spec.mjs (410 checks) and nma-netmeta-parity.spec.mjs; nothing here replaces it.
const CARDS = ['Studies=10', 'Contrasts=10', 'Treatments=5', 'Reference=DrugA', 'I²=0.0%'];
const VS_REFERENCE = [
  'DrugB | 0.080 (-0.073 to 0.233) | 0.3071',
  'DrugC | 0.187 (0.005 to 0.370) | 0.0441',
  'DrugD | -0.042 (-0.256 to 0.171) | 0.6988',
  'Placebo | 0.250 (0.116 to 0.383) | 0.0003',
];

const cards = page => page.evaluate(() =>
  [...document.querySelectorAll('#stats-wrap .stat')]
    .map(s => s.querySelector('.k').textContent.trim() + '=' + s.querySelector('.v').textContent.trim()));
const vsReference = page => page.evaluate(() =>
  [...document.querySelectorAll('#ref-host tr')].slice(1)
    .map(tr => [...tr.children].map(td => td.textContent.trim()).join(' | ')));

test.beforeEach(async ({ page }) => {
  await page.goto('nma/index.html');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('nma/index.html');
  await expect(page.locator('#stats-wrap .stat')).toHaveCount(CARDS.length);
  expect(await cards(page)).toEqual(CARDS);
});

const DEFAULT = async page => page.locator('#f-data').inputValue();

// A refusal must name the row, clear every result panel, leave the hook refusing, and block every export.
async function expectRefusal(page, message) {
  const warning = page.locator('#warn-banner');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning).toHaveAttribute('aria-live', 'polite');
  await expect(warning).toContainText(message);
  for (const id of ['stats-wrap', 'svg-host', 'sucra-host', 'league-host', 'het-host', 'ref-host']) {
    await expect(page.locator('#' + id)).toBeEmpty();
  }
  const hook = await page.evaluate(() => window.__almNmaCompute(document.getElementById('f-data').value, undefined, {}));
  expect(hook.error).toContain(message);

  const downloads = [];
  const record = d => downloads.push(d.suggestedFilename());
  page.on('download', record);
  try {
    for (const locator of [page.locator('#btn-json'), page.locator('#btn-league'),
                           page.locator('#alm-plot-mount button').filter({ hasText: /^Download/ })]) {
      for (const button of await locator.all()) {
        await button.click();
        await expect(page.locator('#warn-banner')).toContainText('No valid results to export');
      }
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
  expect(await vsReference(page)).toEqual(VS_REFERENCE);
  const before = await page.evaluate(() => JSON.stringify(window.__almNmaCompute(document.getElementById('f-data').value, undefined, {})));
  await page.locator('#btn-run').click();
  expect(await cards(page)).toEqual(CARDS);
  expect(await vsReference(page)).toEqual(VS_REFERENCE);
  expect(await page.evaluate(() => JSON.stringify(window.__almNmaCompute(document.getElementById('f-data').value, undefined, {})))).toBe(before);
});

// Row 2 of the built-in example is TRIAL1. Each token below made the old parser drop that contrast and fit the
// network on nine of ten contrasts, with no warning at all for a non-numeric estimate.
for (const [cell, column] of [['estimate', 3], ['SE', 4]]) {
  for (const token of ['oops', '0.2oops', '', 'NaN', 'Infinity', '1e309', '0x10']) {
    test(`refuses ${cell} token ${JSON.stringify(token)} instead of dropping the contrast`, async ({ page }) => {
      const lines = (await DEFAULT(page)).split('\n');
      const cells = lines[1].split(',');
      cells[column] = ' ' + token;
      lines[1] = cells.join(',');
      await page.locator('#f-data').fill(lines.join('\n'));
      await expectRefusal(page, 'Row 2 (study "TRIAL1")');
      await expect(page.locator('#f-data')).toHaveValue(lines.join('\n'));
    });
  }
}

test('refuses a non-positive SE, a self-loop and a short row, naming the study', async ({ page }) => {
  const data = await DEFAULT(page);
  const withCell = (row, column, value) => {
    const lines = data.split('\n'), cells = lines[row - 1].split(',');
    cells[column] = ' ' + value;
    lines[row - 1] = cells.join(',');
    return lines.join('\n');
  };
  await page.locator('#f-data').fill(withCell(2, 4, '0'));
  await expectRefusal(page, 'Row 2 (study "TRIAL1"): SE must be greater than 0.');
  await page.locator('#f-data').fill(withCell(2, 4, '-0.1'));
  await expectRefusal(page, 'Row 2 (study "TRIAL1"): SE must be greater than 0.');
  await page.locator('#f-data').fill(data + '\nSelf 2020, DrugA, DrugA, 0.1, 0.2');
  await expectRefusal(page, 'Row 12 (study "Self 2020"): treatment2 must differ from treatment1.');
  await page.locator('#f-data').fill(data + '\nShort 2020, DrugA, DrugB, 0.1');
  await expectRefusal(page, 'Row 12 (study "Short 2020"): need 5 columns');
  await page.locator('#f-data').fill(data + '\n, DrugA, DrugB, 0.1, 0.2');
  await expectRefusal(page, 'study is required');
});

test('refuses unbalanced CSV quoting rather than guessing the fields', async ({ page }) => {
  await page.locator('#f-data').fill((await DEFAULT(page)) + '\n"Unclosed 2020, DrugA, DrugB, 0.1, 0.2');
  await expectRefusal(page, 'invalid CSV quoting');
});

test('keeps the documented format: comments, blank lines, tabs, quoted labels and full numeric tokens', async ({ page }) => {
  const data = await DEFAULT(page);
  const before = await page.evaluate(() => JSON.stringify(window.__almNmaCompute(document.getElementById('f-data').value, undefined, {})));
  const rows = data.split('\n').filter(line => !line.startsWith('#'));
  // tabs instead of commas, a +N.Ne0 estimate and a .N-style SE, and a blank line and comment around the block
  const retyped = rows.map(line => {
    const cells = line.split(',').map(cell => cell.trim());
    cells[3] = (cells[3].startsWith('-') ? '-' : '+') + Math.abs(Number(cells[3])) + 'e0';
    cells[4] = cells[4].replace(/^0\./, '.');
    return cells.join('\t');
  }).join('\n');
  await page.locator('#f-data').fill('# leading comment\n\n' + retyped + '\n\n# trailing comment');
  expect(await cards(page)).toEqual(CARDS);
  expect(await vsReference(page)).toEqual(VS_REFERENCE);
  expect(await page.evaluate(() => JSON.stringify(window.__almNmaCompute(document.getElementById('f-data').value, undefined, {})))).toBe(before);
  // a study label containing a comma, as quoted CSV
  // "TRIAL1, Group A" etc.: the comma is inside the quoted label, so the row still has five fields. The Studies
  // and Contrasts cards staying at 10 is the proof that no row was split or dropped.
  await page.locator('#f-data').fill(rows.map(line => '"' + line.split(',')[0] + ', Group A"' + line.slice(line.indexOf(','))).join('\n'));
  expect(await cards(page)).toEqual(CARDS);
  expect(await page.evaluate(() => window.__almNmaCompute(document.getElementById('f-data').value, undefined, {}).error)).toBeUndefined();
});

// Both this page's own header and the one netmeta's pairwise() writes must be skipped, because pasting pairwise()
// output is how most users get data in here. A malformed first DATA row must still be refused, not skipped.
for (const header of ['study, treatment1, treatment2, est, SE', 'study,treatment1,treatment2,estimate,se',
                      'studlab, treat1, treat2, TE, seTE', 'trial\tt1\tt2\tyi\tse']) {
  test(`skips the header row ${JSON.stringify(header)}`, async ({ page }) => {
    const rows = (await DEFAULT(page)).split('\n').filter(line => !line.startsWith('#')).join('\n');
    await page.locator('#f-data').fill(header + '\n' + rows);
    expect(await cards(page)).toEqual(CARDS);
    expect(await vsReference(page)).toEqual(VS_REFERENCE);
  });
}

test('a malformed first data row is refused, not mistaken for a header', async ({ page }) => {
  const rows = (await DEFAULT(page)).split('\n').filter(line => !line.startsWith('#')).join('\n');
  await page.locator('#f-data').fill('Trial 1, DrugA, DrugB, oops, oops\n' + rows);
  await expectRefusal(page, 'Row 1 (study "Trial 1")');
});

test('exports work again as soon as the data are valid', async ({ page }) => {
  const data = await DEFAULT(page);
  await page.locator('#f-data').fill(data.replace('-0.22', 'oops'));
  await expectRefusal(page, 'Row 2 (study "TRIAL1")');
  await page.locator('#f-data').fill(data);
  expect(await cards(page)).toEqual(CARDS);
  const state = page.waitForEvent('download');
  await page.locator('#btn-json').click();
  expect((await state).suggestedFilename()).toBe('nma-state.json');
  const league = page.waitForEvent('download');
  await page.locator('#btn-league').click();
  expect((await league).suggestedFilename()).toBe('nma-league.csv');
});

test('keyboard: Tab from the contrast box reaches Run analysis and Enter reruns', async ({ page }) => {
  await page.locator('#f-data').focus();
  await expect(page.locator('#f-data')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-run')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await cards(page)).toEqual(CARDS);
});
