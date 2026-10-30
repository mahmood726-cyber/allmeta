import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = new URL('../../../../multilevel-ma/', import.meta.url);
const audit = readFileSync(new URL('../p07-variance-shares-audit.mjs', import.meta.url), 'utf8');
const start = audit.indexOf('const manifest =');
const end = audit.indexOf('const corpus =', start);
assert.ok(start >= 0 && end > start, 'execute the actual audit provenance checks');
const current = audit.slice(start, end);
const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST.json', app), 'utf8'));

// Original audit, retained as an executable defect plant. No pins are generated.
const historical = `
const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST.json', app), 'utf8'));
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(file.path, app));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
`;

// Model checkout conversion at the read boundary; never write the corpus.
function verify(source, changedPath, transform = bytes => bytes) {
  const reads = [];
  const context = vm.createContext({
    app, URL, Buffer, assert, createHash,
    readFileSync(url, encoding) {
      let bytes = readFileSync(url);
      const file = manifest.files.find(file => new URL(file.path, app).href === url.href);
      if (file) {
        reads.push(file.path);
        bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
        if (file.path === changedPath) bytes = transform(bytes);
      }
      return encoding ? bytes.toString(encoding) : bytes;
    }
  });
  vm.runInContext(source, context);
  assert.deepEqual(reads, manifest.files.map(file => file.path));
}

const crlf = bytes => Buffer.from(bytes.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
function changeDigit(bytes) {
  const changed = Buffer.from(bytes.toString('utf8').replace(/\d/, digit => String((Number(digit) + 1) % 10)), 'utf8');
  assert.equal(changed.length, bytes.length);
  assert.notDeepEqual(changed, bytes, 'plant a same-length content change');
  return changed;
}

test('P07 provenance control: LF files match the unchanged manifest in both audit versions', () => {
  verify(historical);
  verify(current);
});

for (const file of manifest.files) {
  test(`P07 provenance regression: CRLF ${file.path} fails the old audit and passes the current audit`, () => {
    assert.throws(() => verify(historical, file.path, crlf), error => {
      assert.ok(error instanceof assert.AssertionError);
      assert.equal(error.expected, file.bytes);
      assert.ok(error.actual > file.bytes, 'old audit counts checkout CR bytes');
      return true;
    });
    verify(current, file.path, crlf);
  });

  for (const ending of ['LF', 'CRLF']) {
    test(`P07 provenance control: reject same-length content changes in ${ending} ${file.path}`, () => {
      const transform = bytes => ending === 'CRLF' ? crlf(changeDigit(bytes)) : changeDigit(bytes);
      assert.throws(() => verify(current, file.path, transform), error => {
        assert.ok(error instanceof assert.AssertionError);
        assert.equal(error.expected, file.sha256, 'SHA-256 must still be checked after normalizing');
        assert.notEqual(error.actual, file.sha256);
        return true;
      });
    });
  }

  test(`P07 provenance control: reject truncated ${file.path}`, () => {
    assert.throws(() => verify(current, file.path, bytes => bytes.subarray(0, -1)), error => {
      assert.ok(error instanceof assert.AssertionError);
      assert.equal(error.expected, file.bytes);
      assert.equal(error.actual, file.bytes - 1);
      return true;
    });
  });
}
