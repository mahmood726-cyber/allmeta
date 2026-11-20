'use strict';
// Requirement: in the PAGE vs R CHECK at the end of the panel's R script, a page value that is missing
// or not a number must be embedded as NULL (the R side then prints NOT CHECKED, "the page gives no
// value"), never as a number. Before this fix rNumLiteral() coerced with Number() and the global
// isFinite(), so "" / "  " / [] / false / true / [0.3] became 0 / 0 / 0 / 0 / 1 / 0.3: a page that gave
// NO tau2 ("") was embedded as `tau2` = 0 and, against R's tau2 = 0 for homogeneous data, printed a
// false [MATCH] that was counted in "MATCH n/n".
// Controls: genuine numbers (0 included) and finite numeric strings are still embedded as numbers;
// NaN / Inf stay NaN / Inf (R prints NOT CHECKED "a value is not finite"), null stays NULL.
// Offline: the page's own scripts in a vm (p60_page_loader), no R, no browser, no WebR.
//   node dev/tests/webr_rscript_missing_page_value.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox, run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const gen = sandbox.generateRScript;
if (typeof gen !== 'function') { console.log('FAIL generateRScript missing'); process.exit(1); }
const block = (s, id) => ((s.split('PAGE vs R CHECK')[1] || '').split('(' + id + ') ──')[1] || '').split('\n# ──')[0];
const pageList = (s, id) => (/\n  page = (.*),\n/.exec(block(s, id)) || [])[1] || '';
const literal = (list, key) => { const m = new RegExp('`' + key + '` = ([^,)]+)').exec(list); return m ? m[1] : '(absent)'; };

// The cur_primary scenario reads pooled.effect/se/ci_lower/ci_upper/tau2/I2/Q (?? falls through only on
// null/undefined, so a "" or false value reaches the script as it is).
const STUDIES = [{ effect: 0.30, variance: 0.04 }, { effect: 0.32, variance: 0.05 }, { effect: 0.31, variance: 0.03 }];
function scriptFor(pooled) {
  run('APP.config = Object.assign(APP.config || {}, { reMethod: "REML", useHKSJ: false, confLevel: 0.95 });' +
    'APP.results = ' + JSON.stringify({ studies: STUDIES, pooled: pooled }) + ';' +
    'APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config);');
  return gen();
}

// Values JSON cannot carry (NaN, Infinity) are set in the vm directly.
function scriptWith(assign) {
  scriptFor({ effect: 0.31, se: 0.1, ci_lower: 0.1, ci_upper: 0.5, tau2: 0, I2: 0, Q: 0.01 });
  run(assign);
  return gen();
}

const NOT_NUMBERS = [['""', '""'], ['"   "', '"   "'], ['[]', '[]'], ['false', 'false'], ['true', 'true'],
  ['[0.3]', '[0.3]'], ['{}', '{}'], ['"abc"', '"abc"'], ['"0x10"', '"0x10"']];
for (const [label, js] of NOT_NUMBERS) {
  const s = scriptWith('APP.results.pooled.tau2 = ' + js + ';');
  const lit = literal(pageList(s, 'cur_primary'), 'tau2');
  check('page tau2 = ' + label + ' is embedded as NULL (NOT CHECKED in R), not as a number', lit === 'NULL', '`tau2` = ' + lit);
}

// Controls: the coercion still keeps every genuine page number.
const KEEP = [['0', '0', '0'], ['0.5', '0.5', '0.5'], ['-1.25e-3', '-1.25e-3', '-0.00125'], ['"0.25"', '"0.25"', '0.25'],
  ['" 7 "', '" 7 "', '7'], ['NaN', 'NaN', 'NaN'], ['Infinity', 'Infinity', 'Inf'], ['-Infinity', '-Infinity', '-Inf'], ['null', 'null', 'NULL']];
for (const [label, js, want] of KEEP) {
  const s = scriptWith('APP.results.pooled.tau2 = ' + js + ';');
  const lit = literal(pageList(s, 'cur_primary'), 'tau2');
  check('control: page tau2 = ' + label + ' is embedded as ' + want, lit === want, '`tau2` = ' + lit);
}

// The other keys of the same scenario are unaffected by one missing value.
const s0 = scriptWith('APP.results.pooled.tau2 = "";');
const pl = pageList(s0, 'cur_primary');
check('control: the scenario\'s other page values are still embedded', literal(pl, 'pooled') === '0.31' && literal(pl, 'Q') === '0.01', pl);

console.log(failed ? failed + ' FAILED' : 'ALL PASS');
process.exit(failed ? 1 : 0);
