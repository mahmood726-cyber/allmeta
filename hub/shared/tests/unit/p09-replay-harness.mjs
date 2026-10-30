import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const html = read('proportion-ma/index.html');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function drawForest('));
// The historical runner supplies hash-verified pre-repair sources before loading
// the same tests. Normal unit-gate runs always use the files in this checkout.
export const sources = { page: main, adapter: read('proportion-ma/validate/adapter.js') };
export const sample = '1,100,A\n10,100,B\n80,100,C';
const plain = value => JSON.parse(JSON.stringify(value));
const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Only the DOM surface used by the production page, axis controls and replay.
// Rendering, fitting, corpus comparisons and replay restoration are real code.
class Element {
  constructor() {
    this.value = ''; this.checked = false; this.dataset = {}; this.attrs = new Map();
    this.listeners = {}; this.children = []; this._html = '';
    this.style = new Proxy({}, {
      get: (_, key) => this.attrs.get('style')?.match(new RegExp(`${key}:\\s*([^;]+)`))?.[1] || '',
      set: (_, key, value) => { this.attrs.set('style', `${key}: ${value};`); return true; }
    });
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  removeAttribute(key) { this.attrs.delete(key); }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(value) { if (value) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  get textContent() { return this._html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  set textContent(value) { this.innerHTML = escape(value); }
  get innerText() { return this._html.replace(/<[^>]*>/g, ' '); }
  get innerHTML() { return this._html; }
  set innerHTML(value) {
    this._html = value; this.children = [];
    if (value === '<div class="alm-axis"></div>') this.children.push(new Element());
    for (const match of value.matchAll(/<input\b([^>]*)>/g)) {
      const input = new Element(), attrs = match[1];
      input.dataset.axis = attrs.match(/data-axis="([^"]*)"/)?.[1];
      input.dataset.edge = attrs.match(/data-edge="([^"]*)"/)?.[1];
      input.value = attrs.match(/value="([^"]*)"/)?.[1] ?? '';
      input.checked = /\bchecked\b/.test(attrs);
      this.children.push(input);
    }
  }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, listener) { (this.listeners[event] ??= []).push(listener); }
  dispatch(event) { for (const listener of this.listeners[event] ?? []) listener({ target: this }); }
  closest() { return null; } // There are no extras in this primary-adapter harness.
  querySelectorAll(selector) {
    assert.equal(selector, 'input');
    return this.children.filter(child => child.dataset.edge);
  }
}

export function harness({ source = sample, transform = 'logit', pageSource = sources.page, adapterSource = sources.adapter } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.get('src').value = source; elements.get('trans').value = transform; elements.get('tau-est').value = 'PM';
  elements.get('forest-axis-error').setAttribute('role', 'status');
  elements.get('forest-axis-error').setAttribute('aria-live', 'polite');
  elements.get('forest-axis-error').hidden = true;
  const matches = (id, pattern) => [...elements.get(id).innerHTML.matchAll(pattern)].map(match => {
    const el = new Element(); el.innerHTML = match[0]; return el;
  });
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelector: selector => elements.get(selector.slice(1)) ?? null,
    querySelectorAll(selector) {
      if (selector === '#res-body tr') return matches('res-body', /<tr\b[^>]*>[\s\S]*?<\/tr>/g);
      if (selector === '#forest polygon') return matches('forest', /<polygon\b[^>]*>/g);
      if (selector === '.pooled-row') return matches('res-body', /<tr class="pooled-row">[\s\S]*?<\/tr>/g);
      if (selector === '#het') return [elements.get('het')];
      throw new Error('Unexpected selector: ' + selector);
    },
    createElement: () => new Element(), head: new Element()
  };
  let urlWrites = 0;
  const urlState = Object.assign(() => {}, { read: () => ({}), write() { urlWrites++; } });
  const context = vm.createContext({ document, console, setTimeout }); context.window = context;
  // Cache the VM's own intrinsics in lexical bindings. Repeated VM global-proxy
  // lookups dominate the real Clopper-Pearson loops in a full corpus replay.
  // No functions, calculations, references or comparisons are substituted.
  vm.runInContext('const Math = globalThis.Math; const Number = globalThis.Number;', context);
  context.alm = {
    csvUpload() {}, plotExport() {}, resultsExport() {}, resetUndo() {}, tooltips() {},
    urlState, analysisLifecycle: run => run
  };
  for (const file of ['shared/ma-core.js', 'hub/shared/axis-controls.js', 'shared/alm-validate.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  // The widget's mounting UI is irrelevant here; keep its actual comparator.
  context.AlmValidate.mount = () => ({});
  vm.runInContext(pageSource, context, { filename: 'proportion-ma/index.html' });
  vm.runInContext(adapterSource, context, { filename: 'proportion-ma/validate/adapter.js' });
  const controls = elements.get('alm-axis-mount').firstChild.children[0].querySelectorAll('input');
  const change = (edge, value) => {
    const input = controls.find(input => input.dataset.edge === edge);
    assert.ok(input, `real axis control ${edge} exists`);
    if (edge === 'log') input.checked = value;
    else input.value = value === null ? '' : String(value);
    input.dispatch('change');
  };
  const notice = () => ({ html: elements.get('forest-axis-error').innerHTML, attrs: [...elements.get('forest-axis-error').attrs].sort() });
  return {
    elements, controls, context, change, notice,
    bounds(min, max) { change('min', min); change('max', max); },
    run: () => context.__almPropValidation.run(),
    get svg() { return elements.get('forest').innerHTML; },
    state() {
      return {
        inputs: ['src', 'trans', 'tau-est'].map(id => elements.get(id).value),
        controls: controls.map(e => [e.value, e.checked]),
        dom: ['res-body', 'het', 'forest', 'k-warn', 'forest-axis-error'].map(id => {
          const e = elements.get(id); return [id, e.innerHTML, [...e.attrs].sort()];
        }),
        result: plain(context._almLastPropMA()), snapshot: plain(context.__almPropValidation.snapshot()), urlWrites
      };
    },
    replay: (loaded, progress = () => {}) => context.AlmProportionValidationAdapter.corpus.run(loaded, progress)
  };
}

export function loadCorpus(h) {
  return Object.fromEntries(h.context.AlmProportionValidationAdapter.corpus.files.map(file => {
    // Git/CI uses LF; neither recorded pins nor numerical references are changed.
    const bytes = Buffer.from(read('proportion-ma/' + file.path));
    assert.equal(bytes.length, file.bytes, file.path + ' LF length');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path + ' LF SHA-256');
    return [file.path, JSON.parse(bytes)];
  }));
}
