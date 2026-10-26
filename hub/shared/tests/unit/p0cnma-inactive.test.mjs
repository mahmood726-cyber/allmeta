import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../../../component-nma/index.html', import.meta.url), 'utf8');
const code = html.slice(html.indexOf('    // Parse:'), html.indexOf('    // --- matrix math'));
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
const parse = (s, inactive) => JSON.parse(JSON.stringify(ctx.parse(s, inactive)));
test('plant P0-35: selected placebo is empty; active drug remains', () => {
  for (const label of ['placebo', 'Placebo', 'PBO']) {
    const r = parse('drug | '+label+' | -0.3 | 0.1', label.toLowerCase())[0];
    assert.deepEqual(r.B, []); assert.deepEqual(r.A, ['drug']);
  }
});
test('plant P0-40: inactive in combination is removed; active combination is retained', () => {
  assert.deepEqual(parse('drug+control | control | -0.3 | 0.1')[0].A, ['drug']);
  assert.throws(() => parse('drug+control | drug | -0.3 | 0.1'));
  assert.deepEqual(parse('drug+exercise | control | -0.3 | 0.1')[0].A, ['drug','exercise']);
});
test('control: default-control parsing and malformed-input checks stay unchanged', () => {
  assert.deepEqual(parse('drug | control | -0.3 | 0.1'), [{A:['drug'],B:[],te:-0.3,se:0.1}]);
  for (const arm of ['drug+drug', 'drug+', 'control+control']) assert.throws(() => parse(arm+' | control | -0.3 | 0.1'));
});
