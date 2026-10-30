import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(match => !/\bsrc=/.test(match[1])).map(match => match[2]);
const storageKey = 'alm-autosave:effect-size-converter';
const draft = {
  'in-type': 'OR', 'in-smd-kind': 'd', 'in-est': '2', 'in-se': '0.3',
  'ctx-p0': '0.2', 'ctx-sd': '4', 'der-t': '', 'der-n1': '',
  'der-f': '', 'der-f-sign': '', 'der-n2': '', 'der-p': '',
  'der-lo': '', 'der-hi': '', 'der-scale': 'log',
};
const plain = value => JSON.parse(JSON.stringify(value));

// A small DOM/event shim: run the actual converter, renderer, adapters,
// URL-state and autosave implementation. Only unrelated UI mounts are stubbed.
// Timers are queued without wall-clock waits or filesystem output.
function harness(savedValues) {
  const elements = new Map();
  const docListeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function element(tagName, attrs = {}) {
    const listeners = new Map();
    let markup = '';
    return {
      tagName: tagName.toUpperCase(), id: '', type: '', value: '', checked: false,
      disabled: false, hidden: false, dataset: {}, style: {}, children: [], ...attrs,
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; this.children = []; },
      setAttribute(key, value) { this[key] = String(value); },
      appendChild(child) { this.children.push(child); child.parent = this; return child; },
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatchEvent(event) {
        event.target = this;
        for (const callback of listeners.get(event.type) || []) callback.call(this, event);
        if (event.bubbles) {
          for (const callback of docListeners.get(event.type) || []) callback(event);
        }
        return true;
      },
      click() { this.dispatchEvent({ type: 'click', bubbles: true }); },
      matches(selector) {
        const match = /^(\w+)(?:\[type=(\w+)\])?$/.exec(selector);
        return !!match && this.tagName === match[1].toUpperCase() &&
          (!match[2] || this.type === match[2]);
      },
    };
  }
  // Read field defaults from the real markup, including the first select option.
  const markup = html.slice(0, html.indexOf('<script>'));
  for (const match of markup.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const attr = name => new RegExp('\\b' + name + '="([^"]*)"').exec(attrs)?.[1] || '';
    const el = element(tag, { id, type: attr('type'), value: attr('value') });
    if (tag === 'select') {
      const options = markup.slice(match.index + match[0].length).split('</select>')[0];
      el.value = /<option\b[^>]*\bvalue="([^"]*)"/.exec(options)?.[1] || '';
    }
    elements.set(id, el);
  }
  const document = {
    readyState: 'complete', body: element('body'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => element(tag),
    querySelector: selector => elements.get(selector.slice(1)) || null,
    querySelectorAll: selector => [...elements.values()].filter(el => el.matches(selector)),
    addEventListener(type, callback) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(callback);
    },
  };
  const storage = new Map();
  if (savedValues) storage.set(storageKey, JSON.stringify({
    version: 1, savedAt: '2026-01-01T00:00:00.000Z', values: savedValues,
  }));
  const context = vm.createContext({
    document, console, location: { hash: '' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
  });
  context.window = context;
  for (const path of ['shared/effect-size-accuracy.js', 'shared/autosave.js', 'hub/shared/url-state.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  for (const name of ['csvUpload', 'axisControls', 'resultsExport', 'resetUndo', 'tooltips']) {
    context.alm[name] = () => {};
  }
  for (const marker of ['function runConvert()', 'window.__almSnapshot =', 'AlmAutosave.install(']) {
    const scripts = inline.filter(script => script.includes(marker));
    assert.equal(scripts.length, 1, 'find actual app script: ' + marker);
    vm.runInContext(scripts[0], context, { filename: 'effect-size-converter/index.html: ' + marker });
  }
  return {
    context, storage, document,
    field: id => elements.get(id),
    snapshot: () => plain(context.__almSnapshot()),
    urlState: () => plain(context.alm.urlState.read()),
    rows: () => plain(context.__almResultRows),
    rendered: () => ({
      table: elements.get('results-body').children.map(row => row.innerHTML),
      points: elements.get('forest-points').innerHTML,
      labels: elements.get('forest-labels').innerHTML,
      axis: elements.get('forest-axis').innerHTML,
      warning: elements.get('warn-slot').innerHTML,
    }),
    clickBanner(label) {
      const button = document.body.children.flatMap(banner => banner.children)
        .find(child => child.tagName === 'BUTTON' && child.textContent === label);
      assert.ok(button, 'installed autosave banner has ' + label + ' button');
      button.click();
      assert.equal(document.body.children.length, 0, 'banner removed after action');
    },
  };
}

for (const [label, values, scale] of [
  ['OR', draft, 'OR'],
  ['MD with pooled SD', { ...draft, 'in-type': 'MD' }, 'MD'],
  ["Hedges g with group sizes", { ...draft, 'in-type': 'SMD', 'in-smd-kind': 'g',
    'der-n1': '30', 'der-n2': '30' }, "SMD (Hedges' g)"],
]) {
  test('plant P20-R5: installed Restore renders final fields for ' + label, () => {
    const h = harness(values);
    h.clickBanner('Restore');
    assert.deepEqual(h.snapshot(), values);
    // Do not call __almResults(): export recalculates and would mask stale rendering.
    assert.equal(h.rows()[0].scale, scale);
    assert.equal(h.rows()[0].point, 2, 'rendered point must use the restored estimate');
    assert.equal(h.rows()[0].se, 0.3, 'rendered SE must use the restored SE');
    assert.match(h.rendered().table[0], /<td>2\.000<\/td><td>0\.300<\/td>/);
    const control = harness();
    control.context.__almRestore(values);
    assert.deepEqual(h.rows(), control.rows(), 'all conversion rows use the complete restored context');
    assert.deepEqual(h.rendered(), control.rendered(), 'table, forest and warning match an explicit restore');
  });
}

test('plant P20-R5: installed Restore commits the complete snapshot to the shareable URL', () => {
  const h = harness(draft);
  assert.equal(h.urlState()['in-est'], '0.75');
  h.clickBanner('Restore');
  assert.deepEqual(h.urlState(), h.snapshot());
  assert.deepEqual(h.urlState(), draft);
});

test('plant P20-R5: restoring invalid SE clears intermediate results and shows validation', () => {
  const h = harness({ ...draft, 'in-se': '-0.3' });
  h.clickBanner('Restore');
  assert.equal(h.field('in-se').value, '-0.3');
  assert.deepEqual(h.rows(), []);
  assert.deepEqual(h.rendered().table, []);
  assert.equal(h.rendered().points, '');
  assert.match(h.rendered().warning, /strictly positive standard error/);
});

test('plant P20-R5: a numeric-only saved draft also refreshes results', () => {
  const h = harness({ 'in-est': '2', 'in-se': '0.3' });
  h.clickBanner('Restore');
  assert.equal(h.rows()[0].point, 2);
  assert.equal(h.rows()[0].se, 0.3);
});

test('control P20-R5: explicit snapshot restore already renders the final fields', () => {
  const h = harness();
  h.context.__almRestore(draft);
  assert.deepEqual(h.snapshot(), draft);
  assert.equal(h.rows()[0].point, 2);
  assert.equal(h.rows()[0].se, 0.3);
  assert.match(h.rendered().table[0], /<td>2\.000<\/td><td>0\.300<\/td>/);
});

test('control P20-R5: installed Discard removes the saved draft and preserves current state', () => {
  const h = harness(draft);
  const before = { snapshot: h.snapshot(), rows: h.rows(), rendered: h.rendered(), url: h.urlState() };
  h.clickBanner('Discard');
  assert.equal(h.storage.has(storageKey), false);
  assert.deepEqual({ snapshot: h.snapshot(), rows: h.rows(), rendered: h.rendered(), url: h.urlState() }, before);
});

test('control P20-R5: no saved draft keeps initial results and manual Convert working', () => {
  const h = harness();
  assert.equal(h.document.body.children.length, 0);
  assert.equal(h.rows()[0].point, 0.75);
  assert.equal(h.rows()[0].se, 0.12);
  h.field('in-est').value = '2';
  h.field('in-se').value = '0.3';
  h.field('btn-convert').click();
  assert.equal(h.rows()[0].point, 2);
  assert.equal(h.rows()[0].se, 0.3);
  assert.deepEqual(h.urlState(), h.snapshot());
});
