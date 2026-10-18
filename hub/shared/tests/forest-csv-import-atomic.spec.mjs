import { test, expect } from '@playwright/test';

const VALID = 'A,0.1,0.2\nB,0.3,0.2\nC,0.2,0.2';
async function open(page) {
  await page.goto('/forest-plot/index.html');
  await page.waitForFunction(() => typeof window.__almResults === 'function');
  await page.locator('#f-data').fill(VALID);
}
async function paste(page, csv) {
  await page.locator('#alm-csv-mount textarea').fill(csv);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
}
async function count(page) { return page.evaluate(() => window.__almResults().k); }

for (const [name,csv] of [
  ['negative variance', 'study,yi,vi\nA,0.1,0.04\nB,0.3,0.04\nC,9,-0.04'],
  ['missing effect', 'study,yi,vi\nA,0.1,0.04\nB,,0.04\nC,0.3,0.04'],
  ['duplicate header', 'study,yi,vi,vi\nA,0.1,0.04,0.04\nB,0.2,0.04,0.04'],
  ['fuzzy header', 'study,yi,vx\nA,0.1,0.04\nB,0.2,0.04'],
  ['extra header', 'study,yi,vi,other\nA,0.1,0.04,a\nB,0.2,0.04,b'],
  ['comment-like label', 'study,yi,vi\n#Omitted,0.1,0.04\nB,0.2,0.04'],
  ['embedded line break', 'study,yi,vi\n"Trial\nA",0.1,0.04\nB,0.2,0.04'],
  ['empty dataset', 'study,yi,vi']
]) test('Forest CSV import is atomic: ' + name, async ({ page }) => {
  await open(page);
  await paste(page,csv);
  expect(await count(page)).toBe(0);
  await expect(page.locator('#warn-banner')).toContainText('CSV rejected');
  await expect(page.locator('#alm-csv-mount textarea')).toHaveValue(csv);
  expect(await page.evaluate(() => window._almLastRE())).toBeNull();
  expect(await page.evaluate(() => window._almLastFE())).toBeNull();
  await page.locator('#alm-undo-mount [data-action="undo"]').click();
  await expect(page.locator('#f-data')).toHaveValue(VALID);
  expect(await count(page)).toBe(3);
});

test('Forest file import keeps quoted labels and full precision in valid analyses', async ({ page }) => {
  await open(page);
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({
    name:'forest.csv',mimeType:'text/csv',
    buffer:Buffer.from('study,yi,vi\n"Trial, Alpha",-0.2,0.010000000000001\nB,0.1,0.16\nC,1.2,0.04')
  });
  // The pre-import fixture also has k=3; that alone cannot prove FileReader completed.
  await expect(page.locator('#f-data')).toHaveValue(/^Trial, Alpha, /);
  await expect.poll(() => count(page)).toBe(3);
  const out = await page.evaluate(() => window.__almResults());
  expect(out.studies[0].label).toBe('Trial, Alpha');
  expect(out.studies[0].v).toBeCloseTo(0.010000000000001, 15);
  expect(out.fe_mu).toBeCloseTo(
    (-0.2/0.010000000000001 + 0.1/0.16 + 1.2/0.04) /
      (1/0.010000000000001 + 1/0.16 + 1/0.04), 12);
});
