// Synthetic software fixtures only, never research output.
// Review of PR #249: one unusable row, or an outcome type the reader does not import, anywhere in a RevMan file must not
// refuse the whole file. Such rows are NOT imported and ARE listed (outcome.skipped, the same { row, studyId, study, reason }
// list and wording the legacy shared/revman-reader.js uses); every other outcome imports exactly what the clean file imports;
// a selected subgroup that holds such a row is refused with the row and its reason, never silently imported without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const good = readFileSync(new URL('../fixtures/revman/multi.rm5', import.meta.url), 'utf8');
const schemaOf = {binary: 'binary2x2', continuous: 'continuous', generic: 'generic'};
const choose = (r, c, o, g) => R.select(r, {comparison: c, outcome: o, subgroup: g}, schemaOf[r.comparisons[c].outcomes[o].type], {filename: 'multi.rm5'});

// Every (comparison, outcome, subgroup) of the clean file other than `except` imports identically from `text`.
function othersUnchanged(text, except) {
  const clean = R.parseText(good), changed = R.parseText(text);
  let n = 0;
  clean.comparisons.forEach((c, ci) => c.outcomes.forEach((o, oi) => o.subgroups.forEach((g, gi) => {
    if (except.some(([a, b, d]) => a === ci && b === oi && d === gi)) return;
    assert.deepEqual(choose(changed, ci, oi, gi), choose(clean, ci, oi, gi), [ci, oi, gi].join('/'));
    n++;
  })));
  assert.ok(n >= 5);
}

test('valid file: no skipped list anywhere (key absent, as in the legacy reader)', () => {
  const r = R.parseText(good);
  assert.equal(JSON.stringify(r).includes('"skipped"'), false);
  assert.equal(r.studyCount, 9);
});

test('a 0/0 dichotomous row in an unrelated comparison is listed, not fatal; the other comparison imports unchanged', () => {
  const text = good.replace('EVENTS_1="2" TOTAL_1="50"', 'EVENTS_1="0" TOTAL_1="0"');
  assert.notEqual(text, good);
  const r = R.parseText(text), o = r.comparisons[1].outcomes[0];
  assert.deepEqual(o.skipped, [{row: 1, studyId: 's1', study: 'Étude α', reason: 'Invalid positive whole total n1i in this row'}]);
  assert.deepEqual(o.subgroups[0].studies, []);
  assert.equal(r.studyCount, 8);
  assert.throws(() => choose(r, 1, 0, 0), /cannot be imported[\s\S]*row 1, study Étude α: Invalid positive whole total n1i/);
  othersUnchanged(text, [[1, 0, 0]]);
});

test('IV SE="0" is listed with its reason; its subgroup is refused, the sibling subgroup and other outcomes import', () => {
  const text = good.replace('SE="0.125"', 'SE="0"');
  const r = R.parseText(text), o = r.comparisons[0].outcomes[2];
  assert.deepEqual(o.skipped, [{row: 1, studyId: 's1', study: 'Étude α', reason: 'SE must be positive and numerically representable in this row'}]);
  assert.deepEqual(o.subgroups[0].studies.map(s => s.id), ['s2'], 'the bad row is not imported');
  assert.throws(() => choose(r, 0, 2, 0), /cannot be imported[\s\S]*SE must be positive/);
  assert.deepEqual(choose(r, 0, 2, 1).map(x => [x.studyId, x.yi, x.sei]), [['s3', -0.4, 0.25]]);
  othersUnchanged(text, [[0, 2, 0]]);
});

test('an OTHER_OUTCOME table (with and without data rows) is listed as unsupported, never fatal or silently dropped', () => {
  const extra = '<OTHER_OUTCOME NO="2"><NAME>Synthetic other table</NAME><OTHER_SUBGROUP><OTHER_DATA STUDY_ID="s2" VALUE="1"/><OTHER_DATA STUDY_ID="s3" VALUE="2"/></OTHER_SUBGROUP></OTHER_OUTCOME>' +
    '<FUTURE_OUTCOME NO="3"><NAME>Synthetic empty table</NAME></FUTURE_OUTCOME>';
  const text = good.replace('</DICH_OUTCOME></COMPARISON>', '</DICH_OUTCOME>' + extra + '</COMPARISON>');
  assert.notEqual(text, good);
  const r = R.parseText(text), out = r.comparisons[1].outcomes;
  assert.deepEqual(out.slice(1).map(o => [o.name, o.type, o.tag, o.studies, o.subgroups, o.skipped]), [
    ['Synthetic other table', 'unsupported', 'OTHER_OUTCOME', [], [], [
      {row: 1, studyId: 's2', study: '試験 β', reason: 'OTHER_OUTCOME is not an outcome type this importer reads'},
      {row: 2, studyId: 's3', study: 'Synthetic Gamma', reason: 'OTHER_OUTCOME is not an outcome type this importer reads'}]],
    ['Synthetic empty table', 'unsupported', 'FUTURE_OUTCOME', [], [], [
      {row: null, studyId: null, study: null, reason: 'FUTURE_OUTCOME element is not read by this importer'}]]]);
  for (const o of [1, 2]) assert.throws(() => R.select(r, {comparison: 1, outcome: o, subgroup: 0}, 'binary2x2'), /not an outcome type this importer reads/);
  assert.equal(r.studyCount, 9);
  othersUnchanged(text, []);
  assert.equal(R.comparisonToBus(r.comparisons[1]).studies.length, 1, 'bus still takes the readable outcome');
});

test('conservation: imported + listed rows = every data row of the outcome', () => {
  const text = good.replace('SE="0.125"', 'SE="0"').replace('EVENTS_1="7"', 'EVENTS_1="61"').replace('SD_2="2.5"', 'SD_2="x"');
  const r = R.parseText(text);
  const count = (tag) => (text.match(new RegExp('<' + tag + '\\b', 'g')) || []).length;
  const c0 = r.comparisons[0].outcomes;
  assert.equal(c0[0].studies.length + c0[0].skipped.length + r.comparisons[1].outcomes[0].studies.length, count('DICH_DATA'));
  assert.equal(c0[1].studies.length + c0[1].skipped.length, count('CONT_DATA'));
  assert.equal(c0[2].studies.length + c0[2].skipped.length, count('IV_DATA'));
  assert.deepEqual([c0[0].skipped, c0[1].skipped, c0[2].skipped].map(s => s.map(x => [x.row, x.studyId])), [[[2, 's2']], [[2, 's2']], [[1, 's1']]]);
  assert.match(c0[1].skipped[0].reason, /Invalid number/);
});

test('PLANTED: natural-scale (LOG_DATA="NO") generic data for every ratio-named measure are refused', () => {
  const iv = (measure, log) => R.parseText(good.replace('LOG_DATA="YES"', 'LOG_DATA="' + log + '"').replace('<EFFECT_MEASURE>Hazard Ratio</EFFECT_MEASURE>', '<EFFECT_MEASURE>' + measure + '</EFFECT_MEASURE>'));
  for (const m of ['Rate Ratio', 'Odds Ratio (Non-event)', 'Ratio of Means', 'Peto Odds Ratio', 'Risk Ratio', 'Hazard Ratio', 'Odds Ratio']) {
    assert.throws(() => choose(iv(m, 'NO'), 0, 2, 0), /log scale/, m);
    assert.deepEqual(choose(iv(m, 'YES'), 0, 2, 0).map(x => x.yi), [-0.25, 0.1], m + ' on the log scale imports as stored');
  }
  // Difference measures are not ratios: their natural scale is the analysis scale.
  for (const m of ['Mean Difference', 'Std. Mean Difference', 'Risk Difference']) assert.deepEqual(choose(iv(m, 'NO'), 0, 2, 0).map(x => x.yi), [-0.25, 0.1], m);
  // Labels consistent with the legacy reader's mapping.
  assert.equal(iv('Odds Ratio (Non-event)', 'YES').comparisons[0].outcomes[2].effectMeasure, 'OR');
});
