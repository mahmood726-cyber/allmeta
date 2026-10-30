// Run the unchanged CI parser/DOM suite before and after the diagnostic fix.
// Install CI's exact linkedom version in the isolated OS temporary tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { restorePreFix } = require('./p15-diagnostics-replay.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p15-parser-integration-'));
try {
  const relative = 'hub/shared/tests/rve-meta-parser.node.cjs';
  const files = [relative, 'rve-meta/index.html',
    'rve-meta/tests/fixtures/p15/as-character.json',
    'rve-meta/tests/fixtures/p15/read-csv-logical.json',
    ...['stats-qt', 'rve-eigen', 'rve', 'rve-extras', 'build-info'].map(name => `shared/${name}.js`)];
  for (const file of files) {
    const destination = path.join(temp, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  // The isolated copy needs its own dependencies; no source-tree install.
  const candidates = [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  try { candidates.push(path.join(path.dirname(require.resolve('npm/package.json')), 'bin/npm-cli.js')); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }
  const npm = candidates.find(file => fs.existsSync(file));
  assert.ok(npm, 'npm CLI is required to install the same linkedom dependency as CI');
  const install = spawnSync(process.execPath, [npm, 'install', '--no-save', '--no-package-lock',
    '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', temp,
    '--cache', path.join(temp, 'npm-cache'), 'linkedom@0.18.12'], {
    cwd: temp, encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  if (install.error) throw install.error;
  assert.equal(install.status, 0, 'temporary linkedom installation must succeed');
  console.log('Installed linkedom@0.18.12 in the isolated temporary test tree.');
  const extras = path.join(temp, 'shared/rve-extras.js');
  const current = fs.readFileSync(extras, 'utf8');
  for (const [label, source, expectedStatus] of [
    ['pre-fix PR head', restorePreFix(current), 1], ['fixed parser', current, 0],
  ]) {
    fs.writeFileSync(extras, source);
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', relative], {
      cwd: temp, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    });
    const outcomes = [...(result.stdout || '').matchAll(/^(not ok|ok) \d+ - (.+)$/gm)];
    console.log(label);
    try {
      if (result.error) throw result.error;
      assert.equal(result.signal, null);
      assert.equal(result.status, expectedStatus, label);
      assert.equal(outcomes.length, 13, 'all unchanged parser/DOM tests must run');
      for (const [line, status, name] of outcomes) {
        console.log(line);
        const isConflict = name === 'P1: partially recognized headers and missing first values are refused';
        assert.equal(status, expectedStatus && isConflict ? 'not ok' : 'ok', name);
      }
    } catch (error) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      throw error;
    }
  }
  console.log('Integration verified: the original CI conflict FAILS before the fix; all 13 tests PASS after it.');
} finally {
  assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('p15-parser-integration-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
