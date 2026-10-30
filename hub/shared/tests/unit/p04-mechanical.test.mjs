// Exercise the existing assertions in isolated copies; never rewrite a checked-in fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const labels = 'hub/shared/tests/unit/p04-design-labels.test.mjs';
const input = 'nma/tests/fixtures/p04-design-labels-input.json';
const engine = 'shared/nma-multiarm-v1.js';
const replay = 'hub/shared/tests/unit/p04-design-replay.mjs';
const paperReplay = 'scripts/p04-paper-replay.mjs';
const corpus = 'nma/validate/corpus/reference.json';
const files = [labels, input, engine, replay, paperReplay,
  'nma/tests/fixtures/p04-design-labels-oracle.json',
  'hub/shared/tests/_nma_parity_check.mjs', 'nma/validate/adapter.js',
  'nma/validate/MANIFEST.json', corpus, 'nma/validate/corpus/paper-values.json'];
const provenanceName = 'P04-R2 control: fresh R oracle records exact inputs and package versions';

function runCopy(entry, { crlf = false, mutate = (path, text) => text } = {}) {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'p04-mechanical-'));
  try {
    for (const path of files) {
      let text = readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
      text = mutate(path, text);
      if (crlf) text = text.replace(/\n/g, '\r\n');
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    const args = entry.endsWith('.test.mjs') ? ['--test', '--test-reporter=tap', entry] : [entry];
    const result = spawnSync(process.execPath, args, {
      cwd: directory, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      // Omit NODE_TEST_CONTEXT entirely: even an empty value makes Node skip
      // nested run() calls. Explicit values avoid reading the parent's environment.
      env: { TMP: temporaryRoot, TEMP: temporaryRoot },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'child must finish normally');
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    // Verify the resolved target before a recursive removal on Windows.
    assert.equal(dirname(resolve(directory)), temporaryRoot);
    rmSync(directory, { recursive: true, force: true });
  }
}

function passes(result) {
  assert.equal(result.status, 0, result.output);
  return result.output;
}

test('P04 mechanical control: all existing design assertions pass with LF bytes', () => {
  const output = passes(runCopy(labels));
  assert.match(output, /# tests 8\b/);
  assert.match(output, /# pass 8\b/);
});

test('P04 mechanical plant: CRLF checkout preserves the recorded R input hash', () => {
  const output = passes(runCopy(labels, { crlf: true }));
  assert.match(output, /# pass 8\b/);
});

// Reconstruct raw hashing in a temporary copy so the old-code failure remains
// reproducible after the fix, without changing any recorded hash or fixture.
const lfNormalization = ".replace(/\\r\\n/g, '\\n')";
function rawHashing(target) {
  return (path, text) => {
    if (path !== target) return text;
    assert.equal(text.split(lfNormalization).length, 2, 'one LF hash-normalization site');
    return text.replace(lfNormalization, '');
  };
}

test('P04 mechanical evidence: raw input hashing rejects only CRLF provenance', () => {
  const result = runCopy(labels, { crlf: true, mutate: rawHashing(labels) });
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(`not ok 5 - ${provenanceName}`), result.output);
  assert.match(result.output, /# fail 1\b/);
  assert.match(result.output, /# pass 7\b/);
});

test('P04 mechanical control: provenance rejects a non-newline byte change', () => {
  const result = runCopy(labels, { mutate: (path, text) => path === input ? text + ' ' : text });
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(`not ok 5 - ${provenanceName}`), result.output);
  assert.match(result.output, /# fail 1\b/);
  assert.match(result.output, /# pass 7\b/);
});

test('P04 mechanical evidence: existing plants reject the colon-joined design key', () => {
  const result = runCopy(labels, { mutate: (path, text) => {
    if (path !== engine) return text;
    assert.equal(text.split('JSON.stringify(st.arms)').length, 2, 'one design-key mutation site');
    return text.replace('JSON.stringify(st.arms)', 'st.arms.join(":")');
  } });
  assert.equal(result.status, 1, result.output);
  for (const name of [
    'P04-R2 plant: colon-containing treatment sets retain separate design Q and df',
    'P04-R2 plant: bijective treatment renaming preserves decomposition and p-values',
    'P04-R2 R parity: colon design decomposition matches fresh netmeta',
  ]) assert.ok(result.output.split('\n').some(line => /^not ok \d+ - /.test(line) && line.includes(name)), result.output);
  assert.match(result.output, /# fail 3\b/);
  assert.match(result.output, /# pass 5\b/);
});

for (const entry of [replay, paperReplay]) {
  test(`P04 mechanical plant and LF control: ${entry} is identical after CRLF conversion`, () => {
    const lf = passes(runCopy(entry));
    const crlf = passes(runCopy(entry, { crlf: true }));
    assert.equal(crlf, lf, 'all replay output, including source fingerprint, must match');
  });
  test(`P04 mechanical control: ${entry} rejects changed corpus bytes`, () => {
    const result = runCopy(entry, { mutate: (path, text) => path === corpus ? text + ' ' : text });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /ERR_ASSERTION/);
    assert.ok(result.output.includes('validate/corpus/reference.json'), result.output);
  });
  test(`P04 mechanical evidence: ${entry} raw hashing rejects CRLF corpus`, () => {
    const result = runCopy(entry, { crlf: true, mutate: rawHashing(entry) });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /ERR_ASSERTION/);
    assert.ok(result.output.includes('validate/corpus/reference.json'), result.output);
  });
}
