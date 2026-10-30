import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const {harness, formats, copy} = require('../../../../gosh/tests/plus-input-harness.cjs');
const expected = [{te: 0.1, se: 0.2, label: 'Zeta'}, {te: -0.4, se: 0.3, label: 'Alpha'}, {te: 0.8, se: 0.4, label: 'Beta'}];
const members = [[1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]];
const reference = JSON.parse(readFileSync(new URL('../../../../gosh/tests/fixtures/p13-live-input-reference.json', import.meta.url), 'utf8'));
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
  Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) <= 1e-9, label + ': ' + actual + ' vs ' + expected);

test('P13 review control: native R fixture records input, script and package versions', () => {
  assert.deepEqual(reference.input.te, expected.map(s => s.te));
  assert.deepEqual(reference.input.se, expected.map(s => s.se));
  assert.match(reference.provenance.R, /^R version /);
  assert.equal(reference.provenance.script, 'p13-live-input-reference.R');
  assert.ok(readFileSync(new URL('../../../../gosh/tests/fixtures/' + reference.provenance.script, import.meta.url), 'utf8').includes('gosh(fit'));
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
  assert.deepEqual(reference.provenance.packages.map(p => p.package), ['metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv']);
  for (const p of reference.provenance.packages) assert.ok(p.version);
  assert.deepEqual(reference.models.map(m => m.model), ['FE', 'DL']);
});

function matchesNativeR(actual, model) {
  const ref = reference.models.find(m => m.model === model);
  assert.equal(actual.points.length, ref.points.length);
  assert.equal(actual.rows.length, ref.rows.length);
  for (const p of actual.points) {
    // which(g$incl[i, ]) has R column names; the oracle preserves those names.
    const r = ref.points.find(r => Object.values(r.members).join(',') === p.members.join(','));
    assert.ok(r, 'R membership ' + p.members);
    for (const q of ['mu', 'I2', 'Q', 'H2', 'tau2', 'tau']) near(p[q], r[q], model + ' point ' + p.members + ' ' + q);
  }
  for (const row of actual.rows) for (const [q, value] of Object.entries(ref.rows[row.study - 1])) {
    if (['study', 'with_n', 'without_n'].includes(q)) assert.equal(row[q], value);
    else near(row[q], value, model + ' row ' + row.study + ' ' + q);
  }
}

for (const model of ['FE', 'DL']) {
  test(`P13 review ${model}: capture carries canonical studies in membership order`, () => {
    const h = harness();
    const main = h.run(formats.crlf);
    const a = h.capture(formats.crlf, model);
    assert.deepEqual(a.studies, copy(main.studies));
    assert.deepEqual(a.studies, expected);
    assert.deepEqual(a.points.map(p => p.members), members);
  });

  for (const [format, text] of Object.entries(formats)) {
    test(`P13 review ${model}: live currentState/buildScript ${format}`, () => {
      const h = harness();
      const control = h.current(formats.plain, model);
      const script = h.live.buildScript(control);
      h.run(text);
      const before = h.snapshot();
      const actual = h.current(text, model);
      assert.equal(actual.k, 3);
      assert.equal(actual.model, model);
      assert.deepEqual(actual.te, expected.map(s => s.te));
      assert.deepEqual(actual.se, expected.map(s => s.se));
      assert.deepEqual(actual.points.map(p => p.members), members);
      assert.deepEqual(actual.rows, control.rows);
      assert.equal(h.live.buildScript(actual), script, 'formatting must not change R vectors or membership');
      assert.doesNotMatch(script, /NaN|undefined|Infinity/);
      assert.match(script, /yi<-c\(0\.1,-0\.4,0\.8\)/);
      matchesNativeR(actual, model);
      assert.deepEqual(h.snapshot(), before, 'live capture restores the main analysis');
    });
  }
}

for (const [name, text] of [
  ['malformed row', 'bad'], ['nonpositive SE', '1, 1\n2, 0\n3, 1'],
  ['101 studies', Array(101).fill('.1,.2').join('\n')]
]) test(`P13 review: browser-compatible refusal for ${name}`, () => {
  for (const model of ['FE', 'DL']) {
    const h = harness();
    h.current(formats.plain, model);
    const before = h.snapshot();
    assert.throws(() => h.capture(text, model), /valid effect rows/);
    assert.deepEqual(h.snapshot(), before);
  }
});

test('P13 review control: valid rows and empty sampled-group refusal stay intact', () => {
  const h = harness();
  assert.equal(h.capture(formats.plain, 'FE').k, 3);
  const sampled = Array.from({length: 16}, (_, i) => `${i / 10}, .2`).join('\n');
  assert.throws(() => h.capture(sampled, 'DL', 1), /empty with\/without/);
});
