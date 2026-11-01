// csv-upload.js and decimal commas: an unquoted "0,1" splits one number into two fields and pushes the row past the
// header, so the fields beyond the header were dropped without a word ("Smith,0,1,0.04" read yi = 0, vi = 1).
// The row is now named in a notice (shown in the upload panel). Notices are not warnings: what an app accepts or
// refuses is unchanged, and rows without the pattern give no notice.
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
const COLS = [{ name: 'study', type: 'string' }, { name: 'yi', type: 'float' }, { name: 'vi', type: 'float' }];

test('csv-upload: an unquoted decimal comma that overflows the header is named in a notice', () => {
  const r = load()('study,yi,vi\nSmith,0,1,0.04\nJones,0.2,0.05\nLee,-0,25,0.03\n', COLS);
  assert.deepEqual([...r.notices], [
    'row 1: 4 fields but the header has 3; "0,1" may be a decimal comma. Use "." as the decimal point, or quote the value.',
    'row 3: 4 fields but the header has 3; "-0,25" may be a decimal comma. Use "." as the decimal point, or quote the value.']);
  assert.deepEqual([...r.warnings], []);          // acceptance unchanged: warnings are what apps refuse on
  assert.equal(r.rows[0].yi, 0);                   // and the values read are unchanged (the notice says why)
});

test('csv-upload: no notice for regular rows, trailing empty fields, quoted decimal commas or non-numeric extras', () => {
  const parse = load();
  for (const text of ['study,yi,vi\nA,0.1,0.04\nB,0.2,0.05\n', 'study,yi,vi\nA,0.1,0.04,\n', 'study,yi,vi\nA,0.1,0.04,note here\n']) {
    assert.deepEqual([...parse(text, COLS).notices], [], text);
  }
  const q = parse('study,yi,vi\nA,"0,1",0.04\n', COLS);
  assert.deepEqual([...q.notices], []);
  assert.deepEqual([...q.warnings], ['row 1: not float: 0,1']);  // a quoted decimal comma was already refused
});
