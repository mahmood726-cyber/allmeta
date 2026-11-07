import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/rev-p10-r2.test.mjs';
const plants = [
  ...['LF', 'CRLF', 'CR'].map(newline => `P10-R2 plant: ${newline} inside a CSV label cannot inject an analysed study`),
  'P10-R2 plant: a plain multiline label is visibly rejected without clearing previous results',
  'P10-R2 plant: a corrected CSV loads after a rejected import and clears the notice',
];
const controls = [
  ...['OR', 'RR', 'RD'].map(measure => `P10-R2 control: ordinary CSV preserves two studies, labels and ${measure} results`),
  'P10-R2 control: optional blank study labels still load',
];

// This is a synthetic defect replay, not an archived main/pre-PR checkout.
// The existing regression assertions are copied verbatim; only the page's
// CSV-label guard is removed, and only in a fresh operating-system temp folder.
function replayDefect() {
  const replay = mkdtempSync(path.join(tmpdir(), 'rev-p10-r2-'));
  console.log(`Replay artifacts: ${replay}`);
  for (const relative of [suite, 'mh-peto/index.html', 'hub/shared/csv-upload.js']) {
    const target = path.join(replay, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(new URL(relative, root), target);
  }

  function run(label) {
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
      cwd: replay, encoding: 'utf8', timeout: 30000,
    });
    writeFileSync(path.join(replay, `${label}.tap`), result.stdout || '');
    writeFileSync(path.join(replay, `${label}.stderr.txt`), result.stderr || '');
    assert.ifError(result.error);
    assert.equal(result.signal, null, `${label}: test process must complete`);
    const passed = [...result.stdout.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(m => m[1].trim());
    const failed = [...result.stdout.matchAll(/^not ok \d+ - (.+)\r?$/gm)].map(m => m[1].trim());
    assert.equal(passed.length + failed.length, plants.length + controls.length,
      `${label}: all original tests must execute; see ${replay}`);
    assert.match(result.stdout, /^# skipped 0\r?$/m);
    assert.match(result.stdout, /^# todo 0\r?$/m);
    return { ...result, passed, failed };
  }

  const supplied = run('supplied-pr');
  assert.equal(supplied.status, 0, `supplied PR tests failed; see ${replay}`);
  assert.deepEqual(supplied.failed, []);
  assert.deepEqual(supplied.passed.sort(), [...plants, ...controls].sort());

  const pagePath = path.join(replay, 'mh-peto/index.html');
  const page = readFileSync(pagePath, 'utf8').replace(/\r\n/g, '\n');
  const loader = '    window.__almLoad = function (rows) {\n';
  const loaderStart = page.indexOf(loader);
  assert.ok(loaderStart >= 0, 'locate the actual CSV loader');
  assert.equal(page.indexOf(loader, loaderStart + loader.length), -1, 'loader is unique');
  const guardStart = loaderStart + loader.length;
  const guardEnd = page.indexOf('      var lines = rows.map(function (r) {', guardStart);
  assert.ok(guardEnd > guardStart, 'locate serialization after the guard');
  const guard = page.slice(guardStart, guardEnd);
  assert.ok(guard.includes("if (/[\\r\\n]/.test(rows[i].study || '')) {"));
  assert.ok(guard.includes('          return;'));
  writeFileSync(path.join(replay, 'removed-guard.txt'), guard);
  writeFileSync(pagePath, page.slice(0, guardStart) + page.slice(guardEnd));

  const mutant = run('synthetic-no-label-guard');
  assert.equal(mutant.status, 1, `the planted defect must fail assertions; see ${replay}`);
  assert.deepEqual(mutant.failed.sort(), [...plants].sort());
  assert.deepEqual(mutant.passed.sort(), [...controls].sort());
  for (const name of plants) console.log(`Synthetic defect FAIL; supplied PR PASS: ${name}`);
  for (const name of controls) console.log(`PASS on both: ${name}`);
  for (const match of mutant.stdout.matchAll(/^# CSV records=.*$/gm)) console.log(match[0].slice(2));
  console.log('PASS: supplied PR 9/9; synthetic defect 5 expected failures and 4 passing controls.');
}

replayDefect();
