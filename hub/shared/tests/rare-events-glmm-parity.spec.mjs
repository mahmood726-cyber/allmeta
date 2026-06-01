/**
 * R-parity for the rare-events binomial-normal GLMM (UM.FS, unconditional full
 * likelihood). Ground truth from metafor on the app's built-in example:
 *
 *   rma.glmm(measure="OR", ai=c(0,2,0,1,3,0,2,1), n1i=c(250,500,180,320,600,95,450,210),
 *                          ci=c(1,5,3,4,7,2,6,3),  n2i=c(248,510,182,325,605,98,445,215),
 *            model="UM.FS")
 *   → θ=-1.23601476  se=0.37973372  OR=0.29053979  CI=[0.1380307, 0.61155503]  τ²=0
 *
 * Also guards the 2026-05-29 fix that made UM.FS the DEFAULT model: the previous
 * default (CM.AL) is a profiled approximation whose likelihood peaks too sharply
 * in θ, giving an anticonservative CI (~12% too narrow) that does NOT reproduce
 * metafor's conditional non-central-hypergeometric CI. So the default run must now
 * return the UM.FS OR (~0.2905), not the CM.AL OR.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rare-events-glmm/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const ROWS = [
  { events_T: 0, n_T: 250, events_C: 1, n_C: 248 },
  { events_T: 2, n_T: 500, events_C: 5, n_C: 510 },
  { events_T: 0, n_T: 180, events_C: 3, n_C: 182 },
  { events_T: 1, n_T: 320, events_C: 4, n_C: 325 },
  { events_T: 3, n_T: 600, events_C: 7, n_C: 605 },
  { events_T: 0, n_T: 95, events_C: 2, n_C: 98 },
  { events_T: 2, n_T: 450, events_C: 6, n_C: 445 },
  { events_T: 1, n_T: 210, events_C: 3, n_C: 215 },
];
const META = { theta: -1.23601476, se: 0.37973372, OR: 0.29053979, OR_lo: 0.1380307, OR_hi: 0.61155503 };

test('rare-events GLMM UM.FS matches metafor::rma.glmm(model="UM.FS")', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((rows) => window.AlmRareEventsGLMM.fitUnconditional(rows), ROWS);
  console.log('  UM.FS engine:', JSON.stringify({ theta: r.theta, se: r.se_theta, OR: r.OR, OR_lo: r.OR_lo, OR_hi: r.OR_hi, tau2: r.tau2 }));

  expect(r.theta).toBeCloseTo(META.theta, 4);
  expect(r.se_theta).toBeCloseTo(META.se, 4);
  expect(r.OR).toBeCloseTo(META.OR, 4);
  expect(r.OR_lo).toBeCloseTo(META.OR_lo, 4);
  expect(r.OR_hi).toBeCloseTo(META.OR_hi, 4);
  expect(r.tau2).toBeLessThan(1e-4); // τ²=0 at the optimum
  expect(errors, 'no console errors').toEqual([]);
});

test('rare-events GLMM default model is UM.FS (not the anticonservative CM.AL)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const sel = await page.inputValue('#f-model');
  expect(sel, 'default selected model').toBe('UM.FS');

  await page.click('#btn-run');
  await page.waitForFunction(() => !!window.__almLastRareEventsGLMM && !!window.__almLastRareEventsGLMM().glmm.ok, { timeout: 8000 });
  const out = await page.evaluate(() => window.__almLastRareEventsGLMM().glmm);
  // Default run must produce the verified UM.FS OR (~0.2905), with the wider UM.FS CI.
  expect(out.OR).toBeCloseTo(META.OR, 3);
  expect(out.OR_hi).toBeCloseTo(META.OR_hi, 3);
});

test('rare-events GLMM CM.AL lands in the documented anticonservative band', async ({ page }) => {
  // Locks the disclosed CM.AL behaviour (audit coverage gap): same point estimate as
  // UM.FS but a strictly NARROWER CI (its profiled likelihood peaks too sharply in θ
  // and does not reproduce metafor's conditional CI). Guards against silent drift.
  await page.goto(URL, { waitUntil: 'load' });
  await page.selectOption('#f-model', 'CM.AL');
  await page.click('#btn-run');
  await page.waitForFunction(() => !!window.__almLastRareEventsGLMM && !!window.__almLastRareEventsGLMM().glmm.ok, { timeout: 8000 });
  const out = await page.evaluate(() => window.__almLastRareEventsGLMM().glmm);
  // Point estimate ~ UM.FS (the two fits nearly coincide in θ).
  expect(out.OR).toBeCloseTo(META.OR, 2);
  // CI strictly inside the verified UM.FS CI [0.138, 0.612] — i.e. anticonservative.
  expect(out.OR_lo).toBeGreaterThan(META.OR_lo);
  expect(out.OR_hi).toBeLessThan(META.OR_hi);
  expect(out.OR_hi - out.OR_lo, 'CM.AL CI narrower than UM.FS').toBeLessThan(META.OR_hi - META.OR_lo);
});

// CM.EL (conditional EXACT — Fisher's noncentral hypergeometric) vs
// metafor::rma.glmm(measure="OR", model="CM.EL"). metafor's own CM.EL optimiser
// fails to converge on the very sparse 8-study set above, so this locks it on a
// moderate-count, genuinely-heterogeneous dataset where metafor converges:
//   θ=-0.35503800 se=0.15242661 OR=0.70114680 τ²=0.03201682.
const CMEL_ROWS = [
  { events_T: 12, n_T: 120, events_C: 20, n_C: 118 }, { events_T: 8, n_T: 100, events_C: 15, n_C: 102 },
  { events_T: 25, n_T: 200, events_C: 22, n_C: 198 }, { events_T: 5, n_T: 80, events_C: 12, n_C: 82 },
  { events_T: 18, n_T: 150, events_C: 28, n_C: 148 }, { events_T: 30, n_T: 250, events_C: 26, n_C: 248 },
  { events_T: 9, n_T: 90, events_C: 18, n_C: 92 }, { events_T: 14, n_T: 140, events_C: 20, n_C: 138 },
];
test('rare-events GLMM CM.EL (exact) matches metafor::rma.glmm(model="CM.EL")', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmRareEventsGLMM, { timeout: 10000 });
  const r = await page.evaluate((rows) => window.AlmRareEventsGLMM.fitConditionalExact(rows), CMEL_ROWS);
  expect(r.theta).toBeCloseTo(-0.35503800, 4);
  expect(r.OR).toBeCloseTo(0.70114680, 4);
  expect(r.tau2).toBeCloseTo(0.03201682, 4);
  expect((r.se_theta != null ? r.se_theta : r.se)).toBeCloseTo(0.15242661, 4);
});
