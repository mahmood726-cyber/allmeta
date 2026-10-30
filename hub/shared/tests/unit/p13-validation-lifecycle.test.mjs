import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import load from '../../../../gosh/tests/input-harness.cjs';

const pagePath = fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url));
const adapterSource = readFileSync(new URL('../../../../gosh/validate/adapter.js', import.meta.url), 'utf8');
const corpus = JSON.parse(readFileSync(new URL('../../../../gosh/validate/corpus/corpus.json', import.meta.url), 'utf8'));
const studies = k => Array.from({ length: k }, (_, i) => `${i / 100}, 0.2, S${i + 1}`).join('\n');
const refusal = k => `Enter at most 100 valid studies (effect, SE[, label]); found ${k}.`;

// Exercise the production adapter's exact text comparator at its serialized-DOM
// boundary. Browser specs cover the DOM walker; no numerical engine is mocked.
function textContract() {
  const source = adapterSource.slice(0, adapterSource.indexOf('function capture('));
  return runInNewContext(source + `
    return { pinned: JSON.parse(PAGE_TEXT), check: pageTextOk,
      set(value) { pageText = () => JSON.stringify(value); } };
  })();`, {
    window: {},
    document: { body: { children: [] }, querySelector: () => ({ children: [], textContent: '' }) }
  });
}

function rendered(contract, message) {
  const value = JSON.parse(JSON.stringify(contract.pinned));
  if (message) {
    const at = value.texts.findIndex(([path]) => path === 'MAIN>SECTION0>BUTTON2');
    assert.ok(at > 0);
    value.texts.splice(at, 0, ['MAIN>SECTION0>LABEL1>SPAN2', message]);
  }
  return value;
}

test('plant P13-CI: all 28 pinned over-cap cases accept the exact count-specific alert', () => {
  const contract = textContract(), h = load(pagePath);
  let cases = 0;
  for (const c of corpus.filter(c => c.k > 100)) for (const model of ['FE', 'DL']) {
    h.nodes.model.value = model;
    assert.equal(h.run(studies(c.k)), null);
    assert.equal(h.nodes['input-error'].textContent, refusal(c.k));
    contract.set(rendered(contract, h.nodes['input-error'].textContent));
    assert.equal(contract.check(c.k), true, `${c.id} ${model}`);
    cases++;
  }
  assert.equal(cases, 28);
});

test('plant P13-CI: a missing over-cap explanation fails the text contract', () => {
  const contract = textContract();
  contract.set(rendered(contract, ''));
  assert.equal(contract.check(101), false);
});

test('control: valid inputs retain the entire frozen page-text contract', () => {
  const contract = textContract();
  contract.set(rendered(contract, ''));
  for (const k of [3, 100]) assert.equal(contract.check(k), true);
  contract.set(rendered(contract, refusal(101)));
  assert.equal(contract.check(3), false);
});

test('control: wrong count, limit, location, duplicate or extra text remains rejected', () => {
  const contract = textContract();
  for (const message of [refusal(102), refusal(101).replace('100', '999'), 'Analysis refused.', refusal(101) + ' Verified.']) {
    contract.set(rendered(contract, message));
    assert.equal(contract.check(101), false, message);
  }
  for (const mutate of [
    value => { value.texts.find(([path]) => path === 'MAIN>SECTION0>LABEL1>SPAN2')[0] = 'MAIN>SECTION1>SPAN2'; },
    value => { value.texts.push(['MAIN>SECTION0>LABEL1>SPAN2', refusal(101)]); },
    value => { value.texts[0][1] = 'Wrong skip link'; },
    value => { value.attrs[0][1] = 'Wrong navigation label'; }
  ]) {
    const value = rendered(contract, refusal(101));
    mutate(value); contract.set(value);
    assert.equal(contract.check(101), false);
  }
});

function extras(h) {
  return {
    state: h.window.AlmGoshPlus.state,
    nodes: ['plus-status', 'plus-plot', 'plus-study', 'plus-het', 'plus-counts'].map(id =>
      [id, h.nodes[id].innerHTML, h.nodes[id].textContent]),
    head: h.nodes['plus-table'].tHead.rows[0].innerHTML,
    body: h.nodes['plus-table'].tBodies[0].innerHTML
  };
}

for (const fail of [false, true]) test(`plant P13-CI: ${fail ? 'failed' : 'successful'} temporary validation preserves extras`, () => {
  const h = load(pagePath); h.seedExtras();
  const before = extras(h), snapshot = h.window.__almGoshValidationSnapshot();
  const replay = () => {
    try {
      for (const k of [101, 137]) for (const model of ['FE', 'DL']) {
        assert.equal(h.window.__almGoshValidationRun(studies(k), model, 5, {}).summary, null);
        assert.equal(h.nodes['input-error'].textContent, refusal(k));
      }
      if (fail) throw Error('Injected replay failure');
    } finally { h.window.__almGoshValidationRestore(snapshot); }
  };
  if (fail) assert.throws(replay, /Injected replay failure/); else replay();
  assert.deepEqual(extras(h), before);
  assert.deepEqual(h.window.__almGoshValidationSnapshot(), snapshot);
  // The temporary guard must end: an ordinary refusal still invalidates extras.
  h.run(studies(101));
  assert.equal(h.window.AlmGoshPlus.state, null);
  assert.equal(h.nodes['plus-plot'].innerHTML, '');
});

test('control: ordinary over-cap input clears extras and valid input recovers', () => {
  const h = load(pagePath); h.seedExtras();
  assert.equal(h.run(studies(101)), null);
  assert.equal(h.window.AlmGoshPlus.state, null);
  for (const id of ['plus-plot', 'plus-study', 'plus-het']) assert.equal(h.nodes[id].innerHTML, '');
  assert.equal(h.nodes['plus-table'].tBodies[0].innerHTML, '');
  assert.equal(h.nodes['plus-table'].tHead.rows[0].innerHTML, '');
  assert.equal(h.nodes['plus-counts'].textContent, '');
  assert.equal(h.run(studies(3)).k, 3);
  assert.equal(h.nodes['input-error'].textContent, '');
});

test('control: valid temporary validation preserves extras', () => {
  const h = load(pagePath); h.seedExtras();
  const before = extras(h), snapshot = h.window.__almGoshValidationSnapshot();
  try { assert.equal(h.window.__almGoshValidationRun(studies(3), 'FE', 5, {}).summary.k, 3); }
  finally { h.window.__almGoshValidationRestore(snapshot); }
  assert.deepEqual(extras(h), before);
});
