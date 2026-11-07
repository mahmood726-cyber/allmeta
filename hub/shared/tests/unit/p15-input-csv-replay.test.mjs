import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Replay the existing assertions verbatim. The old implementation is reconstructed
// by reversing only PR #420's quoting condition, NOT by claiming a historical
// snapshot is present. Neither the source nor the test file on disk is changed.
const sourcePath = fileURLToPath(new URL('../../../../shared/rve-extras.js', import.meta.url));
const testPath = fileURLToPath(new URL('./p15-input-csv-whitespace.test.mjs', import.meta.url));
const source = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const assertions = readFileSync(testPath, 'utf8').replace(/\r\n/g, '\n');
const fixedCondition = String.raw`/[",\n\r;]|^\s|\s$/.test(s)`;
const oldCondition = String.raw`/[",\n\r;]/.test(s)`;
const names = [...assertions.matchAll(/^test\('((?:plant|control) P15-R2: [^']+)'/gm)].map(m => m[1]);
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

function replay(preload) {
  const args = [...(preload ? ['--require', preload] : []), '--test', '--test-reporter=tap', testPath];
  // Inheriting node --test's worker context makes the child refuse this run as
  // recursive. The absolute Node/file paths need no inherited environment.
  // Use an empty environment without reading or copying the parent's values.
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000, env: {} });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.stderr, '');
  const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - ((?:plant|control) P15-R2: .+)$/gm)]
    .map(m => ({ name: m[2], passed: m[1] === 'ok' }));
  // A load error, missing test, skip, or unexpected extra failure cannot count
  // as evidence that the intended defect was detected.
  assert.deepEqual(outcomes.map(o => o.name), names, result.stdout);
  assert.match(result.stdout, /^# tests 8$/m);
  assert.match(result.stdout, /^# skipped 0$/m);
  assert.match(result.stdout, /^# cancelled 0$/m);
  assert.match(result.stdout, /^# todo 0$/m);
  return { ...result, outcomes };
}

test('P15-R2 replay: old CSV quoting fails all four plants and passes all four controls', t => {
  assert.equal(names.length, 8);
  assert.equal(names.filter(n => n.startsWith('plant ')).length, 4);
  assert.equal(source.split(fixedCondition).length, 2, 'exactly one quoting condition to reverse');
  const oldSource = source.replace(fixedCondition, oldCondition);
  const tempRoot = tmpdir();
  const temp = mkdtempSync(join(tempRoot, 'p15-csv-replay-'));
  try {
    const preload = join(temp, 'old-quoting.cjs');
    // Compile in Node's normal CJS realm so the original strict deep-equality
    // assertions keep their semantics. Resolve any requires beside the real file.
    writeFileSync(preload, `
const Module = require('node:module');
const path = require('node:path');
const filename = ${JSON.stringify(sourcePath)};
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(${JSON.stringify(oldSource)}, filename);
loaded.loaded = true;
require.cache[filename] = loaded;
`, 'utf8');
    const result = replay(preload);
    t.diagnostic(result.stdout);
    assert.equal(result.status, 1, 'the old quoting condition must fail the suite');
    assert.match(result.stdout, /^# fail 4$/m);
    assert.match(result.stdout, /^# pass 4$/m);
    for (const outcome of result.outcomes) {
      assert.equal(outcome.passed, outcome.name.startsWith('control '), outcome.name);
    }
    t.diagnostic(JSON.stringify({ provenance: 'LF-normalized; old quoting reconstructed from current source',
      currentSourceSHA256: sha256(source), reconstructedSourceSHA256: sha256(oldSource),
      unchangedTestsSHA256: sha256(assertions) }));
  } finally {
    const withinTemp = relative(tempRoot, temp);
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
    rmSync(temp, { recursive: true, force: true });
  }
});

test('P15-R2 replay control: current CSV quoting passes the same eight unchanged tests', t => {
  const result = replay();
  t.diagnostic(result.stdout);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^# fail 0$/m);
  assert.match(result.stdout, /^# pass 8$/m);
  assert.ok(result.outcomes.every(o => o.passed));
});
