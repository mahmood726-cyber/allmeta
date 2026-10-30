import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';

const html = readFileSync(new URL('../../../../nma/index.html', import.meta.url), 'utf8');
const busCode = readFileSync(new URL('../../../../shared/ma-comparisons-v1.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing app source: ${start}`);
  return html.slice(a, b);
}
// Execute the actual bus, serializer and parser without browser dependencies.
const appCode = sourceBetween('    // CSV labels', '    function clearResults()') +
  sourceBetween('    // ---- Read the arm-level', '    function onLoadBus()');
const plain = value => JSON.parse(JSON.stringify(value));

function runtime(env) {
  const saved = new Map();
  const ctx = vm.createContext({
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, String(value)),
      removeItem: key => saved.delete(key),
    },
  });
  vm.runInContext('window = globalThis;', ctx);
  vm.runInContext(busCode, ctx, { filename: 'shared/ma-comparisons-v1.js' });
  vm.runInContext(appCode, ctx, { filename: 'nma/index.html (parser and extraction serializer)' });
  if (env) {
    const valid = ctx.MaComparisons.validate(env);
    assert.equal(valid.ok, true, valid.errors.join('; '));
    assert.equal(ctx.MaComparisons.write(env), true, 'valid input reaches the real extraction bus');
    assert.deepEqual(plain(ctx.MaComparisons.read().studies), env.studies);
  }
  return ctx;
}

function envelope(id = 'Trial1', treatments = ['A', 'B'], multiarm = false) {
  const arms = (events, includeThird = false) => treatments.slice(0, includeThird ? 3 : 2)
    .map((treatment, i) => ({ treatment, events: events[i], n: 100 }));
  return {
    _schema: 'ma-comparisons-v1', _savedAt: '2026-10-29T00:00:00.000Z', effectMeasure: 'OR',
    studies: [
      { id, arms: arms([10, 20, 30], multiarm) },
      { id: 'Trial2', arms: arms([12, 18]) },
    ],
  };
}

function assertRoundTrip(env) {
  const ctx = runtime(env);
  const source = plain(ctx.MaComparisons.toContrasts(ctx.MaComparisons.read()));
  const bus = ctx.busContrastsText();
  assert.ok(bus);
  assert.equal(bus.measure, env.effectMeasure);
  assert.equal(bus.n, source.length);
  const parsed = plain(ctx.parseContrasts(bus.text));
  assert.deepEqual(parsed.warnings, [], 'valid labels must not cause a CSV refusal');
  const analysis = NM.analyse(parsed.rows);
  assert.equal(analysis.ok, true, analysis.error);
  assert.equal(analysis.k, env.studies.length, 'a successful fit must retain every source study');
  assert.equal(analysis.m, source.length, 'every source contrast must reach the fit');
  assert.deepEqual([...new Set(parsed.rows.map(r => r.study))], env.studies.map(s => s.id));
  // Preserve labels, effect direction, and the existing six-decimal numeric serialization.
  assert.deepEqual(parsed.rows, source.map(r => {
    const se = Number(r.se.toFixed(6));
    return { study: r.study, t1: r.treatment2, t2: r.treatment1,
      est: Number(r.te.toFixed(6)), se, v: se * se };
  }));
  return { bus, parsed, analysis };
}

test('plant P04-R3: leading-hash study ID retains both studies in a successful fit', () => {
  assertRoundTrip(envelope('#Trial1'));
});

for (const [name, id] of [
  ['comma', 'Trial, 1'],
  ['double quote', 'Trial "1"'],
  ['tab', 'Trial\t1'],
]) {
  test(`plant P04-R3: ${name} in a study ID round-trips without refusal`, () => {
    assertRoundTrip(envelope(id));
  });
}

for (const [name, treatments] of [
  ['comma', ['Drug, A', 'Control, B']],
  ['double quote', ['Drug "A"', 'Control "B"']],
  ['tab', ['Drug\tA', 'Control\tB']],
]) {
  test(`plant P04-R3: ${name} in both treatment labels round-trips without refusal`, () => {
    assertRoundTrip(envelope('Trial1', treatments));
  });
}

test('plant P04-R3: hash-prefixed multi-arm study keeps all contrasts and study grouping', () => {
  const { analysis } = assertRoundTrip(envelope('#Trial1', ['A', 'B', 'C'], true));
  assert.equal(analysis.k, 2);
  assert.equal(analysis.m, 4);
});

test('control: ordinary extraction labels retain both studies and unchanged numeric fields', () => {
  assertRoundTrip(envelope());
});

test('control: manually quoted hash ID is data while actual comment lines remain ignored', () => {
  const ctx = runtime();
  const parsed = plain(ctx.parseContrasts([
    '# study, treatment1, treatment2, est, SE',
    '"#Trial1", "B", "A", -0.8, 0.4',
    '   # an explanatory comment',
    'Trial2, B, A, -0.4, 0.3',
  ].join('\n')));
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.rows.map(r => r.study), ['#Trial1', 'Trial2']);
  const a = NM.analyse(parsed.rows);
  assert.equal(a.ok, true, a.error);
  assert.equal(a.k, 2);
});

test('control: spreadsheet-like label prefixes remain literal extraction identifiers', () => {
  for (const id of ['=Trial1', '+Trial1', '@Trial1']) {
    assertRoundTrip(envelope(id, ['+DrugA', '@ControlB']));
  }
});

test('control: an empty or unavailable extraction bus still returns null', () => {
  const ctx = runtime();
  assert.equal(ctx.busContrastsText(), null);
  delete ctx.MaComparisons;
  assert.equal(ctx.busContrastsText(), null);
});
