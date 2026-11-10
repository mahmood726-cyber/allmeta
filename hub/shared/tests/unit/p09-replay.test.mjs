import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, loadCorpus } from './p09-replay-harness.mjs';

function summarize(label, result) {
  const failedByQuantity = {};
  for (const failure of result.failed) failedByQuantity[failure.quantity] = (failedByQuantity[failure.quantity] || 0) + 1;
  console.log('P09 full replay', JSON.stringify({
    label, checks: result.checks, passed: result.passed, failures: result.failed.length,
    refusals: result.refusals.length, failedByQuantity
  }));
}

function exactContract(result) {
  assert.equal(result.checks, 298116);
  assert.equal(result.passed, 298116);
  assert.deepEqual(Array.from(result.failed), []);
  assert.equal(result.refusals.length, 198);
}

async function fullReplay(log) {
  const h = harness(); h.bounds(0.0001, 1); h.change('log', log);
  assert.match(h.svg, /<polygon\b/);
  assert.equal(h.elements.get('forest-axis-error').hidden, true);
  const before = h.state(), notice = h.notice();
  const result = await h.replay(loadCorpus(h));
  summarize(log ? 'positive log' : 'linear', result);
  return { h, before, notice, result };
}

let logReplay;
const positiveLogReplay = () => logReplay ??= fullReplay(true);

test('P09-R3 control: full linear replay keeps all 298116 checks and restores user state', async () => {
  const { h, before, result } = await fullReplay(false);
  exactContract(result);
  assert.deepEqual(h.state(), before);
  h.run(); assert.deepEqual(h.state(), before, 'next run retains the custom linear domain');
});

test('P09-R3 plant: full log-enabled replay keeps all 298116 checks and restores user state', async () => {
  const { h, before, result } = await positiveLogReplay();
  exactContract(result);
  assert.deepEqual(h.state(), before);
  h.run(); assert.deepEqual(h.state(), before, 'next run retains the custom log domain');
});

test('P09-R4 plant: full replay restores an initially hidden axis notice', async () => {
  const { h, notice } = await positiveLogReplay();
  assert.deepEqual(h.notice(), notice);
});

test('P09-R4 plant: full replay restores an initially visible axis notice', async () => {
  const h = harness(); h.bounds(0, 1); h.change('log', true);
  assert.equal(h.svg, '');
  assert.match(h.elements.get('forest-axis-error').textContent, /bounds/);
  const before = h.state(), notice = h.notice();
  const result = await h.replay(loadCorpus(h));
  summarize('visible notice / invalid log bounds', result);
  // Check notice first, independently of the corpus failures on the old code.
  assert.deepEqual(h.notice(), notice);
  exactContract(result);
  assert.deepEqual(h.state(), before);
  h.run(); assert.deepEqual(h.state(), before, 'invalid log domain is restored too');
});

for (const visible of [false, true]) {
  test(`P09-R4 ${visible ? 'plant' : 'control'}: aborted replay restores an initially ${visible ? 'visible' : 'hidden'} notice and axis`, async () => {
    const h = harness(); h.bounds(0.0001, 1); h.change('log', true);
    if (visible) {
      h.elements.get('src').value = '0,100,A\n10,100,B\n80,100,C'; h.run();
    }
    assert.equal(h.elements.get('forest-axis-error').hidden, !visible);
    const loaded = loadCorpus(h), cases = loaded['validate/corpus/corpus.json'];
    // End the first batch with an actual positive corpus case. The supplied
    // references and all 2160 configurations remain intact, only order changes.
    const index = cases.findIndex(c => c.id === 'dat.baker2009::exac::total::Placebo');
    assert.ok(index >= 0); [cases[1], cases[index]] = [cases[index], cases[1]];
    const before = h.state(), notice = h.notice(), stopped = new Error('intentional progress interruption');
    await assert.rejects(h.replay(loaded, () => { throw stopped; }), error => error === stopped);
    assert.deepEqual(h.notice(), notice);
    assert.deepEqual(h.state(), before);
    h.run(); assert.deepEqual(h.state(), before, 'next run proves the axis was restored after an exception');
  });
}

test('P09-R3 control: live current-analysis validation keeps the user log axis', () => {
  const h = harness(); h.bounds(0.0001, 1); h.change('log', true);
  const before = h.state();
  const current = h.context.AlmProportionValidationAdapter.live.currentState();
  assert.ok(current.result);
  assert.deepEqual(h.state(), before);
});

for (const mode of ['default', 'custom linear', 'custom log']) {
  test(`P09-R3 ${mode === 'default' ? 'control' : 'plant'}: ${mode} replay uses automatic linear plotting`, async () => {
    const h = harness(), loaded = loadCorpus(h), cases = loaded['validate/corpus/corpus.json'];
    const index = cases.findIndex(c => c.id === 'dat.baker2009::exac::total::Placebo');
    assert.ok(index >= 0); [cases[1], cases[index]] = [cases[index], cases[1]];
    const expected = harness({
      source: cases[1].rows.map((r, i) => [r.x, r.n, 'row_' + i].join(',')).join('\n'),
      transform: 'raw'
    });
    expected.elements.get('tau-est').value = 'FE'; expected.run();
    assert.match(expected.svg, /<polygon\b/);
    if (mode !== 'default') h.bounds(0.0001, 1);
    if (mode === 'custom log') h.change('log', true);
    const before = h.state(), stopped = new Error('checked first canonical batch');
    let actual;
    await assert.rejects(h.replay(loaded, () => { actual = h.svg; throw stopped; }), error => error === stopped);
    assert.equal(actual, expected.svg, 'replay renders the same automatic linear plot as a fresh page');
    assert.deepEqual(h.state(), before);
  });
}
