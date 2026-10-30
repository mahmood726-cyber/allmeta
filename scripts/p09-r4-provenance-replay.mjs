// Replay unchanged LF/CRLF assertions against reconstructed raw hashing
// and current LF hashing. No fixture or recorded digest is changed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function replayProvenance(phases = ['before', 'after']) {
assert.ok(phases.length > 0 && phases.every(phase => phase === 'before' || phase === 'after'));
const root = new URL('../', import.meta.url);
const suiteURL = new URL('hub/shared/tests/unit/p07-translation.test.mjs', root);
const after = readFileSync(suiteURL, 'utf8').replace(/\r\n/g, '\n');
const assertions = readFileSync(new URL('hub/shared/tests/unit/p09-r4-lf-provenance.test.mjs', root), 'utf8').replace(/\r\n/g, '\n');
const oldRead = "const inputBytes = readFileSync(new URL('./p07-translation-input.json', import.meta.url));";
const newRead = "const inputBytes = readFileSync(new URL('./p07-translation-input.json', import.meta.url), 'utf8').replace(/\\r\\n/g, '\\n');";
assert.equal(after.split(newRead).length, 2, 'replace exactly the LF normalization');
const before = after.replace(newRead, oldRead);
const replayURL = new URL('hub/shared/tests/unit/p07-replay.mjs', root);
const replayAfter = readFileSync(replayURL, 'utf8').replace(/\r\n/g, '\n');
const oldReader = "const read = path => readFileSync(new URL(path, root), 'utf8');";
const newReader = "const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\\r\\n/g, '\\n');";
const corpusPath = String.fromCharCode(96) + 'multilevel-ma/' + '$' + '{file.path}' + String.fromCharCode(96);
const oldBytes = '  const bytes = readFileSync(new URL(' + corpusPath + ', root));';
const newBytes = "  const bytes = Buffer.from(read(" + corpusPath + "), 'utf8');";
assert.equal(replayAfter.split(newReader).length, 2);
assert.equal(replayAfter.split(newBytes).length, 2);
const replayBefore = replayAfter.replace(newReader, oldReader).replace(newBytes, oldBytes);
const scratch = mkdtempSync(join(tmpdir(), 'p09-provenance-replay-'));
const hash = text => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({ kind: 'reconstructed raw hashing; not a historical checkout',
  beforeLF: hash(before), afterLF: hash(after), replayBeforeLF: hash(replayBefore),
  replayAfterLF: hash(replayAfter), assertionsLF: hash(assertions), logs: scratch }));

const observed = new Map();
for (const [name, suite, replay] of [['before', before, replayBefore], ['after', after, replayAfter]]) {
  if (!phases.includes(name)) continue;
  const substitutions = [
    ["const suiteURL = new URL('./p07-translation.test.mjs', import.meta.url);",
      'const suiteURL = new URL(' + JSON.stringify(suiteURL.href) + ');'],
    ["const suite = readFileSync(suiteURL, 'utf8');", 'const suite = ' + JSON.stringify(suite) + ';'],
    ["const replayURL = new URL('./p07-replay.mjs', import.meta.url);",
      'const replayURL = new URL(' + JSON.stringify(replayURL.href) + ');'],
    ["const replay = readFileSync(replayURL, 'utf8');", 'const replay = ' + JSON.stringify(replay) + ';']
  ];
  let script = assertions;
  for (const [from, to] of substitutions) {
    assert.equal(script.split(from).length, 2);
    script = script.replace(from, () => to);
  }
  const file = join(scratch, name + '.test.mjs');
  writeFileSync(file, script);
  console.log('Running ' + name + ' provenance assertions.');
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    encoding: 'utf8', env: { TEMP: scratch, TMP: scratch }
  });
  assert.ifError(run.error);
  writeFileSync(join(scratch, name + '.tap'), run.stdout + run.stderr);
  const outcomes = [...run.stdout.matchAll(/^(not ok|ok) \d+ - ((?:plant|control) P09 review: .+)$/gm)];
  assert.equal(outcomes.length, 4, run.stdout + run.stderr);
  assert.equal(outcomes.filter(([, , title]) => title.startsWith('plant')).length, 2);
  assert.equal(outcomes.filter(([, , title]) => title.startsWith('control')).length, 2);
  for (const [, outcome, title] of outcomes) {
    assert.equal(outcome, name === 'before' && title.startsWith('plant') ? 'not ok' : 'ok', title);
    console.log(name + ' | ' + (outcome === 'ok' ? 'PASS' : 'FAIL') + ' | ' + title);
  }
  assert.equal(run.status, name === 'before' ? 1 : 0);
  assert.match(run.stdout, /# tests 4\b/);
  assert.match(run.stdout, /# cancelled 0\b/);
  assert.match(run.stdout, /# skipped 0\b/);
  assert.match(run.stdout, /# todo 0\b/);
  observed.set(name, new Map(outcomes.map(([, outcome, title]) => [title, outcome])));
}
if (observed.has('before') && observed.has('after')) {
assert.deepEqual([...observed.get('before').keys()], [...observed.get('after').keys()]);
for (const [title, outcome] of observed.get('before')) {
  console.log((outcome === 'ok' ? 'PASS' : 'FAIL') + ' -> PASS | ' + title);
}
console.log('VERIFIED: before 2 failed / 2 passed; after 4 passed / 0 failed; unchanged assertions.');
}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) replayProvenance();
