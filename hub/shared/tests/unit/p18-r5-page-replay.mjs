// Run the original DOM suites and pinned page replay in an LF temporary checkout.
// The only installed dependency is test infrastructure; no repository file is written.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const temporaryRoot = resolve(tmpdir());
const scratch = mkdtempSync(join(temporaryRoot, 'p18-r5-page-'));
const relation = relative(temporaryRoot, resolve(scratch));
assert.ok(relation && !relation.startsWith('..') && !isAbsolute(relation), 'Scratch must be inside the temporary directory');

function stage(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  const bytes = readFileSync(source);
  // Reproduce CI checkout bytes; retain every recorded hash, number and assertion.
  writeFileSync(destination, /\.(?:js|cjs|mjs|html|json)$/.test(source)
    ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes);
}
function stageDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) stageDirectory(join(source, entry.name), join(destination, entry.name));
    else {
      assert.ok(entry.isFile(), `Expected a regular source file: ${entry.name}`);
      stage(join(source, entry.name), join(destination, entry.name));
    }
  }
}
function run(label, args) {
  console.log(`\n${label}: Node ${process.version}`);
  const result = spawnSync(process.execPath, args, {
    cwd: scratch, stdio: 'inherit', shell: false, timeout: 300000
  });
  if (result.error) console.log(`${label}: ${result.error.code || result.error.message}`);
  console.log(`${label}: exit ${result.status}; signal ${result.signal}`);
  return result.status === 0 && !result.error;
}
function section(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Source markers: ${start}, ${end}`);
  return text.slice(from, to);
}

try {
  const npmCli = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../share/nodejs/npm/bin/npm-cli.js')
  ].find(existsSync);
  assert.ok(npmCli, 'npm CLI is required to supply the missing test dependency');
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ private: true }));
  const userConfig = join(scratch, 'empty-user.npmrc');
  const globalConfig = join(scratch, 'empty-global.npmrc');
  writeFileSync(userConfig, '');
  writeFileSync(globalConfig, '');
  // Disable lifecycle scripts and isolate all dependency files, cache and logs.
  const install = spawnSync(process.execPath, [npmCli, 'install', '--save-exact', 'linkedom@0.18.12',
    '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/',
    '--prefix', scratch, '--cache', join(scratch, 'npm-cache'),
    '--userconfig', userConfig, '--globalconfig', globalConfig,
    '--fetch-retries=0', '--fetch-timeout=30000'
  ], { cwd: scratch, encoding: 'utf8', shell: false, timeout: 120000 });
  writeFileSync(join(scratch, 'npm-install.log'), (install.stdout || '') + (install.stderr || ''));
  assert.ok(install.status === 0 && !install.error,
    `Temporary linkedom installation failed: exit ${install.status}; ${install.error?.code || 'dependency unavailable'}`);
  const lock = JSON.parse(readFileSync(join(scratch, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/linkedom'].version, '0.18.12');
  console.log('Temporary test dependencies:', JSON.stringify(Object.fromEntries(
    Object.entries(lock.packages).filter(([name]) => name).map(([name, pkg]) =>
      [name, { version: pkg.version, integrity: pkg.integrity }])
  )));

  stageDirectory(join(root, 'multivariate-ma'), join(scratch, 'multivariate-ma'));
  for (const name of ['multivariate-ma.js', 'build-info.js']) {
    stage(join(root, 'shared', name), join(scratch, 'shared', name));
  }
  const suitesPassed = run('Original diagnostic and page-regression suites', ['--test',
    'multivariate-ma/tests/diagnostic.cjs', 'multivariate-ma/tests/review-regressions.cjs']);
  // No evidence-out argument: the original runner prints results without overwriting evidence.
  const replayPassed = run('Original pinned page replay', ['multivariate-ma/validate/run-plus-node.cjs']);
  if (!replayPassed) {
    // Attribute a page failure using the same retained-source reconstruction as the red replay.
    // This is not a complete historical checkout and cannot certify unrelated page history.
    const enginePath = join(scratch, 'shared/multivariate-ma.js');
    const engine = readFileSync(enginePath, 'utf8');
    const before = readFileSync(join(scratch, 'multivariate-ma/validate/diagnostic/baseline-engine.cjs'), 'utf8');
    const objStart = '  function _obj2(', objEnd = '\n  // Observational only:';
    const rankStart = '      // At a rank-one boundary', rankEnd = '      // Confirm the exact zero boundary';
    const reconstructed = engine
      .replace(section(engine, objStart, objEnd), section(before, objStart, '\n  function fit('))
      .replace(section(engine, rankStart, rankEnd), section(before, rankStart, rankEnd));
    writeFileSync(enginePath, reconstructed);
    run('Pinned page replay with pre-PR numerical blocks (reconstruction)', ['multivariate-ma/validate/run-plus-node.cjs']);
    writeFileSync(enginePath, engine);
  }
  assert.ok(suitesPassed && replayPassed, 'Both original suites and the pinned page replay must pass');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
