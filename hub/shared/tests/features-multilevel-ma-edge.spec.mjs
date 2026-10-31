import { test, expect } from '@playwright/test';

// Degenerate but legal inputs. Reference: R 4.6.0, metafor 5.2.1 rma.mv(yi, vi, random = ~ 1 | study/effect, method = "REML").
const APP = 'multilevel-ma';
async function fit(page, src) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(() => typeof window.__almMlmaRun === 'function' && !!window.__almReml());
  await page.locator('#src').fill(src);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  return page.evaluate(() => window.__almReml());
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);

test('EDGE fewer than 3 effect sizes: the previous results are cleared and the reason is shown', async ({ page }) => {
  const reml = await fit(page, '1, 0.31, 0.12, A\n2, 0.15, 0.09, A');
  expect(reml).toBeNull();
  await expect(page.locator('#mlma-refusal')).toContainText('At least 3 valid effect sizes');
  await expect(page.locator('#summary')).not.toContainText('Pooled estimate');
  await expect(page.locator('#body tr')).toHaveCount(0);
});

test('EDGE all effects from one study: refused (between-study variance not identifiable)', async ({ page }) => {
  const reml = await fit(page, '1, 0.31, 0.12, A\n1, 0.27, 0.10, B\n1, 0.45, 0.11, C');
  expect(reml).toBeNull();
  await expect(page.locator('#mlma-refusal')).toContainText('All effect sizes come from one study');
  await expect(page.locator('#summary')).not.toContainText('t0');
});

test('EDGE one effect per study: pooled REML matches metafor and the variance split is flagged as not identifiable', async ({ page }) => {
  const r = await fit(page, '1, 0.31, 0.12, A\n2, 0.05, 0.09, A\n3, 0.52, 0.16, A');
  close(r.mu, 0.269472933445421, 1e-6); close(r.se, 0.13549899423597, 1e-6);
  close(r.sigma2Between + r.sigma2Within, 0.019975074853361 + 0.019975075307824, 1e-6);
  await expect(page.locator('#mlma-singletons')).toContainText('not separately identifiable');
});

test('EDGE two studies and a heterogeneous set match metafor; no singleton note when a study has two effects', async ({ page }) => {
  let r = await fit(page, '1, 0.31, 0.12, A\n1, 0.27, 0.10, B\n2, 0.15, 0.09, A\n2, 0.21, 0.11, B');
  close(r.mu, 0.225554395024571, 1e-6); close(r.se, 0.0559724575003233, 1e-6); close(r.logLik, 3.30833656063445, 1e-6);
  await expect(page.locator('#mlma-singletons')).toHaveCount(0);
  r = await fit(page, '1, 0.61, 0.12, A\n1, 0.57, 0.10, B\n2, 0.05, 0.09, A\n2, 0.01, 0.11, B\n3, 0.52, 0.16, A\n4, -0.18, 0.07, A\n5, 0.29, 0.12, A');
  close(r.mu, 0.239196389478329, 1e-6); close(r.sigma2Between, 0.0988754009548927, 1e-6);
});
