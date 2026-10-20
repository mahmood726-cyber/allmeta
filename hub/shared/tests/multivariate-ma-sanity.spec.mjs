// multivariate-ma sanity: default example equals the pinned R reference; no console errors; no off-origin requests.
import { test, expect } from './multivariate-ma-fixture.mjs';
import { readFileSync } from 'node:fs';
const ref = JSON.parse(readFileSync(new URL('../../../multivariate-ma/validate/plus/reference.json', import.meta.url), 'utf8'));
const berkey = ref.configurations.find(c => c.id === 'mvmeta::berkey98::PD+AL::REML::supplied').supplied;
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
test('multivariate-ma default example matches mvmeta (pinned reference) and renders cleanly', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors/.test(m.text())) errors.push(m.text()); });
  await page.goto('/multivariate-ma/index.html');
  await page.waitForFunction(() => window._almLastMultivariate && window._almLastMultivariate());
  const o = await page.evaluate(() => window._almLastMultivariate());
  for (let j = 0; j < 2; j++) { expect(rel(o.mu[j], berkey.mu[j])).toBeLessThan(1e-6); expect(rel(o.muSE[j], berkey.muSE[j])).toBeLessThan(1e-6); expect(Math.abs(o.p[j] - berkey.p[j])).toBeLessThan(1e-6); }
  expect(rel(o.logLik, berkey.logLik)).toBeLessThan(1e-6); expect(rel(o.rho, berkey.rho)).toBeLessThan(1e-6);
  await expect(page.locator('#stats .stat')).toHaveCount(5);
  await expect(page.locator('#plot-host svg polygon')).toHaveCount(1);
  await expect(page.locator('footer')).not.toContainText('~1e-7');
  expect(errors).toEqual([]);
});
