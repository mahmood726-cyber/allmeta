import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../../csv-upload.js', import.meta.url), 'utf8'), context);
const parse = (text, columns) => JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse(text, columns)));

for (const name of ['study', 'label']) {
  test(`capitalized ${name} maps to its declared string column`, () => {
    const header = name[0].toUpperCase() + name.slice(1);
    const columns = [{ name, type: 'string', required: true }, { name: 'yi', type: 'float' }];
    const result = parse(`${header},yi\n0,0.2\n123,0.3`, columns);
    assert.deepEqual(result.rows, [{ [name]: '0', yi: 0.2 }, { [name]: '123', yi: 0.3 }]);
    assert.deepEqual(result.warnings, [`Header "${header}" mapped to "${name}" (Levenshtein 0)`]);
  });

  test(`${name} exact string and numeric-destination controls`, () => {
    const exact = parse(`${name},yi\n0,0.2`, [{ name, type: 'string' }, { name: 'yi', type: 'float' }]);
    assert.deepEqual(exact.rows, [{ [name]: '0', yi: 0.2 }]);
    assert.deepEqual(exact.warnings, []);
    // A one-character near-match must still not turn a label into a measurement.
    const numericName = name.slice(0, -1);
    const guarded = parse(`${name},yi\n123,0.2`, [{ name: numericName, type: 'float', required: true }, { name: 'yi', type: 'float' }]);
    assert.deepEqual(guarded.rows, [{ [name]: '123', yi: 0.2, [numericName]: null }]);
    assert.equal(guarded.warnings.length, 1);
    assert.match(guarded.warnings[0], /refused missing required value/);
  });
}

test('blank required explicit strings are null and diagnosed, retaining all records', () => {
  const columns = [{ name: 'yi', type: 'float' }, { name: 'study', type: 'string', required: true }];
  const result = parse('yi,study\n0.1,\n0.2,   \n0.3\n0.4,0', columns);
  assert.deepEqual(result.rows, [
    { yi: 0.1, study: null }, { yi: 0.2, study: null },
    { yi: 0.3, study: null }, { yi: 0.4, study: '0' }
  ]);
  assert.deepEqual(result.warnings, [1, 2, 3].map(row =>
    `row ${row}: column "study": refused missing required value. Supply this column and its value.`));
});

test('required implicit strings, optional explicit strings and complete strings retain their contracts', () => {
  const implicit = parse('study,yi\n,0.1', [{ name: 'study', required: true }, { name: 'yi', type: 'float' }]);
  assert.deepEqual(implicit.rows, [{ study: null, yi: 0.1 }]);
  assert.equal(implicit.warnings.length, 1);
  const optional = parse('study,yi\n,0.1', [{ name: 'study', type: 'string' }, { name: 'yi', type: 'float' }]);
  assert.deepEqual(optional.rows, [{ study: '', yi: 0.1 }]);
  assert.deepEqual(optional.warnings, []);
  const complete = parse('study,yi\n0,0.1', [{ name: 'study', type: 'string', required: true }, { name: 'yi', type: 'float' }]);
  assert.deepEqual(complete.rows, [{ study: '0', yi: 0.1 }]);
  assert.deepEqual(complete.warnings, []);
});

for (const ratio of ['or', 'rr', 'hr']) {
  test(`fully declared ${ratio}/CI schema accepts case-only header matches`, () => {
    const columns = [ratio, 'lower', 'upper'].map(name => ({ name, type: 'float', required: true }));
    const result = parse(`${ratio.toUpperCase()},Lower,UPPER\n2,1,4`, columns);
    assert.deepEqual(result.rows, [{ [ratio]: 2, lower: 1, upper: 4 }]);
    assert.equal(result.warnings.length, 3);
    assert.ok(result.warnings.every(w => /mapped to.*Levenshtein 0/.test(w)));
    const upperSchema = columns.map(c => ({ ...c, name: c.name.toUpperCase() }));
    const reverse = parse(`${ratio},lower,upper\n2,1,4`, upperSchema);
    assert.deepEqual(reverse.rows, [{ [ratio.toUpperCase()]: 2, LOWER: 1, UPPER: 4 }]);
  });

  test(`${ratio}/CI exact schema and undeclared-schema refusal controls`, () => {
    const columns = [ratio, 'lower', 'upper'].map(name => ({ name, type: 'float', required: true }));
    const exact = parse(`${ratio},lower,upper\n2,1,4`, columns);
    assert.deepEqual(exact.rows, [{ [ratio]: 2, lower: 1, upper: 4 }]);
    assert.deepEqual(exact.warnings, []);
    const partial = parse(`${ratio},lower,upper\n2,1,4`, columns.slice(0, 1));
    assert.deepEqual(partial.rows, [{ [ratio]: null, lower: null, upper: null }]);
    assert.equal(partial.warnings.length, 1);
    assert.match(partial.warnings[0], /refused ratio \+ CI input/);
    const undeclared = parse(`${ratio.toUpperCase()},LOWER,UPPER\n2,1,4`, [{ name: 'yi', type: 'float' }, { name: 'se', type: 'float' }]);
    assert.deepEqual(undeclared.rows, [{ [ratio.toUpperCase()]: null, LOWER: null, UPPER: null, yi: null, se: null }]);
    assert.equal(undeclared.warnings.length, 1);
    assert.match(undeclared.warnings[0], /refused ratio \+ CI input/);
  });
}
