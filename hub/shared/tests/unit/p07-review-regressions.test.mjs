import test from 'node:test';
import assert from 'node:assert/strict';
import { unitCases, usabilityAnnotations } from './p07-review-harness.mjs';

for (const name of ['4 input error: k = 1', '4 refusal does not leave the previous result on screen']) {
  test(`P07 review plant: fixed browser case is required to pass: ${name}`, async () => {
    assert.deepEqual((await usabilityAnnotations()).get(name), []);
  });
}

test('P07 review control: unresolved input diagnostics remain expected failures', async () => {
  const annotations = await usabilityAnnotations();
  for (const name of ['non-numeric', 'negative SE', 'empty', 'mismatched columns']) {
    assert.equal(annotations.get(`4 input error: ${name}`).length, 1, name);
  }
});

const provenanceName = 'P07-R1 control: R fixture records the exact input and native package versions';
function provenance(transform) {
  const cases = unitCases('./p07-translation.test.mjs', (url, bytes) =>
    url.pathname.endsWith('/p07-translation-input.json') ? transform(bytes) : bytes);
  const check = cases.find(c => c.name === provenanceName);
  assert.ok(check, 'Run the existing provenance assertion, not a duplicate hash check');
  return check.run;
}

test('P07 review control: LF input matches the unchanged native R provenance', () => {
  provenance(bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')))();
});

test('P07 review plant: CRLF checkout matches the unchanged native R provenance', () => {
  provenance(bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')))();
});

test('P07 review control: provenance still rejects changed input values', () => {
  assert.throws(provenance(bytes => Buffer.from(bytes.toString('utf8').replace('-1.25', '-1.5'))),
    { code: 'ERR_ASSERTION' });
});
