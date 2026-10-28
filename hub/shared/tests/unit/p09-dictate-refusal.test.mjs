import test from 'node:test';
import assert from 'node:assert/strict';
import { app, valid } from './p09-proportion-harness.mjs';

for (const [name, input] of [['empty', ''], ['one study', '12,150,A']]) {
  for (const output of ['het', 'forest']) {
    test(`P09-D3 plant: ${name} refusal clears previous ${output}`, () => {
      const a = app();
      a.run(valid);
      assert.match(a.elements.het.innerHTML, /prediction interval/);
      assert.match(a.elements.forest.innerHTML, /<polygon /);
      a.run(input);
      assert.match(a.elements['res-body'].innerHTML, /Need at least 2 studies/);
      assert.equal(a.elements[output].innerHTML, '');
    });
  }

  test(`P09-D3 control: ${name} refusal clears exports, snapshots and success status`, () => {
    const a = app();
    a.run(valid);
    assert.ok(a.results());
    assert.ok(a.snapshot());
    a.run(input);
    assert.equal(a.results(), null);
    assert.equal(a.snapshot(), null);
    assert.equal(a.mounts.resultsExport.getResults(), null);
    assert.equal(a.mounts.plotExport.getReceiptInput(), null);
    assert.equal(a.elements['analysis-status'].hidden, true);
  });
}

test('P09-D3 plant: malformed refusal clears graphics, DL warning and export state', () => {
  const a = app();
  a.elements['tau-est'].value = 'DL';
  a.run(valid);
  assert.equal(a.elements['k-warn'].style.display, 'block');
  a.run('12,150,A\n12oops,150,B\n20,220,C');
  assert.equal(a.elements.het.innerHTML, '');
  assert.equal(a.elements.forest.innerHTML, '');
  assert.equal(a.elements['k-warn'].style.display, 'none');
  assert.equal(a.mounts.resultsExport.getResults(), null);
  assert.equal(a.mounts.plotExport.getReceiptInput(), null);
  assert.equal(a.snapshot(), null);
});

test('P09-D3 control: correcting a refused input replaces the message and renders a new fit', () => {
  const a = app();
  a.run('12,150,A');
  a.run('0,10,New A\n10,10,New B');
  assert.equal(a.results().k, 2);
  assert.equal(a.results().poolPiLo, null);
  assert.match(a.elements['res-body'].innerHTML, /New A/);
  assert.doesNotMatch(a.elements['res-body'].innerHTML, /Need at least|Line \d+:/);
  assert.doesNotMatch(a.elements.het.innerHTML, /prediction interval/);
  assert.match(a.elements.forest.innerHTML, /<polygon /);
  assert.equal(a.elements['analysis-status'].hidden, false);
});
