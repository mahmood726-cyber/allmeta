// Undefined fragility outputs must stay visibly unavailable. shared/fragility.js returns null (not NaN) for an
// uncomputed fragility index; isFinite(null) is true in JavaScript, so a null must never render as 0, "null" or a
// pooled value. Case 1: two double-zero tables (no pooled estimate at all). Case 2: a non-significant result.
import { test, expect } from '@playwright/test';

for (const [label, data, noPool] of [
  ['no informative tables', '0,10,0,10\n0,20,0,20', true],
  ['non-significant result', '2,20,2,20\n3,30,3,30', false],
]) {
  test(`fragility page shows n/a for an undefined index: ${label}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/fragility/index.html');
    await page.locator('#data').fill(data);
    await page.locator('#btn-run').click();
    const rows = page.locator('#tbody tr');
    await expect(rows.nth(1).locator('td')).toHaveText('n/a');   // fragility index
    await expect(rows.nth(2).locator('td')).toHaveText('n/a');   // fragility quotient
    if (noPool) await expect(rows.nth(0).locator('td')).not.toContainText('1.000');
    expect(await page.locator('#tbody').innerText()).not.toContain('null');
    expect(errors).toEqual([]);
  });
}
