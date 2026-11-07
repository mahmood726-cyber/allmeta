// External-runner entrypoint. All dependencies, logs and copies live in TEMP.
// No environment inspection, git, altered assertions or regenerated references.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'p18-review-'));
const work = path.join(out, 'tree');
const statuses = [];
console.log('P18 review artifacts:', out);
console.log('Node:', process.version);

function run(label, args, cwd = root, timeout = 1800000) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '');
  fs.writeFileSync(path.join(out, label + '.log'), output);
  console.log(label + ': exit ' + result.status);
  console.log(output);
  statuses.push({ label, status: result.status, signal: result.signal, error: result.error?.message });
  return result.status === 0;
}

const units = fs.readdirSync(path.join(root, 'hub/shared/tests/unit'))
  .filter(file => file.endsWith('.test.mjs')).sort()
  .map(file => path.join('hub/shared/tests/unit', file));
run('shared-unit-gate', ['--test', '--test-reporter=tap', ...units]);

// Copy exact bytes; node's normal package resolution then finds the temporary
// dependency without NODE_PATH, require hooks, or any edits to the reviewed tree.
fs.mkdirSync(work);
for (const folder of ['multivariate-ma', 'shared']) {
  fs.cpSync(path.join(root, folder), path.join(work, folder), { recursive: true });
}
const sourceHashes = {};
for (const file of ['multivariate-ma/index.html', 'multivariate-ma/plus-ui.js',
  'multivariate-ma/tests/review-regressions.cjs', 'multivariate-ma/tests/diagnostic.cjs',
  'multivariate-ma/validate/run-plus-node.cjs']) {
  const original = fs.readFileSync(path.join(root, file));
  if (!original.equals(fs.readFileSync(path.join(work, file)))) throw new Error('Copy mismatch: ' + file);
  sourceHashes[file] = createHash('sha256').update(original.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}
fs.writeFileSync(path.join(out, 'source-hashes.json'), JSON.stringify(sourceHashes, null, 2) + '\n');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const userConfig = path.join(out, 'empty-user.npmrc'), globalConfig = path.join(out, 'empty-global.npmrc');
fs.writeFileSync(userConfig, ''); fs.writeFileSync(globalConfig, '');
const installed = run('install-linkedom', [npm, 'install', '--prefix', work,
  '--cache', path.join(out, 'npm-cache'), '--userconfig', userConfig, '--globalconfig', globalConfig,
  '--registry', 'https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund',
  '--save-exact', 'linkedom@0.18.12'], work, 180000);
if (installed) {
  for (const file of ['review-regressions', 'diagnostic', 'units-invariance']) {
    run(file, ['--test', '--test-reporter=tap', `multivariate-ma/tests/${file}.cjs`], work);
  }
  run('pinned-plus-replay', ['multivariate-ma/validate/run-plus-node.cjs', path.join(out, 'plus-replay.json')], work);
}
fs.writeFileSync(path.join(out, 'statuses.json'), JSON.stringify(statuses, null, 2) + '\n');
console.log('P18 REVIEW STATUS', JSON.stringify(statuses));
process.exitCode = statuses.every(result => result.status === 0) ? 0 : 1;
