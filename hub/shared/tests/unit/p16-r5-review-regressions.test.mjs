import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { read, replay, refreshedBuild } from './p16-r5-replay-helpers.mjs';

test('P16-R5 release control: checked-in build passes the complete export suite', () => {
  const result = replay();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /# tests 11\b/);
});

for (const [field, identity] of [
  ['version', { version: 'v91.2.3' }],
  ['SHA', { sha: '1234567890abcdef1234567890abcdef12345678' }],
]) {
  test(`P16-R5 release plant: refreshing ${field} keeps the complete export suite passing`, () => {
    const result = replay({ 'shared/build-info.js': refreshedBuild(identity) });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /# tests 11\b/);
  });
}

// A nonempty malformed version isolates validation from the report's existing
// omission of empty metadata. Exercise the empty string separately below.
for (const [field, identity] of [
  ['version', { version: 'invalid version' }],
  ['SHA', { sha: 'not-a-full-commit-sha' }],
]) {
  test(`P16-R5 release control: an invalid ${field} is still rejected`, () => {
    const result = replay({ 'shared/build-info.js': refreshedBuild(identity) });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /not ok \d+ - P16-R5 control: loaded build identity and live analysis are available/);
    assert.match(result.output, /# tests 11\b/);
    assert.match(result.output, /# pass 10\b/);
  });
}

test('P16-R5 release control: an empty version is rejected and omitted from both report headers', () => {
  const result = replay({ 'shared/build-info.js': refreshedBuild({ version: '' }) });
  assert.equal(result.status, 1, result.output);
  assert.deepEqual([...result.output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]), [
    'P16-R5 control: loaded build identity and live analysis are available',
    'P16-R5 plant: report-txt identifies the loaded build in report metadata',
    'P16-R5 plant: report-md identifies the loaded build in report metadata',
  ], result.output);
  assert.match(result.output, /# tests 11\b/);
  assert.match(result.output, /# pass 8\b/);
  assert.match(result.output, /# fail 3\b/);
  assert.match(result.output, /# skipped 0\b/);
});

const reproducibility = text => {
  const section = text.match(/## Reproducibility\r?\n([\s\S]*?)<!-- ALM-AUTO-README-END -->/);
  assert.ok(section, 'generated reproducibility section exists');
  return section[1].replace(/\r\n/g, '\n').trim();
};

test('P16-R5 docs plant: README describes exported identity and missing-build fallback', () => {
  const section = reproducibility(read('nma-inconsistency/README.md'));
  for (const term of ['JSON', 'CSV', 'Markdown', '_provenance', 'nma-inconsistency', 'version', 'sha', 'build-info.js']) {
    assert.ok(section.includes(term), `documents ${term}`);
  }
  assert.match(section, /Methods\+Results/);
  assert.match(section, /loaded build identity/);
  assert.match(section, /checkout commit/);
  assert.match(section, /unavailable[\s\S]*without[\s\S]*provenance/);
  assert.doesNotMatch(section, /not attached|`producedBy`/);
});

// Execute the Python renderer without invoking its all-app write operation.
// Python is the runtime of the generator being tested; no third-party modules.
let generated;
function renderSections() {
  if (generated) return generated;
  const helper = new URL('../../../../scripts/p16-r5-readme-sections.py', import.meta.url);
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', fileURLToPath(helper)], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return generated = JSON.parse(result.stdout);
}

test('P16-R5 docs plant: regeneration preserves the README export guidance', () => {
  assert.equal(reproducibility(renderSections().nma), reproducibility(read('nma-inconsistency/README.md')));
});

test('P16-R5 docs control: other apps keep their existing generic guidance', () => {
  const section = reproducibility(renderSections().generic);
  assert.ok(section.startsWith('- Receipts and JSON exports include `producedBy` ' +
    '(app version, git SHA, build timestamp) — see `shared/build-info.js`.'));
  assert.doesNotMatch(section, /_provenance|nma-inconsistency/);
});
