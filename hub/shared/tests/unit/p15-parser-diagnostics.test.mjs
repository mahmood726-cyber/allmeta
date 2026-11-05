import { test } from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/rve-extras.js';

// A short leading line is invalid, including '# comment'. Report that refusal
// AND the first error in the following table; never return a partially read fit.
const caught = input => {
  let error;
  try { E.parseStudies(input); } catch (e) { error = e; }
  assert.equal(error?.userFacing, true, 'the whole input must be refused');
  return error.message;
};

for (const [name, delimiter] of [['comma', ','], ['semicolon', ';'], ['tab', '\t']]) {
  for (const prefix of ['# comment', 'comment']) {
    const row = values => values.join(delimiter);
    test(`P15-R2 plant: ${name} ${prefix} reports both the short line and bad observation`, () => {
      const message = caught(`${prefix}\n\n${row(['A', 'oops', '.04'])}\n${row(['B', '.2', '.04'])}`);
      assert.match(message, /^Line 1: needs at least 3/);
      assert.match(message, /\nLine 3: effect size yi 'oops' is not a number\./);
    });

    test(`P15-R2 control: ${name} ${prefix} before valid observations is still refused`, () => {
      const message = caught(`${prefix}\n\n${row(['#A', '.1', '.04'])}\n${row(['B', '.2', '.04'])}`);
      assert.equal(message, 'Line 1: needs at least 3 comma-separated columns (cluster, yi, vi); found 1.');
    });
  }

  test(`P15-R2 plant: ${name} diagnostic retains the following reordered SE header`, () => {
    const input = ['# note', '', ['dose', 'se', 'study', 'yi'].join(delimiter),
      ['1', 'oops', '#A', '.1'].join(delimiter)].join('\r\n');
    const message = caught(input);
    assert.match(message, /^Line 1: needs at least 3/);
    assert.match(message, /\nLine 4: standard error 'se' \(column 2\) must be a positive number/);
  });
}

test('P15-R2 plant: consecutive short lines retain physical line numbers without recursion', () => {
  const prefix = Array(10000).fill('# note').join('\n');
  const message = caught(`${prefix}\n\nA,oops,.04`);
  assert.match(message, /^Line 1: needs at least 3/);
  assert.match(message, /\nLine 10000: needs at least 3/);
  assert.match(message, /\nLine 10002: effect size yi 'oops' is not a number/);
});

test('P15-R2 plant: a later quoting error does not hide the leading short-line refusal', () => {
  const message = caught('# note\n\n"open,.1,.04');
  assert.match(message, /^Line 1: needs at least 3/);
  assert.match(message, /\nLine 3: unclosed double quote/);
});

test('P15-R2 control: ordinary and hash labels still use the same valid header and rows', () => {
  for (const label of ['A', '#A']) {
    assert.deepEqual(E.parseStudies(`dose;se;study;yi\n1;.2;${label};.1`).rows,
      [{ cluster: label, yi: .1, vi: .2 * .2, X: [1, 1] }]);
  }
  assert.equal(caught('\n\nA,oops,.04'), "Line 3: effect size yi 'oops' is not a number.");
  assert.equal(caught('# note'), 'Line 1: needs at least 3 comma-separated columns (cluster, yi, vi); found 1.');
});
