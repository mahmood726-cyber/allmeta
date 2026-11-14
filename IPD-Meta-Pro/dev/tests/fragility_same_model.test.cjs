'use strict';
// More > Fragility Index must re-pool the shifted studies with the SAME model as the main analysis.
// Root cause (5f0e6ae9): calculateFragilityIndex compared the main analysis' verdict (APP.results.pooled.pValue, e.g.
// REML + HKSJ) with a fixed-effect inverse-variance z-test of the shifted studies (recalculatePooledSimple). When the
// two models disagree on the unshifted studies (Lung Cancer (IO): REML + HKSJ not significant, fixed effect
// significant) the very first 0.05 step already "changes the verdict", so every study's index was 1: the index
// measured the change of model, not the shift. The search now re-pools with the analysis' own estimator and HKSJ
// setting (APP.analysisSettings, as the study diagnostics do), and refuses, with a notice, when that model does not
// reproduce the saved main result (pooled estimate and p within 1e-7).
// Reference: fragility_same_model_reference.R (R 4.6.0, metafor rma; HKSJ as the page applies it). Scenarios: A REML +
// HKSJ not significant while fixed effect is (old search: 1 for 11 of 12 studies); C REML + HKSJ significant; B DL.
//   node dev/tests/fragility_same_model.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./fragility_same_model_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

run(`window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {}; setTimeout = function (f) { f(); return 0; };
  window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };`);
const setup = (sc, settings, pooled) => {
  sandbox.__st = sc.rows.map(r => ({ study: r.study, effect: r.yi, variance: r.vi, se: Math.sqrt(r.vi), n: r.n, events: r.events }));
  sandbox.__set = settings; sandbox.__pooled = pooled;
  run(`__m.length = 0; __notes.length = 0; APP.config.outcomeType = 'survival'; APP.analysisSettings = __set;
    APP.results = { studies: __st, pooled: __pooled }; calculateFragilityIndex();`);
  return { text: run('__m.join("")').replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' '), notes: run('__notes.join(" | ")') };
};
const shown = (text, rows) => rows.map(r => { const m = text.match(new RegExp(r.study + '(?: \\(most fragile\\))? ' + r.n + ' \\S+ (\\d+|>50)(?= |$)')); return m ? m[1] : null; });
for (const name of ['A', 'C', 'B']) {
  const sc = ref[name];
  const settings = { reMethod: sc.method, useHKSJ: sc.hksj, outcomeType: 'survival', confLevel: 0.95 };
  // the page's own refit of the unshifted studies equals R's main analysis
  sandbox.__y = sc.rows.map(r => r.yi); sandbox.__v = sc.rows.map(r => r.vi); sandbox.__set = settings;
  const fit = run(`typeof ipdRepoolLikeMain === 'function' ? ipdRepoolLikeMain(__y.map(function (y, i) { return { effect: y, variance: __v[i] }; }), __set) : null`);
  check(name + ' (' + sc.method + (sc.hksj ? ' + HKSJ' : '') + '): page re-pool = R main analysis (estimate ' + sc.main.pooled.toFixed(6) + ', p ' + sc.main.p.toPrecision(6) + ')',
    fit && near(fit.pooled, sc.main.pooled, 1e-7) && near(fit.pValue, sc.main.p, 1e-7), JSON.stringify(fit));
  const { text, notes } = setup(sc, settings, { pooled: sc.main.pooled, pValue: sc.main.p });
  const want = sc.index.map(i => i ? String(i) : '>50');
  check(name + ': indices = R search with the same model ' + JSON.stringify(want), JSON.stringify(shown(text, sc.rows)) === JSON.stringify(want), JSON.stringify(shown(text, sc.rows)) + ' | ' + notes + ' | ' + text.slice(0, 300));
  check(name + ': the modal names the re-pool model', new RegExp("re-pooled with the main analysis' model \\(" + (sc.method === 'REML' ? 'REML random-effects' : 'DerSimonian-Laird random-effects') + (sc.hksj ? ' with the Hartung-Knapp' : ' \\(z-test\\)')).test(text), text.slice(0, 600));
  if (name === 'A') check('A: the old fixed-effect search would have given 1 for 11 of 12 studies (reference sanity)', sc.index_fixed_effect_z.filter(i => i === 1).length === 11, JSON.stringify(sc.index_fixed_effect_z));
}
{
  // saved results that the recorded settings cannot reproduce: refused with a notice, no index
  const sc = ref.C;
  const { text, notes } = setup(sc, { reMethod: 'FE', useHKSJ: false, outcomeType: 'survival' }, { pooled: sc.main.pooled, pValue: sc.main.p });
  check('settings that do not reproduce the saved result: refused, no index shown', text === '' && /could not be reproduced/.test(notes), notes + ' | ' + text.slice(0, 200));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
