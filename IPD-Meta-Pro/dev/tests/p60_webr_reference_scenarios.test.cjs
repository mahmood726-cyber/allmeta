'use strict';
// The in-page "Live WebR Validation" panel (Help > Statistical Validation) must not report FAIL
// when the page is right. This runs the panel's own reference scenarios (BCG) exactly as the
// panel does -- getJSValues() against the R code from getRCode(), under the scenario's own
// tolerances -- but in desktop R instead of WebR.
//   node dev/tests/p60_webr_reference_scenarios.test.cjs [path/to/ipd-meta-pro.html]
// Needs Rscript with metafor (RSCRIPT env var or Rscript on PATH). Without R it prints
// SKIPPED and exits 2: a check that did not run is not a pass.
// Found 2026-11-12 (lane rd5, real Chrome on the live page): "BCG - REML" FAILed because the
// panel's expected REML values were not R's (tau2 0.3361 vs metafor 0.3706; its estimate and
// I2 were the DL ones), and "BCG - Prediction Interval" FAILed because the panel's R code used
// metafor's default z-based predict() while the page (and the P60 archive oracle) use t(k-1).
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { loadPage } = require('./p60_page_loader.cjs');

const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const RSCRIPT = process.env.RSCRIPT || 'Rscript';
const { sandbox, run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const internals = sandbox._webrInternals;
if (!internals || typeof internals.getScenarios !== 'function') { console.log('FAIL _webrInternals.getScenarios missing'); process.exit(1); }
// Run scenarios the way the panel does: R code -> values (a length-1 vector becomes a number,
// anything else stays an array, as extractRValues leaves it), then the panel's own compareResults.
function runScenarios(list, tag) {
  const lines = ['suppressMessages(library(metafor)); suppressMessages(library(jsonlite))', 'out <- list()'];
  const ran = [];
  for (const sc of list) {
    const code = sc.getRCode();
    if (!code) { console.log('SKIP ' + tag + sc.label + ' (the panel skips it: no R code)'); continue; }
    ran.push(sc);
    lines.push('out[[' + JSON.stringify(sc.id) + ']] <- lapply(local({', code, '}), function(v) if (is.null(v)) NA else as.numeric(v))');
  }
  lines.push('cat(toJSON(out, digits = NA, auto_unbox = FALSE, na = "null"))');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p60webr-'));
  const rf = path.join(tmp, 'scen.R');
  fs.writeFileSync(rf, lines.join(String.fromCharCode(10)));
  let rOut;
  try {
    rOut = JSON.parse(execFileSync(RSCRIPT, ['--vanilla', rf], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    console.log('SKIPPED: could not run R (' + String(e.message).split(String.fromCharCode(10))[0] + ')');
    process.exit(2);
  }
  for (const sc of ran) {
    const r = {};
    for (const [k, v] of Object.entries(rOut[sc.id] || {})) r[k] = Array.isArray(v) && v.length === 1 ? v[0] : v;
    const rows = internals.compareResults(sc.getJSValues(), r, sc.tolerances || {}, sc.transform || null);
    const cmp = rows.filter((x) => x.pass !== null);
    const bad = cmp.filter((x) => x.pass !== true).map((x) => x.label + ' js ' + x.js + ' R ' + JSON.stringify(x.r));
    check(tag + sc.label + ' (' + cmp.length + ' compared)', bad.length === 0, bad.join('; '));
  }
}
const ref = internals.getScenarios().filter((s) => s.source === 'reference' && s.tier === 'A');
check('reference tier-A scenarios found', ref.length >= 8, String(ref.length));
runScenarios(ref, '');

// Current-analysis scenarios after a two-stage binary analysis (8 studies), as a user runs them
// from "Validate Current Analysis": REML without HKSJ, and FE with HKSJ (the SGLT2 example's
// setting), on a heterogeneous set and on a homogeneous one (Q < k - 1, where the page's HKSJ
// floor max(1, q) -- metafor test = "adhoc" -- differs from test = "knha").
for (const [spread, tag0] of [[1.4, 'het'], [0.5, 'homog']]) {
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rows = [];
  for (let s = 0; s < 8; s++) {
    const n = 60 + Math.floor(rnd() * 80), pc = 0.15 + 0.25 * rnd(), lor = -0.35 + spread * (rnd() - 0.5);
    const pt = 1 / (1 + Math.exp(-(Math.log(pc / (1 - pc)) + lor)));
    for (let i = 0; i < n; i++) { rows.push({ study: 'S' + s, treatment: 1, event: rnd() < pt ? 1 : 0 }); rows.push({ study: 'S' + s, treatment: 0, event: rnd() < pc ? 1 : 0 }); }
  }
  const setField = (id, v) => { sandbox.document.getElementById(id).value = v; };
  const cur = internals.getScenarios().filter((s) => s.source === 'current' && s.tier === 'A');
  for (const [method, hksj] of [['REML', false], ['FE', true]]) {
    sandbox.__rows = rows;
    run('APP.data = __rows; APP.results = null; APP.analysisRunning = false;');
    setField('varStudy', 'study'); setField('varTreatment', 'treatment'); setField('varTime', ''); setField('varEvent', 'event');
    setField('outcomeType', 'binary'); setField('analysisApproach', 'two-stage'); setField('effectMeasure', 'OR');
    setField('reMethod', method); setField('confLevel', '0.95'); sandbox.document.getElementById('useHKSJ').checked = hksj;
    try { run('runAnalysis()'); } catch (e) { /* display code may throw after APP.results is set */ }
    const tag = tag0 + ' ' + method + (hksj ? '+HKSJ' : '');
    check('analysis ran (' + tag + ', Q ' + run('APP.results.pooled.Q').toFixed(2) + ' on 7 df)', !!run('APP.results && APP.results.pooled'));
    runScenarios(cur, '[' + tag + '] ');
    // The panel's "R Script Preview" / Download Report script: its prediction intervals must be the page's.
    const script = run('generateRScript()').replace(/^if \(!require\([^\n]*install\.packages[^\n]*$/gm, '');
    const sf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p60rs-')), 'script.R');
    fs.writeFileSync(sf, script);
    let txt = '';
    try { txt = execFileSync(RSCRIPT, ['--vanilla', sf], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { check('[' + tag + '] R script runs', false, String(e.message).slice(0, 200)); continue; }
    const pis = [...txt.matchAll(/^PI: \[\s*(\S+)\s*,\s*(\S*)\s*\]/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    const refPI = ref.find((s) => s.id === 'ref_pi').getJSValues();
    check('[' + tag + '] R script BCG PI = page PI (1e-4)', pis.length >= 1 && Math.abs(pis[0][0] - refPI.pi_lower) < 1e-4 && Math.abs(pis[0][1] - refPI.pi_upper) < 1e-4, JSON.stringify(pis[0]) + ' page ' + JSON.stringify(refPI));
    if (method !== 'FE') {
      const curPI = cur.find((s) => s.id === 'cur_pi').getJSValues();
      check('[' + tag + '] R script current PI = page PI (1e-4)', pis.length >= 2 && Math.abs(pis[1][0] - curPI.pi_lower) < 1e-4 && Math.abs(pis[1][1] - curPI.pi_upper) < 1e-4, JSON.stringify(pis[1]) + ' page ' + JSON.stringify(curPI));
    } else {
      check('[' + tag + '] R script states no PI for FE', /PI: \[ not defined for a common-effect/.test(txt), (txt.match(/^PI:.*$/gm) || []).join(' | '));
    }
  }
}
// The page's other built-in benchmark (validateDataset, "Validation Study") computes REML with
// its own runRandomEffectsREML. Its score lacked the REML term +1/2 sum(w^2)/sum(w), so it
// converged to the ML estimate, and its I2 was the Q-based DL value; the old expected
// constants had been copied from that output. R reference: metafor 5.2.1,
// rma(yi, sei^2, method = "REML") on the page's BCG inputs.
{
  const R = { estimate: -0.487666911549956, se: 0.183644896850998, tau2: 0.370598192059931, I2: 93.7742959397653 }; // threshold 1e-12; ML would give tau2 0.336051304500815
  const got = run('runRandomEffectsREML(BENCHMARK_DATASETS.bcg.studies.map(function (s) { return { yi: s.yi, vi: s.sei * s.sei }; }))');
  for (const k of Object.keys(R)) {
    const rel = Math.abs(got[k] - R[k]) / Math.max(1, Math.abs(R[k]));
    check('runRandomEffectsREML ' + k + ' = metafor REML (1e-6)', rel <= 1e-6, 'page ' + got[k] + ' R ' + R[k]);
  }
  const v = run('validateDataset(BENCHMARK_DATASETS.bcg)');
  const bad = v.tests.filter((t) => !t.passed).map((t) => t.test + ' exp ' + t.expected + ' got ' + t.computed);
  check('Validation Study: BCG benchmark all pass', v.tests.length > 0 && bad.length === 0, bad.join('; '));
}
console.log(failed ? 'FAILED ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
