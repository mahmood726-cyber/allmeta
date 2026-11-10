import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function render(rows, pooled)'));
assert.ok(appScript, 'exercise the actual application script');
const glossary = JSON.parse(read('hub/shared/glossary.json'));
const decode = text => text.replace(/&tau;/g, 'τ').replace(/&sup2;/g, '²');

// A deliberately small DOM double: parse the authored glossary elements, retain
// their tag names/attributes, and implement the selectors/events tooltips uses.
// This tests the real app/render/module code, not browser or screen-reader output.
function dom() {
  let document;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.attrs = new Map();
      this.children = [];
      this.listeners = new Map();
      this.style = {};
      this.parentNode = null;
      this._text = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
        remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
      };
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get tabIndex() { return this.attrs.has('tabindex') ? Number(this.getAttribute('tabindex')) : -1; }
    set tabIndex(value) { this.setAttribute('tabindex', value); }
    get isConnected() { return this === document.documentElement || !!this.parentNode?.isConnected; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    clear() {
      if (this.descendants().includes(document.activeElement)) document.activeElement.blur();
      for (const child of this.children) child.parentNode = null;
      this.children = [];
    }
    set textContent(value) { this.clear(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(value) {
      this.clear();
      this._html = String(value);
      this._text = '';
      for (const match of this._html.matchAll(/<([a-z][\w-]*)\b([^>]*\bdata-gloss="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi)) {
        const term = new Element(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) term.setAttribute(attr[1], attr[2]);
        term.textContent = decode(match[4]);
        this.appendChild(term);
      }
    }
    get innerHTML() { return this._html || ''; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.includes(' ')) {
          const [ancestor, child] = part.split(/\s+/);
          return this.matches(child) && !!this.parentNode?.matches(ancestor);
        }
        const withoutDescription = part.includes(':not([aria-describedby])');
        part = part.replace(':not([aria-describedby])', '');
        if (withoutDescription && this.attrs.has('aria-describedby')) return false;
        for (const attr of part.matchAll(/\[([\w-]+)\]/g)) if (!this.attrs.has(attr[1])) return false;
        part = part.replace(/\[[\w-]+\]/g, '');
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        return !part || this.tagName === part.toUpperCase();
      });
    }
    querySelectorAll(selector) { return this.descendants().filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ type, target: this }); }
    focus() {
      if (this.tabIndex < 0) return;
      document.activeElement?.blur();
      document.activeElement = this;
      this.dispatch('focus');
    }
    blur() { this.dispatch('blur'); if (document.activeElement === this) document.activeElement = document.body; }
    getBoundingClientRect() { return { bottom: 20, left: 10 }; }
  }
  document = new Element('document');
  document.documentElement = document.appendChild(new Element('html'));
  document.head = document.documentElement.appendChild(new Element('head'));
  document.body = document.documentElement.appendChild(new Element('body'));
  document.activeElement = document.body;
  document.createElement = tag => new Element(tag);
  document.getElementById = id => document.descendants().find(node => node.id === id) || null;
  return document;
}

function harness({ app = true } = {}) {
  const document = dom();
  const urlState = Object.assign(() => {}, { read: () => null, write: () => {} });
  const window = { scrollX: 0, scrollY: 0, alm: {
    csvUpload() {}, plotExport() {}, axisControls() {}, resultsExport() {},
    urlState, resetUndo: Object.assign(() => {}, { snapshot() {} }),
  } };
  let releaseFetch;
  const response = new Promise(resolve => { releaseFetch = resolve; });
  const requests = [];
  const context = vm.createContext({
    window, document, console,
    localStorage: { getItem: () => null, setItem() {} },
    fetch: url => { requests.push(url); return response; },
  });
  vm.runInContext(read('hub/shared/tooltips.js'), context, { filename: 'tooltips.js' });
  if (app) {
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const authored = document.body.appendChild(document.createElement('div'));
    authored.innerHTML = markup;
    for (const match of markup.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
      const element = document.body.appendChild(document.createElement(match[1]));
      element.id = match[2];
    }
    document.getElementById('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
    for (const id of ['trans', 'tau-est']) {
      const options = html.match(new RegExp('<select\\b[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)<\\/select>'))[1];
      document.getElementById(id).value = options.match(/<option value="([^"]+)" selected>/)[1];
    }
    vm.runInContext(read('shared/ma-core.js'), context, { filename: 'ma-core.js' });
    vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context, { filename: 'analysis-lifecycle.js' });
    vm.runInContext(appScript, context, { filename: 'proportion-ma/index.html' });
    assert.ok(window._almLastPropMA(), 'the real app completed its initial run');
  }
  return {
    document, window, requests,
    terms: () => document.querySelectorAll('[data-gloss]'),
    async ready() {
      releaseFetch({ ok: true, json: async () => glossary });
      // Drain the actual fetch/json/scan/refresh promise chain before asserting.
      await new Promise(resolve => setImmediate(resolve));
    },
    rerun() { document.getElementById('btn-run').dispatch('click'); },
  };
}

function checkHelp(h, terms = h.terms()) {
  const failures = [];
  for (const [index, term] of terms.entries()) {
    const label = `${index}: ${term.tagName}[data-gloss="${term.getAttribute('data-gloss')}"]`;
    const tip = h.document.getElementById(term.getAttribute('aria-describedby'));
    if (term.tabIndex !== 0) failures.push(`${label} is not keyboard focusable`);
    if (!tip || tip.getAttribute('role') !== 'tooltip') failures.push(`${label} has no ARIA tooltip`);
    const entry = glossary[term.textContent === 'I²' ? 'I2' : 'tau2'];
    if (tip?.textContent !== entry.short + ' — ' + entry.long) failures.push(`${label} has no glossary definition`);
    term.focus();
    if (h.document.activeElement !== term || !tip?.classList.contains('is-visible')) failures.push(`${label} does not show its definition on focus`);
    term.blur();
    if (tip?.classList.contains('is-visible')) failures.push(`${label} does not hide its definition on blur`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
}

test('P09-R3 plant: all three authored help terms expose keyboard and ARIA definitions after async loading', async () => {
  const h = harness();
  assert.deepEqual(h.requests, ['../hub/shared/glossary.json']);
  assert.equal(h.terms().length, 3);
  await h.ready();
  checkHelp(h);
});

test('P09-R3 plant: every authored help key resolves in the real glossary', async () => {
  const h = harness();
  await h.ready();
  assert.deepEqual(h.terms().filter(term => !glossary[term.getAttribute('data-gloss')])
    .map(term => term.getAttribute('data-gloss')), []);
});

test('P09-R3 plant: rerender wires replacement result terms and retains the estimator help focus and description', async () => {
  const h = harness();
  await h.ready();
  const [estimator, ...oldResults] = h.terms();
  const description = estimator.getAttribute('aria-describedby');
  estimator.focus();
  h.rerun();
  const [currentEstimator, ...newResults] = h.terms();
  assert.equal(newResults.length, 2);
  assert.ok(oldResults.every(term => !term.isConnected));
  assert.ok(newResults.every(term => !oldResults.includes(term)));
  assert.equal(currentEstimator, estimator);
  assert.equal(estimator.getAttribute('aria-describedby'), description);
  checkHelp(h, newResults);
  estimator.focus();
  h.rerun();
  assert.equal(h.document.activeElement, estimator, 'rerender must not steal focus from the persistent help term');
  checkHelp(h);
});

test('P09-R3 plant: a rerun before glossary fetch completes still receives definitions', async () => {
  const h = harness();
  h.rerun();
  await h.ready();
  assert.equal(h.terms().length, 3);
  checkHelp(h);
});

test('P09-R3 control: supported abbr terms receive definitions and focus handlers from the real module', () => {
  const h = harness({ app: false });
  h.document.body.innerHTML = '<abbr data-gloss="tau2">&tau;&sup2;</abbr><abbr data-gloss="I2">I&sup2;</abbr>';
  h.window.alm.tooltips({ glossary });
  assert.equal(h.terms().length, 2);
  checkHelp(h);
});

test('P09-R3 control: explicit rescan attaches new abbr terms without duplicating existing descriptions or focus handlers', () => {
  const h = harness({ app: false });
  h.document.body.innerHTML = '<abbr data-gloss="tau2">&tau;&sup2;</abbr>';
  h.window.alm.tooltips({ glossary });
  const first = h.terms()[0];
  const id = first.getAttribute('aria-describedby');
  const replacement = h.document.body.appendChild(h.document.createElement('div'));
  replacement.innerHTML = '<abbr data-gloss="I2">I&sup2;</abbr>';
  first.focus();
  h.window.alm.tooltips.rescan();
  h.window.alm.tooltips.rescan();
  assert.equal(h.document.activeElement, first);
  assert.equal(first.getAttribute('aria-describedby'), id);
  assert.equal(first.listeners.get('focus').length, 1);
  assert.equal(h.document.querySelectorAll('.alm-tooltip').length, 2);
  checkHelp(h);
});
