import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = fs.readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const accuracy = fs.readFileSync(new URL('shared/effect-size-accuracy.js', root), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function runConvert()'));
const extraction = scripts.find(s => s.includes('LocalLLM.attachPanel'));
const derivationIds = ['der-t', 'der-f', 'der-f-sign', 'der-n1', 'der-n2', 'der-p', 'der-lo', 'der-hi'];

// Execute the actual page scripts. Only DOM plumbing and LocalLLM delivery are
// replaced; conversion, validation, rendering and button callbacks stay real.
function page() {
  const nodes = new Map();
  function element(value = '') {
    const events = new Map();
    return {
      value, hidden: false, children: [],
      get innerHTML() { return this.html || ''; },
      set innerHTML(s) { this.html = s; this.children = []; },
      addEventListener(name, fn) { events.set(name, fn); },
      click() { events.get('click')?.(); },
      setAttribute(name, v) { this[name] = v; },
      appendChild(child) { this.children.push(child); },
    };
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes.set(m[1], element(m[0].match(/\bvalue="([^"]*)"/)?.[1] || ''));
  }
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    nodes.get(m[1]).value = m[2].match(/<option\b[^>]*\bvalue="([^"]*)"/)?.[1] || '';
  }
  let onResult;
  const document = {
    getElementById(id) {
      assert.ok(nodes.has(id), `unmodelled page element: ${id}`);
      return nodes.get(id);
    },
    createElement: () => element(),
  };
  const context = vm.createContext({
    document, console,
    LocalLLM: { attachPanel(_host, options) { onResult = options.onResult; } },
  });
  context.window = context;
  vm.runInContext(accuracy, context, { filename: 'shared/effect-size-accuracy.js' });
  vm.runInContext(engine, context, { filename: 'effect-size-converter/engine' });
  vm.runInContext(extraction, context, { filename: 'effect-size-converter/local-extraction' });
  assert.equal(typeof onResult, 'function');
  return {
    get: id => document.getElementById(id),
    extract: result => onResult(result),
    get rows() { return context.__almResultRows; },
    get warning() { return nodes.get('warn-slot').innerHTML; },
  };
}

function stalePrecision(p) {
  const old = { 'der-t': '2.1', 'der-f': '4.41', 'der-f-sign': '-1',
    'der-n1': '30', 'der-n2': '30', 'der-p': '0.03', 'der-lo': '0.59', 'der-hi': '0.95' };
  for (const [id, value] of Object.entries(old)) p.get(id).value = value;
}

function assertNoResults(p) {
  assert.equal(p.rows.length, 0, `unexpected result rows: ${JSON.stringify(p.rows)}`);
  assert.equal(p.get('results-body').children.length, 0);
  assert.equal(p.get('forest-points').innerHTML, '');
  assert.equal(p.get('in-se').value, '', 'old SE must be invalidated');
  assert.match(p.warning, /Error|standard error|precision|CI/i);
}

const rejected = [
  ['missing precision', { type: 'OR', estimate: 2 }],
  ['CI excludes estimate', { type: 'OR', estimate: 2, ci_lower: 3, ci_upper: 4 }],
  ['incomplete CI', { type: 'OR', estimate: 2, ci_lower: 1 }],
  ['reversed CI', { type: 'OR', estimate: 2, ci_lower: 4, ci_upper: 1 }],
  ['nonpositive SE', { type: 'OR', estimate: 2, se: 0 }],
  ['nonfinite SE', { type: 'OR', estimate: 2, se: Infinity }],
  ['missing estimate', { type: 'OR', se: 0.2 }],
  ['invalid estimate', { type: 'OR', estimate: 'unknown', se: 0.2 }],
  ['missing type', { estimate: 2, se: 0.2 }],
  ['unsupported type', { type: 'unknown', estimate: 2, se: 0.2 }],
  ['nonpositive ratio', { type: 'OR', estimate: -2, se: 0.2 }],
  ['out-of-range RD', { type: 'RD', estimate: 2, se: 0.2 }],
];
for (const [name, result] of rejected) {
  test(`P20-R3 plant: ${name} cannot mix a new extraction with previous inputs`, () => {
    const p = page();
    assert.equal(p.rows[0].se, 0.12);
    const previous = [p.get('in-type').value, p.get('in-est').value];
    stalePrecision(p);
    p.extract(result);
    assertNoResults(p);
    assert.deepEqual([p.get('in-type').value, p.get('in-est').value], previous,
      'an incomplete extraction must not commit a partial effect');
    for (const id of derivationIds) assert.equal(p.get(id).value, '', `stale ${id}`);
    // A later explicit Convert or Derive must not resurrect stale precision.
    p.get('btn-convert').click();
    assertNoResults(p);
    p.get('btn-derive').click();
    assertNoResults(p);
  });
}

test('P20-R3 plant: failed CI derivation keeps its error and never resumes conversion', () => {
  const p = page();
  p.extract({ type: 'OR', estimate: 2, ci_lower: 3, ci_upper: 4, ci_scale: 'log' });
  assertNoResults(p);
  assert.match(p.warning, /estimate must lie between/);
});

test('P20-R3 plant: valid extraction invalidates all previous derivation inputs', () => {
  const p = page();
  stalePrecision(p);
  p.extract({ type: 'OR', estimate: 2, se: 0.2 });
  assert.equal(p.rows[0].point, 2);
  assert.equal(p.rows[0].se, 0.2);
  for (const id of derivationIds) assert.equal(p.get(id).value, '', `stale ${id}`);
});

for (const [type, scale, oldScale, estimate, lower, upper] of [
  ['OR', 'log', 'raw', 2, 1, 4],
  ['MD', 'raw', 'log', 2, 1, 3],
]) {
  test(`P20-R3 plant: ${type} CI without a scale cannot inherit the previous scale`, () => {
    const p = page();
    p.get('der-scale').value = oldScale;
    p.extract({ type, estimate, ci_lower: lower, ci_upper: upper });
    assert.equal(p.get('der-scale').value, scale);
    const row = p.rows.find(r => r.scale === type);
    assert.ok(row, 'valid extracted CI should produce a result');
    assert.ok(Math.abs(row.lo - lower) < 1e-12);
    assert.ok(Math.abs(row.hi - upper) < 1e-12);
  });

  test(`P20-R3 control: valid ${type} CI supplies its own precision`, () => {
    const p = page();
    p.extract({ type, estimate, ci_lower: lower, ci_upper: upper, ci_scale: scale });
    const row = p.rows.find(r => r.scale === type);
    assert.ok(row);
    assert.equal(row.point, estimate);
    // Round-trip invariants, not R-parity reference values.
    assert.ok(Math.abs(row.lo - lower) < 1e-12);
    assert.ok(Math.abs(row.hi - upper) < 1e-12);
    assert.notEqual(row.se, 0.12);
  });
}

test('P20-R3 control: explicit SE takes priority over CI and replaces old precision', () => {
  const p = page();
  p.extract({ type: 'OR', estimate: 2, se: 0.2, ci_lower: 3, ci_upper: 4 });
  assert.equal(p.rows[0].scale, 'OR');
  assert.equal(p.rows[0].point, 2);
  assert.equal(p.rows[0].se, 0.2);
});

test('P20-R3 control: numeric strings and lowercase effect types remain supported', () => {
  const p = page();
  p.extract({ type: 'or', estimate: '2', se: '0.2' });
  assert.equal(p.rows[0].point, 2);
  assert.equal(p.rows[0].se, 0.2);
});

test('P20-R3 control: null delivery leaves the existing analysis alone', () => {
  const p = page();
  const before = JSON.stringify(p.rows);
  p.extract(null);
  assert.equal(JSON.stringify(p.rows), before);
  assert.equal(p.get('in-se').value, '0.12');
});

// The shared derivation helper still reads the form for manual button clicks.
for (const [type, scale, lower, upper] of [
  ['OR', 'log', 1, 4],
  ['MD', 'raw', 1, 3],
]) {
  test(`P20-R3 control: manual ${type} CI derivation remains available`, () => {
    const p = page();
    p.get('in-type').value = type;
    p.get('in-est').value = '2';
    p.get('in-se').value = '';
    p.get('der-lo').value = String(lower);
    p.get('der-hi').value = String(upper);
    p.get('der-scale').value = scale;
    p.get('btn-derive').click();
    const row = p.rows.find(r => r.scale === type);
    assert.ok(row);
    assert.equal(row.point, 2);
    assert.ok(Math.abs(row.lo - lower) < 1e-12);
    assert.ok(Math.abs(row.hi - upper) < 1e-12);
  });
}

test('P20-R3 control: manual Wald p derivation remains available', () => {
  const p = page();
  p.get('in-est').value = '2';
  p.get('in-se').value = '';
  p.get('der-p').value = '0.05';
  p.get('btn-derive').click();
  const row = p.rows.find(r => r.scale === 'OR');
  assert.ok(row);
  assert.equal(row.point, 2);
  assert.ok(row.se > 0);
  // A two-sided Wald p of 0.05 puts the null at the 95% CI boundary.
  assert.ok(Math.abs(row.lo - 1) < 1e-12);
});
