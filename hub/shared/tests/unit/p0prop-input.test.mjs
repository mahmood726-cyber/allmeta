import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {badRows, withBadRow, valid} from '../fixtures/p0prop/cases.mjs';

// Read the page's actual parser on both revisions so these tests demonstrate
// the old defect before the implementation is changed.
const app = new URL('../../../../proportion-ma/', import.meta.url);
const context = vm.createContext({window:{}});
const validator = new URL('input-validation.js', app);
if (fs.existsSync(validator)) vm.runInContext(fs.readFileSync(validator,'utf8'), context);
const html = fs.readFileSync(new URL('index.html',app),'utf8');
const source = html.match(/    function parseTable\(text\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(source, 'page parser entrypoint exists');
const parse = vm.runInContext(`(${source.trim()})`,context);

test('control: existing valid fixture retains every count and label', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parse(valid))), [
    {x:12,n:150,label:'Study A'},{x:8,n:90,label:'Study B'},
    {x:20,n:220,label:'Study C'},{x:5,n:60,label:'Study D'},{x:15,n:180,label:'Study E'},
  ]);
});
test('control: optional labels, integral decimals, zero and all events are valid', () => {
  const rows=parse('12.0,150.0\r\n0,10,Zero\r\n10,10,All\r\n');
  assert.deepEqual(Array.from(rows,r=>[r.x,r.n,r.label]),[[12,150,'Study 1'],[0,10,'Zero'],[10,10,'All']]);
});
for(const [name,row,label,reason] of badRows) test(`plant: refuse ${name} without dropping or truncating`,()=>{
  assert.throws(()=>parse(withBadRow(row)), error=>{
    assert.match(error.message,/Row 2/); assert.ok(error.message.includes(label));
    assert.match(error.message,reason); return true;
  });
});
test('plant: empty dataset and leading/interior blank lines are refused with physical row numbers',()=>{
  assert.throws(()=>parse(''),/Row 1.*empty/);
  assert.throws(()=>parse('\n'+valid),/Row 1.*empty/);
  assert.throws(()=>parse('12,150,A\n\n8,90,B'),/Row 2.*empty/);
});
test('control: scientific notation is read completely and quoted labels round-trip',()=>{
  const rows=parse('1.2e1,1.5e2,"Study, A"\n8,90,"Study ""B"""');
  assert.deepEqual(Array.from(rows,r=>[r.x,r.n,r.label]),[[12,150,'Study, A'],[8,90,'Study "B"']]);
});
