'use strict';
// Duplicate tau^2 estimators that a user reaches outside runAnalysis() must give metafor's answer.
//   * Clustered-IPD panel (More > Clustered IPD, "Two-Stage (REML)"): runTwoStageIPD -> estimateTau2REML.
//     Its update was tau2 + sum w^2 (r^2 - v) / sum w^2, whose fixed point sum w^2 (r^2 - v) = 0 has no tau^2 in
//     the marginal variance (and no REML term), so tau^2 ran upwards to the iteration cap: survival 0.808 (R 0.0312),
//     and in small units it stopped at its DL start on an absolute 1e-8 step.  estimateTau2PM (same panel's PM
//     branch) stepped tau^2 by a fixed +0.01 / -0.005 from 0, so it returned a point of that grid (survival 0.025,
//     R 0.0244; x 1e4 units 1.0, R 2443912).
//   * Automatic model selection (runAutomaticModelSelection -> fitModelToStudies): estimateREML had the same update
//     from a fixed start of 0.1 (survival 0.593); estimatePM started at DL and set tau^2 = 0 whenever Q(DL) <= k - 1,
//     i.e. whenever PM < DL (survival 0, R 0.0244); estimateSJ returned the Hedges (HE) estimator, not
//     Sidik-Jonkman (survival 0.00386 = metafor HE; metafor SJ 0.0992).
// All now route to the estimators the P60 archive validates (MetaAnalysis._estimateTau2Fisher / _estimateTau2PM /
// _estimateTau2SJ). Reference: tau2_duplicates_reference.R (metafor 5.2.1, tight control) -> _reference.json.
//   node dev/tests/tau2_duplicates.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'tau2_duplicates_reference.json'), 'utf8'));
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  [' + detail + ']'); };
// tau^2 to 1e-6 of max(tau^2, mean vi) (scale-free; a boundary tau^2 near 0 is judged on the vi scale);
// the pooled estimate to 1e-6 of max(|mu|, se).
const okTau = (a, r, vbar) => Number.isFinite(a) && Math.abs(a - r) <= 1e-6 * Math.max(r, vbar);
const okMu = (a, r, se) => Number.isFinite(a) && Math.abs(a - r) <= 1e-6 * Math.max(Math.abs(r), se);

for (const r of REF.sets) {
  sandbox.__y = r.yi; sandbox.__v = r.vi;
  const vbar = r.vi.reduce((s, v) => s + v, 0) / r.vi.length;
  const a = run(`(function(){
    var st = __y.map(function(y, i){ return { yi: y, vi: __v[i] }; });
    var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; });
    var f = {}; ['DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); f[m] = { tau2: x.tau2, mu: x.effect }; });
    return { cDL: estimateTau2DL(st), cREML: estimateTau2REML(st), cPM: estimateTau2PM(st), auto: f };
  })()`);
  const lbl = r.name + ' (k=' + r.k + ')';
  check(lbl + ' clustered DL', okTau(a.cDL, r.DL.tau2, vbar), 'page ' + a.cDL + ' | R ' + r.DL.tau2);
  check(lbl + ' clustered REML', okTau(a.cREML, r.REML.tau2, vbar), 'page ' + a.cREML + ' | R ' + r.REML.tau2);
  check(lbl + ' clustered PM', okTau(a.cPM, r.PM.tau2, vbar), 'page ' + a.cPM + ' | R ' + r.PM.tau2);
  for (const m of ['DL', 'REML', 'PM', 'SJ']) {
    const x = a.auto[m];
    check(lbl + ' auto-selection ' + m + ' tau2 and estimate', okTau(x.tau2, r[m].tau2, vbar) && okMu(x.mu, r[m].mu, r[m].se),
      'page tau2 ' + x.tau2 + ' mu ' + x.mu + ' | R tau2 ' + r[m].tau2 + ' mu ' + r[m].mu);
  }
}

// End to end through the clustered-IPD panel's own two-stage function on individual rows.
sandbox.__rows = REF.ipd.rows;
const vbarI = REF.ipd.vi.reduce((s, v) => s + v, 0) / REF.ipd.vi.length;
for (const m of ['DL', 'REML', 'PM']) {
  const a = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', '${m}'); return { tau2: f.tau2, mu: f.pooled_effect, se: f.SE, k: f.n_studies }; })()`);
  const r = REF.ipd[m];
  check('clustered IPD rows (k=' + a.k + ') runTwoStageIPD ' + m, a.k === REF.ipd.yi.length && okTau(a.tau2, r.tau2, vbarI) && okMu(a.mu, r.mu, r.se) && Math.abs(a.se - r.se) <= 1e-6 * r.se,
    'page tau2 ' + a.tau2 + ' mu ' + a.mu + ' se ' + a.se + ' | R tau2 ' + r.tau2 + ' mu ' + r.mu + ' se ' + r.se);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
