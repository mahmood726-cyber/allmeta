// limit-ma degenerate inputs (edge-case R sweep, 2026-10-31). When the page refuses an analysis (k < 3, or no variation in
// the study SEs: metasens::limitmeta then fails with "0 (non-NA) cases" or warns "essentially perfect fit"), the
// "Validate this analysis in R" check must refuse with the page's own reason, never with a JavaScript TypeError
// ("Cannot read properties of null"). k = 3/4/6, identical effects with varying SE, a huge-weight study, low
// heterogeneity and all-negative effects matched validate/adapter.js's R script (meta 8.5-0, metasens 1.5-3) at 1e-9.
// Run: npx playwright test -c playwright.features.config.mjs features-edge-limit-ma.spec.mjs
import { test, expect } from '@playwright/test';

const PAGE = '/limit-ma/index.html';
for (const [name, text, reason] of [
  ['equal SEs', '0.1, 0.1, S1\n0.2, 0.1, S2\n0.3, 0.1, S3\n0.25, 0.1, S4', 'Limit meta-analysis requires variation in study SEs.'],
  ['identical studies', '0.3, 0.1, S1\n0.3, 0.1, S2\n0.3, 0.1, S3\n0.3, 0.1, S4', 'Limit meta-analysis requires variation in study SEs.'],
]) {
  test(`EDGE: ${name} — page and live R check both refuse with the reason`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE);
    await page.locator('#src').fill(text);
    await page.locator('#btn-run').click();
    await expect(page.locator('#limit-error')).toHaveText(reason);
    await expect(page.locator('#body tr')).toHaveCount(0);
    await page.getByRole('button', { name: 'Validate this analysis in R', exact: true }).click();
    const status = page.locator('#alm-validate [role=status]');
    await expect(status).toContainText(reason);
    await expect(status).not.toContainText(/Cannot read|TypeError|null/);
    expect(errors).toEqual([]);
  });
}
