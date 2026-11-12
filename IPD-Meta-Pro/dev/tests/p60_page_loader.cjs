'use strict';
// Loads the web page's own <script> blocks (copy of the P60 validation-archive loader, harness/page.cjs).
// permissive simulated DOM. No statistics are computed here: every number comes from the page.
const fs = require('node:fs');
const vm = require('node:vm');

// Split the HTML into <script> blocks (the block list and per-block status are recorded).
function scriptsOf(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    out.push({ src, type, code: m[2], offset: m.index });
  }
  return out;
}

// A stub that absorbs any DOM access: property reads return further stubs, calls return stubs.
function stub(name) {
  const store = Object.create(null);
  const fn = function () { return stub(name + '()'); };
  return new Proxy(fn, {
    get(t, p) {
      if (p in store) return store[p];
      if (p === Symbol.toPrimitive) return () => '';
      if (p === Symbol.iterator) return function* () {};
      if (p === 'then') return undefined;
      if (p === 'length') return 0;
      if (p === 'value' || p === 'innerHTML' || p === 'textContent' || p === 'innerText') return '';
      if (p === 'checked' || p === 'disabled' || p === 'hidden') return false;
      if (p === 'style' || p === 'dataset' || p === 'classList') return (store[p] = stub(name + '.' + String(p)));
      if (p === 'querySelectorAll' || p === 'getElementsByTagName' || p === 'getElementsByClassName') return () => [];
      if (p === 'children' || p === 'childNodes' || p === 'options') return [];
      if (['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight', 'width', 'height'].includes(p)) return 800;
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
      if (p === 'toString') return () => '';
      return stub(name + '.' + String(p));
    },
    set(t, p, v) { store[p] = v; return true; },
    has(t, p) { return p in store; },
    apply() { return stub(name + '()'); },
    construct() { return stub('new ' + name); }
  });
}

// Default form state as written in the page's HTML (value=, checked, selected option), so that
// form fields the user did not touch hold the same values they hold in a browser.
function formDefaults(html) {
  const out = new Map();
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] !== undefined ? m[2] : m[3]) : undefined; };
  for (const m of body.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0]; const id = attr(tag, 'id'); if (!id) continue;
    const type = (attr(tag, 'type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') out.set(id, { checked: /\schecked(\s|=|>|\/)/i.test(tag), value: attr(tag, 'value') || 'on' });
    else out.set(id, { value: attr(tag, 'value') || '' });
  }
  for (const m of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const id = attr('<x ' + m[1] + '>', 'id'); if (!id) continue;
    const opts = [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
    if (!opts.length) { out.set(id, { value: '' }); continue; }
    const sel = opts.find(o => /\sselected(\s|=|$)/i.test(o[1])) || opts[0];
    const v = attr('<x ' + sel[1] + '>', 'value');
    out.set(id, { value: v !== undefined ? v : sel[2].trim() });
  }
  for (const m of body.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const id = attr('<x ' + m[1] + '>', 'id'); if (id) out.set(id, { value: m[2] });
  }
  return out;
}

function makeDocument(html) {
  const els = new Map();
  const defaults = formDefaults(html);
  // Only ids written in the page's static HTML exist (as in a browser before any dynamic rendering);
  // other ids return null, which is what document.getElementById returns in the browser.
  const staticIds = new Set([...html.replace(/<script[\s\S]*?<\/script>/gi, '').matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  const el = (id) => {
    if (!staticIds.has(id)) return null;
    if (!els.has(id)) {
      const e = stub('#' + id);
      const d = defaults.get(id);
      if (d) { e.value = d.value; if ('checked' in d) e.checked = d.checked; }
      els.set(id, e);
    }
    return els.get(id);
  };
  const doc = stub('document');
  const base = {
    readyState: 'complete',
    getElementById: el,
    querySelector: (sel) => stub('qs:' + sel),
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    createElement: (t) => stub('<' + t + '>'),
    createElementNS: (ns, t) => stub('<' + t + '>'),
    createTextNode: () => stub('text'),
    addEventListener() {}, removeEventListener() {},
    body: stub('body'), head: stub('head'), documentElement: stub('html'),
    cookie: ''
  };
  for (const [k, v] of Object.entries(base)) doc[k] = v;
  return { doc, els };
}

function loadPage(pageFile, opts = {}) {
  const html = fs.readFileSync(pageFile, 'utf8');
  const { doc: document, els } = makeDocument(html);
  const log = [];
  const noop = () => {};
  const quiet = { log: noop, info: noop, debug: noop, warn: noop, group: noop, groupEnd: noop, groupCollapsed: noop, table: noop, time: noop, timeEnd: noop, assert: noop, trace: noop,
    error: (...a) => log.push('console.error ' + a.map(String).join(' ').slice(0, 200)) };
  const timers = [];
  const sandbox = {
    document, console: opts.verbose ? console : quiet,
    alert: (m) => log.push('alert ' + String(m).slice(0, 200)),
    confirm: () => true, prompt: () => null,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {}, key() { return null; }, length: 0 },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: { userAgent: 'node', language: 'en-GB', clipboard: stub('clipboard'), hardwareConcurrency: 1 },
    location: { href: 'file:///ipd-meta-pro.html', protocol: 'file:', search: '', hash: '', pathname: '/ipd-meta-pro.html', origin: 'null', reload: noop },
    history: stub('history'),
    // Deferred callbacks are queued and never run implicitly; the harness calls engine functions directly.
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: noop,
    setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, requestIdleCallback: () => 0,
    performance: { now: () => 0, mark: noop, measure: noop },
    matchMedia: () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop }),
    getComputedStyle: () => stub('style'),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
    MutationObserver: function () { return { observe: noop, disconnect: noop }; },
    ResizeObserver: function () { return { observe: noop, disconnect: noop }; },
    IntersectionObserver: function () { return { observe: noop, disconnect: noop }; },
    CustomEvent: function () {}, Event: function () {}, Image: function () { return stub('img'); },
    TextEncoder, TextDecoder, structuredClone,
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = 0; return a; }, randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1, scrollTo: noop, open: () => null, print: noop
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
  const ctx = vm.createContext(sandbox);
  const blocks = scriptsOf(html);
  const loaded = [];
  blocks.forEach((b, i) => {
    if (b.src) { loaded.push({ i, status: 'external-skipped', src: b.src }); return; }
    if (b.type && !/javascript|module/i.test(b.type)) { loaded.push({ i, status: 'non-js-skipped', type: b.type }); return; }
    try {
      vm.runInContext(b.code, ctx, { filename: 'page#script' + i });
      loaded.push({ i, status: 'ok', bytes: b.code.length });
    } catch (e) {
      loaded.push({ i, status: 'threw', bytes: b.code.length, error: String((e && e.message) || e).slice(0, 200) });
    }
  });
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, run, sandbox, document, els, log, loaded, timers };
}

module.exports = { loadPage, scriptsOf };
