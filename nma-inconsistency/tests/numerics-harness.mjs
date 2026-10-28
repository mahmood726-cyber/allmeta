// Execute the shipped inline engine with only its six DOM endpoints stubbed.
// This is Node arithmetic/render-string evidence, not browser/layout evidence.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const controlText = 'A,B,0.2,1\nB,C,0.3,1\nA,C,0.6,1';
let reproductionSource;
// Only the standalone old-code runner calls this, before importing the tests.
export function useOriginalForReproduction(source) { reproductionSource = source; }
export function harness(source = reproductionSource) {
  const elements = new Map();
  for (const id of ['src', 'f-model', 'btn-run', 'ns-body', 'ns-plot', 'dbt']) {
    let html = '';
    elements.set(id, {
      value: id === 'src' ? controlText : id === 'f-model' ? 'FE' : '',
      get innerHTML() { return html; }, set innerHTML(v) { html = String(v); },
      get textContent() { return html; }, set textContent(v) { html = String(v); },
      setAttribute() {}, addEventListener() {},
    });
  }
  const c = { document: { getElementById: id => elements.get(id) } };
  c.window = c;
  vm.createContext(c);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function fitNMA('));
  if (!script) throw Error('Shipped NMA engine not found');
  vm.runInContext(source ? source.engine : script, c, { filename: 'nma-inconsistency/index.html', timeout: 10000 });
  vm.runInContext(source ? source.plus : readFileSync(new URL('../plus-core.js', import.meta.url), 'utf8'), c);
  return { c, elements };
}

export function engine(c) {
  return Object.fromEntries(['inputIssue', 'estimateTau2', 'fitNMA', 'nodeSplit', 'dbt'].map(k => [k, c[k]]));
}
