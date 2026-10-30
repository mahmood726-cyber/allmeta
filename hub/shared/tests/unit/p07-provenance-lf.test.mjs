import test from 'node:test';
import assert from 'node:assert/strict';
import { lf, replay } from './helpers/isolated-test-replay.mjs';

const testFile = 'hub/shared/tests/unit/p07-translation.test.mjs';
const inputFile = 'hub/shared/tests/unit/p07-translation-input.json';
const files = [testFile, inputFile, 'hub/shared/tests/unit/p07-translation-reference.json',
  'shared/multilevel-reml.js'];
const provenanceTest = 'P07-R1 control: R fixture records the exact input and native package versions';

for (const ending of ['LF', 'CRLF']) {
  test(`P07 provenance ${ending === 'LF' ? 'control' : 'plant'}: ${ending} checkout matches the unchanged recorded input hash`, t => {
    const result = replay(t, { label: `${ending} input bytes`, files, testFile,
      transform: (path, text) => path === inputFile ? lf(text).replace(/\n/g, ending === 'LF' ? '\n' : '\r\n') : text });
    assert.equal(result.status, 0);
    assert.deepEqual(result.failed, []);
    assert.ok(result.passed.includes(provenanceTest));
  });
}

test('P07 provenance control: a real input change is still rejected', t => {
  const result = replay(t, { label: 'changed description, identical numerical rows', files, testFile,
    transform: (path, text) => path === inputFile ? text.replace('Exactly representable', 'Changed representable') : text });
  assert.equal(result.status, 1);
  assert.deepEqual(result.failed, [provenanceTest]);
  assert.match(result.stdout, /ERR_ASSERTION/);
});

const corpusReplay = 'hub/shared/tests/unit/p07-replay.mjs';
const corpusFile = 'multilevel-ma/validate/corpus/corpus.json';
const corpusFiles = [corpusReplay, corpusFile, 'multilevel-ma/validate/corpus/reference.json',
  'multilevel-ma/validate/MANIFEST.json', inputFile, 'shared/multilevel-reml.js',
  'hub/shared/tests/_kon_data.json'];

for (const ending of ['LF', 'CRLF']) {
  test(`P07 manifest ${ending === 'LF' ? 'control' : 'plant'}: ${ending} checkout preserves recorded hashes, byte counts and parity`, t => {
    const result = replay(t, { label: `${ending} corpus replay`, files: corpusFiles, testFile: corpusReplay,
      transform: (_path, text) => lf(text).replace(/\n/g, ending === 'LF' ? '\n' : '\r\n') });
    assert.equal(result.status, 0);
    assert.deepEqual(result.failed, []);
    assert.match(result.stdout, /"checks": 308/);
    assert.match(result.stdout, /"passed": 308/);
  });
}

test('P07 manifest control: non-newline byte changes are still rejected', t => {
  const result = replay(t, { label: 'extra corpus whitespace, identical numerical values',
    files: corpusFiles, testFile: corpusReplay,
    transform: (path, text) => path === corpusFile ? `${text} ` : text });
  assert.equal(result.status, 1);
  assert.equal(result.failed.length, 1);
  assert.match(result.stdout, /ERR_ASSERTION/);
});
