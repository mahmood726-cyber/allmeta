import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function parseStudies(text) {');
const end = html.indexOf('    function weightedSums(', start);
assert.ok(start >= 0 && end > start, 'locate production parser');
const ctx = vm.createContext({});
vm.runInContext(html.slice(start, end), ctx);
const parse = text => JSON.parse(JSON.stringify(ctx.parseStudies(text)));
const valid = 'Smith 2019,-0.31,0.21\nLee 2021,0.05,0.30';

for (const row of [
  'Jones 2020,-0.12,0,15',
  'Jones 2020,-0,12,0.15',
  'Jones 2020,extra,-0.12,0.15',
  'Jones 2020,-0.12,0.15,',
  'Jones 2020\textra\t-0.12\t0.15',
  'Jones 2020\t-0.12\t0,15',
]) {
  test('P0-4: surplus fields block the entire dataset: ' + JSON.stringify(row), () => {
    const result = parse(valid + '\n' + row);
    assert.deepEqual(result.studies, []);
    assert.match(result.warnings[0], /Analysis blocked/);
    assert.match(result.warnings.join(' '), /Line 3/);
    assert.match(result.warnings.join(' '), /exactly.*3.*fields/i);
    assert.match(result.warnings.join(' '), /decimal comma/i);
  });
}

test('P0-4: surplus header fields cannot bypass row validation', () => {
  const result = parse('study,extra,estimate,se\n' + valid);
  assert.deepEqual(result.studies, []);
  assert.match(result.warnings.join(' '), /Line 1.*exactly.*3.*fields/i);
});

for (const delimiter of [',', '\t']) {
  test('control: three fields, optional header, comments, scientific notation: ' + JSON.stringify(delimiter), () => {
    const text = '# comment\n\n' + ['study', 'estimate', 'se'].join(delimiter) + '\n'
      + ['Jones 2020', '-0.12', '0.15'].join(delimiter) + '\n'
      + ['Trial B', '+5e-2', '3e-1'].join(delimiter);
    const result = parse(text);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.studies.map(({label, est, se}) => ({label, est, se})), [
      {label: 'Jones 2020', est: -0.12, se: 0.15},
      {label: 'Trial B', est: 0.05, se: 0.3},
    ]);
  });
}

test('control: ordinary rows and missing-field refusal are retained', () => {
  assert.equal(parse(valid).studies.length, 2);
  assert.deepEqual(parse(valid).warnings, []);
  const result = parse(valid + '\nJones,-0.12');
  assert.deepEqual(result.studies, []);
  assert.match(result.warnings.join(' '), /need label, estimate and SE fields/);
});
