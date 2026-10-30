import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable(text)'));
assert.ok(main, 'Load the actual application script');

// Minimal DOM for the real inline engine, renderer and analysis lifecycle.
// This does not emulate layout, accessibility or browser event propagation.
function element(id, value = '') {
  let markup = '';
  const attrs = new Map();
  const listeners = new Map();
  return {
    id, value, hidden: true, style: {},
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = String(value); },
    get textContent() { return markup.replace(/<[^>]*>/g, ''); },
    set textContent(value) { markup = String(value); },
    get innerText() { return this.textContent; },
    get attributes() { return [...attrs].map(([name, value]) => ({ name, value })); },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    removeAttribute(name) { attrs.delete(name); },
    addEventListener(type, fn) { listeners.set(type, fn); },
    fire(type) { listeners.get(type)?.({ target: this }); },
    matches(selector) { return selector.split(',').some(s => s.trim() === '#' + id); },
    closest() { return null; }
  };
}

export function harness() {
  const ids = ['src', 'trans', 'tau-est', 'btn-run', 'analysis-status', 'analysis-stale',
    'k-warn', 'res-body', 'het', 'forest', 'alm-validate'];
  const els = Object.fromEntries(ids.map(id => [id, element(id)]));
  els.src.value = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  els.trans.value = 'logit';
  els['tau-est'].value = 'PM';
  const urlWrites = [];
  const urlState = Object.assign(() => {}, {
    read: () => ({}), write: state => urlWrites.push(state)
  });
  const document = {
    getElementById: id => els[id] || null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '#src, #trans, #tau-est') return [els.src, els.trans, els['tau-est']];
      if (selector === '#het') return [els.het];
      const [source, pattern] = selector === '#res-body tr' ? [els['res-body'], /<tr\b[^>]*>[\s\S]*?<\/tr>/g]
        : selector === '.pooled-row' ? [els['res-body'], /<tr class="pooled-row">[\s\S]*?<\/tr>/g]
        : selector === '#forest polygon' ? [els.forest, /<polygon\b[^>]*\/>/g] : [];
      assert.ok(source, 'Unexpected selector: ' + selector);
      return [...source.innerHTML.matchAll(pattern)].map(([markup]) => {
        const el = element(''); el.innerHTML = markup; return el;
      });
    }
  };
  const window = {
    alm: {
      csvUpload() {}, plotExport() {}, axisControls() {}, resultsExport() {}, tooltips() {},
      resetUndo: Object.assign(() => {}, { snapshot() {} }), urlState
    },
    MaStudies: {}
  };
  const context = vm.createContext({ window, document, console, setTimeout });
  const evaluate = path => vm.runInContext(read(path), context, { filename: path });
  evaluate('shared/ma-core.js');
  let poolCalls = 0;
  const pool = window.AlmMaCore.pool;
  window.AlmMaCore.pool = function (...args) { poolCalls++; return pool.apply(this, args); };
  evaluate('hub/shared/analysis-lifecycle.js');
  vm.runInContext(main, context, { filename: 'proportion-ma/index.html' });
  return {
    els, window, context, evaluate, urlWrites,
    get poolCalls() { return poolCalls; },
    parse: text => window.__almPropValidation.parse(text),
    run(text, transform = 'logit', method = 'PM') {
      els.src.value = text; els.trans.value = transform; els['tau-est'].value = method;
      els['btn-run'].fire('click');
    },
    result: () => window._almLastPropMA(),
    snapshot: () => window.__almPropValidation.snapshot()
  };
}
