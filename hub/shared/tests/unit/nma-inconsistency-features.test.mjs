import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../../../../' + file, import.meta.url), 'utf8');
const html = read('nma-inconsistency/index.html');
const engine = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function fitNMA('));
const example = /<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1];

// Execute the actual app, live adapter, report UI and feature adapter. This DOM
// double covers event/export behavior, not browser layout or accessibility.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.handlers = {};
    this.value = '';
    this._text = '';
    this.style = {};
    this.isConnected = true;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(value) { this.html = value; this.textContent = value.replace(/<[^>]*>/g, ''); }
  get innerHTML() { return this.html || ''; }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  click() { for (const fn of this.handlers.click || []) fn({ target: this }); }
}
const descendants = el => [el, ...el.children.flatMap(descendants)];

function setup() {
  const elements = Object.fromEntries(['src', 'f-model', 'btn-run', 'ns-body', 'ns-plot', 'dbt']
    .map(id => [id, new Element('div')]));
  elements.src.value = example;
  elements['f-model'].value = 'FE';
  const document = {
    getElementById: id => elements[id] || null,
    createElement: tag => new Element(tag),
    addEventListener() {}, removeEventListener() {},
    querySelectorAll(selector) {
      if (selector === '#ns-body tr') {
        return [...elements['ns-body'].innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => ({
          querySelectorAll: () => [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)]
            .map(c => ({ textContent: c[1].replace(/<[^>]*>/g, '') }))
        }));
      }
      return [];
    }
  };
  const copies = [];
  const context = vm.createContext({
    document, structuredClone, setTimeout, clearTimeout,
    MutationObserver: class { observe() {} },
    navigator: { clipboard: { writeText: async text => { copies.push(text); } } },
    AlmBuildInfo: { version: 'v2.0.0', shortSha: 'abcdef0', sha: 'abcdef0123456789' }
  });
  context.window = context;
  vm.runInContext(engine, context);
  for (const file of ['nma-inconsistency/alm-live.js', 'shared/alm-features.js',
    'shared/alm-text.js', 'nma-inconsistency/alm-features.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const spec = context.AlmFeatures.get('nma-inconsistency');
  const host = new Element('div');
  const ui = spec.text.mount(host);
  const copy = descendants(host).find(el => el.attrs['data-copy'] === 'results');
  return { context, elements, spec, ui, copies, copy };
}

test('control: the example report passes the DOM audit and can be copied', () => {
  const h = setup();
  assert.equal(h.ui.state.audit.ok, true, JSON.stringify(h.ui.state.audit.failures));
  assert.equal(h.ui.state.audit.domChecked, 51);
  h.copy.click();
  assert.equal(h.copies.length, 1);
  assert.match(h.copies[0], /11 two-arm studies of 4 treatments/);
});

for (const [input, value] of [['src', 'A, B, 0.5, 0.1'], ['f-model', 'DL']]) {
  test(`edited ${input} blocks copying the previous report before the next run`, () => {
    const h = setup();
    h.elements[input].value = value;
    h.copy.click();
    assert.equal(h.copies.length, 0, 'old report must not be exported for edited inputs');
    assert.equal(h.ui.root.attrs['data-stale'], 'true');
  });
}

test('regenerating after an unrun edit withholds the old report', () => {
  const h = setup();
  h.elements.src.value = 'A, B, 0.5, 0.1';
  h.ui.regenerate();
  assert.equal(h.ui.state.rendered, null);
});

test('control: rerunning edited data produces an audited, copyable new report', () => {
  const h = setup();
  h.elements.src.value += '\nA, B, 0.7, 0.12';
  h.elements['btn-run'].click();
  h.ui.regenerate();
  assert.equal(h.ui.state.audit.ok, true, JSON.stringify(h.ui.state.audit.failures));
  h.copy.click();
  assert.equal(h.copies.length, 1);
  assert.match(h.copies[0], /12 two-arm studies/);
});

const triangle = [
  { study: 'one', t1: 'A', t2: 'B', yi: 0.1, sei: 0.1 },
  { study: 'two', t1: 'B', t2: 'C', yi: 0.2, sei: 0.1 },
  { study: 'three', t1: 'A', t2: 'C', yi: 0.3, sei: 0.1 }
];

test('entry refuses overflowing variances before changing the input or result', () => {
  const h = setup();
  const previous = h.context._almLastInco();
  const out = h.spec.entry.apply(triangle.map(r => ({ ...r, sei: 1e200 })));
  assert.equal(out.ok, false);
  assert.equal(h.elements.src.value, example, 'refused entry must preserve the existing data');
  assert.equal(h.context._almLastInco(), previous);
});

test('control: entry accepts ordinary SEs and preserves quoted treatment/study labels', () => {
  const h = setup();
  const rows = triangle.map(r => ({ ...r, study: r.study + ', "trial"',
    t1: r.t1 === 'A' ? 'Drug, "new"' : r.t1, t2: r.t2 === 'A' ? 'Drug, "new"' : r.t2 }));
  assert.equal(h.spec.entry.apply(rows).ok, true);
  const parsed = h.context.parse(h.elements.src.value);
  assert.equal(parsed.length, rows.length);
  rows.forEach((r, i) => {
    assert.deepEqual([parsed[i].A, parsed[i].B, parsed[i].te, parsed[i].se, parsed[i].study],
      [r.t1, r.t2, r.yi, r.sei, r.study]);
  });
  assert.equal(h.context._almLastInco().nodeSplit.length, 3);
});
