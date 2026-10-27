import { test, expect } from '@playwright/test';

async function ready(page, app) {
  await page.goto(`/${app}/index.html`);
  await expect(page.locator('html')).toHaveAttribute('data-alm-glossary-ready', 'true');
}

test('fixed ROC controls stay out of the glossary tab sequence', async ({ page }) => {
  await ready(page, 'dta-sroc');
  await expect(page.locator('#alm-axis-mount [data-gloss], #alm-axis-mount [data-alm-choice]')).toHaveCount(0);
  await page.locator('#f-title').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#alm-axis-mount'))).toBe(false);
  await expect(page.locator('#f-method + [data-alm-choice] [data-gloss]')).not.toHaveCount(0);
});

for (const model of ['FE', 'DL', 'PM']) test(`NMA ${model} live text contract survives glossary annotation and detects corruption`, async ({ page }) => {
  await ready(page, 'nma-inconsistency');
  await page.selectOption('#f-model', model);
  await page.click('#btn-run');
  const checks = () => page.evaluate(() => AlmIncoValidationAdapter.live.currentState().values
    .filter(row => row.key.startsWith('display.')));
  const control = await checks();
  expect(control.find(row => row.key === 'display.pageText')?.value).toBe(true);
  expect(control.every(row => row.value)).toBe(true);
  await page.locator('header [data-alm-glossary]').first().evaluate(el => { el.textContent = 'WRONG'; });
  expect((await checks()).find(row => row.key === 'display.pageText').value).toBe(false);
});

test('correlation result restoration keeps markup and working unique tooltip links', async ({ page }) => {
  await ready(page, 'correlation-ma');
  await page.locator('#alm-plus-loo-btn').click();
  const result = () => page.evaluate(() => ['alm-plus-sens', 'alm-plus-loo', 'alm-plus-prose']
    .map(id => document.getElementById(id).innerHTML));
  await page.evaluate(() => window.alm.tooltips.rescan());
  const before = await result();
  await page.evaluate(() => {
    const saved = AlmCorrPlusUI.snapshot();
    AlmCorrPlusUI.restore(saved);
  });
  await expect.poll(result).toEqual(before);
  expect(await page.locator('[data-gloss]').evaluateAll(elements => {
    const ids = elements.map(el => el.dataset.almTip);
    return new Set(ids).size === ids.length && elements.every(el =>
      document.getElementById(el.dataset.almTip)?.getAttribute('role') === 'tooltip' &&
      el.getAttribute('aria-describedby').split(/\s+/).includes(el.dataset.almTip));
  })).toBe(true);
  const mark = page.locator('#alm-plus-loo [data-gloss]').first();
  await mark.focus();
  await expect(page.locator('#' + await mark.getAttribute('data-alm-tip'))).toHaveClass(/is-visible/);
});

test('published DTA table and cards retain their original markup while prose gets help', async ({ page }) => {
  await ready(page, 'dta-sroc');
  await page.locator('#plus-example').selectOption({ index: 1 });
  await page.locator('#plus-load').click();
  await expect(page.locator('#plus-results table')).toBeVisible();
  await page.evaluate(() => window.alm.tooltips.rescan());
  await expect(page.locator('#plus-results table [data-gloss], #plus-results dl [data-gloss]')).toHaveCount(0);
  await expect(page.locator('#alm-plus > p [data-gloss]').first()).toBeVisible();
});
