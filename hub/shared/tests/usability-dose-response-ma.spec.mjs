import { test, expect } from '@playwright/test';

// Captured by executing the unmodified inline UI and shipped engines in V8.
// These are the displayed values for the built-in alcohol_cvd example, not
// manuscript values from a different dataset or rounded R fixture inputs.
const HEADLINE = 'k = 6 studies, 19 non-reference doses · linear trend · two-stage, REML, Greenland–Longnecker covariance' +
  'Pooled slope -0.004365 log RR per unit of dose (SE 0.00589); RR per unit = 0.9956 [0.9842, 1.0072].';
const RESULT_BUTTONS = '#alm-export-mount button';
const PLOT_BUTTONS = '#alm-plot-mount button';

test.beforeEach(async ({ page }) => {
  await page.goto('dose-response-ma/index.html');
  await expect(page.locator('#headline')).toHaveText(HEADLINE);
});

function changeCell(data, row, column, value) {
  const lines = data.split('\n'), cells = lines[row - 1].split(',');
  cells[column] = value;
  lines[row - 1] = cells.join(',');
  return lines.join('\n');
}

async function resultJSON(page) {
  return page.evaluate(() => JSON.stringify(window._almLastDoseResponse()));
}

async function expectRefusal(page, message) {
  await expect(page.locator('#msgs[aria-live="polite"]')).toContainText(message);
  await expect(page.locator('#headline')).toBeEmpty();
  for (const id of ['coef-body', 'tests-body', 'pred-body', 'res-body', 'curve-host', 'resid-host']) {
    await expect(page.locator('#' + id)).toBeEmpty();
  }
  expect(await resultJSON(page)).toBe('null');
  await expect(page.locator('#analysis-status')).toBeHidden();
  await expect(page.locator('#analysis-stale')).toBeHidden();

  const downloads = [];
  const onDownload = download => downloads.push(download.suggestedFilename());
  page.on('download', onDownload);
  const buttons = page.locator(RESULT_BUTTONS).or(page.locator(PLOT_BUTTONS).filter({ hasText: /^Download/ }));
  expect(await buttons.count()).toBe(8); // Five data/report formats, selected plots, and two individual plots.
  for (const button of await buttons.all()) {
    await button.click();
    await expect(page.locator('#msgs [role="status"][data-export-error]')).toHaveText('No valid results to export');
  }
  // Let asynchronous JSON/plot handlers reveal any download that escaped the guard.
  await page.waitForTimeout(150);
  expect(downloads).toEqual([]);
  page.off('download', onDownload);
  await expect(page.locator('#msgs')).toContainText(message); // Preserve the input diagnosis.
}

test('default example retains its full displayed headline and reruns byte-identically', async ({ page }) => {
  const before = await resultJSON(page);
  await page.locator('#btn-run').click();
  expect(await resultJSON(page)).toBe(before);
  await expect(page.locator('#headline')).toHaveText(HEADLINE);
  await expect(page.locator('#analysis-status')).toBeVisible();
});

for (const [field, column] of [['dose', 1], ['cases', 2], ['n', 3], ['logRR', 4], ['SE', 5]]) {
  for (const token of ['oops', '0.2oops', '', 'NaN', 'Infinity', '1e309', '0x10']) {
    test('U1 refuses ' + field + ' token ' + JSON.stringify(token) + ' without a partial fit or export', async ({ page }) => {
      const raw = changeCell(await page.locator('#f-data').inputValue(), 3, column, token);
      await page.locator('#f-data').fill(raw);
      await expectRefusal(page, 'Row 3 (study 1), ' + field + ':');
      await expect(page.locator('#f-data')).toHaveValue(raw);
    });
  }
}

for (const [field, column, token] of [['SE', 5, '-0.2'], ['SE', 5, '0'], ['cases', 2, '0'], ['n', 3, '-1'], ['type', 6, 'oops'], ['type', 6, 'ci']]) {
  test('U1 refuses invalid ' + field + ' value ' + token + ' with row and study', async ({ page }) => {
    await page.locator('#f-data').fill(changeCell(await page.locator('#f-data').inputValue(), 3, column, token));
    await expectRefusal(page, 'Row 3 (study 1), ' + field + ':');
  });
}

test('U1 refuses a truncated row instead of dropping it', async ({ page }) => {
  const data = await page.locator('#f-data').inputValue();
  await page.locator('#f-data').fill(data + '\n1, 9.06');
  await expectRefusal(page, 'Row 27 (study 1), cases:');
});

test('U1 refuses inconsistent or malformed optional covariates', async ({ page }) => {
  const data = await page.locator('#f-data').inputValue();
  let raw = changeCell(data, 2, 7, '1');
  raw = changeCell(raw, 3, 7, '2');
  await page.locator('#f-data').fill(raw);
  await expectRefusal(page, 'Row 3 (study 1), covariate: must be the same');
  await page.locator('#f-data').fill(changeCell(data, 3, 7, '1oops'));
  await expectRefusal(page, 'Row 3 (study 1), covariate: enter a finite number');
});

test('U1 refuses missing study covariates when meta-regression is enabled', async ({ page }) => {
  await page.locator('#f-mod').check();
  await expectRefusal(page, 'Row 2 (study 1), covariate: a number is required');
});

test('U1 refuses duplicate or missing references without excluding a study', async ({ page }) => {
  const data = await page.locator('#f-data').inputValue();
  const duplicate = changeCell(changeCell(data, 3, 4, '0'), 3, 5, '');
  await page.locator('#f-data').fill(duplicate);
  await expectRefusal(page, 'Row 3 (study 1), SE: each study must have exactly one reference row');
  await page.locator('#f-data').fill(changeCell(data, 2, 5, '0.1'));
  await expectRefusal(page, 'Row 2 (study 1), SE: each study needs a reference row');
});

test('U1 keeps headers, comments, blank lines, quoted CSV and full numeric tokens', async ({ page }) => {
  const before = await resultJSON(page), data = await page.locator('#f-data').inputValue();
  const formatted = data.split('\n').map(line => {
    if (line.startsWith('#')) return 'study,dose,cases,n,logRR,SE,type';
    const cells = line.split(',').map(cell => cell.trim());
    cells[0] = '"' + cells[0] + '"';
    cells[1] = '+' + cells[1] + 'e0';
    cells[4] = cells[4].replace('0.', '.');
    // Preserve the existing six-column default of cc.
    if (cells[6] === 'cc') cells.pop();
    return cells.join(',');
  }).join('\n');
  await page.locator('#f-data').fill('# comment\n\n' + formatted + '\n\n# end');
  await expect(page.locator('#headline')).toHaveText(HEADLINE);
  expect(await resultJSON(page)).toBe(before);
});

test('U1 preserves quoted study labels containing commas and escaped quotes', async ({ page }) => {
  const data = await page.locator('#f-data').inputValue();
  const labelled = data.replace(/^1,/gm, '"Study, ""one""",');
  await page.locator('#f-data').fill(labelled);
  await expect(page.locator('#headline')).toHaveText(HEADLINE);
  expect(await page.evaluate(() => window._almLastDoseResponse().perStudy[0].id)).toBe('Study, "one"');
  await expect(page.locator('#res-body')).toContainText('Study, "one"');
});

const controlCases = [
  ['f-pdoses', 'Doses to report', ['2,oops,4', '2,4oops', '2,,4', '2,', 'NaN', 'Infinity', '1e309', '0x10']],
  ['f-xref', 'Reference dose', ['oops', '2oops', '2,4', '2,', 'NaN', 'Infinity', '1e309', '0x10']],
  ['f-knots', 'Knot doses', ['0,oops,10,30', '0,10oops,30', '0,,10,30', '0,10,30,', '0,10,NaN', '0,10,Infinity', '0,10,1e309', '0,10,0x20']],
  ['f-modval', 'Covariate value', ['oops', '2oops', '2,4', '2,', 'NaN', 'Infinity', '1e309', '0x10']],
];
for (const [id, label, tokens] of controlCases) {
  for (const token of tokens) {
    test('U2 refuses ' + label + ' token ' + JSON.stringify(token), async ({ page }) => {
      if (id === 'f-knots') {
        await page.locator('#f-shape').selectOption('splinec');
        await page.locator('#f-knots').fill('0, 10, 30');
      }
      if (id === 'f-modval') {
        const data = await page.locator('#f-data').inputValue();
        // Study number is an illustrative moderator solely to exercise input handling.
        await page.locator('#f-data').fill(data.split('\n').map(line => line.startsWith('#') ? line : line + ', ' + line.split(',')[0]).join('\n'));
        await page.locator('#f-mod').check();
      }
      expect(await resultJSON(page)).not.toBe('null');
      await page.locator('#' + id).fill(token);
      await expectRefusal(page, label);
      await expect(page.locator('#' + id)).toHaveValue(token);
    });
  }
}

test('U2 refuses blank, duplicate or out-of-range custom knot counts', async ({ page }) => {
  await page.locator('#f-shape').selectOption('splinec');
  for (const knots of ['', '0,10', '0,10,10', '0,1,2,3,4,5,6,7']) {
    await page.locator('#f-knots').fill(knots);
    await expectRefusal(page, 'Knot doses:');
  }
});

test('U2 retains exact valid prediction controls and deliberate blank defaults', async ({ page }) => {
  const before = await resultJSON(page);
  await page.locator('#f-xref').fill('+1e1');
  await page.locator('#f-pdoses').fill('-2; .5 20, 4e1');
  let result = await page.evaluate(() => window._almLastDoseResponse());
  expect(result.referenceDose).toBe(10);
  expect(result.predictions.map(p => p.dose)).toEqual([-2, 0.5, 20, 40]);
  await page.locator('#f-xref').fill(' ');
  await page.locator('#f-pdoses').fill(' ');
  expect(await resultJSON(page)).toBe(before);
  await page.locator('#f-shape').selectOption('splinec');
  await page.locator('#f-knots').fill('0; 1e1 30, 60');
  result = await page.evaluate(() => window._almLastDoseResponse());
  expect(result.knots).toEqual([0, 10, 30, 60]);
});

for (const state of ['empty data', 'one study', 'engine refusal']) {
  test('U3 blocks every result and plot export after ' + state + ' and recovers automatically', async ({ page }) => {
    const data = await page.locator('#f-data').inputValue(), before = await resultJSON(page);
    if (state === 'engine refusal') await page.locator('#f-shape').selectOption('spline5');
    else await page.locator('#f-data').fill(state === 'empty data' ? '' : data.split('\n').filter(line => line.startsWith('1,')).join('\n'));
    await expectRefusal(page, state === 'engine refusal' ? 'at least 4 non-reference dose levels' : 'Enter at least 2 studies.');
    if (state === 'engine refusal') await page.locator('#f-shape').selectOption('linear');
    else await page.locator('#f-data').fill(data);
    expect(await resultJSON(page)).toBe(before);
    await expect(page.locator('#analysis-status')).toBeVisible();
    await expect(page.locator('#analysis-stale')).toBeHidden();

    const jsonDownload = page.waitForEvent('download');
    await page.locator('#alm-export-mount [data-action="json"]').click();
    const download = await jsonDownload;
    expect(download.suggestedFilename()).toBe('dose-response-results.json');
    const stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8')))).toBe(before);
    await page.locator('#alm-plot-mount select').first().selectOption('svg');
    const svgDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Dose-response curve', exact: true }).click();
    expect((await svgDownload).suggestedFilename()).toBe('dose-response-ma-curve.svg');
  });
}

test('keyboard Tab reaches Run; Enter and Space rerun without a stale-wait state', async ({ page }) => {
  const before = await resultJSON(page);
  // Navigate from page load using only the keyboard, without locator.focus().
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator('#f-data').evaluate(el => el === document.activeElement)) break;
  }
  await expect(page.locator('#f-data')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-run')).toBeFocused();
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    expect(await resultJSON(page)).toBe(before);
    await expect(page.locator('#analysis-status')).toBeVisible();
  }
  const data = await page.locator('#f-data').inputValue();
  await page.locator('#f-data').fill(changeCell(data, 3, 4, 'oops'));
  await expect(page.locator('#msgs')).toContainText('Row 3 (study 1), logRR:');
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-run')).toBeFocused();
  await page.keyboard.press('Enter');
  await expectRefusal(page, 'Row 3 (study 1), logRR:');
  await page.locator('#f-data').fill(data);
  expect(await resultJSON(page)).toBe(before);
  await expect(page.locator('#analysis-status')).toBeVisible();
  await expect(page.locator('#analysis-stale')).toBeHidden();
});
