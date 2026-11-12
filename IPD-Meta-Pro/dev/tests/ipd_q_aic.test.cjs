'use strict';
// (1) Clustered-IPD panel (More > Clustered IPD, two-stage): Q was sum (1/v_i)(y_i - mu_RE)^2, centred on the
//     random-effects pooled estimate, so Q (and the I^2 and p-value from it) changed with the tau^2 method and was never
//     Cochran's Q: uploaded IPD rows (k = 7) gave Q 19.59 (REML) / 19.60 (DL), I^2 69.4%; metafor QE 19.4514, I^2 69.15%.
// (2) Automatic model selection (fitModelToStudies): logLik was -1/2 (k log 2 pi + Q) with the FE Q for every method:
//     no log(v_i + tau^2) term and no tau^2 in the residuals, so DL, REML, PM and SJ always had the same AIC and BIC
//     (FE + 2) and the page's "has lowest AIC" note could never pick a random-effects model. The log-likelihood is now
//     metafor's fit.stats "ML" one at each method's (mu, tau^2), and the page says what AIC can and cannot decide here.
// Reference: ipd_q_aic_reference.R (metafor 5.2.1) -> ipd_q_aic_reference.json.
//   node dev/tests/ipd_q_aic.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ipd_q_aic_reference.json'), 'utf8'));
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  [' + detail + ']'); };
const rel = (a, r, tol) => Number.isFinite(a) && Math.abs(a - r) <= tol * Math.max(1, Math.abs(r));

// (1) runTwoStageIPD end to end on the 256 IPD rows, every tau^2 method of the panel.
sandbox.__rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'tau2_duplicates_reference.json'), 'utf8')).ipd.rows;
for (const m of ['DL', 'REML', 'PM']) {
  const a = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', '${m}'); return { Q: f.Q, I2: f.I2, p: f.Q_pvalue, tau2: f.tau2 }; })()`);
  check('clustered IPD (k=7) runTwoStageIPD ' + m + ': Q = metafor QE, I2 = Higgins I2 from QE, p from QE',
    rel(a.Q, REF.ipd.QE, 1e-9) && rel(a.I2, REF.ipd.I2, 1e-9) && rel(a.p, REF.ipd.QEp, 1e-7) && rel(a.tau2, REF.ipd[m].tau2, 1e-6),
    'page Q ' + a.Q + ' I2 ' + a.I2 + ' p ' + a.p + ' tau2 ' + a.tau2 + ' | R QE ' + REF.ipd.QE + ' I2 ' + REF.ipd.I2 + ' p ' + REF.ipd.QEp + ' tau2 ' + REF.ipd[m].tau2);
}

// (2) fitModelToStudies: log-likelihood, AIC and BIC per method against metafor fit.stats "ML".
for (const r of REF.sets) {
  sandbox.__y = r.yi; sandbox.__v = r.vi;
  const f = run(`(function(){ var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; });
    var o = {}; ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); o[m] = { ll: x.logLik, aic: x.aic, bic: x.bic, tau2: x.tau2 }; }); return o; })()`);
  for (const m of ['FE', 'DL', 'REML', 'PM', 'SJ']) {
    const x = f[m], R = r[m];
    check(r.name + ' (k=' + r.k + ') ' + m + ' logLik / AIC / BIC = metafor fit.stats ML',
      rel(x.ll, R.ll, 1e-7) && rel(x.aic, R.AIC, 1e-7) && rel(x.bic, R.BIC, 1e-7),
      'page ll ' + x.ll + ' AIC ' + x.aic + ' BIC ' + x.bic + ' | R ll ' + R.ll + ' AIC ' + R.AIC + ' BIC ' + R.BIC);
  }
}

// (2b) What the page says about AIC. FE vs random effects is a comparison of two models and AIC may decide it; between
// the four tau^2 estimators it may not (one model, the same two parameters: the AIC only measures how close each tau^2
// is to the ML estimate, and the ML estimator, not offered, would always win). On BCG, RE beats FE by 113 AIC units.
{
  const r = REF.sets.find(s => s.name === 'bcg');
  sandbox.__y = r.yi; sandbox.__v = r.vi;
  const note = run(`(function(){ var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; });
    var models = {}; ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); models[m] = { name: getModelName(m), aic: x.aic, bic: x.bic, cvMSE: 1 }; });
    return typeof modelSelectionAICNote === 'function' ? modelSelectionAICNote(models) : null; })()`);
  check('model-selection note: AIC compares fixed vs random effects (BCG: random effects favoured)',
    typeof note === 'string' && /random-effects/i.test(note) && /favou?rs/i.test(note) && /113\.\d/.test(note), String(note));
  check('model-selection note: says AIC does not rank the tau^2 estimators',
    typeof note === 'string' && /not rank|does not choose|cannot choose/i.test(note) && /DL, REML, PM and SJ/.test(note), String(note));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
