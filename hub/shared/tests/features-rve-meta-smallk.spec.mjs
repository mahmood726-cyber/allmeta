import { test, expect } from '@playwright/test';

// Small-m designs (no more clusters than coefficients). Mahmood 2026-10-31: where R fits, fit exactly as R does and warn
// visibly; where R fails, refuse with the reason. Reference: R 4.6.0, robumeta 2.1 robu(modelweights = "CORR", rho = 0.8,
// small = TRUE); every fitted case below is also matched by clubSandwich 0.7.0 coef_test(vcov = "CR2", test = "Satterthwaite").
const APP = 'rve-meta';
async function fit(page, src, names = '') {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(() => typeof window.__almRveRun === 'function');
  await page.evaluate(({ src, names }) => {
    document.getElementById('src').value = src; document.getElementById('f-names').value = names;
    document.getElementById('f-rho').value = '0.8'; document.getElementById('f-centre').checked = false; window.__almRveRun();
  }, { src, names });
  return page.evaluate(() => window.__almLastRVE ? window.__almLastRVE() : null);
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);
const report = page => page.evaluate(() => window.AlmRVEExtras.toReportMarkdown(window.__almLastRVE(), '2026-10-31'));

test('SMALLK m = 2 clusters, p = 2 coefficients fits as robumeta does, with a visible warning', async ({ page }) => {
  const r = await fit(page, 'A, 0.30, 0.04, 1\nA, 0.40, 0.05, 2\nB, 0.10, 0.03, 1\nB, 0.15, 0.02, 3', 'dose');
  expect(r, 'fit must not be refused').not.toBeNull();
  const R = { b: [0.207269789983845, -0.00105008077544433], se: [0.119188675594835, 0.0200284804796224], df: [1.07302231237323, 1.04812834224599],
    lo: [-1.08407110913588, -0.229516786261526], hi: [1.49861068910357, 0.227416624710638], p: [0.319350029328406, 0.966352899449152] };
  for (let j = 0; j < 2; j++) {
    close(r.summary[j].estimate, R.b[j], 1e-6); close(r.summary[j].se, R.se[j], 1e-6); close(r.summary[j].df, R.df[j], 1e-6);
    close(r.summary[j].ci_lo, R.lo[j], 1e-6); close(r.summary[j].ci_hi, R.hi[j], 1e-6); close(r.summary[j].p, R.p[j], 1e-6);
  }
  expect(r.model.tau2).toBe(0);
  const w = page.locator('#few-clusters-warning');
  await expect(w).toBeVisible();
  await expect(w).toContainText('2 clusters for 2 coefficients');
  await expect(w).toContainText('interpret with great caution');
  await expect(page.locator('#coef-body tr')).toHaveCount(2);
  expect(r.warnings.join(' ')).toContain('2 clusters for 2 coefficients');
  expect(await report(page)).toContain('2 clusters for 2 coefficients');
});

test('SMALLK m = 2 clusters, p = 3 coefficients fits as robumeta does (df = 1)', async ({ page }) => {
  const r = await fit(page, 'A, 0.30, 0.04, 1, 5\nA, 0.40, 0.05, 2, 3\nB, 0.10, 0.03, 1, 2\nB, 0.15, 0.02, 3, 7', 'x1, x2');
  const R = { b: [0.208333333333334, 0.00119047619047619, -0.00119047619047608], se: [0.167705098312485, 0.0239578711874975, 0.0239578711874978],
    lo: [-1.9225619811254, -0.303223140160768, -0.305604092541723], p: [0.431483612162625, 0.968392106801451, 0.968392106801454] };
  for (let j = 0; j < 3; j++) {
    close(r.summary[j].estimate, R.b[j], 1e-6); close(r.summary[j].se, R.se[j], 1e-6); close(r.summary[j].df, 1, 1e-6);
    close(r.summary[j].ci_lo, R.lo[j], 1e-6); close(r.summary[j].p, R.p[j], 1e-6);
  }
  await expect(page.locator('#few-clusters-warning')).toContainText('2 clusters for 3 coefficients');
});

test('SMALLK m = p = 3 with a slope matches robumeta and warns', async ({ page }) => {
  const r = await fit(page, 'A, 0.30, 0.04, 1, 5\nA, 0.40, 0.05, 2, 3\nB, 0.10, 0.03, 1, 2\nB, 0.15, 0.02, 3, 7\nC, 0.55, 0.06, 2, 1\nC, 0.50, 0.05, 4, 4', 'x1, x2');
  const R = { b: [0.253350507685343, 0.108564899648608, -0.0517679522279949], se: [0.187986251212026, 0.0868901353342147, 0.0336876636854091],
    df: [1.40519502725303, 1.41641540663777, 1.91133892212653], p: [0.354628461144765, 0.37927631560758, 0.269708211134518] };
  for (let j = 0; j < 3; j++) {
    close(r.summary[j].estimate, R.b[j], 1e-6); close(r.summary[j].se, R.se[j], 1e-6); close(r.summary[j].df, R.df[j], 1e-6); close(r.summary[j].p, R.p[j], 1e-6);
  }
  await expect(page.locator('#few-clusters-warning')).toContainText('3 clusters for 3 coefficients');
});

test('SMALLK a perfect fit (one effect per coefficient) reports what robumeta reports: SE 0, df not estimable', async ({ page }) => {
  // robumeta: b = (0, 0.2), SE = (0, 0), df = (NaN, NaN), CI and p NaN.
  const r = await fit(page, 'a,0.2,0.03,1\nb,0.4,0.04,2', 'dose');
  close(r.summary[0].estimate, 0, 1e-9); close(r.summary[1].estimate, 0.2, 1e-9);
  expect(r.summary[0].se).toBe(0); expect(r.summary[1].se).toBe(0);
  expect(Number.isNaN(r.summary[0].df)).toBe(true); expect(Number.isNaN(r.summary[1].df)).toBe(true);
  expect(Number.isNaN(r.summary[1].p)).toBe(true);
  await expect(page.locator('#df-na-warning')).toBeVisible();
  await expect(page.locator('#df-na-warning')).toContainText('df not estimable');
  await expect(page.locator('#few-clusters-warning')).toBeVisible();
  await expect(page.locator('#coef-body tr').nth(1).locator('td').nth(3)).toHaveText('—');
});

test('SMALLK designs robumeta cannot fit stay refused, with the reason', async ({ page }) => {
  // robumeta errors on both ("infinite or missing values in 'x'").
  let r = await fit(page, 'A, 0.30, 0.04\nA, 0.40, 0.05\nA, 0.20, 0.03');
  expect(r).toBeNull();
  await expect(page.locator('#meta-row [role="alert"]')).toContainText('1 cluster cannot support 1 coefficient');
  await expect(page.locator('#meta-row [role="alert"]')).toContainText('at least 2 clusters');
  r = await fit(page, 'A,0.1,0.04,1\nA,0.2,0.04,1\nA,0.3,0.04,1\nB,0.4,0.04,0\nB,0.5,0.04,0\nB,0.6,0.04,0', 'dose');
  expect(r).toBeNull();
  await expect(page.locator('#meta-row [role="alert"]')).toContainText('τ² cannot be estimated');
});

test('SMALLK a design with more clusters than coefficients carries no few-clusters warning', async ({ page }) => {
  await fit(page, 'A, 0.30, 0.04, 1\nA, 0.40, 0.05, 2\nB, 0.10, 0.03, 1\nB, 0.15, 0.02, 3\nC, 0.55, 0.06, 2\nC, 0.50, 0.05, 4', 'dose');
  await expect(page.locator('#coef-body tr')).toHaveCount(2);
  await expect(page.locator('#few-clusters-warning')).toHaveCount(0);
  await expect(page.locator('#df-na-warning')).toHaveCount(0);
});
