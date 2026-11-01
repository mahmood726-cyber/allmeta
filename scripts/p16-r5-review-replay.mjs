// Read-only planted-defect replay; this reconstructs the missing-provenance
// behavior, not an unavailable historical checkout. Temporary copies only.
import assert from 'node:assert/strict';
import { read, replay, replaceOnce, refreshedBuild, suite } from '../hub/shared/tests/unit/p16-r5-replay-helpers.mjs';

const baseline = replay();
assert.equal(baseline.status, 0, baseline.output);
assert.match(baseline.output, /# tests 11\b/);
console.log('P16-R5 baseline: all 11 export tests pass.');

// Reconstruct exactly the two reviewed assertions in a temporary test copy.
// The historical identity is supplied only to the legacy control, so this
// replay itself stays usable after a real build-info refresh.
const historical = { version: 'v1.8.0', sha: '42a94da2110a02200d0b5bff4c56f636b9cbffa9' };
const legacySuite = replaceOnce(read(suite).replace(/\r\n/g, '\n'),
  String.raw`  assert.match(c.AlmBuildInfo.version, /^\S+$/);
  assert.match(c.AlmBuildInfo.sha, /^[0-9a-f]{40}$/);`,
  `  assert.equal(c.AlmBuildInfo.version, '${historical.version}');
  assert.equal(c.AlmBuildInfo.sha, '${historical.sha}');`);
const legacyControl = replay({ [suite]: legacySuite, 'shared/build-info.js': refreshedBuild(historical) });
assert.equal(legacyControl.status, 0, legacyControl.output);
assert.match(legacyControl.output, /# tests 11\b/);
console.log('P16-R5 legacy control: all 11 export tests pass with the pinned identity.');

for (const [field, identity] of [
  ['version', { ...historical, version: 'v91.2.3' }],
  ['SHA', { ...historical, sha: '1234567890abcdef1234567890abcdef12345678' }],
]) {
  const build = refreshedBuild(identity);
  const before = replay({ [suite]: legacySuite, 'shared/build-info.js': build });
  assert.equal(before.status, 1, before.output);
  assert.deepEqual([...before.output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]),
    ['P16-R5 control: loaded build identity and live analysis are available'], before.output);
  assert.match(before.output, /# tests 11\b/);
  assert.match(before.output, /# pass 10\b/);
  const after = replay({ 'shared/build-info.js': build });
  assert.equal(after.status, 0, after.output);
  assert.match(after.output, /# tests 11\b/);
  console.log(`P16-R5 refreshed ${field}: legacy control FAILS (10 other tests pass); corrected suite PASSES all 11.`);
}

const callback = 'var build=window.AlmBuildInfo;return r&&build?Object.assign({},r,{_provenance:{app:"nma-inconsistency",version:build.version,sha:build.sha}}):r||{};';
const header = `    const provenance = obj._provenance;
    if (provenance) {
      if (provenance.app) L.push('Application: ' + provenance.app);
      if (provenance.version) L.push('Application version: ' + provenance.version);
      if (provenance.sha) L.push('Build SHA: ' + provenance.sha);
      L.push('');
    }
`;
const oldCallback = replaceOnce(read('nma-inconsistency/index.html'), callback, 'return r||{};');
const oldReporter = replaceOnce(read('hub/shared/results-export.js').replace(/\r\n/g, '\n'), header, '');
const dataTests = ['json', 'csv', 'md'].map(action =>
  `P16-R5 plant: ${action} download includes explicit loaded version and full SHA provenance`);
const reportTests = ['report-txt', 'report-md'].map(action =>
  `P16-R5 plant: ${action} identifies the loaded build in report metadata`);

for (const [label, overrides, expectedFailures] of [
  ['missing export provenance', {
    'nma-inconsistency/index.html': oldCallback,
    'hub/shared/results-export.js': oldReporter,
  }, [...dataTests, ...reportTests, 'P16-R5 plant: all formats read the current build identity without hardcoding it']],
  ['missing report headers', { 'hub/shared/results-export.js': oldReporter }, reportTests],
]) {
  const result = replay(overrides);
  assert.equal(result.status, 1, result.output);
  const failed = [...result.output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(failed, expectedFailures, result.output);
  assert.match(result.output, /# tests 11\b/);
  console.log(`${label}: ${failed.length} expected failures; ${11 - failed.length} controls/other tests pass.`);
  for (const name of failed) console.log(`  FAIL (planted): ${name}`);
}
