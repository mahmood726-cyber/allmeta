import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const real = JSON.parse(fs.readFileSync(new URL('../fixtures/reml_nonconvergence.json', import.meta.url))).reviews;
const modes = JSON.parse(fs.readFileSync(new URL('../fixtures/reml_global_modes.json', import.meta.url))).cases;
const cases = [real[1], ...modes];

for (const c of cases) {
  test(`Heterogeneity Explorer uses global REML: ${c.id || c.review_id}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/heterogeneity/index.html');
    await page.locator('#f-data').fill(c.yi.map((y, i) => `Study ${i+1},${y},${Math.sqrt(c.vi[i])}`).join('\n'));
    await page.locator('#f-tau2').selectOption('reml');
    await expect(page.locator('#stats-wrap')).toContainText('REML');
    await expect.poll(async () => (await page.evaluate(() => window.__almResults())).tau2)
      .toBeCloseTo(c.expected_tau2, 7);
    const result = await page.evaluate(() => window.__almResults());
    expect(result.k).toBe(c.yi.length);
    expect(result.tau2_estimator).toBe('reml');
    expect(result.tau2_reml).toBeCloseTo(c.expected_tau2, 7);
    expect(result.pi_lb).toBeLessThan(result.pi_ub);
    if(c.expected_tau2 === 0) expect(result.tau2).toBe(0);
    expect(errors).toEqual([]);
  });
}
