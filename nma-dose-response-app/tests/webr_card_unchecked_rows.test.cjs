'use strict';
// The in-page "WebR: Verify with R metafor" card must not show a tick for a value it did not compare, and its
// VALIDATED verdict must not count a value the page did not supply as a match.
//   * The "Q p-value" row has no page value (appKey null) and was drawn with a green tick ("match = true"),
//     so every table showed 8 ticks for 7 comparisons (Codex audit at 43e31c66, confirmed on the live page 17 Nov 2026).
//   * checkMatch() skipped a metric whenever the page value was not finite, so a missing page value counted
//     towards "All DL engine metrics match R ... VALIDATED".
//   node nma-dose-response-app/tests/webr_card_unchecked_rows.test.cjs [path/to/index.html]
const fs = require('fs'), path = require('path'), vm = require('vm');
const page = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(page, 'utf8');
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function ' + name + ' not found');
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) { if (html[k] === '{') depth++; else if (html[k] === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
const ctx = vm.createContext({ Math, isFinite, Number, String });
vm.runInContext(['esc', 'isNum', 'fmtNum', 'buildComparisonTable', 'checkMatch'].map(grab).join('\n'), ctx);
let failed = 0;
const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  [' + d + ']')); if (!ok) failed++; };
const R = { effect: 0.5496, se: 0.1474, tau2: 0.0437, I2: 67.15, Q: 6.0884, Qp: 0.0476, ci_lb: 0.2608, ci_ub: 0.8384, k: 3 };
const APP = { effect: 0.5496, se: 0.1474, tau2: 0.0437, I2: 67.15, Q: 6.0884, ci: { lower: 0.2608, upper: 0.8384 } };
ctx.R = R; ctx.APP = APP;
const t = vm.runInContext('buildComparisonTable(R, APP)', ctx);
const rows = [...t.matchAll(/<tr style="border-bottom[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const qp = rows.find(r => /Q p-value/.test(r));
check('Q p-value row exists', !!qp, 'rows ' + rows.length);
check('Q p-value row (no page value) carries no tick', qp && !/&#x2713;/.test(qp), qp);
check('Q p-value row says it is not compared', qp && /not compared/i.test(qp), qp);
check('the 7 compared rows still carry ticks when equal', rows.filter(r => /&#x2713;/.test(r)).length === 7, rows.filter(r => /&#x2713;/.test(r)).length);
check('checkMatch true when all compared values agree', vm.runInContext('checkMatch(R, APP)', ctx) === true, '');
ctx.APP2 = Object.assign({}, APP, { tau2: NaN });
check('checkMatch false when a page value is missing (NaN tau2)', vm.runInContext('checkMatch(R, APP2)', ctx) === false, 'returned true');
ctx.APP3 = Object.assign({}, APP, { Q: 6.2 });
check('checkMatch false when a value differs', vm.runInContext('checkMatch(R, APP3)', ctx) === false, 'returned true');
// A null page value is not a number: the global isFinite(null) is true and Math.abs(0 - null) is 0, so a null
// against an R value of 0 used to draw a tick and count towards VALIDATED (agy review of #632, confirmed by pa10).
const R0 = Object.assign({}, R, { tau2: 0 });
ctx.R0 = R0; ctx.APPN = Object.assign({}, APP, { tau2: null });
const tn = vm.runInContext('buildComparisonTable(R0, APPN)', ctx);
const tauRow = [...tn.matchAll(/<tr style="border-bottom[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]).find(r => /tau-squared/.test(r));
check('a null page tau2 against R tau2 = 0 carries no tick', tauRow && !/&#x2713;/.test(tauRow), tauRow);
check('checkMatch false when a page value is null and R is 0', vm.runInContext('checkMatch(R0, APPN)', ctx) === false, 'returned true');
console.log(failed ? failed + ' FAILED' : 'ALL PASS'); process.exitCode = failed ? 1 : 0;
