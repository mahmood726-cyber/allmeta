import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
let source = readFileSync(new URL('../csv-upload.js', import.meta.url), 'utf8');

if (process.env.V181_MUTANT === 'csv') {
  const mutant = source.replace('claim(hs, columns[ci], true);', 'claim(hs, columns[ci]);');
  if (mutant === source) throw new Error('CSV mutation target must exist');
  source = mutant;
  test.beforeEach(async ({ page }) => {
    await page.route('**/hub/shared/csv-upload.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  });
}

test('statistical aliases, conversions, exclusions and ordinary typos', async ({ page }) => {
  await page.setContent('<div id="csv"></div>');
  await page.addScriptTag({ content: source });
  const results = await page.evaluate(() => {
    const parse = (h, name, value) => window.alm.csvUpload.parse(h + '\n' + value, [{ name, type: 'float' }]);
    return {
      se: ['se', 'SE', 'sei', 'stderr', 'standard error', 'Std. Error'].map(h => parse(h, 'vi', 0.2)),
      variance: ['vi', 'var', 'variance'].map(h => parse(h, 'vi', 0.04)),
      forbidden: [['sd', 'se'], ['sd', 'vi'], ['vi', 'se'], ['var', 'sei'], ['variance', 'sd'], ['se', 'sd'], ['se1', 'vi1'], ['se_1', 'vi_1'], ['sd1', 'se1'], ['se1', 'v1'], ['sei_t', 'var_t'], ['var_c', 'sei_c']].map(([h, c]) => ({ result: parse(h, c, 0.2), column: c })),
      typo: parse('esitmate', 'estimate', 0.3)
    };
  });
  for (const r of results.se) {
    expect(r.rows[0].vi).toBeCloseTo(0.04, 12);
    expect(r.warnings.join('\n')).toMatch(/convert.*SE.*\^2/i);
  }
  for (const r of results.variance) expect(r.rows[0].vi).toBe(0.04);
  for (const { result, column } of results.forbidden) expect(result.rows[0][column]).toBeUndefined();
  expect(results.typo.rows[0].estimate).toBe(0.3);
  expect(results.typo.warnings.join('\n')).toMatch(/esitmate.*estimate/);
});

test('remaps have a prominent accessible notice and bad conversions do not reach the app', async ({ page }) => {
  await page.setContent('<div id="csv"></div>');
  await page.addScriptTag({ content: source });
  await page.evaluate(() => window.alm.csvUpload({
    target: '#csv', columns: [{ name: 'estimate', type: 'float' }, { name: 'vi', type: 'float' }],
    onParse: r => { window.parsed = r; }
  }));
  await page.locator('#csv textarea').fill('esitmate,SE\n0.3,0.2');
  await page.locator('[data-action="parse-paste"]').click();
  const notice = page.locator('#csv [data-section="warnings"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toContainText('esitmate');
  await expect(notice).toContainText('SE^2');
  await page.evaluate(() => { window.parsed = null; });
  await page.locator('#csv textarea').fill('esitmate,SE\n0.3,-0.2');
  await page.locator('[data-action="parse-paste"]').click();
  await expect(notice).toContainText('rejected');
  expect(await page.evaluate(() => window.parsed)).toBeNull();
  await page.locator('#csv textarea').fill('estimate,SE\n0.3,\n0.4,0.2');
  await page.locator('[data-action="parse-paste"]').click();
  await expect(notice).toContainText('Blank SE cells remain missing');
  await expect(notice).toContainText('row 1: missing float');
  const missing = await page.evaluate(() => window.parsed);
  expect(missing.errors).toEqual([]);
  expect(missing.rows).toHaveLength(2);
  expect(missing.rows[0].vi).toBeNull();
  expect(missing.rows[1].vi).toBeCloseTo(0.04, 12);
});

test('meta-regression Study,MD,SE,Weeks retains the input SE', async ({ page, baseURL }) => {
  await page.goto(new URL('/meta-regression/index.html', baseURL).href);
  await page.locator('#alm-csv-mount textarea').fill('Study,MD,SE,Weeks\nA,0.2,0.1,2\nB,0.5,0.2,4\nC,0.3,0.3,6\nD,0.7,0.4,8');
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
  await page.locator('#btn-run').click();
  const studies = await page.evaluate(() => window._almLastStudies());
  expect(studies).toHaveLength(4);
  for (let i = 0; i < 4; i++) expect(studies[i].se).toBeCloseTo((i + 1) / 10, 12);
  expect(await page.evaluate(() => window._almLastFitted())).toBeTruthy();
  await expect(page.locator('#alm-csv-mount [role="alert"]')).toContainText('SE^2');
});
