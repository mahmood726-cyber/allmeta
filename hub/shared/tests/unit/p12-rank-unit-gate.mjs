// Run the complete quick gate without passing a wildcard to the job wrapper.
// Discover every matching test recursively; preserve Node's test exit status.
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? discover(file) : entry.isFile() && entry.name.endsWith('.test.mjs') ? [file] : [];
  });
}
const files = discover(path.join(root, 'hub/shared/tests/unit')).sort();
assert.ok(files.length > 0, 'The quick gate must discover test files');
for (const file of files) console.log('TEST FILE ' + path.relative(root, file));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
});
const log = path.join(mkdtempSync(path.join(tmpdir(), 'limit-ma-p12-r4-unit-gate-')), 'gate.log');
writeFileSync(log, (result.stdout || '') + (result.stderr || ''));
console.log('Full test output: ' + log);
if (result.error) throw result.error;
if (result.signal) throw Error('Quick gate terminated by ' + result.signal);
const lines = (result.stdout || '').split(/\r?\n/);
// Retain the native TAP counts and each failure's details in wrapper feedback.
for (let i = 0; i < lines.length; i++) {
  if (/^\s*not ok\b/.test(lines[i])) {
    let end = i + 1;
    while (end < lines.length && !/^\s*(?:ok\b|not ok\b|# Subtest:|\d+\.\.)/.test(lines[end])) end++;
    console.log(lines.slice(i, end).join('\n'));
    i = end - 1;
  } else if (/^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(lines[i])) {
    console.log(lines[i]);
  }
}
if (result.stderr) console.error(result.stderr);
console.log('Quick gate exit status: ' + result.status);
process.exitCode = result.status ?? 1;
