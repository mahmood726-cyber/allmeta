// Require assertion failures, not missing runtimes/imports, for each negative control.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const round3Baseline = process.argv.includes('--round3-baseline');
const baseline = process.argv.includes('--baseline') || round3Baseline;
const baselineFolder = round3Baseline ? 'round3-before' : 'baseline';
const root = path.resolve(__dirname, '../../..');
for (const [test, mutation, source] of [
  ['csv-upload-kinds.test.cjs', 'csv', 'csv-upload.js'],
  ['results-export-fallback.test.cjs', 'footer', 'results-export.js']
]) {
  const args = [path.join(__dirname, test)];
  if (baseline) {
    const original = path.join(root, 'integration-evidence/v181', baselineFolder, 'hub/shared', source);
    assert.ok(fs.existsSync(original), 'Original source must be present for baseline replay: ' + original);
    args.push(original);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: root, env: { ...process.env, V181_MUTANT: baseline ? '' : mutation },
    encoding: 'utf8', timeout: 30000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'Test process must finish normally');
  assert.equal(result.status, 1, 'Negative control must fail by an assertion: ' + result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /AssertionError/);
  assert.doesNotMatch(result.stderr, /mutation target must exist/i);
  if (mutation === 'footer') assert.match(result.stderr, round3Baseline ? /actual|expected/ : /STATIC BOILERPLATE/);
  if (mutation === 'csv') assert.match(result.stderr, round3Baseline ? /FAIL se1 cannot become vi1/ : /FAIL se explicitly squared/);
  console.log('PASS negative control (' + (baseline ? 'original source' : mutation) + '): ' + test);
  console.log((result.stdout + result.stderr).split('\n').slice(0, 12).join('\n'));
}
if (round3Baseline) {
  const original = path.join(root, 'integration-evidence/v181/round3-before');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'results-export-snapshots.test.cjs'), original], {
    cwd: root, env: { ...process.env, V181_MUTANT: '' }, encoding: 'utf8', timeout: 30000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, 'Snapshot regressions must fail by assertions');
  assert.match(result.stderr, /AssertionError/);
  assert.match(result.stderr, /FAIL DTA export never recomputes/);
  assert.match(result.stderr, /FAIL meta-regression flag comes from/);
  assert.doesNotMatch(result.stderr, /SyntaxError|ReferenceError|TypeError|accessor must exist/);
  console.log('PASS Round 3 snapshot regressions reject original adapters');
  console.log(result.stderr);
}
if (process.argv.includes('--browser')) {
  const cli = require.resolve('@playwright/test/cli');
  function collect(suites) {
    return suites.flatMap(s => [...(s.specs || []), ...collect(s.suites || [])]);
  }
  for (const [spec, mutant, count, grep] of [
    ['csv-upload-kinds.spec.mjs', 'csv', 3, null],
    ['results-export-run-methods.spec.mjs', 'footer', 8, 'Methods describe the completed run']
  ]) {
    const args = [cli, 'test', spec, '--workers=1', '--reporter=json'];
    if (grep) args.push('--grep', grep);
    const r = spawnSync(process.execPath, args, {
      cwd: __dirname, env: { ...process.env, V181_MUTANT: mutant },
      encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024
    });
    assert.ifError(r.error);
    assert.equal(r.status, 1, 'Mutant browser run must be red: ' + r.stdout + r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.errors.length, 0, 'No setup/runtime errors allowed');
    assert.equal(report.stats.unexpected, count);
    const specs = collect(report.suites);
    assert.equal(specs.length, count);
    for (const s of specs) {
      const errors = s.tests.flatMap(t => t.results.flatMap(r => r.errors || []));
      assert.ok(errors.some(e => /expect\(/.test(e.message || '')), s.title + ': must fail an assertion, not browser setup');
      console.log('PASS mutation caught (' + mutant + '): ' + s.title);
    }
  }
}
