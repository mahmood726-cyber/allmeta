// Synthetic names only. Spreadsheet formula-trigger guard for RevMan CSV exports.
// House rule: a cell is a formula trigger when it starts with = + @ (after optional spaces) or with a bare tab or CR.
// A leading '-' is NOT a trigger (names such as '-Smith 2010' and negative-looking text are ordinary data).
// Triggers are REFUSED (the export throws), never silently escaped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const review = R.parseText(readFileSync(new URL('../fixtures/revman/multi.rm5', import.meta.url), 'utf8'));
const good = R.select(review, {comparison: 0, outcome: 0, subgroup: 0}, 'binary2x2', {filename: 'multi.rm5'});
const meta = {outcome: 'Synthetic outcome', arm1: 'A', arm2: 'B'};
const one = study => [{...good[0], study, studyId: study}];

test('a study name starting with "-" exports unchanged (CSV and Web package)', () => {
  for (const study of ['-Smith 2010', '-cmd', ' -x']) {
    const csv = R.exportCSV(one(study), 'binary2x2').csv;
    assert.ok(csv.split('\r\n')[1].includes(',' + study + ','), study);
    assert.ok(R.exportPackage(one(study), 'binary2x2', meta).information.includes(study + ','), study);
  }
});

test('leading = + @ (also after spaces) and a leading bare tab or CR are refused, not escaped', () => {
  for (const study of ['=1+1', ' =1+1', '+SUM(A1)', '@formula', '\tX', '\t-1', '\rX', '\r=1']) {
    assert.throws(() => R.exportCSV(one(study), 'binary2x2'), /formula|unsafe/i, JSON.stringify(study));
    assert.throws(() => R.exportPackage(one(study), 'binary2x2', meta), /formula|unsafe/i, JSON.stringify(study));
  }
  // Metadata fields use the same guard (they are trimmed first, so a leading tab never reaches the file).
  assert.throws(() => R.exportPackage(good, 'binary2x2', {...meta, outcome: '=Outcome'}), /formula|unsafe/i);
  assert.ok(!R.exportPackage(good, 'binary2x2', {...meta, outcome: '\tOutcome'}).results.includes('\t'));
  assert.ok(R.exportPackage(good, 'binary2x2', {...meta, outcome: '-Outcome'}).results.includes('-Outcome'));
});
