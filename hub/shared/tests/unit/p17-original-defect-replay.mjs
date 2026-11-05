// Reproduce the reviewed pre-PR omission without git or a second source tree.
// All temporary source and TAP output lives under the operating-system temp dir.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const temp = mkdtempSync(join(tmpdir(), 'p17-original-defect-'));
const testFile = 'hub/shared/tests/unit/p17-build-identity.test.mjs';
const stamp = /      var build = window\.AlmBuildInfo;\r?\n      if \(build\) \{\r?\n        _last\.producedBy = \{ version: build\.version, sha: build\.sha \};\r?\n      \}\r?\n/;
for (const path of [testFile, 'correlation-ma/index.html', 'shared/ma-core.js',
  'shared/build-info.js', 'hub/shared/results-export.js']) {
  let source = readFileSync(new URL(path, root), 'utf8');
  if (path === 'correlation-ma/index.html') {
    assert.equal((source.match(new RegExp(stamp.source, 'g')) || []).length, 1, 'remove exactly the four reviewed lines');
    source = source.replace(stamp, '');
  }
  mkdirSync(dirname(join(temp, path)), { recursive: true });
  writeFileSync(join(temp, path), source);
}
// The wrapper may attach a terminal, which otherwise selects Node's spec reporter.
// Pin TAP so the assertions below check the same format in every environment.
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(temp, testFile)], { encoding: 'utf8' });
assert.ifError(result.error);
writeFileSync(join(temp, 'old-code.tap'), result.stdout + result.stderr);
console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
assert.equal(result.status, 1, 'the old omission must fail the unchanged test file');
assert.match(result.stdout, /# pass 3\b/);
assert.match(result.stdout, /# fail 2\b/);
assert.match(result.stdout, /not ok 1 - plant P17-R3: main result and JSON include version and full SHA from loaded build-info.js/);
assert.match(result.stdout, /not ok 2 - plant P17-R3: main result and JSON include version and full SHA from alternate loaded identity/);
console.log('CONFIRMED: both original provenance plants fail; all three controls pass with only the four PR lines removed.');
