import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
// Synthetic, hand-written fixture (see fixtures/revman-ipd/README.md).
const fixture = new URL('../fixtures/revman-ipd/ipd.rm5', import.meta.url);
const source = readFileSync(fixture, 'utf8');

// Independent oracle: the IPD_DATA attributes read straight from the fixture text, not via the parser.
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
const ipdRows = [...source.matchAll(/<IPD_DATA\b[^>]*\/>/g)].map(m => ({id: attr(m[0], 'STUDY_ID'), oe: Number(attr(m[0], 'O_E')), v: Number(attr(m[0], 'VAR'))}));

test('rm5 with a dichotomous AND an IPD (O-E/variance) outcome imports both', () => {
  assert.equal(ipdRows.length, 4);
  const review = R.parseText(source);
  const outcomes = review.comparisons[0].outcomes;
  assert.deepEqual(outcomes.map(o => [o.name, o.type, o.effectMeasure]), [['Synthetic dichotomous events', 'binary', 'OR'], ['Synthetic time to event', 'o_e_var', 'HR']]);
  assert.equal(review.studyCount, 7);
  assert.deepEqual(R.select(review, {comparison: 0, outcome: 0, subgroup: 0}, 'binary2x2').map(r => [r.studyId, r.ai, r.n1i, r.ci, r.n2i]),
    [['STD-Synth-A', 12, 101, 19, 99], ['STD-Synth-B', 0, 45, 3, 47], ['STD-Synth-C', 30, 250, 41, 248]]);
  const ipd = outcomes[1];
  assert.deepEqual(ipd.subgroups.map(g => [g.name, g.studies.map(s => s.id)]),
    [['Synthetic first subgroup', ['STD-Synth-A', 'STD-Synth-B']], ['Synthetic second subgroup', ['STD-Synth-C', 'STD-Synth-D']]]);
  ipd.studies.forEach((s, i) => {
    const want = ipdRows[i];
    assert.equal(s.id, want.id);
    assert.deepEqual(s.oeVar, {oe: want.oe, v: want.v});
    assert.equal(s.precomputed.est, want.oe / want.v);
    assert.equal(s.precomputed.se, 1 / Math.sqrt(want.v));
  });
  // Unchanged contract: O-E/variance rows are not silently fed to a generic-IV app input.
  assert.throws(() => R.select(review, {comparison: 0, outcome: 1, subgroup: 0}, 'generic'), /O-E\/variance/);
});

test('IPD_DATA with a non-positive or missing VAR, or a missing O_E, is refused', () => {
  const first = /<IPD_DATA O_E="-3.4567" STUDY_ID="STD-Synth-A" VAR="7.891"\/>/;
  assert.match(source, first);
  for (const [bad, why] of [['<IPD_DATA O_E="-3.4567" STUDY_ID="STD-Synth-A" VAR="0"/>', /variance/i],
    ['<IPD_DATA O_E="-3.4567" STUDY_ID="STD-Synth-A" VAR="-1"/>', /variance/i],
    ['<IPD_DATA O_E="-3.4567" STUDY_ID="STD-Synth-A"/>', /Invalid number/],
    ['<IPD_DATA STUDY_ID="STD-Synth-A" VAR="7.891"/>', /Invalid number/]]) {
    assert.throws(() => R.parseText(source.replace(first, bad)), why);
  }
});

test('IPD import witness for the independent meta::read.rm5 check (rchecks/revman-ipd.R)', () => {
  const ipd = R.parseText(source).comparisons[0].outcomes[1];
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['subgroup', 'studyId', 'study', 'year', 'o_e', 'var', 'est', 'se'].map(q).join(',')];
  for (const g of ipd.subgroups) for (const s of g.studies)
    lines.push([g.name, s.id, s.name, s.year, s.oeVar.oe, s.oeVar.v, s.precomputed.est, s.precomputed.se].map(q).join(','));
  const out = new URL('../rchecks-out/revman-ipd/', import.meta.url);
  mkdirSync(out, {recursive: true});
  writeFileSync(new URL('app-ipd.csv', out), lines.join('\n') + '\n');
  // Ties the witness to the exact fixture bytes R reads (R compares tools::md5sum).
  writeFileSync(new URL('fixture.md5', out), createHash('md5').update(readFileSync(fixture)).digest('hex') + '\n');
  assert.equal(lines.length, 5);
});
