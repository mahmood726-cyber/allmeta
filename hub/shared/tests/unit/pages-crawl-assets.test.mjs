import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Pin the requirement of the failed PR #263 browser check without a browser.
// These controlled request events do not reproduce webR's network failure.
const source = readFileSync(new URL('../../../../tests/playwright/pages-crawl.spec.ts', import.meta.url), 'utf8');
const predicate = source.match(/function isBenignAsset\(url: string, errText: string\): boolean \{([\s\S]*?)\r?\n\}/)?.[1];
const favicon = source.match(/const FAVICON_RE = [^;]+;/)?.[0];
const listener = source.match(/page\.on\("requestfailed", \(r\) => \{([\s\S]*?)\r?\n    \}\);/)?.[1];
const gateStart = source.indexOf('    if (missingAssets.length > 0 && !shipAnyway) {');
const gateEnd = source.indexOf('    const realErrors = filterBenign(consoleErrors);', gateStart);
assert.ok(predicate && favicon && listener && gateStart >= 0 && gateEnd > gateStart,
  'the actual deployed-asset predicate, listener and failure gate must be available');
// vm executes JavaScript; erase only this TypeScript non-null assertion.
// It has no runtime effect, so the callback's guard and error handling stay intact.
const listenerJS = listener.replace('r.failure()!.errorText', 'r.failure().errorText');
const gate = source.slice(gateStart, gateEnd);
const worker = 'https://mahmood726-cyber.github.io/allmeta/r-shiny/shinylive/webr/webr-worker.js';

function crawl(errorText, discardFailure = false) {
  const rows = [];
  const context = vm.createContext({
    app: { slug: 'annualised-plot', name: 'Annualised Outcome Plot (R/Shinylive)' },
    url: 'https://mahmood726-cyber.github.io/allmeta/r-shiny/annualised-plot/',
    started: Date.now(), httpStatus: 200, missingAssets: [], consoleErrors: [], shipAnyway: false,
    filterBenign: errors => errors, writeRow: (slug, row) => rows.push({ slug, row }),
    request: { url: () => worker, failure: () => ({ errorText }) },
  });
  vm.runInContext(`${favicon}\nfunction isBenignAsset(url, errText) {${predicate}}`, context);
  if (errorText !== null) vm.runInContext(`(function (r) {${listenerJS}})(request);`, context);
  // Deliberate false-negative plant: dropping a failed worker must be detected.
  if (discardFailure) context.missingAssets.length = 0;
  return { rows, evaluate: () => vm.runInContext(gate, context) };
}

function rejectsBlockedWorker(discardFailure = false) {
  const result = crawl('net::ERR_BLOCKED_BY_RESPONSE', discardFailure);
  assert.throws(result.evaluate, /Missing deployed asset\(s\): net::ERR_BLOCKED_BY_RESPONSE/);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].row.status, 'fail-missing-asset');
  assert.deepEqual(Array.from(result.rows[0].row.missing_assets), ['net::ERR_BLOCKED_BY_RESPONSE ' + worker]);
}

test('pages crawl rejects the blocked webR worker reported by PR #263 CI', () => {
  rejectsBlockedWorker();
});

test('control: pages crawl does not reject a page with no failed request', () => {
  const result = crawl(null);
  assert.doesNotThrow(result.evaluate);
  assert.equal(result.rows.length, 0);
});

test('control: existing ERR_ABORTED handling is retained', () => {
  const result = crawl('net::ERR_ABORTED');
  assert.doesNotThrow(result.evaluate);
  assert.equal(result.rows.length, 0);
});

test('regression assertion detects a planted dropped-worker failure', () => {
  assert.throws(() => rejectsBlockedWorker(true), assert.AssertionError);
});
