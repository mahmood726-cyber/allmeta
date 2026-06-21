/*
 * alm-auth-tracked.spec.mjs — the cross-device sync TRACKED key list must
 * cover every bus an app autosaves, or that data silently never syncs.
 * Regression lock for the extract / NMA / comparisons buses that were omitted.
 *
 * Run: node --test shared/tests/alm-auth-tracked.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Auth = require('../alm-auth.js');

test('TRACKED covers the extract, comparisons and NMA buses', () => {
  for (const k of ['sr-extract-v1', 'ma-comparisons-v1', 'nma-v1']) {
    assert.ok(Auth.TRACKED.includes(k), `TRACKED missing ${k}`);
  }
});

test('TRACKED still covers the pre-existing buses (no regression)', () => {
  for (const k of ['sr-project-v1', 'sr-records-v1', 'screen-v1', 'ma-studies-v1', 'ma-pooled-v1', 'rapidmeta.paperState', 'grade-sof-v1', 'rob-assess-v1']) {
    assert.ok(Auth.TRACKED.includes(k), `TRACKED dropped ${k}`);
  }
});

test('TRACKED has no duplicates', () => {
  assert.equal(new Set(Auth.TRACKED).size, Auth.TRACKED.length);
});
