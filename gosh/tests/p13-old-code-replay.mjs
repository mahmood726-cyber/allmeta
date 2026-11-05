// Reconstruct ONLY the missing-software defect; this is not a historical checkout.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8').replace(/\r\n/g, '\n');
const original = read('gosh/index.html');
const declaration = '      var buildInfo = window.AlmBuildInfo || {};\n';
const field = "        software: {\n          version: buildInfo.version || 'unknown',\n          sha: buildInfo.sha || 'unknown',\n        },\n";
for (const fragment of [declaration, field]) assert.equal(original.split(fragment).length, 2, 'mutation must match exactly once');
const old = original.replace(declaration, '').replace(field, '');
const temporary = mkdtempSync(join(tmpdir(), 'p13-old-code-'));
try {
  const testPath = 'hub/shared/tests/unit/p13-gosh-build-export.test.mjs';
  for (const name of ['gosh/index.html', 'shared/build-info.js', 'hub/shared/results-export.js', testPath]) {
    const target = join(temporary, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, name === 'gosh/index.html' ? old : read(name));
  }
  const hash = text => createHash('sha256').update(text).digest('hex');
  console.log(JSON.stringify({ kind: 'reconstructed missing-software defect; not a parent snapshot',
    currentPageLfSha256: hash(original), reconstructedPageLfSha256: hash(old), testLfSha256: hash(read(testPath)) }));
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(temporary, testPath)], { encoding: 'utf8' });
  if (run.error) throw run.error;
  console.log(run.stdout);
  if (run.stderr) console.error(run.stderr);
  assert.equal(run.status, 1, 'the reconstructed defect must fail');
  assert.match(run.stdout, /# tests 11\b/);
  assert.match(run.stdout, /# pass 4\b/);
  assert.match(run.stdout, /# fail 7\b/);
  const failures = [...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  assert.equal(failures.length, 7);
  assert.ok(failures.every(name => name.startsWith('P13-R7 plant:')), 'all four controls must pass');
  console.log('Confirmed: seven provenance plants FAIL; four controls PASS on the reconstructed defect.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
