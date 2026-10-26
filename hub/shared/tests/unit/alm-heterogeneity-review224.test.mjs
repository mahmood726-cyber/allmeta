import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const adapter = readFileSync(new URL('../../../../heterogeneity/alm-features.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function parseStudies(text) {');
const end = html.indexOf('    function weightedSums(', start);
assert.ok(start >= 0 && end > start);
const parse = vm.runInNewContext(html.slice(start, end) + '; parseStudies;');

function load() {
  const input = { value: 'Existing A, 0.2, 0.1\nExisting B, 0.3, 0.1' };
  let clicks = 0, snapshots = 0, studies = parse(input.value).studies;
  let info = { k: studies.length };
  const previousInfo = info;
  const button = { click() {
    clicks++;
    studies = parse(input.value).studies;
    info = studies.length >= 2 ? { k: studies.length } : null;
  } };
  const context = {
    module: { exports: {} },
    document: { getElementById: id => ({ 'f-data': input, 'btn-run': button })[id] },
    _almLastFE: () => info,
    _almLastStudies: () => studies,
    alm: { resetUndo: { snapshot() { snapshots++; } } }
  };
  vm.runInNewContext(adapter, context);
  return { apply: context.module.exports.spec.entry.apply, input, previousInfo,
    state: () => ({ clicks, snapshots, studies, info }) };
}

test('entry refuses overflowing sampling variance before changing the current analysis', () => {
  const h = load(), before = h.input.value;
  // Finite SE, but its variance is Infinity; both divisions in the old guard return zero.
  const bad = { study: 'Overflow', yi: 0.1, sei: 1e200 };
  assert.equal(Number.isFinite(bad.sei), true);
  assert.equal(Number.isFinite(bad.sei * bad.sei), false);
  assert.equal(parse('Overflow, 0.1, 1e200').studies.length, 0);
  const result = h.apply([{ study: 'Valid', yi: 0.2, sei: 0.1 }, bad]);
  assert.equal(result.ok, false);
  assert.equal(h.input.value, before, 'rejected records must leave the existing input intact');
  assert.equal(h.state().clicks, 0);
  assert.equal(h.state().snapshots, 0);
  assert.equal(h.state().info, h.previousInfo);
});

test('entry control: ordinary finite variances still round trip through the real parser', () => {
  const h = load();
  const records = [{ study: 'Trial A', yi: -0.123456789012345, sei: 0.1 },
    { study: 'Trial B', yi: 0.35, sei: 0.2 }];
  const result = h.apply(records);
  assert.equal(result.ok, true);
  assert.equal(result.n, 2);
  assert.equal(h.state().clicks, 1);
  assert.equal(h.state().snapshots, 1);
  assert.deepEqual(Array.from(h.state().studies, s => ({ study: s.label, yi: s.est, sei: s.se })), records);
});
