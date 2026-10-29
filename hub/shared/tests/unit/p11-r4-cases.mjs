import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
const modes = JSON.parse(read('tests/fixtures/reml_global_modes.json')).cases;
export const cases = [
  ...modes.map(c => ({ id: c.id, yi: c.yi, vi: c.vi, excluded: [], plant: c.id !== 'boundary-beats-interior' })),
  ...modes.filter(c => c.id !== 'boundary-beats-interior').map(c => ({
    id: c.id + '-deletion-exclusion', yi: [...c.yi, 0.4], vi: [...c.vi, 0.04],
    excluded: [c.yi.length], plant: true
  })),
  { id: 'ordinary', yi: [.1, .3, .5, .2, .9, .4, 1.1, .05], vi: [.2, .25, .18, .3, .22, .28, .35, .15].map(x => x*x), excluded: [0] },
  { id: 'three-study', yi: [.1, .3, .9], vi: [.01, .0144, .04], excluded: [] },
  { id: 'ties', yi: [-.2, .1, .6, .9], vi: [.04, .04, .04, .04], excluded: [0] },
  { id: 'zero', yi: [.2, .2, .2, .2], vi: [.01, .04, .09, .16], excluded: [0] }
];

// Execute the page's actual pure pool and diagnostic expressions, without a DOM
// or a second implementation of its statistical formulae.
const page = read('influence/index.html');
const between = (from, to) => {
  const begin = page.indexOf(from), end = page.indexOf(to, begin);
  if (begin < 0 || end < 0) throw new Error('Influence page extraction markers changed');
  return page.slice(begin, end);
};
const context = vm.createContext({});
context.window = context;
for (const path of ['shared/ma-core.js', 'influence/influence-extra.js', 'influence/r-script.js']) vm.runInContext(read(path), context);
vm.runInContext(between('      function tau2_REML(rows)', '      function fmt('), context);
const diagnostics = between('        const diag = rows.map(', '        _lastDiag = diag;');
vm.runInContext(`function capture(rows, excluded) {
  const X = AlmInfluenceExtra, k = rows.length;
  const full = pool(rows);
  Object.assign(full, X.summarize(full, rows.map(r => r.se*r.se)));
  ${diagnostics}
  const rest = rows.filter((_, i) => !excluded.includes(i));
  const kept = excluded.length ? pool(rest) : null;
  if (kept) Object.assign(kept, X.summarize(kept, rest.map(r => r.se*r.se)));
  return { rows, full, diag, excluded, kept };
}`, context);
export function stateFor(c) {
  return context.capture(c.yi.map((te, i) => ({ te, se: Math.sqrt(c.vi[i]), label: `Study ${i+1}` })), c.excluded);
}
export const build = state => context.AlmInfluenceR.build(state);
