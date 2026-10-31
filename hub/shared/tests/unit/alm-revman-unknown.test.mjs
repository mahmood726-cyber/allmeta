// Synthetic software fixtures only, never research output.
// An element directly inside a COMPARISON that the v2 reader (shared/alm-revman.js) does not read must be listed, never
// ignored silently - the same list and wording the legacy shared/revman-reader.js gives (unit/revman-reader-gaps.test.mjs):
// one { row, studyId, study, reason: '<TAG> is not an outcome type this importer reads' } entry per data row it holds, or
// one { row: null, studyId: null, study: null, reason: '<TAG> element is not read by this importer' } entry when it holds
// none, as an outcome { type: 'unsupported', tag, studies: [], subgroups: [] }. Known metadata (NAME, GROUP_LABEL_1/2, and
// ID/NO, which the v2 reader reads as the comparison id) is not reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const src = readFileSync(new URL('../fixtures/revman-gaps/unknown-element.rm5', import.meta.url), 'utf8');
const dataRows = text => [.../<ANALYSES_AND_DATA>[\s\S]*<\/ANALYSES_AND_DATA>/.exec(text)[0].matchAll(/<\w+\b[^>]*\bSTUDY_ID="([^"]*)"/g)].map(m => m[1]);
const accounted = r => r.comparisons.flatMap(c => c.outcomes.flatMap(o => [...o.studies.map(s => s.id), ...(o.skipped || []).map(s => s.studyId)])).filter(id => id != null);

test('SYNTHETIC_NOTE inside a COMPARISON is listed as unsupported content with the legacy wording; the valid outcome is unchanged', () => {
  const r = R.parseText(src), [c] = r.comparisons;
  assert.deepEqual(c.outcomes.map(o => [o.name, o.type, o.tag, o.studies.length, o.skipped]), [
    ['Synthetic dichotomous events', 'binary', undefined, 2, undefined],
    ['Synthetic other data table', 'unsupported', 'OTHER_OUTCOME', 0, [
      {row: 1, studyId: 'STD-Unk-B', study: 'Synthetic Unk Beta', reason: 'OTHER_OUTCOME is not an outcome type this importer reads'},
      {row: 2, studyId: 'STD-Unk-C', study: 'Synthetic Unk Gamma', reason: 'OTHER_OUTCOME is not an outcome type this importer reads'}]],
    ['SYNTHETIC_NOTE', 'unsupported', 'SYNTHETIC_NOTE', 0, [
      {row: null, studyId: null, study: null, reason: 'SYNTHETIC_NOTE element is not read by this importer'}]]]);
  assert.deepEqual(c.outcomes[2].subgroups, []);
  assert.throws(() => R.select(r, {comparison: 0, outcome: 2, subgroup: 0}, 'binary2x2'), /SYNTHETIC_NOTE is not an outcome type this importer reads/);
  assert.deepEqual(R.select(r, {comparison: 0, outcome: 0, subgroup: 0}, 'binary2x2').map(x => [x.studyId, x.ai, x.n1i, x.ci, x.n2i]),
    [['STD-Unk-A', 4, 40, 9, 42], ['STD-Unk-B', 11, 55, 13, 53]]);
  assert.equal(r.studyCount, 2);
  assert.deepEqual(accounted(r).sort(), dataRows(src).sort());
  assert.deepEqual(R.comparisonToBus(c).studies.map(s => s.id), ['STD-Unk-A', 'STD-Unk-B']);
});

test('known COMPARISON metadata is not reported; an unknown wrapper lists every data row inside it (the v2 reader reads only direct outcomes)', () => {
  const r = R.parseText('<COCHRANE_REVIEW><ANALYSES_AND_DATA><COMPARISON><ID>C1</ID><NO>1</NO><NAME>C</NAME><GROUP_LABEL_1>g1</GROUP_LABEL_1>' +
    '<GROUP_LABEL_2>g2</GROUP_LABEL_2><IV_OUTCOME><NAME>I</NAME><IV_DATA STUDY_ID="x3" EFFECT_SIZE="0.1" SE="0.2"/></IV_OUTCOME>' +
    '<WRAPPER><DICH_OUTCOME NAME="D"><DICH_DATA STUDY_ID="x1" EVENTS_1="1" TOTAL_1="10" EVENTS_2="2" TOTAL_2="10"/></DICH_OUTCOME>' +
    '<EXTRA_DATA STUDY_ID="x2"/></WRAPPER></COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>');
  const [c] = r.comparisons;
  assert.deepEqual([c.id, c.name], ['C1', 'C']);
  assert.deepEqual(c.outcomes.map(o => [o.name, o.type, o.skipped && o.skipped.map(s => [s.row, s.studyId, s.reason])]), [
    ['I', 'generic', [[1, 'x3', 'Unresolved study ID: x3']]],
    ['WRAPPER', 'unsupported', [[1, 'x1', 'WRAPPER is not an outcome type this importer reads'], [2, 'x2', 'WRAPPER is not an outcome type this importer reads']]]]);
});

test('a valid file with only known COMPARISON children lists nothing', () => {
  const r = R.parseText(readFileSync(new URL('../fixtures/revman/multi.rm5', import.meta.url), 'utf8'));
  assert.equal(JSON.stringify(r).includes('"skipped"'), false);
  assert.equal(r.comparisons.flatMap(c => c.outcomes).filter(o => o.type === 'unsupported').length, 0);
});
