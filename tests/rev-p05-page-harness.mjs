import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the page's actual computation, rendering and result-export functions.
// Only DOM plumbing and optional modules are stubbed; no estimator is copied.
export function pageHarness(core) {
  const html = readFileSync(new URL('../heterogeneity/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = scripts.find(s => s.includes('function tau2_PM('));
  const adapters = scripts.find(s => s.includes('window.__almResults ='));
  if (!main?.includes('    const loaded = loadSaved();') || !adapters?.includes('    // ---- module init')) {
    throw new Error('Heterogeneity harness boundaries changed');
  }
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '',
      classList: { add() {}, remove() {} }, setAttribute(k, v) { this[k] = v; } });
    return nodes.get(id);
  };
  const window = { AlmMaCore: core, alm: { analysisLifecycle: fn => fn } };
  const context = vm.createContext({ window, document: { getElementById: node },
    localStorage: { getItem() { return null; }, setItem() {} }, console });
  vm.runInContext(main.slice(0, main.indexOf('    const loaded = loadSaved();')) +
    '\nwindow.__revP05Render = render;\n})();', context);
  vm.runInContext(adapters.slice(0, adapters.indexOf('    // ---- module init')) + '\n})();', context);
  return {
    render(yi, sei, method) {
      node('f-data').value = yi.map((y, i) => `Study ${i + 1}, ${y}, ${sei[i]}`).join('\n');
      node('f-tau2').value = method.toLowerCase();
      window.__revP05Render();
      return { exported: window.__almResults(), info: window._almLastFE(),
        stats: node('stats-wrap').innerHTML, warning: node('warn-banner').innerHTML,
        invalid: node('f-data')['aria-invalid'] };
    }
  };
}
