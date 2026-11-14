// Run from the repo root: node --test hub/shared/tests/csv-delimited-integrity.node.cjs
// Planted-fixture checks for the two shared delimited-data parsers (lane csvaudit, 2026-11-12).
// Deliberately artificial fixtures, not research observations.
//
// Root causes pinned here:
//  1. hub/shared/csv-upload.js parse(): a row with MORE cells than the header was cut to the
//     header width, so an unquoted comma in a label ("Smith et al., 2001,0.04,0.0361") shifted
//     every later cell left: study="Smith et al.", yi=2001, vi=0.04, and no warning was raised.
//  2. shared/ma-studies-v1.js parseCSV()/studiesFromTextarea(): parseFloat accepts a numeric
//     PREFIX, so a decimal-comma/semicolon row "0,22;0,11" became est=0, se=22; and the splitter
//     ignored quotes, so its own toCSV() output for a label containing a comma did not round-trip.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');

function loadCsvUpload() {
  const sandbox = { window: {}, document: undefined, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'hub/shared/csv-upload.js'), 'utf8'), sandbox);
  const p = sandbox.window.alm.csvUpload.parse; // cross-realm arrays -> plain JSON for deepEqual
  return (t, c) => JSON.parse(JSON.stringify(p(t, c)));
}
const COLS = [{ name: 'study' }, { name: 'yi', type: 'float' }, { name: 'vi', type: 'float' }];
const PLAIN = 'study,yi,vi\nTrial A,-0.22,0.0121\nTrial B,-0.31,0.0196\nTrial C,0.04,0.0361';

test('csv-upload: plain, quoted, CRLF+BOM and sci-notation files parse to the same numbers', () => {
  const parse = loadCsvUpload();
  const want = [[-0.22, 0.0121], [-0.31, 0.0196], [0.04, 0.0361]];
  const nums = r => r.rows.map(x => [x.yi, x.vi]);
  const plain = parse(PLAIN, COLS);
  assert.deepEqual(plain.warnings, []);
  assert.deepEqual(nums(plain), want);
  const quoted = parse('study,yi,vi\n"Smith, J ""Jr""",-0.22,0.0121\nTrial B,-0.31,0.0196\n"Smith, 2001",0.04,0.0361', COLS);
  assert.deepEqual(quoted.warnings, []);
  assert.deepEqual(nums(quoted), want);
  assert.equal(quoted.rows[0].study, 'Smith, J "Jr"');
  assert.equal(quoted.rows[2].study, 'Smith, 2001');
  const crlf = parse('﻿' + PLAIN.replace(/\n/g, '\r\n') + '\r\n', COLS);
  assert.deepEqual(crlf.warnings, []);
  assert.deepEqual(nums(crlf), want);
  const sci = parse('study,yi,vi\nTrial A,-2.2e-1,1.21e-2\nTrial B,-3.1e-1,1.96e-2\nTrial C,4e-2,3.61e-2', COLS);
  assert.deepEqual(nums(sci), want);
});

test('csv-upload: an unquoted comma in a label is REFUSED, never shifted into yi/vi', () => {
  const parse = loadCsvUpload();
  for (const label of ['Smith et al., 2001', 'Not randomized 1,807']) {
    const r = parse('study,yi,vi\nTrial A,-0.22,0.0121\n' + label + ',0.04,0.0361', COLS);
    assert.ok(r.warnings.some(w => /more cells than the header/i.test(w)), 'warns: ' + JSON.stringify(r.warnings));
    assert.deepEqual(r.rows, [], 'no partial row set is returned');
    assert.ok(!JSON.stringify(r.rows).includes('2001') && !JSON.stringify(r.rows).includes('807'));
  }
});

test('csv-upload: a trailing EMPTY cell (trailing comma) is not a ragged row', () => {
  const parse = loadCsvUpload();
  const r = parse('study,yi,vi\nTrial A,-0.22,0.0121,\nTrial B,-0.31,0.0196,', COLS);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.rows.map(x => x.yi), [-0.22, -0.31]);
});

test('csv-upload: NA, empty and decimal-comma cells stay visible warnings', () => {
  const parse = loadCsvUpload();
  assert.ok(parse('study,yi,vi\nA,NA,0.01', COLS).warnings.some(w => /not float: NA/.test(w)));
  assert.ok(parse('study,yi,vi\nA,,0.01', COLS).warnings.some(w => /missing float/.test(w)));
  const euro = parse('study;yi;vi\nA;-0,22;0,0121', COLS);
  assert.ok(euro.warnings.length > 0);
  assert.ok(!euro.rows.some(x => x.yi === 22 || x.yi === -0 || x.vi === 22));
});

// ------------------------------------------------------------------ ma-studies
const MS = require(path.join(root, 'shared/ma-studies-v1.js'));

test('ma-studies: decimal-comma / semicolon rows are not read as numeric prefixes', () => {
  for (const fn of [t => MS.parseCSV(t), t => MS.studiesFromTextarea(t, 'label-est-se')]) {
    const rows = fn('Trial A;-0,22;0,11\nTrial B;-0,31;0,14');
    assert.ok(!rows.some(r => r.est === 22 || r.se === 11 || r.est === 31), JSON.stringify(rows));
    assert.deepEqual(rows, []);
  }
  for (const fmt of ['est-se-label', 'est-se-label-mod']) {
    const rows = MS.studiesFromTextarea('-0,22;0,11;Trial A\n0.04junk, 0.19, Trial C', fmt);
    assert.deepEqual(rows, [], fmt + ': ' + JSON.stringify(rows));
  }
});

test('ma-studies: toCSV output round-trips through parseCSV for labels with commas and quotes', () => {
  const studies = [
    { label: 'Smith, 2001', est: 0.04, se: 0.19, year: 2001, group: 'Low, risk', moderator: 1.5 },
    { label: 'He said "hi"', est: -0.22, se: 0.11, year: null, group: null, moderator: null },
  ];
  const back = MS.parseCSV(MS.toCSV(studies).split('\n').slice(1).join('\n'));
  assert.deepEqual(back.map(r => [r.label, r.est, r.se, r.year, r.group, r.moderator]),
    studies.map(r => [r.label, r.est, r.se, r.year, r.group, r.moderator]));
});

test('ma-studies: in parseCSV (a real year column) an unquoted label comma cannot shift a year into est', () => {
  // "Smith et al., 2001, 0.04, 0.19" is ambiguous; it must not become est=2001, se=0.04.
  // Scope (rev542 M1): only parseCSV has a real year column. studiesFromTextarea's column 4 belongs to
  // the caller (meta-regression's moderator), so it cannot use the year to detect a shift; there the
  // receipt must keep exactly the rows the app analysed (test below).
  const rows = MS.parseCSV('Smith et al., 2001, 0.04, 0.19');
  assert.ok(!rows.some(r => r.est === 2001), JSON.stringify(rows));
});

test('ma-studies: plain, CRLF, sci-notation and the documented optional columns still parse', () => {
  const want = [['Trial A', -0.22, 0.11], ['Trial B', -0.31, 0.14]];
  for (const txt of ['Trial A, -0.22, 0.11\nTrial B, -0.31, 0.14', 'Trial A,-2.2e-1,1.1e-1\r\nTrial B,-3.1e-1,1.4e-1\r\n']) {
    assert.deepEqual(MS.parseCSV(txt).map(r => [r.label, r.est, r.se]), want);
    assert.deepEqual(MS.studiesFromTextarea(txt).map(r => [r.label, r.est, r.se]), want);
  }
  const full = MS.parseCSV('A, 0.2, 0.1, 2015, low, 3.5');
  assert.deepEqual([full[0].year, full[0].group, full[0].moderator], [2015, 'low', 3.5]);
  const esl = MS.studiesFromTextarea('0.2, 0.1, Smith, 2001\n0.3, 0.12', 'est-se-label');
  assert.deepEqual(esl.map(r => [r.est, r.se, r.label]), [[0.2, 0.1, 'Smith'], [0.3, 0.12, 'Study 2']]);
  const mod = MS.studiesFromTextarea('0.2, 0.1, Smith, 1.5', 'est-se-label-mod');
  assert.deepEqual([mod[0].label, mod[0].moderator], ['Smith', 1.5]);
});

// ---------------------------------------------------------------- rev542 M1
// meta-regression signs its TruthCert receipt with studiesFromTextarea(#f-data, "label-est-se"),
// whose 4th column is the MODERATOR there, not a year. A whole-number check on that column dropped
// every study with a fractional moderator (dose 2.5) from the receipt: 5972 -> 5448 rows over the
// 194-dataset corpus, 6 datasets emptied. The receipt must keep every analysed study.
test('ma-studies: textarea 4th column is not required to be a whole year (meta-regression receipt keeps all 5972 corpus rows)', () => {
  const C = JSON.parse(fs.readFileSync(path.join(root, 'meta-regression/validate/plus/corpus.json'), 'utf8'));
  let rows = 0, kept = 0, emptied = 0;
  for (const c of C) {
    const lines = c.yi.map((y, i) => {
      const m = (c.mods[i] || [])[0];
      return 'S' + c.source_rows[i] + ', ' + y + ', ' + Math.sqrt(c.vi[i]) + (m !== undefined && m !== null && m !== '' ? ', ' + m : '');
    });
    const k = MS.studiesFromTextarea(lines.join('\n'), 'label-est-se').length;
    rows += lines.length; kept += k; if (k === 0) emptied++;
  }
  assert.equal(rows, 5972);
  assert.equal(kept, 5972);
  assert.equal(emptied, 0);
  const dose = MS.studiesFromTextarea('A, 0.1, 0.2, 2.5\nB, 0.2, 0.2, 5\nC, 0.3, 0.2, 7.5\nD, 0.4, 0.2, 10', 'label-est-se');
  assert.equal(dose.length, 4);
  // trailing empty fields (a pasted spreadsheet) are absent, not extra columns
  assert.equal(MS.studiesFromTextarea('A, 0.1, 0.2,,,,\nB, 0.2, 0.2, 2001, low, 1.5,', 'label-est-se').length, 2);
});

// ---------------------------------------------------------------- rev542 MINOR m1 / m4
test('csv-upload: refusals name the physical file line; a BOM before a quoted header is not a fuzzy header', () => {
  const parse = loadCsvUpload();
  const r = parse('study,yi,vi\n"multi\nline",0.1,0.01\nTrial A,-0.22,0.0121\nSmith et al., 2001,0.04,0.0361', COLS);
  assert.ok(r.warnings.some(w => /line 5\b/.test(w)), JSON.stringify(r.warnings));
  const bom = parse('﻿"study","yi","vi"\r\n"A",0.2,0.04\r\n', COLS);
  assert.deepEqual(bom.warnings, []);
  assert.deepEqual(bom.headers, ['study', 'yi', 'vi']);
});
