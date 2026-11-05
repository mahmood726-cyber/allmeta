import test from 'node:test';
import assert from 'node:assert/strict';
import { lf, replay } from './helpers/isolated-test-replay.mjs';

const testFile = 'hub/shared/tests/unit/p11-exclusion-csv.test.mjs';
const files = [testFile, 'influence/index.html', 'shared/ma-core.js',
  'influence/influence-extra.js', 'hub/shared/analysis-lifecycle.js'];
const regressions = [
  'plant P11-R5: refused exclusion is explicit in every standalone CSV row',
  'plant P11-R5: successful exclusions distinguish requested and applied study rows',
  'plant P11-R5: refusal metadata resets after a successful request, clear and rerun',
];
const controls = [
  'control: successful exclusion preserves refit, diagnostics and existing CSV fields',
  'control: refused request remains refused in UI and JSON with the full five-study fit',
  'control: no exclusions and invalid input retain existing export behavior',
];

// Reproduce the reviewed defect at its source, not by changing assertions or
// monkey-patching the result in the test. This is a planted legacy serializer,
// NOT an authenticated historical checkout (none was supplied with this job).
function plantMissingOutcome(path, text) {
  if (path !== 'influence/index.html') return text;
  const source = lf(text);
  const fields = [
    '            exclusion_requested: requested,\n',
    '            exclusion_applied: requested && applied,\n',
    '            exclusion_refused: refused // Request-wide outcome repeated in every study row.\n',
  ];
  let planted = source;
  for (const field of fields) {
    assert.equal(planted.split(field).length, 2, `Expected one serializer field: ${field.trim()}`);
    planted = planted.replace(field, '');
  }
  return planted;
}

test('P11 replay control: unchanged six-test suite passes in an isolated current-source copy', t => {
  const result = replay(t, { label: 'current serializer', files, testFile });
  assert.equal(result.status, 0);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.passed, [...regressions, ...controls]);
});

test('P11 planted defect: missing export metadata fails all three regressions while all controls pass', t => {
  const result = replay(t, { label: 'planted legacy serializer (not a historical checkout)',
    files, testFile, transform: plantMissingOutcome });
  assert.equal(result.status, 1);
  assert.deepEqual(result.failed, regressions);
  assert.deepEqual(result.passed, controls);
  assert.equal((result.stdout.match(/request refusal must be explicit/g) || []).length, 3);
  // The reset test first fails on absent initial metadata. This does not establish
  // a separate reset-state defect in the old serializer.
});
