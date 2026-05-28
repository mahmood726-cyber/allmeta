/**
 * Regression for the Mantel-Haenszel risk-difference variance bug: mhRD's
 * per-study variance term carried spurious *n2 / *n1 factors, inflating SE by
 * ~n (≈21× on this fixture) and blowing the CI far too wide. var(RD_i) is
 * a·b/n1³ + c·d/n2³; the MH pooled RD is a w-weighted mean so
 * var = Σ wᵢ²·var(RD_i) / (Σwᵢ)². Verified against metafor::rma.mh(measure="RD").
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/mh-peto/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

// metafor 4.x rma.mh(measure="RD") on mhpeto-tiny.csv:
const M = { beta: -0.0124324324, lb: -0.0193289491, ub: -0.0055359158 };
const FIXTURE = [
  { study: 'StudyA', e1: 3, n1: 500, e2: 8, n2: 500 },
  { study: 'StudyB', e1: 1, n1: 200, e2: 5, n2: 200 },
  { study: 'StudyC', e1: 0, n1: 150, e2: 4, n2: 150 },
  { study: 'StudyD', e1: 2, n1: 400, e2: 6, n2: 400 },
  { study: 'StudyE', e1: 4, n1: 600, e2: 10, n2: 600 },
];

test('mh-peto: MH risk-difference CI matches metafor rma.mh(measure="RD")', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almLoad === 'function' && typeof window._almLastMhPeto === 'function', { timeout: 10000 });

  const r = await page.evaluate((fixture) => {
    const sel = document.getElementById('measure');
    sel.value = 'RD';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.__almLoad(fixture);
    return window._almLastMhPeto();
  }, FIXTURE);

  expect(r.measure).toBe('RD');
  // Point estimate is exact; CI bounds match to 1e-4 (MH RD variance estimators
  // have minor small-sample variants; the bug produced lb ≈ -0.16, caught here).
  expect(r.mh_est).toBeCloseTo(M.beta, 6);
  expect(Math.abs(r.mh_lo - M.lb), `RD lb ${r.mh_lo} vs metafor ${M.lb}`).toBeLessThan(1e-4);
  expect(Math.abs(r.mh_hi - M.ub), `RD ub ${r.mh_hi} vs metafor ${M.ub}`).toBeLessThan(1e-4);

  expect(errors, 'no console errors').toEqual([]);
});
