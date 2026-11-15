// hsroc page display contract (lane audit4). Drives the shipped hsroc/index.html script
// with the shared Reitsma engine and checks every displayed value the audit found wrong:
//   1. SROC AUC must be the engine's mada::AUC value (fit.auc.rg[0]), not the page's own
//      trapezoid over logit FPR in [-8, 8] (0.910 vs mada 0.9089).
//   2. The "Per study (Clopper-Pearson 95% CI)" table must show those CIs (R binom.test).
//   3. Below k = 4 the page shows a univariate DerSimonian-Laird fit (the shared engine fits
//      the bivariate model only for k >= 4); it must say so, and must not claim the
//      bivariate model is "not identifiable" there (mada::reitsma fits k = 3).
// References: R 4.6.0, mada 0.5.12 (lane audit4 run/cp.R, out/cp_R.txt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const EXAMPLE = 'Smith 2018, 80, 40, 20, 160\nJones 2019, 95, 5, 5, 95\nKhan 2020, 60, 30, 40, 170\nLee 2021, 88, 12, 12, 88\nPark 2022, 70, 50, 30, 150\nGarcia 2022, 92, 8, 8, 192\nAhmed 2023, 55, 45, 45, 155';
// binom.test(x, n)$conf.int : [Se lo, Se hi, Sp lo, Sp hi] per study
const CP = [[0.7081573109, 0.8733444479, 0.7377736354, 0.8531055118],
  [0.8871650889, 0.9835681208, 0.8871650889, 0.9835681208],
  [0.4972091504, 0.6967052313, 0.7928412963, 0.8964504765],
  [0.7997643164, 0.9364310974, 0.7997643164, 0.9364310974],
  [0.6001853238, 0.7875935795, 0.6840371667, 0.8083928304],
  [0.8484423641, 0.9648284375, 0.9227080318, 0.9825751910],
  [0.4472801888, 0.6496797708, 0.7107603940, 0.8308974529]];
const MADA_AUC = 0.9088861674;

function run(data) {
  const p = loadPage('hsroc/index.html', { shared: ['shared/dta-bivariate.js'], pick: s => s.includes('"hsroc-v1"') });
  p.ctx.__almRestore({ data, title: 't' });
  return p;
}

test('hsroc: SROC AUC shown is mada::AUC (engine fit.auc.rg[0]), not the page trapezoid', () => {
  const p = run(EXAMPLE);
  const summary = text(p.el('summary-wrap').innerHTML), chips = text(p.el('stats-wrap').innerHTML);
  const m = summary.match(/area under curve \(AUC\) (\d\.\d{3})/);
  assert.ok(m, 'AUC row missing: ' + summary);
  assert.equal(m[1], MADA_AUC.toFixed(3), `AUC row ${m[1]} vs mada ${MADA_AUC}`);
  assert.match(chips, new RegExp('SROC AUC ' + MADA_AUC.toFixed(3).replace('.', '\\.')));
  const r = p.ctx.__almResults();
  assert.ok(Math.abs(r.auc - MADA_AUC) < 1e-6, `exported auc ${r.auc}`);
});

test('hsroc: per-study table shows the Clopper-Pearson 95% CIs its heading promises (= R binom.test)', () => {
  const p = run(EXAMPLE);
  const r = p.ctx.__almResults();
  assert.equal(r.rows.length, 7);
  r.rows.forEach((row, i) => {
    const got = [row.Se_lo, row.Se_hi, row.Sp_lo, row.Sp_hi];
    got.forEach((g, j) => assert.ok(Math.abs(g - CP[i][j]) < 1e-8, `study ${i + 1} CI[${j}] ${g} vs R ${CP[i][j]}`));
  });
  const tbl = text(p.el('per-study-wrap').innerHTML);
  // Smith 2018: Se 80.0% (70.8-87.3), Sp 80.0% (73.8-85.3)
  assert.match(tbl, /Smith 2018 80\.0% \(70\.8.87\.3\) 80\.0% \(73\.8.85\.3\)/, tbl.slice(0, 300));
});

test('hsroc: Clopper-Pearson boundary cases x = 0 and x = n match binom.test', () => {
  const p = run('Z1, 0, 0, 10, 10\nZ2, 10, 10, 0, 0\nZ3, 5, 5, 5, 5\nZ4, 6, 4, 4, 6');
  const rows = p.ctx.__almResults().rows;
  assert.ok(Math.abs(rows[0].Se_lo - 0) < 1e-12 && Math.abs(rows[0].Se_hi - 0.3084971078) < 1e-8, JSON.stringify(rows[0]));
  assert.ok(Math.abs(rows[1].Se_lo - 0.6915028922) < 1e-8 && Math.abs(rows[1].Se_hi - 1) < 1e-12, JSON.stringify(rows[1]));
});

test('hsroc: k = 3 says which model is shown and does not claim the bivariate model is unidentifiable', () => {
  const p = run(EXAMPLE.split('\n').slice(0, 3).join('\n'));
  const all = text(p.el('summary-wrap').innerHTML) + ' ' + p.el('warn-banner').textContent;
  assert.match(all, /univariate DerSimonian-Laird/i, 'k=3 output must name the model actually fitted: ' + all);
  assert.match(all, /not the bivariate/i, all);
  assert.doesNotMatch(all, /bivariate convergence may fail/, 'k=3 never attempts the bivariate fit, so this warning is wrong');
  const r = p.ctx.__almResults();
  assert.equal(r.model, 'univariate-DL');
  const foot = text(p.html.match(/<p class="footer-note">([\s\S]*?)<\/p>/)[1]);
  assert.doesNotMatch(foot, /not identifiable/, 'footer must not say Sigma is not identifiable for k<4 (mada fits k=3)');
});

test('hsroc: k >= 4 reports the ML bivariate model', () => {
  const r = run(EXAMPLE).ctx.__almResults();
  assert.equal(r.model, 'bivariate-ML');
});

// Review of #589 (agy): at k = 3 the page still printed an AUC from the DL fallback's own
// symmetric curve (0.910) - a curve of a model mada does not fit, so the number has no R
// counterpart (mada::reitsma at k = 3 fits the bivariate model). It must be shown as not
// available, and the export must agree with the display.
// (The 1/99 divisor itself is mada's rule: mada:::AUC.default(function(x) rep(1, length(x)))
// = 0.989899, R 4.6.0 / mada 0.5.12, lane audit4 run/aucsrc.R.)
test('hsroc: k = 3 (DL fallback) shows no SROC AUC, and the export agrees', () => {
  const p = run(EXAMPLE.split('\n').slice(0, 3).join('\n'));
  const summary = text(p.el('summary-wrap').innerHTML), chips = text(p.el('stats-wrap').innerHTML);
  assert.match(summary, /SROC area under curve \(AUC\) not available/, summary);
  assert.doesNotMatch(summary, /\(AUC\) \d/, summary);
  assert.doesNotMatch(chips, /SROC AUC \d/, chips);
  assert.equal(p.ctx.__almResults().auc, null);
});
