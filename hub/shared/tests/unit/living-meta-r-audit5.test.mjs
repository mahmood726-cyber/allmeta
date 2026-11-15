// living-meta (living-meta-complete.html) against R (lane audit5).
// References: R 4.6.0, metafor 5.2.1, metadat 1.6.0 -- fixtures/living-meta-validation-metafor-audit5.R
// writes fixtures/living-meta-validation-metafor-audit5.json and prints the Begg / trim-and-fill values
// pinned below.
// Defects found on origin/main bb84daed (real Chrome, #/project/x/analysis -> Run Analysis, #/validation):
//  1. The demo "BCG Vaccine (dat.bcg)" data were not dat.bcg: 6 of 13 yi and every vi differ from
//     escalc("RR", dat.bcg). The page showed pooled -0.6929, tau2 0.5869, Q 354.14, RR 0.50 [0.33, 0.77];
//     metafor on dat.bcg: -0.7145, 0.3133, 152.23, RR 0.49 [0.34, 0.70].
//  2. The validation "expected" values were the page's own output ("Values computed by this
//     implementation"), shown as "validated against R metafor 4.4-0"; magnesium/heterogeneous "REML"
//     expectations were the DL values, and #/validation crashed ("Cannot read properties of null").
//  3. beggTest ranked raw residuals (yi - thetaFE) instead of the standardised deviates metafor's
//     ranktest uses: tau -0.1795 vs 0.0256 on dat.bcg.
//  4. trimAndFill's default "L0" was a count of positive minus negative deviations, not Duval & Tweedie's
//     L0, and "R0" used the L0 formula: k0 = 0 where metafor trimfill(side = "right") finds 1 on dat.bcg.
//  5. The REML/ML/PM/... I^2 was the Q-based (Q - df)/Q, not metafor's tau2-based I^2 (92.10 vs 92.21).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage, text } from './helpers/page-vm.mjs';

const R = JSON.parse(readFileSync(new URL('./fixtures/living-meta-validation-metafor-audit5.json', import.meta.url), 'utf8'));
// escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg), sprintf("%.4f")
const BCG_YI = [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120, -0.4694, -1.3713, -0.3394, 0.4459, -0.0173];
const BCG_VI = [0.3256, 0.1946, 0.4154, 0.0200, 0.0512, 0.0069, 0.2230, 0.0040, 0.0564, 0.0730, 0.0124, 0.5325, 0.0714];

function page() { return loadPage('living-meta/living-meta-complete.html', { shared: ['shared/ma-core.js', 'shared/upper-tail.js'] }); }
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: page ${a}, R ${b}`);

test('living-meta: the demo dataset is metadat::dat.bcg (log RR, 4 dp)', () => {
  const L = page().ctx.LMA;
  assert.deepEqual([...L.VALIDATION_DATASETS.bcg.yi], BCG_YI);
  assert.deepEqual([...L.VALIDATION_DATASETS.bcg.vi], BCG_VI);
});

test('living-meta: Run Analysis shows the metafor numbers for dat.bcg', () => {
  const p = page();
  p.ctx.LMA.runDemoAnalysis();
  const t = text(p.el('demo-results').innerHTML);
  // rma(yi, vi, method = "REML"): -0.7145343 [-1.066902, -0.3621663], se 0.1797829, tau2 0.3132528,
  // I2 92.20865, QE 151.8149 (p 2.4e-26)
  for (const s of ['Pooled estimate (log RR) -0.7145', '95% CI [-1.0669, -0.3622]', 'Standard error 0.1798',
    'τ² (between-study variance) 0.3133', 'I² (heterogeneity) 92.2%', 'Q statistic (df=12) 151.81, p < 0.001',
    // regtest(model = "lm"): intercept -2.1000102, p 0.1914397
    "Egger's test intercept -2.1000 (p=0.1914)",
    // ranktest(exact = FALSE): tau 0.02564103, p 0.9028849
    "Begg's tau 0.0256 (p=0.9029",
    // trimfill(rma(method = "REML"), side = "right", estimator = "L0"): k0 1, estimate -0.6570826
    'k₀ (L0, right side, REML) 1 studies imputed', 'Adjusted estimate -0.6571',
    'RR = 0.49, 95% CI: 0.34-0.70']) assert.ok(t.includes(s), `missing "${s}" in: ${t}`);
});

test('living-meta: Begg rank correlation matches metafor ranktest(exact = FALSE), with and without ties', () => {
  const L = page().ctx.LMA;
  let b = L.beggTest(BCG_YI, BCG_VI);
  near(b.tau, 0.0256410256, 1e-9, 'tau dat.bcg');
  near(b.pvalue, 0.9028849409, 1e-8, 'p dat.bcg');
  b = L.beggTest([0.1, 0.3, 0.3, 0.5, 0.2, 0.4], [0.04, 0.04, 0.09, 0.09, 0.16, 0.01]);
  near(b.tau, -0.2148344622, 1e-9, 'tau ties');
  near(b.pvalue, 0.5588080841, 1e-8, 'p ties');
});

test('living-meta: trim and fill matches metafor trimfill (L0/R0, both sides, DL/REML)', () => {
  const L = page().ctx.LMA;
  const mag = L.VALIDATION_DATASETS.magnesium;
  const cases = [
    // [data, method, estimator, side, k0, estimate]  (trimfill(rma(yi, vi, method), estimator, side))
    ['bcg', 'DL', 'L0', 'right', 1, -0.6560545784], ['bcg', 'DL', 'L0', 'left', 0, -0.7140842184],
    ['bcg', 'DL', 'R0', 'right', 0, -0.7140842184], ['bcg', 'DL', 'R0', 'left', 0, -0.7140842184],
    ['bcg', 'REML', 'L0', 'right', 1, -0.6570826440], ['bcg', 'REML', 'L0', 'left', 0, -0.7145342733],
    ['bcg', 'REML', 'R0', 'right', 0, -0.7145342733],
    ['mag', 'DL', 'L0', 'right', 6, -0.0595343962], ['mag', 'DL', 'L0', 'left', 0, -0.0915990330],
    ['mag', 'DL', 'R0', 'right', 8, -0.0356654132], ['mag', 'REML', 'L0', 'right', 6, -0.0526405463],
    ['mag', 'REML', 'R0', 'right', 8, -0.0331074975], ['mag', 'REML', 'R0', 'left', 0, -0.1003070094],
  ];
  for (const [d, method, estimator, side, k0, est] of cases) {
    const [yi, vi] = d === 'bcg' ? [BCG_YI, BCG_VI] : [mag.yi, mag.vi];
    const r = L.trimAndFill(yi, vi, { method, estimator, side });
    const what = `${d} ${method} ${estimator} ${side}`;
    assert.equal(r.k0, k0, `${what}: k0 ${r.k0}, R ${k0}`);
    assert.equal(r.k_filled, yi.length + k0, `${what}: filled`);
    // REML: metafor stops at a tau2 change < 1e-5 (default threshold); on 'mag' its estimate is 1.2e-5 from
    // the converged value (control = list(threshold = 1e-12) gives -0.1002945, as this page does).
    near(r.estimate_adjusted, est, method === 'REML' ? 5e-5 : 1e-8, what);
  }
});

test('living-meta: the validation report compares with metafor values and renders', () => {
  const L = page().ctx.LMA;
  for (const [nm, ds] of Object.entries(L.VALIDATION_DATASETS)) {
    for (const m of ['REML', 'DL', 'FE']) {
      const e = ds.expected[m], r = R[nm] && R[nm][m];
      assert.ok(e && r, `${nm} ${m}: expected values present`);
      for (const f of ['estimate', 'se', 'tau2', 'Q']) near(e[f], r[f], 1e-9, `${nm} ${m} ${f} expected vs metafor`);
      if (!(nm === 'single' && m !== 'DL')) near(e.I2, r.I2, 1e-9, `${nm} ${m} I2 expected vs metafor`);
    }
  }
  const v = L.runValidation();
  const failed = v.datasets.flatMap(d => Object.entries(d.methods).filter(([, x]) => !x.allPass).map(([m]) => d.name + ' ' + m));
  assert.equal(failed.length, 0, 'every comparison passes at the page tolerance: ' + failed.join(', '));
  let html;
  assert.doesNotThrow(() => { html = L.renderValidationPage(); });
  assert.match(text(html), /VALIDATED/);
  assert.match(text(html), /metafor 5\.2\.1/);
  assert.doesNotMatch(text(html), /4\.4-0/);
});

test('living-meta: REML I2 is metafor\'s tau2-based I2; DL keeps (Q - df) / Q, which equals it', () => {
  const L = page().ctx.LMA;
  near(L.metaAnalysis(BCG_YI, BCG_VI, { method: 'REML' }).I2, R.bcg.REML.I2, 1e-4, 'REML I2');      // REML convergence
  near(L.metaAnalysis(BCG_YI, BCG_VI, { method: 'DL' }).I2, R.bcg.DL.I2, 1e-9, 'DL I2');
  const h = L.VALIDATION_DATASETS.heterogeneous;
  near(L.metaAnalysis(h.yi, h.vi, { method: 'REML' }).I2, R.heterogeneous.REML.I2, 1e-4, 'heterogeneous REML I2');
  near(L.metaAnalysis(BCG_YI, BCG_VI, { method: 'REML' }).I2_Q, (R.bcg.REML.Q - 12) / R.bcg.REML.Q * 100, 1e-9, 'Q-based I2 kept as I2_Q');
});
