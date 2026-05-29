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
