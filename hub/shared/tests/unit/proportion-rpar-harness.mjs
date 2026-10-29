import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export const html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8');
const coreSource = readFileSync(new URL('shared/ma-core.js', root), 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).filter(code => code.includes('function logitTransform('));
assert.equal(blocks.length, 1, 'Locate the complete production engine script, fail closed if moved');

export function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Mutation must match exactly once: ${before}`);
  return source.replace(before, after);
}

// Execute the complete inline production script (including run() and render())
// with its real shared core. Only UI integrations and element methods are stubbed.
// There is no copied transform, pooling, CI, PI or binomial-limit implementation.
export function loadEngine({ page = code => code, core = code => code } = {}) {
  const elements = new Map();
  for (const id of ['src', 'trans', 'tau-est', 'btn-run', 'k-warn', 'res-body', 'forest', 'het']) {
    elements.set(id, {value: '', innerHTML: '', textContent: '', style: {},
      addEventListener() {}, setAttribute() {}});
  }
  elements.get('src').value = '2,17,A\n5,20,B\n8,30,C';
  elements.get('trans').value = 'logit';
  elements.get('tau-est').value = 'PM';
  const noop = () => {};
  const urlState = Object.assign(noop, {read: () => ({}), write: noop});
  const context = vm.createContext({document: {getElementById(id) {
    assert.ok(elements.has(id), `Unexpected DOM dependency: ${id}`);
    return elements.get(id);
  }}});
  context.window = context;
  context.alm = {analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resultsExport: noop, urlState, resetUndo: noop, tooltips: noop};
  vm.runInContext(core(coreSource), context, {filename: 'shared/ma-core.js', timeout: 10000});
  vm.runInContext(page(blocks[0]), context, {filename: 'proportion-ma/index.html', timeout: 10000});
  return {
    run(rows, transform, method) {
      elements.get('src').value = rows.map(([x,n], i) => `${x},${n},row-${i+1}`).join('\n');
      elements.get('trans').value = transform;
      elements.get('tau-est').value = method;
      vm.runInContext('window.__almPropValidation.run()', context, {timeout: 10000});
      const snapshot = context.__almPropValidation.snapshot();
      return snapshot === null ? null : JSON.parse(JSON.stringify(snapshot));
    },
    last: () => context._almLastPropMA(),
  };
}

export const groups = {
  transformed: ['yi', 'vi'],
  pooled: ['mu_re','seRE','tau2','Q','df','i2','k','poolP'],
  confidence: ['lo','hi','poolLo','poolHi'],
  prediction: ['piLo','piHi','poolPiLo','poolPiHi'],
  studies: ['p','lo','hi','rel'],
};

export function differences(actual, reference, group) {
  const failures = [];
  const compare = (path, a, b) => {
    const pass = b === null ? a === null : Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1e-6;
    if (!pass) failures.push({path, actual: a, expected: b,
      absDiff: Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a-b) : null});
  };
  if (reference.status === 'refused') {
    if (actual !== null) failures.push({path:'status',actual:'ok',expected:'refused'});
    return failures;
  }
  if (!actual) return [{path:'status',actual:'refused',expected:'ok'}];
  if (group === 'transformed') {
    for (const key of groups[group]) {
      assert.equal(actual[key].length, reference[key].length, `${reference.id} ${key} length`);
      reference[key].forEach((b,i) => compare(`${key}[${i}]`, actual[key][i], b));
    }
  } else if (group === 'studies') {
    assert.equal(actual.studies.length, reference.studies.length, `${reference.id} study count`);
    reference.studies.forEach((r,i) => {
      for (const key of groups[group]) compare(`studies[${i}].${key}`, actual.studies[i][key], r[key]);
    });
  } else {
    for (const key of groups[group]) compare(key, actual.values[key], reference.values[key]);
  }
  return failures;
}

export function assertParity(actual, reference, group) {
  const failures = differences(actual, reference, group);
  assert.deepEqual(failures, [], `${reference.id} ${group}: ${JSON.stringify(failures)}`);
}
