// node:test — hub/shared/decimal-sep.js, the one decimal-separator rule for pasted study rows
// (Mahmood 2026-10-31: explicit setting, default '.', warn when input looks ambiguous, never reinterpret silently).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../../decimal-sep.js');

const HET = '# Example: logOR across trials\nTrial A, -0.20, 0.10\nTrial B, -0.35, 0.12\nTrial C, 0.05, 0.18';

test('normalize: absent/empty/"." is the default ".", "," is comma, anything else is refused (null)', () => {
  for (const v of [undefined, null, '', '.']) assert.equal(D.normalize(v), '.');
  assert.equal(D.normalize(','), ',');
  for (const v of [';', 'comma', ' ,', 0, '..']) assert.equal(D.normalize(v), null, String(v));
});

test('parseNumber is the strict whole-token rule of csv-upload _coerce / row-check, for both separators', () => {
  const dotOk = { '0.1': 0.1, ' 1.5 ': 1.5, '-2': -2, '+3': 3, '.5': 0.5, '1.': 1, '1e-3': 0.001, '2.5E+2': 250 };
  for (const [t, v] of Object.entries(dotOk)) assert.equal(D.parseNumber(t, '.'), v, t);
  const commaOk = { '0,1': 0.1, ' 1,5 ': 1.5, '-2': -2, '+3': 3, ',5': 0.5, '1,': 1, '1e-3': 0.001, '2,5E+2': 250 };
  for (const [t, v] of Object.entries(commaOk)) assert.equal(D.parseNumber(t, ','), v, t);
  // Trailing garbage, hex, Infinity, empty, embedded space and the OTHER separator are never read as a number.
  for (const t of ['0.1x', '0x10', 'Infinity', 'NaN', '', '1 2', '0,1', '1,000.5', '--1']) assert.ok(Number.isNaN(D.parseNumber(t, '.')), t);
  for (const t of ['0,1x', '0x10', 'Infinity', '', '1 2', '0.1', '1.000,5', '1,2,3']) assert.ok(Number.isNaN(D.parseNumber(t, ',')), t);
  assert.ok(Number.isNaN(D.parseNumber('1', ';')), 'unknown separator');
});

test('"." (default): the parser input is returned byte-for-byte unchanged, so existing results cannot change', () => {
  for (const text of [HET, 'a,b\r\nc', '', '  \n#x\n1;2', 'Eta, 0,1, 0.1', '12,150, Study A']) {
    for (const sep of [undefined, '', '.']) {
      const p = D.prepare(text, sep, { join: '\t', quote: true });
      assert.equal(p.text, text);
      assert.deepEqual(p.errors, []);
      assert.equal(p.sep, '.');
    }
  }
});

test('"." ambiguity: planted decimal-comma rows are named; ordinary rows, comments and spaced labels are not', () => {
  const planted = ['Trial A, -0.20, 0.10', 'Eta, 0,1, 0.1', 'Tab\t0,1\t0.05', 'Semi;-0,25;0.05', '# Kappa, 0,1, 0.1', 'Zed,0,1,0.1'].join('\n');
  const rows = D.ambiguousRows(planted, { expect: 3 });
  assert.deepEqual(rows.map(r => r.line), [2, 3, 4, 6]);
  assert.deepEqual(rows[0].tokens, ['0,1']);
  assert.deepEqual(rows[2].tokens, ['-0,25']);
  // Without a fixed field count a compact "Zed,0,1,0.1" cannot be told from compact integer data.
  assert.deepEqual(D.ambiguousRows('Zed,0,1,0.1').map(r => r.line), []);
  assert.deepEqual(D.ambiguousRows('A,10,100,12,100', { expect: 5 }), []);
  assert.deepEqual(D.ambiguousRows(HET), []);
  assert.deepEqual(D.ambiguousRows('Smith, 2001, -0.2, 0.1\n"Jones, J", 0.3, 0.2'), []);
  const msg = D.ambiguityMessage(rows);
  assert.match(msg, /^Possible decimal commas on line 2 \("0,1"\), line 3/);
  assert.match(msg, /set Decimal separator to ","/);
  assert.equal(D.ambiguityMessage([]), '');
  assert.equal(D.prepare(planted, '.', { expect: 3 }).warning, msg);
});

test('",": tab or semicolon rows are rewritten to the app delimiter with "." numbers; labels keep their commas', () => {
  const p = D.prepare('# c\nEta;0,1;0,05\nTab\t-0,25\t1e-3\n\nSmith, J; 0,3 ;0,2', ',', { join: ', ' });
  assert.deepEqual(p.errors, []);
  assert.equal(p.text, '# c\nEta, 0.1, 0.05\nTab, -0.25, 1e-3\n\nSmith, J, 0.3, 0.2');
  const q = D.prepare('Smith, J;0,3;0,2\nSay "hi";1;2', ',', { join: ', ', quote: true });
  assert.equal(q.text, '"Smith, J", 0.3, 0.2\n"Say ""hi""", 1, 2');
  const t = D.prepare('Smith, J;0,3;0,2', ',', { join: '\t' });
  assert.equal(t.text, 'Smith, J\t0.3\t0.2');
});

test('",": a comma-delimited row is refused with the reason (delimiter conflict); line count is preserved', () => {
  const text = 'Eta;0,1;0,05\nEta, 0,1, 0.1\nTheta;0,2;0,06';
  const p = D.prepare(text, ',', { join: ', ' });
  assert.equal(p.text.split('\n').length, 3);
  assert.equal(p.text.split('\n')[1], '');
  assert.deepEqual(p.errors.map(e => e.line), [2]);
  assert.match(p.errors[0].reason, /separated by tabs or semicolons/);
  assert.deepEqual(D.errorMessages(p), ['Line 2 (Eta, 0,1, 0.1): the decimal separator is set to ",", so fields must be separated by tabs or semicolons; this row has neither']);
});

test('",": "." numbers and number-like garbage are refused, never re-read', () => {
  const p = D.prepare('A;1.5;0,1\nB;0,1x;0,2\nC;0,1;0x10\nD;1,2,3;0,1\nE;Infinity;0,1\nF;0,4;0,1', ',', { join: ', ' });
  assert.deepEqual(p.errors.map(e => e.line), [1, 2, 4]);
  assert.match(p.errors[0].reason, /"1\.5" uses "\." but the decimal separator is set to ","/);
  assert.match(p.errors[1].reason, /"0,1x" is not a number/);
  // "0x10" and "Infinity" contain no separator: left as they are for the app's own strict check to refuse.
  assert.equal(p.text.split('\n')[2], 'C, 0.1, 0x10');
  assert.equal(p.text.split('\n')[5], 'F, 0.4, 0.1');
});

test('",": comma-decimal semicolon data equals the "." version of the same data after the rewrite', () => {
  const comma = HET.split('\n').map(l => l.startsWith('#') ? l : l.split(', ').map(f => f.replace('.', ',')).join(';')).join('\n');
  assert.notEqual(comma, HET);
  assert.equal(D.prepare(comma, ',', { join: ', ' }).text, HET);
});

test('Methods note only for ","; read/restore default to "." when the control or the stored field is absent', () => {
  assert.equal(D.methodsNote('.'), '');
  assert.equal(D.methodsNote(undefined), '');
  assert.match(D.methodsNote(','), /decimal comma/);
  assert.equal(D.read('f-decsep'), '.');            // no document in node: the default
  assert.equal(D.restore('f-decsep', undefined), '.');   // a link made before the setting existed
  assert.equal(D.restore('f-decsep', ','), ',');
  assert.equal(D.restore('f-decsep', 'x'), null);
  assert.equal(D.prepare('A;1;2', ';').sep, null);
});
