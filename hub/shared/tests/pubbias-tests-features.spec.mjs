// Feature coverage for paper 6 (pubbias-tests): CSV export, plot export (PNG 600 / PDF / TIFF tags),
// funnel-plot content, and the Thompson-Sharp variant against metafor. Positives + planted negatives.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  checkCsvAgainstPage, downloadCsv, exportEveryPlot, exportNegatives, loadPageFunctions, fail,
} from './features-helpers.mjs';

const APP = '/pubbias-tests/index.html';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const PB_TINY = '0.55, 0.08\n0.48, 0.10\n0.70, 0.15\n0.60, 0.09\n0.30, 0.07\n0.75, 0.20\n0.52, 0.08\n0.65, 0.12\n0.45, 0.17\n0.58, 0.10';

async function load(page, src) {
  await page.goto(APP);
  await page.waitForFunction(() => window._almLastPubbias && window._almLastPubbias() !== null);
  if (src) {
    await page.locator('#src').fill(src);
    await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
    await page.waitForFunction(n => window._almLastPubbias() && window._almLastPubbias().k === n, src.trim().split('\n').length);
  }
}

// Numbers printed in the results table, keyed by the CSV field they come from.
async function displayedNumbers(page) {
  const rows = await page.locator('#body tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const byName = n => rows.find(r => r[0].startsWith(n)) || fail('no results row ' + n);
  const egger = byName('Egger (generic)'), begg = byName('Begg-Mazumdar'), tf = byName('Trim-and-fill');
  const out = [
    { key: 'egger_t', text: egger[1], digits: 3 }, { key: 'egger_p', text: egger[2], digits: 3 },
    { key: 'begg_tau', text: begg[1], digits: 3 }, { key: 'begg_p', text: begg[2], digits: 3 },
    { key: 'tf_k0', text: tf[1].replace(/^k0=/, ''), digits: 0 },
    { key: 'tf_est', text: tf[3].replace(/^adjusted est=/, ''), digits: 3 },
  ];
  const sel = rows.find(r => r[0].startsWith('Selection model'));
  if (sel) {
    out.push({ key: 'sel_delta2', text: sel[1].replace(/^δ₂=/, ''), digits: 3 }, { key: 'sel_LRTp', text: sel[2], digits: 3 },
      { key: 'sel_mu', text: sel[3].match(/adjusted μ=(\S+)/)[1], digits: 3 });
  }
  return out;
}

test('pubbias CSV export: header and every value equal the page results and the printed table', async ({ page }) => {
  for (const src of [null, PB_TINY]) {
    await load(page, src);
    const { name, text } = await downloadCsv(page);
    expect(name).toBe('pubbias-tests-results.csv');
    const results = await page.evaluate(() => window._almLastPubbias());
    const shown = await displayedNumbers(page);
    expect(shown.length).toBeGreaterThanOrEqual(6);
    checkCsvAgainstPage(text, results, shown);
    // Planted negatives: each corruption must be caught.
    expect(() => checkCsvAgainstPage(text.replace(/^key,value/, 'key,val'), results, shown)).toThrow(/header/);
    const p = String(results.egger_p);
    expect(() => checkCsvAgainstPage(text.replace('egger_p,' + p, 'egger_p,' + (results.egger_p + 0.01)), results, shown)).toThrow(/egger_p/);
    expect(() => checkCsvAgainstPage(text, results, shown.map(d => d.key === 'tf_est' ? { ...d, text: (Number(d.text) + 0.001).toFixed(3) } : d))).toThrow(/tf_est/);
    expect(() => checkCsvAgainstPage(text, { ...results, extra_key: 1 }, shown)).toThrow(/value rows/);
  }
});

test('pubbias plot selector: every plot as PNG 600 dpi, PDF and TIFF 300/600 (LZW, RGB)', async ({ page }) => {
  test.setTimeout(180_000);
  await load(page, null);
  const { names, log, last } = await exportEveryPlot(page, expect);
  expect(names).toEqual(['Funnel plot']);
  expect(log.length).toBe(5);
  exportNegatives(last, expect);
});

// ---- Funnel content ----------------------------------------------------------------------------
// Independent geometry: the page draws Y(se) = 20 + se/seMax*240, X(t) = 60 + (t-xMin)/(xMax-xMin)*520,
// xMin/xMax = min/max effect -/+ 0.1, seMax = 1.1*max(se) (default axes). The Egger line is the weighted
// regression te = a + b*se (w = 1/se^2); its slope b equals the Egger standardised intercept (egger_b0).
function funnelExpectations(rows) {
  const te = rows.map(r => r[0]), se = rows.map(r => r[1]);
  const xMin = Math.min(...te) - 0.1, xMax = Math.max(...te) + 0.1, seMax = Math.max(...se) * 1.1;
  const X = t => 60 + (t - xMin) / (xMax - xMin) * 520, Y = s => 20 + (s / seMax) * 240;
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  rows.forEach(([t, s]) => { const w = 1 / (s * s); sw += w; sx += w * s; sy += w * t; sxx += w * s * s; sxy += w * s * t; });
  const b = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), a = (sy - b * sx) / sw;
  return { a, b, line: [X(a), Y(0), X(a + b * seMax), Y(seMax)], points: rows.map(([t, s]) => [X(t), Y(s)]) };
}
function checkFunnel(svgHtml, rows, eggerB0) {
  const doc = svgHtml;
  const lines = [...doc.matchAll(/<line\b[^>]*>/g)].map(m => m[0]);
  const regression = lines.filter(l => /stroke="var\(--accent\)"/.test(l));
  if (regression.length !== 1) fail('expected exactly one accent-stroked regression line, found ' + regression.length);
  const g = ['x1', 'y1', 'x2', 'y2'].map(k => Number(regression[0].match(new RegExp(k + '="([^"]+)"'))[1]));
  const want = funnelExpectations(rows);
  g.forEach((v, i) => { if (Math.abs(v - want.line[i]) > 1e-6) fail(`regression line ${['x1', 'y1', 'x2', 'y2'][i]}=${v}, expected ${want.line[i]}`); });
  if (Math.abs(want.b - eggerB0) > 1e-9 * Math.max(1, Math.abs(eggerB0))) fail(`drawn slope ${want.b} is not the Egger coefficient ${eggerB0}`);
  const circles = [...doc.matchAll(/<circle\b[^>]*>/g)].map(m => [Number(m[0].match(/cx="([^"]+)"/)[1]), Number(m[0].match(/cy="([^"]+)"/)[1])]);
  if (circles.length !== rows.length) fail(`funnel draws ${circles.length} points for k=${rows.length} studies`);
  const left = want.points.map(p => p.join());
  for (const c of circles) {
    const i = left.findIndex(p => { const [x, y] = p.split(',').map(Number); return Math.abs(x - c[0]) < 1e-6 && Math.abs(y - c[1]) < 1e-6; });
    if (i < 0) fail('point ' + c + ' is not an observed study');
    left.splice(i, 1);
  }
  // No other marks besides the two axes and the regression line.
  if (lines.length !== 3) fail('funnel has ' + lines.length + ' lines (axes + regression expected)');
  if (/<(polygon|path|rect)\b/.test(doc)) fail('funnel has extra shapes');
}

test('pubbias funnel draws the Egger regression line and only the k observed studies (no imputed points)', async ({ page }) => {
  for (const src of [null, PB_TINY]) {
    await load(page, src);
    const text = await page.locator('#src').inputValue();
    const rows = text.trim().split('\n').map(l => l.split(',').map(Number));
    const results = await page.evaluate(() => window._almLastPubbias());
    const svg = await page.locator('#funnel').innerHTML();
    if (src === PB_TINY) expect(results.tf_k0).toBe(3); // trim-and-fill imputes 3 studies here, none may be drawn
    checkFunnel(svg, rows, results.egger_b0);
    // Planted negatives.
    expect(() => checkFunnel(svg.replace('</text>', '</text><circle cx="1" cy="1" r="4"/>'), rows, results.egger_b0)).toThrow(/points for k/);
    const imputed = funnelExpectations(rows).points[0];
    expect(() => checkFunnel(svg + `<circle cx="${600 - imputed[0]}" cy="${imputed[1]}" r="4"/>`, rows, results.egger_b0)).toThrow(/points for k/);
    const accent = svg.match(/<line\b[^>]*stroke="var\(--accent\)"[^>]*>/)[0];
    expect(() => checkFunnel(svg.replace(accent, accent.replace(/x1="([^"]+)"/, (m, x) => `x1="${Number(x) + 5}"`)), rows, results.egger_b0)).toThrow(/regression line x1/);
    expect(() => checkFunnel(svg.replace('stroke="var(--accent)"', 'stroke="currentColor"'), rows, results.egger_b0)).toThrow(/regression line, found 0/);
    expect(() => checkFunnel(svg, rows, results.egger_b0 + 0.01)).toThrow(/Egger coefficient/);
    expect(() => checkFunnel(svg, rows.slice(1), results.egger_b0)).toThrow();
  }
});

// ---- Thompson-Sharp vs metafor --------------------------------------------------------------------
// Reference: metafor 5.2.1 regtest(yi, vi, model="rma", predictor="sei") (rma default REML) on the 152
// archive configurations of github.com/mahmood726-cyber/pubbias-reproducible (fixture built by
// fixtures/features/pubbias-tests/ts_regtest.R on R 4.6.0). The app's function is executed from the
// page source in Node. Tolerance 1e-6 (iterative, REML tau^2), relative to max(1, |reference|).
const TS = JSON.parse(readFileSync(here('./fixtures/features/pubbias-tests/thompson-sharp-reference.json'), 'utf8'));
const ts = loadPageFunctions(here('../../../pubbias-tests/index.html'), ['lnGamma', 'betaCF', 'betaInc', 'pt2', 'wls', 'thompsonSharp']);
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
function tsParity(appFn, refOf, tol) {
  let pass = 0, max = 0; const failures = [];
  for (const c of TS.configs) {
    const rows = c.yi.map((y, i) => ({ te: y, se: Math.sqrt(c.vi[i]) }));
    const app = appFn(rows, c), ref = refOf(c.ref);
    const d = Math.max(rel(app.statistic, ref.z), rel(app.p, ref.p));
    max = Math.max(max, d);
    if (d < tol) pass++; else failures.push(`${c.id}: app ${app.statistic}/${app.p} vs R ${ref.z}/${ref.p}`);
  }
  return { pass, n: TS.configs.length, max, failures };
}

test('Thompson-Sharp parity checker can pass and can fail (planted)', () => {
  expect(TS.metafor).toBe('5.2.1');
  expect(TS.n).toBe(152);
  // Checker fed the R values themselves passes 152/152 ...
  const self = tsParity((rows, c) => ({ statistic: c.ref.rma_reml.zval, p: c.ref.rma_reml.pval }),
    r => ({ z: r.rma_reml.zval, p: r.rma_reml.pval }), 1e-6);
  expect(self.pass).toBe(152);
  // ... and a 1e-5 (relative to max(1,|z|)) perturbation is caught everywhere.
  const bad = tsParity((rows, c) => ({ statistic: c.ref.rma_reml.zval + 1e-5 * Math.max(1, Math.abs(c.ref.rma_reml.zval)), p: c.ref.rma_reml.pval }),
    r => ({ z: r.rma_reml.zval, p: r.rma_reml.pval }), 1e-6);
  expect(bad.pass).toBe(0);
});

test('Thompson-Sharp (thompsonSharp) agrees with metafor regtest(model="rma", predictor="sei") on the archive corpus', () => {
  // KNOWN DISAGREEMENT (lane fc, 19 Oct 2026): 0/152 agree. thompsonSharp() tests the INTERCEPT of the
  // weighted regression te ~ se (the limit effect), not the sei coefficient, and divides by
  // sqrt(max(1, sigma^2)) on top of an SE that already contains sigma^2. On all 152 configurations its
  // statistic equals lm-intercept t / sqrt(max(1, sigma^2)) to 1.6e-14. Remove test.fail() when fixed.
  test.fail();
  const r = tsParity(ts.thompsonSharp, x => ({ z: x.rma_reml.zval, p: x.rma_reml.pval }), 1e-6);
  test.info().annotations.push({ type: 'parity', description: `${r.pass}/${r.n} within 1e-6; max rel diff ${r.max}` });
  expect(r.failures.slice(0, 5)).toEqual([]);
  expect(r.pass).toBe(r.n);
});
