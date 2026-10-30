// Execute the real page script with just its DOM/event surface; no browser needed.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
export function page() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      let content = '';
      const listeners = new Map();
      nodes.set(id, {
        value: id === 'f-method' ? 'REML' : '', disabled: false,
        get innerHTML() { return content; }, set innerHTML(x) { content = x; },
        get textContent() { return content; }, set textContent(x) { content = x; },
        addEventListener(name, fn) {
          if (!listeners.has(name)) listeners.set(name, []);
          listeners.get(name).push(fn);
        },
        dispatchEvent(e) { for (const fn of listeners.get(e.type) || []) fn(e); },
        querySelector() { return null; }, querySelectorAll() { return []; }
      });
    }
    return nodes.get(id);
  }
  const exports = new Map(), pending = new Map();
  let timer = 0;
  const window = { alm: { resultsExport(opts) { exports.set(opts.basename, opts.getResults); } } };
  const context = vm.createContext({
    window, document: { readyState: 'complete', getElementById: node,
      querySelector: () => null, querySelectorAll: () => [] },
    matchMedia: () => ({ matches: false }),
    setTimeout: fn => { pending.set(++timer, fn); return timer; },
    clearTimeout: id => pending.delete(id),
    MutationObserver: class { observe() {} }
  });
  Object.defineProperty(context, '_almLastCorrMA', { get: () => window._almLastCorrMA });
  vm.runInContext(read('shared/ma-core.js'), context);
  const scripts = [...read('correlation-ma/index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  vm.runInContext(scripts.find(s => s[1].includes('var EXAMPLE'))[1], context);
  vm.runInContext(read('correlation-ma/plus-core.js'), context);
  vm.runInContext(read('correlation-ma/plus-ui.js'), context);
  function flush() {
    while (pending.size) {
      const fns = [...pending.values()]; pending.clear();
      for (const fn of fns) fn();
    }
  }
  flush();
  return { window, node, exports,
    run(text, method) {
      node('f-data').value = text; node('f-method').value = method;
      node('f-data').dispatchEvent({ type: 'input' }); flush();
      return window._almLastCorrMA();
    }
  };
}
