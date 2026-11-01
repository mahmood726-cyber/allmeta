// Synthetic software fixtures only, never research output.
// The CSV/tab study-table path must treat one unusable row the way the XML path does (review of #249): it never refuses the
// whole table, it is never imported or altered, and it is never dropped silently. It is listed as { row, studyId, study,
// reason } (row = the table row number, header = row 1, as the CSV messages count) on its subgroup's and outcome's skipped
// list; every other subgroup imports exactly what the clean table imports; choosing the subgroup that holds it is refused,
// naming the row and its reason. A row that cannot be placed in a subgroup (wrong column count, unsupported applicability)
// is listed on review.skipped and refuses every selection, since no subgroup can then be shown to be complete. A table with
// no usable row at all is refused, listing every row. Header problems (ambiguous/duplicate/missing Study header) and
// malformed quoting still refuse the table, as malformed XML refuses the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const fixture = name => readFileSync(new URL('../fixtures/revman/' + name, import.meta.url), 'utf8');
const schemaOf = {binary: 'binary2x2', continuous: 'continuous', generic: 'generic'};
const choose = (r, c, o, g) => R.select(r, {comparison: c, outcome: o, subgroup: g}, schemaOf[r.comparisons[c].outcomes[o].type], {filename: 't.csv'});
const replaced = (text, from, to) => { const out = text.replace(from, to); assert.notEqual(out, text, 'planted edit applied'); return out; };

// Every (comparison, outcome, subgroup) of the clean table other than `except` imports identically from `text`.
function othersUnchanged(good, text, except) {
  const clean = R.parseText(good), changed = R.parseText(text);
  let n = 0;
  clean.comparisons.forEach((c, ci) => c.outcomes.forEach((o, oi) => o.subgroups.forEach((g, gi) => {
    if (except.some(([a, b, d]) => a === ci && b === oi && d === gi)) return;
    assert.deepEqual(choose(changed, ci, oi, gi), choose(clean, ci, oi, gi), [ci, oi, gi].join('/'));
    n++;
  })));
  return n;
}
const rowsOf = text => text.trim().split(/\r?\n/).length - 1;
const accounted = r => r.studyCount + (r.skipped || []).length + r.comparisons.reduce((s, c) => s + c.outcomes.reduce((t, o) => t + (o.skipped || []).length, 0), 0);

test('valid tables: no skipped list anywhere (key absent, as in the XML path)', () => {
  for (const f of ['binary.csv', 'continuous.csv', 'generic.csv', 'pairwise.csv', 'pairwise-binary.csv']) {
    const r = R.parseText(fixture(f));
    assert.equal(JSON.stringify(r).includes('"skipped"'), false, f);
    assert.equal(accounted(r), rowsOf(fixture(f)), f);
  }
});

test('events > total in one row: listed, not imported, its subgroup refused; the other comparison imports unchanged', () => {
  const good = fixture('binary.csv'), text = replaced(good, ',7,60,', ',61,60,');
  const r = R.parseText(text), o = r.comparisons[0].outcomes[0];
  assert.deepEqual(o.skipped, [{row: 3, studyId: 's2', study: '試験 β', reason: 'Invalid events/total in this row'}]);
  assert.deepEqual(o.subgroups[0].skipped, o.skipped);
  assert.deepEqual(o.subgroups[0].studies.map(s => s.id), ['s1'], 'the bad row is not imported');
  assert.equal(r.studyCount, 2);
  assert.throws(() => choose(r, 0, 0, 0), /cannot be imported[\s\S]*row 3, study 試験 β: Invalid events\/total in this row[\s\S]*Nothing from this subgroup is imported/);
  assert.equal(othersUnchanged(good, text, [[0, 0, 0]]), 1);
  assert.equal(accounted(r), rowsOf(text));
});

test('non-numeric, impossible SD and invalid year rows are listed with the reasons the table used to refuse with', () => {
  const good = fixture('continuous.csv');
  for (const [text, why] of [
    [replaced(good, ',-1.5,', ',x,'), /^Invalid number for row 3 m1i: x$/],
    [replaced(good, ',2,60,', ',-2,60,'), /^Invalid SD or continuous total in this row/],
    [replaced(good, '2021', '20xx'), /^Invalid study year: 20xx$/]]) {
    const r = R.parseText(text), o = r.comparisons[0].outcomes[0];
    assert.equal(o.skipped.length, 1, String(why));
    assert.deepEqual([o.skipped[0].row, o.skipped[0].studyId, o.skipped[0].study], [3, '試験 β', '試験 β']);
    assert.match(o.skipped[0].reason, why);
    assert.deepEqual(o.studies.map(s => s.id), ['Étude α']);
    assert.throws(() => choose(r, 0, 0, 0), /cannot be imported/);
    assert.equal(accounted(r), rowsOf(text));
  }
});

test('a row whose data columns are ambiguous is listed under its own outcome, which cannot be chosen; the rest imports', () => {
  const csv = 'Analysis group,Analysis number,Analysis name,Subgroup,Study,Study year,GIV Mean,GIV SE,Experimental mean,Experimental SD,Experimental cases,Experimental N,Control mean,Control SD,Control cases,Control N\n' +
    '1,1,Events,,A,2020,,,,,0,40,,,4,42\n1,2,Effect,,B,2021,-0.25,0.125,2,1,,30,3,1,,31\n1,1,Events,,C,2022,,,,,1,40,,,5,42';
  const r = R.parseText(csv), [events, effect] = r.comparisons[0].outcomes;
  assert.deepEqual(choose(r, 0, 0, 0).map(x => [x.study, x.ai, x.n1i, x.ci, x.n2i]), [['A', 0, 40, 4, 42], ['C', 1, 40, 5, 42]]);
  assert.equal(events.skipped, undefined);
  assert.deepEqual([effect.name, effect.type, effect.studies, effect.subgroups], ['Effect', 'unsupported', [], []]);
  assert.deepEqual(effect.skipped, [{row: 3, studyId: 'B', study: 'B', reason: 'Unsupported or ambiguous mixed data/header in CSV row 3'}]);
  for (const schema of ['binary2x2', 'continuous', 'generic'])
    assert.throws(() => R.select(r, {comparison: 0, outcome: 1, subgroup: 0}, schema), /row 3, study B: Unsupported or ambiguous mixed data/);
  assert.equal(accounted(r), 3);
});

test('a row whose effect measure differs from its outcome is listed in its subgroup; that subgroup is refused', () => {
  const good = fixture('pairwise.csv'), text = replaced(good, 'Synthetic D,2023,MD', 'Synthetic D,2023,SMD');
  const r = R.parseText(text), o = r.comparisons[0].outcomes[0];
  assert.deepEqual(o.skipped, [{row: 5, studyId: 'synthetic-3', study: 'Synthetic D', reason: 'Mixed data types or effect measures in outcome Synthetic effect'}]);
  assert.equal(o.studies.length, 4);
  assert.throws(() => choose(r, 0, 0, 0), /row 5, study Synthetic D: Mixed data types or effect measures/);
});

test('a row that cannot be placed in a subgroup is listed on review.skipped and refuses every selection', () => {
  const csv = 'Comparison,Outcome,Study,Effect Estimate,SE\nC,O,A,0.1,0.2\nC,O,B,0.3\nC,O2,D,0.1,0.1';
  const r = R.parseText(csv);
  assert.deepEqual(r.skipped, [{row: 3, studyId: 'B', study: 'B', reason: 'CSV row 3 has 4 columns; expected 5.'}]);
  assert.equal(r.studyCount, 2);
  for (const o of [0, 1]) assert.throws(() => choose(r, 0, o, 0), /could not be placed in a subgroup[\s\S]*row 3, study B: CSV row 3 has 4 columns; expected 5\.[\s\S]*Nothing is imported/);
  const app = 'Comparison,Outcome,Applicability,Study,Effect Estimate,SE\nC,O,,A,0.1,0.2\nC,O,SOMETIMES,B,0.3,0.1';
  assert.deepEqual(R.parseText(app).skipped, [{row: 3, studyId: 'B', study: 'B', reason: 'Unsupported applicability in row 3'}]);
  // With no comparison/outcome/subgroup columns every row belongs to the one subgroup, so the row is placed there.
  const flat = R.parseText('Study,Effect Estimate,SE\nA,0.1,0.2\nB,0.3');
  assert.equal(flat.skipped, undefined);
  assert.deepEqual(flat.comparisons[0].outcomes[0].skipped, [{row: 3, studyId: 'B', study: 'B', reason: 'CSV row 3 has 2 columns; expected 3.'}]);
  assert.throws(() => choose(flat, 0, 0, 0), /cannot be imported[\s\S]*row 3, study B/);
});

test('a table with no usable row, and header/quoting problems, still refuse the whole table', () => {
  assert.throws(() => R.parseText('Study,Effect Estimate,SE\nA,0.1\nB,x,0.2'), /No usable study row[\s\S]*row 2, study A: CSV row 2 has 2 columns; expected 3; row 3, study B: Invalid number for row 3 yi: x/);
  assert.throws(() => R.parseText('Study,Mean,SE\nA,0.8,0.1'), /header/i);
  assert.throws(() => R.parseText('Study,Effect Estimate,SE,SE\nA,0.8,0.1,0.2'), /Ambiguous duplicate header/);
  assert.throws(() => R.parseText('Year,Effect Estimate,SE\n2020,0.8,0.1'), /Missing Study header/);
  assert.throws(() => R.parseText('Study,Effect Estimate,SE\n"unclosed,0.1,0.2'), /quot/i);
});

test('the listed row is never altered and its text is not interpreted', () => {
  const good = fixture('binary.csv'), text = replaced(good, 's2,試験 β,2021,7,', 's2,=HYPERLINK(x),2021,7x,');
  const r = R.parseText(text), [row] = r.comparisons[0].outcomes[0].skipped;
  assert.deepEqual(row, {row: 3, studyId: 's2', study: '=HYPERLINK(x)', reason: 'Invalid number for row 3 ai: 7x'});
  assert.equal(othersUnchanged(good, text, [[0, 0, 0]]), 1);
});

test('PLANTED duplicate study in one CSV subgroup: refused at selection (as for XML); the other comparison imports', () => {
  const good = fixture('binary.csv'), text = replaced(good, 'First subgroup,s2,', 'First subgroup,s1,');
  const r = R.parseText(text);
  assert.throws(() => choose(r, 0, 0, 0), /Duplicate study ID in selected subgroup: s1/);
  assert.equal(othersUnchanged(good, text, [[0, 0, 0]]), 1);
});
