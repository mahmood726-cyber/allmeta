// Run with Node and linkedom 0.18.12 available via NODE_PATH. No browser claims.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness,root}=require('./nma-inconsistency-dom.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'nma-inconsistency/validate/MANIFEST.json'),'utf8'));
const files=()=>Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(path.join(root,'nma-inconsistency',f.path))]));
test('pinned corpus executes page code, exact totals and state restoration',async()=>{
 const {c,document,storage}=harness();
 document.getElementById('src').value='pending input';storage.set('ma-comparisons-v1','pending bus');storage.set('alm-autosave:nma-inconsistency','draft');
 const a=c.AlmIncoValidationAdapter,before=JSON.stringify(a.snapshot()),r=await a.corpus.run(files());
 assert.equal(r.checks,4627);assert.equal(r.passed,4627);assert.equal(r.failed.length,0);
 assert.equal(r.refusals.expected,54);assert.equal(r.refusals.matched,54);assert.equal(JSON.stringify(a.snapshot()),before);
});
for(const kind of ['number','label','refusal','static text','control'])test('detects tampered '+kind,async()=>{
 const {c,document}=harness(),a=c.AlmIncoValidationAdapter,old=c.__almIncoLoad;
 if(kind==='static text')document.querySelector('header p').textContent+=' changed';
 else if(kind==='control')document.getElementById('f-model').disabled=true;
 else c.__almIncoLoad=function(text){
  old(text);
  const s=c._almLastInco();
  if(kind==='number'&&s.nodeSplit?.length){s.nodeSplit[0].p+=.01;document.querySelector('#ns-body tr td:nth-child(6)').textContent='0.999';}
  if(kind==='label'&&s.nodeSplit?.length)document.querySelector('#ns-body tr td:first-child').textContent='wrong label';
  if(kind==='refusal'&&s.status==='refused'){s.reason='wrong refusal';document.getElementById('dbt').textContent=s.reason;}
 };
 const r=await a.corpus.run(files());assert.ok(r.failed.length>0);assert.equal(r.passed+r.failed.length,4627);
 console.log(kind+': '+r.failed.length+' failures detected');
});
for(const index of [0,1])test('rejects changed pin '+index+' before engine execution',async()=>{
 const {c}=harness(),a=c.AlmIncoValidationAdapter,f=files();let calls=0;c.__almIncoLoad=()=>{calls++;};
 f[manifest.files[index].path]=Buffer.concat([f[manifest.files[index].path],Buffer.from(' ')]);
 await assert.rejects(a.corpus.run(f),/SHA-256 mismatch; refused/);assert.equal(calls,0);
});
test('exception restores pending input, result and storage',async()=>{
 const {c}=harness(),a=c.AlmIncoValidationAdapter,before=JSON.stringify(a.snapshot());
 c.__almIncoLoad=()=>{throw Error('intentional engine failure');};
 await assert.rejects(a.corpus.run(files()),/intentional engine failure/);assert.equal(JSON.stringify(a.snapshot()),before);
});
for(const model of ['FE','DL','PM'])test('current '+model+' snapshot uses shipped analysis and builds package R script',()=>{
 const {c,document}=harness();document.getElementById('f-model').value=model;c.run();
 const live=c.AlmIncoValidationAdapter.live,s=live.currentState(),script=live.buildScript(s);
 assert.ok(s.values.filter(x=>x.key.startsWith('display.')).every(x=>x.value));
 assert.ok(script.includes('decomp.design(m,tau.preset=tau'));assert.ok(script.includes("get('.QE.func',asNamespace('metafor'))"));
 assert.equal((script.match(/ALMJSON:/g)||[]).length,1);
 assert.equal(s.state.model,model);assert.ok(s.values.length>30);
});
test('live refuses pending input and policy refusals',()=>{
 const {c,document}=harness();document.getElementById('src').value='A,B,.1,.1\nB,C,.2,.1\nA,C,.4,.1';
 assert.throws(()=>c.AlmIncoValidationAdapter.live.currentState(),/out of date/);
 c.__almIncoLoad('A,B,.1,.1');assert.throws(()=>c.AlmIncoValidationAdapter.live.currentState(),/At least 3/);
});
