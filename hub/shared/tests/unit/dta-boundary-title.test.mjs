import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const html = read('dta-sroc/index.html');
const source = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/)[1];
const tiny = 'S1,45,8,3,120\nS2,30,5,0,88\nS3,62,15,7,150\nS4,25,3,4,60\nS5,80,22,10,210\nS6,38,9,5,95';
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the actual page, engine, examples and lifecycle, with DOM and download adapters.
function page(saved) {
  const elements = new Map(), captures = {}, storage = new Map();
  if (saved) storage.set('dta-sroc-v1', JSON.stringify(saved));
  const documentEvents = {};
  const el = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', innerHTML: '', textContent: '', hidden: false,
      tagName: ['f-method','f-cc','f-cov','f-example'].includes(id) ? 'SELECT' : 'INPUT',
      classList: { add() {}, remove() {} }, listeners: {},
      matches() { return id.startsWith('f-'); },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatch(type) {
        const event = {target: this};
        for (const fn of documentEvents[type] || []) fn(event);
        for (const fn of this.listeners[type] || []) fn(event);
      },
      click() { this.dispatch('click'); }
    });
    return elements.get(id);
  };
  const document = {
    getElementById: el,
    querySelector: selector => el(selector),
    querySelectorAll: selector => selector.startsWith('[id^=') ? [...elements.values()].filter(e => e.id.startsWith('f-')) : [],
    addEventListener(type, fn) { (documentEvents[type] ||= []).push(fn); },
    createElement() { return {click() {}}; },
    body: {appendChild() {}, removeChild() {}}
  };
  for (const [id,value] of Object.entries({'f-method':'reml','f-cc':'all','f-cov':'','f-example':'generic'})) el(id).value = value;
  const urlState = Object.assign(() => {}, {read: () => null, write() {}});
  const csvUpload = options => { captures.csv = options; };
  const c = vm.createContext({document, Blob, setTimeout() {}, matchMedia: () => ({matches:false}),
    URL: {createObjectURL(blob) { captures.blob = blob; return 'blob:test'; }, revokeObjectURL() {}},
    localStorage: {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value)},
    alm: {plotExport: options => {captures.plot = options;}, csvUpload, axisControls() {}, resultsExport() {}, urlState,
      resetUndo: Object.assign(() => {}, {snapshot() {}}), tooltips() {}}
  });
  c.window = c;
  vm.runInContext(read('shared/dta-bivariate.js'), c);
  vm.runInContext(read('dta-sroc/example-datasets.js'), c);
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), c);
  vm.runInContext(source.replace('    // Initial load', '    window.testApi = { analyse, buildSvg, readState, writeState, render, currentSvg, hsrocHtml };\n    // Initial load'), c);
  c.AlmAutosave = {install: options => {captures.autosave = options;}};
  document.readyState = 'complete';
  const autosaveScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('AlmAutosave.install'));
  vm.runInContext(autosaveScript, c);
  const edit = (id,value) => { el(id).value = value; el(id).dispatch('input'); };
  const example = key => { el('f-example').value = key; el('btn-example').click(); };
  return {c, el, edit, example, captures, api: c.testApi, snapshot: () => plain(c.__almSnapshot()), results: () => plain(c.__almResults())};
}

test('P0-13: reported near-zero REML/ML fits disclose boundary and suppress derived findings everywhere', () => {
  const p = page();
  for (const method of ['reml','ml']) {
    p.edit('f-method', method); p.edit('f-data', tiny);
    const fit = p.api.analyse(p.snapshot()).bivar;
    assert.ok(fit.Psi[0][0] < 1e-6 && fit.Psi[1][1] < 1e-6, 'reproduce boundary fit');
    assert.match(p.el('warn-banner').innerHTML, /boundary/i);
    assert.match(p.el('stats-wrap').innerHTML, /withheld/i);
    assert.doesNotMatch(p.el('stats-wrap').innerHTML, /AUC \(partial AUC\)/);
    const r = p.results().bivariate;
    assert.equal(r.cor_random, null); assert.equal(r.auc, null); assert.equal(r.pauc, null); assert.equal(r.hsroc, null);
    assert.match(r.sroc_note, /boundary/i);
    assert.equal(r.sens, +fit.sens.toFixed(6)); assert.equal(r.spec, +fit.spec.toFixed(6));
    assert.deepEqual(r.Psi, plain(fit.Psi.map(row => row.map(v => +v.toPrecision(10)))));
    const svg = p.api.currentSvg().svg;
    assert.doesNotMatch(svg, /<polyline[^>]*stroke="#b23a48"/);
    assert.match(svg, /SROC withheld/); assert.match(svg, /<path[^>]*fill="#b23a48"/);
    assert.match(svg, /<polygon/); assert.match(svg, /Moses SROC/);
  }
});

test('P0-13: default near-perfect negative correlation is also disclosed', () => {
  const p = page(), fit = p.api.analyse(p.snapshot()).bivar;
  assert.ok(fit.corRandom < -0.99);
  assert.match(p.el('warn-banner').innerHTML, /boundary/i);
  assert.equal(p.results().bivariate.hsroc, null);
  assert.match(p.api.currentSvg().svg, /SROC withheld/);
});

test('P0-13 control: ordinary AuditC fit retains curve, AUC and HSROC', () => {
  const p = page(); p.example('AuditC');
  const fit = p.api.analyse(p.snapshot()).bivar, r = p.results().bivariate;
  assert.ok(fit.Psi[0][0] > 1e-6 && fit.Psi[1][1] > 1e-6 && Math.abs(fit.corRandom) < 0.99);
  assert.equal(r.auc, +fit.auc.rg[0].toFixed(6)); assert.equal(r.hsroc.beta, +fit.hsroc.beta.toPrecision(10));
  assert.match(p.el('stats-wrap').innerHTML, /AUC \(partial AUC\)/);
  assert.match(p.api.currentSvg().svg, /<polyline[^>]*stroke="#b23a48"/);
  assert.doesNotMatch(p.el('warn-banner').innerHTML, /boundary/i);
});

test('P0-13 control: fixed effects retain pooled estimates without implying an identified curve', () => {
  const p = page(); p.edit('f-method','fixed');
  assert.ok(p.results().bivariate.sens > 0);
  assert.equal(p.results().bivariate.auc, null);
  assert.doesNotMatch(p.api.currentSvg().svg, />Bivariate SROC</);
});

test('P0-21: own data clears automatic citation from title, plot and saved session', async () => {
  const p = page(); p.example('AuditC');
  assert.match(p.el('f-title').value, /Kriston/);
  p.edit('f-data', tiny);
  assert.equal(p.el('f-title').value, '');
  assert.equal(p.snapshot().title, '');
  assert.doesNotMatch(p.api.currentSvg().svg, /Kriston|AuditC/);
  p.el('btn-json').click();
  assert.equal(JSON.parse(await p.captures.blob.text()).title, '');
});

test('P0-21 control: custom titles survive study edits, including an explicitly typed example title', () => {
  const p = page(); p.example('AuditC');
  for (const title of ['My diagnostic review', p.el('f-title').value]) {
    p.edit('f-title', title); p.edit('f-data', tiny);
    assert.equal(p.snapshot().title, title);
    assert.match(p.api.currentSvg().svg, new RegExp(title.split(' (')[0]));
    const restored = page(p.snapshot()); restored.edit('f-data', tiny + '\nS7,20,10,5,90');
    assert.equal(restored.snapshot().title, title);
  }
});

test('P0-21: CSV replacement clears automatic title; undo/restore retains provenance', () => {
  const p = page(); p.example('AuditC'); const snap = p.snapshot();
  p.captures.csv.onParse({headers:['study','TP','FP','FN','TN'], rows: tiny.split('\n').map(line => {
    const [study,TP,FP,FN,TN] = line.split(','); return {study,TP,FP,FN,TN};
  }), warnings:[]});
  assert.equal(p.snapshot().title, '');
  p.c.__almRestore(snap); assert.match(p.snapshot().title, /Kriston/);
  p.edit('f-data', tiny); assert.equal(p.snapshot().title, '');
});

test('P0-21: persisted example provenance and legacy example sessions cannot reattribute edited data', () => {
  const p = page(); p.example('AuditC');
  const restored = page(p.snapshot()); restored.edit('f-data', tiny);
  assert.equal(restored.snapshot().title, '');
  const legacy = {data:tiny, title:p.el('f-title').value, method:'reml', cc:'all', cov:''};
  assert.equal(page(legacy).snapshot().title, '');
  legacy.title = 'My review'; assert.equal(page(legacy).snapshot().title, 'My review');
});

test('P0-21: shared draft restoration also checks old automatic citations and preserves explicit titles', () => {
  const p = page(); p.example('AuditC'); const title = p.el('f-title').value;
  const restoreDraft = values => {
    for (const [id,value] of Object.entries(values)) p.edit(id, value);
    p.captures.autosave.onRestore?.(Object.keys(values).length, values);
  };
  restoreDraft({'f-data':tiny, 'f-title':title});
  assert.equal(p.snapshot().title, '');
  restoreDraft({'f-data':tiny, 'f-title':title, 'example-title-source':'null'});
  assert.equal(p.snapshot().title, title);
});

test('P0-13: display policy covers either vanishing variance and either correlation boundary; interior controls remain visible', () => {
  const p = page(); p.example('AuditC');
  const ordinary = p.api.analyse(p.snapshot()).bivar;
  const check = (v0,v1,rho,withheld) => {
    const b = {...ordinary, Psi:[[v0,rho*Math.sqrt(v0*v1)],[rho*Math.sqrt(v0*v1),v1]], corRandom:rho};
    const svg = p.api.buildSvg({}, [], null, b);
    assert.equal(svg.includes('SROC withheld'), withheld);
    assert.equal(p.api.hsrocHtml(b).includes('withheld'), withheld);
  };
  for (const [v0,v1,rho] of [[0,1,0],[1,0,0],[0.999e-6,1,0],[1,0.999e-6,0],[1,1,0.991],[1,1,-0.991]]) check(v0,v1,rho,true);
  for (const [v0,v1,rho] of [[1e-6,1,0],[1,1e-6,0],[1,1,0.99],[1,1,-0.99],[0.5,0.8,0.3]]) check(v0,v1,rho,false);
});
