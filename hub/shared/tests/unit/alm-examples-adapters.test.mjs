import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const regression=require('../../../../meta-regression/alm-examples.js');
const component=require('../../../../component-nma/alm-examples.js');

test('regression example uses the page export PM/adhoc recipe and strict tolerance',()=>{
  const script=regression.buildScript({rows:[{est:.1,se:.2,x:1},{est:.4,se:.2,x:2},{est:.2,se:.3,x:3}]});
  assert.match(script,/method="PM", test="adhoc"/);
  assert.match(script,/tol=1e-12/);
  assert.equal(regression.compare.tolerance.default,1e-6);
});
test('planted nonfinite regression input is rejected before R serialization',()=>{
  assert.throws(()=>regression.buildScript({rows:[{est:NaN,se:.2,x:1}]}),/finite|input/i);
});
test('component example uses the published netmeta discomb recipe',()=>{
  const script=component.buildScript({rows:[{A:'B',B:'control',yi:.2,se:.1,study:'row_1'}],result:{comps:['B']}});
  assert.match(script,/netmeta::discomb/);
  assert.match(script,/inactive="control"/);
  assert.match(script,/Comp.random/);
  assert.equal(component.compare.tolerance.default,1e-9);
});
test('planted zero component SE is rejected before R serialization',()=>{
  assert.throws(()=>component.buildScript({rows:[{A:'B',B:'control',yi:.2,se:0,study:'row_1'}],result:{comps:['B']}}),/input|standard error/i);
});
