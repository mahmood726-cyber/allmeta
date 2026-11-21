'use strict';
// Requirement: CSV export keeps formula-injection protection for text that a spreadsheet would run
// (=, +, -, @ followed by a formula), but writes finite NUMBERS -- including negative ones -- as plain
// numbers. Limitation sweep LIM-P60 L24, reproduced on main cfce892d: escapeCSV(-0.41) returned
// "'-0.41", so every negative log odds ratio / mean difference in an exported CSV became spreadsheet text.
//   node dev/tests/csv_negative_numbers.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
const esc = sandbox.escapeCSV;
if (typeof esc !== 'function') { console.log('FAIL escapeCSV missing'); process.exit(1); }
const cases = [
  [-0.41, '-0.41', 'a negative number'], [-1.5e-7, '-1.5e-7', 'a negative number in exponent form'], [0.25, '0.25', 'a positive number'],
  ['-0.4123', '-0.4123', 'a negative decimal string'], ['-2.5E-3', '-2.5E-3', 'a negative decimal string in exponent form'],
  ['=SUM(A1:A2)', "'=SUM(A1:A2)", 'an = formula'], ['-2+3', "'-2+3", 'a - formula'], ['+cmd|x', "'+cmd|x", 'a + formula'],
  ['@SUM(1)', "'@SUM(1)", 'an @ formula'], ['-', "'-", 'a lone minus'], [' =1+1', "' =1+1", 'a formula after a space'],
  ['Study A', 'Study A', 'plain text'], ['a,b', '"a,b"', 'text with a comma']
];
for (const [v, want, what] of cases) { const got = esc(v); check(what + ': ' + JSON.stringify(v) + ' -> ' + JSON.stringify(want), got === want, 'got ' + JSON.stringify(got)); }
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
