// Preserve the complete quick-gate TAP output outside the source tree.
// Print a short summary so wrapper feedback does not truncate the verdict.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/**/*.test.mjs'];
const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const dest = join(tmpdir(), 'nma-edge-quick-gate.tap');
writeFileSync(dest, output);
console.log(`Node ${process.version}; node ${args.join(' ')}; exit=${result.status}`);
for (const line of output.split(/\r?\n/)) {
  if (/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line) ||
      (/^not ok\b/.test(line) && !/# TODO\b/.test(line))) console.log(line);
}
if (result.error) console.log(result.error.message);
console.log(`GATE_PATH: ${dest}`);
process.exitCode = result.status ?? 1;
