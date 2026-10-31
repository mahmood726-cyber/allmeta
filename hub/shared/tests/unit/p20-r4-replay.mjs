// Compact, read-only replay so wrapper feedback retains every test's outcome.
// The actual assertions stay in the node:test file and in the quick gate.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const testFile = new URL('p20-r4-export-provenance.test.mjs', import.meta.url);
const page = new URL('../../../../effect-size-converter/index.html', import.meta.url);
for (const url of [page, testFile]) {
  console.log(`${fileURLToPath(url)} SHA256=${createHash('sha256').update(readFileSync(url)).digest('hex')}`);
}
const result = spawnSync(process.execPath,
  ['--test', '--test-reporter=tap', fileURLToPath(testFile)], { encoding: 'utf8' });
if (result.error) console.error(result.error.message);
if (result.stderr) process.stderr.write(result.stderr);
for (const line of (result.stdout || '').split(/\r?\n/)) {
  if (/^(?:ok |not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b|\s+(?:error:|message:|expected:|actual:))/.test(line)) {
    console.log(line);
  }
}
process.exitCode = result.status ?? 1;
