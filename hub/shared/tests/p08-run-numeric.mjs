// Run the original numerical/DOM suite without rewriting published evidence.
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = new URL('../../../', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'p08-numeric-'));
cpSync(new URL('meta-regression', root), join(dir, 'meta-regression'), { recursive: true });
mkdirSync(join(dir, 'hub/shared/tests'), { recursive: true });
cpSync(new URL('p08-lf-bytes.mjs', import.meta.url), join(dir, 'hub/shared/tests/p08-lf-bytes.mjs'));
// Resolve the optional dependency where the README says it may be installed.
// If absent, install the pinned test-only dependency and its cache in TEMP.
const require = createRequire(import.meta.url);
let dependency;
try { dependency = require.resolve('linkedom'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  const args = ['install', '--prefix', dir, '--cache', join(dir, 'npm-cache'),
    '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', 'linkedom@0.18.12'];
  const install = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm ' + args.map(a => '"' + a + '"').join(' ')], { stdio: 'inherit', windowsVerbatimArguments: true })
    : spawnSync('npm', args, { stdio: 'inherit' });
  if (install.error) throw install.error;
  assert.equal(install.status, 0, 'install linkedom in the temporary test directory');
  dependency = createRequire(join(dir, 'package.json')).resolve('linkedom');
}
// All generated evidence stays in the disposable copy; no environment is read.
const harness = join(dir, 'meta-regression/validate/dom-harness.mjs');
const selector = "process.env.LINKEDOM_MODULE?pathToFileURL(process.env.LINKEDOM_MODULE).href:'linkedom'";
const source = readFileSync(harness, 'utf8');
assert.equal(source.split(selector).length, 2, 'recognize optional dependency selector');
writeFileSync(harness, source.replace(selector, JSON.stringify(pathToFileURL(dependency).href)));
const r = spawnSync(process.execPath, ['--test', join(dir, 'meta-regression/validate/numeric.test.mjs')], { encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
