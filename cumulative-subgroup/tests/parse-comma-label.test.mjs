import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// cumulative-subgroup parseStudies, run from the page's own source (lane hf1, reviews of PR #590;
// cases from the Codex review). Parser requirement checks, not a substitute for the Playwright spec
// hub/shared/tests/cumulative-subgroup-comma-label.spec.mjs.
// Run from the repository root: node --test cumulative-subgroup/tests/parse-comma-label.test.mjs
const html = fs.readFileSync(process.env.CUMSUB_PAGE || new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function parseStudies(text) {');
const end = html.indexOf('    // ---- Pooling ----', start);
const extracted = vm.runInNewContext('(' + html.slice(start, end).trim() + ')');
const parse = text => JSON.parse(JSON.stringify(extracted(text)));
const rest = '\nJones B, -0.31, 0.14\nTrial C, 0.04, 0.19';
const compact = rows => rows.map(s => [s.label, s.est, s.se, s.year, s.group]);

test('numeric comma-split label is refused with line 1 and no rows', () => {
  const r = parse('Smith, 2020, 0.22, 0.11' + rest);
  assert.deepEqual(r.studies, []);
  assert.match(r.warnings.join(' '), /Input refused, nothing was computed\. Line 1:/);
  assert.match(r.warnings.join(' '), /"Smith, 2020"/);
});
test('shift with year/group counts comments and blank lines', () => {
  const r = parse('# label, est, se, year, group\nA,-0.2,0.1,2015,G1\n\nSmith,2020,0.22,0.11,2019,G2\nB,-0.1,0.12,2016,G2');
  assert.deepEqual(r.studies, []);
  assert.match(r.warnings.join(' '), /Input refused, nothing was computed\. Line 4:/);
});
test('text comma-split label is refused rather than skipped as a header', () => {
  const r = parse('Smith, J, 0.22, 0.11' + rest);
  assert.deepEqual(r.studies, []);
  assert.match(r.warnings.join(' '), /Line 1:/);
});
test('quoted label preserves estimate and SE', () => {
  const r = parse('"Smith, 2020",0.22,0.11' + rest);
  assert.equal(r.studies.length, 3);
  assert.deepEqual(compact(r.studies)[0], ['Smith, 2020', 0.22, 0.11, null, null]);
  assert.deepEqual(r.warnings, []);
});
test('example, header, trailing comma, and homogeneous numeric group inputs remain accepted', () => {
  const example = vm.runInNewContext(html.match(/const EXAMPLE = (.*);/)[1]);
  assert.equal(parse(example).studies.length, 9);
  assert.deepEqual(parse(example).warnings, []);
  const h = parse('label, logOR, SE, year, group\nA,0.1,0.1,2001,G1,\nB,0.2,0.2,2002,G2,\nC,0.3,0.15,2003,1\nD,0.4,0.3,2004,2');
  assert.deepEqual(h.warnings, []);
  assert.deepEqual(compact(h.studies), [['A',0.1,0.1,2001,'G1'],['B',0.2,0.2,2002,'G2'],['C',0.3,0.15,2003,'1'],['D',0.4,0.3,2004,'2']]);
  assert.deepEqual(compact(parse('A,0.1,0.1,1\nB,0.2,0.2,2\nC,0.3,0.15,2015').studies), [['A',0.1,0.1,null,'1'],['B',0.2,0.2,null,'2'],['C',0.3,0.15,2015,null]]);
});
test('optional numeric group may be absent on another row', () => {
  const r = parse('A,0.1,0.1,1\nB,0.2,0.2,2\nC,0.3,0.15');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies), [['A',0.1,0.1,null,'1'],['B',0.2,0.2,null,'2'],['C',0.3,0.15,null,null]]);
});
test('properly quoted label does not trigger a comma-shift diagnosis', () => {
  const r = parse('"Smith, J",0.1,0.1,1\nB,0.2,0.2,2\nC,0.3,0.15');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies)[0], ['Smith, J',0.1,0.1,null,'1']);
  assert.equal(r.studies.length, 3);
});
test('fractional year may be absent on another row', () => {
  const r = parse('A,0.1,0.1,1992.5\nB,0.2,0.2,2010.1\nC,0.3,0.15');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies), [['A',0.1,0.1,1992.5,null],['B',0.2,0.2,2010.1,null],['C',0.3,0.15,null,null]]);
});
test('missing group does not make another fractional-year row malformed', () => {
  const r = parse('A,0.1,0.1,1992.5,G1\nB,0.2,0.2,2010.1,\nC,0.3,0.15,2012,G2');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies), [['A',0.1,0.1,1992.5,'G1'],['B',0.2,0.2,2010.1,null],['C',0.3,0.15,2012,'G2']]);
});
test('existing invalid-SE warning counts blank physical lines', () => {
  const r = parse('# comment\n\nA,0.1,0.1\n\nB,0.2,0');
  assert.equal(r.studies.length, 1);
  assert.match(r.warnings[0], /^Line 5:/);
});
test('existing warning counts a quoted multiline label', () => {
  const r = parse('"A\nB",0.1,0.1\n\nC,0.2,0');
  assert.equal(r.studies.length, 1);
  assert.match(r.warnings[0], /^Line 4:/);
});
test('zero estimate and string zero group are retained', () => {
  const r = parse('A,0,0.1,0\nB,0.2,0.2,1');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies)[0], ['A',0,0.1,null,'0']);
});
test('a header row declares the optional columns, so a row that omits one is not a split label', () => {
  const r = parse('label, est, se, group\nA,0.1,0.1,1\nC,0.3,0.15');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(compact(r.studies), [['A',0.1,0.1,null,'1'],['C',0.3,0.15,null,null]]);
});
test('a header row still refuses a row wider than the header', () => {
  const r = parse('label, est, se\nSmith, 2020, 0.22, 0.11' + rest);
  assert.deepEqual(r.studies, []);
  assert.match(r.warnings.join(' '), /Input refused, nothing was computed\. Line 2:/);
});
test('the refusal names both repairs, not only quoting', () => {
  const w = parse('Smith, 2020, 0.22, 0.11' + rest).warnings.join(' ');
  assert.match(w, /quote the label/);
  assert.match(w, /header row/);
});
test('line numbering is linear in the input size', () => {
  const big = Array.from({length: 20000}, (_, i) => 'S' + i + ',0.1,0.1').join('\n');
  const t0 = performance.now();
  const r = parse(big);
  const ms = performance.now() - t0;
  assert.equal(r.studies.length, 20000);
  assert.ok(ms < 2000, 'parse of 20000 rows took ' + Math.round(ms) + ' ms');
});
