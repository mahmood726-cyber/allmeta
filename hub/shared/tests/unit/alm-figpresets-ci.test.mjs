import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../../../.github/workflows/features.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

function job(source, name) {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `Missing ${name} job`);
  return source.slice(start + 1).split(/\n  [a-z][\w-]*:\n/)[0];
}

function evidenceContract(source) {
  const browser = job(source, 'browser');
  assert.match(browser, /uses: actions\/upload-artifact@v4\n        with:\n          name: figpresets-evidence\n          path: hub\/shared\/tests\/rchecks-out\/figpresets\/\n          if-no-files-found: error/);
  const check = job(source, 'figpresets-r');
  assert.match(check, /\n    needs: browser\n/);
  assert.match(check, /uses: actions\/download-artifact@v4\n        with:\n          name: figpresets-evidence\n          path: hub\/shared\/tests\/rchecks-out\/figpresets\//);
  assert.match(check, /uses: r-lib\/actions\/setup-r@v2/);
}

function executionContract(source) {
  const check = job(source, 'figpresets-r');
  assert.match(check, /set -o pipefail\n          Rscript hub\/shared\/tests\/rchecks\/figpresets\.R 2>&1 \| tee figpresets-r\.log/);
  for (const marker of ['PLANT_DETECTED', 'R_CHECK_PASS']) {
    assert.ok(check.includes(`test "$(grep -cx '${marker}' figpresets-r.log)" -eq 1`), `Require exactly one ${marker}`);
  }
  assert.match(check, /if: always\(\)\n        uses: actions\/upload-artifact@v4/);
  assert.match(check, /path: figpresets-r\.log/);
}

test('CI hands actual browser figure files to the independent R job', () => {
  evidenceContract(workflow);
  for (const [from, to] of [
    ['name: figpresets-evidence', 'name: unrelated-evidence'],
    ['if-no-files-found: error', 'if-no-files-found: ignore'],
    ['needs: browser', 'needs: unit'],
    ['uses: r-lib/actions/setup-r@v2', 'uses: missing-r'],
  ]) assert.throws(() => evidenceContract(workflow.replaceAll(from, to)), undefined, `Plant: ${from}`);
});

test('CI requires successful R execution, its rejected plant, and its complete matrix marker', () => {
  executionContract(workflow);
  for (const removed of [
    'set -o pipefail',
    'Rscript hub/shared/tests/rchecks/figpresets.R',
    `test "$(grep -cx 'PLANT_DETECTED' figpresets-r.log)" -eq 1`,
    `test "$(grep -cx 'R_CHECK_PASS' figpresets-r.log)" -eq 1`,
  ]) {
    // Other jobs have pipefail too; plant only in this job.
    const check = job(workflow, 'figpresets-r');
    const planted = workflow.replace(check, check.replace(removed, '# missing check'));
    assert.throws(() => executionContract(planted), undefined, `Plant: ${removed}`);
  }
});
