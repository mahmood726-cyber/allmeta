import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = new URL('../../../../', import.meta.url);
const load = require('../../../../gosh/tests/input-harness.cjs');
// Control only the profiling clock so cross-instance equality also checks the
// timing fields deterministically. All subset statistics use the real engine.
const exactModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL('gosh/exact-enum.js', root), 'utf8'), {
  module: exactModule, Date: { now: () => 0 }
});
const exact = exactModule.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const source = Array.from({ length: 16 }, (_, i) => `${i / 10}, .1, Synthetic ${i + 1}`).join('\n');

// Run the shipped page, exact controller/engine, feature host, text module and
// live adapter. Only browser DOM plumbing and Worker delivery are substituted.
function app() {
  const h = load(fileURLToPath(new URL('gosh/index.html', root)));
  function node() {
    return { value: '', hidden: true, textContent: '', innerHTML: '', children: [], style: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(name, fn) { this[name] = fn; }, closest() { return null; } };
  }
  Object.values(h.nodes).forEach(n => Object.assign(n, { children: [], append: node().append, closest() { return null; } }));
  const el = id => h.nodes[id] ||= node();
  h.nodes['enum-mode'].value = 'auto';
  h.nodes['analysis-stale'].hidden = true;
  for (const id of ['exact-summary', 'exact-perstudy']) {
    Object.assign(el(id), { tBodies: [node()], tHead: node(), caption: node() });
  }
  const axes = ['', '', false, '0', '100', false].map((v, i) => ({
    ...node(), id: 'axis-' + i, type: typeof v === 'boolean' ? 'checkbox' : 'number',
    value: typeof v === 'string' ? v : '', checked: v === true, dispatchEvent() {}
  }));
  const document = {
    readyState: 'loading', addEventListener() {}, getElementById: el, createElement: node,
    querySelector: selector => selector === '.metrics' ? { parentElement: { children: [] } } : null,
    querySelectorAll(selector) {
      if (selector === '#alm-axis-mount input') return axes;
      if (selector === '.metrics > .card') return [];
      return selector.split(',').flatMap(s => s.trim() === '#alm-axis-mount input' ? axes : [el(s.trim().slice(1))]);
    }
  };
  const workers = [];
  class Worker {
    constructor() { workers.push(this); }
    postMessage(payload) { this.payload = payload; }
    terminate() { this.stopped = true; }
  }
  h.window.alm.urlState.withoutWrites = fn => fn();
  const sandbox = vm.createContext({ window: h.window, document, Event, Worker, setTimeout, clearTimeout,
    alm: h.window.alm, __almGoshValidationRun: h.window.__almGoshValidationRun,
    AlmValidate: { mount() {} } });
  function script(path) { vm.runInContext(readFileSync(new URL(path, root), 'utf8'), sandbox, { filename: path }); }
  script('gosh/exact-ui.js');
  script('gosh/validate/adapter.js');
  script('shared/alm-features.js');
  script('shared/alm-text.js');
  script('gosh/alm-features.js');
  h.spec = h.window.AlmGoshFeatures;
  h.finish = () => {
    for (const w of workers) {
      if (w.stopped) continue;
      const p = w.payload;
      w.onmessage({ data: { type: 'done', id: p.id, result: exact.run(p.te, p.se, p.model) } });
    }
  };
  h.capture = () => plain({ state: h.spec.share.get(), result: h.window._almLastGosh(), plot: h.nodes.plot.innerHTML });
  return h;
}

for (const mode of ['sample', 'exact', 'auto']) {
  test(`GOSH share preserves ${mode} enumeration and computed results`, () => {
    const sender = app();
    sender.nodes['enum-mode'].value = mode;
    sender.nodes['n-sample'].value = '37';
    sender.run(source); sender.finish();
    const expected = sender.capture();
    const receiver = app();
    // Restore into an opposite mode as well as the default fresh-page path.
    receiver.nodes['enum-mode'].value = mode === 'sample' ? 'auto' : 'sample';
    receiver.spec.share.set(expected.state); receiver.finish();
    assert.equal(receiver.nodes['enum-mode'].value, mode);
    assert.deepEqual(receiver.capture(), expected);
    assert.equal(expected.result.n_subsets, mode === 'sample' ? 37 : 2 ** 16 - 1);
  });
}

test('GOSH share rejects unknown enumeration atomically', () => {
  const h = app(), before = h.capture();
  assert.throws(() => h.spec.share.set({ ...before.state, src: source, enumeration: 'invalid' }), /enumeration/i);
  assert.deepEqual(h.capture(), before);
});

test('GOSH share control: unchanged default-mode small analysis round-trips', () => {
  const sender = app(), receiver = app(), before = sender.capture();
  receiver.spec.share.set(before.state);
  assert.deepEqual(receiver.capture(), before);
});

test('GOSH legacy share without enumeration restores the original auto default', () => {
  const h = app(), state = plain(h.spec.share.get());
  delete state.enumeration;
  h.nodes['enum-mode'].value = 'sample';
  h.spec.share.set(state);
  assert.equal(h.nodes['enum-mode'].value, 'auto');
  assert.equal(h.window._almLastGosh().n_subsets, 7);
});

test('GOSH enumeration edits invalidate the verification input fingerprint', () => {
  const h = app(), host = h.window.AlmFeatures;
  const before = host.inputsHash('gosh');
  assert.equal(host.inputsHash('gosh'), before, 'unchanged control');
  h.nodes['enum-mode'].value = 'sample';
  assert.notEqual(host.inputsHash('gosh'), before);
});

test('GOSH text context preserves completed exact results and passes the DOM audit', () => {
  const h = app(); h.nodes['n-sample'].value = '37'; h.run(source); h.finish();
  const before = h.capture(), text = h.window.AlmText, spec = h.spec.text;
  assert.equal(before.result.n_subsets, 65535);
  const results = spec.results(), ctx = text.context('gosh', spec);
  const rendered = text.render(spec.templates, results, ctx);
  const audit = text.audit(rendered, results, { ctx, dom: spec.dom() });
  assert.deepEqual(h.capture(), before, 'asking for report context must not replace exact results with a sample');
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
});

test('GOSH text control: ordinary enumerated results still audit against displayed cards', () => {
  const h = app(), spec = h.spec.text, text = h.window.AlmText;
  const results = spec.results(), ctx = text.context('gosh', spec);
  const rendered = text.render(spec.templates, results, ctx);
  const audit = text.audit(rendered, results, { ctx, dom: spec.dom() });
  assert.equal(results.n_subsets, 7);
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
});

test('GOSH live verification refuses unsupported exact output without replacing it', () => {
  const h = app(); h.nodes['n-sample'].value = '37'; h.run(source); h.finish();
  const before = h.capture();
  assert.throws(() => h.spec.verify.adapter().live.currentState(), /exact.*sampl|sampl.*exact/i);
  assert.deepEqual(h.capture(), before);
});

for (const [name, data, mode] of [['small enumeration', '.1, .2, A\n.2, .3, B\n.3, .4, C', 'auto'], ['sample', source, 'sample']]) {
  test(`GOSH live capture control: ${name} retains subset values and results`, () => {
    const h = app(); h.nodes['enum-mode'].value = mode; h.nodes['n-sample'].value = '37'; h.run(data);
    const before = h.capture(), live = h.spec.verify.adapter().live;
    const state = live.currentState();
    assert.equal(state.points.length, before.result.n_subsets);
    assert.equal(live.appValues(state).find(v => v.key === 'median_est').value, before.result.median_est);
    assert.match(live.buildScript(state), /metafor::rma/);
    assert.deepEqual(h.capture(), before);
  });
}

test('GOSH text context does not run edited inputs before Run analysis', () => {
  const h = app(), before = plain(h.window._almLastGosh()), plot = h.nodes.plot.innerHTML;
  h.nodes.src.value = '.8, .2, A\n.9, .3, B\n1, .4, C';
  h.nodes['analysis-stale'].hidden = false;
  h.window.AlmText.context('gosh', h.spec.text);
  assert.deepEqual(plain(h.window._almLastGosh()), before);
  assert.equal(h.nodes.plot.innerHTML, plot);
});

test('GOSH live verification refuses a pending exact worker and leaves it running', () => {
  const h = app(); h.nodes['n-sample'].value = '37'; h.run(source);
  const before = h.capture();
  assert.throws(() => h.spec.verify.adapter().live.currentState(), /exact.*sampl|sampl.*exact/i);
  assert.deepEqual(h.capture(), before);
  h.finish();
  assert.equal(h.window._almLastGosh().n_subsets, 65535);
});

test('GOSH read-only feature capture restores results and DOM after an adapter error', () => {
  const h = app(), before = h.capture();
  assert.throws(() => h.window.__almGoshFeatureCapture(() => {
    h.window.__almGoshValidationRun();
    throw new Error('Synthetic capture failure');
  }), /Synthetic capture failure/);
  assert.deepEqual(h.capture(), before);
});
