import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const f of ['../plus-bivariate.js','../plus.js','plus-core.js'])vm.runInThisContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'));
const c=JSON.parse(fs.readFileSync(new URL('corpus/plus-reference.json',import.meta.url))),r=c.cases.find(r=>r.ok),fit=AlmDTAPlus.fit,predict=AlmDTAPlus.predict;
test('all scalar reference checks',()=>assert.deepEqual(AlmDTAPlusCore.replay(c).failures,[]));
for(const key of ['coef','vcov','Psi','p','z','se','lo','hi'])test('detect fit corruption: '+key,()=>{AlmDTAPlus.fit=(...args)=>{const f=fit(...args);if(key==='coef')f.coef[0]+=.1;else if(['vcov','Psi'].includes(key))f[key][0][0]+=.1;else if(key==='lo'||key==='hi')f.coefTable[0].ci[key==='lo'?0:1]+=.1;else f.coefTable[0][key]+=.1;return f;};try{assert.ok(AlmDTAPlusCore.replay(c).failures.some(f=>f.id.includes('/'+key)));}finally{AlmDTAPlus.fit=fit;}});
for(const key of ['sens','spec','mu','C','positive','negative','confidence','prediction'])test('detect prediction corruption: '+key,()=>{AlmDTAPlus.predict=(...args)=>{const q=predict(...args);if(['confidence','prediction'].includes(key))q.regions[key][0][0]+=.1;else if(key==='C')q.C[0][0]+=.1;else if(key==='mu')q.mu[0]+=.1;else q[key]+=.1;return q;};try{assert.ok(AlmDTAPlusCore.replay(c).failures.some(f=>f.id.includes('/'+key)));}finally{AlmDTAPlus.predict=predict;}});
test('detect refusal corruption',()=>{AlmDTAPlus.fit=(...args)=>{try{return fit(...args);}catch{throw Error('wrong refusal');}};try{assert.ok(AlmDTAPlusCore.replay(c).failures.some(f=>f.id.endsWith('/refusal')));}finally{AlmDTAPlus.fit=fit;}});
test('detect array truncation',()=>{const wrong=structuredClone(c);wrong.cases.find(r=>r.ok).coef.push(0);assert.ok(AlmDTAPlusCore.replay(wrong).failures.length);});
test('invalid method and correction',()=>{assert.throws(()=>fit(r.rows,'other'));assert.throws(()=>fit(r.rows,'reml','other'));});
test('invalid counts and constant covariate',()=>{assert.throws(()=>fit(r.rows.map(v=>({...v,TP:-1}))));assert.throws(()=>fit(r.rows.map(v=>({...v,x:1}))));assert.throws(()=>fit(r.rows.slice(0,3)));});
test('invalid prediction and prevalence',()=>{const f=fit(r.rows,r.method,r.correction);for(const p of [-.1,1.1,NaN])assert.throws(()=>predict(f,0,p));assert.throws(()=>predict(f,NaN,.1));});

test('undefined post-test probability is refused',()=>{const f=fit(r.rows,r.method,r.correction);f.coef=[-10000,0,-10000,0];assert.throws(()=>predict(f,0,.1),/numerically undefined/);});
