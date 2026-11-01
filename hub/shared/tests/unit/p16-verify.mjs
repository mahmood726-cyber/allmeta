// The wrapper accepts an explicit script but rejected its quoted glob command.
// Enumerate the same complete unit gate, then run both existing app DOM suites.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unit = fileURLToPath(new URL('.', import.meta.url));
function testsIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? testsIn(join(dir, entry.name)) : entry.name.endsWith('.test.mjs') ? [join(dir, entry.name)] : []);
}
let failed = false;
function run(label, args) {
  console.log(label);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}
run('P16 complete unit gate', ['--test', ...testsIn(unit).sort()]);
run('P16 existing DOM suites (Node DOM execution, not browser/layout)', [
  '--require', join(unit, 'p16-test-deps.cjs'), '--test',
  fileURLToPath(new URL('../nma-inconsistency-plus.node.cjs', import.meta.url)),
  fileURLToPath(new URL('../validate-nma-inconsistency.node.cjs', import.meta.url)),
]);
process.exitCode = failed ? 1 : 0;
