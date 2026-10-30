// Small DOM sink for the actual page renderer and validation adapter. No layout,
// accessibility-tree, native-download or browser claims; no third-party packages.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) =>
  ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[key]);
const voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
class Element {
  constructor(tag, attrs = {}) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = attrs;
    this.childNodes = []; this.disabled = false; this.readOnly = false;
    this.value = attrs.value || ''; this.dataset = {}; this.style = {};
  }
  get id() { return this.attrs.id || ''; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) { this.childNodes = [{ nodeType: 3, textContent: String(value), parentNode: this }]; }
  get innerHTML() { return this.markup || ''; }
  set innerHTML(value) { this.markup = value; this.childNodes = parse(value).childNodes; this.childNodes.forEach(n => { n.parentNode = this; }); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener() {}
  matches(selector) {
    return selector.split(',').some(part => {
      let s = part.trim();
      const tag = s.match(/^[\w-]+/);
      if (tag && tag[0].toUpperCase() !== this.tagName) return false;
      if (tag) s = s.slice(tag[0].length);
      for (const m of s.matchAll(/([#.])([\w-]+)|\[([\w-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)) {
        if (m[1] === '#' && this.id !== m[2]) return false;
        if (m[1] === '.' && !(this.attrs.class || '').split(/\s+/).includes(m[2])) return false;
        if (m[3] && (!this.hasAttribute(m[3]) || (m[4] !== undefined && this.getAttribute(m[3]) !== m[4]))) return false;
      }
      return true;
    });
  }
  closest(selector) { for (let el = this; el; el = el.parentNode) if (el.matches(selector)) return el; return null; }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/), last = parts.pop(), found = [];
    const visit = parent => { for (const el of parent.children) {
      if (el.matches(last) && (!parts.length || el.parentNode?.closest(parts.join(' ')))) found.push(el);
      visit(el);
    } };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  appendChild(el) {
    if (el.parentNode) el.parentNode.childNodes = el.parentNode.childNodes.filter(n => n !== el);
    el.parentNode = this; this.childNodes.push(el); return el;
  }
  insertBefore(el, before) { el.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(before), 0, el); }
  replaceChildren(...nodes) { this.childNodes = nodes; nodes.forEach(n => { n.parentNode = this; }); }
}
function parse(markup) {
  const root = new Element('root'), stack = [root];
  // Script/style contents are not DOM markup and are excluded by pageText anyway.
  const source = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>').replace(/<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, '');
  for (const token of source.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)[1];
      const attrs = Object.fromEntries([...token.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
        .map(m => [m[1], decode(m[2] ?? m[3] ?? m[4] ?? '')]));
      const el = new Element(tag, attrs); stack.at(-1).appendChild(el);
      if (!voids.has(el.tagName) && !token.endsWith('/>')) stack.push(el);
    } else stack.at(-1).childNodes.push({ nodeType: 3, textContent: decode(token), parentNode: stack.at(-1) });
  }
  return root;
}

export function setup({ adapterSource = read('correlation-ma/validate/adapter.js') } = {}) {
  const html = read('correlation-ma/index.html'), document = parse(html);
  document.body = document.querySelector('body'); document.head = document.querySelector('head');
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag); document.readyState = 'complete';
  document.getElementById('f-method').value = 'REML';
  const window = {}, context = vm.createContext({ window, document, matchMedia: () => ({ matches: false }),
    setTimeout: fn => { fn(); return 0; }, clearTimeout, ArrayBuffer, Uint8Array });
  const run = path => vm.runInContext(read(path), context, { filename: path });
  run('shared/ma-core.js'); run('hub/shared/results-export.js');
  vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('var EXAMPLE'))[1], context);
  run('hub/shared/a11y-landmarks.js');
  // Export UI shell only. Existing browser specs exercise real chart exporters.
  window.alm.chartExportAuto = { scan() {
    const host = document.getElementById('forest-host');
    if (!host.querySelector('svg') || host.querySelector('.alm-xbar')) return;
    const bar = new Element('div', { class: 'alm-xbar' });
    bar.innerHTML = '\u2b07' + ['SVG', 'PNG', 'JPG', 'PDF'].map(s => `<button aria-label="Download chart as ${s}">${s}</button>`).join('');
    host.insertBefore(bar, host.childNodes[0]);
  } };
  const AlmValidate = {
    async verify(bytes, hash, path) {
      assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'), hash, 'SHA-256 mismatch: ' + path);
      return JSON.parse(Buffer.from(bytes).toString('utf8'));
    },
    compare(a, b, kind, tol) {
      const diff = kind === 'exact' ? Number(a !== b) :
        (a === b ? 0 : Math.abs(a - b) / (kind === 'rel' ? Math.max(1, Math.abs(b)) : 1));
      return { pass: Number.isFinite(diff) && diff <= tol, diff };
    },
  };
  context.AlmValidate = AlmValidate;
  run('correlation-ma/validate/pins.js');
  // Defer widget mounting; exercise the real adapter API directly.
  document.readyState = 'loading';
  vm.runInContext(adapterSource, context, { filename: 'correlation-ma/validate/adapter.js' });
  const adapter = window.AlmCorrValidationAdapter;
  const files = Object.fromEntries(window.AlmCorrValidationPins.files.map(f =>
    [f.path, Buffer.from(read('correlation-ma/' + f.path).replace(/\r\n/g, '\n'))]));
  return { window, document, adapter, files,
    run(text, method = 'REML') {
      document.getElementById('f-data').value = text; document.getElementById('f-method').value = method;
      window.__almCorrValidationRun();
    },
  };
}
