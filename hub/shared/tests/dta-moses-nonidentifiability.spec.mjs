import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url);
const C = require('../../../dta-sroc/tests/moses-cases.cjs');
const blueCurve = '#svg-host polyline[stroke="#2c5e8a"]';
const csv = rows => rows.map((r,i) => [`Synthetic ${i+1}`,r.tp,r.fp,r.fn,r.tn].join(',')).join('\n');

test.beforeEach(async ({page,baseURL}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors/.test(m.text())) errors.push(m.text()); });
  await page.goto(new URL('/dta-sroc/index.html', baseURL).href);
  await expect(page.locator('#svg-host svg')).toBeVisible();
  page._mosesErrors = errors;
});
test.afterEach(async ({page}) => { expect(page._mosesErrors).toEqual([]); });
async function enter(page, rows, cc='all') {
  await page.locator('#f-cov').selectOption('');
  await page.locator('#f-cc').selectOption(cc);
  await page.locator('#f-data').fill(csv(rows));
  await page.locator('#f-title').click();
  await expect(page.locator('#stats-wrap')).toContainText(String(rows.length));
  return page.evaluate(() => window.__almResults());
}
async function download(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return fs.readFile(await file.path(), 'utf8');
}
async function exportSvg(page) {
  const panel = page.locator('#alm-plot-mount');
  await panel.getByLabel('Format', {exact:true}).selectOption('svg');
  return download(page, panel.getByRole('button',{name:'Download SROC plot', exact:true}));
}
test('ordinary data: actual cards, curve, JSON and SVG downloads agree', async ({page}) => {
  const r = await enter(page,C.ordinary);
  expect(r.alpha).toBeCloseTo(5.965318230250773, 6);
  expect(r.spearman_rho).toBe(-1);
  await expect(page.locator(blueCurve)).toHaveCount(1);
  await expect(page.locator('#stats-wrap')).toContainText('Moses α');
  const result = JSON.parse(await download(page,page.locator('[data-action="json"]')));
  expect(result.alpha).toBe(r.alpha);
  expect(result.rows.map(x=>[x.TP,x.FP,x.FN,x.TN])).toEqual(C.ordinary.map(x=>[x.tp,x.fp,x.fn,x.tn]));
  const svg = await exportSvg(page);
  expect(svg).toContain('polyline');
  expect(svg).not.toMatch(/NaN|Infinity|Moses SROC unavailable/);
});
for (const cc of ['all','single','none']) {
  test(`constant FPR ${cc}: refusal, honest downloads and valid-data recovery`, async ({page}) => {
    await enter(page,C.ordinary);
    const refused = await enter(page,C.fprConstant,cc);
    expect(refused.alpha).toBeNull(); expect(refused.beta).toBeNull(); expect(refused.spearman_rho).toBeNull();
    expect(refused.errors.join(' ')).toMatch(/Moses SROC unavailable.*identical false-positive rates/);
    expect(refused.errors.join(' ')).toContain('Spearman threshold correlation is undefined');
    await expect(page.locator('#warn-banner')).toContainText('Spearman threshold correlation is undefined');
    await expect(page.locator('#stats-wrap')).not.toContainText('Moses α');
    await expect(page.locator('#stats-wrap')).not.toContainText('Spearman ρ');
    await expect(page.locator(blueCurve)).toHaveCount(0);
    await expect(page.locator('#svg-host')).toContainText('Moses SROC unavailable');
    const result = JSON.parse(await download(page,page.locator('[data-action="json"]')));
    expect(result.alpha).toBeNull(); expect(result.beta).toBeNull(); expect(result.spearman_rho).toBeNull();
    expect(result.errors).toEqual(refused.errors);
    const table = await download(page,page.locator('[data-action="csv"]'));
    expect(table).toContain('Spearman threshold correlation is undefined');
    const svg = await exportSvg(page);
    expect(svg).toContain('Moses SROC unavailable'); expect(svg).not.toMatch(/NaN|Infinity/);
    const recovered = await enter(page,C.ordinary,cc);
    expect(recovered.alpha).not.toBeNull(); expect(recovered.spearman_rho).toBe(-1);
    await expect(page.locator(blueCurve)).toHaveCount(1);
    await expect(page.locator('#warn-banner')).not.toContainText('Moses SROC unavailable');
    expect(JSON.parse(await download(page,page.locator('[data-action="json"]'))).alpha).toBe(recovered.alpha);
  });
}
test('constant FPR with extremely close sensitivities refuses and recovers in the app', async ({page}) => {
  const refused = await enter(page,C.fprConstantCloseSe);
  expect(refused.alpha).toBeNull(); expect(refused.beta).toBeNull(); expect(refused.spearman_rho).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('identical false-positive rates');
  await expect(page.locator(blueCurve)).toHaveCount(0);
  const result = JSON.parse(await download(page,page.locator('[data-action="json"]')));
  expect(result.alpha).toBeNull(); expect(result.beta).toBeNull(); expect(result.spearman_rho).toBeNull();
  const svg = await exportSvg(page);
  expect(svg).toContain('Moses SROC unavailable'); expect(svg).not.toMatch(/NaN|Infinity/);
  const recovered = await enter(page,C.ordinary);
  expect(recovered.alpha).toBeCloseTo(5.965318230250773,6);
  await expect(page.locator(blueCurve)).toHaveCount(1);
});
test('constant S refuses the curve while preserving a defined Spearman value', async ({page}) => {
  const r = await enter(page,C.sConstant);
  expect(r.alpha).toBeNull(); expect(r.spearman_rho).toBe(-1);
  await expect(page.locator('#warn-banner')).toContainText('no resolvable variation');
  await expect(page.locator(blueCurve)).toHaveCount(0);
});
test('constant sensitivity retains its horizontal curve and labels undefined rho', async ({page}) => {
  const r = await enter(page,C.seConstant);
  expect(r.beta).toBe(-1); expect(r.spearman_rho).toBeNull();
  await expect(page.locator(blueCurve)).toHaveCount(1);
  await expect(page.locator('#warn-banner')).toContainText('Spearman threshold correlation is undefined');
  await expect(page.locator('#warn-banner')).not.toContainText('Moses SROC unavailable');
});
test('zero-cell correction refusal recovers under both supported correction policies', async ({page}) => {
  const r = await enter(page,C.zeroCell,'none');
  expect(r.alpha).toBeNull(); expect(r.spearman_rho).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('continuity correction is set to none');
  await expect(page.locator(blueCurve)).toHaveCount(0);
  for (const cc of ['all','single']) {
    const valid = await enter(page,C.zeroCell,cc);
    expect(Number.isFinite(valid.alpha)).toBe(true);
    await expect(page.locator(blueCurve)).toHaveCount(1);
  }
});
