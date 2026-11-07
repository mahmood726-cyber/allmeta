import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = new URL('../../../../nma-inconsistency/', import.meta.url);
const html = readFileSync(new URL('index.html', app), 'utf8');
const engine = html.match(/<script>\s*(\/\/ Cycle 7\.1[\s\S]*?)<\/script>/)[1];
const live = readFileSync(new URL('validate/live.js', app), 'utf8');

// Execute the real renderer and live validator. Only the DOM surface and
// unrelated adapter checks are stubbed; this is not browser or R evidence.
function harness(text, model) {
  const elements = Object.fromEntries(['src', 'f-model', 'btn-run', 'ns-body',
    'ns-plot', 'dbt', 'alm-validate'].map(id => [id, {
    value: id === 'f-model' ? model : '', innerHTML: '',
    addEventListener() {}, setAttribute() {}, append() {},
    get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
  }]));
  elements['ns-body'].querySelectorAll = () =>
    [...elements['ns-body'].innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(row => ({
      querySelectorAll: () => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)]
        .map(cell => ({ textContent: cell[1].replace(/<[^>]*>/g, '') })),
    }));
  const c = vm.createContext({ structuredClone, document: {
    getElementById: id => elements[id] || null,
    createElement: () => ({}),
  }, AlmValidate: { mount() {} } });
  c.window = c;
  vm.runInContext(engine, c);
  c.__almIncoLoad(text);
  c.AlmIncoValidationAdapter = {
    snapshot: () => ({ text: elements.src.value, state: c._almLastInco(),
      body: elements['ns-body'].innerHTML }),
    restore: saved => {
      c.__almIncoValidationRestore(saved.state);
      elements['ns-body'].innerHTML = saved.body;
    },
    leaves: () => [], sortedState: s => s, controls: () => true,
    pageText: () => [], chartControls: () => true, contract: { pageText: [] },
  };
  vm.runInContext(live, c);
  return {
    state: c._almLastInco(),
    tableOK: () => c.AlmIncoValidationAdapter.live.currentState().values
      .find(v => v.key === 'display.table').value,
    change: fn => { elements['ns-body'].innerHTML = fn(elements['ns-body'].innerHTML); },
  };
}

const nonrejection = 'A,B,0,.1,S1\nB,C,0,.1,S2\nA,C,.3,.1,S3';
// Replicated designs keep heterogeneity from absorbing all inconsistency in RE.
const rejection = 'A,B,0,.1,S1\nA,B,0,.1,S2\nB,C,0,.1,S3\nB,C,0,.1,S4\nA,C,10,.1,S5\nA,C,10,.1,S6';

for (const model of ['FE', 'DL', 'PM']) {
  for (const [name, text, rejected] of [['non-rejection', nonrejection, false],
    ['rejection', rejection, true]]) {
    test(`plant P0-31 live ${model}: validates corrected ${name} labels`, () => {
      const h = harness(text, model);
      assert.equal(h.state.nodeSplit.length, 3);
      assert.ok(h.state.nodeSplit.every(s => (s.p < .05) === rejected));
      assert.equal(h.tableOK(), true);
    });
  }

  test(`plant P0-31 live ${model}: rejects historical verdicts`, () => {
    const h = harness(nonrejection, model);
    h.change(s => s.replaceAll('no evidence of inconsistency', 'consistent'));
    assert.equal(h.tableOK(), false);
    const rejected = harness(rejection, model);
    rejected.change(s => s.replaceAll('evidence of inconsistency', 'inconsistent'));
    assert.equal(rejected.tableOK(), false);
  });

  test(`control P0-31 live ${model}: rejects wrong verdicts and altered numbers`, () => {
    for (const mutate of [
      s => s.replaceAll('no evidence of inconsistency', 'evidence of inconsistency'),
      s => s.replace('<td>0.000 (', '<td>999.000 ('),
      () => '',
    ]) {
      const h = harness(nonrejection, model);
      h.change(mutate);
      assert.equal(h.tableOK(), false);
    }
  });
}
