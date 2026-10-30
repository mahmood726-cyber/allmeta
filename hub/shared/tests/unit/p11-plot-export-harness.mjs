// Execute the actual page analysis/render/export block with an in-memory DOM, no browser.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
export const rows = read('hub/shared/tests/unit/p11-plot-input.csv').trim().split(/\r?\n/).slice(1)
  .map(line => { const [label, te, se] = line.split(','); return { label, te: +te, se: +se }; });
export const plants = ['baujat.x', 'baujat.y', 'radial.x', 'radial.z', 'radial.resid', 'radial.slope'];
export function page(plant, input = rows) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', value: '', disabled: false, hidden: false,
      listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(key, value) { this[key] = value; },
      classList: { toggle() {}, contains() { return false; } }
    });
    return elements.get(id);
  }
  const document = { getElementById: element, querySelectorAll: () => [], querySelector: () => null };
  element('src').value = input.map(r => `${r.te}, ${r.se}, ${r.label}`).join('\n');
  const context = vm.createContext({ document, structuredClone, console });
  context.window = context;
  context.alm = { analysisLifecycle: fn => fn };
  for (const file of ['shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js', 'influence/r-script.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  if (plant && plant !== 'table') {
    const [plot, key] = plant.split('.');
    const original = context.AlmDiagPlots[plot];
    context.AlmDiagPlots[plot] = (...args) => {
      const result = original(...args);
      if (key === 'slope') result[key] += 10;
      else result[key][0] += 10;
      return result;
    };
  }
  const script = [...read('influence/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function drawBaujat(rows)'));
  if (!script) throw new Error('Influence page analysis block not found');
  vm.runInContext(script, context, { filename: 'influence/index.html' });
  if (plant === 'table') context._almLastDiag()[0].dffits += 10;
  return {
    window: context,
    svg: plot => element(`${plot}-plot`).innerHTML,
    script: () => context.__almInfluenceRScript(),
    exclude(i) { element('body').listeners.change({ target: { closest: () => ({ dataset: { i }, checked: true }) } }); },
    state: () => ({ rows: context._almStudies(), full: context._almLastInfluence(), diag: context._almLastDiag(),
      baujat: context.__almBaujat, radial: context.__almRadial })
  };
}
export const normalize = script => script.replace(/^# Generated .*$/m, '# Generated <timestamp>');
export function entry(script, name) {
  const line = script.split('\n').find(s => s.startsWith(`  "${name}" = list(app = `));
  if (!line) throw new Error(`Export missing ${name}`);
  const text = line.split(' = list(app = ')[1].split(', r = quote(')[0];
  return text.replace(/^c\(/, '').replace(/\)$/, '').split(',').map(s => Number(s.trim()));
}
