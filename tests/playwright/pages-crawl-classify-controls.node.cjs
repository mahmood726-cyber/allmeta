const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');

const suite = require.resolve('./pages-crawl-classify.node.cjs');
for (const [variant, expectedFailure] of [
  ['legacy', '503 then 200 is transient'],
  ['round1', 'net::ERR_BLOCKED_BY_RESPONSE then 200 is missing'],
  ['404-transient', '404 cannot be excused by a later 200'],
  ['blocked-transient', 'net::ERR_BLOCKED_BY_RESPONSE then 200 is missing'],
]) {
  test(`rejects ${variant} with a regression assertion`, () => {
    const env = { ...process.env, CRAWL_CLASSIFY_VARIANT: variant };
    // Start an independent runner, even when this harness is itself under node --test.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'child must complete normally');
    // Node's test runner returns 1 for failed assertions. A crash is not a red test.
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /code: 'ERR_ASSERTION'/);
    assert.ok(result.stdout.split('\n').some((line) =>
      /^not ok \d+ - /.test(line) && line.endsWith(expectedFailure)),
    `expected failing case: ${expectedFailure}\n${result.stdout}\n${result.stderr}`);
  });
}
