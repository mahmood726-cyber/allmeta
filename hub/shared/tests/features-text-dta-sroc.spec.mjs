import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function open(page, tab = 'text') {
  await page.goto('/dta-sroc/index.html');
  await page.waitForFunction(() => window.AlmFeatures?.get('dta-sroc') && window.__almBivariate());
  await page.evaluate(tab => AlmFeatures.open('dta-sroc', tab), tab);
}

// Explicit synthetic source confirmations for API tests, not evidence of a UI
// confirmation workflow. The separate UI test below must refuse bare rows.
async function records(page) {
  return page.evaluate(() => __almResults().rows.map(r => {
    const row = { study: r.study, tp: r.TP, fp: r.FP, fn: r.FN, tn: r.TN };
    const source = [r.study, r.TP, r.FP, r.FN, r.TN].join('\t');
    let start = r.study.length + 1;
    row.provenance = { label: r.study, reference: 'Synthetic regression fixture', location: 'Fixture table',
      pastedText: source, confirmed: true, values: ['tp', 'fp', 'fn', 'tn'].map(field => {
        const text = String(row[field]), span = [start, start + text.length];
        start += text.length + 1;
        return { field, value: row[field], text, span };
      }) };
    return row;
  }));
}

test('REVIEW P1: unconfirmed entry is disabled and direct bypass is refused atomically', async ({ page }) => {
  await open(page, 'entry');
  const rows = await records(page);
  const before = await page.evaluate(() => AlmFeatures.get('dta-sroc').share.get());
  await page.locator('#alm-f-panel-entry textarea').fill('Study\tTP\tFP\tFN\tTN\n' +
    rows.map(r => [r.study, r.tp, r.fp, r.fn, r.tn].join('\t')).join('\n'));
  await page.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  const refused = await page.evaluate(rows => {
    const failures = [];
    for (const edit of [r => { delete r.provenance; }, r => { r.provenance.confirmed = false; },
      r => { r.provenance.reference = ''; }, r => { r.provenance.location = ''; },
      r => { r.provenance.label = 'Another study'; }, r => { r.provenance.values[0].value++; },
      r => { r.provenance.values[0].span = [0, 1]; }]) {
      const bad = structuredClone(rows); edit(bad[bad.length - 1]);
      try { AlmFeatures.get('dta-sroc').entry.apply(bad); failures.push(false); }
      catch { failures.push(true); }
    }
    return failures;
  }, rows);
  expect(refused).toEqual(Array(7).fill(true));
  expect(await page.evaluate(() => AlmFeatures.get('dta-sroc').share.get())).toEqual(before);
});

test('REVIEW P2: boundary correlation warns at displayed precision, including degenerate HSROC variance', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const s = AlmFeatures.get('dta-sroc').text, r = s.results();
    const flags = value => AlmText.render(s.templates, value, {}).flags.map(f => f.text).join(' ');
    return { actual: flags(r), negative: flags({ ...r, rho: -0.9996 }), positive: flags({ ...r, rho: 0.9996 }),
      interior: flags({ ...r, rho: 0.5, sigma2theta: 0.1, sigma2alpha: 0.1 }),
      degenerate: flags({ ...r, rho: 0.5, sigma2theta: 0.000001, sigma2alpha: 0.1 }) };
  });
  for (const key of ['actual', 'negative', 'positive', 'degenerate']) {
    expect(out[key]).toContain('covariance may be poorly identified');
    expect(out[key]).toContain('prediction region with caution');
  }
  expect(out.interior).not.toContain('covariance may be poorly identified');
});

test('REVIEW P2: DOM audit excludes display-sourced results and still catches a planted fitted-value mismatch', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const s = AlmFeatures.get('dta-sroc').text, r = s.results(), dom = s.dom();
    const rendered = AlmText.render(s.templates, r, {});
    const clean = AlmText.audit(rendered, r, { dom });
    const planted = AlmText.audit(rendered, { ...r, sens: r.sens + 0.01 }, { dom });
    return { keys: Object.keys(dom), clean, planted, r };
  });
  for (const key of ['mosesAlpha', 'mosesBeta', 'thresholdRho', 'pretest', 'postPos', 'postNeg']) {
    expect(out.keys).not.toContain(key);
    expect(Number.isFinite(out.r[key])).toBe(true);
  }
  expect(out.clean.ok).toBe(true);
  expect(out.clean.domChecked).toBe(27);
  expect(out.planted.ok).toBe(false);
  expect(out.planted.failures.map(f => f.check)).toContain('dom:sens');
});

test('REVIEW P2: documented constants match engine and Deeks correction is independent', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => AlmFeatures.get('dta-sroc').text.results());
  const engine = readFileSync(new URL('../../../shared/dta-bivariate.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../../dta-sroc/index.html', import.meta.url), 'utf8');
  expect(r.chiSquare).toBe(Number(engine.match(/_R95 = Math.sqrt\(([\d.]+)\)/)[1]));
  expect(r.ciLevel).toBe(95);
  expect(engine).toContain('Z975 = 1.959963984540054');
  expect(r.regionDf).toBe(2);
  expect(r.aucGrid).toBe(Number(engine.match(/i <= (\d+); i\+\+\) full.push/)[1]));
  expect(engine).toContain('Math.max(' + r.aucMin + ',');
  expect(engine).toContain('Math.min(' + r.aucMax + ',');
  expect(app).toContain('Math.abs(a.rho) > ' + r.thresholdLimit);
  expect(engine).toContain('tp += ' + r.deeksCc + '; fp += ' + r.deeksCc);
  const out = await page.evaluate(() => {
    const s = AlmFeatures.get('dta-sroc').text, r = s.results();
    r.ccAdd = 0.75;
    const t = AlmText.render(s.templates, r, {});
    return { methods: t.methods.text, audit: AlmText.audit(t, r) };
  });
  expect(out.methods).toContain('For this test, 0.5 was added');
  expect(out.audit.ok).toBe(true);
});

test('REVIEW P2: import snapshots undo before replacing data and clears only the example title', async ({ page }) => {
  await open(page, 'entry');
  const rows = (await records(page)).slice(1);
  const before = await page.evaluate(() => ({ data: document.querySelector('#f-data').value,
    title: document.querySelector('#f-title').value, sens: __almBivariate().sens }));
  await page.evaluate(rows => AlmFeatures.get('dta-sroc').entry.apply(rows), rows);
  await expect(page.locator('#f-title')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => ({ data: document.querySelector('#f-data').value,
    title: document.querySelector('#f-title').value, sens: __almBivariate().sens }))).toEqual(before);
  await page.locator('#f-title').fill('My diagnostic review');
  await page.evaluate(rows => AlmFeatures.get('dta-sroc').entry.apply(rows), rows);
  await expect(page.locator('#f-title')).toHaveValue('My diagnostic review');
});

test('REVIEW P2 PLANTED: modified entry refits and the refit gate detects a suppressed Run click', async ({ page }) => {
  await open(page, 'entry');
  const rows = (await records(page)).slice(1);
  const out = await page.evaluate(rows => {
    const spec = AlmFeatures.get('dta-sroc'), before = __almBivariate();
    const expected = AlmDTABivariate.fit(rows,
      { method: 'reml', correctionControl: 'all' });
    const run = document.querySelector('#btn-run'), click = run.click;
    run.click = () => {};
    spec.entry.apply(rows);
    const stale = __almBivariate();
    run.click = click;
    spec.entry.apply(rows);
    const actual = __almBivariate();
    return { before, stale, expected, actual };
  }, rows);
  const matches = value => ['sens', 'spec', 'dor'].every(key =>
    Math.abs(value[key] - out.expected[key]) / Math.abs(out.expected[key]) <= 1e-9);
  expect(matches(out.stale)).toBe(false);
  expect(matches(out.actual)).toBe(true);
  expect(out.actual.k).toBe(6);
  expect(Math.abs(out.actual.sens - out.before.sens)).toBeGreaterThan(1e-6);
});
