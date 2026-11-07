// Reconstruct each reviewed defect in memory; never edit the app or its tests.
// These are explicit reconstructions, not unavailable historical checkouts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected exactly one source anchor: ${before}`);
  return source.replace(before, after);
}
const cancellation = `      // A later manual choice supersedes an import even while parsing is refused.
      for (const type of ["input", "change"]) {
        document.getElementById("f-ref").addEventListener(type, function () { _pendingRef = null; });
      }
`;
const fixed = read('nma/index.html');
const reviewed = replaceOnce(fixed, cancellation, '');
let original = replaceOnce(reviewed,
  '          // The incoming network\'s reference options are created by render.\n' +
  '          if (k === "ref") _pendingRef = String(s[k]);\n' +
  '          else el.value = s[k];',
  '          el.value = s[k];');
original = replaceOnce(original, '      state.ref = refTreat;\n', '');

let source = read('hub/shared/tests/unit/p04-round2.test.mjs');
source = replaceOnce(source, "import NM from '../../../../shared/nma-multiarm-v1.js';",
  `import NM from ${JSON.stringify(new URL('shared/nma-multiarm-v1.js', root).href)};`);
source = replaceOnce(source, "const root = new URL('../../../../', import.meta.url);",
  `const root = new URL(${JSON.stringify(root.href)});`);
// The original review covered these eight tests. The six subsequent recovery
// tests include reload assertions that depend on R2, so replay them against the
// reviewed PR (with R2 present), then run all fourteen against the final source.
// No test body or assertion changes between its red and green executions.
const recoveryBoundary = '\nfor (const [refusal, rejectedData] of [';
assert.equal(source.split(recoveryBoundary).length, 2, 'Unique boundary of the six added recovery tests');
const originalSuite = source.slice(0, source.indexOf(recoveryBoundary));
const r2Failures = [
  'plant P04-R2: JSON import into a different network preserves B through export and reload',
  'plant P04-R2: autosave startup restores B with initially empty options and across two reloads',
  'plant P04-R2: unavailable imported reference persists the effective fallback immediately',
  'plant P04-R2: existing pending example reference is autosaved on its first render'
];
const r3Failures = ['malformed contrasts', 'empty contrasts'].flatMap(refusal =>
  ['input', 'change'].map(event => `plant P04-R3: ${event} selection supersedes imported B after ${refusal}`));

const dir = mkdtempSync(join(tmpdir(), 'p04-reference-replay-'));
function replay(label, suite, html, count, expectedFailures) {
  const path = join(dir, `${label}.test.mjs`);
  const adapted = replaceOnce(suite, "const html = readFileSync(new URL('nma/index.html', root), 'utf8');",
    `const html = ${JSON.stringify(html)};`);
  let result;
  try {
    writeFileSync(path, adapted);
    result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path], { encoding: 'utf8' });
    if (result.error) throw result.error;
    const failures = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
    assert.deepEqual(failures, expectedFailures, `${label}: exact named failures; all other tests must pass`);
    assert.equal(result.status, expectedFailures.length ? 1 : 0, `${label}: child exit status`);
    for (const [key, value] of Object.entries({
      tests: count, pass: count - expectedFailures.length, fail: expectedFailures.length,
      cancelled: 0, skipped: 0, todo: 0
    })) assert.match(result.stdout, new RegExp(`^# ${key} ${value}$`, 'm'), `${label}: ${key}`);
    console.log('P04_REFERENCE_REPLAY', JSON.stringify({ label, tests: count,
      passed: count - failures.length, failed: failures, skipped: 0 }));
  } catch (error) {
    if (result) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
    }
    throw error;
  } finally {
    unlinkSync(path);
  }
}
try {
  replay('pre-R2-reconstruction', originalSuite, original, 8, r2Failures);
  replay('reviewed-PR-reconstruction', source, reviewed, 14, r3Failures);
  replay('fixed', source, fixed, 14, []);
} finally {
  rmdirSync(dir);
}
