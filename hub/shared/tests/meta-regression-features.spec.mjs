// Feature coverage for paper 8 (meta-regression): CSV export, plot export (PNG 600 / PDF / TIFF tags),
// seeded Monte Carlo permutation test vs metafor's exact permutation p, and the exported R script run
// in R. Positives + planted negatives.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkCsvAgainstPage, downloadCsv, exportEveryPlot, exportNegatives, fail } from './features-helpers.mjs';

const APP = '/meta-regression/index.html';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const FX = here('./fixtures/features/meta-regression/');
const CONFIGS = JSON.parse(readFileSync(FX + 'rscript/configs.json', 'utf8'));
const BCG = CONFIGS.find(c => c.id === 'dat.bcg/e1/ablat');

async function load(page, data) {
  await page.goto(APP);
  await page.locator('#f-data').fill(data);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await page.waitForFunction(k => window.__almResults && window.__almResults().k === k && 'slope' in window.__almResults(),
    data.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length);
}
async function cards(page) {
  const pairs = await page.locator('.stat').evaluateAll(els => els.map(e => [e.querySelector('.k').textContent, e.querySelector('.v').textContent]));
  return new Map(pairs);
}
function displayed(c) {
  const get = k => c.get(k) ?? fail('no stat card ' + k);
  const ci = s => s.match(/^(\S+) \[(\S+), (\S+)\]$/) || fail('bad card ' + s);
  const b0 = ci(get('β₀ (intercept)')), b1 = ci(get('β₁ (slope)'));
  const qe = get('Q_E (residual)').match(/^(\S+) \(df (\d+)\), p = (\S+)$/);
  return [
    { key: 'intercept', text: b0[1], digits: 3 }, { key: 'intercept_ci_lb', text: b0[2], digits: 3 }, { key: 'intercept_ci_ub', text: b0[3], digits: 3 },
    { key: 'slope', text: b1[1], digits: 4 }, { key: 'slope_ci_lb', text: b1[2], digits: 4 }, { key: 'slope_ci_ub', text: b1[3], digits: 4 },
    { key: 'tau2_pm', text: get('τ² (PM)'), digits: 4 }, { key: 'hksj_q', text: get('HKSJ q').replace(' (floored)', ''), digits: 3 },
    { key: 'R2_tau2', text: get('R² (τ² explained)').replace('%', ''), digits: 1, scale: 100 },
    { key: 'QE', text: qe[1], digits: 2 }, { key: 'QE_df', text: qe[2], digits: 0 }, { key: 'QE_p', text: qe[3], digits: 3 },
  ];
}

test('meta-regression CSV export: header and every value equal the page results and the printed cards', async ({ page }) => {
  for (const cfg of [BCG, CONFIGS.find(c => c.id === 'app-example')]) {
    await load(page, cfg.data);
    const { name, text } = await downloadCsv(page);
    expect(name).toMatch(/\.csv$/);
    const results = await page.evaluate(() => window.__almResults());
    const shown = displayed(await cards(page));
    checkCsvAgainstPage(text, results, shown);
    expect(() => checkCsvAgainstPage(text.replace(/^key,value/, 'name,value'), results, shown)).toThrow(/header/);
    expect(() => checkCsvAgainstPage(text.replace('slope,' + results.slope, 'slope,' + (results.slope * 1.01)), results, shown)).toThrow(/slope/);
    expect(() => checkCsvAgainstPage(text, results, shown.map(d => d.key === 'tau2_pm' ? { ...d, text: (Number(d.text) + 0.0002).toFixed(4) } : d))).toThrow(/tau2_pm/);
  }
  if (BCG) { // paper Figure 1 values
    await load(page, BCG.data);
    const c = await cards(page);
    expect(c.get('β₁ (slope)')).toBe('-0.0286 [-0.0485, -0.0086]');
    expect(c.get('τ² (PM)')).toBe('0.1421');
  }
});

test('meta-regression plot selector: every plot as PNG 600 dpi, PDF and TIFF 300/600 (LZW, RGB)', async ({ page }) => {
  test.setTimeout(180_000);
  await load(page, BCG.data);
  const { names, log, last } = await exportEveryPlot(page, expect);
  expect(names).toEqual(['Bubble plot']);
  expect(log.length).toBe(5);
  exportNegatives(last, expect);
});

// ---- Seeded Monte Carlo permutation test ----------------------------------------------------------
// Reference: exact p from metafor 5.2.1 permutest(rma(yi, vi, mods=~x, method="PM", test="adhoc"),
// exact=TRUE) for the 365 archive configurations with k = 4..7 (metaregression-reproducible
// results/permutation.json). The app's module (shared/permutest.js, the file the page loads) is forced
// to Monte Carlo (exactMax 1) with the page's nperm = 2000 and default seed; |p_MC - p_exact| must be
// <= 3 binomial SEs, sqrt(p(1-p)/nperm).
const PERM = JSON.parse(readFileSync(FX + 'permutation-exact.json', 'utf8'));
const permtest = createRequire(import.meta.url)(here('../../../shared/permutest.js'));
function mcAgreement(pOf) {
  let within = 0, maxZ = 0; const out = [];
  for (const c of PERM.configs) {
    const mc = pOf(c), se = Math.sqrt(c.exact_p * (1 - c.exact_p) / mc.nperm), diff = Math.abs(mc.p - c.exact_p);
    const z = se > 0 ? diff / se : (diff === 0 ? 0 : Infinity);
    maxZ = Math.max(maxZ, z);
    if (diff <= 3 * se) within++; else out.push(`${c.id}: MC ${mc.p} exact ${c.exact_p} (${z.toFixed(2)} SE)`);
  }
  return { within, n: PERM.configs.length, maxZ, out };
}

test('MC permutation p (nperm 2000, fixed seed) is within 3 binomial SEs of metafor exact p for all k 4-7 configurations', () => {
  test.setTimeout(240_000);
  expect(PERM.n).toBe(365);
  const r = mcAgreement(c => { const m = permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 1, nperm: 2000 }); expect(m.exact).toBe(false); return m; });
  test.info().annotations.push({ type: 'mc-vs-exact', description: `${r.within}/${r.n} within 3 SE; max ${r.maxZ.toFixed(3)} SE` });
  expect(r.out).toEqual([]);
  expect(r.within).toBe(365);
  // The page's exact branch (k <= 7) reproduces metafor's exact p itself.
  const exactEq = PERM.configs.filter(c => Math.abs(permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 7 }).p - c.exact_p) < 1e-12).length;
  expect(exactEq).toBe(365);
});

test('MC agreement check can fail (planted): a p-value biased by 0.05, and a tiny nperm', () => {
  const biased = mcAgreement(c => { const m = permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 1, nperm: 2000 }); return { ...m, p: Math.min(1, m.p + 0.05) }; });
  expect(biased.within).toBeLessThan(365 * 0.8);
  const coarse = mcAgreement(c => ({ p: c.exact_p < 0.5 ? 1 : 0, nperm: 2000 }));
  expect(coarse.within).toBe(0);
});

test('fixed seed gives identical MC output twice; a different seed does not (module and page)', async ({ page }) => {
  const c = PERM.configs.find(x => x.k === 7 && x.exact_p > 0.05 && x.exact_p < 0.95);
  const a = permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 1, nperm: 2000 });
  const b = permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 1, nperm: 2000 });
  expect(b).toEqual(a);
  const other = permtest.permTestSlope(c.yi, c.vi, c.x, { exactMax: 1, nperm: 2000, seed: 777 });
  expect(other.p).not.toBe(a.p); // the equality check above is able to fail
  // Page: BCG (k = 13 > 7) uses MC 2000 on the page; two independent loads give the same card.
  const shown = [];
  for (let i = 0; i < 2; i++) {
    await load(page, BCG.data);
    const card = (await cards(page)).get('β₁ permutation p (MC 2000)');
    expect(card).toBeDefined();
    shown.push(card);
    // The card is the module's output for the same inputs.
    const p = await page.evaluate(() => { const s = window._almLastStudies(); return window.AlmPermTest.permTestSlope(s.map(x => x.est), s.map(x => x.v), s.map(x => x.x), { exactMax: 7, nperm: 2000 }).p; });
    expect(p.toFixed(3)).toBe(card);
  }
  expect(shown[1]).toBe(shown[0]);
  expect(shown[0]).toBe('0.019'); // paper Figure 1 panel 4
});

// ---- Exported R script ---------------------------------------------------------------------------
// The scripts in fixtures/features/meta-regression/rscript/*.R were run UNMODIFIED in R 4.6.0 with
// metafor 5.2.1 by fixtures/features/meta-regression/run_rscripts.R, twice: as exported
// (r-results.json; since #155 the export itself sets control=list(tol=1e-12) for the PM root-finder) and with
// rma() resolved to a wrapper that only adds control=list(tol=1e-12, threshold=1e-12) (r-results-tight.json). Each test re-exports the
// script from the page and requires it to be byte-identical to the script R ran, then compares R's fit
// with the page. Tolerance: 1e-9 when tau^2 = 0 (closed form), else 1e-6 (iterative PM), relative to
// max(1, |R|).
const RRES = JSON.parse(readFileSync(FX + 'rscript/r-results.json', 'utf8'));
const RTIGHT = JSON.parse(readFileSync(FX + 'rscript/r-results-tight.json', 'utf8'));
const PAIRS = [['intercept', 'intercept'], ['slope', 'slope'], ['intercept_se', 'intercept_se'], ['slope_se', 'slope_se'],
  ['intercept_ci_lb', 'intercept_ci_lb'], ['intercept_ci_ub', 'intercept_ci_ub'], ['slope_ci_lb', 'slope_ci_lb'], ['slope_ci_ub', 'slope_ci_ub'],
  ['tau2_pm', 'tau2'], ['QE', 'QE'], ['QE_p', 'QE_p'], ['QE_df', 'QE_df']];
function compareFit(page, r) {
  const tol = r.tau2 === 0 ? 1e-9 : 1e-6, bad = [];
  let max = 0;
  const check = (name, a, b) => { const d = Math.abs(a - b) / Math.max(1, Math.abs(b)); max = Math.max(max, d); if (!(d < tol)) bad.push(`${name}: page ${a} R ${b} (rel ${d.toExponential(2)})`); };
  for (const [pk, rk] of PAIRS) check(pk, page[pk], r[rk]);
  check('R2 (%)', 100 * page.R2_tau2, r.R2);
  check('slope t', page.slope / page.slope_se, r.slope_t);
  return { bad, max, tol };
}
async function exportedFits(page) {
  const out = [];
  for (const cfg of CONFIGS) {
    await load(page, cfg.data);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export R script', exact: true }).click()]);
    expect(file.suggestedFilename()).toBe('metareg-validate.R');
    const exported = readFileSync(await file.path(), 'utf8');
    expect(exported, cfg.id + ': exported script differs from the one run in R').toBe(readFileSync(FX + 'rscript/' + cfg.file, 'utf8'));
    out.push({ cfg, fit: await page.evaluate(() => window.__almResults()) });
  }
  return out;
}
function compareAll(fits, R) {
  expect(R.R).toMatch(/^R version 4\.6\.0/);
  expect(R.metafor).toBe('5.2.1');
  return fits.map(({ cfg, fit }) => {
    const r = R.results[cfg.file];
    expect(r, 'no R result for ' + cfg.file).toBeDefined();
    expect(r.k).toBe(cfg.k);
    // Planted negative: a 1e-4 shift in the page slope is detected.
    expect(compareFit({ ...fit, slope: fit.slope + 1e-4 * Math.max(1, Math.abs(fit.slope)) }, r).bad.length).toBeGreaterThan(0);
    return { id: cfg.id, ...compareFit(fit, r) };
  });
}

test('exported R script reproduces the page estimates when R\'s PM solver is converged (tol 1e-12)', async ({ page }) => {
  test.setTimeout(180_000);
  expect(CONFIGS.length).toBe(6);
  expect(RTIGHT.tight).toBe(true);
  const rows = compareAll(await exportedFits(page), RTIGHT);
  test.info().annotations.push({ type: 'r-script-tight', description: rows.map(r => `${r.id}: max ${r.max.toExponential(2)} (tol ${r.tol})`).join('; ') });
  expect(rows.flatMap(r => r.bad.map(b => r.id + ' ' + b))).toEqual([]);
});

test('exported R script, run exactly as exported, reproduces the page estimates', async ({ page }) => {
  // Requirement (paper 8): the exported script, run unmodified, reproduces the page. Before #155 the export
  // called rma(method="PM") with metafor's default root-finding tolerance (.Machine$double.eps^0.25) and 4 of
  // 6 configurations exceeded 1e-6 (largest: R^2 0.109 percentage points, bangertdrowns2004); this test was
  // an expected failure. The export now sets control=list(tol=1e-12); r-results.json was regenerated from the
  // re-exported scripts with run_rscripts.R, and R must report that tolerance as used.
  test.setTimeout(180_000);
  expect(RRES.tight).toBe(false);
  for (const cfg of CONFIGS) expect(RRES.results[cfg.file].control_tol, cfg.file + ': PM tolerance used by R').toBe(1e-12);
  const rows = compareAll(await exportedFits(page), RRES);
  test.info().annotations.push({ type: 'r-script-default', description: rows.map(r => `${r.id}: max ${r.max.toExponential(2)} [${r.bad.join(' | ')}]`).join('; ') });
  expect(rows.flatMap(r => r.bad.map(b => r.id + ' ' + b))).toEqual([]);
});
