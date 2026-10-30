import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const app = new URL('../../../nma-inconsistency/', import.meta.url);
const html = readFileSync(new URL('index.html', app), 'utf8');
const engine = html.match(/<script>\s*(\/\/ Cycle 7\.1[\s\S]*?)<\/script>/)[1];
export const defaultInput = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];

// Only the shipped engine's output strings are exercised. This is not a DOM,
// browser, bus-import, layout or complete corpus-replay harness.
export function harness() {
  const elements = Object.fromEntries(['src', 'f-model', 'btn-run', 'ns-body',
    'ns-plot', 'dbt'].map(id => [id, {
    value: id === 'f-model' ? 'FE' : '', innerHTML: '', textContent: '',
    addEventListener() {}, setAttribute() {},
  }]));
  const context = vm.createContext({ document: { getElementById: id => elements[id] } });
  context.window = context;
  vm.runInContext(engine, context);
  return { context, elements, load(text, model = 'FE') {
    elements['f-model'].value = model;
    context.__almIncoLoad(text);
    return context._almLastInco();
  }, table() {
    return [...elements['ns-body'].innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(row => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)]
        .map(cell => decode(cell[1].replace(/<[^>]*>/g, '').trim())));
  } };
}

function decode(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => entities[name]);
}
