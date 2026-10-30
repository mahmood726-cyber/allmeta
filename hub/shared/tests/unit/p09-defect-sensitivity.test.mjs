import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { harness, read } from '../fixtures/p09-harness.mjs';

// Synthetic defect, NOT an authenticated historical page. Reintroduce the
// reported parseInt truncation / silent row dropping in the real application.
// All callers, calculations and the existing ten test bodies remain unchanged.
function plantTruncation(source) {
  const start = source.indexOf('    function parseTable(text) {');
  const end = source.indexOf('    // --- inverse beta', start);
  assert.ok(start >= 0 && end > start, 'Locate the production parser boundary');
  const mutant = String.raw`    function parseTable(text) {
      return text.split(/\n/).map(function (l, i) {
        if (!l.trim()) return null;
        var parts = l.split(/,/).map(function (s) { return s.trim(); });
        var x = parseInt(parts[0], 10);
        var n = parseInt(parts[1], 10);
        if (!Number.isFinite(x) || !Number.isFinite(n) || n <= 0 || x < 0 || x > n) return null;
        return { x: x, n: n, label: parts[2] || ('Study ' + (i + 1)) };
      }).filter(Boolean);
    }

`;
  return source.slice(0, start) + mutant + source.slice(end);
}

// Register the original assertions with a supplied harness; do not copy or
// weaken their bodies. Fail closed if the original suite changes its imports
// or its five-plants/five-controls contract.
const filename = 'hub/shared/tests/unit/p09-count-validation.test.mjs';
const source = read(filename).replaceAll('\r\n', '\n');
const imports = source.match(/^import .+;$/gm);
assert.equal(imports?.length, 3);
const body = source.replace(/^import .+;$/gm, '');
function cases(makeHarness) {
  const registered = [];
  vm.runInNewContext(body, {
    test: (name, check) => registered.push({ name, check }),
    assert, harness: makeHarness, read
  }, { filename });
  assert.equal(registered.length, 10);
  assert.equal(registered.filter(c => c.name.startsWith('P09-R1 plant:')).length, 5);
  return registered;
}
const current = cases(() => harness());
const planted = cases(() => harness({ transformMain: plantTruncation }));

for (let i = 0; i < current.length; i++) {
  const good = current[i], bad = planted[i];
  assert.equal(good.name, bad.name);
  test('P09 mutation sensitivity: ' + good.name, async t => {
    await good.check();
    if (good.name.startsWith('P09-R1 plant:')) {
      await assert.rejects(async () => bad.check(), error => {
        assert.ok(error instanceof assert.AssertionError, 'Must fail an assertion, not test infrastructure');
        t.diagnostic('Synthetic parser rejected: ' + error.message.split('\n')[0]);
        return true;
      });
    } else {
      await bad.check();
    }
  });
}
