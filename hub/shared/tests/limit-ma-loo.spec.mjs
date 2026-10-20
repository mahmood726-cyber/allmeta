import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const corpus = JSON.parse(fs.readFileSync(new URL('../../../limit-ma/validate/loo/corpus.json', import.meta.url)));
const input = c => c.te.map((te, i) => `${te},${c.se[i]},Study ${i + 1}`).join('\n');
const button = page => page.getByRole('button', {name: 'Leave-one-out on the limit estimate', exact: true});
async function calculate(page, k) {
  await button(page).click();
  await expect(page.locator('#loo-body tr')).toHaveCount(k);
  await expect(page.locator('#loo-status')).toContainText(`${k}/${k}`);
}
test.beforeEach(async ({page}) => {
  // Negative control on the same implementation: remove feature markup/script.
  // On origin/main the same selectors/feature API are absent without this flag.
  if (process.env.LOO_DISABLE_FEATURE === '1') {
    await page.route('**/limit-ma/index.html', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/    <section id="alm-loo"[\s\S]*?<\/section>\s*/, '')
        .replace('<script src="loo-limit.js"></script>', '');
      await route.fulfill({response, body});
    });
  }
  await page.goto('/limit-ma/index.html');
});
test('labelled optional control works using the keyboard and produces k rows', async ({page}) => {
  const control = button(page);
  await expect(control).toHaveAttribute('aria-describedby', 'loo-note');
  await expect(page.locator('#loo-note')).toContainText('4–200');
  await expect(page.locator('#loo-body tr')).toHaveCount(0);
  await expect(page.locator('#loo-csv')).toBeDisabled();
  await control.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#loo-body tr')).toHaveCount(10);
  await expect(page.getByRole('table', {name:'Leave-one-out limit estimates'})).toBeVisible();
});
test('built-in displayed values equal main engine deletion replay', async ({page}) => {
  await expect(button(page)).toBeVisible();
  const oracle = await page.evaluate(() => {
    const snapshot = __almLimitValidationSnapshot();
    const rows = AlmLimitEngine.parse(document.getElementById('src').value);
    try { return rows.map((_, i) => {
      const kept = rows.filter((_, j) => j !== i);
      __almLimitValidationRun(kept.map(r => `${r.te},${r.se}`).join('\n'), true);
      return structuredClone(_almLastLimit());
    }); } finally { __almLimitValidationRestore(snapshot); }
  });
  await calculate(page, 10);
  const actual = await page.locator('#loo-body tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(td => td.textContent)));
  for (let i = 0; i < 10; i++) {
    for (const [column, field] of [[0,'limit_est'],[2,'limit_se'],[3,'re_est'],[4,'tau2_dl']]) {
      expect(Math.abs(Number(actual[i][column]) - oracle[i][field]) / Math.max(1,Math.abs(oracle[i][field]))).toBeLessThanOrEqual(1e-9);
    }
    expect(actual[i][5]).toBe('ok');
  }
  await expect(page.locator('#loo-plot circle')).toHaveCount(10);
  await expect(page.locator('#loo-plot')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const r = _almLastLimit().leave_one_out, good = r.rows.filter(x => x.status === 'ok');
    const low = Math.min(r.full_limit_est,...good.map(x=>x.ci_low)), high = Math.max(r.full_limit_est,...good.map(x=>x.ci_high));
    const invert = x => low + (Number(x)-180)/480*(high-low);
    const lines = [...document.querySelectorAll('#loo-plot g')].map((g,i) => ({
      est:invert(g.querySelector('circle').getAttribute('cx')), lo:invert(g.querySelector('line').getAttribute('x1')),
      hi:invert(g.querySelector('line').getAttribute('x2')), row:good[i]}));
    return {lines, full: r.full_limit_est, reference:invert(document.querySelector('#loo-plot > line').getAttribute('x1'))};
  });
  expect(geometry.reference).toBeCloseTo(geometry.full, 10);
  for (const g of geometry.lines) {expect(g.est).toBeCloseTo(g.row.limit_est,10);expect(g.lo).toBeCloseTo(g.row.ci_low,10);expect(g.hi).toBeCloseTo(g.row.ci_high,10);}
});
test('real convergence refusals are visible with no filled numbers', async ({page}) => {
  const c = corpus.find(c => c.id === 'dat.egger2001::001');
  await page.locator('#src').fill(input(c)); await calculate(page, c.te.length);
  const row = page.locator('#loo-body tr').nth(4);
  await expect(row).toHaveAttribute('data-status','refused');
  await expect(row).toContainText("refused: Fisher scoring algorithm did not converge.");
  expect(await row.locator('td').allTextContents()).toEqual(['—','—','—','—','—',"refused: Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies."]);
  const exported = await page.evaluate(() => _almLastLimit().leave_one_out.rows[4]);
  for (const f of ['limit_est','limit_se','re_est','tau2','ci_low','ci_high','change']) expect(exported[f]).toBeNull();
});
test('CSV download has exact header, k rows, guarded labels and numeric values', async ({page}) => {
  const text = await page.locator('#src').inputValue(); await page.locator('#src').fill(text.replace('S01','=1+1'));
  await calculate(page, 10);
  const download = page.waitForEvent('download'); await page.locator('#loo-csv').click();
  const file = await download; expect(file.suggestedFilename()).toBe('limit-ma-leave-one-out.csv');
  const csv = fs.readFileSync(await file.path(),'utf8'), lines = csv.trim().split(/\r?\n/);
  expect(lines).toHaveLength(11);
  expect(lines[0]).toBe('study,dropped,limit_est,change,limit_se,re_est,tau2,ci_low,ci_high,status,reason');
  expect(lines[1]).toMatch(/^"'=1\+1",1,/);
  expect(csv).toBe(await page.evaluate(() => AlmLimitLoo.csv(_almLastLimit().leave_one_out)));
});
test('page JSON download includes the exact deletion rows', async ({page}) => {
  await calculate(page, 10);
  const expected = await page.evaluate(() => _almLastLimit().leave_one_out);
  const download = page.waitForEvent('download'); await page.locator('#alm-export-mount [data-action="json"]').click();
  const file = await download, result = JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  expect(result.leave_one_out).toEqual(expected); expect(result.leave_one_out.rows).toHaveLength(10);
});
test('edited input invalidates table, plot, CSV and JSON rows', async ({page}) => {
  await calculate(page,10);
  await page.locator('#src').fill('.1,.1,A\n.2,.2,B\n.3,.3,C\n.4,.4,D');
  await expect(page.locator('#loo-body tr')).toHaveCount(0); await expect(page.locator('#loo-csv')).toBeDisabled();
  await expect(page.locator('#loo-plot')).toBeHidden();
  expect(await page.evaluate(() => _almLastLimit().leave_one_out)).toBeUndefined();
  await calculate(page,4);
});
test('out-of-domain input is refused with the documented limit', async ({page}) => {
  await page.locator('#src').fill('.1,.1,A\n.2,.2,B\n.3,.3,C'); await button(page).click();
  await expect(page.locator('#loo-status')).toContainText('refused: Leave-one-out requires 4–200 valid studies.');
  await expect(page.locator('#loo-body tr')).toHaveCount(0); await expect(page.locator('#loo-csv')).toBeDisabled();
  await page.locator('#src').fill(Array.from({length:201},(_,i)=>`${i/100},${.1+i/1000},S${i}`).join('\n'));
  await button(page).click(); await expect(page.locator('#loo-status')).toContainText('4–200');
});
test('malicious labels stay text in the table and plot', async ({page}) => {
  const text = await page.locator('#src').inputValue();
  await page.locator('#src').fill(text.replace('S01','<img src=x onerror=alert(1)>'));
  await calculate(page,10);
  await expect(page.locator('#loo-body tr').first()).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#alm-loo img')).toHaveCount(0);
});
