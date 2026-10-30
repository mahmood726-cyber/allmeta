// Single-file entry point for the job wrapper's required shared unit-test gate.
// Keep the exact gate glob; only the reporter/output handling differs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pattern = 'hub/shared/tests/unit/**/*.test.mjs';
const files = readdirSync(join(root, 'hub/shared/tests/unit'), { recursive: true })
  .filter(file => file.endsWith('.test.mjs')).sort();
console.log('Node ' + process.version);
console.log('Gate: node --test "' + pattern + '"');
console.log('Unit-test files (' + files.length + '):\n' + files.join('\n'));

const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', pattern], {
  cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
});
const output = result.stdout || '';
const log = join(mkdtempSync(join(tmpdir(), 'p12-unit-gate-')), 'gate.tap');
writeFileSync(log, output + (result.stderr || ''));
console.log('Full output: ' + log);
console.log(output.split(/\r?\n/).filter(line =>
  /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line)).join('\n'));

if (result.error) console.error(result.error.message);
if (result.stderr) console.error(result.stderr);
if (result.status !== 0) {
  // Retain the full failure diagnostics on disk even if wrapper feedback is cut.
  const failures = output.match(/^not ok[^\n]*(?:\r?\n(?!# Subtest:|(?:not )?ok \d|1\.\.|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms))[^\n]*)*/gm);
  console.log((failures ? failures.join('\n') : output).slice(-12000));
}
const complete = files.length > 0 && /^# tests [1-9]\d*$/m.test(output) &&
  /^# fail 0$/m.test(output) && /^# cancelled 0$/m.test(output);
const passed = !result.error && result.status === 0 && complete;
console.log('Gate ' + (passed ? 'PASS' : 'FAIL') + ' (child exit ' + result.status + ')');
process.exitCode = passed ? 0 : 1;
