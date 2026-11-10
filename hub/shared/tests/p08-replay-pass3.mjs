// Sensitivity check for the min(vi)-only repair, in a disposable tree.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engineVariant } from './p08-engine-variants.mjs';

const root = new URL('../../../', import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'p08-pass3-before-'));
cpSync(new URL('meta-regression/', root), join(directory, 'meta-regression'), { recursive: true });
cpSync(new URL('unit/', import.meta.url), join(directory, 'hub/shared/tests/unit'), { recursive: true });
const path = join(directory, 'meta-regression/plus-engine.js');
writeFileSync(path, engineVariant(readFileSync(path, 'utf8'), 'pass-3'));
console.log('RECONSTRUCTED pass 3: min(vi)-only stopping scale. Two planted failures and one passing control expected.');
const result = spawnSync(process.execPath,
  ['--test', '--test-reporter=tap', join(directory, 'hub/shared/tests/unit/p08-ml-convergence.test.mjs')], { encoding: 'utf8' });
if (result.error) throw result.error;
writeFileSync(join(directory, 'test-output.tap'), result.stdout || '');
console.log((result.stdout || '').split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
process.stderr.write(result.stderr || '');
console.log('Full TAP evidence: ' + join(directory, 'test-output.tap'));
process.exitCode = result.status ?? 1;
