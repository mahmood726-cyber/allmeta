import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p10-forest.test.mjs';
const fixture = 'hub/shared/tests/unit/p10-forest-input.json';
const reference = 'hub/shared/tests/unit/p10-forest-reference.json';
const inputLF = readFileSync(new URL(fixture, root), 'utf8').replace(/\r\n/g, '\n');
const recorded = JSON.parse(readFileSync(new URL(reference, root), 'utf8'));
const oracleName = 'P10-R4 control: per-study values agree with the recorded native R oracle';
const canonicalHash = "createHash('md5').update(inputBytes.toString('utf8').replace(/\\r\\n/g, '\\n')).digest('hex')";
const rawHash = "createHash('md5').update(inputBytes).digest('hex')";

// Run every real forest assertion in process. Only the input read and test
// registration are substituted; no nested runner, child process or disk copy.
function replay(input, historical = false) {
  const suiteUrl = new URL(suite, root);
  let source = readFileSync(suiteUrl, 'utf8');
  if (historical) {
    assert.equal(source.split(canonicalHash).length, 2, 'locate exactly one corrected hash');
    source = source.replace(canonicalHash, rawHash);
  }
  for (const declaration of [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { createHash } from 'node:crypto';",
    "import vm from 'node:vm';"
  ]) {
    assert.equal(source.split(declaration).length, 2, `locate exactly one ${declaration}`);
    source = source.replace(declaration, '');
  }
  const registered = [];
  let inputReads = 0;
  vm.runInNewContext("'use strict';\n" + source.replaceAll('import.meta.url', 'suiteUrl'), {
    assert, createHash, vm, URL, suiteUrl: suiteUrl.href,
    readFileSync(path, encoding) {
      if (path.href !== new URL(fixture, root).href) return readFileSync(path, encoding);
      inputReads++;
      const bytes = Buffer.from(input);
      return encoding ? bytes.toString(encoding) : bytes;
    },
    test(...args) {
      assert.equal(args.length, 2, 'every replayed test must run without skip/todo options');
      const [name, fn] = args;
      assert.equal(typeof name, 'string');
      assert.equal(typeof fn, 'function');
      registered.push({ name, fn });
    }
  }, { filename: suite });
  assert.equal(inputReads, 1);
  assert.equal(registered.length, 12, 'register the complete forest suite');
  assert.equal(registered.filter(({ name }) => name === oracleName).length, 1);
  const failures = [];
  let passed = 0;
  for (const { name, fn } of registered) {
    let result;
    try {
      result = fn();
    } catch (error) {
      failures.push({ name, error });
      continue;
    }
    assert.equal(result, undefined, 'replayed assertions must complete synchronously');
    passed++;
  }
  assert.equal(passed + failures.length, 12, 'execute every registered test');
  return { passed, failures };
}

function assertOracleHashFailure(result, expectedHash) {
  assert.equal(result.passed, 11);
  assert.equal(result.failures.length, 1);
  const [{ name, error }] = result.failures;
  assert.equal(name, oracleName);
  assert.equal(error.code, 'ERR_ASSERTION');
  assert.equal(error.operator, 'strictEqual');
  assert.equal(error.actual, recorded.provenance.input_md5);
  assert.equal(error.expected, expectedHash);
}

test('P10 provenance plant: CRLF checkout passes the unchanged R-oracle assertion', () => {
  const crlf = inputLF.replace(/\n/g, '\r\n');
  assert.notEqual(createHash('md5').update(crlf).digest('hex'), recorded.provenance.input_md5);
  assert.deepEqual(JSON.parse(crlf), recorded.input);
  const result = replay(crlf);
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, 12);
});

test('P10 provenance control: LF checkout retains all forest and oracle checks', () => {
  const result = replay(inputLF);
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, 12);
});

test('P10 provenance control: non-newline byte changes still fail the recorded hash', () => {
  // Same parsed JSON, different canonical bytes: normalization must not become
  // JSON reserialization or remove whitespace/content from the strict check.
  const changed = inputLF.replace('{', '{ ');
  assert.deepEqual(JSON.parse(changed), recorded.input);
  const changedHash = createHash('md5').update(changed).digest('hex');
  assert.notEqual(changedHash, recorded.provenance.input_md5);
  for (const input of [changed, changed.replace(/\n/g, '\r\n')]) {
    assertOracleHashFailure(replay(input), changedHash);
  }
});

test('P10 provenance control: CRLF plant rejects the historical raw-byte assertion', () => {
  const crlf = inputLF.replace(/\n/g, '\r\n');
  assertOracleHashFailure(replay(crlf, true), createHash('md5').update(crlf).digest('hex'));
  const control = replay(inputLF, true);
  assert.deepEqual(control.failures, []);
  assert.equal(control.passed, 12);
});
