'use strict';
// Loads the page's own scripts (index.html order) in a Node vm context with a minimal simulated document.
// No statistics are computed here: every number comes from the page scripts.
// The only source change is ONE appended line inside the app.js closure that exposes the page's own `state`
// object and two of its functions for reading: window.__p61 = { state, fitModel, predictModel };
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIM_ANCHOR = '  init();\n})();';
const SHIM = "  window.__p61 = { state, fitModel, predictModel, residualTau2: typeof residualTau2 === 'function' ? residualTau2 : null };\n";
// CDN libraries replaced by inert stubs (drawing / docx export only; no engine code)
const STUB_SRC = new Set([
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/docx@7.1.0/build/index.js',
  // allmeta copies of the same vendored libraries and its DOM-only page helpers (no engine code)
  '../shared/vendor/chart-4.4.1.umd.min.js',
  '../shared/vendor/docx-7.1.0.js',
  '../hub/shared/a11y-landmarks.js',
  '../hub/shared/chart-export-auto.js'
]);

function scriptsOf(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = (m[1].match(/\bsrc\s*=\s*"([^"]+)"/i) || [])[1];
    if (src) out.push({ src, defer: /\bdefer\b/i.test(m[1]) }); else out.push({ code: m[2] });
  }
  return out;
}

// Universal no-op object: any property is a callable no-op returning another no-op (canvas contexts, charts).
function noop() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'measureText') return () => ({ width: 10 });
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; }
  });
  return p;
}

function attrDefaults(html) {
  // initial value / checked state of every element with an id, as the browser would parse them
  const d = new Map();
  const tagRe = /<(input|select|textarea|button|canvas|div|span|table|tbody|section|p|label|h\d|ul|li|a|form|output)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2];
    const id = (attrs.match(/\bid\s*=\s*"([^"]+)"/) || [])[1];
    if (!id) continue;
    const e = { tag: m[1].toLowerCase(), checked: /\schecked(\s|\/|$|=)/.test(attrs), value: (attrs.match(/\bvalue\s*=\s*"([^"]*)"/) || [])[1] };
    if (e.tag === 'select') {
      const end = html.indexOf('</select>', m.index);
      const body = html.slice(m.index, end);
      const opts = [...body.matchAll(/<option([^>]*)value\s*=\s*"([^"]*)"([^>]*)>/g)];
      const sel = opts.find(o => /\bselected\b/.test(o[1] + o[3]));
      e.value = sel ? sel[2] : (opts[0] ? opts[0][2] : '');
    }
    if (!d.has(id)) d.set(id, e);
  }
  return d;
}

function makeElement(tag, init) {
  const listeners = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: '', value: '', checked: false, disabled: false, hidden: false,
    innerHTML: '', textContent: '', innerText: '', className: '', style: {}, dataset: {}, children: [], childNodes: [],
    options: [], files: [], width: 800, height: 400, clientWidth: 800, clientHeight: 400, offsetWidth: 800, offsetHeight: 400,
    parentNode: null, parentElement: null, max: '', min: '', title: '', href: '', src: '', type: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _listeners: listeners,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
    prepend() {}, append() {}, remove() {}, replaceChildren() {}, insertAdjacentHTML() {}, after() {}, before() {},
    focus() {}, blur() {}, click() { (listeners.click || []).forEach(fn => fn({ target: el, preventDefault() {} })); },
    scrollIntoView() {}, select() {}, cloneNode() { return makeElement(tag); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }; },
    getContext() { return noop(); }, toDataURL() { return 'data:,'; }, toBlob(cb) { if (cb) cb(null); }
  };
  if (init) Object.assign(el, init);
  return el;
}

function makeDocument(html) {
  const defaults = attrDefaults(html);
  const els = new Map();
  const body = makeElement('body');
  const doc = {
    readyState: 'complete', body, head: makeElement('head'), documentElement: makeElement('html'),
    getElementById(id) {
      if (!defaults.has(id)) return null;
      if (!els.has(id)) {
        const d = defaults.get(id);
        els.set(id, makeElement(d.tag, { id, value: d.value === undefined ? '' : d.value, checked: d.checked }));
      }
      return els.get(id);
    },
    querySelectorAll() { return []; }, querySelector() { return null; }, getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    addEventListener() {}, removeEventListener() {},
    createElement(t) { return makeElement(t); }, createElementNS(ns, t) { return makeElement(t); },
    createTextNode() { return makeElement('#text'); }, createDocumentFragment() { return makeElement('#fragment'); },
    execCommand() { return true; }, title: ''
  };
  return doc;
}

async function loadPage(pageDir) {
  const pageFile = path.join(pageDir, 'index.html');
  const html = fs.readFileSync(pageFile, 'utf8');
  const document = makeDocument(html);
  const consoleErrors = [];
  const quietConsole = {
    log() {}, info() {}, debug() {}, warn() {}, table() {}, group() {}, groupEnd() {}, groupCollapsed() {}, time() {}, timeEnd() {},
    error(...a) { consoleErrors.push(a.map(String).join(' ')); }
  };
  const sandbox = {
    document, console: quietConsole, Math, JSON, Number, String, Array, Object, Set, Map, WeakMap, Date, Promise, Symbol, Error,
    TypeError, RangeError, Proxy, Reflect, Uint8Array, Uint32Array, Float64Array, Float32Array, Int32Array, ArrayBuffer, DataView,
    BigInt, Intl, RegExp, isFinite, isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, escape, unescape,
    WebAssembly, TextEncoder, TextDecoder, structuredClone,
    atob: (s) => Buffer.from(s, 'base64').toString('latin1'), btoa: (s) => Buffer.from(s, 'latin1').toString('base64'),
    alert() {}, confirm() { return true; }, prompt() { return null; },
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {}, queueMicrotask,
    fetch: () => Promise.reject(new Error('no network in harness')),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: { userAgent: 'node', language: 'en', clipboard: { writeText: () => Promise.resolve() }, hardwareConcurrency: 1 },
    location: { href: 'file://' + pageFile, hash: '', search: '', pathname: '/index.html', origin: 'null' },
    history: { replaceState() {}, pushState() {} },
    performance: { now: () => 0 }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    Blob: function () {}, URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} }, FileReader: function () {},
    Worker: undefined, Image: function () {}, MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    CustomEvent: function () {}, Event: function () {}, HTMLElement: function () {}, HTMLCanvasElement: function () {},
    Chart: function () { return noop(); }, docx: noop(), Plotly: noop(), innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, open() { return null; }, print() {}
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  const loaded = [];
  const deferred = [];
  for (const s of scriptsOf(html)) {
    if (s.src && STUB_SRC.has(s.src)) { loaded.push('STUB ' + s.src); continue; }
    if (s.src && s.defer) { deferred.push(s); continue; }
    runScript(s);
  }
  for (const s of deferred) runScript(s);
  function runScript(s) {
    if (s.src) {
      const f = path.resolve(pageDir, s.src);
      if (!fs.existsSync(f)) throw new Error('script not found: ' + f);
      let code = fs.readFileSync(f, 'utf8');
      if (path.basename(f) === 'app.js') {
        code = code.replace(/\r\n/g, '\n'); // a CRLF checkout (core.autocrlf) must not hide the anchor
        const n = code.split(SHIM_ANCHOR).length - 1;
        if (n !== 1) throw new Error('shim anchor found ' + n + ' times in app.js');
        code = code.replace(SHIM_ANCHOR, SHIM + SHIM_ANCHOR);
      }
      vm.runInContext(code, ctx, { filename: f });
      loaded.push(s.src);
    } else {
      vm.runInContext(s.code, ctx, { filename: pageFile + '#inline' });
      loaded.push('inline');
    }
  }
  // init() is async (WASM instantiation); wait for it to finish
  for (let i = 0; i < 20000 && !(sandbox.__p61 && sandbox.__p61.state.wasm); i++) await new Promise(r => (i < 200 ? setImmediate(r) : setTimeout(r, 1)));
  if (!sandbox.__p61 || !sandbox.__p61.state.wasm) throw new Error('page init did not complete (WASM not ready)');
  return { ctx: sandbox, document, consoleErrors, loaded };
}

module.exports = { loadPage };
