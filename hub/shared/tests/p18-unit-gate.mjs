// File-based entry point for the RUN.txt wrapper's single-file command grammar.
// Run the full required glob unchanged; only the console reporting is condensed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pattern = 'hub/shared/tests/unit/**/*.test.mjs';
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', pattern], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});
const output = result.stdout || '';
const diagnostics = result.stderr || '';
const logs = mkdtempSync(join(tmpdir(), 'p18-unit-gate-'));
writeFileSync(join(logs, 'stdout.tap'), output);
writeFileSync(join(logs, 'stderr.txt'), diagnostics);
console.log('FULL UNIT GATE; Node ' + process.version + '; pattern ' + pattern);
console.log('Complete output in temporary storage: ' + logs);
console.log(output.split(/\r?\n/).filter(line =>
  /^(not ok |# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) )/.test(line)).join('\n'));
if (diagnostics) console.error(diagnostics);
if (result.error) throw result.error;
assert.equal(result.signal, null, 'Unit gate must finish without a signal');
assert.match(output, /^# tests [1-9]\d*$/m, 'Unit gate must discover tests');
assert.match(output, /^# fail 0$/m, 'Unit gate must have zero failures');
assert.equal(result.status, 0, 'Unit gate must exit successfully');
