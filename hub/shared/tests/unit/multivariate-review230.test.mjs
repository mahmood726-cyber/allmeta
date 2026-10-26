import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const app = 'multivariate-ma';

// Execute the actual page controller, parser, fitter and feature adapter. Only
// the DOM and timer queue are doubled; no result or covariance is fabricated.
function page() {
  const elements = new Map(), handlers = {}, timers = new Map();
  let timerId = 0;
  class Element {
    constructor(id = '') {
      this.id = id; this.value = ''; this.children = []; this.handlers = {};
      this.style = {}; this.attrs = {}; this.textContent = ''; this.innerHTML = '';
    }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
    querySelectorAll(selector) { return selector === 'option' ? this.children : []; }
    closest() { return null; }
    focus() {}
  }
  const el = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  for (const mode of ['cov', 'r', 'rhoW']) {
    const option = new Element(); option.value = mode; el('f-mode').appendChild(option);
  }
  el('f-mode').value = 'cov'; el('f-rhow').value = '0.5';
  const document = {
    readyState: 'loading', getElementById: el,
    createElement: () => new Element(),
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    querySelectorAll(selector) {
      if (selector === '#stats .v') return [...el('stats').innerHTML.matchAll(/<span class='v'>(.*?)<\/span>/g)]
        .map(m => ({ textContent: m[1] }));
      return selector.split(',').map(s => el(s.trim().slice(1)));
    }
  };
  const context = vm.createContext({ document, console, structuredClone,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { observe() {} }
  });
  context.window = context;
  const load = path => vm.runInContext(read(path), context, { filename: path });
  load('shared/multivariate-ma.js'); load('multivariate-ma/plus.js');
  const controller = [...read('multivariate-ma/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .find(m => m[1].includes('window.AlmMvPage ='));
  assert.ok(controller, 'actual page controller exists');
  vm.runInContext(controller[1], context, { filename: 'multivariate-ma/index.html' });
  load('multivariate-ma/alm-live.js'); load('shared/alm-features.js');
  load('shared/alm-entry.js'); load('shared/alm-text.js'); load('multivariate-ma/alm-features.js');
  return { context, el, spec: context.AlmMultivariateFeatures,
    fire(id, type) {
      const event = { target: el(id) };
      for (const fn of el(id).handlers[type] || []) fn(event);
      for (const fn of handlers[type] || []) fn(event);
    }
  };
}

function configure(h, mode) {
  if (mode === 'r') h.context.AlmMvPage.load(h.context.AlmMvPage.EXAMPLE_HYP, mode, 'SBP', 'DBP');
  else if (mode === 'rhoW') {
    const src = h.context.AlmMvPage.current().parsed.rows
      .map(r => [r.label, r.y[0], r.v[0], r.y[1], r.v[1]].join(', ')).join('\n');
    h.el('f-rhow').value = '-0.35';
    h.context.AlmMvPage.load(src, mode, 'PD', 'AL');
  }
  // The real select reflects the selected option set by the page controller.
  h.el('f-mode').value = mode;
  assert.ok(h.context._almLastMultivariate(), 'control analysis fits');
}

for (const mode of ['cov', 'r', 'rhoW']) {
  test('SHARE preserves actual fitted results and covariance settings in ' + mode + ' mode', () => {
    const from = page(); configure(from, mode);
    const before = plain(from.context._almLastMultivariate());
    const state = plain(from.spec.share.get());
    state.entryLog = [{ text: 'confirmed conversion from the shared analysis' }];
    const to = page();
    to.spec.share.set(state);
    assert.deepEqual(plain(to.context._almLastMultivariate()), before);
    assert.deepEqual(plain(to.context.AlmFeaturesState.entryLog), state.entryLog);
    assert.equal(to.context.AlmMvPage.getMode(), mode);
    assert.equal(to.el('f-rhow').value, from.el('f-rhow').value);
  });
}

test('SHARE legacy covariance state restores correctly over an existing correlation analysis', () => {
  const from = page(), before = plain(from.context._almLastMultivariate());
  const state = { src: from.el('f-data').value, names: ['PD', 'AL'], entryLog: [] };
  const to = page(); configure(to, 'r');
  to.spec.share.set(state);
  assert.deepEqual(plain(to.context._almLastMultivariate()), before);
  assert.equal(to.context.AlmMvPage.getMode(), 'cov');
});

test('SHARE invalid covariance settings are rejected before any input or fit is changed', () => {
  const h = page(), state = plain(h.spec.share.get()), before = plain(h.context._almLastMultivariate());
  for (const invalid of [{ mode: 'unknown' }, { mode: null },
    { mode: 'rhoW', rhoW: '' }, { mode: 'rhoW', rhoW: '1' }, { mode: 'rhoW', rhoW: '-1' },
    { mode: 'rhoW', rhoW: 'NaN' }, { mode: 'rhoW', rhoW: [] }]) {
    assert.throws(() => h.spec.share.set({ ...state, ...invalid }), /Invalid multivariate analysis state/);
    assert.deepEqual(plain(h.spec.share.get()), state);
    assert.deepEqual(plain(h.context._almLastMultivariate()), before);
  }
});

for (const [id, type, value] of [['f-data', 'input', 'pending'], ['f-mode', 'change', 'r'], ['f-rhow', 'input', '0.1']]) {
  test('VERIFY fingerprint and extraction provenance invalidate after editing ' + id, () => {
    const h = page(), hash = h.context.AlmFeatures.inputsHash(app);
    h.context.AlmFeaturesState.provenance = [{ label: 'confirmed extraction' }];
    h.context.AlmFeaturesState.entryLog = [{ text: 'confirmed conversion' }];
    h.el('unrelated-control').value = 'changed'; h.fire('unrelated-control', 'input');
    assert.equal(h.context.AlmFeatures.inputsHash(app), hash, 'unrelated controls preserve the fingerprint');
    assert.equal(h.context.AlmFeaturesState.provenance.length, 1);
    h.el(id).value = value; h.fire(id, type);
    assert.notEqual(h.context.AlmFeatures.inputsHash(app), hash, 'edited analysis settings must mark the R result stale');
    assert.deepEqual(plain(h.context.AlmFeaturesState.provenance), []);
    assert.deepEqual(plain(h.context.AlmFeaturesState.entryLog), []);
  });
}

const inputRows = [
  ['A', 'X', 0.4, 0.01, 0.002], ['A', 'Y', 0.2, 0.02, 0.002],
  ['B', 'X', 0.5, 0.01, 0.002], ['B', 'Y', 0.3, 0.02, 0.002]
];
const table = (headers, rows) => [headers, ...rows].map(r => r.join('\t')).join('\n');
const blocks = result => result.flags.filter(f => f.blocking);
for (const id of ['btn-ex-berkey', 'btn-ex-hyp', 'btn-clear', 'f-csv']) {
  test('ENTRY provenance is invalidated when data are replaced by ' + id, () => {
    const h = page();
    h.context.AlmFeaturesState.provenance = [{ label: 'confirmed extraction' }];
    h.context.AlmFeaturesState.entryLog = [{ text: 'confirmed conversion' }];
    h.fire('unrelated-control', 'click');
    h.el('f-csv').files = []; h.fire('f-csv', 'change');
    assert.equal(h.context.AlmFeaturesState.provenance.length, 1, 'unrelated clicks and cancelled uploads preserve provenance');
    assert.equal(h.context.AlmFeaturesState.entryLog.length, 1);
    let finishUpload;
    if (id === 'f-csv') {
      h.context.FileReader = class {
        readAsText() {
          this.result = h.el('f-data').value.replace('0.47', '0.48');
          finishUpload = () => this.onload();
        }
      };
      h.el(id).files = [{}];
    }
    h.fire(id, id === 'f-csv' ? 'change' : 'click');
    if (finishUpload) {
      assert.equal(h.context.AlmFeaturesState.provenance.length, 1, 'pending file read has not replaced the analysis');
      finishUpload();
    }
    if (id === 'btn-clear') assert.equal(h.context._almLastMultivariate(), null);
    else assert.ok(h.context._almLastMultivariate(), 'replacement data are actually fitted');
    assert.deepEqual(plain(h.context.AlmFeaturesState.provenance), []);
    assert.deepEqual(plain(h.spec.share.get().entryLog), []);
  });
}

for (const [field, aliases] of [['vi', ['variance', 'se']], ['sei', ['se', 'standard error']]]) {
  test('ENTRY refuses ambiguous ' + field + ' columns instead of silently dropping supplied dispersion', () => {
    const h = page(), headers = ['study', 'outcome', 'yi', 'vi', 'cov'];
    const control = h.spec.entry.convert(table([...headers, 'se'], inputRows.map(r => [...r, Math.sqrt(r[3]).toFixed(4)])));
    assert.deepEqual(plain(blocks(control)), []);
    assert.deepEqual(plain(control.records.map(r => r.vi)), inputRows.map(r => r[3]));
    const conflicting = table([...headers, ...aliases], inputRows.map(r => [...r, 999, Math.sqrt(r[3])]));
    assert.ok(blocks(h.spec.entry.convert(conflicting)).some(f => /multiple|ambiguous|duplicate/i.test(f.text)),
      'two recognized dispersion columns must block until the source columns are disambiguated');
  });
}
