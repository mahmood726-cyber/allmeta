// Feature coverage for paper 7 (multilevel-ma): CSV export, plot export (PNG 600 / PDF / TIFF tags),
// forest grouping + pooled diamond, export receipt method label, and the method-of-moments interval with
// cluster degrees of freedom against an R implementation. Positives + planted negatives.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCsvAgainstPage, downloadCsv, exportEveryPlot, exportNegatives, loadPageFunctions, fail } from './features-helpers.mjs';

const APP = '/multilevel-ma/index.html';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const ROOT = here('../../../');

async function load(page, src) {
  await page.goto(APP);
  if (src != null) {
    await page.locator('#src').fill(src);
    await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  }
  await page.waitForFunction(() => window._almLastMlma && window._almLastMlma() !== null);
}

async function displayedNumbers(page) {
  const rows = await page.locator('#summary table').first().locator('tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const row = p => rows.find(r => p.test(r[0])) || fail('no MoM row ' + p);
  const pair = s => (s.match(/^\[(\S+), (\S+)\]$/) || fail('bad interval ' + s)).slice(1);
  const est = row(/^Pooled estimate/), z = pair(row(/^95% CI \(z\)/)[1]), hk = pair(row(/^95% CI \(HKSJ/)[1]);
  const pi = pair(row(/^95% prediction interval/)[1]);
  const ts = row(/^τ²_study/)[1].match(/^(\S+) — share (\S+)%$/), tw = row(/^τ²_within/)[1].match(/^(\S+) — share (\S+)%$/);
  const samp = row(/^σ²_typical/)[1].match(/^share (\S+)%/);
  return [
    { key: 'mu', text: est[1], digits: 3 }, { key: 'seMu', text: est[2].replace('SE = ', ''), digits: 3 },
    { key: 'ci_lb_z', text: z[0], digits: 3 }, { key: 'ci_ub_z', text: z[1], digits: 3 },
    { key: 'ci_lb_hk', text: hk[0], digits: 3 }, { key: 'ci_ub_hk', text: hk[1], digits: 3 },
    { key: 'pi_lb', text: pi[0], digits: 3 }, { key: 'pi_ub', text: pi[1], digits: 3 },
    { key: 'tau2_study', text: ts[1], digits: 4 }, { key: 'I2_study', text: ts[2], digits: 1, scale: 100 },
    { key: 'tau2_within', text: tw[1], digits: 4 }, { key: 'I2_within', text: tw[2], digits: 1, scale: 100 },
    { key: 'I2_sampling', text: samp[1], digits: 1, scale: 100 },
  ];
}

test('multilevel CSV export: header and every value equal the page results and the MoM table', async ({ page }) => {
  await load(page, null);
  const { name, text } = await downloadCsv(page);
  expect(name).toBe('mlma-results.csv');
  const results = await page.evaluate(() => window._almLastMlma());
  const shown = await displayedNumbers(page);
  expect(shown.length).toBe(13);
  checkCsvAgainstPage(text, results, shown);
  expect(() => checkCsvAgainstPage(text.replace(/^key,value/, 'k,value'), results, shown)).toThrow(/header/);
  expect(() => checkCsvAgainstPage(text.replace('ci_ub_hk,' + results.ci_ub_hk, 'ci_ub_hk,' + (results.ci_ub_hk + 0.01)), results, shown)).toThrow(/ci_ub_hk/);
  expect(() => checkCsvAgainstPage(text, results, shown.map(d => d.key === 'mu' ? { ...d, text: (Number(d.text) + 0.001).toFixed(3) } : d))).toThrow(/mu=/);
});

test('multilevel plot selector: every plot as PNG 600 dpi, PDF and TIFF 300/600 (LZW, RGB)', async ({ page }) => {
  test.setTimeout(180_000);
  await load(page, null);
  const { names, log, last } = await exportEveryPlot(page, expect);
  expect(names).toEqual(['Forest plot']);
  expect(log.length).toBe(5);
  exportNegatives(last, expect);
});

// ---- Forest plot: grouping and pooled diamond ------------------------------------------------------
// rows: [{study, te, se, label}] in input order; mom: {mu, seMu}. The axis mapping X(v) = a + b*v is
// recovered from the drawn effect squares (centre = x + 3.5), never from the page code.
function checkForest(svg, rows, mom) {
  const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(m => ({ attrs: m[1], text: m[2], y: Number(m[1].match(/y="([^"]+)"/)[1]) - 4 }));
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(m => ({ cx: Number(m[0].match(/x="([^"]+)"/)[1]) + 3.5, cy: Number(m[0].match(/y="([^"]+)"/)[1]) + 3.5 }));
  if (rects.length !== rows.length) fail(`forest draws ${rects.length} effect squares for ${rows.length} effects`);
  const headers = texts.filter(t => /font-weight="700"/.test(t.attrs) && /^Study /.test(t.text));
  const clusters = [...new Set(rows.map(r => r.study))];
  if (headers.map(h => h.text).join('|') !== clusters.map(c => 'Study ' + c).join('|')) fail('cluster headers ' + headers.map(h => h.text) + ' vs ' + clusters);
  // Each effect square must sit below its own cluster header and above the next one.
  const order = [];
  clusters.forEach((c, i) => {
    const top = headers[i].y, bottom = i + 1 < headers.length ? headers[i + 1].y : Infinity;
    const mine = rows.map((r, j) => [r, rects[j]]).filter(([r]) => r.study === c);
    for (const [, sq] of mine) if (!(sq.cy > top && sq.cy < bottom)) fail(`effect of cluster ${c} at y=${sq.cy} is outside its group (${top}..${bottom})`);
    order.push(...mine);
  });
  // Axis from two squares with distinct effects.
  const a0 = rows.findIndex(r => r.te !== rows[0].te);
  const b = (rects[a0].cx - rects[0].cx) / (rows[a0].te - rows[0].te), a = rects[0].cx - b * rows[0].te;
  rows.forEach((r, j) => { if (Math.abs(a + b * r.te - rects[j].cx) > 1e-6) fail(`square ${j} not at its effect ${r.te}`); });
  const poly = svg.match(/<polygon points="([^"]+)"/);
  if (!poly) fail('no pooled diamond');
  const pts = poly[1].trim().split(/\s+/).map(p => p.split(',').map(Number));
  const inv = x => (x - a) / b;
  const centre = inv(pts[1][0]), lo = inv(pts[0][0]), hi = inv(pts[2][0]);
  const z = 1.959963984540054;
  const near = (x, y, what) => { if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(y))) fail(`diamond ${what} ${x} != ${y}`); };
  near(centre, mom.mu, 'centre'); near(lo, mom.mu - z * mom.seMu, 'lower'); near(hi, mom.mu + z * mom.seMu, 'upper');
  if (pts[3][0] !== pts[1][0]) fail('diamond not symmetric');
  return { centre, lo, hi };
}

test('forest plot groups effects by cluster and the pooled diamond is the MoM estimate and z CI shown in the table', async ({ page }) => {
  await load(page, null);
  const src = await page.locator('#src').inputValue();
  const rows = src.trim().split('\n').map(l => { const p = l.split(',').map(s => s.trim()); return { study: p[0], te: Number(p[1]), se: Number(p[2]), label: p[3] }; });
  const svg = await page.locator('#forest').innerHTML();
  const mom = await page.evaluate(() => window._almLastMlma());
  const reml = await page.evaluate(() => window.__almReml());
  const d = checkForest(svg, rows, mom);
  // Diamond equals what the table prints (3 dp) ...
  const shown = await displayedNumbers(page);
  const txt = k => shown.find(s => s.key === k).text;
  expect(d.centre.toFixed(3)).toBe(txt('mu')); expect(d.lo.toFixed(3)).toBe(txt('ci_lb_z')); expect(d.hi.toFixed(3)).toBe(txt('ci_ub_z'));
  // ... and it is NOT the REML estimate/CI (the paper: "The pooled diamond is the method-of-moments estimate").
  expect(Math.abs(d.centre - reml.mu)).toBeGreaterThan(1e-4);
  expect(() => checkForest(svg, rows, { mu: reml.mu, seMu: reml.se })).toThrow(/diamond/);
  // Planted negatives: a misplaced effect, a dropped square, a moved diamond.
  const swapped = rows.map(r => ({ ...r })); [swapped[0].study, swapped[3].study] = [swapped[3].study, swapped[0].study];
  expect(() => checkForest(svg, swapped, mom)).toThrow();
  expect(() => checkForest(svg.replace(/<rect\b[^>]*>/, ''), rows, mom)).toThrow(/effect squares/);
  expect(() => checkForest(svg.replace(/<polygon points="([\d.]+),/, (m, x) => `<polygon points="${Number(x) - 2},`), rows, mom)).toThrow(/diamond lower/);
});

// ---- Export receipt method label (paper fault 2) ----------------------------------------------------
function checkReceipt(svgText, mom, reml) {
  const m = svgText.match(/<metadata id="truthcert">([\s\S]*?)<\/metadata>/);
  if (!m) fail('exported SVG has no receipt');
  const json = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  const payload = json.extra || (json.payload && json.payload.extra) || fail('receipt has no extra block');
  if (!/method-of-moments/i.test(payload.method)) fail('receipt method label is "' + payload.method + '"');
  if (/REML|restricted maximum/i.test(payload.method)) fail('receipt method label names REML: ' + payload.method);
  if (Math.abs(payload.results.mu - mom.mu) > 1e-12) fail('receipt results.mu ' + payload.results.mu + ' is not the MoM mu ' + mom.mu);
  if (Math.abs(payload.results.mu - reml.mu) < 1e-6) fail('receipt results equal the REML fit');
  return payload;
}

test('exported plot receipt names the method actually fitted for the results it carries (MoM, not REML)', async ({ page }) => {
  await load(page, null);
  const panel = page.getByRole('group', { name: 'Download plots', exact: true });
  await panel.getByLabel('Format', { exact: true }).selectOption('svg');
  const [file] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download Forest plot', exact: true }).click()]);
  const svg = readFileSync(await file.path(), 'utf8');
  const mom = await page.evaluate(() => window._almLastMlma()), reml = await page.evaluate(() => window.__almReml());
  const payload = checkReceipt(svg, mom, reml);
  expect(payload.method).toBe('Three-level (multilevel) method-of-moments meta-analysis');
  // The page labels the same numbers as MoM, and the REML table separately.
  await expect(page.locator('#summary caption').first()).toHaveText('Method of moments (MoM)');
  await expect(page.locator('#summary caption').nth(1)).toContainText('REML');
  // Planted negatives: the pre-fix label, REML numbers under a MoM label, no receipt.
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = svg.match(/<metadata id="truthcert">([\s\S]*?)<\/metadata>/)[1];
  const parsed = JSON.parse(meta.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  const swap = obj => svg.replace(meta, esc(JSON.stringify(obj)));
  const relabel = JSON.parse(JSON.stringify(parsed)); (relabel.extra || relabel.payload.extra).method = 'Three-level REML meta-analysis';
  expect(() => checkReceipt(swap(relabel), mom, reml)).toThrow(/method label/);
  const remlNums = JSON.parse(JSON.stringify(parsed)); (remlNums.extra || remlNums.payload.extra).results.mu = reml.mu;
  expect(() => checkReceipt(swap(remlNums), mom, reml)).toThrow(/not the MoM mu/);
  expect(() => checkReceipt(svg.replace(/<metadata id="truthcert">[\s\S]*?<\/metadata>/, ''), mom, reml)).toThrow(/no receipt/);
});

// ---- MoM interval with cluster df vs R ---------------------------------------------------------------
// Reference: fixtures/features/multilevel-ma/mlma_mom.R (R 4.6.0) = the MoM algorithm of
// multilevel-ma/tests/fixtures/mlma-tiny.R plus limits mu +/- qt(0.975, J-1)*seMuHK and the prediction
// interval, over the 44 configurations of github.com/mahmood726-cyber/multilevel-reproducible.
// The page's fit() runs in Node from the page source with the page's shared/stats-qt.js and ma-core.js.
// Tolerance 1e-6 relative to max(1, |R|) (iterative estimator; qt via Hill's algorithm).
const MOM = JSON.parse(readFileSync(here('./fixtures/features/multilevel-ma/mom-reference.json'), 'utf8'));
const engine = loadPageFunctions(ROOT + 'multilevel-ma/index.html', ['fit'], {}, [ROOT + 'shared/stats-qt.js', ROOT + 'shared/ma-core.js']);
const KEYS = ['mu', 'seMu', 'seMuHK', 'tau2_study', 'tau2_within', 'ci_lb_hk', 'ci_ub_hk', 'pi_lb', 'pi_ub'];
function toRows(cfg) {
  const ids = new Map(); // cluster names can contain commas (dat.lehmann2018): use first-appearance ids
  return cfg.rows.map(([c, y, v]) => { if (!ids.has(c)) ids.set(c, 'C' + (ids.size + 1)); return { study: ids.get(c), te: y, se: Math.sqrt(v), label: '' }; });
}
function appValues(rows) {
  const f = engine.fit(rows);
  return { mu: f.mu, seMu: f.seMu, seMuHK: f.seMuHK, tau2_study: f.tau2_study, tau2_within: f.tau2_within,
    ci_lb_hk: f.mu - f.tCrit * f.seMuHK, ci_ub_hk: f.mu + f.tCrit * f.seMuHK, pi_lb: f.piLo, pi_ub: f.piHi };
}
function momAgreement(valuesOf, tol) {
  const tally = Object.fromEntries(KEYS.map(k => [k, { pass: 0, max: 0 }])); const bad = [];
  for (const cfg of MOM.configs) {
    const app = valuesOf(cfg), ref = cfg.ref;
    for (const k of KEYS) {
      const d = Math.abs(app[k] - ref[k]) / Math.max(1, Math.abs(ref[k]));
      tally[k].max = Math.max(tally[k].max, d);
      if (d < tol) tally[k].pass++; else bad.push(`${cfg.id} ${k}: app ${app[k]} R ${ref[k]}`);
    }
  }
  return { tally, bad };
}

test('MoM HKSJ interval (t_{J-1}) and prediction interval agree with the R implementation on 44/44 configurations', () => {
  expect(MOM.n).toBe(44);
  expect(MOM.R).toMatch(/^R version 4\.6\.0/);
  const r = momAgreement(cfg => appValues(toRows(cfg)), 1e-6);
  test.info().annotations.push({ type: 'mom-vs-R', description: KEYS.map(k => `${k} ${r.tally[k].pass}/44 max ${r.tally[k].max.toExponential(2)}`).join('; ') });
  expect(r.bad).toEqual([]);
  for (const k of KEYS) expect(r.tally[k].pass, k).toBe(44);
  // Planted negative: z instead of t_{J-1} for the limits is detected.
  const z = momAgreement(cfg => { const v = appValues(toRows(cfg)); return { ...v, ci_lb_hk: v.mu - 1.959963984540054 * v.seMuHK }; }, 1e-6);
  expect(z.tally.ci_lb_hk.pass).toBeLessThan(10);
});

test('page shows the same MoM interval as the engine run in Node (3 corpus configurations)', async ({ page }) => {
  for (const cfg of MOM.configs.filter(c => c.rows.length <= 60).slice(0, 3)) {
    const rows = toRows(cfg);
    await load(page, rows.map(r => `${r.study}, ${r.te}, ${r.se}, e`).join('\n'));
    const shown = await page.evaluate(() => window._almLastMlma());
    const node = appValues(rows);
    for (const k of KEYS) {
      expect(Math.abs(shown[k] - node[k]), cfg.id + ' ' + k).toBeLessThan(1e-12 * Math.max(1, Math.abs(node[k])));
      expect(Math.abs(shown[k] - cfg.ref[k]) / Math.max(1, Math.abs(cfg.ref[k])), cfg.id + ' ' + k + ' vs R').toBeLessThan(1e-6);
    }
  }
});
