import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../plus-parity.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const corpus=read('plus-corpus/corpus.json'),refs=read('plus-corpus/reference-plus.json');
const evidence=read('diagnostics/host3-comparison.json'),summary=read('diagnostics/host3-summary.json');
const P=globalThis.AlmPropPlusParity;
const failed=new Set(evidence.failures.map(f=>f.id));
assert.equal(failed.size,23);assert.equal(evidence.failures.length,27);
assert.deepEqual(new Set(P.records.map(r=>r.id)),failed);
assert.deepEqual(new Set(summary.map(r=>r.id)),failed);
let sensitivity=0,termination=0;
for(const ca of corpus){
 const a=P.assess(ca.rows);
 assert.equal(a.status,failed.has(ca.id)?'known_cross_runtime_mismatch':'not_independently_verified',ca.id);
 if(!failed.has(ca.id))continue;
 assert.ok(a.configurations.includes(ca.id));
 const record=P.records.find(r=>r.id===ca.id);
 const fields=evidence.failures.filter(f=>f.id===ca.id).map(f=>f.field);
 assert.deepEqual(record.fields,fields);
 const d=summary.find(r=>r.id===ca.id);
 assert.ok(Math.abs(d.native.steps['0.001']-d.browser.steps['0.001'])<1e-6);
 if(fields.includes('status')){
  assert.equal(record.issue,'optimiser_status');
  assert.notEqual(d.native.warnings.includes('convergence code 3'),d.browser.warnings.includes('convergence code 3'));termination++;
 } else {
  assert.equal(record.issue,'hessian_sensitivity');
  assert.ok(Math.abs(d.native.fit[1]-d.browser.fit[1])>1e-6);sensitivity++;
  assert.ok(Math.abs(refs[ca.id].metafor.values.se-d.native.fit[1])<1e-13);
 }
 const reversed=P.assess([...ca.rows].reverse().map(r=>({...r,label:'renamed'})));
 assert.deepEqual(a,reversed);
}
assert.equal(sensitivity,21);assert.equal(termination,2);
assert.equal(P.assess([{x:1,n:17}]).status,'not_independently_verified');
assert.match(P.label(P.assess([{x:1,n:17}])) ,/not independently verified/);
console.log(JSON.stringify({configurations:240,disclosedConfigurations:23,hessianSensitivity:21,optimiserTermination:2,failedAssertionsPreserved:27,unknownInputs:'unverified',tolerance:1e-6}));

const common=read('diagnostics/host3-common-objectives.json');
assert.equal(common.length,3);
for(const c of common){
 assert.ok(failed.has(c.id));assert.equal(c.nativeObjectiveGrid.length,5);assert.equal(c.browserObjectiveGrid.length,5);
 assert.equal(Math.max(...c.nativeObjectiveGrid.map((v,i)=>Math.abs(v-c.browserObjectiveGrid[i]))),c.maxAbsoluteDifference);
 assert.ok(c.maxAbsoluteDifference<1e-12);
}
console.log('Common-parameter objective checks: 3 cases, 15 sampled values; max cross-runtime difference < 1e-12');
