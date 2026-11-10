import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const suiteURL = new URL('./p11-metap-coverage.test.mjs', import.meta.url);
const source = readFileSync(suiteURL, 'utf8');
const historicalCheck = 'P11-D13 control: the historical reference bytes and paper denominator remain pinned';
const disclosureCheck = 'P11-D13 disclosure: published replay documents the usable nested data it omits';
const lf = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const crlf = bytes => Buffer.from(lf(bytes).toString('utf8').replace(/\n/g, '\r\n'));
const app = new URL('../../../../influence/', import.meta.url);
const { files } = JSON.parse(readFileSync(new URL('validate/MANIFEST.json', app)));

// Node may append a value diff to the message. Check the exact path and
// structured assertion fields so an unrelated failure cannot satisfy a plant.
function pinFailure(path, actual, expected) {
  return error => {
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.equal(error.message.split(/\r?\n/)[0], path);
    assert.equal(error.operator, 'strictEqual');
    assert.equal(error.actual, actual);
    assert.equal(error.expected, expected);
    return true;
  };
}

// Execute the actual contract with checkout bytes supplied in memory. No corpus,
// manifest, reference value or on-disk checkout is changed by these plants.
function runCheck(checkName, transform, suiteSource = source) {
  const checks = new Map();
  vm.runInNewContext(suiteSource
    .replace(/^import .*;\r?$/gm, '')
    .replaceAll('import.meta.url', 'suiteURL'), {
    URL, Buffer, assert, createHash, suiteURL: suiteURL.href,
    readFileSync: url => transform(readFileSync(url), url),
    test: (name, run) => checks.set(name, run),
  }, { filename: suiteURL.pathname });
  assert.ok(checks.has(checkName), `The original contract must still register: ${checkName}`);
  checks.get(checkName)();
}

test('P11-D13 provenance control: LF checkout matches the published pins', () => {
  runCheck(historicalCheck, lf);
});

test('P11-D13 provenance regression: CRLF checkout matches the same LF pins', () => {
  runCheck(historicalCheck, crlf);
});

test('P11-D13 provenance plant: the historical raw-byte reader rejects a CRLF checkout', () => {
  const rawSource = source.replace(
    "const bytes = Buffer.from(read(file.path).toString('utf8').replace(/\\r\\n/g, '\\n'));",
    'const bytes = read(file.path);',
  );
  assert.notEqual(rawSource, source, 'The historical reader must actually be planted');
  assert.match(rawSource, /const bytes = read\(file\.path\);/);
  runCheck(historicalCheck, lf, rawSource);
  const file = files[0];
  const rawBytes = crlf(readFileSync(new URL(file.path, app)));
  assert.notEqual(rawBytes.length, file.bytes);
  assert.throws(() => runCheck(historicalCheck, crlf, rawSource),
    pinFailure(file.path, rawBytes.length, file.bytes));
});

for (const name of ['corpus.json', 'reference.json']) {
  test(`P11-D13 provenance control: altered ${name} still fails its pinned hash`, () => {
    const file = files.find(file => file.path === `validate/corpus/${name}`);
    const original = lf(readFileSync(new URL(file.path, app)));
    const text = original.toString('utf8');
    const altered = text.replace(/\d/, digit => String((Number(digit) + 1) % 10));
    assert.notEqual(altered, text);
    assert.equal(Buffer.byteLength(altered), original.length);
    const alteredHash = createHash('sha256').update(altered).digest('hex');
    assert.notEqual(alteredHash, file.sha256);
    assert.throws(() => runCheck(historicalCheck, (bytes, url) => {
        if (url.pathname.endsWith(`/validate/corpus/${name}`)) {
          return Buffer.from(altered);
        }
        return lf(bytes);
      }), pinFailure(file.path, alteredHash, file.sha256));
  });
}

test('P11-D13 disclosure plant: removing the omission disclosure fails the original assertion', () => {
  runCheck(disclosureCheck, lf);
  assert.throws(() => runCheck(disclosureCheck, (bytes, url) => {
    if (!url.pathname.endsWith('/validate/README.md')) return bytes;
    const text = lf(bytes).toString('utf8');
    const withoutDisclosure = text.split('\n\n').filter(paragraph =>
      !paragraph.startsWith('**Known coverage omission (P11-D13):**') &&
      !paragraph.startsWith('Correcting coverage requires auditing')
    ).join('\n\n');
    assert.notEqual(withoutDisclosure, text);
    return Buffer.from(withoutDisclosure);
  }), { code: 'ERR_ASSERTION' });
});
