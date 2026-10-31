// node:test — proportion-ma/row-check.js, the one checker for "events, total, label" rows used by the
// page parser (excluded rows are listed with a reason) and by share set() (a file with any such row is refused).
// Rule: whole-number counts written in digits, 0 <= events <= total, total > 0. Nothing is truncated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const R = require('../../../../proportion-ma/row-check.js');
const ROW_CHECK = readFileSync(new URL('../../../../proportion-ma/row-check.js', import.meta.url), 'utf8');
const FEATURES = readFileSync(new URL('../../../../proportion-ma/alm-features.js', import.meta.url), 'utf8');

// The parser this file replaced (index.html parseTable on 03734146), kept here only as the reference that
// valid rows come out identical.
function legacyParse(text) {
  return text.trim().split(/\n/).map(function (l, i) {
    var parts = l.split(/,/).map(function (s) { return s.trim(); });
    var x = parseInt(parts[0], 10), n = parseInt(parts[1], 10);
    if (!Number.isFinite(x) || !Number.isFinite(n) || n <= 0 || x < 0 || x > n) return null;
    return { x: x, n: n, label: parts[2] || ('Study ' + (i + 1)) };
  }).filter(Boolean);
}

const EXAMPLE = '12, 150, Study A\n8, 90, Study B\n20, 220, Study C\n5, 60, Study D\n15, 180, Study E\n3, 40, Study F\n25, 300, Study G';

test('valid rows are returned exactly as the previous parser returned them (default example, edge counts, CRLF, no label)', () => {
  for (const text of [EXAMPLE, '0,10,Zero\n10,10,All\n007, 0100 ,Padded', '12,150,A\r\n8,90,B\r\n', '12,150\n8,90', '\n\n12,150,A\n\n8,90,B\n']) {
    const c = R.classify(text);
    assert.deepEqual(c.rows, legacyParse(text), JSON.stringify(text));
    assert.deepEqual(c.excluded, [], JSON.stringify(text));
  }
  assert.equal(R.classify(EXAMPLE).rows.length, 7);
});

test('malformed rows are excluded with a reason, never truncated or silently skipped', () => {
  const text = ['5,40,Alpha', '2.5,40,Half', '5,40.5,Frac', '45,40,Over', '-1,40,Neg', 'abc,40,Text', '5,0,Zero',
    '5,-40,NegN', '7', '5,,Empty', '1e1,40,Exp', '+5,40,Plus', '5,9007199254740993,Huge', '9,60,Beta'].join('\n');
  const c = R.classify(text);
  assert.deepEqual(c.rows, [{ x: 5, n: 40, label: 'Alpha' }, { x: 9, n: 60, label: 'Beta' }]);
  assert.deepEqual(c.excluded.map(e => [e.line, e.text, e.reason]), [
    [2, '2.5,40,Half', 'events not a whole number'],
    [3, '5,40.5,Frac', 'total not a whole number'],
    [4, '45,40,Over', 'events exceed the total'],
    [5, '-1,40,Neg', 'events negative'],
    [6, 'abc,40,Text', 'events is not a number'],
    [7, '5,0,Zero', 'total must be greater than 0'],
    [8, '5,-40,NegN', 'total negative'],
    [9, '7', 'fewer than 2 comma-separated fields (events, total)'],
    [10, '5,,Empty', 'total missing'],
    [11, '1e1,40,Exp', 'events must be written as a whole number in digits'],
    [12, '+5,40,Plus', 'events must be written as a whole number in digits'],
    [13, '5,9007199254740993,Huge', 'total too large'],
  ]);
  // The old parser analysed "2.5,40" as 2/40 and "5,40.5" as 5/40 (parseInt truncation): the defect this fixes.
  assert.deepEqual(legacyParse('2.5,40,Half\n5,40.5,Frac'), [{ x: 2, n: 40, label: 'Half' }, { x: 5, n: 40, label: 'Frac' }]);
  assert.deepEqual(R.classify('2.5,40,Half\n5,40.5,Frac').rows, []);
});

test('share set() refuses a file with any malformed row before changing anything; valid files still restore', () => {
  const controls = [{ value: '', dispatchEvent() {} }, { value: '', dispatchEvent() {} }, { checked: false, dispatchEvent() {} }];
  let runs = 0, share;
  const nodes = {
    src: { value: '12,150,A\n8,90,B' }, trans: { value: 'logit' }, 'tau-est': { value: 'PM' },
    'alm-axis-mount': { querySelectorAll: () => controls }, 'btn-run': { click: () => { runs++; } }
  };
  const ctx = { AlmFeatures: { register: (_app, spec) => { share = spec.share; } }, document: { getElementById: id => nodes[id] }, Event };
  runInNewContext(ROW_CHECK, ctx);
  runInNewContext(FEATURES, ctx);
  const plain = x => JSON.parse(JSON.stringify(x)), initial = plain(share.get());
  for (const src of ['5,40,A\n2.5,40,B\n9,60,C', '5,40,A\n5,40.5,B\n9,60,C', '45,40,A\n9,60,B\n14,75,C', '-1,40,A\n9,60,B\n14,75,C',
    'abc,40,A\n9,60,B\n14,75,C', '5,0,A\n9,60,B\n14,75,C', '7\n9,60,B\n14,75,C']) {
    assert.throws(() => share.set({ ...initial, src }), /^Error: line \d+ \(.+\): /, src);
    assert.deepEqual(plain(share.get()), initial);
    assert.equal(runs, 0);
  }
  assert.throws(() => share.set({ ...initial, src: '5,40,A\n2.5,40,B\n-1,9,C\n9,60,D' }), /line 2 \(2\.5,40,B\): events not a whole number \(and 1 more unusable rows\)/);
  share.set({ ...initial, src: '5,40,A\n\n9,60,B\n' });
  assert.equal(nodes.src.value, '5,40,A\n\n9,60,B\n');
  assert.equal(runs, 1);
});

test('share set() fails closed when the row checker is not loaded', () => {
  const controls = [{ value: '', dispatchEvent() {} }, { value: '', dispatchEvent() {} }, { checked: false, dispatchEvent() {} }];
  let runs = 0, share;
  const nodes = {
    src: { value: '12,150,A\n8,90,B' }, trans: { value: 'logit' }, 'tau-est': { value: 'PM' },
    'alm-axis-mount': { querySelectorAll: () => controls }, 'btn-run': { click: () => { runs++; } }
  };
  runInNewContext(FEATURES, { AlmFeatures: { register: (_app, spec) => { share = spec.share; } }, document: { getElementById: id => nodes[id] }, Event });
  assert.throws(() => share.set({ ...share.get(), src: '5,40,A\n9,60,B' }), /row checker is not available/);
  assert.equal(nodes.src.value, '12,150,A\n8,90,B');
  assert.equal(runs, 0);
});
