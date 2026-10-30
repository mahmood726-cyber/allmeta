// Runs the complete, unmodified numerical page script with inert DOM sinks.
// No copied pooling or diagnostic formulas; no browser, storage, or file output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => fs.readFileSync(new URL(path, root), 'utf8');

export function loadInfluence(mutate = (path, source) => source) {
  const html = read('influence/index.html');
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).filter(s => s.includes('const LS_KEY = "influence-v1"'));
  assert.equal(blocks.length, 1, 'locate exactly one app engine script');
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
    addEventListener() {}, setAttribute() {},
    classList: { toggle() {}, contains() { return false; } },
  }]));
  const document = {
    getElementById(id) {
      assert.ok(elements.has(id), `missing page element ${id}`);
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const window = { alm: { analysisLifecycle: run => run } };
  const context = vm.createContext({ window, document, structuredClone });
  for (const path of ['shared/ma-core.js', 'influence/influence-extra.js', 'shared/diagnostic-plots.js']) {
    vm.runInContext(mutate(path, read(path)), context, { filename: path, timeout: 10000 });
  }
  vm.runInContext(mutate('influence/index.html', blocks[0]), context,
    { filename: 'influence/index.html', timeout: 10000 });
  return {
    analyze(input) {
      const data = input.yi.map((y, i) => `${y}, ${Math.sqrt(input.vi[i])}, row${i}`).join('\n');
      window.__almRestore({ data });
      return { full: window._almLastInfluence(), diag: window._almLastDiag() };
    },
    exclude(indices) {
      window.__almInfluenceSetExcluded(indices);
      return window._almLastExclusion();
    },
    error() { return elements.get('input-error').textContent; },
  };
}

export const TOL = 1e-6; // Absolute, including iterative REML: no tolerance exception.
export function compare(actual, expected, keys, label) {
  const differences = [];
  for (const key of keys) {
    const a = actual?.[key], r = expected?.[key];
    const valid = typeof r === 'boolean' ? typeof a === 'boolean' && a === r
      : typeof r === 'number' && Number.isFinite(r) && typeof a === 'number'
        && Number.isFinite(a) && Math.abs(a - r) <= TOL;
    if (!valid) differences.push({ quantity: `${label}.${key}`, app: a, R: r,
      absolute_difference: typeof a === 'number' && typeof r === 'number' ? Math.abs(a - r) : null });
  }
  assert.deepEqual(differences, [], `${label}: R parity at absolute tolerance ${TOL}`);
}

export function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `mutation anchor must be unique: ${before}`);
  return source.replace(before, after);
}
