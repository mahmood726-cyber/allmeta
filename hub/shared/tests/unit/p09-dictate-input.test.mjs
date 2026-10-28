import test from 'node:test';
import assert from 'node:assert/strict';
import { app, plain, valid } from './p09-proportion-harness.mjs';

const invalidRows = [
  ['fractional events', '12.5,150,B'],
  ['events suffix', '12oops,150,B'],
  ['fractional total', '12,150.5,B'],
  ['total suffix', '12,150oops,B'],
  ['exponent token', '1e2,150,B'],
  ['hexadecimal token', '0xC,150,B'],
  ['unsafe integer', '9007199254740993,9007199254740994,B'],
  ['missing total column', '12'],
  ['extra columns', '12,150,B,unexpected'],
  ['empty count', ',150,B'],
  ['nonnumeric count', 'oops,150,B'],
  ['negative events', '-1,150,B'],
  ['zero total', '0,0,B'],
  ['events exceed total', '151,150,B'],
];

for (const [name, row] of invalidRows) {
  test('P09-D3 plant: parser refuses ' + name + ' with a line number', () => {
    const a = app();
    assert.throws(() => a.parse('12,150,A\n' + row + '\n20,220,C'), /Line 2:/);
  });
}

test('P09-D3 plant: mixed malformed rows refuse the entire fit with corrective instructions', () => {
  const a = app();
  a.run('12,150,A\n12oops,150,B\n20,220,C');
  assert.equal(a.results(), null, 'Do not fit the two valid rows or coerce the third');
  assert.equal(a.snapshot(), null);
  assert.match(a.elements['res-body'].innerHTML, /Line 2:/);
  assert.match(a.elements['res-body'].innerHTML, /whole numbers/i);
  assert.match(a.elements['res-body'].innerHTML, /correct.*run analysis/i);
  assert.equal(a.elements['analysis-status'].hidden, true);
});

test('P09-D3 plant: diagnostics retain physical line numbers and report every bad row', () => {
  const a = app();
  a.run('\n12,150,A\n\n12.5,150,B\n20,220,C\n8,90,D,extra');
  const message = a.elements['res-body'].innerHTML;
  assert.match(message, /Line 4:.*whole numbers/i);
  assert.match(message, /Line 6:.*columns/i);
  assert.match(message, /correct.*run analysis/i);
  assert.equal(a.results(), null);
});

test('P09-D3 plant: malformed input cannot produce a partial cross-tool payload', () => {
  const a = app();
  a.elements.src.value = '12,150,A\noops,90,B\n20,220,C';
  assert.deepEqual(plain(a.window.__propMaBusStudies()), []);
});

test('P09-D3 plant: programmatic row loading refuses fractional counts', () => {
  const a = app();
  a.window.__almLoad([{ events: 12.5, total: 150 }, { events: 8, total: 90 }]);
  assert.equal(a.results(), null);
  assert.match(a.elements['res-body'].innerHTML, /Line 1:.*whole numbers/i);
});

test('P09-D3 control: integer boundaries, optional labels, whitespace and CRLF remain valid', () => {
  const a = app();
  assert.deepEqual(plain(a.parse(' 0,10,none \r\n10,10,all\r\n4,20\r\n6,30, \r\n')), [
    { x: 0, n: 10, label: 'none' }, { x: 10, n: 10, label: 'all' },
    { x: 4, n: 20, label: 'Study 3' }, { x: 6, n: 30, label: 'Study 4' },
  ]);
  assert.deepEqual(plain(a.parse('\n0,10,none\n \n10,10,all\n')), [
    { x: 0, n: 10, label: 'none' }, { x: 10, n: 10, label: 'all' },
  ]);
  assert.deepEqual(plain(a.parse(' \r\n ')), []);
});

test('P09-D3 control: all transforms and estimators fit every valid study', () => {
  const a = app();
  for (const transform of ['logit', 'ft', 'raw']) for (const estimator of ['PM', 'DL', 'FE']) {
    a.elements.trans.value = transform;
    a.elements['tau-est'].value = estimator;
    a.run(valid);
    assert.equal(a.results().k, 3);
    assert.ok(Number.isFinite(a.results().poolP));
    assert.equal(a.snapshot().studies.length, 3);
    assert.match(a.elements['res-body'].innerHTML, /pooled-row/);
    assert.match(a.elements.het.innerHTML, /prediction interval/);
    assert.match(a.elements.forest.innerHTML, /<polygon /);
    assert.equal(a.elements['analysis-status'].hidden, false);
  }
});

test('P09-D3 control: valid cross-tool payload and row loading retain all studies', () => {
  const a = app();
  a.window.__almLoad([{ events: 0, total: 10 }, { events: 10, total: 10 }, { x: 4, n: 20 }]);
  assert.equal(a.results().k, 3);
  const studies = a.window.__propMaBusStudies();
  assert.equal(studies.length, 3);
  assert.ok(studies.every(row => Number.isFinite(row.est) && row.se > 0));
});
