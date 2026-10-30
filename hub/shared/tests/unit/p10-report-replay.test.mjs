// Reproduce the pre-PR failure without git, a separate base tree, or altered assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p10-report-methods.test.mjs';
const readLF = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
// GitHub's immutable base revision, retrieved through the read-only connector:
// https://github.com/mahmood726-cyber/allmeta/blob/66aeba6349060f5954e52b0c941495366f160e8a/mh-peto/index.html
const baseBlob = '84150a5b915447ff57e67067e85992f3384901d7';
const addition = `      // Describe the completed analysis, even if the selector has since changed.
      get description() {
        var measure = _lastResults ? _lastResults.measure : 'OR';
        return 'Fixed-effect Mantel-Haenszel pooling of the ' + MEASURE_NAME[measure] +
          (measure === 'OR' ? ', with Peto one-step odds ratio pooling.' : '.');
      },
      methods: function () {
        var measure = _lastResults ? _lastResults.measure : 'OR';
        if (measure === 'RD') return 'The pooled Mantel-Haenszel risk difference uses Greenland-Robins variance and no continuity correction.';
        if (measure === 'RR') return 'The pooled Mantel-Haenszel risk ratio uses the log-scale MH variance and no continuity correction.';
        return 'MH OR uses Robins-Breslow-Greenland variance. Peto OR is exp(sum(O-E) / sum(V)). ' +
          'Both pooled estimates use no continuity correction; Peto requires roughly balanced arms.';
      },
`;

test('P10-R3 replay: pinned pre-PR page fails all five plants and passes all five controls', () => {
  const current = readLF('mh-peto/index.html');
  assert.equal(current.split(addition).length, 2, 'The exact PR addition occurs once');
  const baseline = current.replace(addition, '');
  // Compute the published blob identifier directly; no git process or checkout.
  assert.equal(createHash('sha1').update(`blob ${Buffer.byteLength(baseline)}\0`).update(baseline).digest('hex'), baseBlob);
  const scratch = mkdtempSync(join(tmpdir(), 'p10-pre-pr-'));
  try {
    for (const path of [suite, 'mh-peto/index.html', 'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
      const target = join(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, path === 'mh-peto/index.html' ? baseline : readLF(path));
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
      // Do not inherit the parent node:test context: it suppresses nested runs.
      // This self-contained child needs no inherited environment variables.
      env: {}, cwd: scratch, encoding: 'utf8', timeout: 120_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    const failures = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1].trim());
    const passes = [...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1].trim());
    for (const name of failures) console.log('PRE-PR FAIL:', name);
    for (const name of passes) console.log('PRE-PR PASS:', name);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(failures, [
      'P10-R3 plant: RD report-txt describes Greenland-Robins variance, not OR methods',
      'P10-R3 plant: RR report-txt describes the selected risk ratio',
      'P10-R3 plant: RD report-md describes Greenland-Robins variance, not OR methods',
      'P10-R3 plant: RR report-md describes the selected risk ratio',
      'P10-R3 plant: report metadata follows completed analyses across measure changes',
    ], result.stdout + result.stderr);
    assert.equal(passes.length, 5, result.stdout);
    assert.ok(passes.every(name => name.startsWith('P10-R3 control:')), result.stdout);
    assert.match(result.stdout, /# fail 5\b/);
    assert.match(result.stdout, /# pass 5\b/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
