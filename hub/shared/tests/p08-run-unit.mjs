// Explicit paths give the wrapper the same recursive suite as the CI glob.
// No test is filtered, skipped, or rewritten. Retain full TAP in TEMP and print
// every result/total so a long assertion diff cannot hide the gate summary.
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('unit/', import.meta.url));
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? discover(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(directory).sort();
if (!files.length) throw Error('No unit tests found');
console.log(`Running all ${files.length} unit-test files`);
const directoryOutput = mkdtempSync(join(tmpdir(), 'p08-unit-'));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
writeFileSync(join(directoryOutput, 'test-output.tap'), result.stdout || '');
console.log((result.stdout || '').split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
process.stderr.write(result.stderr || '');
console.log('Full TAP evidence: ' + join(directoryOutput, 'test-output.tap'));
process.exitCode = result.status ?? 1;
