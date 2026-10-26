import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function parseStudies(text) {');
const end = html.indexOf('    function weightedSums(', start);
assert.ok(start >= 0 && end > start);
const ctx = vm.createContext({});
vm.runInContext(html.slice(start, end), ctx);
const parse = text => JSON.parse(JSON.stringify(ctx.parseStudies(text)));
const control = 'A,-0.5,0.1\nB,0.1,0.4\nC,1.2,0.2';

test('quoted comma labels preserve the same estimates and SEs as ordinary labels', () => {
  const result = parse('"Study, A",-0.5,0.1\n"Aronson, 1948",0.1,0.4\n"Site ""C"", west",1.2,0.2');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.studies.map(s => s.label), ['Study, A', 'Aronson, 1948', 'Site "C", west']);
  assert.deepEqual(result.studies.map(({est, se, v}) => ({est, se, v})),
    parse(control).studies.map(({est, se, v}) => ({est, se, v})));
});

test('control: ordinary rows remain valid', () => {
  const result = parse(control);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.studies.length, 3);
  assert.equal(result.studies[0].est, -0.5);
});

test('CSV adapter round-trips comma and quote labels without losing variance precision', () => {
  const textarea = {value: '', dispatchEvent() {}};
  const window = {__almRejectImport(message) { assert.fail(message); }};
  const adapter = vm.createContext({window, document: {getElementById() {return textarea;}}, Event: class {}});
  const a = html.indexOf('    window.__almLoad = function (rows) {');
  const b = html.indexOf('    // Return the last pooled result', a);
  assert.ok(a >= 0 && b > a);
  vm.runInContext(html.slice(a, b), adapter);
  const rows = [
    {study: 'Study, A', yi: -0.5, vi: 0.010000000000001},
    {study: '#Site "B", west', yi: 0.1, vi: 0.16},
    {study: 'C', yi: 1.2, vi: 0.04},
  ];
  window.__almLoad(rows);
  const result = parse(textarea.value);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.studies.map(s => s.label), rows.map(r => r.study));
  result.studies.forEach((s, i) => {
    assert.equal(s.est, rows[i].yi);
    assert.ok(Math.abs(s.v - rows[i].vi) < 1e-15);
  });
});

for (const row of ['"Study, A",-0.5junk,0.1', '"Study, A",,0.1', '"Study, A",-0.5,0',
  '"Study, A",-0.5,0,1', '"Study, A",extra,-0.5,0.1', '"Study, A,-0.5,0.1',
  '"Study, A"junk,-0.5,0.1']) {
  test('control: quoted label does not bypass full-dataset refusal: ' + row, () => {
    const result = parse(control + '\n' + row);
    assert.deepEqual(result.studies, []);
    assert.match(result.warnings[0], /Analysis blocked/);
    assert.match(result.warnings.join(' '), /Line 4/);
  });
}
