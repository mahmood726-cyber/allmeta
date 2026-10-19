/**
 * Effect-Size Converter scientific regression suite.
 * Frozen reference numbers from metafor::escalc(measure="SMD", correct=TRUE,
 * vtype="LS") in effect-size-converter/tests/fixtures/esc-tiny.R.
 * Actual browser engine, user controls, CSV/import, and high-precision export.
 */
import { test, expect } from '@playwright/test';
const URL = '/effect-size-converter/index.html';
async function open(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await expect(page.locator('#btn-convert')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.AlmEffectAccuracy && window.__almLoadCSV && window.__almResults));
}

test('metafor exact Hedges g/LS variance parity on two frozen R rows', async ({ page }) => {
  await open(page);
  const x = await page.evaluate(() => {
    const M = window.AlmEffectAccuracy;
    return {
      first: M.fromMeans(52.5, 8.2, 30, 47.1, 7.9, 30),
      second: M.fromMeans(61, 10.5, 45, 54.3, 9.8, 45),
      df2: M.hedgesJ(2),
      df58: M.hedgesJ(58),
      p05: M.qnorm(0.025),
    };
  });
  expect(Math.abs(x.first.g - 0.6619744469902)).toBeLessThan(1e-10);
  expect(Math.abs(x.first.vi - 0.07031841807057)).toBeLessThan(1e-12);
  expect(Math.abs(x.second.g - 0.6540652223779)).toBeLessThan(1e-10);
  expect(Math.abs(x.second.vi - 0.04682111841736)).toBeLessThan(1e-12);
  expect(x.df2).toBeCloseTo(0.5641895835477563, 10);
  expect(x.df58).toBeCloseTo(0.9870035810280045, 10);
  expect(x.p05).toBeCloseTo(-1.959963984540054, 7);
});

test('imported Hedges g is not corrected twice and export retains numerical precision', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.__almLoadCSV([{ m1:52.5, sd1:8.2, n1:30, m2:47.1, sd2:7.9, n2:30 }]);
    return {
      kind: document.querySelector('#in-smd-kind').value,
      snapshot: window.__almSnapshot(),
      exported: window.__almResults(),
      displayed: [...document.querySelectorAll('#results-body tr')]
        .map(tr => tr.querySelector('td')?.textContent),
    };
  });
  const rows = result.exported.rows;
  expect(result.kind).toBe('g');
  expect(result.snapshot['in-smd-kind']).toBe('g');
  expect(rows.filter(r => r.scale === "SMD (Hedges' g)")).toHaveLength(1);
  expect(rows.find(r => r.scale === "SMD (Hedges' g)").point).toBeCloseTo(0.6619744469902, 10);
  expect(rows.find(r => r.scale === "SMD (Hedges' g)").se ** 2).toBeCloseTo(0.07031841807057, 11);
  expect(rows.find(r => r.scale === "SMD (Cohen's d, recovered)").point).toBeCloseTo(0.6706910285986036, 10);
  expect(rows.find(r => r.scale === 'MD').point).toBeCloseTo(5.4, 11);
  expect(result.exported.numerical_reference).toContain('metafor::escalc');
  expect(typeof rows[0].point).toBe('number');
  expect(rows[0].point.toString().length).toBeGreaterThan(10);
});

test('invalid CSV group size is rejected rather than silently truncated', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    window.__almLoadCSV([{ m1:52.5, sd1:8.2, n1:30.5, m2:47.1, sd2:7.9, n2:30 }]));
  await expect(page.locator('#warn-slot')).toContainText('CSV rejected');
  expect(await page.evaluate(() => window.__almResults().rows.length)).toBeGreaterThan(0);
  // Calling export refits from current valid controls; rejection banner is not a proof
  // that the old inputs were overwritten. Invalid import must NOT change them.
  await expect(page.locator('#in-type')).toHaveValue('OR');
});

test('two-sample t derives both signed estimate and its variance; non-SMD rejects', async ({ page }) => {
  await open(page);
  await page.locator('#in-type').selectOption('OR');
  await page.locator('#der-t').fill('2.597');
  await page.locator('#der-n1').fill('30');
  await page.locator('#der-n2').fill('30');
  await page.locator('#btn-derive').click();
  await expect(page.locator('#warn-slot')).toContainText('SMD only');
  await page.locator('#in-type').selectOption('SMD');
  await page.locator('#btn-derive').click();
  const got = await page.evaluate(() => {
    const t = 2.597, stat = window.AlmEffectAccuracy.fromT(t, 30, 30);
    return { stat, exported: window.__almResults(), kind: document.querySelector('#in-smd-kind').value };
  });
  expect(got.kind).toBe('g');
  expect(got.exported.input_estimate).toBeCloseTo(got.stat.g, 12);
  expect(got.exported.input_se ** 2).toBeCloseTo(got.stat.vi, 12);
});

test('F requires a signed group direction and rejects negative F', async ({ page }) => {
  await open(page);
  await page.locator('#in-type').selectOption('SMD');
  await page.locator('#der-f').fill('4.41');
  await page.locator('#der-n1').fill('20');
  await page.locator('#der-n2').fill('20');
  await page.locator('#btn-derive').click();
  await expect(page.locator('#warn-slot')).toContainText('direction');
  await page.locator('#der-f-sign').selectOption('-1');
  await page.locator('#btn-derive').click();
  const result = await page.evaluate(() => window.__almResults());
  expect(result.input_estimate).toBeLessThan(0);
  expect(result.input_estimate).toBeCloseTo(-2.1 * Math.sqrt(1/20 + 1/20) *
    (await page.evaluate(() => window.AlmEffectAccuracy.hedgesJ(38))), 10);
});

test('HR and IRR never masquerade as independent OR or SMD evidence', async ({ page }) => {
  await open(page);
  for (const type of ['HR', 'IRR']) {
    await page.locator('#in-type').selectOption(type);
    await page.locator('#in-est').fill('0.72');
    await page.locator('#in-se').fill('0.2');
    await page.locator('#btn-convert').click();
    const got = await page.evaluate(() => window.__almResults());
    expect(got.rows.map(r => r.scale)).toEqual([type, 'ln(' + type + ')']);
    await expect(page.locator('#forest-axis')).toContainText('No defensible SMD');
    await expect(page.locator('#warn-slot')).toContainText('No general mathematically valid');
  }
});

test('negative or empty SE clears analysis, custom signed axis moves zero line', async ({ page }) => {
  await open(page);
  await page.locator('#in-se').fill('-0.1');
  await page.locator('#btn-convert').click();
  expect((await page.evaluate(() => window.__almResults())).rows).toHaveLength(0);
  await page.locator('#in-se').fill('0.12');
  await page.locator('#btn-convert').click();
  const before = await page.locator('#forest-axis line').first().getAttribute('x1');
  await page.locator('#alm-axis-mount input[data-edge="min"]').fill('-1');
  await page.locator('#alm-axis-mount input[data-edge="min"]').dispatchEvent('change');
  await page.locator('#alm-axis-mount input[data-edge="max"]').fill('3');
  await page.locator('#alm-axis-mount input[data-edge="max"]').dispatchEvent('change');
  const after = await page.locator('#forest-axis line').first().getAttribute('x1');
  expect(Number(after)).not.toBeCloseTo(Number(before), 6);
  expect(await page.locator('#alm-axis-mount input[data-edge="log"]').isDisabled()).toBe(true);
});

test('Wald p quantile derives ratio log-scale SE at p=0.05', async ({ page }) => {
  await open(page);
  await page.locator('#in-type').selectOption('OR');
  await page.locator('#in-est').fill('0.75');
  await page.locator('#der-p').fill('0.05');
  await page.locator('#btn-derive').click();
  const got = await page.evaluate(() => window.__almResults().input_se);
  expect(got).toBeCloseTo(Math.abs(Math.log(0.75)) / 1.959963984540054, 8);
});
