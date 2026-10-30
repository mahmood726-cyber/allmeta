import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8');
const engine = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable(text)'));
assert.ok(engine, 'Exercise the actual app script, including initialization and rendering');

// Minimal DOM and shared-widget mounts; parsing, pooling, rendering, and the
// analysis lifecycle execute the production code. No browser or numerical mocks.
export function app() {
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => {
    const listeners = new Map();
    return [id, {
      id, value: '', innerHTML: '', textContent: '', hidden: true, style: {},
      setAttribute(name, value) { this[name] = value; },
      addEventListener(type, fn) { listeners.set(type, fn); },
      dispatch(type) { listeners.get(type)?.({ target: this }); },
    }];
  }));
  elements.src.value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  elements.trans.value = 'logit';
  elements['tau-est'].value = 'PM';
  const mounts = {};
  const urlState = Object.assign(() => {}, { read: () => null, write() {} });
  const resetUndo = Object.assign(() => {}, { snapshot() {} });
  const window = { MaStudies: {}, alm: { urlState, resetUndo, tooltips() {} } };
  for (const name of ['csvUpload', 'plotExport', 'axisControls', 'resultsExport']) {
    window.alm[name] = options => { mounts[name] = options; };
  }
  const context = vm.createContext({ window, document: {
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector.split(',').map(s => elements[s.trim().slice(1)]),
    addEventListener() {},
  } });
  for (const path of ['shared/ma-core.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  vm.runInContext(engine, context, { filename: 'proportion-ma/index.html' });
  return {
    elements, window, mounts,
    parse: text => window.__almPropValidation.parse(text),
    results: () => window._almLastPropMA(),
    snapshot: () => window.__almPropValidation.snapshot(),
    run(text) {
      elements.src.value = text;
      elements['btn-run'].dispatch('click');
    },
  };
}

export const valid = '12,150,A\n8,90,B\n20,220,C';
export const plain = value => JSON.parse(JSON.stringify(value));
