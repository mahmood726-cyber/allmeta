// Replay the exact previous raw-byte hash and the LF-normalized hash without
// modifying the source tree or changing the recorded R oracle.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const suite = 'hub/shared/tests/unit/provenance-input-eol.test.mjs';
const target = 'hub/shared/tests/unit/p07-translation.test.mjs';
const files = [suite, target, 'hub/shared/tests/unit/p07-translation-input.json',
  'hub/shared/tests/unit/p07-translation-reference.json', 'shared/multilevel-reml.js'];
const normalized = String.raw`createHash('md5').update(inputBytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')`;
const previous = "createHash('md5').update(inputBytes).digest('hex')";
const names = [
  'provenance control: LF checkout matches the unchanged R input digest',
  'provenance plant: CRLF checkout matches the same recorded LF input digest',
  'provenance control: a non-line-ending byte change is still rejected',
];

for (const rawBytes of [true, false]) {
  const dir = mkdtempSync(join(tmpdir(), rawBytes ? 'allmeta-provenance-raw-' : 'allmeta-provenance-fixed-'));
  for (const file of files) {
    let source = readFileSync(new URL(file, root), 'utf8');
    if (file === target) {
      assert.equal(source.split(normalized).length, 2, 'Replay must replace exactly one hash expression');
      if (rawBytes) source = source.replace(normalized, previous);
    }
    const destination = join(dir, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(dir, suite)],
    { encoding: 'utf8', timeout: 60000 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(dir, 'test.tap'), output);
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const cases = [...output.matchAll(/^(not ok|ok) \d+ - (.+)\r?$/gm)]
    .map(([, status, name]) => ({ passed: status === 'ok', name: name.trimEnd() }));
  assert.deepEqual(cases.map(c => c.name), names, output);
  assert.deepEqual(cases.map(c => c.passed), [true, !rawBytes, true], output);
  assert.equal(result.status, rawBytes ? 1 : 0, output);
  console.log(JSON.stringify({ variant: rawBytes ? 'previous raw-byte hash' : 'LF-normalized hash',
    log: join(dir, 'test.tap'), cases }, null, 2));
}
