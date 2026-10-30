import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
export const unit = 'hub/shared/tests/unit/';

// Preserve the harness's relative app root in an isolated tree. Tests and
// fixtures are copied unchanged; only the explicitly planted input is edited.
export function withReplayTree(run) {
  const directory = mkdtempSync(join(tmpdir(), 'p03-replay-'));
  try {
    for (const path of [
      'dta-sroc/index.html', 'shared/dta-bivariate.js',
      'hub/shared/results-export.js', 'hub/shared/analysis-lifecycle.js',
      ...['p03-results-export.test.mjs', 'p03-results-harness.mjs',
        'p03-diagnostics-input.csv', 'p03-diagnostics-reference.json'].map(name => unit + name),
    ]) {
      const dest = join(directory, path);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(new URL(path, root), dest);
    }
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function runExportSuite(directory, pattern) {
  const args = ['--test', '--test-reporter=tap'];
  if (pattern) args.push('--test-name-pattern=' + pattern);
  args.push(join(directory, unit, 'p03-results-export.test.mjs'));
  const result = spawnSync(process.execPath, args, {
    cwd: directory, encoding: 'utf8', timeout: 120000,
    // Start an independent test runner without inherited NODE_TEST_CONTEXT.
    // The copied suite needs only a temporary directory; use its isolated tree.
    env: { TMPDIR: directory, TEMP: directory, TMP: directory },
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, result.stderr);
  return { status: result.status, output: result.stdout + result.stderr };
}

export function setInput(directory, text) {
  writeFileSync(join(directory, unit, 'p03-diagnostics-input.csv'), text);
}

export const lfInput = readFileSync(new URL('./p03-diagnostics-input.csv', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
