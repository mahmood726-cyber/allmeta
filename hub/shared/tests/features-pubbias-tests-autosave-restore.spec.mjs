// pubbias-tests: pressing Restore on the autosave draft must bring back the user's own data in each format.
// Defect: shared/autosave.js replayed fields grouped by selector (every textarea before every select) and fired change
// on each; the format selector's change handler then loaded the built-in example over the restored #src, so the draft
// was lost. Each case uses NON-example rows, so a restore that falls back to the example cannot pass.
import { test, expect } from './validation-fixture.mjs';
const URL_ = '/pubbias-tests/index.html';
test.describe.configure({ timeout: 120000 });

const CASES = [
  ['te-se', '0.61, 0.21\n0.05, 0.04\n0.47, 0.18\n0.09, 0.05\n0.38, 0.16\n0.02, 0.03\n0.71, 0.25\n0.14, 0.06\n0.52, 0.19\n0.11, 0.07'],
  ['binary', '9, 120, 21, 118\n4, 70, 12, 72\n30, 260, 41, 255\n7, 85, 16, 80\n11, 140, 25, 145\n2, 35, 8, 33\n19, 210, 27, 205\n6, 64, 15, 66'],
];

for (const [format, data] of CASES) {
  test(`format=${format}: Restore keeps the restored rows and their numbers`, async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#body tr').first()).toBeVisible();
    await page.evaluate(() => localStorage.clear());
    // The built-in example for this format, for the planted control below.
    await page.selectOption('#format', format);
    await page.locator('#btn-run').click();
    const exampleSrc = await page.locator('#src').inputValue();
    const exampleBody = await page.locator('#body').innerText();
    // The user's own rows: entered, run, and saved as the draft.
    await page.locator('#src').fill(data);
    await page.locator('#btn-run').click();
    const ownBody = await page.locator('#body').innerText();
    expect(ownBody).toMatch(/\d/);
    expect(data).not.toBe(exampleSrc);
    expect(ownBody, 'the own rows give numbers different from the example').not.toBe(exampleBody);
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('alm-autosave:pubbias-tests') || '{}').values) || {}),
      { timeout: 10000 }).toMatchObject({ format, src: data });

    // A fresh load (no URL state) offers the draft; Restore must reproduce the rows and, when run, the same numbers.
    await page.goto(URL_);
    await expect(page.locator('#body tr').first()).toBeVisible();
    await page.locator('div[role=status] button', { hasText: /^Restore$/ }).click();
    await expect(page.locator('#format')).toHaveValue(format);
    await expect(page.locator('#src')).toHaveValue(data);
    await page.locator('#btn-run').click();
    await expect.poll(() => page.locator('#body').innerText()).toBe(ownBody);
    expect(await page.locator('#body').innerText()).not.toBe(exampleBody);
  });
}
