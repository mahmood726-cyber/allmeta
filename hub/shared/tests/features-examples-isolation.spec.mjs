import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../../validation/examples/manifest.json', import.meta.url), 'utf8'));

for (const { app, dataset } of manifest) {
  test(`${app}: real example picker leaves legacy form enumeration unchanged`, async ({ page }) => {
    await page.goto(`/${app}/`);
    await expect(page.getByRole('region', { name: 'Real example', exact: true })).toBeVisible();
    const picker = page.getByLabel('Published dataset:');
    await expect(picker).toHaveValue(dataset);
    const result = await page.evaluate(() => {
      const panel = document.getElementById('alm-real-example-panel');
      const fields = () => [...document.querySelectorAll('textarea,select,input')];
      const withPicker = fields();
      const next = panel.nextSibling, parent = panel.parentNode;
      panel.remove();
      const original = fields();
      parent.insertBefore(panel, next);
      // Reproduce the defect: a native select in the light DOM joins legacy queries.
      const plant = document.createElement('select'); panel.append(plant);
      const planted = fields(); plant.remove();
      return {
        unchanged: withPicker.length === original.length && withPicker.every((el, i) => el === original[i]),
        plantDetected: planted.length === original.length + 1 && planted.includes(plant)
      };
    });
    expect(result.unchanged).toBe(true);
    expect(result.plantDetected).toBe(true);
    await picker.selectOption(dataset);
    await expect(page.locator('#alm-real-example-citation')).toHaveText('');
  });
}

test('choosing a real example does not create an original DTA autosave draft', async ({ page }) => {
  await page.goto('/dta-sroc/');
  const picker = page.getByLabel('Published dataset:');
  await expect(picker).toHaveValue('AuditC');
  await page.evaluate(() => localStorage.clear());
  // Composed events reach document listeners with the shadow host as their target.
  await picker.evaluate(select => {
    for (const type of ['input', 'change']) select.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  });
  await page.waitForTimeout(1000); // original autosave debounce is 600 ms
  expect(await page.evaluate(() => localStorage.getItem('alm-autosave:dta-sroc'))).toBeNull();
  // Positive control: original data edits must still save.
  await page.locator('#f-data').dispatchEvent('input');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('alm-autosave:dta-sroc') || '{}').values?.['f-data'])).toBeTruthy();
});
