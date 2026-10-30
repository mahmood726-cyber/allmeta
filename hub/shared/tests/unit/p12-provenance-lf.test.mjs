import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const testURL = new URL('./p07-translation.test.mjs', import.meta.url);
const source = readFileSync(testURL, 'utf8');
const inputURL = new URL('./p07-translation-input.json', import.meta.url);
const lf = readFileSync(inputURL, 'utf8').replace(/\r\n/g, '\n');
const reference = JSON.parse(readFileSync(new URL('./p07-translation-reference.json', import.meta.url), 'utf8'));

// Exercise the actual provenance test's input read with both checkout encodings.
// No alternate hash implementation or numerical engine is substituted.
function provenanceHash(text) {
  const declaration = source.match(/^const inputBytes = .*;$/m)?.[0];
  assert.ok(declaration, 'locate the production provenance input read');
  const bytes = vm.runInNewContext(
    declaration.replace('import.meta.url', JSON.stringify(testURL.href)) + '\ninputBytes;',
    {
      URL,
      readFileSync(url, encoding) {
        assert.equal(url.href, inputURL.href);
        return encoding === 'utf8' ? text : Buffer.from(text, 'utf8');
      },
    },
  );
  return createHash('md5').update(bytes).digest('hex');
}

test('P12 CI control: LF input retains the recorded R provenance hash', () => {
  assert.equal(provenanceHash(lf), reference.provenance.input_md5);
});

test('P12 CI plant: CRLF checkout retains the recorded LF R provenance hash', () => {
  assert.ok(lf.includes('\n'));
  assert.equal(provenanceHash(lf.replace(/\n/g, '\r\n')), reference.provenance.input_md5);
});

test('P12 CI control: a non-line-ending input change still fails provenance', () => {
  assert.notEqual(provenanceHash(lf + ' '), reference.provenance.input_md5);
});
