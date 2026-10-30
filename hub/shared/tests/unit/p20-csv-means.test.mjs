import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.find(s => s.includes('function convert(type, est, se, p0, pooledSd)'));
const adapter = scripts.find(s => s.includes('window.__almLoadCSV = function'));
assert.ok(main && adapter, 'execute the real converter and its complete CSV adapter');
const fields = ['m1', 'sd1', 'n1', 'm2', 'sd2', 'n2'];
const valid = { m1: 7.5, sd1: 2, n1: 20, m2: 5, sd2: 2, n2: 20 };
const reference = JSON.parse(readFileSync(new URL('p20-csv-means-reference.json', import.meta.url), 'utf8'));
const csv = (rows, columns = fields) => [columns.join(','),
  ...rows.map(r => columns.map(k => r[k] ?? '').join(','))].join('\n');

// No browser: only DOM and unrelated module initialization are stubbed.
// The CSV parser, onParse callback, importer, numerical engine and rendering are real.
function page() {
  function element() {
    let markup = '';
    const listeners = new Map();
    return {
      value: '', hidden: false, children: [],
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; this.children = []; },
      setAttribute() {},
      appendChild(child) { this.children.push(child); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
    };
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], element()]));
  const el = id => nodes.get(id);
  for (const [id, value] of Object.entries({
    'in-type': 'OR', 'in-smd-kind': 'd', 'in-est': '0.75', 'in-se': '0.12',
    'der-scale': 'raw',
  })) el(id).value = value;
  const calls = { snapshots: 0, writes: 0 };
  const urlState = Object.assign(() => {}, {
    read: () => null, write() { calls.writes++; },
  });
  const resetUndo = Object.assign(() => {}, { snapshot() { calls.snapshots++; } });
  const sandbox = {
    document: { getElementById: el, createElement: element, querySelector: () => null,
      body: element(), readyState: 'complete' },
    alm: { axisControls() {}, resultsExport() {}, tooltips() {}, urlState, resetUndo },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const path of ['shared/effect-size-accuracy.js', 'hub/shared/csv-upload.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  const parse = context.alm.csvUpload.parse;
  let csvOptions;
  context.alm.csvUpload = Object.assign(opts => { csvOptions = opts; }, { parse });
  vm.runInContext(main, context, { filename: 'effect-size-converter/index.html:main' });
  vm.runInContext(adapter, context, { filename: 'effect-size-converter/index.html:adapter' });
  assert.equal(typeof csvOptions.onParse, 'function');
  assert.ok(context.__almResultRows.length > 0, 'start with a valid existing conversion');
  return {
    context, el, calls,
    values: () => Object.fromEntries([...nodes].map(([id, node]) => [id, node.value])),
    importCSV(text) {
      const parsed = parse(text, csvOptions.columns);
      csvOptions.onParse(parsed);
      return parsed;
    },
  };
}

function assertRefused(p, action) {
  const before = p.values(), callsBefore = { ...p.calls };
  action();
  // Do not call __almResults here: export deliberately recalculates the unchanged
  // previous controls. Inspect the immediate rendered result of the import.
  assert.equal(p.context.__almResultRows.length, 0,
    `invalid import produced results: ${JSON.stringify(p.context.__almResultRows)}`);
  assert.equal(p.el('results-body').children.length, 0);
  assert.match(p.el('warn-slot').innerHTML, /CSV rejected:/);
  assert.doesNotMatch(p.el('warn-slot').innerHTML, /Imported metafor-compatible/);
  assert.deepEqual(p.values(), before, 'rejection must not overwrite existing inputs');
  assert.deepEqual(p.calls, callsBefore, 'rejection must not save URL or undo state');
}

for (const field of fields) {
  for (const [label, token] of [['blank', ''], ['NA', 'NA'], ['nonnumeric', 'oops'], ['overflow', '1e309']]) {
    const kind = field === 'm1' || field === 'm2' ? 'planted' : 'control';
    test(`${kind} P20-R1: CSV ${field} ${label} is rejected`, () => {
      const p = page();
      assertRefused(p, () => {
        const parsed = p.importCSV(csv([{ ...valid, [field]: token }]));
        assert.equal(parsed.rows[0][field], null, 'parser exposes invalid numeric cells as null');
        assert.ok(parsed.warnings.length > 0);
      });
    });
  }
}

for (const field of ['m1', 'm2']) {
  test(`planted P20-R1: CSV ${field} whitespace is rejected`, () => {
    const p = page();
    assertRefused(p, () => p.importCSV(csv([{ ...valid, [field]: '   ' }])));
  });
}

test('planted P20-R1: direct missing or blank means are rejected', () => {
  for (const field of ['m1', 'm2']) for (const value of [null, '', '   ']) {
    const p = page();
    assertRefused(p, () => p.context.__almLoadCSV([{ ...valid, [field]: value }]));
  }
});

test('control P20-R1: direct nonfinite or absent means are rejected', () => {
  for (const field of ['m1', 'm2']) for (const value of [undefined, NaN, Infinity, -Infinity]) {
    const p = page();
    assertRefused(p, () => p.context.__almLoadCSV([{ ...valid, [field]: value }]));
  }
});

test('control P20-R1: absent required CSV columns are rejected', () => {
  for (const field of fields) {
    const p = page();
    assertRefused(p, () => p.importCSV(csv([valid], fields.filter(k => k !== field))));
  }
});

test('control P20-R1: invalid SDs and group sizes remain rejected', () => {
  for (const [field, values] of [['sd1', [0, -1]], ['sd2', [0, -1]],
    ['n1', [0, 1, -1, 20.5]], ['n2', [0, 1, -1, 20.5]]]) {
    for (const value of values) {
      const p = page();
      assertRefused(p, () => p.importCSV(csv([{ ...valid, [field]: value }])));
    }
  }
});

test('planted P20-R1: invalid first row does not fall through to a valid row', () => {
  const p = page();
  p.importCSV(csv([valid]));
  assertRefused(p, () => p.importCSV(csv([{ ...valid, m1: '' }, valid])));
});

function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12,
    `${label}: ${actual} vs R ${expected} (absolute tolerance 1e-12)`);
}

function assertReference(p, fit) {
  assert.match(p.el('warn-slot').innerHTML, /Imported metafor-compatible/);
  assert.equal(p.el('in-smd-kind').value, 'g');
  assert.equal(p.context.__almResultRows.length, 4);
  const result = p.context.__almResults();
  close(result.input_estimate, fit.g, 'imported g');
  close(result.input_se ** 2, fit.vi, 'imported LS variance');
  close(result.rows.find(r => r.scale === "SMD (Hedges' g)").point, fit.g, 'exported g');
  close(result.rows.find(r => r.scale === 'MD').point, fit.md, 'recovered MD');
}

test('control P20-R1: R fixture records versions and the exact input file', () => {
  assert.match(reference.provenance.R, /^R version /);
  assert.ok(reference.provenance.metafor);
  assert.equal(reference.provenance.input_md5,
    createHash('md5').update(readFileSync(new URL('p20-csv-means-input.csv', import.meta.url))).digest('hex'));
  assert.deepEqual(reference.fits.map(r => r.case), ['ordinary', 'zero_m1', 'zero_m2', 'tied_means', 'both_zero']);
});

for (const fit of reference.fits) {
  test(`control P20-R1: ${fit.case} matches fresh R g, variance and MD`, () => {
    const p = page();
    const parsed = p.importCSV(csv([fit.input]));
    assert.equal(parsed.warnings.length, 0);
    assertReference(p, fit);
  });
}

test('control P20-R1: numeric-string zero means remain valid', () => {
  const p = page(), fit = reference.fits.find(r => r.case === 'zero_m1');
  p.context.__almLoadCSV([Object.fromEntries(Object.entries(fit.input).map(([k, v]) => [k, String(v)]))]);
  assertReference(p, fit);
});

test('control P20-R1: valid first row retains the single-estimate import policy', () => {
  const p = page(), fit = reference.fits[0];
  p.importCSV(csv([fit.input, { ...valid, m1: 'NA' }]));
  assert.match(p.el('warn-slot').innerHTML, /only the first of 2 rows/);
  assertReference(p, fit);
});
