'use strict';
// Requirement: Export > R code ("ipd_meta_analysis.R", exportRCode) refits the page's displayed analysis:
// the study estimates at full precision, the pooling method, the HKSJ choice and the confidence level
// SAVED with the results (APP.analysisSettings), and study labels as valid R strings.
// Limitation sweep LIM-P60 L23, reproduced on main cfce892d: effect/se rounded with toFixed(4), the
// method read from the mutable form config (APP.config), no test= (HKSJ ignored), no level=, and a
// study label containing a double quote breaks the R string. It also loaded library(meta), which the
// script never uses (a fresh R without meta stops there).
// Offline: the page's own scripts in a vm (p60_page_loader), no R, no browser.
//   node dev/tests/r_code_export.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox, run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
if (typeof sandbox.exportRCode !== 'function') { console.log('FAIL exportRCode missing'); process.exit(1); }
const STUDIES = [{ study: 'Alpha "A"', n: 80, effect: 0.123456789012345, se: 0.2109876543210987, variance: 0.2109876543210987 ** 2 },
  { study: 'Beta', n: 60, effect: -0.31415926535897, se: 0.25, variance: 0.0625 },
  { study: 'Gamma', n: 70, effect: 0.0271828182845905, se: 0.19, variance: 0.19 * 0.19 }];
run('var __code = null; Blob = function (parts) { __code = parts.join(""); }; URL.createObjectURL = function () { return "blob:x"; }; showNotification = function () {};' +
    'APP.results = { studies: ' + JSON.stringify(STUDIES) + ', pooled: { pooled: 0.01 } };' +
    'APP.config = Object.assign(APP.config || {}, { reMethod: "PM", useHKSJ: true, confLevel: 0.9 });' +
    'APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config);' +
    // a later (refused or unrun) form change: the export must still describe the analysed settings
    'Object.assign(APP.config, { reMethod: "DL", useHKSJ: false, confLevel: 0.95 });');
try { run('exportRCode()'); } catch (e) { console.log('NOTE exportRCode threw after building the code: ' + e.message); }
const code = run('__code') || '';
check('precondition: the export produced R code', /rma\(/.test(code), code.slice(0, 80));
check('study effects are embedded at full precision', code.includes(String(STUDIES[0].effect)) && code.includes(String(STUDIES[1].effect)), (/effect = c\([^)]*\)/.exec(code) || [])[0]);
check('study standard errors are embedded at full precision', code.includes(String(STUDIES[0].se)), (/se = c\([^)]*\)/.exec(code) || [])[0]);
const rma = (/res <- rma\([^\n]*/.exec(code) || [''])[0];
check('the saved method (PM) is used, not the form\'s later DL', /method = "PM"/.test(rma), rma);
check('the saved HKSJ choice is used (test = "adhoc", the page\'s floored HKSJ)', /test = "adhoc"/.test(rma), rma);
check('the saved confidence level is used (level = 0.9)', /level = 0\.9\b/.test(rma), rma);
check('a study label with a double quote is a valid R string', code.includes('"Alpha \\"A\\""'), (/study = c\([^)]*\)/.exec(code) || [])[0]);
check('no unused package is loaded (library(meta))', !/library\(meta\)/.test(code));
check('generating the export leaves APP.config as it was', run('APP.config.reMethod') === 'DL');
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
