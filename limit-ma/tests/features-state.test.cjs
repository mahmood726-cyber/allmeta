// Actual app, feature host, text UI, validation adapter and LOO code in a VM.
// DOM plumbing only: these tests are not browser/layout or independent R evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

function load() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const nodes = {}, handlers = {};
  function node(tag = 'div') {
    let content = '';
    const listeners = {};
    return { tag, children: [], attrs: {}, style: {}, value: '', hidden: false, disabled: false, isConnected: true,
      get innerHTML() { return content; }, set innerHTML(v) { content = v; this.children = []; },
      get textContent() { return content + this.children.map(n => n.textContent).join(''); },
      set textContent(v) { content = String(v); this.children = []; },
      get firstChild() { return this.children[0] || null; },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      removeChild(n) { this.children.splice(this.children.indexOf(n), 1); },
      replaceChildren(...cs) { content = ''; this.children = []; cs.forEach(n => this.appendChild(n)); },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      removeAttribute(k) { delete this.attrs[k]; },
      contains(n) { return this === n || this.children.some(c => c.contains(n)); },
      closest() { return null; }, matches(selector) { return selector === '#' + this.id; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      fire(type) {
        const event = { target: this };
        for (const fn of handlers[type] || []) fn(event);
        return Promise.all((listeners[type] || []).map(fn => fn(event)));
      },
      click() { return this.fire('click'); }
    };
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const n = nodes[m[1]] = node(); n.id = m[1];
    n.value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    n.hidden = /\bhidden\b/.test(m[0]);
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {
    readyState: 'loading', getElementById: id => nodes[id], createElement: node,
    querySelectorAll: selector => selector === '#src' ? [nodes.src] : [],
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    removeEventListener(type, fn) { handlers[type] = (handlers[type] || []).filter(f => f !== fn); }
  };
  const noop = () => {};
  const alm = { csvUpload: noop, plotExport: noop, axisControls: noop, resultsExport: noop,
    urlState: Object.assign(noop, { read: () => null }), resetUndo: noop, tooltips: noop };
  const context = vm.createContext({ document, alm, structuredClone, setTimeout, clearTimeout, console,
    Blob, URL, AlmValidate: { mount: noop } });
  context.window = context;
  const runFile = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  runFile('../hub/shared/analysis-lifecycle.js');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  for (const file of ['plus-opt.js', 'loo-limit.js', 'validate/adapter.js', '../shared/alm-features.js',
    '../shared/alm-text.js', 'alm-features.js']) runFile(file);
  const spec = context.AlmFeatures.get('limit-ma');
  function textPanel() {
    const panel = node();
    const hooks = context.AlmFeatures.moduleFor('text').render(panel, { app: 'limit-ma', block: spec.text });
    if (hooks?.onShow) hooks.onShow();
    return panel;
  }
  return { w: context, nodes, spec, node, textPanel, handlers };
}

test('Report text stays lazy until its tab opens; opening still generates audited text', () => {
  const h = load(), panel = h.node();
  const hooks = h.w.AlmFeatures.moduleFor('text').render(panel, { app: 'limit-ma', block: h.spec.text });
  assert.equal(panel.children.length, 0, 'a hidden tab must not mount document listeners');
  hooks.onShow();
  assert.equal(panel.almText.state.audit.ok, true);
  assert.match(panel.textContent, /Text generated from the current results/);
});

test('PLANTED pending edit stays stale after report event checks; explicit Run updates it', async () => {
  const h = load(); h.textPanel();
  const before = h.w._almLastLimit(), plot = h.nodes.plot.innerHTML;
  h.nodes.src.value = h.nodes.src.value.replace('0.55', '0.56');
  await h.nodes.src.fire('input'); await flush();
  assert.equal(h.nodes['analysis-stale'].hidden, false);
  assert.equal(h.w._almLastLimit(), before, 'report checks must not recompute');
  assert.equal(h.nodes.plot.innerHTML, plot);
  await h.nodes['btn-run'].click(); await flush();
  assert.equal(h.nodes['analysis-stale'].hidden, true);
  assert.notEqual(h.w._almLastLimit().limit_est, before.limit_est);
});

test('PLANTED feature revision reads cannot cancel or erase leave-one-out; edits still invalidate it', async () => {
  const h = load(); h.textPanel();
  await h.nodes['loo-run'].click(); await flush();
  const result = h.w._almLastLimit(), loo = result.leave_one_out;
  assert.equal(loo?.rows.length, 10, 'all deletions must complete despite text event checks');
  assert.ok(h.w.AlmFeatures.revision('limit-ma'));
  assert.equal(h.w._almLastLimit(), result);
  assert.equal(h.w._almLastLimit().leave_one_out, loo);
  h.nodes.src.value += '\n0.4,0.15,New'; await h.nodes.src.fire('input'); await flush();
  assert.equal(result.leave_one_out, undefined);
  assert.equal(h.nodes['loo-body'].innerHTML, '');
  assert.equal(h.nodes['loo-csv'].disabled, true);
});

test('feature verification reads the same quantities and R script as the pinned adapter', () => {
  const h = load(), control = load();
  const live = h.spec.verify.adapter().live, legacy = control.w.AlmLimitValidationAdapter.live;
  const before = h.w._almLastLimit(), state = live.currentState(), expected = legacy.currentState();
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.equal(h.w._almLastLimit(), before, 'reading verification state must not refit');
  assert.deepEqual(plain(state.values), plain(expected.values));
  assert.deepEqual(plain(state), plain(expected));
  assert.equal(state.values.length, 32);
  assert.equal(live.buildScript(state), legacy.buildScript(expected));
  assert.deepEqual(plain(live.compare), plain(legacy.compare));
});

test('PLANTED programmatic pending input is refused without mutation; Run restores verification', async () => {
  const h = load(), before = h.w._almLastLimit();
  h.nodes.src.value = h.nodes.src.value.replace('0.55', '0.56');
  assert.throws(() => h.spec.verify.adapter().live.currentState(), /Run analysis/);
  assert.equal(h.w._almLastLimit(), before);
  await h.nodes['btn-run'].click();
  assert.equal(h.spec.verify.adapter().live.currentState().te[0], .56);
});

test('snapshot restore preserves pending-versus-completed inputs and refuses missing results', async () => {
  const h = load(), initial = h.w.__almLimitValidationSnapshot();
  h.nodes.src.value = h.nodes.src.value.replace('0.55', '0.56');
  const pending = h.w.__almLimitValidationSnapshot();
  h.w.__almLimitValidationRun(initial.src, true);
  h.w.__almLimitValidationRestore(pending);
  assert.throws(() => h.spec.verify.adapter().live.currentState(), /Run analysis/);
  h.w.__almLimitValidationRestore(initial);
  assert.equal(h.spec.verify.adapter().live.currentState().te[0], .55);
  h.nodes.src.value = ''; await h.nodes['btn-run'].click();
  assert.throws(() => h.spec.verify.adapter().live.currentState());
  assert.equal(h.w._almLastLimit(), null);
});

test('feature host follows the frozen main layout; original plots remain inside main', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const start = html.indexOf('<main '), end = html.indexOf('</main>');
  assert.ok(start >= 0 && end > start);
  for (const id of ['plot', 'loo-plot', 'plus-forest', 'plus-funnel']) {
    const position = html.indexOf('id="' + id + '"');
    assert.ok(position > start && position < end, id);
  }
  assert.ok(html.indexOf('id="alm-features"') > end, 'feature UI must not shift the archived plot layout');
});
