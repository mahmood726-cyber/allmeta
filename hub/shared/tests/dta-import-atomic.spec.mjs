import {test, expect} from '@playwright/test';

const PAGE = '/dta-sroc/index.html';
const GOOD = 'A,80,12,20,88\nB,60,10,40,90\nC,70,18,30,82\nD,90,15,10,85';
const HEADER = 'study,TP,FP,FN,TN\n';
const tail = GOOD.split('\n').slice(1).join('\n');
async function current(page) { return page.evaluate(() => window.__almResults()); }
async function prepare(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__almResults === 'function');
  await page.locator('#f-data').fill(GOOD);
  await expect.poll(async () => (await current(page)).k).toBe(4);
}
async function paste(page, body) {
  await page.locator('#alm-csv-mount textarea').fill(body);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
}

for (const [label, body] of [
  ['negative first-row count', 'Bad,-1,2,3,4\n' + GOOD],
  ['negative middle-row count', 'A,80,12,20,88\nBad,-1,2,3,4\n' + tail],
  ['nonnumeric suffix', 'A,80garbage,12,20,88\n' + tail],
  ['fractional patient count', 'A,80.5,12,20,88\n' + tail],
  ['zero diseased denominator', 'A,0,12,0,88\n' + tail],
  ['zero non-diseased denominator', 'A,80,0,20,0\n' + tail],
  ['incomplete row', 'A,80,12,20\n' + tail]
]) test('DTA native input blocks the entire analysis on ' + label, async ({page}) => {
  await prepare(page);
  await page.locator('#f-data').fill(body);
  const r = await current(page);
  expect(r.k).toBe(0);
  expect(r.bivariate).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('Analysis blocked');
  await expect(page.locator('#warn-banner')).toBeVisible();
  // Correcting the input restores a genuine fit, without reopening the app.
  await page.locator('#f-data').fill(GOOD);
  expect((await current(page)).k).toBe(4);
  expect((await current(page)).bivariate).not.toBeNull();
});

test('DTA legitimate single-cell zeros remain supported by the selected correction', async ({page}) => {
  await prepare(page);
  expect((await current(page)).bivariate).not.toBeNull();
  await page.locator('#f-data').fill('A,0,12,20,88\n' + tail);
  const res = await current(page);
  expect(res.k).toBe(4);
  expect(res.rows[0].corrected).toBe(1);
  expect(res.bivariate).not.toBeNull();
});

for (const [label, body] of [
  ['negative count', HEADER + 'Bad,-1,2,3,4\n' + GOOD],
  ['missing count', HEADER + 'A,,12,20,88\n' + tail],
  ['comment label', HEADER + '"#Bad",80,12,20,88\n' + tail],
  ['extra header', 'study,TP,FP,FN,TN,other\nA,80,12,20,88,z\n' + tail],
  ['duplicate header', 'study,TP,FP,FN,TN,TN\nA,80,12,20,88,88'],
  ['fuzzy header', 'study,TP,FP,FN,TT\n' + GOOD]
]) test('DTA CSV rejects ' + label + ' and Undo restores the preceding analysis', async ({page}) => {
  await prepare(page);
  await paste(page, body);
  await expect(page.locator('#warn-banner')).toContainText('CSV rejected');
  await expect(page.locator('#alm-csv-mount textarea')).toHaveValue(body);
  const invalid = await current(page);
  expect(invalid.k).toBe(0);
  expect(invalid.bivariate).toBeNull();
  await page.locator('#alm-undo-mount [data-action="undo"]').click();
  await expect(page.locator('#f-data')).toHaveValue(GOOD);
  const restored = await current(page);
  expect(restored.k).toBe(4);
  expect(restored.bivariate).not.toBeNull();
});

test('DTA actual CSV file upload retains quoted comma labels and the count matrix', async ({page}) => {
  await prepare(page);
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({
    name: 'diagnostic-studies.csv', mimeType: 'text/csv',
    buffer: Buffer.from(HEADER + '"Study, Alpha",80,12,20,88\n' + tail)
  });
  // Both inputs have k=4, so wait for the changed label, not the unchanged count.
  await expect(page.locator('#f-data')).toHaveValue(/^Study, Alpha, /);
  const r = await current(page);
  expect(r.k).toBe(4);
  expect(r.rows[0].study).toBe('Study, Alpha');
  expect([r.rows[0].TP, r.rows[0].FP, r.rows[0].FN, r.rows[0].TN]).toEqual([80,12,20,88]);
  expect(r.bivariate).not.toBeNull();
});

test('DTA optional study header generates explicit labels, retaining every study', async ({page}) => {
  await prepare(page);
  const values = GOOD.split('\n').map(line => line.substring(line.indexOf(',') + 1)).join('\n');
  await paste(page, 'TP,FP,FN,TN\n' + values);
  const r = await current(page);
  expect(r.k).toBe(4);
  expect(r.rows.map(row => row.study)).toEqual(['Study 1', 'Study 2', 'Study 3', 'Study 4']);
  expect(r.bivariate).not.toBeNull();
});
