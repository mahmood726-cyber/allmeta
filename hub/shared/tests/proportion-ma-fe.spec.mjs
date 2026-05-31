/**
 * Regression for the 2026-05-31 fix: the "Fixed-effect only" option was silently
 * remapped to DerSimonian-Laird (`effTau = tauEst==='FE' ? 'DL' : tauEst`), so under
 * heterogeneity (Q>df) it returned the RANDOM-effects result mislabelled as FE. The
 * homogeneous default fixture (tau2=0) masked it.
 *
 * On a heterogeneous set (logit transform, no extreme cells) the true fixed-effect
 * logit pool is mu=-1.776394, se=0.123427 (tau2=0) — distinct from the DL random-
 * effects pool (tau2>0, se>0.28). FE must now be the fixed-effect pool.
 */
import { test, expect } from '@playwright/test';

test('proportion-ma FE option is the fixed-effect pool (tau2=0), not DL', async ({ page }) => {
  await page.goto('http://localhost:8088/proportion-ma/index.html', { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const run = (est) => {
      document.getElementById('src').value = '12,150\n8,40\n30,200\n3,100\n25,120';
      document.getElementById('trans').value = 'logit';
      const sel = document.getElementById('tau-est'); sel.value = est;
      document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('btn-run')?.click();
      return window._almLastPropMA();
    };
    const fe = run('FE'); const dl = run('DL');
    return { fe: { mu: fe.mu_re, se: fe.seRE, tau2: fe.tau2, est: fe.tauEstimator }, dl: { mu: dl.mu_re, se: dl.seRE, tau2: dl.tau2 } };
  });
  console.log('FE', JSON.stringify(r.fe), 'DL', JSON.stringify(r.dl));

  expect(r.fe.est).toBe('FE');
  expect(r.fe.tau2).toBeCloseTo(0, 8);            // fixed effect => no between-study variance
  expect(r.fe.mu).toBeCloseTo(-1.776394, 4);      // true FE logit pool
  expect(r.fe.se).toBeCloseTo(0.123427, 4);
  // DL must genuinely differ (it estimates tau2>0 here) — guards against the old FE->DL remap.
  expect(r.dl.tau2).toBeGreaterThan(0.1);
  expect(r.dl.se).toBeGreaterThan(r.fe.se + 0.1);
});
