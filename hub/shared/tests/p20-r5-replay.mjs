// Preserve full diagnostics and repeat the outcomes at the end for wrapper logs
// that retain only the output tail. All output stays in memory/stdout.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../../../effect-size-converter/index.html', import.meta.url);
const suite = fileURLToPath(new URL('unit/p20-r5-evalue-state.test.mjs', import.meta.url));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
  encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) throw run.error;
console.log('\nP20-R5 compact replay summary');
console.log('Node:', process.version);
console.log('Production SHA256:', createHash('sha256').update(readFileSync(source)).digest('hex'));
for (const line of run.stdout.split(/\r?\n/)) {
  if (/^(?:(?:not )?ok \d+ - |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line)) {
    console.log(line);
  }
}
console.log('Child exit:', run.status, 'signal:', run.signal);
process.exitCode = run.status ?? 1;
