import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Requirement: the Pairwise AI bundle's R export runs Peters' test as Peters et al. (2006) define it and as
// meta::metabias(method.bias = "Peters") computes it -- a weighted regression of yi on 1/n with weights
// 1 / (1/S + 1/F) (S, F: a study's total events and non-events), testing the 1/n slope -- and only where the
// data have the binary counts it needs (lane pwrest4, follow-up to #572).
// Defect guarded: the export ran regtest(res, model = "lm", predictor = "ni"): a regression on the sample size n
// itself (not 1/n) with inverse-variance weights. BINARY_RD: t = 3.786, p = 0.0091 (asymmetry "detected"); Peters'
// test is t = -3.092, p = 0.0213. SGLT2_ACM: t = 0.491 vs -0.225.
// Reference: Pairwiseai/tests/peters_r460.json (peters_reference.R, R 4.6.0, metafor 5.2.1, meta 8.5-0), where the
// export's regtest(..., predictor = "ninv") equals metabias(..., "Peters") to < 1e-12 on every binary demo.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || path.join(HERE, '..', '..');
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'Pairwiseai', 'tests', 'peters_r460.json'), 'utf8'));
const PATH = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';
const CALL = 'peters <- regtest(yi, vi = 1 / ev + 1 / (ni - ev), ni = ni, model = "lm", predictor = "ninv")';

// weighted least squares slope t of yi on 1/n (what lm(yi ~ I(1/ni), weights = w) reports), df = k - 2
function slopeT(y, x, w) {
  const W = w.reduce((a, b) => a + b, 0), mx = x.reduce((a, v, i) => a + w[i] * v, 0) / W, my = y.reduce((a, v, i) => a + w[i] * v, 0) / W;
  let sxx = 0, sxy = 0; x.forEach((v, i) => { sxx += w[i] * (v - mx) ** 2; sxy += w[i] * (v - mx) * (y[i] - my); });
  const b = sxy / sxx, a = my - b * mx;
  const rss = y.reduce((s, v, i) => s + w[i] * (v - a - b * x[i]) ** 2, 0);
  return b / Math.sqrt(rss / (y.length - 2) / sxx);
}
const vec = (code, name) => {
  const m = code.match(new RegExp('^' + name + ' <- c\\(([^)]*)\\)', 'm'));
  return m ? m[1].split(',').map(Number) : null;
};

async function exportFor(page, demo, measure) {
  return page.evaluate(async ([demo, measure]) => {
    loadDemoDataset(demo); await new Promise(r => setTimeout(r, 400));
    if (measure) { AppState.settings.effectMeasure = measure; const s = document.getElementById('effectMeasureSelect'); if (s) s.value = measure; }
    const prev = AppState.results; runAnalysis();
    for (let i = 0; i < 300 && (!AppState.results || AppState.results === prev || !AppState.results.pooled); i++) await new Promise(r => setTimeout(r, 100));
    const e = AppState.results;
    return { measure: e.measure, r: generateRCode(e, { method: AppState.settings.tau2Method, hksj: AppState.settings.hksj }),
      studies: e.studies.map(s => ({ events_t: s.events_t, n_t: s.n_t, events_c: s.events_c, n_c: s.n_c })) };
  }, [demo, measure]);
}

test('Peters\' test in the R export is the 1/n regression with Peters\' weights (= meta::metabias "Peters")', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  for (const demo of ['SGLT2_ACM', 'BINARY_RR', 'BINARY_RD', 'BCG']) {
    const g = await exportFor(page, demo, REF[demo].measure);
    expect(g.measure, demo).toBe(REF[demo].measure);
    expect(g.r, demo).toContain(CALL);
    expect(g.r, demo).not.toContain('predictor = "ni")');
    const ev = vec(g.r, 'ev'), ni = vec(g.r, 'ni'), yi = vec(g.r, 'yi');
    expect(ev, `${demo}: ev = total events`).toEqual(g.studies.map(s => s.events_t + s.events_c));
    expect(ni, `${demo}: ni = total n`).toEqual(g.studies.map(s => s.n_t + s.n_c));
    const t = slopeT(yi, ni.map(n => 1 / n), ev.map((S, i) => 1 / (1 / S + 1 / (ni[i] - S))));
    expect(Math.abs(t - REF[demo].meta.t), `${demo}: Peters t from the exported data vs meta::metabias`).toBeLessThan(1e-6);
    expect(Math.abs(REF[demo].export.t - REF[demo].meta.t)).toBeLessThan(1e-9);
  }
  // no binary counts: no Peters' test, and the script says why
  const md = await exportFor(page, 'BP_REDUCTION', null);
  expect(md.r).not.toContain('regtest(yi, vi = 1 / ev');
  expect(md.r).toContain("# Peters' test needs every study's binary counts");
  expect(md.r).toContain('peters <- NULL');
  expect(errors).toEqual([]);
});
