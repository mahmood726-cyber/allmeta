import { test, expect } from '@playwright/test';

// Synthetic counterexample, never presented as clinical data.
const rcts = 'RCT A, -0.2, 0.01, rct\nRCT B, 0.5, 0.25, rct';
const obs = 'Obs A, -4, 0.01, obs\nObs B, 6, 0.02, obs';
const fields = ['mu', 'sePost', 'ci_lo', 'ci_hi', 'tau2'];

async function openApp(page, testInfo) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(new URL('/cross-design/', testInfo.project.use.baseURL).href);
  expect(response.status()).toBe(200);
  await expect(page.locator('#btn-run')).toBeVisible();
  return errors;
}

async function run(page, data, alpha) {
  await page.locator('#src').fill(data);
  await page.locator('#f-alpha').fill(String(alpha));
  await page.locator('#btn-run').click();
  return page.evaluate(() => window.__almLastCrossDesign());
}

test('alpha=0 isolates RCT estimates, uncertainty and heterogeneity in the actual app', async ({ page }, testInfo) => {
  const errors = await openApp(page, testInfo);
  const expected = (await run(page, rcts, 0)).fits.powerPrior;
  // Exact independent DL calculation: tau²=23/200, mu=-3/140, SE²=73/784.
  expect(expected.tau2).toBeCloseTo(23 / 200, 12);
  expect(expected.mu).toBeCloseTo(-3 / 140, 12);
  expect(expected.sePost).toBeCloseTo(Math.sqrt(73 / 784), 12);
  for (const observational of [obs, obs + '\nObs C, 200, 0.0001, obs']) {
    const actual = (await run(page, rcts + '\n' + observational, 0)).fits.powerPrior;
    for (const field of fields) expect(actual[field]).toBeCloseTo(expected[field], 12);
    await expect(page.locator('#results tbody tr').nth(1)).toContainText('-0.0214');
    await expect(page.locator('#results tbody tr').nth(1)).toContainText('0.1150');
  }
  expect(errors).toEqual([]);
});

test('alpha=1 still equals naive pooling in every reported field', async ({ page }, testInfo) => {
  const errors = await openApp(page, testInfo);
  const { fits } = await run(page, rcts + '\n' + obs, 1);
  for (const field of fields) expect(fits.powerPrior[field]).toBeCloseTo(fits.naive[field], 12);
  expect(errors).toEqual([]);
});

test('all-observational alpha=0 displays non-estimability and exports current null results', async ({ page }, testInfo) => {
  const errors = await openApp(page, testInfo);
  await run(page, rcts + '\n' + obs, 0.5);
  const result = await run(page, obs, 0);
  expect(result.rows).toHaveLength(2);
  expect(result.alpha).toBe(0);
  for (const field of fields.slice(0, 4)) expect(result.fits.powerPrior[field]).toBeNull();
  expect(result.fits.powerPrior.tau2).toBe(0);
  expect(result.fits.powerPrior.warning).toBeTruthy();
  await expect(page.locator('#results tbody tr').nth(1)).toContainText('Not estimable');
  await expect(page.locator('#forest-host')).toContainText('Not estimable');
  expect(await page.locator('#forest-host polygon').count()).toBe(2);
  expect(await page.locator('#forest-host').innerHTML()).not.toMatch(/NaN|Infinity/);
  const recovered = await run(page, rcts + '\n' + obs, 0);
  expect(recovered.fits.powerPrior.mu).toBeCloseTo(-3 / 140, 12);
  expect(await page.locator('#forest-host polygon').count()).toBe(3);
  expect(errors).toEqual([]);
});
