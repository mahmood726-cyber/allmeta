const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const variant = process.env.CRAWL_CLASSIFY_VARIANT || 'fixed';
let classifyAssetFailure;
if (variant === 'legacy') {
  // Both original listeners unconditionally appended every failure.
  classifyAssetFailure = () => 'missing';
} else if (variant === '404-transient') {
  const source = readFileSync(require.resolve('./pages-crawl-classify.cjs'), 'utf8');
  const guard = `if (typeof first === 'number' && first >= 400 && first < 500) return 'missing';`;
  assert.ok(source.includes(guard), '404 mutation must match the production guard');
  const sandbox = { exports: {} };
  runInNewContext(source.replace(guard, guard.replace(`return 'missing'`, `return 'transient'`)), sandbox);
  ({ classifyAssetFailure } = sandbox.exports);
} else {
  assert.equal(variant, 'fixed', 'unknown classifier variant');
  ({ classifyAssetFailure } = require('./pages-crawl-classify.cjs'));
}

for (const [name, first, recheck, expected] of [
  ['404 fails without a re-check', 404, undefined, 'missing'],
  ['404 cannot be excused by a later 200', 404, 200, 'missing'],
  ['403 fails without a re-check', 403, undefined, 'missing'],
  ['503 needs a re-check', 503, undefined, 'recheck'],
  ['503 then 200 is transient', 503, 200, 'transient'],
  ['503 then 503 is missing', 503, 503, 'missing'],
  ['503 then 404 is missing', 503, 404, 'missing'],
  ['503 then network error is missing', 503, 'net::ERR_FAILED', 'missing'],
  ['blocked response then 200 is transient', 'net::ERR_BLOCKED_BY_RESPONSE', 200, 'transient'],
  ['network error needs a re-check', 'net::ERR_FAILED', undefined, 'recheck'],
  ['network error then error is missing', 'net::ERR_FAILED', 'timeout', 'missing'],
  ['network error then 404 is missing', 'net::ERR_FAILED', 404, 'missing'],
]) {
  test(name, () => assert.equal(classifyAssetFailure(first, recheck), expected));
}
