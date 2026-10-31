import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
export const priorInput = 'A,B,0.2,0.1,prior1\nB,C,0.3,0.2,prior2\nA,C,0.6,0.15,prior3';

// Small DOM boundary, real complete application scripts. Mutation delivery is a
// microtask; timers are queued, never run inline. No engine/export mocks.
export function harness() {
  const elements = new Map(), storage = new Map(), downloads = [], clipboard = [];
  const timers = new Map();
  let now = 0, timerId = 0, observer;
  function element(id = '', tagName = 'div') {
    const listeners = new Map(), children = new Map();
    let content = '';
    const el = {
      id, tagName, value: '', style: {}, dataset: {}, parentNode: null,
      classList: { contains: () => false },
      get innerHTML() { return content; },
      set innerHTML(text) {
        content = String(text);
        if (id === 'dbt' && observer) queueMicrotask(() => observer());
      },
      get textContent() { return content; },
      set textContent(text) { this.innerHTML = text; },
      setAttribute() {}, focus() {}, remove() {}, removeChild() {},
      append(child) { child.parentNode = this; if (child.id) elements.set(child.id, child); },
      appendChild(child) { this.append(child); },
      insertAdjacentElement(where, child) {
        if (where === 'beforebegin' || where === 'afterend') {
          // Adjacent controls are siblings: their clicks must not bubble to us.
          child.parentNode = this.parentNode;
          if (child.id) elements.set(child.id, child);
        } else this.append(child);
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(event) {
        if (!event.target) event.target = this;
        for (const fn of listeners.get(event.type) || []) fn(event);
        if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
      },
      click() { this.dispatchEvent({ type: 'click', bubbles: true }); },
      closest() { return this; },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      }
    };
    if (id) elements.set(id, el);
    return el;
  }
  const html = read('nma-inconsistency/index.html');
  // Inline JavaScript contains IDs for elements created later (export mount).
  // Only real markup belongs in the initial DOM.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  for (const [, id] of markup.matchAll(/\bid="([^"]+)"/g)) element(id);
  const body = element(), head = element(), footer = element(), title = element();
  footer.textContent = 'Only independent two-arm studies are supported.';
  title.textContent = 'Network inconsistency';
  elements.get('src').value = priorInput;
  elements.get('f-model').value = 'FE';
  for (const id of ['plus-copy', 'plus-r', 'plus-r-loo']) elements.get(id).parentNode = elements.get('alm-plus');
  const document = {
    readyState: 'complete', body, head,
    getElementById: id => elements.get(id) || null,
    createElement: tag => element('', tag),
    querySelector: selector => ({ footer, main: body, h1: title })[selector] || null
  };
  const c = vm.createContext({
    document, console, Blob,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    navigator: { clipboard: { writeText: async text => { clipboard.push(text); } } },
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    Event: class { constructor(type, opts = {}) { this.type = type; this.bubbles = !!opts.bubbles; } },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { assert.equal(el.id, 'dbt'); observer = this.fn; } },
    setTimeout: (fn, ms = 0) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  c.window = c;
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const run = (code, filename) => { assert.ok(code, filename); vm.runInContext(code, c, { filename }); };
  run(read('shared/ma-comparisons-v1.js'), 'shared/ma-comparisons-v1.js');
  run(inline.find(s => s.includes('function parse(text)')), 'page engine');
  for (const name of ['plus-core.js', 'plus-examples.js', 'plus-ui.js']) run(read('nma-inconsistency/' + name), name);
  run(read('hub/shared/results-export.js'), 'results-export.js');
  run(inline.find(s => s.includes('basename:"nma-inconsistency"')), 'page export wiring');
  run(inline.find(s => s.includes('// ma-comparisons-v1 reader:')), 'page bus importer');
  async function advance(ms = 1000) {
    const end = now + ms;
    await Promise.resolve();
    let count = 0;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0]).find(([, t]) => t.at <= end);
      if (!next) break;
      assert.ok(++count < 10000, 'timer queue must settle');
      const [id, t] = next;
      timers.delete(id); now = t.at; t.fn();
      await Promise.resolve();
    }
    now = end;
  }
  return { c, document, elements, storage, downloads, clipboard, advance };
}
