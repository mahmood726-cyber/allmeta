import { test, expect } from '@playwright/test';

// Degenerate but legal inputs. Reference: R 4.6.0, robumeta 2.1 robu(modelweights = "CORR", small = TRUE), cross-checked
// with clubSandwich 0.7.0 coef_test(vcov = "CR2", test = "Satterthwaite").
const APP = 'rve-meta';
async function fit(page, src, names = '', rho = '0.8') {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(() => typeof window.__almRveRun === 'function');
  await page.evaluate(({ src, names, rho }) => {
    document.getElementById('src').value = src; document.getElementById('f-names').value = names;
    document.getElementById('f-rho').value = rho; document.getElementById('f-centre').checked = false; window.__almRveRun();
  }, { src, names, rho });
  return page.evaluate(() => window.__almLastRVE ? window.__almLastRVE() : null);
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);

test('EDGE identical effect sizes: robust SE = 0 is explained, not shown as a bare dash', async ({ page }) => {
  const r = await fit(page, 'A, 0.30, 0.04\nA, 0.30, 0.04\nB, 0.30, 0.04\nB, 0.30, 0.04\nC, 0.30, 0.04\nD, 0.30, 0.04');
  // robumeta: b = 0.3, SE = 0, t = Inf, df = 3, p = 0 (same numbers here).
  expect(r.summary[0].estimate).toBe(0.3); expect(r.summary[0].se).toBe(0); close(r.summary[0].df, 3, 1e-9);
  await expect(page.locator('#zero-se-warning')).toContainText('Robust SE = 0 for (intercept)');
  await expect(page.locator('#zero-se-warning')).toContainText('every residual is zero');
  expect(r.warnings.join(' ')).toContain('Robust SE = 0');
});

test('EDGE a normal fit carries no zero-SE note', async ({ page }) => {
  await fit(page, 'A, 0.30, 0.04\nA, 0.40, 0.05\nB, 0.10, 0.03\nB, 0.15, 0.02\nC, 0.55, 0.06');
  await expect(page.locator('#meta-row')).toContainText('m = 3 clusters');
  await expect(page.locator('#zero-se-warning')).toHaveCount(0);
});

test('EDGE m = 2 clusters (df = 1) and m = 3 with a slope match robumeta', async ({ page }) => {
  let r = await fit(page, 'A, 0.30, 0.04\nA, 0.40, 0.05\nB, 0.10, 0.03\nB, 0.15, 0.02');
  close(r.summary[0].estimate, 0.205357142857143, 1e-6); close(r.summary[0].se, 0.10781042034374, 1e-6);
  close(r.summary[0].df, 1, 1e-6); close(r.summary[0].p, 0.307766866026451, 1e-6);
  r = await fit(page, 'A, 0.30, 0.04, 1\nA, 0.40, 0.05, 2\nB, 0.10, 0.03, 1\nB, 0.15, 0.02, 3\nC, 0.55, 0.06, 2\nC, 0.50, 0.05, 4', 'dose');
  close(r.summary[1].estimate, 0.0560709098561812, 1e-6); close(r.summary[1].se, 0.0396012989202434, 1e-6);
  close(r.summary[1].df, 1.61275056470411, 1e-6); close(r.model.tau2, 0.00446836018711018, 1e-6);
});

test('EDGE fewer clusters than coefficients and a constant predictor refuse with the reason', async ({ page }) => {
  await fit(page, 'A, 0.30, 0.04\nA, 0.40, 0.05\nA, 0.20, 0.03');
  await expect(page.locator('#meta-row')).toContainText('1 cluster cannot support 1 coefficient');
  await fit(page, 'A, 0.30, 0.04, 2\nA, 0.40, 0.05, 2\nB, 0.10, 0.03, 2\nB, 0.15, 0.02, 2\nC, 0.55, 0.06, 2\nD, 0.25, 0.03, 2', 'dose');
  await expect(page.locator('#meta-row')).toContainText('predictors are collinear');
});
