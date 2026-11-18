'use strict';
// Requirement: the panel's R script must pair the page's results with the settings THOSE results
// were computed under. runAnalysis() writes the form into APP.config before it can refuse, and sets
// APP.results together with APP.analysisSettings only when it succeeds. So after a failed rerun
// APP.config holds settings that were never analysed while APP.results still holds the last
// successful analysis.
// Codex review of PR #635, reproduced in headless Chrome before the fix: binary example, REML with
// HKSJ off (succeeds), then DL + HKSJ + treatment "age" (refused: 21 groups) -> the script embedded
// the REML page values next to R code rma(method="DL", test="adhoc"), and fresh Rscript printed
// MISMATCH on ci_lower/ci_upper (|diff| 0.034) although the page is right for REML.
// Offline: the page's own scripts in a vm (p60_page_loader), no R, no browser.
//   node dev/tests/webr_rscript_saved_settings.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox, run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
const gen = sandbox.generateRScript;
if (typeof gen !== 'function') { console.log('FAIL generateRScript missing'); process.exit(1); }
const block = (s, id) => ((s.split('PAGE vs R CHECK')[1] || '').split('(' + id + ') ──')[1] || '').split('\n# ──')[0];

const RESULTS = { studies: [{ effect: 0.30, variance: 0.04 }, { effect: 0.50, variance: 0.05 }, { effect: 0.42, variance: 0.03 }, { effect: 0.10, variance: 0.06 }],
  pooled: { effect: 0.3634, se: 0.0965, ci_lower: 0.1743, ci_upper: 0.5525, tau2: 0, I2: 0, Q: 2.25 } };
// the successful run: REML, HKSJ off, 95%; then a refused rerun wrote DL, HKSJ on, 90% into APP.config
run('APP.results = ' + JSON.stringify(RESULTS) + ';' +
    'APP.config = Object.assign(APP.config || {}, { reMethod: "REML", useHKSJ: false, confLevel: 0.95, treatmentVar: "treatment" });' +
    'APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config);' +
    'Object.assign(APP.config, { reMethod: "DL", useHKSJ: true, confLevel: 0.9, treatmentVar: "age" });');
const cfgBefore = run('JSON.stringify(APP.config)');
const s = gen();
const prim = block(s, 'cur_primary');
check('precondition: the check embeds the page values of the successful analysis', /`se` = 0\.0965,/.test(prim), prim.slice(0, 140));
check('its R code uses the SAVED settings: method REML, test z, level 0.95',
  /rma\(yi=yi, vi=vi, method="REML", test="z", level=0\.95\)/.test(prim), (/res\s+<- rma\([^\n]*/.exec(prim) || [])[0]);
check('no current-analysis R code uses the never-analysed DL / HKSJ / 0.9 settings',
  ['cur_primary', 'cur_loo', 'cur_fe', 'cur_hksj', 'cur_pi', 'cur_egger'].every((id) => !/method="DL", test="adhoc"|level=0\.9\b/.test(block(s, id).replace(/method="DL", test="adhoc", level=0\.95/g, ''))));
const top = s.split('PAGE vs R CHECK')[0];
check('the script\'s own "current analysis" section uses the saved settings too',
  /res_primary <- rma\(yi=yi, vi=vi, method="REML", test="z", level=0\.95\)/.test(top), (/res_primary <- rma\([^\n]*/.exec(top) || [])[0]);
check('the script says the form\'s settings differ from the analysed ones', /not the settings now on the form/.test(s));
check('generating the script leaves APP.config as it was', run('JSON.stringify(APP.config)') === cfgBefore);

// control: settings unchanged since the successful run -> same R code, no warning line
run('APP.config = Object.assign({}, APP.analysisSettings);');
const s2 = gen();
check('control: unchanged settings -> REML/z/0.95 and no settings warning',
  /method="REML", test="z", level=0\.95/.test(block(s2, 'cur_primary')) && !/not the settings now on the form/.test(s2));

// undo/redo or a loaded session: APP.results is replaced (deep copy) without recording the settings
// it was computed under -> the current-analysis rows are NOT CHECKED with that reason, never MATCHed
// against R code built from APP.config or from another run's saved settings; reference rows stay.
run('APP.results = JSON.parse(JSON.stringify(APP.results));' +
    'Object.assign(APP.config, { reMethod: "DL", useHKSJ: true, confLevel: 0.9 });');
const s3 = gen();
const curIds = ['cur_primary', 'cur_loo', 'cur_fe', 'cur_hksj', 'cur_pi', 'cur_egger'];
check('restored results: every current-analysis scenario is NOT CHECKED with the reason',
  curIds.every((id) => /why  = "Not checked: the settings these page results were computed under are not recorded/.test(block(s3, id))),
  curIds.filter((id) => !/why  = "Not checked:/.test(block(s3, id))).join(','));
check('restored results: no current-analysis page values are embedded for comparison',
  curIds.every((id) => /page = NULL,/.test(block(s3, id))));
check('restored results: the reference benchmarks are still checked', ['ref_dl', 'ref_reml', 'ref_hksj'].every((id) => /why  = NULL,/.test(block(s3, id)) && !/page = NULL,/.test(block(s3, id))));
check('generating the restored-results script leaves no state behind (next tied run checks again)',
  (run('APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config);'), /why  = NULL,/.test(block(gen(), 'cur_primary'))));

// the Beyond-R batch workflow runner analyses every example (runAnalysis() each time) and then puts
// the user's APP.results back: its saved settings must come back with it, or the user's own analysis
// would be NOT CHECKED afterwards (and APP.analysisSettings would describe the last example).
// runAnalysis / loadExampleData are stood in for (the vm has no form); the panel elements are given.
run('var __els = {}, __gid = document.getElementById;' +
    'document.getElementById = function (id) { if (id === "beyondR40Results" || id === "beyondR40Output") return __els[id] || (__els[id] = { style: {}, innerHTML: "", appendChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } }); return __gid.call(document, id); };' +
    'var __runs = 0; loadExampleData = function () { APP.data = [{ study_id: 1 }]; };' +
    'runAnalysis = function () { APP.config = Object.assign({}, APP.config, { reMethod: "DL" }); APP.results = { studies: [], pooled: { effect: ++__runs } }; APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config); };' +
    'APP.data = [{ study_id: 1 }]; APP.results = ' + JSON.stringify(RESULTS) + ';' +
    'APP.config = Object.assign(APP.config || {}, { reMethod: "PM", useHKSJ: false, confLevel: 0.95 });' +
    'APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config); var __mine = APP.results;' +
    'runBeyondR40("batchIPDWorkflowRunner");');
const after = JSON.parse(run('JSON.stringify({ runs: __runs, same: APP.results === __mine, tied: APP.lastResults === APP.results, method: APP.analysisSettings && APP.analysisSettings.reMethod })'));
check('batch runner: precondition - it analysed the examples', after.runs > 0 && after.same, JSON.stringify(after));
check('batch runner: the user analysis comes back with its own saved settings (PM), still checked',
  after.tied && after.method === 'PM' && /method="PM"/.test(block(gen(), 'cur_primary')) && /why  = NULL,/.test(block(gen(), 'cur_primary')), JSON.stringify(after));

if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
