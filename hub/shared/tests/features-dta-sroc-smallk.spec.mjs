import { test, expect } from '@playwright/test';

// k = 1..3 (Mahmood 2026-10-31: where R fits, fit exactly as R does and warn visibly; where R fails, refuse and say why).
// Reference: R 4.6.0, mada 0.5.12 reitsma() (mvmeta 1.0.3), correction 0.5, correction.control "all". mada fits every
// case below and warns "There are very few primary studies!" (checkdata, k < 5); at k = 1 its "mm" and "vc" fits fail
// ("non-conformable arrays", "infinite or missing values in 'x'").
const APP = 'dta-sroc';
const ROWS = [[80, 12, 20, 138], [60, 14, 19, 105], [115, 22, 37, 205]];
async function run(page, rows, method = 'reml', cov = '') {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  const data = rows.map((r, i) => 'S' + (i + 1) + ', ' + r.join(', ')).join('\n');
  await page.evaluate(({ a, data, method, cov }) => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), data, method, cc: 'all', cov }); }, { a: APP, data, method, cov });
  return page.evaluate(() => window.__almResults());
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);
const T = 1e-6; // the existing mada tolerance of features-dta-sroc-edge.spec.mjs

async function smallKWarning(page, r, k) {
  const w = page.locator('#warn-banner');
  await expect(w).toBeVisible();
  await expect(w).toContainText('Only k = ' + k + ' stud');
  await expect(w).toContainText('There are very few primary studies!');
  await expect(w).toContainText('interpret with great caution');
  expect(r.errors.join(' ')).toContain('Only k = ' + k + ' stud');
  await expect(page.locator('#stats-wrap')).toContainText('Summary Se');
}

test('SMALLK k = 3 (REML) is fitted as mada fits it, with a visible small-k warning', async ({ page }) => {
  const r = await run(page, ROWS);
  expect(r.bivariate, 'the k = 3 fit must not be refused').not.toBeNull();
  close(r.bivariate.mu_logit_se, 1.20702899280995, T); close(r.bivariate.mu_logit_fpr, -2.22367374893239, T);
  close(r.bivariate.sens, 0.769772841446796, T);
  close(r.bivariate.sens_ci[0], 0.721237481543719, T); close(r.bivariate.sens_ci[1], 0.812059738943326, T);
  close(r.bivariate.vcov[0][0], 0.0171163119668337, T); close(r.bivariate.vcov[1][1], 0.0231156244422854, T);
  close(r.bivariate.logLik, 12.3916679636759, T); close(r.bivariate.AIC, -14.7833359273518, T);
  await smallKWarning(page, r, 3);
});

test('SMALLK k = 2 with each estimator matches mada', async ({ page }) => {
  const two = ROWS.slice(0, 2);
  let r = await run(page, two, 'reml');
  close(r.bivariate.mu_logit_se, 1.27219398159216, T); close(r.bivariate.mu_logit_fpr, -2.2205698810233, T);
  close(r.bivariate.Psi[0][0], 0.00917743579210246, T); close(r.bivariate.Psi[0][1], -0.0165949423726603, T); close(r.bivariate.Psi[1][1], 0.0300075226464459, T);
  close(r.bivariate.sens_ci[0], 0.709479420619021, T); close(r.bivariate.logLik, 7.76479253707854, T);
  await smallKWarning(page, r, 2);
  r = await run(page, two, 'ml');
  close(r.bivariate.mu_logit_se, 1.27419652127283, T); close(r.bivariate.mu_logit_fpr, -2.2166297674566, T); close(r.bivariate.logLik, 9.1653836477278, T);
  r = await run(page, two, 'mm');
  close(r.bivariate.mu_logit_se, 1.27193619394276, T); close(r.bivariate.Psi[0][0], 0.0117302672125275, T); close(r.bivariate.Psi[1][1], 0.0270979473900834, T);
  r = await run(page, two, 'vc');
  close(r.bivariate.mu_logit_se, 1.27193840812629, T); close(r.bivariate.mu_logit_fpr, -2.22036536405468, T); close(r.bivariate.Psi[0][0], 0.0117118028892578, T);
});

test('SMALLK k = 1 (REML, ML) matches mada; mm and vc stay refused with the reason, as mada fails', async ({ page }) => {
  const one = ROWS.slice(0, 1);
  let r = await run(page, one, 'reml');
  close(r.bivariate.mu_logit_se, 1.38629436111989, T); close(r.bivariate.mu_logit_fpr, -2.4423470353692, T);
  close(r.bivariate.sens, 0.8, T); close(r.bivariate.sens_ci[0], 0.710189242944263, T); close(r.bivariate.sens_ci[1], 0.867183876512509, T);
  close(r.bivariate.vcov[0][0], 0.06250001, T); close(r.bivariate.logLik, 4.44169171699562, T);
  await smallKWarning(page, r, 1);
  r = await run(page, one, 'ml');
  close(r.bivariate.sens_ci[0], 0.710189250247258, T); close(r.bivariate.logLik, 5.1908715186906, T);
  for (const m of ['mm', 'vc']) {
    r = await run(page, one, m);
    expect(r.bivariate).toBeNull();
    await expect(page.locator('#warn-banner')).toContainText('needs at least 2 studies');
    await expect(page.locator('#warn-banner')).toContainText('mada fails at k = 1 too');
  }
});

test('SMALLK k = 3 bivariate meta-regression (REML) matches mada', async ({ page }) => {
  const r = await run(page, ROWS.map((x, i) => x.concat([[0, 1, 0][i]])), 'reml', 'last');
  expect(r.meta_regression, 'the k = 3 meta-regression must not be refused').not.toBeNull();
  const R = [1.22576616965978, -0.0758605866041191, -2.30711317455905, 0.292210154016788];
  r.meta_regression.coefficients.forEach((c, i) => close(c.estimate, R[i], T));
  close(r.meta_regression.logLik, 12.3559515657184, T);
  await expect(page.locator('#warn-banner')).toContainText('Only k = 3 studies');
});

test('SMALLK k >= 4 carries no small-k warning; no studies says what to enter', async ({ page }) => {
  await run(page, ROWS.concat([[50, 6, 9, 95]]));
  await expect(page.locator('#warn-banner')).not.toContainText('Only k =');
  await page.locator('#f-data').fill('');
  await expect(page.locator('#svg-host')).toContainText('Enter at least one study');
  await expect(page.locator('#warn-banner')).toContainText('currently 0');
});
