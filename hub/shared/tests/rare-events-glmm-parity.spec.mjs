/**
 * R-parity for the rare-events binomial-normal GLMMs on the app's built-in example, against
 * metafor::rma.glmm(measure="OR", model=M) on R 4.6.0 / metafor 5.2-1 / lme4 2.0-6 (tight convergence controls):
 *
 *   ai=c(0,2,0,1,3,0,2,1), n1i=c(250,500,180,320,600,95,450,210), ci=c(1,5,3,4,7,2,6,3), n2i=c(248,510,182,325,605,98,445,215)
 *   UM.FS  theta=-1.2360147564  se=0.3797337239  tau2=0
 *   UM.RS  theta=-1.2363774940  se=0.3796570074  tau2=0  sigma2=0
 *   CM.AL  theta=-1.2270275015  se=0.3786465139  tau2=0
 *
 * The corpus-wide comparison (52 inputs x 4 models) is in the paper-30 validation archive
 * (rare-events-glmm-reproducible).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rare-events-glmm/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const META = {
  'UM.FS': { theta: -1.2360147564, se: 0.3797337239 },
  'UM.RS': { theta: -1.2363774940, se: 0.3796570074 },
  'CM.AL': { theta: -1.2270275015, se: 0.3786465139 },
};

for (const [model, gt] of Object.entries(META)) {
  test(`rare-events GLMM ${model} matches metafor::rma.glmm(model="${model}") on the built-in example`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));
    await page.goto(URL, { waitUntil: 'load' });
    await page.selectOption('#f-model', model);
    await page.click('#btn-run');
    await page.waitForFunction(() => !!window.__almLastRareEventsGLMM && !!window.__almLastRareEventsGLMM().glmm.ok, { timeout: 8000 });
    const out = await page.evaluate(() => window.__almLastRareEventsGLMM().glmm);
    expect(out.model).toBe(model);
    expect(out.theta).toBeCloseTo(gt.theta, 6);
    expect(out.se_theta).toBeCloseTo(gt.se, 5);
    expect(out.tau2).toBeLessThan(1e-8);
    expect(out.k).toBe(8);
    expect(errors, 'no console errors').toEqual([]);
  });
}

test('rare-events GLMM default model is UM.FS', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  expect(await page.inputValue('#f-model')).toBe('UM.FS');
});

test('UM.RS also shows the equivalent metafor R script', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.selectOption('#f-model', 'UM.RS');
  await page.click('#btn-run');
  await page.waitForFunction(() => window.__almLastRareEventsGLMM && window.__almLastRareEventsGLMM().rcode, { timeout: 8000 });
  const out = await page.evaluate(() => window.__almLastRareEventsGLMM());
  expect(out.model).toBe('UM.RS');
  expect(out.glmm.ok).toBe(true);
  expect(out.rcode).toMatch(/rma\.glmm\(measure="OR", ai=ai, bi=bi, ci=ci, di=di, model="UM\.RS"\)/);
  expect(out.rcode).toMatch(/ai <- c\(0, 2, 0, 1, 3, 0, 2, 1\)/);
  expect(await page.locator('#umrs-code').count()).toBe(1);
  expect(await page.locator('#umrs-dl').count()).toBe(1);
});

test('complete separation is refused, not shown as a fit', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.fill('#src', 'A, 0, 200, 5, 200\nB, 0, 150, 3, 148\nC, 0, 300, 8, 305');
  await page.click('#btn-run');
  await page.waitForFunction(() => !!window.__almLastRareEventsGLMM, { timeout: 8000 });
  const out = await page.evaluate(() => window.__almLastRareEventsGLMM().glmm);
  expect(out.ok).toBe(false);
  expect(out.error).toMatch(/separation/);
});
