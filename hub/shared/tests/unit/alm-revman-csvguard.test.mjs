// Synthetic names only. Spreadsheet formula-trigger guard for RevMan CSV exports.
// House rule: a cell is a formula trigger when it starts with = + @ (after optional spaces) or with a bare tab or CR.
// Triggers are REFUSED (the export throws), never silently escaped.
// A TEXT cell starting with '-' (after optional spaces) is quote-prefixed: '-2+3' would otherwise run as a formula, and a
// refusal would block ordinary names such as '-Smith 2010'. Numbers never pass through the text guard, so a negative
// estimate stays a number (review of PR #249; alm-sof's '-' allowance is for its numeric cells and is unchanged).
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

test('a text cell starting with "-" is quote-prefixed (CSV and Web package); a negative number is not', () => {
  for (const study of ['-2+3', '-Smith 2010', '-cmd', ' -x']) {
    const row = R.exportCSV(one(study), 'binary2x2').csv.split('\r\n')[1];
    assert.ok(row.includes(",'" + study + ','), study);
    assert.ok(!row.includes(',' + study + ','), 'PLANTED unprefixed ' + JSON.stringify(study));
    const info = R.exportPackage(one(study), 'binary2x2', meta).information;
    assert.ok(info.includes("'" + study + ','), study);
    assert.ok(!info.split('\r\n').some(line => line.startsWith(study + ',')), 'PLANTED unprefixed package ' + JSON.stringify(study));
  }
  const generic = R.select(review, {comparison: 0, outcome: 2, subgroup: 0}, 'generic', {filename: 'multi.rm5'});
  assert.ok(R.exportCSV(generic, 'generic').csv.includes(',-0.25,0.125'), 'numbers stay unprefixed');
});

test('leading = + @ (also after spaces) and a leading bare tab or CR are refused, not escaped', () => {
  for (const study of ['=1+1', ' =1+1', '+SUM(A1)', '@formula', '\tX', '\t-1', '\rX', '\r=1']) {
    assert.throws(() => R.exportCSV(one(study), 'binary2x2'), /formula|unsafe/i, JSON.stringify(study));
    assert.throws(() => R.exportPackage(one(study), 'binary2x2', meta), /formula|unsafe/i, JSON.stringify(study));
  }
  // Metadata fields use the same guard (they are trimmed first, so a leading tab never reaches the file).
  assert.throws(() => R.exportPackage(good, 'binary2x2', {...meta, outcome: '=Outcome'}), /formula|unsafe/i);
  assert.ok(!R.exportPackage(good, 'binary2x2', {...meta, outcome: '\tOutcome'}).results.includes('\t'));
  assert.ok(R.exportPackage(good, 'binary2x2', {...meta, outcome: '-Outcome'}).results.includes(",'-Outcome,"));
});
