// File-based entry point for the CXTASK runner, which rejects wildcard commands.
// Expand the complete unit/**/*.test.mjs set; preserve Node's test isolation and
// exit status. No filtering of failures, test edits, shell, or output files.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const unit = fileURLToPath(new URL('./', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(unit).sort();
if (!files.length) throw new Error('No unit test files found');
console.log(`Full unit gate: ${files.length} files`);
for (const file of files) console.log(relative(root, file));
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', shell: false,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
