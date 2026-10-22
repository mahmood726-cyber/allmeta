const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const variant = process.env.CRAWL_CLASSIFY_VARIANT || 'fixed';
let classifyAssetFailure;
if (variant === 'legacy') {
  // Original pre-round-1 listeners marked every failure as missing.
  classifyAssetFailure = () => 'missing';
} else if (variant === 'round1') {
  // Exact helper source before round 2, retained as a failing-first control.
  const sandbox = { exports: {} };
  runInNewContext("/**\n * Classify a failed asset response/request. An absent re-check means pending.\n * A first 4xx is always missing, even if a later request could succeed.\n * @param {number|string} first HTTP status or network error text\n * @param {number|string} [recheck] HTTP status or network error text\n * @returns {'missing'|'transient'|'recheck'}\n */\nfunction classifyAssetFailure(first, recheck) {\n  if (typeof first === 'number' && first >= 400 && first < 500) return 'missing';\n  if (recheck === undefined) return 'recheck';\n  return typeof recheck === 'number' && recheck < 400 ? 'transient' : 'missing';\n}\n\nexports.classifyAssetFailure = classifyAssetFailure;\n", sandbox);
  ({ classifyAssetFailure } = sandbox.exports);
} else if (variant === '404-transient' || variant === 'blocked-transient') {
  const source = readFileSync(require.resolve('./pages-crawl-classify.cjs'), 'utf8');
  const signature = 'function classifyAssetFailure(first, recheck) {';
  assert.equal(source.split(signature).length, 2, 'mutation must match the production function once');
  const defect = variant === '404-transient'
    ? "if (first === 404) return 'transient';"
    : "if (first === 'net::ERR_BLOCKED_BY_RESPONSE') return recheck === undefined ? 'recheck' : 'transient';";
  const sandbox = { exports: {} };
  runInNewContext(source.replace(signature, signature + '\n' + defect), sandbox);
  ({ classifyAssetFailure } = sandbox.exports);
} else {
  assert.equal(variant, 'fixed', 'unknown classifier variant');
  ({ classifyAssetFailure } = require('./pages-crawl-classify.cjs'));
}

for (const status of [400, 401, 403, 404, 410, 499]) {
  test(`${status} fails without a re-check`, () => {
    assert.equal(classifyAssetFailure(status), 'missing');
  });
  test(`${status} cannot be excused by a later 200`, () => {
    assert.equal(classifyAssetFailure(status, 200), 'missing');
  });
}

for (const first of [
  408, 429, 500, 503, 599,
  'net::ERR_CONNECTION_RESET', 'net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_REFUSED', 'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_TIMED_OUT', 'net::ERR_NETWORK_CHANGED', 'net::ERR_EMPTY_RESPONSE',
  'net::ERR_HTTP2_PROTOCOL_ERROR', 'net::ERR_INTERNET_DISCONNECTED',
  'Timeout 30000ms exceeded', 'net::err_connection_reset',
]) {
  test(`${first} needs one re-check`, () => {
    assert.equal(classifyAssetFailure(first), 'recheck');
  });
  for (const [outcome, expected] of [
    [200, 'transient'], [204, 'transient'], [304, 'transient'],
    [403, 'missing'], [404, 'missing'], [408, 'missing'], [429, 'missing'],
    [503, 'missing'], ['net::ERR_CONNECTION_RESET', 'missing'], ['timeout', 'missing'],
  ]) {
    test(`${first} then ${outcome} is ${expected}`, () => {
      assert.equal(classifyAssetFailure(first, outcome), expected);
    });
  }
}

for (const first of [
  'net::ERR_BLOCKED_BY_RESPONSE', 'net::ERR_BLOCKED_BY_CLIENT',
  'net::ERR_BLOCKED_BY_ORB', 'ORB', 'CORB', 'CORS',
  'blocked by CORS policy', 'Mixed Content: insecure script blocked',
  'net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CERT_DATE_INVALID',
  'net::ERR_FAILED', 'failed', '', 600,
]) {
  test(`${first} fails immediately`, () => {
    assert.equal(classifyAssetFailure(first), 'missing');
  });
  test(`${first} then 200 is missing`, () => {
    assert.equal(classifyAssetFailure(first, 200), 'missing');
  });
}
