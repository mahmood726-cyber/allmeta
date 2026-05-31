/**
 * R-parity for the CM.EL exact conditional rare-event GLMM (Fisher's noncentral
 * hypergeometric, Stijnen 2010) vs metafor::rma.glmm(measure="OR", model="CM.EL")
 * (which itself requires the BiasedUrn package). Ground truth:
 *
 *   DS_B (heterogeneous, τ²>0):
 *     ai =c(3,8,1,12,0,5,2,9)  n1i=c(120,200,90,300,60,150,110,250)
 *     ci =c(7,5,4,6,3,11,1,4)  n2i=c(118,205,92,295,62,148,108,255)
 *     → θ=-0.12551893  se=0.34391811  τ²=0.37342950
 *   DS_C (near-homogeneous, τ²≈0):
 *     ai =c(2,4,1,3,5,2,6,3)   n1i=c(150,180,160,200,220,140,210,170)
 *     ci =c(6,9,5,8,11,7,12,8) n2i=(=n1i)
 *     → θ=-0.95937220  se=0.23453577  τ²≈1.3e-5 (boundary)
 *
 * The engine conditions on each study's event margin (no nuisance baseline) and
 * integrates the random effect by ADAPTIVE Gauss-Hermite, reproducing metafor to
 * ~1e-7 on θ/τ² and ~1e-3 on SE. It is also more robust than metafor's CM.EL
 * optimiser, which fails to converge on the very sparse built-in example — so the
 * app keeps UM.FS as the default and offers CM.EL as the verified exact option.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rare-events-glmm/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>|ERR_CONNECTION_REFUSED/;

function rowsOf(d) { return d.ai.map((a, i) => ({ events_T: a, n_T: d.n1i[i], events_C: d.ci[i], n_C: d.n2i[i] })); }
const DS_B = { ai: [3,8,1,12,0,5,2,9], n1i: [120,200,90,300,60,150,110,250], ci: [7,5,4,6,3,11,1,4], n2i: [118,205,92,295,62,148,108,255] };
const DS_C = { ai: [2,4,1,3,5,2,6,3], n1i: [150,180,160,200,220,140,210,170], ci: [6,9,5,8,11,7,12,8], n2i: [150,180,160,200,220,140,210,170] };
const GT_B = { theta: -0.12551893, se: 0.34391811, tau2: 0.37342950 };
const GT_C = { theta: -0.95937220, se: 0.23453577, tau2: 0.00001308 };

for (const [name, ds, gt] of [['DS_B (τ²>0)', DS_B, GT_B], ['DS_C (τ²≈0)', DS_C, GT_C]]) {
  test(`rare-events CM.EL matches metafor::rma.glmm(CM.EL) — ${name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(URL, { waitUntil: 'load' });
    const r = await page.evaluate((rows) => window.AlmRareEventsGLMM.fitConditionalExact(rows), rowsOf(ds));
    console.log(`  ${name}: theta=${r.theta.toFixed(8)} se=${r.se_theta.toFixed(8)} tau2=${r.tau2.toFixed(8)}`);

    expect(r.ok).toBe(true);
    expect(r.theta).toBeCloseTo(gt.theta, 5);
    expect(r.tau2).toBeCloseTo(gt.tau2, 4);
    expect(r.se_theta).toBeCloseTo(gt.se, 3);   // numerical-Hessian SE within ~1e-3
    expect(errors, 'no console errors').toEqual([]);
  });
}

test('rare-events CM.EL is selectable and renders on the sparse default example', async ({ page }) => {
  // metafor's CM.EL optimiser fails on this dataset; ours must still return a
  // sensible estimate (close to UM.FS / CM.AL) and render without errors.
  await page.goto(URL, { waitUntil: 'load' });
  await page.selectOption('#f-model', 'CM.EL');
  await page.click('#btn-run');
  await page.waitForFunction(() => !!window.__almLastRareEventsGLMM && !!window.__almLastRareEventsGLMM().glmm.ok, { timeout: 8000 });
  const out = await page.evaluate(() => window.__almLastRareEventsGLMM().glmm);
  expect(out.model).toBe('CM.EL');
  expect(out.OR).toBeGreaterThan(0.15);
  expect(out.OR).toBeLessThan(0.55);   // ~0.29 on the example, near UM.FS
});
