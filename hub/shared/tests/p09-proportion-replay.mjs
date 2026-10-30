import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// No source reconstruction or git access: use the saved pre-fix bytes and the
// current assertions. A failing old-code test process stays visible in the log.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const before = resolve(process.argv[2] || join(root, 'hub/shared/tests/fixtures/p09-proportion-before.txt'));
const output = resolve(process.argv[3] || join(root, 'hub/shared/tests/artifacts/p09-review'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(hash(before), '05e579f07d9e1939e3ed7dd70773c4387807171bf4b70f5bf02ca290b41bbb66',
  'Pre-fix page must match the original capture; never reconstruct it from the fix');
mkdirSync(output, { recursive: true });
const unitFiles = readdirSync(join(root, 'hub/shared/tests/unit')).filter(name => name.endsWith('.test.mjs'))
  .sort().map(name => 'hub/shared/tests/unit/' + name);
const inputs = [...new Set([
  'hub/shared/tests/p09-proportion-checks.mjs',
  'hub/shared/tests/unit/p09-proportion-harness.mjs',
  'hub/shared/tests/unit/p09-proportion-range.test.mjs',
  'hub/shared/tests/unit/p09-proportion-r.test.mjs',
  'hub/shared/tests/unit/p09-proportion-corpus.test.mjs',
  'hub/shared/tests/fixtures/p09-proportion-range.json',
  'shared/ma-core.js', 'hub/shared/analysis-lifecycle.js',
  'shared/alm-validate.js', 'proportion-ma/validate/adapter.js',
  'proportion-ma/validate/corpus/corpus.json', 'proportion-ma/validate/corpus/reference.json',
  ...unitFiles
])];
const hashes = () => Object.fromEntries(inputs.map(path => [path, hash(join(root, path))]));
const evidence = { node: process.version, inputs: hashes(), runs: {} };
// Node 24 can run tests without child-process IPC on restricted Windows hosts.
// Default runners retain their usual process isolation.
const testArgs = ['--test', '--test-reporter=tap',
  ...(process.env.P09_TEST_ISOLATION === 'none' ? ['--experimental-test-isolation=none'] : [])];
function run(label, args, page) {
  const stdout = join(output, label + '.stdout.txt');
  const stderr = join(output, label + '.stderr.txt');
  const out = openSync(stdout, 'w'), err = openSync(stderr, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, args, {
      cwd: root, env: { ...process.env, P09_PROPORTION_PAGE: page },
      stdio: ['ignore', out, err], timeout: 900000
    });
  } finally { closeSync(out); closeSync(err); }
  if (result.error) throw result.error;
  assert.equal(result.signal, null, label + ' terminated');
  return { ...result, stdout: readFileSync(stdout, 'utf8') };
}
for (const [label, page] of [['before', before], ['after', join(root, 'proportion-ma/index.html')]]) {
  const focused = run(label + '-focused', [...testArgs,
    'hub/shared/tests/unit/p09-proportion-range.test.mjs',
    'hub/shared/tests/unit/p09-proportion-r.test.mjs'], page);
  const count = name => {
    const match = focused.stdout.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'));
    assert.ok(match, label + ' missing ' + name + ' summary');
    return Number(match[1]);
  };
  const counts = { passed: count('pass'), failed: count('fail') };
  assert.equal(count('tests'), 45);
  for (const name of ['cancelled', 'skipped', 'todo']) assert.equal(count(name), 0);
  evidence.runs[label] = { page, sha256: hash(page), focused: { exit: focused.status, ...counts } };
  assert.deepEqual(counts, label === 'before' ? { passed: 21, failed: 24 } : { passed: 45, failed: 0 });
  assert.equal(focused.status, label === 'before' ? 1 : 0);
  // The current-tree replay also supplies the complete aggregate unit gate.
  const corpusFiles = label === 'before' ? ['hub/shared/tests/unit/p09-proportion-corpus.test.mjs'] : unitFiles;
  const corpus = run(label + '-corpus', [...testArgs, ...corpusFiles], page);
  assert.equal(corpus.status, 0, label + ' corpus failed; see raw output');
  const diagnostic = corpus.stdout.split(/\r?\n/).find(line => line.startsWith('# {"checks":'));
  assert.ok(diagnostic, label + ' corpus diagnostic missing');
  evidence.runs[label].corpus = { exit: corpus.status, ...JSON.parse(diagnostic.slice(2)) };
  if (label === 'after') {
    const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
      .map(name => [name, Number(corpus.stdout.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1])]));
    assert.ok(summary.tests >= 45);
    assert.equal(summary.pass, summary.tests);
    for (const name of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(summary[name], 0);
    evidence.unitGate = { files: unitFiles, ...summary };
  }
  console.log(label, JSON.stringify(evidence.runs[label]));
}
const oldMaxima = evidence.runs.before.corpus.maxima;
const newMaxima = evidence.runs.after.corpus.maxima;
assert.deepEqual(Object.keys(oldMaxima).sort(), Object.keys(newMaxima).sort());
evidence.changedMaxima = Object.keys(oldMaxima).filter(key => oldMaxima[key] !== newMaxima[key])
  .map(quantity => ({ quantity, before: oldMaxima[quantity], after: newMaxima[quantity] }));
assert.deepEqual(hashes(), evidence.inputs, 'Replay changed an input');
writeFileSync(join(output, 'replay.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('PASS: unchanged assertions reproduce 24 old-code failures and 21 controls; all 45 pass after the fix.');
