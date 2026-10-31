// Run every quick-gate test through the wrapper's supported node <file> form.
// Explicit paths avoid depending on shell or Node wildcard expansion.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
function collect(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = collect('hub/shared/tests/unit').sort();
if (files.length === 0) throw new Error('No quick-gate test files found');
console.log(`Quick gate: ${files.length} test files`);
for (const file of files) console.log(file);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
});
const stdout = result.stdout || '';
const lines = stdout.split(/\r?\n/);
const hasTests = lines.some(line => /^# tests [1-9]\d*$/.test(line));
if (result.status === 0 && hasTests) {
  for (const line of lines) {
    if (/^(?:ok |not ok |# (?:tests |suites |pass |fail |cancelled |skipped |todo ))/.test(line)) console.log(line);
  }
} else {
  // Keep assertion diagnostics and startup failures visible; never report an empty run as green.
  console.error(stdout);
}
if (result.stderr) console.error(result.stderr);
if (result.error) console.error(result.error.message);
if (!hasTests) console.error('No nonempty test summary was produced');
process.exitCode = result.status === 0 && !hasTests ? 1 : (result.status ?? 1);
