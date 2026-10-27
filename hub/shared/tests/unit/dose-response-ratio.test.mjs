import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const base = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('dose-response-ma/index.html', base), 'utf8');
function app() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, options: [], innerHTML: '', textContent: '', addEventListener(event, fn) { this[event] = fn; } });
    return elements.get(id);
  };
  for (const [id, value] of Object.entries({'f-shape':'linear','f-proc':'2stage','f-cov':'indep','f-method':'FE'})) get(id).value = value;
  const context = vm.createContext({ document: { getElementById: get, readyState: 'complete' }, console });
  context.window = context;
  context.alm = { analysisLifecycle: fn => fn, plotExport() {} };
  for (const file of ['shared/ma-core.js', 'shared/dose-response.js']) vm.runInContext(readFileSync(new URL(file, base), 'utf8'), context);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInContext(script, context);
  return { get, run(text) { get('f-data').value = text; get('btn-run').click(); return context._almLastDoseResponse(); } };
}
function data(values, reference = 0) {
  return ['A','B'].flatMap(id => [id+',0,20,100,'+reference+',,ci', ...values.map((v,i) => id+','+(i+1)+',20,100,'+v+',0.1,ci')]).join('\n');
}
test('plant P0-23: ratio-like non-reference input warns in display and export without changing values', () => {
  const a = app();
  const r = a.run(data([0.9, 0.8, 0.7]));
  assert.ok(r, 'valid zero-reference fixture must reproduce an accepted fit');
  assert.match(a.get('msgs').innerHTML, /may be raw relative risks/i);
  assert.match(r.warnings.join(' '), /may be raw relative risks/i);
  assert.match(a.get('msgs').innerHTML, /natural logarithm/i);
  assert.match(a.get('msgs').innerHTML, /SE.*log/i);
  assert.ok(r.slope > 0, 'warning must not silently transform ambiguous input');
});
test('control: negative log risks fit without ratio warning and clear the previous warning', () => {
  const a = app(); a.run(data([0.9,0.8,0.7]));
  const r = a.run(data([Math.log(0.9),Math.log(0.8),Math.log(0.7)]));
  assert.ok(r.slope < 0);
  assert.doesNotMatch(a.get('msgs').innerHTML, /may be raw relative risks/i);
  assert.doesNotMatch(r.warnings.join(' '), /may be raw relative risks/i);
});
test('control: small positive log risks remain accepted without ratio warning', () => {
  const a = app(); const r = a.run(data([0.05,0.1,0.15]));
  assert.ok(r.slope > 0);
  assert.doesNotMatch(a.get('msgs').innerHTML, /may be raw relative risks/i);
});
test('control: raw reference RR of 1 remains rejected and clears results', () => {
  const a = app(); a.run(data([0.1,0.2,0.3]));
  assert.equal(a.run(data([0.9,0.8,0.7],1)), null);
  assert.match(a.get('msgs').innerHTML, /reference row has logRR 0/);
  assert.equal(a.get('coef-body').innerHTML, '');
});

test('control: mixed studies keep a scale warning for the ratio-like study only', () => {
  const a = app();
  const mixed = data([0.9,0.8,0.7]).split('\n').map(line => {
    const cells = line.split(',');
    if (cells[0] === 'B' && cells[5]) cells[4] = String(Math.log(Number(cells[4])));
    return cells.join(',');
  }).join('\n');
  const r = a.run(mixed);
  assert.ok(r);
  assert.match(r.warnings.join(' '), /study\/studies A are between/);
  assert.doesNotMatch(r.warnings.join(' '), /study\/studies A, B/);
});
