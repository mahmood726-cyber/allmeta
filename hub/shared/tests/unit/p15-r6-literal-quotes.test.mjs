import { test } from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/rve-extras.js';

// Synthetic parser cases: quotes embedded in an unquoted field are literal.
const rows = label => [
  { cluster: label, yi: 0.2, vi: 0.04, X: [1] },
  { cluster: 'Other', yi: -0.1, vi: 0.09, X: [1] },
];
const input = (label, delim) => `${label}${delim}0.2${delim}0.04\nOther${delim}-0.1${delim}0.09`;

for (const [name, delim] of [['tab', '\t'], ['comma', ','], ['semicolon', ';']]) {
  const kind = name === 'comma' ? 'control' : 'plant';
  test(`${kind} P15-R6 review: headerless ${name} preserves an embedded literal quote`, () => {
    const label = 'Study 12" follow-up';
    const parsed = E.parseStudies(input(label, delim));
    assert.equal(parsed.delimiter, name);
    assert.equal(parsed.header, false);
    assert.deepEqual(parsed.rows, rows(label));
  });

  test(`control P15-R6 review: ${name} header preserves the same literal quote`, () => {
    const label = 'Study 12" follow-up';
    const parsed = E.parseStudies(`cluster${delim}yi${delim}vi\n${input(label, delim)}`);
    assert.equal(parsed.delimiter, name);
    assert.equal(parsed.header, true);
    assert.deepEqual(parsed.rows, rows(label));
  });

  test(`control P15-R6 review: headerless ${name} without quotes`, () => {
    const parsed = E.parseStudies(input('Study 12 follow-up', delim));
    assert.equal(parsed.delimiter, name);
    assert.deepEqual(parsed.rows, rows('Study 12 follow-up'));
  });

  test(`control P15-R6 review: ${name} field-start quotes, escapes and outer whitespace`, () => {
    const parsed = E.parseStudies(input('  "Study ""12""\tfollow-up"  ', delim));
    assert.equal(parsed.delimiter, name);
    assert.deepEqual(parsed.rows, rows('Study "12"\tfollow-up'));
    // Each numeric field also opens quoting at its own field start.
    assert.deepEqual(E.parseStudies(`"Study"${delim}"0.2"${delim}"0.04"`).rows,
      [{ cluster: 'Study', yi: 0.2, vi: 0.04, X: [1] }]);
  });
}

test('plant P15-R6 review: CSV counts commas after a semicolon and literal quote', () => {
  const label = 'Study; 12" follow-up';
  const parsed = E.parseStudies(input(label, ','));
  assert.equal(parsed.delimiter, 'comma');
  assert.deepEqual(parsed.rows, rows(label));
});

for (const label of ['Study, "12 follow-up', 'Study; "12 follow-up']) {
  test(`plant P15-R6 review: TSV punctuation does not open quoting in ${JSON.stringify(label)}`, () => {
    const parsed = E.parseStudies(input(label, '\t'));
    assert.equal(parsed.delimiter, 'tab');
    assert.deepEqual(parsed.rows, rows(label));
  });
}

test('control P15-R6 review: paired literal quotes in headerless TSV', () => {
  assert.deepEqual(E.parseStudies(input('Study "12" follow-up', '\t')).rows,
    rows('Study "12" follow-up'));
});

test('control P15-R6 review: malformed quoting still has a row-specific refusal', () => {
  for (const delim of ['\t', ',', ';']) {
    for (const label of ['"Study" x', '"" ""', '" " "Study"']) {
      assert.throws(() => E.parseStudies(input(label, delim)),
        e => e.userFacing === true && /Line 1: text after a closing quote/.test(e.message));
    }
    assert.throws(() => E.parseStudies(`cluster${delim}yi${delim}vi\n"open${delim}.2${delim}.04`),
      e => e.userFacing === true && /Line 2: unclosed double quote/.test(e.message));
  }
});
