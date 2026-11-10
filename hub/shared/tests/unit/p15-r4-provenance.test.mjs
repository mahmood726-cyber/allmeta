import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const suiteURL = new URL('./p15-r4-conditioning.test.mjs', import.meta.url);
const suite = readFileSync(suiteURL, 'utf8');
const inputURL = new URL('./p15-r4-conditioning-input.json', import.meta.url);
const lf = readFileSync(inputURL, 'utf8').replace(/\r\n/g, '\n');
const reference = JSON.parse(readFileSync(new URL('./p15-r4-conditioning-reference.json', import.meta.url), 'utf8'));

// Execute the actual provenance assertion with virtual checkout bytes. This
// exercises CRLF even when CI checks out LF, without rewriting any fixture.
const start = suite.indexOf('const root =');
const end = suite.indexOf('\nfor (const c of input.cases)');
assert.ok(start >= 0 && end > start, 'locate the provenance setup and control');
const provenance = suite.slice(start, end).replaceAll('import.meta.url', 'suiteURL');
function checkProvenance(text) {
  let controls = 0;
  vm.runInNewContext(provenance, {
    suiteURL: suiteURL.href, URL, Buffer, assert, createHash,
    readFileSync(url, encoding) {
      if (url.href !== inputURL.href) return readFileSync(url, encoding);
      return encoding ? text : Buffer.from(text, 'utf8');
    },
    test(name, fn) {
      assert.equal(name, 'P15-R4 control: native R fixture records inputs and package versions');
      controls++;
      fn();
    }
  });
  assert.equal(controls, 1, 'the existing integrity assertion must execute');
}

test('P15-R4 provenance control: recorded LF checkout is accepted', () => {
  checkProvenance(lf);
});

test('P15-R4 provenance plant: CRLF checkout retains the recorded LF checksum', () => {
  checkProvenance(lf.replaceAll('\n', '\r\n'));
});

test('P15-R4 provenance plant: mixed checkout line endings retain the recorded LF checksum', () => {
  checkProvenance(lf.replace('\n', '\r\n'));
});

for (const [name, change] of [
  ['non-line-ending whitespace', text => ' ' + text],
  ['an input value', text => text.replace('0.8', '0.7')]
]) {
  test(`P15-R4 provenance control: changing ${name} still fails integrity`, () => {
    for (const text of [lf, lf.replaceAll('\n', '\r\n')]) {
      assert.throws(() => checkProvenance(change(text)), {
        code: 'ERR_ASSERTION', operator: 'strictEqual', actual: reference.provenance.input_md5
      });
    }
  });
}
