import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtureMD5 } from './p11-fixture-hash.mjs';
import { page, plants, rows, normalize, entry } from './p11-plot-export-harness.mjs';

for (const quantity of plants) {
  test(`plant P11-R3: ${quantity} changes the rendered SVG and the downloaded R check`, () => {
    const control = page(), planted = page(quantity), [plot, key] = quantity.split('.');
    assert.notEqual(planted.svg(plot), control.svg(plot), 'plant must reach the displayed plot');
    assert.equal(JSON.stringify(planted.state().full), JSON.stringify(control.state().full));
    assert.equal(JSON.stringify(planted.state().diag), JSON.stringify(control.state().diag));
    assert.notEqual(normalize(planted.script()), normalize(control.script()), 'plot defect must change R verification');
    const actual = planted.state()[plot][key];
    assert.deepEqual(entry(planted.script(), quantity), key === 'slope' ? [actual] : Array.from(actual));
  });
}

test('control: unchanged page exports a stable script and DFFITS table plant changes its check', () => {
  assert.equal(normalize(page().script()), normalize(page().script()));
  const control = page(), planted = page('table');
  assert.equal(planted.svg('baujat'), control.svg('baujat'));
  assert.notEqual(normalize(planted.script()), normalize(control.script()));
  assert.equal(entry(planted.script(), 'inf.dffits')[0], planted.state().diag[0].dffits);
});

test('plant P11-R3: incomplete plot state cannot produce an all-values verification script', () => {
  const p = page();
  for (const plot of ['baujat', 'radial']) {
    const missing = { ...p.state() }; delete missing[plot];
    assert.throws(() => p.window.AlmInfluenceR.build(missing), /plot/i, `${plot} missing`);
  }
  for (const quantity of plants) {
    const state = structuredClone(p.state()), [plot, key] = quantity.split('.');
    if (key === 'slope') delete state[plot][key];
    else state[plot][key].pop();
    assert.throws(() => p.window.AlmInfluenceR.build(state), /plot/i, quantity);
  }
});

test('control: plot exports match a native metafor fixture at the existing plot tolerances', () => {
  const ref = JSON.parse(readFileSync(new URL('./p11-plot-reference.json', import.meta.url), 'utf8'));
  assert.ok(ref.provenance.R); assert.ok(ref.provenance.metafor);
  assert.equal(ref.provenance.input_md5, fixtureMD5(readFileSync(new URL('./p11-plot-input.csv', import.meta.url))));
  assert.deepEqual(ref.rows, rows);
  const script = page().script();
  for (const quantity of plants) {
    const expected = ref.values[quantity], actual = entry(script, quantity);
    const tol = quantity.startsWith('baujat.') ? 1e-6 : 1e-9;
    assert.equal(actual.length, expected.length);
    actual.forEach((a, i) => assert.ok(Math.abs(a - expected[i]) / Math.max(1, Math.abs(expected[i])) <= tol, `${quantity}[${i}]`));
    const line = script.split('\n').find(s => s.startsWith(`  "${quantity}" = list(app = `));
    assert.ok(line.endsWith(`tol = ${tol})`) || line.endsWith(`tol = ${tol}),`), `${quantity} tolerance`);
  }
});

test('control: exclusion refit retains the complete original plotted vectors', () => {
  const p = page(), before = p.script();
  p.exclude(0);
  const after = p.script();
  assert.match(after, /"excl.mu" = list/);
  for (const quantity of plants) assert.deepEqual(entry(after, quantity), entry(before, quantity));
});
