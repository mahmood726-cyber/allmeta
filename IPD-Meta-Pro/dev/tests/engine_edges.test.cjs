'use strict';
// Review of PR #535, two engine edge cases.
// MINOR-4: with one study I^2 is not defined (metafor/meta: NA). MetaAnalysis._prepareFE returned I2Q = 0 (H2Q = 1)
//   for df = 0, and _buildRandomResult returned I2 = 0, so FE/DL/REML/PM/SJ/HE/ML all reported I^2 = 0% at k = 1.
//   The earlier k = 1 fix sat in calculateI2WithCI, which the shipped page never calls.
// MINOR-5: fitModelToStudies returned early, without aic/bic/logLik, when the random-effects total weight was below an
//   ABSOLUTE 1e-10 -- e.g. two studies 0 and 1e6 with v = 1e-6 (tau^2 about 5e11, total weight 4e-12) -- so the effect
//   was NaN and the model-selection table crashed on r.aic.toFixed. The check is now "total weight not positive and
//   finite", which does not depend on the units of the data.
//   node dev/tests/engine_edges.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };

// MINOR-4
for (const f of ['fixedEffect', 'randomEffectsDL', 'randomEffectsREML', 'randomEffectsPM', 'randomEffectsSJ', 'randomEffectsHE', 'randomEffectsML']) {
  const r = run(`(function(){ var r = MetaAnalysis.${f}([0.4], [0.02]); return { I2: r.I2, H2: r.H2, pooled: r.pooled, se: r.se }; })()`);
  check('k=1 MetaAnalysis.' + f + ': I2 and H2 not estimable (NaN), estimate still the study', r.I2 !== 0 && !Number.isFinite(r.I2) && !Number.isFinite(r.H2) && Math.abs(r.pooled - 0.4) < 1e-12 && Math.abs(r.se - Math.sqrt(0.02)) < 1e-12, JSON.stringify(r));
}
// and k = 2 is unchanged (defined)
{
  const r = run(`MetaAnalysis.randomEffectsREML([0.1, 0.9], [0.02, 0.03])`);
  check('k=2 REML I2 still a finite number', Number.isFinite(r.I2), JSON.stringify(r.I2));
}

// MINOR-5
{
  const r = run(`(function(){ var ss = [{ effect: 0, se: 1e-3 }, { effect: 1e6, se: 1e-3 }]; var o = {};
    ['DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); o[m] = { tau2: x.tau2, effect: x.effect, aic: x.aic, bic: x.bic }; }); return o; })()`);
  for (const m of ['DL', 'REML', 'PM', 'SJ']) {
    const x = r[m];
    check('fitModelToStudies ' + m + ' with tau2 ~5e11: effect 5e5 and finite AIC/BIC', Math.abs(x.effect - 5e5) <= 1e-6 * 5e5 && Number.isFinite(x.aic) && Number.isFinite(x.bic), JSON.stringify(x));
  }
  run(`window.__els = []; document.createElement = function (t) { var o = { tagName: t, style: {}, className: '', innerHTML: '' }; __els.push(o); return o; };
       document.body.appendChild = function (x) { return x; }; APP.config = APP.config || {}; APP.config.outcomeType = 'continuous';`);
  let err = null;
  try {
    run(`(function(){ var ss = [{ effect: 0, se: 1e-3 }, { effect: 1e6, se: 1e-3 }]; var models = {};
      ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); models[m] = { name: getModelName(m), cvMSE: 1, cvRMSE: 1, aic: x.aic, bic: x.bic, tau2: x.tau2, I2: x.I2, pooled: x.effect, se: x.se }; });
      displayModelSelectionResults({ models: models, bestByCV: 'FE' }); })()`);
  } catch (e) { err = String(e && e.message || e); }
  check('model-selection table renders for that data (no .toFixed of undefined)', err === null, String(err));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
