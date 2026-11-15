// page-vm.mjs - run a shipped page's inline <script> in a node:vm context with a
// recording DOM stub, so a unit test can drive the real page code (not a copy of it)
// and read back what it rendered (innerHTML / textContent of each element by id).
//
// Every element is a plain recording object; anything the page calls that the stub
// does not model (window.alm.*, chart/export modules, ...) is absorbed by a sink.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../../../../', import.meta.url);

const sink = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : (typeof k === 'symbol' ? undefined : sink)),
  apply: () => sink,
  construct: () => sink,
});

function element(id) {
  const listeners = {};
  const store = {
    id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
    style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, removeEventListener() {},
    __fire(type) { (listeners[type] || []).forEach(fn => fn({ type, target: store, preventDefault() {} })); },
    setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, appendChild(c) { return c; }, insertBefore(c) { return c; }, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, click() {}, dispatchEvent() { return true; },
  };
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : sink)),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// Load `page` (path from the repo root), run each listed shared script (repo-root
// paths) and then every inline script for which `pick(src)` is true. `storage` seeds
// localStorage before any script runs.
export function loadPage(page, { shared = [], pick = () => true, storage = {} } = {}) {
  const els = new Map();
  const byId = id => { if (!els.has(id)) els.set(id, element(id)); return els.get(id); };
  const store = new Map(Object.entries(storage));
  const c = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { userAgent: 'node' }, location: { href: 'http://localhost/', search: '', hash: '', pathname: '/' },
    history: { replaceState() {}, pushState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    CustomEvent: function () {}, Event: function () {},
    URL, URLSearchParams, Blob: function () {},
    fetch: () => Promise.reject(new Error('no network in unit tests')),
  };
  c.document = {
    getElementById: byId,
    querySelector: sel => byId('qs:' + sel), querySelectorAll: () => [],
    createElement: tag => element('new:' + tag), createElementNS: (ns, tag) => element('new:' + tag),
    createTextNode: () => element('text'),
    body: element('body'), head: element('head'), documentElement: element('html'),
    readyState: 'complete', addEventListener() {}, removeEventListener() {},
  };
  c.window = c; c.self = c; c.globalThis = c;
  c.alm = sink;
  vm.createContext(c);
  for (const f of shared) vm.runInContext(readFileSync(new URL(f, ROOT), 'utf8'), c, { filename: f });
  const html = readFileSync(new URL(page, ROOT), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(pick);
  if (!scripts.length) throw Error('no inline script selected in ' + page);
  for (const s of scripts) vm.runInContext(s, c, { filename: page });
  // fire(id, type): run the listeners the page attached to that element (e.g. a button click).
  return { ctx: c, el: byId, html, fire: (id, type = 'click') => byId(id).__fire(type) };
}

// innerHTML -> visible text (tags stripped, entities for the few the pages use decoded).
export function text(h) {
  return String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
