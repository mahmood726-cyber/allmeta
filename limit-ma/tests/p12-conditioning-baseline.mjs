// Run the unchanged assertions against the original page saved before the fix.
// Only import locations and the page path change in this temporary test copy.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const app = new URL('../', import.meta.url);
const original = join(tmpdir(), 'p12-r5-before.html');
const source = readFileSync(new URL('../hub/shared/tests/unit/p12-conditioning.test.mjs', app), 'utf8')
  .replace("'../../../../limit-ma/tests/input-harness.cjs'", JSON.stringify(new URL('tests/input-harness.cjs', app).href))
  .replace("new URL('../../../../limit-ma/', import.meta.url)", `new URL(${JSON.stringify(app.href)})`)
  .replace("fileURLToPath(new URL('index.html', app))", JSON.stringify(original));
const testPath = join(mkdtempSync(join(tmpdir(), 'p12-r5-baseline-')), 'conditioning.test.mjs');
writeFileSync(testPath, source);
console.log('Original page SHA256:', createHash('sha256').update(readFileSync(original)).digest('hex'));
console.log('Current page:', fileURLToPath(new URL('index.html', app)));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], { encoding: 'utf8' });
if (run.error) throw run.error;
const log = join(tmpdir(), 'p12-r5-baseline-tests.tap');
writeFileSync(log, (run.stdout || '') + (run.stderr || ''));
console.log((run.stdout || '').split('\n').filter(line => /^(?:ok |not ok |# (?:tests|pass|fail|cancelled|skipped|todo))/.test(line)).join('\n'));
if (run.stderr) console.error(run.stderr);
console.log('Complete baseline test output:', log);
process.exitCode = run.status ?? 1;
