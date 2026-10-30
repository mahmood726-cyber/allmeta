import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../hub/shared/tests/unit/', import.meta.url));
function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? collect(join(dir, e.name)) : e.name.endsWith('.test.mjs') ? [join(dir, e.name)] : []);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...collect(root).sort()], { encoding: 'utf8' });
if (result.error) throw result.error;
// Retain every outcome and the totals without stacks crowding out the wrapper's
// limited feedback. The test set, assertions and failure exit code are unchanged.
const lines = result.stdout.split(/\r?\n/).filter(line =>
  /^(ok \d+|not ok \d+|# (tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )|\s+error:)/.test(line));
console.log(lines.length ? lines.join('\n') : result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
