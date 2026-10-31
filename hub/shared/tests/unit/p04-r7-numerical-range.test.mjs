import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';

const rowsOf = (effects, se = 1) => effects.map((est, i) => ({ study: `S${i + 1}`, t1: 'A', t2: 'B', est, se }));
const rangeRefusal = result => {
  assert.equal(result.ok, false, 'An unrepresentable analysis must not report success');
  assert.match(result.error, /numerical range/i);
  for (const key of ['d', 'cov', 'common', 'random']) assert.equal(result[key], undefined, `No retained ${key}`);
};

for (const model of ['fe', 're']) {
  test(`plant P04-R7: ${model} refuses overflowing Q from finite effects`, () => {
    rangeRefusal(NM.fit(rowsOf([1e200, -1e200]), { model }));
  });
}
test('plant P04-R7: analyse refuses overflowing Q for both CI methods', () => {
  for (const randomCi of ['classic', 't-dist']) rangeRefusal(NM.analyse(rowsOf([1e200, -1e200]), { randomCi }));
});
test('plant P04-R7: GLS refuses an overflowing weighted effect sum', () => {
  rangeRefusal(NM.fit(rowsOf([1e308, 1e308])));
});
test('plant P04-R7: GLS refuses overflow when squaring finite SEs', () => {
  rangeRefusal(NM.fit(rowsOf([1, 2], 1e200)));
});
test('plant P04-R7: DL refuses overflowing tau2 even when Q is finite', () => {
  const rows = rowsOf([1e154, -1e154], 2);
  const asm = NM.assemble(NM.buildStudies(rows).studies, ['A', 'B'], 'A');
  const fe = NM.gls(asm.X, asm.y, asm.V);
  assert.ok(fe && fe.d.every(Number.isFinite));
  assert.throws(() => NM.generalisedDL(asm.X, asm.y, asm.V, fe, asm.blocks), /numerical range/i);
  rangeRefusal(NM.fit(rows, { model: 're' }));
});
test('plant P04-R7: failed finite random fit cannot fall back to the common fit', () => {
  const rows = rowsOf([1e8, -1e8]);
  const fe = NM.fit(rows, { model: 'fe' });
  assert.equal(fe.ok, true, fe.error);
  assert.ok(Number.isFinite(fe.Q));
  rangeRefusal(NM.fit(rows, { model: 're' }));
  rangeRefusal(NM.analyse(rows));
});
test('plant P04-R7: league differences cannot overflow after a finite GLS fit', () => {
  const rows = [
    { study: 'AB', t1: 'A', t2: 'B', est: 1e308, se: 2 },
    { study: 'AC', t1: 'A', t2: 'C', est: -1e308, se: 2 }
  ];
  const fe = NM.fit(rows);
  assert.equal(fe.ok, true, fe.error);
  assert.ok(fe.d.every(Number.isFinite));
  rangeRefusal(NM.analyse(rows));
});
test('control: large representable effects are accepted without an arbitrary input cap', () => {
  const a = NM.analyse(rowsOf([1e200]));
  assert.equal(a.ok, true, a.error);
  assert.equal(a.common.TE[1][0], 1e200);
  assert.equal(a.Q, 0);
  assert.equal(a.tau2, null);
  assert.equal(a.predict, null);
});
test('control: disconnected GLS remains a singular-design refusal', () => {
  const rows = [rowsOf([1])[0], { study: 'CD', t1: 'C', t2: 'D', est: 2, se: 1 }];
  const result = NM.fit(rows);
  assert.equal(result.ok, false);
  assert.match(result.error, /insufficient contrasts|singular design/);
});

const fixture = new URL('../../../../tests/fixtures/p04-r7-range-oracle.json', import.meta.url);
const oracle = () => JSON.parse(readFileSync(existsSync(fixture) ? fixture : join(tmpdir(), 'p04-r7-range-oracle.json'), 'utf8'));
for (const name of ['homogeneous', 'heterogeneous']) {
  test(`control: ${name} network matches fresh R netmeta`, () => {
    const ref = oracle();
    for (const key of ['R', 'netmeta', 'meta', 'metafor']) assert.ok(ref.provenance[key]);
    const item = ref.cases[name], a = NM.analyse(item.rows);
    assert.equal(a.ok, true, a.error);
    const near = (got, want) => assert.ok(Number.isFinite(got) && Math.abs(got - want) <= 1e-9, `${got} versus ${want}`);
    near(a.Q, item.Q); near(a.tau2, item.tau2);
    for (const model of ['common', 'random']) {
      near(a[model].TE[1][0], item[model].TE);
      near(a[model].seTE[1][0], item[model].seTE);
    }
  });
}

// Execute the shipped inline application and lifecycle in Node. Only DOM and
// download plumbing are doubles; parsing, fitting, rendering and export guards
// are the real code. This deliberately needs no browser or extra dependency.
function page() {
  const html = readFileSync(new URL('../../../../nma/index.html', import.meta.url), 'utf8');
  const app = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const LS_KEY = "nma-v1"'));
  assert.ok(app);
  const nodes = new Map(), downloads = [], alerts = [];
  function element(id = '', tagName = 'DIV') {
    let markup = '';
    const listeners = {}, classes = new Set();
    return {
      id, tagName, value: '', hidden: true,
      get innerHTML() { return markup; }, set innerHTML(value) { markup = value; },
      get textContent() { return markup.replace(/<[^>]*>/g, ''); }, set textContent(value) { markup = value; },
      classList: { add: v => classes.add(v), remove: v => classes.delete(v) },
      matches: () => id.startsWith('f-'),
      appendChild(child) { if (tagName !== 'SELECT') markup += child.textContent; },
      removeChild() {},
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { if (tagName === 'A') downloads.push(this.download); for (const fn of listeners.click || []) fn(); }
    };
  }
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)) nodes.set(match[2], element(match[2], match[1].toUpperCase()));
  const document = {
    getElementById: id => { assert.ok(nodes.has(id), `Missing element ${id}`); return nodes.get(id); },
    createElement: tag => element('', tag.toUpperCase()), body: element(),
    querySelectorAll: () => [...nodes.values()].filter(n => n.id.startsWith('f-')),
    querySelector: () => ({}), addEventListener() {}
  };
  let plot;
  const window = { AlmNmaMultiarm: NM, alm: { plotExport: options => { plot = options; } } };
  const saved = { data: 'S1,A,B,-2,1\nS2,A,B,2,1\nS3,A,B,3,1', ref: 'A', model: 're', ci: 'classic', dir: 'desirable', scale: 'log', title: 'Control' };
  const context = vm.createContext({ window, document, Blob, alert: s => alerts.push(s),
    localStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: fn => fn() });
  vm.runInContext(readFileSync(new URL('../../analysis-lifecycle.js', import.meta.url), 'utf8'), context);
  vm.runInContext(app, context);
  return { nodes, downloads, alerts, plot, window,
    set(text) { nodes.get('f-data').value = text; },
    run() { nodes.get('btn-run').click(); },
    exportAll() { nodes.get('btn-json').click(); nodes.get('btn-league').click(); } };
}
for (const [kind, bad, warning] of [
  ['plant P04-R7: overflow', 'S1,A,B,1e200,1\nS2,A,B,-1e200,1', /numerical range/i],
  ['plant P04-R7: failed random fit', 'S1,A,B,1e8,1\nS2,A,B,-1e8,1', /numerical range/i],
  ['control: malformed input', 'S1,A,B,oops,1', /finite number/i]
]) {
  test(`${kind} clears successful UI results and blocks every export`, () => {
    const p = page();
    assert.equal(p.nodes.get('analysis-status').hidden, false);
    assert.ok(p.nodes.get('league-host').innerHTML);
    p.set(bad); p.run();
    assert.equal(p.nodes.get('analysis-status').hidden, true);
    for (const id of ['league-host', 'sucra-host', 'het-host', 'ref-host']) assert.equal(p.nodes.get(id).innerHTML, '', id);
    assert.match(p.nodes.get('warn-banner').textContent, warning);
    p.exportAll();
    assert.deepEqual(p.downloads, []);
    assert.throws(() => p.plot.plots[0].getSvg(), /No valid results/);
    assert.match(p.window.__almNmaCompute(bad, 'A').error, warning);
  });
}
test('plant P04-R7: export revalidates programmatic overflow and valid input recovers', () => {
  const p = page();
  p.exportAll(); assert.equal(p.downloads.length, 2);
  p.set('S1,A,B,1e200,1\nS2,A,B,-1e200,1');
  p.exportAll(); assert.equal(p.downloads.length, 2);
  assert.equal(p.nodes.get('analysis-status').hidden, true);
  p.set('S1,A,B,-2,1\nS2,A,B,2,1\nS3,A,B,3,1'); p.run();
  assert.equal(p.nodes.get('analysis-status').hidden, false);
  p.exportAll(); assert.equal(p.downloads.length, 4);
});
