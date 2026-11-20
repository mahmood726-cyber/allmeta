'use strict';
// Requirement: in the WebR validation panel, a scenario in which NOTHING was compared (the page's JavaScript
// produced no value for it -- e.g. applyHKSJ, leave-one-out or coxPH returned null -- so every row is R-only)
// is NOT a pass. It must be shown as NOT CHECKED and must not be counted towards "n/n PASS".
// It used to be scored PASS (`comparedRows.length === 0 ? true : ...`), so a page that refused or failed to
// compute a scenario was reported as agreeing with R.
//   node dev/tests/webr_no_compared_rows.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const W = run('window._webrInternals');
check('precondition: the WebR validation internals are exposed', !!(W && W.compareResults && W.renderTierResults));
const tol = { pooled: 0.001, se: 0.001 };
const rv = { pooled: 0.42, se: 0.11 };
// JS refused (null): every row R-only
const refused = W.compareResults(null, rv, tol, null);
check('precondition: a refused scenario has only R-only rows', refused.every((r) => r.pass === null), JSON.stringify(refused.map((r) => r.pass)));
const html1 = W.renderTierResults('Tier A', [{ scenario: { label: 'Current Analysis - HKSJ' }, status: 'ok', rows: refused }]);
check('a scenario with nothing compared is not reported as PASS', !/\bPASS\b/.test(html1.replace(/R-only/g, '')), html1.match(/webr-tier-badge[^<]*<\/span>|webr-tier-badge[^>]*>[^<]*/g));
check('it is reported as NOT CHECKED', /NOT CHECKED/.test(html1));
// JS returned NaN for everything: diff null -> pass null -> also nothing compared
const nan = W.compareResults({ pooled: NaN, se: NaN }, rv, tol, null);
const html2 = W.renderTierResults('Tier A', [{ scenario: { label: 'NaN scenario' }, status: 'ok', rows: nan }]);
check('NaN JS values are not a PASS either', !/\d+\/\d+ PASS/.test(html2) && /NOT CHECKED/.test(html2));
// control: a real agreement still passes, and a not-checked scenario beside it does not change that tier's PASS into FAIL
const agree = W.compareResults({ pooled: 0.4201, se: 0.1102 }, rv, tol, null);
const html3 = W.renderTierResults('Tier A', [{ scenario: { label: 'agrees' }, status: 'ok', rows: agree },
  { scenario: { label: 'refused' }, status: 'ok', rows: refused }]);
check('control: an agreeing scenario still gives "1/1 PASS" (the unchecked one is listed, not counted)', /1\/1 PASS/.test(html3) && /NOT CHECKED/.test(html3), (html3.match(/\d+\/\d+ (PASS|FAIL)/) || [])[0]);
const disagree = W.compareResults({ pooled: 0.5, se: 0.11 }, rv, tol, null);
const html4 = W.renderTierResults('Tier A', [{ scenario: { label: 'differs' }, status: 'ok', rows: disagree }]);
check('control: a real disagreement is FAIL', /0\/1 FAIL/.test(html4));
// the overall summary of runWebRValidation uses the same rule (source check: the module and the built page)
const src = require('node:fs').readFileSync(pageFile, 'utf8');
check('the run summary never scores an uncompared scenario as a pass', !/comparedRows\.length === 0 \|\|/.test(src) && !/comparedRows\.length === 0 \? true/.test(src));
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
