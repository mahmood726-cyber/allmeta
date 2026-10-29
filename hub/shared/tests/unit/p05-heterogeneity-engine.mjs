import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the page's actual parser/dispatcher/computeAll and the two shipped
// numerical modules. Stop after the compute export, before UI code. No copied math.
export function loadEngine() {
  const root = new URL('../../../../', import.meta.url);
  const context = vm.createContext({ document: { getElementById: () => ({}) } });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/heterogeneity-ci.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  const html = readFileSync(new URL('heterogeneity/index.html', root), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(source => source.includes('function computeAll('));
  assert.equal(scripts.length, 1, 'Exactly one shipped heterogeneity engine');
  const source = scripts[0];
  // UI initialization starts before loadSaved(): analysisLifecycle wraps render
  // at top level. The compute export above renderStats is the engine boundary.
  const marker = '    function renderStats(studies, chosen) {';
  assert.equal(source.split(marker).length, 2, 'Engine/UI boundary must remain unambiguous');
  vm.runInContext(source.slice(0, source.indexOf(marker)) + '\n})();', context,
    { filename: 'heterogeneity/index.html (through compute export)' });
  assert.equal(typeof context.__almHetCompute, 'function');
  return (data, method) => context.__almHetCompute(
    data.yi.map((yi, i) => `Study ${i + 1},${yi},${data.se[i]}`).join('\n'), method);
}

export const referenceURL = new URL('../r/p05-heterogeneity-reference.json', import.meta.url);
export const readReference = () => JSON.parse(readFileSync(referenceURL, 'utf8'));

// Same mixed metric as the existing publication corpus: normalized errors for
// estimates/variances/intervals, absolute errors for percentages/probabilities.
// Every threshold is 1e-6, including iterative methods and large-unit cases.
export function compare(pairs) {
  const failures = [];
  for (const [name, actual, expected] of pairs) {
    const absolute = /(?:^|\.)(?:I2|I2Model|I2Lo|I2Hi|pQ)$/.test(name);
    const error = Math.abs(actual - expected) / (absolute ? 1 : Math.max(1, Math.abs(expected)));
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || error > 1e-6) {
      failures.push({ name, actual, expected, error, metric: absolute ? 'absolute' : 'normalized' });
    }
  }
  assert.deepEqual(failures, [], 'Shipped engine must match native metafor at 1e-6');
}

export function pooledPairs(actual, expected) {
  return [['tau2', actual.tau2, expected.tau2],
    ...['mu', 'se', 'ciLo', 'ciHi', 'I2', 'I2Model', 'seHKSJ', 'ciLoHKSJ', 'ciHiHKSJ']
      .map(key => [key, actual.sum[key], expected[key]]),
    ['piLo', actual.pi.lo, expected.piLo], ['piHi', actual.pi.hi, expected.piHi]];
}
