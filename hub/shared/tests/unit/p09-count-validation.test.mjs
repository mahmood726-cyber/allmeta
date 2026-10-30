import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, read } from '../fixtures/p09-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const valid = '12,100,A\n20,100,B';
function refused(h, text, row) {
  const calls = h.poolCalls;
  const writes = h.urlWrites.length;
  assert.doesNotThrow(() => h.run(text));
  assert.equal(h.result(), null, 'Invalid input must not leave exportable results');
  assert.equal(h.snapshot(), null, 'Invalid input must not leave validation results');
  assert.equal(h.poolCalls, calls, 'Reject before invoking the pooling engine');
  assert.equal(h.urlWrites.length, writes, 'Do not publish invalid input as a successful run');
  assert.equal(h.els['analysis-status'].hidden, true, 'Do not announce Analysis updated');
  assert.match(h.els['res-body'].textContent, new RegExp('row\\s+' + row + '\\b', 'i'));
  assert.match(h.els['res-body'].textContent, /integer|count/i);
  assert.equal(h.els.forest.innerHTML, '', 'Remove the previous forest plot');
  assert.equal(h.els.het.innerHTML, '', 'Remove previous heterogeneity');
  assert.equal(h.els['k-warn'].style.display, 'none');
}

test('P09-R1 plant: fractional events are refused before pooling, with a row diagnostic', () => {
  const h = harness();
  refused(h, '12.9,100,A\n20,100,B', 1);
});

test('P09-R1 plant: fractional totals and suffixes cannot produce a partial analysis', () => {
  const h = harness();
  for (const bad of ['12,100.9', '12patients,100', '12,100patients', '1e2,100', '0x10,100', '12.0,100']) {
    h.run(valid);
    refused(h, '5,100,First\n' + bad + ',Bad\n20,100,Last', 2);
  }
});

test('P09-R1 plant: missing, nonfinite, unsafe and out-of-range counts fail as whole rows', () => {
  const h = harness();
  const badRows = [',100', '12,', '12', 'NaN,100', '12,Infinity',
    '9007199254740992,9007199254740992', '12,9007199254740992',
    '12,' + '9'.repeat(400), '-1,100', '12,0', '101,100'];
  for (const bad of badRows) {
    assert.throws(() => h.parse(valid + '\n' + bad), /row\s+3\b/i, bad);
    refused(h, valid + '\n' + bad, 3);
  }
});

test('P09-R1 plant: diagnostics count physical rows, including blank lines', () => {
  const h = harness();
  refused(h, '\n12,100,A\n  \n20.9,100,B', 4);
});

test('P09-R1 plant: bus producer refuses malformed counts instead of exporting a truncated study', () => {
  const h = harness();
  h.els.src.value = '12.9,100,A\n20,100,B';
  assert.deepEqual(plain(h.window.__propMaBusStudies()), []);
});

test('P09-R1 control: valid integer studies still pool, render, export and recover after refusal', () => {
  const h = harness();
  h.run(valid);
  const expected = plain(h.snapshot());
  assert.equal(h.result().k, 2);
  assert.deepEqual(expected.studies.map(({x,n,label}) => ({x,n,label})), [
    {x:12,n:100,label:'A'}, {x:20,n:100,label:'B'}
  ]);
  assert.equal(h.els['analysis-status'].hidden, false);
  assert.match(h.els['res-body'].innerHTML, /12\/100/);
  assert.match(h.els.forest.innerHTML, /<polygon/);
  assert.equal(h.window.__propMaBusStudies().length, 2);
  h.run('12.9,100,A\n20,100,B');
  h.run(valid);
  assert.deepEqual(plain(h.snapshot()), expected);
  assert.equal(h.els['analysis-status'].hidden, false);
});

test('P09-R1 control: whitespace, CRLF, blank lines, signed/zero-padded integers and boundaries survive', () => {
  const h = harness();
  assert.deepEqual(plain(h.parse(' 0, 10, Zero \r\n\r\n+010, 010, All\r\n-0,10\r\n ')), [
    {x:0,n:10,label:'Zero'}, {x:10,n:10,label:'All'}, {x:0,n:10,label:'Study 4'}
  ]);
  assert.equal(h.parse('9007199254740991,9007199254740991')[0].x, Number.MAX_SAFE_INTEGER);
  for (const transform of ['logit', 'ft', 'raw']) for (const method of ['PM', 'DL', 'FE']) {
    h.run('0,10,Zero\n10,10,All\n4,20,Interior', transform, method);
    assert.equal(h.result().k, 3);
    assert.equal(h.els['analysis-status'].hidden, false);
    assert.ok(Number.isFinite(h.result().poolP));
  }
});

test('P09-R1 control: empty and single-study inputs retain the minimum-study refusal', () => {
  const h = harness();
  for (const input of ['', ' \n ', '12,100,A']) {
    h.run(input);
    assert.equal(h.result(), null);
    assert.equal(h.snapshot(), null);
    assert.equal(h.els['analysis-status'].hidden, true);
    assert.match(h.els['res-body'].textContent, /Need at least 2 studies/);
  }
});

// Values and versions are the actual R stdout captured in pass 1, not JS output.
const reference = JSON.parse(read('proportion-ma/tests/fixtures/p09-count-control.json'));
for (const [name, expected] of Object.entries(reference.cases)) {
  test('P09-R1 R control: ' + name + ' logit/PM matches the recorded metafor run', () => {
    const h = harness();
    h.run(expected.x.map((x, i) => [x, expected.n[i], 'R control ' + (i + 1)].join(',')).join('\n'),
      reference.transform, reference.method);
    const actual = h.result();
    assert.ok(actual, 'Valid integer input must produce results');
    for (const [quantity, value] of Object.entries(expected.values)) {
      assert.ok(Number.isFinite(actual[quantity]), quantity + ' must be finite');
      if (quantity === 'k' || quantity === 'df') assert.equal(actual[quantity], value);
      else assert.ok(Math.abs(actual[quantity] - value) <= reference.tolerance,
        name + ' ' + quantity + ': app=' + actual[quantity] + ', R=' + value);
    }
  });
}
