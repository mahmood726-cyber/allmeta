'use strict';
// Every surface that labels I^2 next to a tau^2 method must say which I^2 it shows, and the wording must match the
// statistic that surface actually computes:
//   * model-selection table (fitModelToStudies) and clustered-IPD panel (runTwoStageIPD): the Higgins-Thompson
//     (Q - df) / Q from Cochran's Q for every method -> ipdI2Note().
//   * main analysis (results summary card, "Saved <method> fit" narrative): MetaAnalysis.fixedEffect gives the
//     Q-based I^2, but every random-effects method goes through _buildRandomResult, I^2 = tau^2 / (tau^2 + s^2) with
//     s^2 = df / C from that method's tau^2 (metafor's definition) -> ipdPooledI2Note(method). Review of PR #535: the
//     first version put the Q-based sentence on the main card too, where it was false (k=7: REML 41.96, PM 44.30,
//     SJ 53.76 = metafor; Q-based 42.57).
// The statistics are not changed.
//   node dev/tests/i2_wording.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };
const NOTE_Q = "I² is the Higgins-Thompson statistic from Cochran's Q, whatever the τ² estimator.";
const hasQ = (s) => typeof s === 'string' && s.includes(NOTE_Q);
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'tau2_duplicates_reference.json'), 'utf8'));

// (1) Clustered-IPD panel: I2 is (Q - df) / Q for REML and PM, and the panel says so.
sandbox.__rows = REF.ipd.rows;
for (const m of ['REML', 'PM']) {
  const a = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', '${m}'); return { Q: f.Q, I2: f.I2, df: f.Q_df }; })()`);
  check('clustered IPD ' + m + ': I2 is (Q - df) / Q', near(a.I2, Math.max(0, (a.Q - a.df) / a.Q) * 100), JSON.stringify(a));
}
{
  const html = run(`(function(){ var f = runTwoStageIPD(__rows, 'y', 'treat', 'study', 'REML'); return formatClusteredIPDResults(f, calculateICC(__rows, 'y', 'study')); })()`);
  check('clustered-IPD panel: states the Q-based I2', hasQ(html), String(html).slice(0, 200));
}

// (2) Model selection: I2 is (Q - df) / Q for every method, and the table says so.
const set = REF.sets.find(s => s.name === 'survival');
sandbox.__y = set.yi; sandbox.__v = set.vi;
{
  const fits = run(`(function(){ var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; }); var o = {};
    ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); o[m] = { I2: x.I2, Q: x.Q }; }); return o; })()`);
  const k = set.yi.length;
  check('model selection: I2 is (Q - df) / Q for FE, DL, REML, PM, SJ', Object.values(fits).every(f => near(f.I2, Math.max(0, (f.Q - (k - 1)) / f.Q) * 100)), JSON.stringify(fits));
  run(`window.__els = []; document.createElement = function (t) { var o = { tagName: t, style: {}, className: '', innerHTML: '' }; __els.push(o); return o; };
       document.body.appendChild = function (x) { return x; };`);
  run(`(function(){ var ss = __y.map(function(y, i){ return { effect: y, se: Math.sqrt(__v[i]) }; });
    var models = {}; ['FE', 'DL', 'REML', 'PM', 'SJ'].forEach(function(m){ var x = fitModelToStudies(ss, m); models[m] = { name: getModelName(m), cvMSE: 1, cvRMSE: 1, aic: x.aic, bic: x.bic, tau2: x.tau2, I2: x.I2, pooled: x.effect, se: x.se }; });
    APP.config = APP.config || {}; APP.config.outcomeType = 'continuous';
    displayModelSelectionResults({ models: models, bestByCV: 'REML' }); })()`);
  const html = run(`__els.map(function (e) { return e.innerHTML; }).join('\\n')`);
  check('model-selection table: states the Q-based I2', hasQ(html), String(html).slice(0, 300));
}

// (3) Main analysis: the I2 each method returns, and the sentence shown for that method.
{
  const fn = { FE: 'fixedEffect', DL: 'randomEffectsDL', REML: 'randomEffectsREML', PM: 'randomEffectsPM', SJ: 'randomEffectsSJ', HE: 'randomEffectsHE', ML: 'randomEffectsML' };
  const k = set.yi.length;
  for (const [m, f] of Object.entries(fn)) {
    const r = run(`(function(){ var r = MetaAnalysis.${f}(__y, __v); var fe = MetaAnalysis._prepareFE(__y, __v);
      return { I2: r.I2, tau2: r.tau2, Q: fe.Q, C: fe.C, note: typeof ipdPooledI2Note === 'function' ? ipdPooledI2Note('${m}') : null }; })()`);
    const qBased = Math.max(0, (r.Q - (k - 1)) / r.Q) * 100;
    const tBased = r.tau2 > 0 ? 100 * r.tau2 / (r.tau2 + (k - 1) / r.C) : 0;
    if (m === 'FE') {
      check('main analysis FE: I2 is Q-based and the note says Cochran\'s Q', near(r.I2, qBased) && typeof r.note === 'string' && /Cochran's Q/.test(r.note) && !/whatever/.test(r.note) && !/τ²\s*\//.test(r.note), JSON.stringify(r));
    } else {
      check('main analysis ' + m + ': I2 is tau2-based (metafor) and the note says so, naming ' + m, near(r.I2, tBased) && typeof r.note === 'string' &&
        /τ²\s*\/\s*\(τ²\s*\+\s*s²\)/.test(r.note) && r.note.includes(m) && !/Cochran's Q, whatever/.test(r.note), JSON.stringify(r) + ' Q-based ' + qBased);
    }
  }
  // the card and the narrative must use the per-method note, never the Q-based one
  const src = fs.readFileSync(pageFile, 'utf8');
  for (const fnName of ['renderAnalysisSummaryCard', 'renderIPDFittedNarratives']) {
    const i = src.indexOf('function ' + fnName + '('), j = src.indexOf('\nfunction ', i + 10);
    const body = src.slice(i, j);
    check(fnName + ': shows ipdPooledI2Note(method), not the Q-based note', i >= 0 && /ipdPooledI2Note\(/.test(body) && !/ipdI2Note\(\)/.test(body) && !body.includes(NOTE_Q), 'body length ' + body.length);
  }
  check('ipdI2Note() returns the Q-based wording', run(`typeof ipdI2Note === 'function' ? ipdI2Note() : null`) === NOTE_Q, String(run(`typeof ipdI2Note === 'function' ? ipdI2Note() : null`)));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
