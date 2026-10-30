import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import E from '../../../../shared/evalue.js';

const html = readFileSync(new URL('../../../../effect-size-converter/index.html', import.meta.url), 'utf8');
const widgetSource = html.match(/\/\/ E-value widget[^\n]*\n([\s\S]*?)\n\s*window\.__almResults =/)?.[1];
assert.ok(widgetSource, 'execute the actual independent E-value widget from the converter');

// Only the DOM is stubbed. Parsing, event registration, calculation, formatting,
// and the exported result accessor all run from the unchanged production widget.
function widget(point = '2', lo = '', hi = '') {
  const nodes = new Map();
  for (const [id, value] of Object.entries({
    'ev-measure': 'RR', 'ev-point': point, 'ev-lo': lo, 'ev-hi': hi,
    'ev-rare': '', 'ev-out': '',
  })) {
    const listeners = new Map();
    nodes.set(id, {
      value, checked: false, innerHTML: '', textContent: '',
      addEventListener(type, fn) { listeners.set(type, fn); },
      input(value) {
        this.value = value;
        assert.ok(listeners.has('input'), `${id} has an input handler`);
        listeners.get('input')();
      },
    });
  }
  const window = { AlmEValue: E };
  vm.runInNewContext(widgetSource, {
    window,
    document: { readyState: 'complete', getElementById: id => nodes.get(id) },
  }, { filename: 'effect-size-converter/index.html (E-value widget)' });
  return { el: id => nodes.get(id), result: () => window.__almLastEValue() };
}

for (const point of [2, 0.6]) {
  test(`plant P20-R2: RR=${point} without CI bounds returns missing CI`, () => {
    for (const bound of [null, undefined]) {
      const result = E.eValues('RR', point, bound, bound);
      assert.equal(result.ci, null);
      assert.equal(result.point, E.eValue(point), 'point E-value is still available');
      assert.equal(result.rr.lo, null);
      assert.equal(result.rr.hi, null);
    }
  });
}

test('plant P20-R2: missing CI stays missing at the null and for mapped measures', () => {
  for (const [measure, point] of [['RR', 1], ['OR', 2], ['HR', 1.6], ['SMD', -0.3], ['D', 0.3]]) {
    for (const rare of [false, true]) {
      const result = E.eValues(measure, point, null, null, { rare });
      assert.equal(result.ci, null, `${measure}, rare=${rare}`);
      assert.ok(Number.isFinite(result.point));
    }
  }
});

test('plant P20-R2: an absent nearest-null bound cannot imply CI E-value one', () => {
  assert.equal(E.eValues('RR', 2, null, 3).ci, null);
  assert.equal(E.eValues('RR', 0.6, 0.4, null).ci, null);
});

test('control P20-R2: supplied intervals crossing or touching the null retain CI E-value one', () => {
  for (const [point, lo, hi] of [[2, 0.9, 3], [0.6, 0.4, 1.1], [2, 1, 3], [0.6, 0.4, 1], [1, 1, 1]]) {
    assert.equal(E.eValues('RR', point, lo, hi).ci, 1);
  }
});

test('control P20-R2: supplied intervals excluding the null retain their nearest-bound E-value', () => {
  for (const [point, lo, hi, nearest] of [[2, 1.5, 2.7, 1.5], [0.6, 0.4, 0.9, 0.9]]) {
    const result = E.eValues('RR', point, lo, hi);
    assert.equal(result.ci, E.eValue(nearest));
    assert.ok(result.ci > 1);
    assert.equal(result.point, E.eValue(point));
  }
});

test('control P20-R2: a supplied nearest-null bound remains usable without the farther bound', () => {
  assert.equal(E.eValues('RR', 2, 1.5, null).ci, E.eValue(1.5));
  assert.equal(E.eValues('RR', 0.6, null, 0.9).ci, E.eValue(0.9));
});

for (const point of ['2', '0.6']) {
  test(`plant P20-R2: converter RR=${point} with blank bounds renders unavailable and exports null`, () => {
    const page = widget(point);
    assert.match(page.el('ev-out').innerHTML, /E-value \(CI bound nearest null\) = <strong>—<\/strong>/);
    assert.equal(page.result().ci, null);
    assert.ok(page.el('ev-out').innerHTML.includes(`E-value (point) = <strong>${E.eValue(Number(point)).toFixed(3)}</strong>`));
  });
}

test('plant P20-R2: clearing converter bounds replaces a previous numeric CI result', () => {
  const page = widget('2', '1.5', '2.7');
  assert.equal(page.result().ci, E.eValue(1.5));
  page.el('ev-lo').input('');
  page.el('ev-hi').input('');
  assert.match(page.el('ev-out').innerHTML, /E-value \(CI bound nearest null\) = <strong>—<\/strong>/);
  assert.equal(page.result().ci, null);
  page.el('ev-lo').input('0.9');
  page.el('ev-hi').input('3');
  assert.equal(page.result().ci, 1, 'supplying a crossing interval restores CI E-value one');
  assert.match(page.el('ev-out').innerHTML, /E-value \(CI bound nearest null\) = <strong>1\.000<\/strong>/);
});

test('control P20-R2: converter supplied intervals render and export numeric CI E-values', () => {
  for (const [point, lo, hi, expected] of [
    ['2', '0.9', '3', 1], ['0.6', '0.4', '1.1', 1],
    ['2', '1.5', '2.7', E.eValue(1.5)], ['0.6', '0.4', '0.9', E.eValue(0.9)],
  ]) {
    const page = widget(point, lo, hi);
    assert.equal(page.result().ci, expected);
    assert.ok(page.el('ev-out').innerHTML.includes(`E-value (CI bound nearest null) = <strong>${expected.toFixed(3)}</strong>`));
  }
});
