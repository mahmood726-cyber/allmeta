// Compact gate log; full test output is retained only in the system temp directory.
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = 'hub/shared/tests/unit';
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).map(f => `${dir}/${f}`);
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 16*1024*1024 });
const output = (run.stdout || '') + (run.stderr || '');
const log = join(tmpdir(), `p05-qprofile-unit-${Date.now()}.txt`);
writeFileSync(log, output);
console.log('Full unit log:', log);
console.log(output.split('\n').filter(line => /^(ok |not ok |# (tests|pass|fail|cancelled|skipped|todo)|  error:|  code:)/.test(line)).join('\n'));
if (run.error) console.error(run.error.message);
process.exitCode = run.status ?? 1;
