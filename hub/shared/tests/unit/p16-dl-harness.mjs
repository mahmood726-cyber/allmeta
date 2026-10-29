import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const appSource = readFileSync(new URL('../../../../nma-inconsistency/index.html', import.meta.url), 'utf8');
export function engine() {
  const start = appSource.indexOf('    function parse(text) {');
  const end = appSource.indexOf('    let _lastInco = null;', start);
  assert.ok(start > 0 && end > start, 'Load the shipped parser and numerical functions without DOM startup');
  const context = vm.createContext({});
  vm.runInContext(appSource.slice(start, end), context);
  vm.runInContext(readFileSync(new URL('../../../../nma-inconsistency/plus-core.js', import.meta.url), 'utf8'), context);
  return context;
}
export const input = JSON.parse(readFileSync(new URL('./p16-dl-input.json', import.meta.url), 'utf8'));
export const scaled = (rows, scale) => rows.map(r => ({ ...r, te: r.te * scale, se: r.se * scale }));
