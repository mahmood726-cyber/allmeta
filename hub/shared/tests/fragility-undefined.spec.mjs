// Undefined fragility outputs must stay visibly unavailable. shared/fragility.js returns null (not NaN) for an
// uncomputed fragility index; isFinite(null) is true in JavaScript, so a null must never render as 0, "null" or a
// pooled value (exp(null) = 1 would show as "1.000").
// Case 1: a single study — fragility::frag.ma refuses k = 1, so there is no pooled estimate at all.
// Case 2: two double-zero tables — frag.ma keeps them (drop00 = FALSE, +1/2) and pools OR = 1, 95% CI
//         0.05954112 to 16.79512 (R 4.6.0, fragility 2.0, metafor 5.0-1), non-significant, so FI is undefined.
//         (Before the frag.ma correction the page dropped both tables and had no pooled estimate here.)
// Case 3: a non-significant result.
import { test, expect } from '@playwright/test';

for (const [label, data, pooledText] of [
  ['single study (no pooled estimate)', '2,50,15,50', null],
  ['double-zero tables only', '0,10,0,10\n0,20,0,20', '1.000 (95% CI 0.060–16.795)'],
  ['non-significant result', '2,20,2,20\n3,30,3,30', undefined],
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
    if (pooledText === null) await expect(rows.nth(0).locator('td')).not.toContainText('1.000');
    else if (pooledText) await expect(rows.nth(0).locator('td')).toHaveText(pooledText);
    expect(await page.locator('#tbody').innerText()).not.toContain('null');
    expect(errors).toEqual([]);
  });
}
