// Wrapper-compatible replay: restore the pre-repair adapter in TEMP, then run
// every quick-gate unit file together. Existing tests are copied unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => readFileSync(join(root, name), 'utf8').replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const adapterPath = 'gosh/tests/export-boundaries.cjs';
const testPath = 'hub/shared/tests/unit/p13-gosh-export-contract.test.mjs';
const current = read(adapterPath);
const addition = /  \/\/ Software is a required export extension,[\s\S]*?(?=  let signed=\[\];)/g;
const projected = '{results,receipt:numericalReceipt,chart:';
assert.equal([...current.matchAll(addition)].length, 1, 'adapter addition must match exactly once');
assert.equal(current.split(projected).length, 2, 'projected return must match exactly once');
const old = current.replace(addition, '').replace(projected, '{results:result,receipt,chart:');
const temporaryRoot = resolve(tmpdir());
const temporary = mkdtempSync(join(temporaryRoot, 'p13-contract-old-'));
const runTests = (cwd, files) => {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files],
    { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (run.error) throw run.error;
  return run;
};
let red;
try {
  for (const [name, source] of [[adapterPath, old], [testPath, read(testPath)]]) {
    const target = join(temporary, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  red = runTests(temporary, [testPath]);
  const failed = [...red.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  const passed = [...red.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1]);
  try {
    assert.equal(red.status, 1, 'pre-repair adapter must fail the planted tests');
    assert.match(red.stdout, /# tests 16\b/);
    assert.match(red.stdout, /# fail 14\b/);
    assert.match(red.stdout, /# pass 2\b/);
    assert.equal(failed.length, 14);
    assert.equal(passed.length, 2);
    assert.ok(failed.every(name => name.startsWith('P13 contract plant:')));
    assert.ok(passed.every(name => name.startsWith('P13 contract control:')));
    assert.match(red.stdout, /# skipped 0\b/);
    assert.match(red.stdout, /# todo 0\b/);
  } catch (error) {
    console.log(red.stdout);
    console.error(red.stderr);
    throw error;
  }
} finally {
  assert.equal(dirname(resolve(temporary)), temporaryRoot, 'cleanup must stay in TEMP');
  assert.ok(basename(temporary).startsWith('p13-contract-old-'));
  rmSync(temporary, { recursive: true, force: true });
}

function unitFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = join(directory, entry.name);
    return entry.isDirectory() ? unitFiles(name) : entry.isFile() && entry.name.endsWith('.test.mjs') ? [name] : [];
  });
}
const files = unitFiles('hub/shared/tests/unit').sort();
assert.ok(files.length > 0, 'quick gate must discover unit files');
const green = runTests(root, files);
try {
  assert.equal(green.status, 0, 'combined unit gate must pass');
  assert.match(green.stdout, /# fail 0\b/);
  assert.match(green.stdout, /# skipped 0\b/);
  assert.match(green.stdout, /# todo 0\b/);
} catch (error) {
  console.log(green.stdout);
  console.error(green.stderr);
  throw error;
}
console.log(JSON.stringify({ kind: 'pre-repair adapter reconstruction; not a historical parent',
  currentAdapterLfSha256: hash(current), oldAdapterLfSha256: hash(old), testLfSha256: hash(read(testPath)) }));
console.log('Pre-repair contract results (expected planted failures):');
console.log(red.stdout.split(/\r?\n/).filter(line => /^(?:not ok |ok |# (?:tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
console.log(`Combined quick gate: all ${files.length} unit files, recursively discovered:`);
console.log(files.join('\n'));
console.log(green.stdout.split(/\r?\n/).filter(line => /^# (?:tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
