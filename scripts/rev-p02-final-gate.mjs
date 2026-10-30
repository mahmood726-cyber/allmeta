// Wrapper-compatible entrypoint for the exact quick-gate command in CXTASK.md.
// Runtime output belongs in TEMP, never in the checkout.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'rev-p02-final-gate-'));
const args = ['--test', 'hub/shared/tests/unit/**/*.test.mjs'];
console.log(`Node ${process.version}; command: node --test "${args[1]}"`);
console.log(`Gate artifacts: ${work}`);
const result = spawnSync(process.execPath, args, {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
});
const output = (result.stdout || '') + (result.stderr || '');
writeFileSync(join(work, 'unit-gate.log'), output);
console.log(output);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
