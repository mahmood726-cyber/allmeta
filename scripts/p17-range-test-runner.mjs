// Preserve the complete TAP evidence in OS temp; print each outcome concisely
// so the wrapper's feedback limit does not discard the early tests/controls.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath,
  ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/p17-range.test.mjs'],
  { cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const log = join(tmpdir(), `rev2-P17-f1-range-${Date.now()}.tap`);
writeFileSync(log, (result.stdout || '') + (result.stderr || ''));
console.log('P17_RANGE_FULL_TAP', log);
let errorNextLine = false;
for (const line of (result.stdout || '').split(/\r?\n/)) {
  if (/^(?:not ok |ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line)) console.log(line);
  if (errorNextLine) { console.log('  ' + line.trim()); errorNextLine = false; }
  if (/^\s+error:/.test(line)) {
    if (/error: [|>]-?\s*$/.test(line)) errorNextLine = true;
    else console.log('  ' + line.trim());
  }
}
if (result.error) console.error(result.error.message);
if (result.stderr) console.error(result.stderr);
console.log('P17_RANGE_EXIT', result.status, 'signal', result.signal);
process.exitCode = result.status ?? 1;
