import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import E from '../../../../shared/evalue.js';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const start = html.indexOf('    (function () {', html.indexOf('// E-value widget'));
const end = html.indexOf('    })();', start);
assert.ok(start >= 0 && end > start, 'Exercise the actual E-value widget source');
const widgetSource = html.slice(start, end + '    })();'.length);

// A minimal DOM exercises the real input handlers, rendered text, and accessor
// without a browser. textContent replaces innerHTML, as it does in the DOM.
function widget() {
  const elements = Object.fromEntries(['measure', 'point', 'lo', 'hi', 'rare'].map(id => [
    'ev-' + id, {
      value: { measure: 'RR', point: '2', lo: '1.5', hi: '2.7', rare: '' }[id],
      checked: false, validity: { badInput: false },
      addEventListener(event, fn) { assert.equal(event, 'input'); this.onInput = fn; }
    }
  ]));
  let output = '';
  elements['ev-out'] = {
    get innerHTML() { return output; }, set innerHTML(value) { output = value; },
    get textContent() { return output.replace(/<[^>]*>/g, ''); },
    set textContent(value) { output = value; }
  };
  const window = { AlmEValue: E };
  const document = { readyState: 'complete', getElementById: id => elements[id] };
  vm.runInNewContext(widgetSource, { window, document });
  return {
    get result() { return window.__almLastEValue(); },
    get text() { return elements['ev-out'].textContent; },
    set(measure, point, lo, hi, badField) {
      for (const [id, value] of Object.entries({ measure, point, lo, hi })) {
        elements['ev-' + id].value = String(value);
        elements['ev-' + id].validity.badInput = id === badField;
      }
      elements['ev-lo'].onInput();
    }
  };
}

const impossible = [
  ['reversed RR bounds', 'RR', 2, 3, 1.5],
  ['RR point below CI', 'RR', 2, 3, 4],
  ['RR point above CI', 'RR', 2, 0.4, 0.8],
  ['null RR point outside CI', 'RR', 1, 1.2, 1.6],
  ['zero RR lower bound', 'RR', 2, 0, 3],
  ['negative RR lower bound', 'RR', 2, -1, 3],
  ['nonfinite RR lower bound', 'RR', 2, NaN, 3],
  ['nonfinite RR upper bound', 'RR', 2, 1.5, Infinity],
  ['reversed OR bounds', 'OR', 2, 3, 1.5],
  ['HR point below CI', 'HR', 2, 3, 4],
  ['reversed SMD bounds', 'SMD', -0.3, -0.1, -0.6],
  ['SMD point outside CI', 'SMD', -0.3, 0.1, 0.6]
];

for (const [name, measure, point, lo, hi] of impossible) {
  test(`P20-R7 plant engine: ${name}`, () => {
    assert.throws(() => E.eValues(measure, point, lo, hi),
      { name: 'RangeError', message: /confidence interval/i });
  });
  test(`P20-R7 plant widget: ${name} clears previous verdict`, () => {
    const ui = widget();
    assert.ok(Number.isFinite(ui.result.ci), 'Start with a valid displayed verdict');
    ui.set(measure, point, lo, hi);
    assert.equal(ui.result, null, 'Impossible intervals must not expose a numeric verdict');
    assert.match(ui.text, /refused.*confidence interval/i);
    assert.doesNotMatch(ui.text, /E-value \(.*\) =|NaN|Infinity/);
    ui.set('RR', 2, 0.8, 3);
    assert.equal(ui.result.ci, 1, 'Recover on a valid null-crossing interval');
  });
}

for (const badField of ['lo', 'hi']) {
  test(`P20-R7 plant widget: browser badInput in ${badField} is not a missing bound`, () => {
    const ui = widget();
    ui.set('RR', 2, badField === 'lo' ? '' : 1.5, badField === 'hi' ? '' : 3, badField);
    assert.equal(ui.result, null);
    assert.match(ui.text, /refused.*confidence interval/i);
  });
}

test('P20-R7 control: valid ratio intervals retain the existing native R reference', () => {
  const ref = JSON.parse(readFileSync(new URL('tests/fixtures/evalue-input-oracle.json', root), 'utf8'));
  for (const c of ref.cases.filter(c => c.lo != null && c.hi != null)) {
    const r = E.eValues(c.measure, c.point, c.lo, c.hi, { rare: c.rare });
    for (const key of ['point', 'ci']) {
      assert.ok(Math.abs(r[key] - c.expected[key]) <= 1e-6, `${c.id}: ${key}`);
    }
  }
});

test('P20-R7 control: signed SMD/d and zero-width intervals remain valid', () => {
  for (const measure of ['SMD', 'D', 'smd']) {
    for (const [point, lo, hi] of [[-0.3, -0.6, -0.1], [0.3, 0.1, 0.6], [0, 0, 0]]) {
      const r = E.eValues(measure, point, lo, hi);
      assert.equal(r.rr.point, Math.exp(0.91 * point));
      assert.ok(Number.isFinite(r.point) && Number.isFinite(r.ci));
      assert.ok(r.point >= r.ci && r.ci >= 1);
    }
  }
  assert.equal(E.eValues('RR', 2, 2, 2).ci, E.eValue(2));
});

test('P20-R7 control: missing and partial CI behavior is unchanged by this complete-CI fix', () => {
  assert.equal(E.eValues('RR', 2, null, null).ci, 1);
  assert.equal(E.eValues('RR', 2, 1.5, null).ci, E.eValue(1.5));
  assert.equal(E.eValues('RR', 0.6, null, 0.9).ci, E.eValue(0.9));
  const ui = widget();
  ui.set('RR', 2, '', '');
  assert.equal(ui.result.ci, 1);
  ui.set('RR', 2, 1.5, '');
  assert.equal(ui.result.ci, E.eValue(1.5));
});

test('P20-R7 control: widget displays valid, null-crossing, and signed SMD intervals', () => {
  const ui = widget();
  for (const [measure, point, lo, hi] of [
    ['RR', 2, 1.5, 2.7], ['RR', 2, 0.8, 3], ['RR', 0.6, 0.4, 0.9],
    ['OR', 2, 1.5, 2.7], ['HR', 1.6, 1.2, 2.1], ['SMD', -0.3, -0.6, -0.1]
  ]) {
    ui.set(measure, point, lo, hi);
    assert.equal(ui.result.ci, E.eValues(measure, point, lo, hi).ci);
    assert.match(ui.text, /E-value \(point\) =/);
    assert.doesNotMatch(ui.text, /refused|NaN|Infinity/i);
  }
});

// Read inside each test: failure to generate the native oracle must not hide
// the independent planted-defect or control results above.
const nativeReference = () => JSON.parse(readFileSync(new URL(
  'effect-size-converter/tests/fixtures/p20-r7-evalue-reference.json', root), 'utf8'));

test('P20-R7 control: fresh R oracle records package versions and exact complete intervals', () => {
  const ref = nativeReference();
  for (const name of ['R', 'EValue', 'jsonlite']) assert.ok(ref.provenance[name]);
  assert.deepEqual(ref.cases.map(c => [c.id, c.point, c.lo, c.hi]), [
    ['reversed', 2, 3, 1.5], ['outside', 2, 3, 4],
    ['valid', 2, 1.5, 2.7], ['crossing', 2, 0.8, 3]
  ]);
});

for (const id of ['reversed', 'outside', 'valid', 'crossing']) {
  test(`P20-R7 ${['reversed', 'outside'].includes(id) ? 'plant' : 'control'} native R parity: ${id}`, () => {
    const c = nativeReference().cases.find(c => c.id === id);
    if (['reversed', 'outside'].includes(id)) {
      assert.equal(c.accepted, false, 'Native EValue must independently reject this interval');
      assert.ok(c.error);
      assert.throws(() => E.eValues('RR', c.point, c.lo, c.hi), /confidence interval/i);
    } else {
      assert.equal(c.accepted, true, c.error);
      const actual = E.eValues('RR', c.point, c.lo, c.hi);
      for (const key of ['point', 'ci']) {
        assert.ok(Math.abs(actual[key] - c.expected[key]) <= 1e-6, `${id}: ${key}`);
      }
    }
  });
}
