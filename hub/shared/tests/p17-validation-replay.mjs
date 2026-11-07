// Run the existing correlation DOM validators with their documented dependency.
// All copies, packages, npm cache and output stay in a fresh temporary directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'p17-validation-replay-'));
console.log('Validation evidence: ' + directory);
const tests = [
  'hub/shared/tests/correlation-ma-refusal.node.cjs',
  'hub/shared/tests/validate-correlation-ma.node.cjs',
  'hub/shared/tests/validate-correlation-ma-plus.node.cjs',
];
const originals = new Map();
function copy(path) {
  const bytes = readFileSync(join(root, path));
  const target = join(directory, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  originals.set(path, bytes);
}
function copyDirectory(path) {
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const child = path + '/' + entry.name;
    if (entry.isDirectory()) copyDirectory(child);
    else { assert.ok(entry.isFile(), child + ': expected ordinary source file'); copy(child); }
  }
}
copyDirectory('correlation-ma');
for (const path of [...tests, 'shared/ma-core.js', 'shared/alm-validate.js',
  'hub/shared/results-export.js', 'hub/shared/a11y-landmarks.js', 'hub/shared/chart-export-auto.js']) copy(path);
writeFileSync(join(directory, 'provenance.json'), JSON.stringify({
  node: process.version,
  hash_encoding: 'UTF-8 with CRLF normalized to LF; copies retain original bytes',
  files: [...originals].map(([path, bytes]) => ({ path,
    sha256: createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex'),
  })),
}, null, 2) + '\n');

function run(label, args, timeout) {
  const result = spawnSync(process.execPath, args, {
    cwd: directory, env: {}, windowsHide: true, encoding: 'utf8', timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(directory, label + '.stdout.txt'), result.stdout || '');
  writeFileSync(join(directory, label + '.stderr.txt'), result.stderr || '');
  const summary = { label, status: result.status, signal: result.signal, error: result.error?.message };
  console.log(JSON.stringify(summary));
  if (result.stdout) console.log(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
  return summary;
}

// Use the installed npm CLI directly: no shell, host configuration or environment access.
const npm = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  '/usr/share/nodejs/npm/bin/npm-cli.js',
].find(path => existsSync(path));
assert.ok(npm, 'An installed npm CLI is required to provision linkedom 0.18.12');
writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, dependencies: { linkedom: '0.18.12' } }) + '\n');
for (const name of ['user.npmrc', 'global.npmrc']) writeFileSync(join(directory, name), '');
const install = run('install', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund',
  '--registry=https://registry.npmjs.org/', '--fetch-retries=0', '--fetch-timeout=30000',
  '--cache=' + join(directory, 'npm-cache'), '--userconfig=' + join(directory, 'user.npmrc'),
  '--globalconfig=' + join(directory, 'global.npmrc')], 120_000);
assert.equal(install.status, 0, 'Dependency installation failed; see temporary install logs');
const dependency = JSON.parse(readFileSync(join(directory, 'node_modules/linkedom/package.json'), 'utf8'));
assert.equal(dependency.version, '0.18.12');
console.log('Dependency: linkedom ' + dependency.version + '; exact resolved dependencies retained in temporary package-lock.json');
// Profile the unchanged plus validator: its previous run exhausted this same
// ten-minute limit without reaching its final summary. V8's streaming log
// survives termination and keeps the diagnostic separate from test assertions.
const profilePath = join(directory, 'plus-v8.log');
const runs = tests.map((path, index) => run('validator-' + (index + 1),
  index === 0 ? ['--test', '--test-reporter=tap', path] : index === 2 ?
    ['--prof', '--prof-sampling-interval=10000', '--no-logfile-per-isolate', '--logfile=' + profilePath, path] :
    [path], 600_000));
const profile = existsSync(profilePath) ?
  run('validator-3-profile', ['--prof-process', profilePath], 120_000) :
  { error: 'V8 profile log was not produced' };
for (const [path, bytes] of originals) {
  assert.deepEqual(readFileSync(join(root, path)), bytes, path + ': source unchanged');
  assert.deepEqual(readFileSync(join(directory, path)), bytes, path + ': replay copy unchanged');
}
writeFileSync(join(directory, 'summary.json'), JSON.stringify({ dependency: { linkedom: dependency.version }, runs, profile }, null, 2) + '\n');
assert.ok(runs.every(run => run.status === 0), 'Existing DOM validator failed; see temporary logs');
