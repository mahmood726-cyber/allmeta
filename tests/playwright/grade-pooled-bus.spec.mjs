/**
 * Moat #8 end-to-end: the pooled-result bus (ma-pooled-v1) carries a finished
 * pooled effect from a producing tool (Forest Plot) to GRADE SoF, so the user
 * neither re-types nor re-pools. The consumer must show the SAME numbers the
 * producer displayed (point + 95% CI, back-transformed for ratio measures).
 */
import { test, expect } from '@playwright/test';
const BASE = 'http://127.0.0.1:8080';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('ma-pooled bus: Forest Plot → GRADE SoF carries the pooled effect verbatim', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  // --- Producer: Forest Plot computes a random-effects pool on the ratio scale.
  await page.goto(BASE + '/forest-plot/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastRE === 'function' && window.MaPooled, { timeout: 10000 });

  const produced = await page.evaluate(() => {
    window.MaPooled.clear();
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // log-scale effects (e.g. logOR), ratio axis → exp() on output.
    set('f-data', 'Alpha, -0.16, 0.10\nBeta, -0.22, 0.12\nGamma, -0.10, 0.15');
    set('f-title', 'All-cause mortality');
    set('f-scale', 'exp');
    document.getElementById('btn-push-grade').click();
    const re = window._almLastRE();
    const env = JSON.parse(localStorage.getItem('ma-pooled-v1') || 'null');
    return {
      re: re && { mu: re.mu, lo: re.lo, hi: re.hi, k: re.k },
      stored: env && env.result,
    };
  });

  expect(produced.re, 'forest plot produced a random-effects pool').toBeTruthy();
  expect(produced.stored, 'a pooled result was written to the bus').toBeTruthy();
  // The bus carries the natural-scale (exp) point + CI exactly matching the diamond.
  expect(produced.stored.scale).toBe('ratio');
  expect(produced.stored.k).toBe(3);
  expect(produced.stored.model).toBe('random');
  expect(produced.stored.label).toBe('All-cause mortality');
  expect(produced.stored.pointEstimate).toBeCloseTo(Math.exp(produced.re.mu), 6);
  expect(produced.stored.ciLo).toBeCloseTo(Math.exp(produced.re.lo), 6);
  expect(produced.stored.ciHi).toBeCloseTo(Math.exp(produced.re.hi), 6);
  // Sanity: a valid CI bracketing the point on the natural scale.
  expect(produced.stored.ciLo).toBeLessThan(produced.stored.pointEstimate);
  expect(produced.stored.pointEstimate).toBeLessThan(produced.stored.ciHi);

  // --- Consumer: GRADE SoF (same origin → same localStorage) loads it.
  await page.goto(BASE + '/grade-sof/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaPooled && document.getElementById('btn-load-pooled'), { timeout: 10000 });

  const loaded = await page.evaluate(() => {
    document.getElementById('btn-load-pooled').click();
    // Form rows (with data-field inputs) live in #outcomes-wrap; the preview
    // table also uses class .outcome-row, so scope to the form container.
    const rows = document.querySelectorAll('#outcomes-wrap .outcome-row');
    const last = rows[rows.length - 1];
    const f = name => {
      const el = last.querySelector('[data-field="' + name + '"]');
      return el ? el.value : null;
    };
    return {
      outcome: f('outcome'), effectType: f('effectType'),
      effect: f('effect'), ciLo: f('ciLo'), ciHi: f('ciHi'), studies: f('studies'),
    };
  });

  // grade-sof formats to 4 significant figures; compare numerically.
  expect(loaded.outcome).toBe('All-cause mortality');
  expect(loaded.effectType, 'ratio + no explicit measure → defaults to RR').toBe('RR');
  expect(loaded.studies).toBe('3');
  expect(parseFloat(loaded.effect)).toBeCloseTo(produced.stored.pointEstimate, 3);
  expect(parseFloat(loaded.ciLo)).toBeCloseTo(produced.stored.ciLo, 3);
  expect(parseFloat(loaded.ciHi)).toBeCloseTo(produced.stored.ciHi, 3);

  expect(errors, 'no console errors across producer + consumer').toEqual([]);
});
