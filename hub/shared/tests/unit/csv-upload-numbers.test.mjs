// csv-upload.js number coercion: a file value that is not a complete decimal/exponent number is warned and left
// null (the importing app then refuses or lists the row), never read as a different number. Number() alone would
// read 0x10 as 16, 0b11 as 3 and 0o7 as 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../csv-upload.js', import.meta.url), 'utf8');
function load() {
  const window = {};
  vm.runInNewContext(SRC, { window, document: {}, Blob: function () {}, URL: {} });
  return window.alm.csvUpload.parse;
}
const COLS = [{ name: 'yi', type: 'float' }, { name: 'n', type: 'int' }];

test('csv-upload: non-decimal and partial number tokens are warned and never read', () => {
  const parse = load();
  const r = parse('yi,n\n0x10,0x10\n0b11,0b11\n0o7,0o7\n0.1x,5x\nInfinity,1 2\n,\n', COLS);
  assert.deepEqual(Array.from(r.rows, x => [x.yi, x.n]), [[null, null], [null, null], [null, null], [null, null], [null, null], [null, null]]);
  assert.deepEqual([...r.warnings], [
    'row 1: not float: 0x10', 'row 1: not int: 0x10', 'row 2: not float: 0b11', 'row 2: not int: 0b11',
    'row 3: not float: 0o7', 'row 3: not int: 0o7', 'row 4: not float: 0.1x', 'row 4: not int: 5x',
    'row 5: not float: Infinity', 'row 5: not int: 1 2', 'row 6: missing float', 'row 6: missing int'
  ]);
});

test('csv-upload: documented number forms stay accepted', () => {
  const parse = load();
  const r = parse('yi,n\n+0.25,+12\n1e-3,1e2\n.5, 7 \n-2.,0\n', COLS);
  assert.deepEqual(Array.from(r.rows, x => [x.yi, x.n]), [[0.25, 12], [0.001, 100], [0.5, 7], [-2, 0]]);
  assert.deepEqual([...r.warnings], []);
  const frac = parse('n\n4.5\n', [{ name: 'n', type: 'int' }]);
  assert.deepEqual([frac.rows[0].n, [...frac.warnings]], [null, ['row 1: not int: 4.5']]);
});
