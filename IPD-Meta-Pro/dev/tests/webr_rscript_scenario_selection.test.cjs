'use strict';
// Requirement: the PAGE vs R CHECK at the end of the panel's R script covers the scenarios whose
// data the script itself embeds -- never chosen by the mode of the panel's LAST WebR run.
// agy review of PR #635 (reproduced in headless Chrome before the fix):
//   (a) "Run Reference Benchmarks", then the user's own analysis -> the check had no current-analysis
//       scenario at all (only ref_*), although the script embeds that analysis;
//   (b) "Validate Current Analysis", then Clear data -> the check had only cur_* scenarios (all NOT
//       CHECKED) and dropped the reference benchmarks the script still embeds;
//   (minor) with a 2-study analysis loaded, the 13-study BCG prediction interval (ref_pi) was NOT
//       CHECKED, gated on the current analysis' k.
// Offline: the page's own scripts in a vm (p60_page_loader), no R, no browser, no WebR.
//   node dev/tests/webr_rscript_scenario_selection.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox, run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const gen = sandbox.generateRScript, internals = sandbox._webrInternals;
if (typeof gen !== 'function' || !internals) { console.log('FAIL generateRScript / _webrInternals missing'); process.exit(1); }
const check_ids = (s) => ((s.split('PAGE vs R CHECK')[1] || '').match(/\((?:cur|ref)_[a-z_]+\) ──/g) || []).map((x) => x.slice(1, -4));
const block = (s, id) => ((s.split('PAGE vs R CHECK')[1] || '').split('(' + id + ') ──')[1] || '').split('\n# ──')[0];
const refIds = internals.getScenarios().filter((sc) => sc.source !== 'current').map((sc) => sc.id);
const curIds = internals.getScenarios().filter((sc) => sc.source === 'current').map((sc) => sc.id);
check('precondition: the panel has reference and current scenarios', refIds.length > 0 && curIds.length > 0, refIds.length + ' ref, ' + curIds.length + ' cur');

const ANALYSIS = { studies: [{ effect: 0.30, variance: 0.04 }, { effect: 0.50, variance: 0.05 }, { effect: 0.42, variance: 0.03 }, { effect: 0.10, variance: 0.06 }],
  pooled: { effect: 0.3634, se: 0.0965, ci_lower: 0.1743, ci_upper: 0.5525, tau2: 0, I2: 0, Q: 2.25 } };
function setAnalysis(a) { run('APP.results = ' + (a ? JSON.stringify(a) : 'null') + '; APP.config = Object.assign(APP.config || {}, { reMethod: "REML", useHKSJ: false, confLevel: 0.95 });'); }

// (a) panel's last run was the reference benchmark; a current analysis is now loaded
internals.setLastResults({ mode: 'reference' });
setAnalysis(ANALYSIS);
let s = gen(), ids = check_ids(s);
check('(a) after a reference run, the current analysis\' scenarios are checked', curIds.every((id) => ids.includes(id)), ids.join(' '));
check('(a) ... with the page value of THIS analysis embedded', /page = list\(`pooled` = 0\.3634,/.test(block(s, 'cur_primary')), block(s, 'cur_primary').slice(0, 120));
check('(a) the reference benchmarks are still checked', refIds.every((id) => ids.includes(id)));

// (b) panel's last run was 'current'; the data were then cleared
internals.setLastResults({ mode: 'current' });
setAnalysis(null);
s = gen(); ids = check_ids(s);
check('(b) after Clear data, no current-analysis scenario is listed', curIds.every((id) => !ids.includes(id)), ids.join(' '));
check('(b) ... and the reference benchmarks the script embeds are checked', refIds.every((id) => ids.includes(id)));

// (minor) a 2-study analysis must not gate the 13-study BCG prediction interval
internals.setLastResults({ mode: 'reference' });
setAnalysis({ studies: ANALYSIS.studies.slice(0, 2), pooled: ANALYSIS.pooled });
s = gen();
check('(minor) ref_pi is checked with a 2-study analysis loaded', /why  = NULL,/.test(block(s, 'ref_pi')), (/why  = (.*),/.exec(block(s, 'ref_pi')) || [])[1]);
check('(minor) control: the 2-study analysis\' own PI (cur_pi) is still refused for k<3',
  /why  = "(No R code generated[^"]*|Need k>=3 for prediction interval\.)",/.test(block(s, 'cur_pi')), (/why  = (.*),/.exec(block(s, 'cur_pi')) || [])[1]);

// control: with no panel run at all, the same selection
internals.setLastResults(null);
setAnalysis(ANALYSIS);
ids = check_ids(gen());
check('control: no panel run -> reference + current scenarios', refIds.concat(curIds).every((id) => ids.includes(id)));

if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
