import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../../../../gosh/index.html');
const good = 'study,yi,sei\nA,0.1,0.2\nB,0.2,0.3\nC,0.3,0.4\nD,0.4,0.5';

// Execute the production CSV widget/parser, page engine and lifecycle. Only DOM,
// unrelated shared widgets and Worker transport are fakes; no browser is needed.
function load({ exact = false } = {}) {
  function node(id = '') {
    let content = '';
    const listeners = {}, children = new Map();
    return {
      id, value: '', hidden: false, style: {}, children: [],
      get textContent() { return content; }, set textContent(v) { content = String(v); },
      get innerHTML() { return content; }, set innerHTML(v) { content = String(v); },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
      matches(selector) { return selector.split(',').some(s => s.trim() === '#' + id); },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, node());
        return children.get(selector);
      },
      append(...xs) { this.children.push(...xs); },
      appendChild(x) { this.children.push(x); },
      replaceChildren(...xs) { this.children = xs; content = ''; },
      setAttribute(k, v) { this[k] = v; },
    };
  }
  const nodes = {};
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) nodes[m[1]] = node(m[1]);
  const el = id => nodes[id] ||= node(id);
  el('src').value = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
  el('model').value = 'FE'; el('n-sample').value = '10'; el('enum-mode').value = 'auto';
  const document = {
    // Looking up an absent element must return null, as in a real document.
    // In particular, the optional share-data-note is absent on successful loads.
    getElementById: id => nodes[id] || null, createElement: () => node(), head: node(),
    querySelector: selector => el(selector.slice(1)),
    querySelectorAll: selector => selector.split(',').map(s => el(s.trim().slice(1))),
    addEventListener() {},
  };
  const noop = () => {};
  const urlState = Object.assign(noop, { read: () => null, write: () => true, isSuspended: () => false });
  const window = { alm: { plotExport: noop, axisControls: noop, resultsExport: noop,
    resetUndo: noop, tooltips: noop, urlState } };
  const workers = [];
  class Worker {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.stopped = true; }
  }
  const context = vm.createContext({ window, document, Worker, setTimeout, clearTimeout });
  vm.runInContext(read('../../csv-upload.js'), context);
  vm.runInContext(read('../../analysis-lifecycle.js'), context);
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  if (exact) {
    const exactUI = read('../../../../gosh/exact-ui.js');
    // This controller creates its own markup; register those IDs in the fake DOM.
    for (const m of exactUI.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) nodes[m[1]] = node(m[1]);
    for (const id of ['exact-summary', 'exact-perstudy']) {
      el(id).tBodies = [node()]; el(id).tHead = node(); el(id).caption = node();
    }
    vm.runInContext(exactUI, context);
  }
  // Use the actual extras clearing function, with seeded previous result state.
  function seedExtras() {
    for (const id of ['plus-status', 'plus-plot', 'plus-study', 'plus-het', 'plus-counts']) el(id).innerHTML = 'stale';
    el('plus-table').tBodies = [node()]; el('plus-table').tBodies[0].innerHTML = 'stale';
    el('plus-table').tHead = { rows: [node()] };
    el('plus-table').tHead.rows[0].innerHTML = 'stale';
    const clear = read('../../../../gosh/plus.js').match(/^  function clear\(message=[\s\S]*?^  \}/m)[0];
    vm.runInContext(`{
      let state = { k: 4 }, selected = 1;
      const el = id => document.getElementById(id);
      ${clear}
      window.AlmGoshPlus = { clear, get state() { return state; } };
    }`, context);
  }
  return {
    window, el, workers, seedExtras,
    importCSV(text) {
      el('alm-csv-mount').querySelector('textarea').value = text;
      el('alm-csv-mount').querySelector('[data-action="parse-paste"]').click();
      return window._almLastGosh();
    },
  };
}

function refused(h, rowNumbers, reason) {
  const message = h.el('input-error').textContent;
  const result = h.window._almLastGosh();
  assert.match(message, /CSV.*refus/i,
    `invalid imports must explain whole-analysis refusal; observed k=${result?.k}, subsets=${result?.n_subsets}`);
  for (const number of rowNumbers) assert.match(message, new RegExp('row ' + number + ':', 'i'));
  assert.match(message, reason);
  assert.equal(h.window._almLastGosh(), null, 'no partial or stale result may be exported');
  assert.equal(h.el('plot').innerHTML, '');
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(h.el(id).textContent, '\u2014');
  assert.equal(h.el('analysis-status').hidden, true, 'refusal must not announce analysis updated');
  if (h.window.AlmGoshPlus) {
    assert.equal(h.window.AlmGoshPlus.state, null);
    for (const id of ['plus-plot', 'plus-study', 'plus-het']) assert.equal(h.el(id).innerHTML, '');
    assert.equal(h.el('plus-table').tBodies[0].innerHTML, '');
  }
}

const defects = [
  ['zero SE', 'sei', '0', /SE.*greater than 0/i],
  ['negative SE', 'sei', '-0.3', /SE.*greater than 0/i],
  ['zero variance', 'vi', '0', /variance.*greater than 0/i],
  ['negative variance', 'vi', '-0.09', /variance.*greater than 0/i],
  ['missing SE', 'sei', '', /SE.*finite/i],
  ['nonfinite SE', 'sei', 'Infinity', /SE.*finite/i],
  ['malformed SE', 'sei', '0.3oops', /SE.*finite/i],
  ['missing variance', 'vi', '', /variance.*finite/i],
  ['nonfinite variance', 'vi', '1e999', /variance.*finite/i],
  ['malformed variance', 'vi', '0.09oops', /variance.*finite/i],
];
for (const [name, column, value, reason] of defects) {
  test(`P13-R1 plant: ${name} refuses all four CSV studies at original row 3`, () => {
    const h = load(); h.importCSV(good); h.seedExtras();
    const csv = `study,yi,${column}\nA,0.1,0.2\nB,0.2,${value}\nC,0.3,0.4\nD,0.4,0.5`;
    h.importCSV(csv);
    refused(h, [3], reason);
    if (['zero SE', 'negative SE', 'zero variance', 'negative variance'].includes(name)) {
      assert.equal(h.window.__almGoshImportWarnings.length, 0, 'coercion warnings do not catch this defect');
    }
    assert.equal(h.importCSV(good).k, 4, 'a corrected import recovers');
    assert.equal(h.window._almLastGosh().n_subsets, 15);
    assert.equal(h.el('input-error').textContent, '');
  });
}

for (const [name, value] of [['missing', ''], ['nonfinite', 'Infinity'], ['malformed', '0.2oops']]) {
  test(`P13-R1 plant: ${name} effect refuses all CSV studies at original row 3`, () => {
    const h = load(); h.importCSV(good);
    h.importCSV(`study,yi,sei\nA,0.1,0.2\nB,${value},0.3\nC,0.3,0.4\nD,0.4,0.5`);
    refused(h, [3], /effect.*finite/i);
  });
}

test('P13-R1 plant: every invalid CSV record is reported without renumbering or partial conversion', () => {
  const h = load(); h.importCSV(good);
  const previous = h.el('src').value;
  h.importCSV('study,yi,sei\nA,0.1,0.2\nB,0.2,0\nC,0.3,0.4\nD,Infinity,-1\nE,0.5,0.6');
  refused(h, [3, 5], /effect.*finite/i);
  assert.equal(h.el('src').value, previous, 'rejected CSV must not overwrite input with a filtered dataset');
});

test('P13-R1 plant: blank CSV record keeps the original header-inclusive row number', () => {
  const h = load(); h.importCSV(good);
  h.importCSV('study,yi,sei\nA,0.1,0.2\n\nB,0.2,0.3\nC,0.3,0\nD,0.4,0.5');
  refused(h, [3, 5], /SE.*greater than 0/i);
});

test('P13-R1 plant: invalid variance cannot silently fall back to a positive SE', () => {
  const h = load(); h.importCSV(good);
  h.importCSV('study,yi,vi,sei\nA,0.1,0.04,0.2\nB,0.2,-0.09,0.3\nC,0.3,0.16,0.4\nD,0.4,0.25,0.5');
  refused(h, [3], /variance.*greater than 0/i);
});

test('P13-R1 plant: direct row adapter does not accept a partial numeric string', () => {
  const h = load(); h.importCSV(good);
  h.window.__almGoshLoad([
    { yi: 0.1, sei: 0.2 }, { yi: '0.2oops', sei: 0.3 },
    { yi: 0.3, sei: 0.4 }, { yi: 0.4, sei: 0.5 },
  ]);
  refused(h, [3], /effect.*finite/i);
});

test('P13-R1 plant: CSV refusal cancels previous exact work so late results cannot reappear', () => {
  const h = load({ exact: true });
  h.importCSV('study,yi,sei\n' + Array.from({ length: 16 }, (_, i) => `S${i},${i / 10},1`).join('\n'));
  assert.equal(h.workers.length, 1);
  const worker = h.workers[0];
  assert.equal(worker.stopped, undefined);
  h.importCSV(good.replace('B,0.2,0.3', 'B,0.2,0'));
  assert.equal(worker.stopped, true, 'the refused import must stop the previous dataset worker');
  worker.onmessage({ data: { type: 'done', id: worker.message.id, result: {} } });
  refused(h, [3], /SE.*greater than 0/i);
  assert.equal(h.el('enum-label').style.display, 'none');
  assert.equal(h.el('exact-run').hidden, true);
});

for (const model of ['FE', 'DL']) for (const uncertainty of ['sei', 'vi', 'both']) {
  test(`P13-R1 control: positive ${uncertainty} retains four studies and 15 subsets (${model})`, () => {
    const h = load(); h.el('model').value = model;
    const columns = uncertainty === 'both' ? 'vi,sei' : uncertainty;
    const values = uncertainty === 'sei' ? ['.2', '.3', '.4', '.5'] :
      uncertainty === 'vi' ? ['.04', '.09', '.16', '.25'] : ['.04,.9', '.09,.9', '.16,.9', '.25,.9'];
    const result = h.importCSV(`study,yi,${columns}\r\n` +
      ['A', 'B', 'C', 'D'].map((label, i) => `${label},${(i + 1) / 10},${values[i]}`).join('\r\n'));
    assert.equal(result.k, 4); assert.equal(result.n_subsets, 15);
    assert.deepEqual(Array.from(result.studies, r => r.label), ['A', 'B', 'C', 'D']);
    assert.deepEqual(Array.from(result.studies, r => r.te), [0.1, 0.2, 0.3, 0.4]);
    assert.deepEqual(Array.from(result.studies, r => r.se), [0.2, 0.3, 0.4, 0.5]);
    assert.equal((h.el('plot').innerHTML.match(/<circle /g) || []).length, 15);
    assert.equal(h.el('input-error').textContent, '');
    assert.equal(h.window.__almGoshImportWarnings.length, 0);
    assert.equal(h.el('analysis-status').hidden, false);
  });
}

test('P13-R1 control: row adapter retains complete numeric strings and supported aliases', () => {
  const h = load();
  h.window.__almGoshLoad([
    { effect: '+.1e0', SE: '.2', label: 'A' }, { TE: '.2', seTE: '.3', Study: 'B' },
    { te: '.3', se: '.4', study: 'C' }, { yi: '.4', vi: '.25', study: 'D' },
  ]);
  const result = h.window._almLastGosh();
  assert.equal(result.k, 4); assert.equal(result.n_subsets, 15);
  assert.deepEqual(Array.from(result.studies, r => [r.te, r.se, r.label]),
    [[0.1, 0.2, 'A'], [0.2, 0.3, 'B'], [0.3, 0.4, 'C'], [0.4, 0.5, 'D']]);
});
