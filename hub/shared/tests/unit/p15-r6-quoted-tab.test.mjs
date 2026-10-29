import { test } from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/rve-extras.js';

// Synthetic parser inputs, not R-parity reference values or research data.
const expectedRows = [
  { cluster: 'Study\tA', yi: 0.2, vi: 0.04, X: [1, 1] },
  { cluster: 'Study B', yi: -0.1, vi: 0.09, X: [1, 2] },
];
const input = delim => [
  ['"Study\tA"', '0.2', '0.04', '1'].join(delim),
  ['Study B', '-0.1', '0.09', '2'].join(delim),
].join('\n');

for (const [name, delim] of [['comma', ','], ['semicolon', ';']]) {
  test(`plant P15-R6: headerless ${name} input preserves a quoted tab label`, () => {
    const parsed = E.parseStudies(input(delim));
    assert.equal(parsed.delimiter, name);
    assert.equal(parsed.header, false);
    assert.equal(parsed.nPredictors, 1);
    assert.deepEqual(parsed.rows, expectedRows);
  });

  test(`control P15-R6: ${name} header accepts the same quoted tab label`, () => {
    const header = ['cluster', 'yi', 'vi', 'dose'].join(delim);
    const parsed = E.parseStudies(`${header}\n${input(delim)}`);
    assert.equal(parsed.delimiter, name);
    assert.equal(parsed.header, true);
    assert.deepEqual(parsed.predictorNames, ['dose']);
    assert.deepEqual(parsed.rows, expectedRows);
  });
}

test('plant P15-R6: escaped quotes keep tabs and punctuation inside a CSV label', () => {
  const parsed = E.parseStudies('"Study ""A\tB"", C; D",0.2,0.04\nOther,-0.1,0.09');
  assert.equal(parsed.delimiter, 'comma');
  assert.equal(parsed.header, false);
  assert.deepEqual(parsed.rows, [
    { cluster: 'Study "A\tB", C; D', yi: 0.2, vi: 0.04, X: [1] },
    { cluster: 'Other', yi: -0.1, vi: 0.09, X: [1] },
  ]);
});

test('control P15-R6: genuine TSV retains tab priority and quoted tab content', () => {
  const parsed = E.parseStudies(input('\t'));
  assert.equal(parsed.delimiter, 'tab');
  assert.equal(parsed.header, false);
  assert.deepEqual(parsed.rows, expectedRows);

  // Commas and semicolons are ordinary label content in genuine TSV.
  const punctuation = E.parseStudies('Study, A; B\t0.2\t0.04\nOther\t-0.1\t0.09');
  assert.equal(punctuation.delimiter, 'tab');
  assert.deepEqual(punctuation.rows, [
    { cluster: 'Study, A; B', yi: 0.2, vi: 0.04, X: [1] },
    { cluster: 'Other', yi: -0.1, vi: 0.09, X: [1] },
  ]);
});
