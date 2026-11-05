// Execute the actual page scripts, parsers, event handlers and engines without a browser.
// The small DOM facade captures serialized output; it makes no browser-layout claims.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export const root = new URL('../../../../', import.meta.url);
export function loadPage({ sourceRoot = root, hash = '', saved = null, overrides = {} } = {}) {
  const read = name => overrides[name] ?? readFileSync(new URL(name, sourceRoot), 'utf8');
  const html = read('meta-regression/index.html');
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.defaultValue = ''; this.innerHTML = ''; this.textContent = ''; this.checked = false; this.listeners = {}; this.classList = { add() {}, remove() {}, toggle() {} }; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatchEvent(event) { event.target ??= this; for (const fn of this.listeners[event.type] || []) fn(event); this['on' + event.type]?.(event); return true; }
    click() { this.dispatchEvent({ type: 'click' }); }
    closest(selector) { return selector === '[data-alm-hero]' ? this : null; }
    replaceChildren() { this.innerHTML = ''; }
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  for (const m of html.matchAll(/<textarea\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) elements.get(m[1]).value = elements.get(m[1]).defaultValue = m[2];
  for (const m of html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*>/g)) elements.get(m[1]).value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
  const picker = new Element('picker');
  const document = {
    readyState: 'complete', getElementById: id => elements.get(id) || null,
    querySelector(selector) {
      if (selector.includes('[data-alm-hero]')) return picker;
      return elements.get(selector.replace(/^#/, '')) || null;
    },
    createElement: () => new Element(), addEventListener() {},
  };
  const noop = () => {};
  const window = { document, location: { hash }, alm: { analysisLifecycle: f => f, plotExport: noop, csvUpload: noop, axisControls: noop, resultsExport: noop, resetUndo: Object.assign(noop, { snapshot: noop }), tooltips: noop } };
  const context = vm.createContext({ window, document, console, Math, Date, URL, Blob, structuredClone,
    Event: class { constructor(type, props = {}) { this.type = type; Object.assign(this, props); } },
    localStorage: { getItem: () => saved && JSON.stringify(saved), setItem() {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    escape, unescape, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
  });
  const run = (text, filename) => vm.runInContext(text, context, { filename });
  for (const name of ['shared/ma-core.js', 'shared/permutest.js', 'shared/canonical-datasets.js', 'shared/hero-examples.js', 'hub/shared/url-state.js']) {
    run(read(name), name); Object.assign(context, window);
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  for (const [i, script] of scripts.entries()) {
    // Expose the existing parser for assertions, without changing its implementation.
    run(script.replace('const loaded = loadSaved();', 'window.__p08Parse = parseStudies; const loaded = loadSaved();'), `index-inline-${i}`);
  }
  for (const name of ['meta-regression/plus-engine.js', 'meta-regression/plus-ui.js']) {
    run(read(name), name); Object.assign(context, window);
  }
  function chooseBCG() {
    picker.value = 'bcg';
    // Old shared picker delegates to its mount; the dedicated picker binds directly.
    picker.dispatchEvent({ type: 'change' });
    elements.get('alm-hero-mount').dispatchEvent({ type: 'change', target: picker });
  }
  return { window, document, context, elements, chooseBCG, html,
    parse: () => window.__p08Parse(elements.get('f-data').value),
    setData(text) { elements.get('f-data').value = text; elements.get('f-data').dispatchEvent({ type: 'input' }); },
    capture() { return JSON.parse(JSON.stringify({ fit: window._almLastFitted(), hk: window._almLastHK(), studies: window._almLastStudies(), r2: window._almLastR2(), qe: window._almLastQE(), pi: window._almLastPI(), perm: window._almLastPerm(), table: elements.get('stats-wrap').innerHTML, svg: elements.get('svg-host').innerHTML })); },
  };
}
