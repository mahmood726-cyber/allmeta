import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../component-nma/index.html', import.meta.url), 'utf8');
// Execute the app's own inline engine and run() assembly, never a test-side WLS.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const matches = scripts.filter(([, s]) => s.includes('function fit(rows)'));
assert.equal(matches.length, 1, 'one inline CNMA engine');
export const engineSource = matches[0][1];
export const inputBytes = readFileSync(new URL('../r/component-nma-p19-input.json', import.meta.url));
export const input = JSON.parse(inputBytes);
export const readReference = () => JSON.parse(readFileSync(
  new URL('../fixtures/component-nma-p19-reference.json', import.meta.url), 'utf8'));

export function loadEngine(source = engineSource) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', innerHTML: '', textContent: '', hidden: false,
      addEventListener() {}, replaceChildren() {}, appendChild() {}, setAttribute() {},
    });
    return nodes.get(id);
  };
  const messages = [];
  const window = { Toast: { show: message => messages.push(message) } };
  node('src').value = input.cases[0].rows.map(row => row.join(' | ')).join('\n');
  const context = vm.createContext({ window, document: { getElementById: node, createElement: () => ({}) } });
  vm.runInContext(source, context, { filename: 'component-nma/index.html:inline-engine' });
  let forest = [];
  // Observe the actual unrounded intervals handed to the renderer; preserve
  // rendering execution too. No numerical calculation is replaced by the harness.
  const draw = context.drawForest;
  context.drawForest = items => {
    forest = JSON.parse(JSON.stringify(items));
    draw(items);
  };
  return {
    run(caseInput) {
      messages.length = 0; forest = [];
      node('src').value = caseInput.rows.map(row => row.join(' | ')).join('\n');
      context.syncInactive();
      node('inactive').value = caseInput.inactive;
      context.run();
      return { result: JSON.parse(JSON.stringify(window._almLastCnma())), forest,
        messages: [...messages], componentTable: node('comp-body').innerHTML,
        combinationTable: node('int-body').innerHTML, forestMarkup: node('forest').innerHTML };
    },
    fit(caseInput) {
      return JSON.parse(JSON.stringify(context.fit(context.parse(
        caseInput.rows.map(row => row.join(' | ')).join('\n'), caseInput.inactive))));
    },
  };
}

export function near(got, want, label) {
  assert.ok(Number.isFinite(got) && Number.isFinite(want) && Math.abs(got - want) <= 1e-6,
    `${label}: app=${got} R=${want} absDiff=${Math.abs(got - want)} tolerance=0.000001`);
}

export function compareFit(actual, expected) {
  assert.ok(actual, `${expected.id}: app returned a fit`);
  near(actual.Q, expected.Q, `${expected.id}.Q`);
  assert.equal(actual.df, expected.df, `${expected.id}.df`);
  if (expected.tau2 === null) assert.equal(actual.tau2, null, `${expected.id}.tau2`);
  else near(actual.tau2, expected.tau2, `${expected.id}.tau2`);
  for (const group of ['components', 'combinations']) {
    assert.deepEqual(Object.keys(actual[group]).sort(), Object.keys(expected[group]).sort(), group);
    for (const [label, ref] of Object.entries(expected[group])) {
      for (const key of ['est', 'se']) near(actual[group][label][key], ref[key], `${expected.id}.${group}.${label}.${key}`);
    }
  }
}

export function compareIntervals(forest, expected) {
  for (const [kind, group] of [['component', 'components'], ['intervention', 'combinations']]) {
    const items = forest.filter(row => row.kind === kind);
    assert.equal(items.length, Object.keys(expected[group]).length, `${expected.id}.${kind} interval count`);
    for (const item of items) {
      const ref = expected[group][item.name];
      assert.ok(ref, `R label ${item.name}`);
      near(item.lo, ref.lo, `${expected.id}.${group}.${item.name}.lo`);
      near(item.hi, ref.hi, `${expected.id}.${group}.${item.name}.hi`);
    }
  }
}
