// Single-file entry point accepted by RUN.txt's allow-list. It enumerates the
// same *.test.mjs files as the required unit glob and propagates every failure.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('./', import.meta.url));
function testsAt(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? testsAt(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = testsAt(root).sort();
if (!files.length) throw new Error('Unit gate discovered no tests');
console.log(`Node ${process.version}; unit gate: ${files.length} test files`);
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const output = `${run.stdout || ''}${run.stderr || ''}`;
writeFileSync(join(tmpdir(), 'p18-unit-gate.tap'), output);
for (const line of output.split(/\r?\n/)) {
  if (/^(not ok |# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line) ||
      /^ok .*P18 (planted|provenance|supplementary|k1 control)/.test(line)) console.log(line);
}
console.log('Complete TAP output saved as temporary p18-unit-gate.tap');
if (run.error) console.error(run.error.message);
if (run.signal) console.error(`Unit gate terminated by ${run.signal}`);
process.exitCode = run.status ?? 1;
