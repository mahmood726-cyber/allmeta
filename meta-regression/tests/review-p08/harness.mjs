import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function fitPM(studies)'));
const adapter = scripts.find(s => s.includes('window.__almResults = function'));
assert.ok(engine && adapter, 'load the actual inline engine and results adapter');

export function loadApp() {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', checked: false,
      classList: { add() {}, remove() {} },
    });
    return elements.get(id);
  } };
  const window = { alm: { analysisLifecycle: fn => fn } };
  const context = vm.createContext({ window, document });
  vm.runInContext(readFileSync(new URL('../../../shared/ma-core.js', import.meta.url), 'utf8'), context);
  // Expose private functions and suppress event attachment/autoload only. The
  // production computations, render(), caches and export adapter run unchanged.
  const init = engine.indexOf('    const loaded = loadSaved();');
  assert.ok(init > 0);
  vm.runInContext(engine.slice(0, init) +
    'window.p08 = { fit, fitPM, fitPMNull, parseStudies, render };\n})();', context);
  const adapterStart = adapter.indexOf('    window.__almResults = function');
  const adapterEnd = adapter.indexOf('    // Snapshot:', adapterStart);
  assert.ok(adapterEnd > adapterStart);
  vm.runInContext(adapter.slice(adapterStart, adapterEnd), context);
  return { ...window.p08, window, elements, renderRows(rows) {
    document.getElementById('f-data').value = rows.map(s => [s.label, s.est, s.se, s.x].join(', ')).join('\n');
    window.p08.render();
    return window.__almResults();
  } };
}

export function studies(scale = 1) {
  return [-3, -1, 3, 9].map((y, i) => ({
    label: `S${i + 1}`, est: y * scale, se: scale, v: scale * scale, x: i - 1.5,
  }));
}

export function close(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual), `${label}: expected finite result, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
}
