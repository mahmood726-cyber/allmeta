/**
 * Behaviour of the dose-response page: every model/approach/method combination renders,
 * a two-stage fit dosresmeta would refuse is refused with a message naming the studies,
 * a non-zero reference dose is handled, PM/DL are offered only where they apply, and
 * meta-regression and custom knots run. Numbers are checked against the engine (whose
 * dosresmeta parity is tested in dose-response-dosresmeta-parity.spec.mjs).
 */
import { test, expect } from '@playwright/test';
const APP = 'http://localhost:8088/dose-response-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

async function setv(page, o) {
  for (const [id, v] of Object.entries(o)) {
    await page.evaluate(([id, v]) => { const e = document.getElementById(id); if (e.type === 'checkbox') e.checked = v; else e.value = v;
      e.dispatchEvent(new Event(e.tagName === 'SELECT' || e.type === 'checkbox' ? 'change' : 'input')); }, [id, v]);
  }
}

test('all curve × approach × method combinations render without console errors', async ({ page }) => {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  for (const shape of ['linear', 'quadratic', 'spline3', 'spline4', 'spline5']) {
    for (const proc of ['2stage', '1stage']) {
      for (const method of ['REML', 'ML', 'MM', 'FE']) {
        await setv(page, { 'f-shape': shape, 'f-proc': proc, 'f-method': method });
        const out = await page.evaluate(() => ({ last: window._almLastDoseResponse(), msg: document.getElementById('msgs').innerText, svg: document.querySelectorAll('#curve-host svg').length }));
        const refused = proc === '2stage' && shape === 'spline5'; // alcohol_cvd: studies 2-6 have 3 non-reference doses
        if (refused) { expect(out.last).toBeNull(); expect(out.msg).toMatch(/at least 4 non-reference dose levels.*one-stage/); continue; }
        expect(out.last, `${shape}/${proc}/${method}`).not.toBeNull();
        expect(out.svg).toBe(1);
        expect(out.last.approach).toBe(proc);
        expect(out.last.method).toBe(proc === '1stage' && method === 'MM' ? 'REML' : method); // MM is two-stage only
        expect(out.last.predictions.length).toBeGreaterThan(0);
      }
    }
  }
  expect(errs).toEqual([]);
});

test('headline and recorded result match the engine; non-zero reference doses are centred', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  // shift every dose by +5 so all reference doses are 5: the slope must not change
  const data = await page.evaluate(() => document.getElementById('f-data').value);
  const shifted = data.split('\n').map((l) => { if (l.startsWith('#')) return l; const p = l.split(', '); p[1] = String(+p[1] + 5); return p.join(', '); }).join('\n');
  const a = await page.evaluate(() => window._almLastDoseResponse().slope);
  await setv(page, { 'f-data': shifted });
  const b = await page.evaluate(() => window._almLastDoseResponse().slope);
  expect(Math.abs(a - b)).toBeLessThan(1e-12);
  const head = await page.locator('#headline').textContent();
  expect(head).toMatch(/Pooled slope/);
});

test('PM and DL are offered only for the linear two-stage Greenland–Longnecker model', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  const dis = async () => page.evaluate(() => ['PM', 'DL', 'MM'].map((v) => document.querySelector(`#f-method option[value=${v}]`).disabled));
  expect(await dis()).toEqual([false, false, false]);
  await setv(page, { 'f-method': 'PM' });
  expect((await page.evaluate(() => window._almLastDoseResponse())).method).toBe('PM');
  await setv(page, { 'f-shape': 'spline3' });
  expect(await dis()).toEqual([true, true, false]);
  expect(await page.evaluate(() => document.getElementById('f-method').value)).toBe('REML');
  await setv(page, { 'f-proc': '1stage' });
  expect(await dis()).toEqual([true, true, true]);
});

test('custom knots, reference dose, prediction doses and meta-regression', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await setv(page, { 'f-shape': 'splinec', 'f-knots': '0, 10, 30, 60' });
  let r = await page.evaluate(() => window._almLastDoseResponse());
  expect(r.knots).toEqual([0, 10, 30, 60]);
  await setv(page, { 'f-shape': 'spline3', 'f-xref': '10', 'f-pdoses': '0, 20, 40' });
  r = await page.evaluate(() => window._almLastDoseResponse());
  expect(r.referenceDose).toBe(10);
  expect(r.predictions.map((p) => p.dose)).toEqual([0, 20, 40]);
  // covariate = study number (illustrative); meta-regression doubles the coefficients
  const data = await page.evaluate(() => document.getElementById('f-data').value);
  await setv(page, { 'f-shape': 'linear', 'f-xref': '', 'f-pdoses': '', 'f-data': data.split('\n').map((l) => l.startsWith('#') ? l : l + ', ' + l.split(',')[0]).join('\n'), 'f-mod': true, 'f-modval': '3' });
  r = await page.evaluate(() => window._almLastDoseResponse());
  expect(r.metaRegression).toBe(true);
  expect(r.beta).toHaveLength(2);
  expect(r.covariateValue).toBe(3);
});
