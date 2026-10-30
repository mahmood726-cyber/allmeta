// Wrapper-compatible equivalent of node --test "hub/shared/tests/unit/**/*.test.mjs".
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('.', import.meta.url));
const suites = readdirSync(directory, { recursive: true })
  .filter(file => file.endsWith('.test.mjs')).sort();
assert.ok(suites.includes('p20-r2-missing-evalue-ci.test.mjs'), 'P20 suite must be present');
console.log(`Aggregate unit gate: ${suites.length} files`);
for (const file of suites) console.log(`  ${file}`);
const result = spawnSync(process.execPath,
  ['--test', '--test-reporter=tap', ...suites.map(file => join(directory, file))],
  { stdio: 'inherit', timeout: 180_000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
