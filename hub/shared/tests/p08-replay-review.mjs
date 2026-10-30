// Run the new plants unchanged with the documented supplied-PR defects restored.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engineVariant } from './p08-engine-variants.mjs';

const root = new URL('../../../', import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'p08-review-before-'));
cpSync(new URL('meta-regression/', root), join(directory, 'meta-regression'), { recursive: true });
cpSync(new URL('unit/', import.meta.url), join(directory, 'hub/shared/tests/unit'), { recursive: true });
const path = join(directory, 'meta-regression/plus-engine.js');
writeFileSync(path, engineVariant(readFileSync(path, 'utf8'), 'pr-head'));
// Restore raw-byte hashing only in this disposable replay.
writeFileSync(join(directory, 'hub/shared/tests/p08-lf-bytes.mjs'), 'export const lfBytes = bytes => bytes;\n');
console.log('RECONSTRUCTED supplied PR: mean(vi) stopping scale and raw-byte provenance. Expected planted failures follow.');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...[
  'p08-ml-imprecise.test.mjs', 'p08-ml-review.test.mjs', 'p08-ml-provenance.test.mjs'
].map(name => join(directory, 'hub/shared/tests/unit', name))], { encoding: 'utf8' });
if (result.error) throw result.error;
writeFileSync(join(directory, 'test-output.tap'), result.stdout || '');
console.log((result.stdout || '').split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
process.stderr.write(result.stderr || '');
console.log('Full TAP evidence: ' + join(directory, 'test-output.tap'));
process.exitCode = result.status ?? 1;
