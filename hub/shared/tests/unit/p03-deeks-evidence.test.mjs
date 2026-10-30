import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const currentSource = read('shared/dta-bivariate.js');
const reference = JSON.parse(read('dta-sroc/tests/fixtures/deeks-reference.json'));
const byId = Object.fromEntries(reference.cases.map(c => [c.id, c]));

function deeksFunction(source) {
  const start = source.indexOf('  function deeksTest(rows) {');
  const end = source.indexOf('  function _lnGamma(', start);
  assert.ok(start >= 0 && end > start, 'Deeks function boundaries exist');
  return source.slice(start, end);
}

function engine(source) {
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(source, context);
  assert.equal(typeof context.module.exports.deeksTest, 'function');
  return context.module.exports;
}

// The extras engine preserves the determinant-based Deeks implementation.
// Plant ONLY that function in the current engine, in memory: all other
// functions stay identical, and no historical/reference file is rewritten.
// This is a function-level replay, not a claim to have a pre-PR checkout.
const historicalDeeks = deeksFunction(read('dta-sroc/plus-bivariate.js'));
const currentDeeks = deeksFunction(currentSource);
assert.notEqual(historicalDeeks, currentDeeks);
assert.match(historicalDeeks, /var det = sw \* swxx - swx \* swx; if \(det === 0\) return null;/);
const planted = engine(currentSource.replace(currentDeeks, () => historicalDeeks));
const current = engine(currentSource);

for (const id of ['constant100', 'constant150']) {
  test(`P03-R1 evidence: ${id} rejects the preserved old Deeks function and accepts the current one`, t => {
    const c = byId[id];
    assert.equal(c.rank, 1);
    assert.equal(c.slopeAliased, true);
    assert.equal(c.expected, null);
    const refuses = implementation => assert.equal(implementation.deeksTest(c.rows), c.expected);
    assert.throws(() => refuses(planted), assert.AssertionError);
    refuses(current);
    t.diagnostic(`${id}: R-aliased slope assertion FAIL on preserved old function; PASS on current function`);
  });
}

for (const id of ['ordinary', 'ordinaryZeroCell']) {
  test(`P03-R1 evidence control: ${id} matches R with both old and current Deeks functions`, () => {
    const c = byId[id];
    assert.equal(c.rank, 2);
    assert.equal(c.slopeAliased, false);
    for (const implementation of [planted, current]) {
      const actual = implementation.deeksTest(c.rows);
      assert.ok(actual);
      assert.equal(actual.df, c.expected.df);
      for (const key of ['slope', 'intercept', 't', 'p']) {
        assert.ok(Number.isFinite(actual[key]), `${id}.${key} must be finite`);
        assert.ok(Math.abs(actual[key] - c.expected[key]) <= 1e-9 * Math.max(1, Math.abs(c.expected[key])),
          `${id}.${key}: JS ${actual[key]}, R ${c.expected[key]}`);
      }
    }
  });
}
