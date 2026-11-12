'use strict';
// The page computes I^2 as the Higgins-Thompson statistic from Cochran's Q, (Q - df) / Q, whatever the tau^2 estimator
// (MetaAnalysis I2Q, runTwoStageIPD, fitModelToStudies). metafor reports I^2 = tau^2 / (tau^2 + s^2) from the fitted
// tau^2, so for REML/PM the two differ (clustered example: page 69.15%, metafor REML 67.1%), and the model-selection
// table shows one I2 for every estimator. The statistic is not changed; wherever I^2 is shown next to a tau^2 method,
// the page must say which I^2 it is.
//   node dev/tests/i2_wording.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };
const NOTE = "I² is the Higgins-Thompson statistic from Cochran's Q, whatever the τ² estimator.";
const has = (s) => typeof s === 'string' && s.includes(NOTE);

// The statistic itself is unchanged: the clustered-IPD I2 is still (Q - df) / Q for REML and PM.
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'tau2_duplicates_reference.json'), 'utf8'));
sandbox.__rows = REF.ipd.rows;
for (const m of ['REML', 'PM']) {
  const a = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', '${m}'); return { Q: f.Q, I2: f.I2, df: f.Q_df }; })()`);
  check('clustered IPD ' + m + ': I2 is still (Q - df) / Q', Math.abs(a.I2 - Math.max(0, (a.Q - a.df) / a.Q) * 100) < 1e-9, JSON.stringify(a));
}

// (1) Clustered-IPD panel (More > Clustered IPD): heterogeneity table under the method name.
{
  const html = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', 'REML'); return formatClusteredIPDResults(f, calculateICC(__rows, 'y', 'study')); })()`);
  check('clustered-IPD panel: heterogeneity table states which I2', has(html), String(html).slice(0, 200));
}

// (2) Automatic model selection table (one I2 column for FE / DL / REML / PM / SJ).
{
  run(`window.__els = []; document.createElement = function (t) { var o = { tagName: t, style: {}, className: '', innerHTML: '' }; __els.push(o); return o; };
       document.body.appendChild = function (x) { return x; };`);
  sandbox.__y = REF.sets[0].yi; sandbox.__v = REF.sets[0].vi;
  run(`(function(){ var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; });
    var models = {}; ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); models[m] = { name: getModelName(m), cvMSE: 1, cvRMSE: 1, aic: x.aic, bic: x.bic, tau2: x.tau2, I2: x.I2, pooled: x.effect, se: x.se }; });
    APP.config = APP.config || {}; APP.config.outcomeType = 'continuous';
    displayModelSelectionResults({ models: models, bestByCV: 'REML' }); })()`);
  const html = run(`__els.map(function (e) { return e.innerHTML; }).join('\\n')`);
  check('model-selection table: states which I2 (the column is the same for every method)', has(html) && /<th>I2<\/th>|<th[^>]*>I2/.test(html), String(html).slice(0, 300));
}

// (3) Results summary card (I2 beside tau2 and "Method: REML") and (4) the heterogeneity narrative ("Saved REML fit").
{
  const src = fs.readFileSync(pageFile, 'utf8');
  const card = src.slice(src.indexOf('function renderAnalysisSummaryCard('), src.indexOf('function renderAnalysisSummaryCard(') + 6000);
  check('results summary card: states which I2 next to the method', card.includes(NOTE) || /ipdI2Note\(\)/.test(card), 'not in renderAnalysisSummaryCard');
  const narr = src.slice(src.indexOf('function renderIPDFittedNarratives('), src.indexOf('function renderIPDFittedNarratives(') + 2500);
  check('heterogeneity narrative ("Saved <method> fit: I2 = ..."): states which I2', narr.includes(NOTE) || /ipdI2Note\(\)/.test(narr), 'not in renderIPDFittedNarratives');
  check('ipdI2Note() returns the wording', run(`typeof ipdI2Note === 'function' ? ipdI2Note() : null`) === NOTE, String(run(`typeof ipdI2Note === 'function' ? ipdI2Note() : null`)));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
