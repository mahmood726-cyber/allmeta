// Dependency-free DOM double for Node execution, not browser/layout evidence.
// Runs the actual page engine, bus reader, plus UI and report exporter. Only
// DOM events, observed writes, timers and download sinks are simulated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('nma-inconsistency/index.html');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const plain = s => s.replace(/<[^>]*>/g, '');

export function harness() {
  const elements = new Map(), observers = [], timers = new Map(), downloads = [], storage = new Map();
  let now = 0, nextTimer = 0;
  function changed(target) {
    for (const observer of observers) if (observer.target === target && !observer.queued) {
      observer.queued = true;
      queueMicrotask(() => { observer.queued = false; observer.callback(); });
    }
  }
  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase(); this.children = []; this.listeners = new Map();
      this.style = {}; this.dataset = {}; this.value = ''; this.content = '';
      this.classList = { contains: name => (this.className || '').split(/\s+/).includes(name) };
    }
    get innerHTML() { return this.content; }
    set innerHTML(value) {
      this.content = String(value); this.children = [];
      for (const m of this.content.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>/g)) {
        const button = new Element('button'); button.dataset.action = m[1]; this.append(button);
      }
      changed(this);
    }
    get textContent() { return plain(this.content); }
    set textContent(value) { this.content = String(value); this.children = []; changed(this); }
    setAttribute(key, value) { this[key] = String(value); }
    append(...children) {
      for (const child of children) {
        child.parentNode = this; this.children.push(child);
        if (child.id) elements.set(child.id, child);
      }
    }
    appendChild(child) { this.append(child); return child; }
    insertBefore(child) { this.append(child); }
    insertAdjacentElement(position, child) { this.parentNode.append(child); }
    removeChild(child) { this.children = this.children.filter(x => x !== child); }
    remove() { this.parentNode?.removeChild(this); }
    querySelector(selector) {
      const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      return action ? this.children.find(x => x.dataset.action === action) || null : null;
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatchEvent(event) {
      event.target ||= this;
      for (const listener of this.listeners.get(event.type) || []) listener(event);
      if (event.bubbles) this.parentNode?.dispatchEvent(event);
    }
    click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
    closest(selector) { return selector === 'button,rect' && /BUTTON|RECT/.test(this.tagName) ? this : null; }
    focus() {}
  }
  const document = {
    readyState: 'complete', body: new Element('body'), head: new Element('head'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => new Element(tag),
    querySelector: selector => elements.get(selector.replace(/^#/, '')) || null,
  };
  for (const m of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"/g)) {
    const element = new Element(m[1]); element.id = m[2]; document.body.append(element);
  }
  for (const selector of ['h1', 'header p', 'footer', 'main']) {
    const tag = selector === 'header p' ? 'p' : selector;
    const element = new Element(tag);
    element.textContent = plain(html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))[1]);
    elements.set(selector, element); document.body.append(element);
  }
  elements.get('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  elements.get('f-model').value = 'FE';
  const c = {
    document, console, Blob,
    Event: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { this.target = target; observers.push(this); }
    },
    setTimeout(fn, ms = 0) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
  };
  c.window = c; vm.createContext(c);
  function execute(code, filename) { vm.runInContext(code, c, { filename, timeout: 10000 }); }
  function executeInline(marker) {
    const matches = inline.filter(code => code.includes(marker));
    assert.equal(matches.length, 1, `exactly one inline script for ${marker}`);
    execute(matches[0], `page-inline:${marker}`);
  }
  execute(read('shared/ma-comparisons-v1.js'), 'ma-comparisons-v1.js');
  executeInline('function refuse(reason)');
  for (const file of ['plus-core.js', 'plus-ui.js']) execute(read('nma-inconsistency/' + file), file);
  execute(read('hub/shared/results-export.js'), 'results-export.js');
  executeInline('basename:"nma-inconsistency"');
  executeInline('function busRefuse(why)');
  async function advance(ms) {
    const end = now + ms;
    await Promise.resolve();
    for (;;) {
      const item = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end);
      if (!item) break;
      const [id, timer] = item; timers.delete(id); now = timer.at; timer.fn();
      await Promise.resolve();
    }
    now = end;
  }
  return { c, document, downloads, advance };
}
