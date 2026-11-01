// pubbias-tests degenerate inputs (edge-case R sweep, 2026-10-31). Below five studies the page runs no test; the refusal
// must say so and name the rule (it used to say only "very low power below k=10", which reads as a warning, not as the
// reason nothing was computed). All-equal standard errors make the Egger design singular: the page refuses with that
// reason, as metafor::regtest does ("Model matrix no longer of full rank"). k = 5..7, a huge-weight study, low
// heterogeneity and binary zero / double-zero / all-zero-arm / full-arm tables matched validate/adapter.js's R script
// (metafor 5.2-1, meta 8.5-0) at the adapter tolerance.
// Run: npx playwright test -c playwright.features.config.mjs features-edge-pubbias-tests.spec.mjs
import { test, expect } from '@playwright/test';

const PAGE = '/pubbias-tests/index.html';
async function enter(page, text, format = 'te-se') {
  await page.locator('#format').selectOption(format);
  await page.locator('#src').fill(text);
  await page.locator('#btn-run').click();
}

test('EDGE: k < 5 refuses and names the five-study rule; nothing stale is left', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  for (const k of [1, 2, 4]) {
    await enter(page, ['0.25, 0.08', '0.18, 0.10', '0.40, 0.15', '0.30, 0.09'].slice(0, k).join('\n'));
    const body = page.locator('#body');
    await expect(body).toContainText('need at least 5 studies');
    await expect(body).toContainText(`Current k = ${k}.`);
    await expect(body.locator('tr')).toHaveCount(1);
    await expect(page.locator('#funnel circle')).toHaveCount(0);
    expect(await page.evaluate(() => window._almLastPubbias && window._almLastPubbias())).toBeFalsy();
  }
  expect(errors).toEqual([]);
});

test('EDGE: all-equal standard errors refuse with the singular-design reason', async ({ page }) => {
  await page.goto(PAGE);
  await enter(page, '0.1, 0.1\n0.2, 0.1\n0.3, 0.1\n0.25, 0.1\n0.15, 0.1');
  await expect(page.locator('#body')).toContainText('Singular regression design');
  await expect(page.locator('#body')).not.toContainText(/NaN|Infinity|undefined/);
});
