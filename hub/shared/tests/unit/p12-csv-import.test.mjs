import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const good = [
  { yi: 0.55, sei: 0.08, study: 'A' },
  { yi: 0.48, sei: 0.10, study: 'B' },
  { yi: 0.70, sei: 0.15, study: 'C' },
  { yi: 0.60, sei: 0.09, study: 'D' },
  { yi: 0.30, sei: 0.07, study: 'E' },
];
const direct = rows => rows.map(r => `${r.yi}, ${r.sei}, ${r.study}`).join('\n');
const csv = rows => 'yi,sei,study\n' + rows.map(r => [r.yi, r.sei, r.study].join(',')).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the actual page, CSV parser/callback, lifecycle, and optional panels.
// Only DOM and unrelated shared UI mounts are replaced; no fit/validation logic is mocked.
function load() {
  const html = read('limit-ma/index.html'), nodes = {};
  function node() {
    let content = '';
    const listeners = {}, selected = {};
    return {
      value: '', hidden: false, checked: true, disabled: false,
      attrs: {}, dataset: {}, style: {}, parentNode: {}, children: [],
      get innerHTML() { return content + this.children.map(n => typeof n === 'string' ? n : n.innerHTML).join(''); },
      set innerHTML(v) { content = v; this.children = []; },
      get textContent() { return this.innerHTML; },
      set textContent(v) { this.innerHTML = v; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.append(child); },
      replaceChildren(...children) { content = ''; this.children = children; },
      querySelector(selector) { return selected[selector] ??= node(); },
      querySelectorAll() { return []; },
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      fire(type) { for (const fn of listeners[type] || []) fn({ target: this }); },
      click() { this.fire('click'); },
      setAttribute(k, v) { this.attrs[k] = v; if (k === 'hidden') this.hidden = true; },
      removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; },
    };
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes[match[1]] = node();
    nodes[match[1]].value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  nodes.src.value = direct(good);
  const document = {
    head: node(), getElementById: id => nodes[id],
    querySelector: selector => nodes[selector.slice(1)],
    querySelectorAll: selector => selector === '#src' ? [nodes.src] : [],
    createElement: node, createElementNS: node, createTextNode: text => text,
    addEventListener() {},
  };
  const noop = () => {};
  const alm = {
    plotExport: options => { alm.plotOptions = options; },
    resultsExport: options => { alm.exportOptions = options; },
    axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null }),
  };
  const window = { alm }, context = vm.createContext({ window, document, structuredClone, console });
  const execute = file => {
    vm.runInContext(read(file), context, { filename: file });
    Object.assign(context, window);
  };
  execute('hub/shared/csv-upload.js');
  execute('hub/shared/analysis-lifecycle.js');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context, { filename: 'limit-ma/index.html' });
  for (const file of ['shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
    'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/plus.js',
    'limit-ma/plus-ui.js', 'limit-ma/loo-limit.js']) execute(file);
  return {
    window, nodes,
    result: () => window._almLastLimit(),
    run(text) { nodes.src.value = text; nodes['btn-run'].click(); },
    upload(text) {
      const mount = nodes['alm-csv-mount'];
      mount.querySelector('textarea').value = text;
      mount.querySelector('[data-action="parse-paste"]').click();
    },
  };
}

function refused(h, previousInput, row, reason) {
  assert.equal(h.result(), null, 'An invalid upload must not produce a subset fit or retain the previous fit');
  assert.equal(h.nodes.src.value, previousInput, 'Validate every row before replacing the input');
  if (row) assert.match(h.nodes['limit-error'].textContent, new RegExp(`CSV row ${row}:`, 'i'));
  assert.match(h.nodes['limit-error'].textContent, reason);
  assert.equal(h.window.alm.exportOptions.getResults(), null);
  assert.equal(h.window.alm.plotOptions.getReceiptInput(), null);
  assert.equal(h.window.__almLimitValidationSnapshot().result, null);
  assert.equal(h.window.AlmLimitPlusUI.snapshot(), null);
  for (const id of ['body', 'plot', 'limit-range-note', 'limit-diagnostics',
    'plus-body', 'plus-details', 'plus-forest', 'plus-funnel', 'plus-interpretation', 'loo-body', 'loo-plot']) {
    assert.equal(h.nodes[id].innerHTML, '', id);
  }
  assert.equal(h.nodes['analysis-status'].hidden, true);
  assert.equal(h.nodes['analysis-stale'].hidden, true);
  assert.equal(h.nodes['loo-csv'].disabled, true);
}

test('P12-R1 control: valid CSV keeps all five studies and exactly matches direct entry', () => {
  const h = load(), expected = plain(h.result());
  h.upload(csv(good));
  assert.equal(h.result().k, 5);
  assert.deepEqual(plain(h.result()), expected);
  assert.deepEqual(plain(h.window.__almLimitParse(h.nodes.src.value)), good.map(r => ({ te: r.yi, se: r.sei, label: r.study })));
  assert.equal(h.nodes['limit-error'].textContent, '');
  assert.equal(h.nodes['analysis-status'].hidden, false);
});

test('P12-R1 control: supported loader aliases and complete numeric strings remain valid', () => {
  for (const [effect, se, label] of [['yi', 'sei', 'study'], ['effect', 'SE', 'label'], ['TE', 'seTE', 'Study'], ['te', 'se', 'study']]) {
    const h = load();
    const rows = good.map((r, i) => ({ [effect]: i ? String(r.yi) : ' +0.e0 ', [se]: String(r.sei), [label]: r.study }));
    h.window.__almLimitLoad(rows);
    assert.equal(h.result().k, 5);
    assert.equal(h.window.__almLimitParse(h.nodes.src.value)[0].te, 0);
    assert.equal(h.nodes['limit-error'].textContent, '');
  }
});

test('P12-R1 control: direct entry already rejects a mixed zero-SE dataset', () => {
  const h = load();
  h.run(direct(good.map((r, i) => i === 2 ? { ...r, sei: 0 } : r)));
  assert.equal(h.result(), null);
  assert.match(h.nodes['limit-error'].textContent, /Line 3:.*SE.*greater than 0/);
});

for (const [name, field, value, reason] of [
  ['zero SE', 'sei', 0, /SE.*greater than 0/i],
  ['negative SE', 'sei', -0.1, /SE.*greater than 0/i],
  ['missing SE', 'sei', '', /SE/i],
  ['nonfinite SE', 'sei', 'Infinity', /SE/i],
  ['malformed SE', 'sei', '0.1oops', /SE/i],
  ['missing effect', 'yi', '', /effect/i],
  ['nonfinite effect', 'yi', 'NaN', /effect/i],
  ['malformed effect', 'yi', '0.5oops', /effect/i],
]) {
  test(`P12-R1 plant: CSV with ${name} refuses the whole dataset before replacing input`, () => {
    const h = load(), previous = h.nodes.src.value;
    h.upload(csv(good.map((r, i) => i === 2 ? { ...r, [field]: value } : r)));
    refused(h, previous, 3, reason);
  });
}

test('P12-R1 plant: entirely invalid CSV clears a previous CSV analysis and reports every bad row', () => {
  const h = load(); h.upload(csv(good));
  const previous = h.nodes.src.value;
  h.upload(csv(good.map(r => ({ ...r, sei: 0 }))));
  refused(h, previous, 1, /SE.*greater than 0/i);
  for (let row = 1; row <= good.length; row++) assert.match(h.nodes['limit-error'].textContent, new RegExp(`CSV row ${row}:`, 'i'));
});

test('P12-R1 plant: empty and header-only CSV clear previous results', () => {
  for (const text of ['', 'yi,sei,study\n']) {
    const h = load(), previous = h.nodes.src.value;
    h.upload(text);
    refused(h, previous, null, /CSV.*(empty|no.*stud)/i);
  }
});

test('P12-R1 plant: loader rejects missing and partial required numbers without parseFloat truncation', () => {
  for (const field of ['yi', 'sei']) for (const value of [undefined, null, '', '0.1oops', Infinity, NaN]) {
    const h = load(), previous = h.nodes.src.value;
    h.window.__almLimitLoad(good.map((r, i) => i === 2 ? { ...r, [field]: value } : r));
    refused(h, previous, 3, field === 'yi' ? /effect/i : /SE/i);
  }
});

test('P12-R1 plant: CSV refusal clears populated sensitivity and leave-one-out output', () => {
  const h = load();
  h.window.AlmLimitPlusUI.run();
  assert.ok(h.window.AlmLimitPlusUI.snapshot());
  const last = h.result();
  last.leave_one_out = h.window.AlmLimitLoo.compute(h.window.__almLimitParse(h.nodes.src.value));
  h.window.AlmLimitLoo.restore(last);
  assert.ok(h.nodes['loo-body'].innerHTML);
  assert.equal(h.nodes['loo-csv'].disabled, false);
  h.nodes['limit-range-note'].textContent = 'Previous range note';
  h.nodes['limit-diagnostics'].textContent = 'Previous diagnostic';
  const previous = h.nodes.src.value;
  h.upload(csv(good.map((r, i) => i === 2 ? { ...r, sei: 0 } : r)));
  refused(h, previous, 3, /SE.*greater than 0/i);
  h.nodes['plus-alpha'].fire('change');
  refused(h, previous, 3, /SE.*greater than 0/i);
});

test('P12-R1 control: a valid upload after refusal restores the full analysis', () => {
  const h = load(), expected = plain(h.result());
  h.upload(csv(good.map(r => ({ ...r, sei: 0 }))));
  h.upload(csv(good));
  assert.deepEqual(plain(h.result()), expected);
  assert.equal(h.nodes['limit-error'].textContent, '');
  assert.equal(h.nodes['analysis-status'].hidden, false);
});
