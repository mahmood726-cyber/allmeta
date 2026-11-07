import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable('));
assert.ok(appScript, 'The real proportion-ma application script must be present');
const valid = '10, 100, Before A\n20, 100, Before B';
const single = '10, 100, Only study';

// Execute the complete app script, real pooling core and real lifecycle. Only
// browser elements and unrelated shared widget mounting are replaced by doubles.
// No statistical values are supplied by this harness or claimed as R references.
function setup(src = valid) {
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, localName, markup, id] = match;
    const attributes = new Map([...markup.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key, value]));
    const listeners = new Map();
    elements.set(id, {
      id, localName, value: '', innerHTML: '', textContent: '', style: {},
      hidden: /\bhidden\b/.test(markup),
      setAttribute(key, value) { attributes.set(key, String(value)); },
      getAttribute(key) { return attributes.get(key) ?? null; },
      matches(selector) { return selector.split(',').some(s => s.trim() === '#' + id); },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatch(type) { for (const callback of listeners.get(type) || []) callback({ target: this }); },
    });
  }
  const el = id => {
    assert.ok(elements.has(id), 'Missing app element: ' + id);
    return elements.get(id);
  };
  el('src').value = src;
  el('trans').value = 'logit';
  el('tau-est').value = 'PM';
  const listeners = new Map();
  const document = {
    getElementById: el,
    querySelectorAll: selector => [...elements.values()].filter(node => node.matches(selector)),
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
  };
  const widgets = {};
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, tooltips: noop,
    plotExport: options => { widgets.plot = options; },
    resultsExport: options => { widgets.results = options; },
    axisControls: options => { widgets.axis = options; },
    resetUndo: Object.assign(noop, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => ({}), write: noop }),
  } };
  const context = vm.createContext({ window, document });
  for (const path of ['shared/ma-core.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  vm.runInContext(appScript, context, { filename: 'proportion-ma/index.html' });
  function event(id, type) {
    const target = el(id);
    for (const callback of listeners.get(type) || []) callback({ target });
    target.dispatch(type);
  }
  return {
    el, window, widgets, event,
    run(text) { el('src').value = text; event('src', 'input'); event('btn-run', 'click'); },
  };
}

function assertValid(h) {
  const results = h.window._almLastPropMA();
  assert.equal(results.k, 2);
  assert.ok(Number.isFinite(results.poolP));
  assert.match(h.el('res-body').innerHTML, /class="pooled-row"/);
  assert.match(h.el('forest').innerHTML, /<polygon\b/);
  assert.match(h.el('het').innerHTML, /Q = <code>/);
  assert.equal(h.widgets.plot.plots[0].getSvg(), h.el('forest'));
  assert.equal(h.widgets.plot.getReceiptInput().results, results);
  assert.equal(h.widgets.results.getResults(), results);
  assert.ok(h.window.__almPropValidation.snapshot());
  assert.equal(h.el('analysis-status').hidden, false);
  assert.equal(h.el('analysis-stale').hidden, true);
}

function refused(text = single) {
  const h = setup();
  assertValid(h);
  h.run(text);
  assert.match(h.el('res-body').innerHTML, /Need at least 2 studies\./);
  assert.doesNotMatch(h.el('res-body').innerHTML, /class="pooled-row"/);
  assert.equal(h.window._almLastPropMA(), null);
  assert.equal(h.window.__almPropValidation.snapshot(), null);
  assert.equal(h.widgets.results.getResults(), null);
  assert.equal(h.widgets.plot.getReceiptInput(), null);
  assert.equal(h.el('analysis-status').hidden, true);
  assert.equal(h.el('analysis-stale').hidden, true);
  return h;
}

test('P09-R4 control: valid two-study fit renders and exposes current results and plot', () => {
  assertValid(setup());
});

test('P09-R4 plant: one-study refusal clears the previous forest', () => {
  const h = refused();
  assert.ok(h.el('forest').innerHTML === '', 'The previous forest must be removed after refusal');
});

test('P09-R4 plant: one-study refusal clears previous heterogeneity', () => {
  const h = refused();
  assert.equal(h.el('het').innerHTML, '', 'Previous heterogeneity must be removed after refusal');
});

test('P09-R4 plant: one-study refusal makes the plot unavailable to export', () => {
  const h = refused();
  assert.ok(h.widgets.plot.plots[0].getSvg() === null, 'Refused analysis must not supply an exportable SVG');
});

test('P09-R4 plant: refusal message remains visible in a polite status region', () => {
  const h = refused();
  assert.equal(h.el('res-body').hidden, false);
  assert.match(h.el('res-body').innerHTML,
    /<span\b(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*>Need at least 2 studies\.<\/span>/);
});

test('P09-R4 plant: zero-study refusal also invalidates all rendered outputs', () => {
  for (const text of ['', 'not, valid, data']) {
    const h = refused(text);
    assert.ok(h.el('forest').innerHTML === '', 'Zero valid studies must clear the forest');
    assert.equal(h.el('het').innerHTML, '');
    assert.equal(h.widgets.plot.plots[0].getSvg(), null);
    h.event('src', 'change');
    assert.equal(h.el('analysis-status').hidden, true);
    assert.equal(h.el('analysis-stale').hidden, true);
  }
});

test('P09-R4 control: valid run after refusal restores fresh output and export availability', () => {
  const h = refused();
  const next = '30, 100, After A\n60, 100, After B';
  h.run(next);
  assertValid(h);
  assert.match(h.el('forest').innerHTML, /After A/);
  assert.doesNotMatch(h.el('forest').innerHTML, /Before A|Only study/);
  assert.doesNotMatch(h.el('res-body').innerHTML, /Need at least 2 studies\./);
  const fresh = setup(next);
  assert.equal(JSON.stringify(h.window._almLastPropMA()), JSON.stringify(fresh.window._almLastPropMA()));
  assert.equal(h.el('forest').innerHTML, fresh.el('forest').innerHTML);
  assert.equal(h.el('het').innerHTML, fresh.el('het').innerHTML);
});
