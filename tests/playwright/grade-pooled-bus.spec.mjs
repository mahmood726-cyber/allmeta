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
      stored: env && env.results && env.results[0],
      nQueued: env && env.results ? env.results.length : 0,
    };
  });

  expect(produced.re, 'forest plot produced a random-effects pool').toBeTruthy();
  expect(produced.stored, 'a pooled result was written to the bus').toBeTruthy();
  expect(produced.nQueued, 'one outcome queued').toBe(1);
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

test('ma-pooled bus: Workbench (linear scale) → GRADE SoF carries the input-scale estimate', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(BASE + '/workbench/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almWorkbench === 'function' && window.MaPooled, { timeout: 10000 });

  const produced = await page.evaluate(() => {
    window.MaPooled.clear();
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('f-data', 'S1, -2.5, 0.6\nS2, -1.8, 0.5\nS3, -3.0, 0.7'); // linear (MD) effects
    set('f-title', 'Change in 6-min walk (m)');
    document.getElementById('btn-push-grade').click();
    const env = JSON.parse(localStorage.getItem('ma-pooled-v1') || 'null');
    return env && env.results && env.results[0];
  });

  expect(produced, 'workbench wrote a pooled result').toBeTruthy();
  expect(produced.scale).toBe('linear');
  expect(produced.model).toBe('random');
  expect(produced.k).toBe(3);
  expect(produced.label).toBe('Change in 6-min walk (m)');
  expect(produced.ciLo).toBeLessThan(produced.pointEstimate);
  expect(produced.pointEstimate).toBeLessThan(produced.ciHi);

  await page.goto(BASE + '/grade-sof/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaPooled && document.getElementById('btn-load-pooled'), { timeout: 10000 });

  const loaded = await page.evaluate(() => {
    document.getElementById('btn-load-pooled').click();
    const rows = document.querySelectorAll('#outcomes-wrap .outcome-row');
    const last = rows[rows.length - 1];
    const f = name => { const el = last.querySelector('[data-field="' + name + '"]'); return el ? el.value : null; };
    return { outcome: f('outcome'), effectType: f('effectType'), effect: f('effect'), ciLo: f('ciLo'), ciHi: f('ciHi'), studies: f('studies') };
  });

  expect(loaded.outcome).toBe('Change in 6-min walk (m)');
  expect(loaded.effectType, 'linear scale + no measure → defaults to MD').toBe('MD');
  expect(loaded.studies).toBe('3');
  expect(parseFloat(loaded.effect)).toBeCloseTo(produced.pointEstimate, 3);
  expect(parseFloat(loaded.ciLo)).toBeCloseTo(produced.ciLo, 3);
  expect(parseFloat(loaded.ciHi)).toBeCloseTo(produced.ciHi, 3);

  expect(errors, 'no console errors').toEqual([]);
});

test('ma-pooled bus: multiple pushes queue, re-push by label replaces, GRADE loads all at once', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(BASE + '/forest-plot/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaPooled && document.getElementById('btn-push-grade'), { timeout: 10000 });

  const queued = await page.evaluate(() => {
    window.MaPooled.clear();
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('f-scale', 'exp');
    const push = (title, data) => { set('f-title', title); set('f-data', data); document.getElementById('btn-push-grade').click(); };
    push('Mortality', 'A, -0.16, 0.10\nB, -0.22, 0.12');
    push('Hospitalisation', 'A, -0.34, 0.11\nB, -0.30, 0.13');
    push('Mortality', 'A, -0.16, 0.10\nB, -0.22, 0.12\nC, -0.10, 0.15'); // same label → REPLACE, not duplicate
    const list = window.MaPooled.read();
    return { n: list.length, labels: list.map(r => r.label), mortalityK: (list.find(r => r.label === 'Mortality') || {}).k };
  });

  expect(queued.n, 'two distinct outcomes after a same-label re-push').toBe(2);
  expect(queued.labels.sort()).toEqual(['Hospitalisation', 'Mortality']);
  expect(queued.mortalityK, 'the re-pushed Mortality (3 studies) replaced the 2-study one').toBe(3);

  await page.goto(BASE + '/grade-sof/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaPooled && document.getElementById('btn-load-pooled'), { timeout: 10000 });

  const loaded = await page.evaluate(() => {
    document.getElementById('btn-load-pooled').click();
    const rows = [...document.querySelectorAll('#outcomes-wrap .outcome-row')];
    return rows.map(r => {
      const f = n => { const el = r.querySelector('[data-field="' + n + '"]'); return el ? el.value : null; };
      return { outcome: f('outcome'), effectType: f('effectType'), studies: f('studies') };
    }).filter(r => r.outcome === 'Mortality' || r.outcome === 'Hospitalisation');
  });

  expect(loaded.length, 'both queued outcomes became GRADE rows').toBe(2);
  expect(loaded.map(r => r.outcome).sort()).toEqual(['Hospitalisation', 'Mortality']);
  expect(loaded.every(r => r.effectType === 'RR')).toBe(true);
  expect(loaded.find(r => r.outcome === 'Mortality').studies).toBe('3');

  expect(errors, 'no console errors').toEqual([]);
});

test('ma-pooled bus: Heterogeneity (export-scale=ratio) → GRADE carries the HKSJ pooled effect', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(BASE + '/heterogeneity/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastFE === 'function' && window.MaPooled && document.getElementById('btn-push-grade'), { timeout: 10000 });

  const produced = await page.evaluate(() => {
    window.MaPooled.clear();
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('f-data', 'A, -0.16, 0.10\nB, -0.22, 0.12\nC, -0.10, 0.15'); // logOR
    set('f-grade-scale', 'ratio');
    set('f-grade-outcome', 'All-cause mortality');
    document.getElementById('btn-push-grade').click();
    const sum = window._almLastFE().sum;
    const env = JSON.parse(localStorage.getItem('ma-pooled-v1') || 'null');
    return { sum: sum && { mu: sum.mu, lo: sum.ciLoHKSJ, hi: sum.ciHiHKSJ, k: sum.k }, stored: env && env.results && env.results[0] };
  });

  expect(produced.sum, 'heterogeneity computed an HKSJ pool').toBeTruthy();
  expect(produced.stored).toBeTruthy();
  expect(produced.stored.scale).toBe('ratio');
  expect(produced.stored.label).toBe('All-cause mortality');
  expect(produced.stored.model).toBe('random');
  // Carries the HKSJ CI, exp-back-transformed (not the Wald CI).
  expect(produced.stored.pointEstimate).toBeCloseTo(Math.exp(produced.sum.mu), 6);
  expect(produced.stored.ciLo).toBeCloseTo(Math.exp(produced.sum.lo), 6);
  expect(produced.stored.ciHi).toBeCloseTo(Math.exp(produced.sum.hi), 6);

  await page.goto(BASE + '/grade-sof/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaPooled && document.getElementById('btn-load-pooled'), { timeout: 10000 });
  const loaded = await page.evaluate(() => {
    document.getElementById('btn-load-pooled').click();
    const rows = document.querySelectorAll('#outcomes-wrap .outcome-row');
    const last = rows[rows.length - 1];
    const f = n => { const el = last.querySelector('[data-field="' + n + '"]'); return el ? el.value : null; };
    return { outcome: f('outcome'), effectType: f('effectType'), effect: f('effect'), ciLo: f('ciLo'), ciHi: f('ciHi'), studies: f('studies') };
  });

  expect(loaded.outcome).toBe('All-cause mortality');
  expect(loaded.effectType).toBe('RR');
  expect(loaded.studies).toBe('3');
  expect(parseFloat(loaded.effect)).toBeCloseTo(produced.stored.pointEstimate, 3);
  expect(parseFloat(loaded.ciLo)).toBeCloseTo(produced.stored.ciLo, 3);
  expect(parseFloat(loaded.ciHi)).toBeCloseTo(produced.stored.ciHi, 3);

  expect(errors, 'no console errors').toEqual([]);
});
