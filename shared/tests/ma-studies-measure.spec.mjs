/*
 * ma-studies-measure.spec.mjs — the optional `measure` tag + the §10.4
 * mixed-measure guard added to shared/ma-studies-v1.js.
 *
 * Run: node --test shared/tests/ma-studies-measure.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MS = require('../ma-studies-v1.js');

test('normalizeStudy carries the optional measure tag; null when absent', () => {
  assert.equal(MS.normalizeStudy({ label: 'A', est: 0.1, se: 0.2, measure: 'OR' }, 0).measure, 'OR');
  assert.equal(MS.normalizeStudy({ label: 'B', est: 0.1, se: 0.2 }, 1).measure, null);
});

test('buildEnvelope preserves measure and stays back-compatible', () => {
  const env = MS.buildEnvelope([
    { label: 'A', est: 0.1, se: 0.2, measure: 'RR' },
    { label: 'B', est: 0.2, se: 0.3 },
  ]);
  assert.equal(env.studies[0].measure, 'RR');
  assert.equal(env.studies[1].measure, null);
  assert.ok(MS.validate(env).ok, 'untagged + tagged rows still validate');
});

test('measureConsistency: single measure → ok', () => {
  const r = MS.measureConsistency([{ measure: 'OR' }, { measure: 'OR' }, { measure: 'OR' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.measures, ['OR']);
  assert.equal(r.mixed, false);
});

test('measureConsistency: mixed measures → not ok', () => {
  const r = MS.measureConsistency([{ measure: 'OR' }, { measure: 'RR' }]);
  assert.equal(r.ok, false);
  assert.equal(r.mixed, true);
  assert.deepEqual(r.measures, ['OR', 'RR']);
});

test('measureConsistency: untagged legacy rows never make it not-ok on their own', () => {
  const r = MS.measureConsistency([{ measure: 'OR' }, {}, { est: 1 }]);
  assert.equal(r.ok, true, 'one measure + untagged is still ok');
  assert.equal(r.untagged, 2);
});
