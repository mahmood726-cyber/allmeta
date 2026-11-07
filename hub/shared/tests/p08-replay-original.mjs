// The supplied tree has no base/. Reconstruct only the two documented pre-PR
// behaviors in a disposable copy; this is not an authenticated old checkout.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engineVariant } from './p08-engine-variants.mjs';

const root = new URL('../../../', import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'p08-original-'));
cpSync(new URL('meta-regression/', root), join(directory, 'meta-regression'), { recursive: true });
cpSync(new URL('unit/', import.meta.url), join(directory, 'hub/shared/tests/unit'), { recursive: true });
const path = join(directory, 'meta-regression/plus-engine.js');
writeFileSync(path, engineVariant(readFileSync(path, 'utf8'), 'original'));
console.log('RECONSTRUCTED original: absolute variance floor and unconditional LRT clamp');
console.log('Expected failing plants are reported by Node; a nonzero exit is intentional.');
const result = spawnSync(process.execPath,
  ['--test', '--test-reporter=tap', join(directory, 'hub/shared/tests/unit/p08-ml-scale.test.mjs')], { encoding: 'utf8' });
if (result.error) throw result.error;
writeFileSync(join(directory, 'test-output.tap'), result.stdout || '');
console.log((result.stdout || '').split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
process.stderr.write(result.stderr || '');
console.log('Full TAP evidence: ' + join(directory, 'test-output.tap'));
process.exitCode = result.status ?? 1;
