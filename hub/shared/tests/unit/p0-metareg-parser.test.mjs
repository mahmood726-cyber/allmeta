import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../meta-regression/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function parseStudies(text)');
const end = html.indexOf('    function fit(studies, tau2)', start);
assert.ok(start >= 0 && end > start, 'Production parser is present');
const ctx = vm.createContext({});
vm.runInContext(html.slice(start, end), ctx);
const parse = text => JSON.parse(JSON.stringify(ctx.parseStudies(text)));
const good = 'Control, -0.12, 0.15, 10';

for (const [column, index] of [['estimate', 1], ['SE', 2], ['moderator', 3]]) {
  test('plant P0-12: reject numeric prefixes in ' + column, () => {
    for (const value of ['0.l2', '80%', '1e', '2mg', '0x10']) {
      const row = ['Ahmed 2015', '0.12', '0.15', '10'];
      row[index] = value;
      const result = parse(row.join(',') + '\n' + good);
      assert.deepEqual(result.studies.map(s => s.label), ['Control'], value);
      assert.deepEqual(result.warnings, ['Line 1: non-numeric'], value);
    }
  });
}

test('plant P0-12: malformed initial data always has its physical line number', () => {
  for (let line = 1; line <= 4; line++) {
    for (const value of ['−0.12', 'NA', '', 'Infinity', '1e309']) {
      const result = parse('\n'.repeat(line - 1) + 'Ahmed 2015,' + value + ',0.15,10\n' + good);
      assert.deepEqual(result.warnings, ['Line ' + line + ': non-numeric']);
      assert.deepEqual(result.studies.map(s => s.label), ['Control']);
    }
  }
  const result = parse('Ahmed,missing,missing,missing\n' + good);
  assert.deepEqual(result.warnings, ['Line 1: non-numeric']);
});

test('control: signed decimals, exponents, tabs and comma-containing labels remain valid', () => {
  const result = parse('Trial, subgroup, -.12, +.15, 1e1\nTabbed\t+2.\t1.5E-1\t-2e+1');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.studies, [
    { label: 'Trial, subgroup', est: -0.12, se: 0.15, x: 10, v: 0.0225 },
    { label: 'Tabbed', est: 2, se: 0.15, x: -20, v: 0.0225 }
  ]);
});

test('control: documented header, comments and blank lines are accepted', () => {
  for (const prefix of ['', '# label, estimate, SE, moderator\n\n', 'label, estimate, SE, moderator\n']) {
    const result = parse(prefix + good);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.studies.length, 1);
    assert.equal(result.studies[0].est, -0.12);
  }
});

test('plant P0-12: only the first non-comment record can be a header', () => {
  const result = parse('# comment\n\n\nlabel, estimate, SE, moderator\n' + good);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.studies.length, 1);
  assert.deepEqual(parse('Broken, NA, 0.1, 10\nlabel, estimate, SE, moderator\n' + good).warnings,
    ['Line 1: non-numeric', 'Line 2: non-numeric']);
});

test('control: short rows and nonpositive SE retain explicit errors', () => {
  const result = parse('Short,1,2\nZero,1,0,2\nNegative,1,-0.1,2\n' + good);
  assert.deepEqual(result.warnings, ['Line 1: need 4 columns', 'Line 2: SE≤0', 'Line 3: SE≤0']);
  assert.equal(result.studies.length, 1);
});
