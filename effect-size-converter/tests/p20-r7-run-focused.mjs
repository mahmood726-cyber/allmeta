// Run the unchanged tests with compact output so the wrapper retains every
// outcome rather than only the tail of a long assertion stack dump.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import E from '../../shared/evalue.js';

const root = new URL('../../', import.meta.url);
for (const file of ['shared/evalue.js', 'effect-size-converter/index.html']) {
  console.log(`${file} SHA256 ${createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')}`);
}
for (const [lo, hi] of [[3, 1.5], [3, 4], [1.5, 2.7], [0.8, 3]]) {
  try {
    console.log(`RR=2 [${lo},${hi}] ${JSON.stringify(E.eValues('RR', 2, lo, hi))}`);
  } catch (error) {
    console.log(`RR=2 [${lo},${hi}] ${error.name}: ${error.message}`);
  }
}
const result = spawnSync(process.execPath, [
  '--test', '--test-reporter=tap', 'hub/shared/tests/unit/p20-r7-evalue-ci.test.mjs'
], { cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const lines = (result.stdout || '').split(/\r?\n/);
for (const line of lines) {
  if (/^(?:ok |not ok |# (?:tests |suites |pass |fail |cancelled |skipped |todo ))/.test(line)) console.log(line);
}
// Non-test failures must stay visible and must never turn into a green result.
if (!lines.some(line => /^# tests /.test(line))) console.error(result.stdout);
if (result.stderr) console.error(result.stderr);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
