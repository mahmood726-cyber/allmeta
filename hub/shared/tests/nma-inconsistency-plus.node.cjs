// Plus panel: Node DOM execution (linkedom 0.18.12 via NODE_PATH), not browser evidence.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {harness,root}=require('./nma-inconsistency-dom.cjs');
const dir=path.join(root,'nma-inconsistency');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'validate/MANIFEST-plus.json'),'utf8'));
const files=()=>Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(path.join(dir,f.path))]));
const engine=c=>({inputIssue:c.inputIssue,estimateTau2:c.estimateTau2,fitNMA:c.fitNMA,nodeSplit:c.nodeSplit,dbt:c.dbt});
test('plus replay: every LOO refit, FE/DL/PM triple and sentence matches native R',async()=>{
 const {c}=harness(),a=c.AlmIncoPlusAdapter,before=JSON.stringify(c.AlmIncoValidationAdapter.snapshot());
 const r=await a.corpus.run(files());
 console.log(`plus replay ${r.passed}/${r.checks}; groups ${JSON.stringify(r.groups)}; boundary ${r.boundary.length}`);
 assert.deepEqual(r.failed.slice(0,5),[]);assert.equal(r.passed,r.checks);assert.equal(r.checks,manifest.checks);
 assert.equal(JSON.stringify(c.AlmIncoValidationAdapter.snapshot()),before,'plus replay must not alter the validated page state');
});
test('plus replay detects a changed R value even with a matching pin',async()=>{
 const {c}=harness(),a=c.AlmIncoPlusAdapter,f=files(),p=manifest.files[1].path;
 const text=f[p].toString('utf8'),i=text.indexOf('"p":0.'),changed=Buffer.from(text.slice(0,i+6)+String((Number(text[i+6])+1)%10)+text.slice(i+7),'utf8');
 f[p]=changed;c.AlmIncoPlusManifest.files[1].sha256=crypto.createHash('sha256').update(changed).digest('hex');
 const r=await a.corpus.run(f);assert.ok(r.failed.length>0);assert.equal(r.passed+r.failed.length>=r.checks,true);
 console.log('tampered R value: '+r.failed.length+' failures; first '+r.failed[0].quantity);
});
for(const index of [0,1,2])test('plus replay refuses changed pin '+index+' before execution',async()=>{
 const {c}=harness(),a=c.AlmIncoPlusAdapter,f=files();let calls=0;const old=c.parse;c.parse=(...x)=>{calls++;return old(...x);};
 f[manifest.files[index].path]=Buffer.concat([f[manifest.files[index].path],Buffer.from(' ')]);
 await assert.rejects(a.corpus.run(f),/SHA-256 mismatch; refused/);assert.equal(calls,0);
});
test('LOO refusals use the exact page reasons and a dropped treatment is recomputed',()=>{
 const {c}=harness(),P=c.AlmIncoPlusCore,E=engine(c);
 // Triangle plus a pendant D: dropping the only D study removes a treatment; dropping a triangle edge removes the loop.
 const rows=c.parse('A,B,.2,.1,s1\nB,C,.3,.2,s2\nA,C,.6,.15,s3\nA,C,.5,.2,s4\nC,D,.1,.3,s5');
 const L=P.loo(E,rows,'FE');assert.equal(L.status,'ok');
 assert.deepEqual(L.drops.find(d=>d.study==='s5').status,'ok');assert.equal(L.drops.find(d=>d.study==='s5').nSplits,L.base.nodeSplit.length);
 const s1=L.drops.find(d=>d.study==='s1');assert.equal(s1.dbt.p,null);assert.equal(s1.globalTestable,false);
 const three=P.loo(E,c.parse('A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15'),'DL');
 assert.ok(three.drops.every(d=>d.status==='refused'&&d.reason==='At least 3 valid contrasts are required.'));
 const bridge=P.loo(E,c.parse('A,B,.2,.1,s1\nB,C,.3,.2,s2\nA,C,.6,.15,s3\nC,D,.1,.3,s4\nD,E,.2,.2,s5\nC,E,.4,.2,s6'),'FE');
 assert.equal(bridge.drops.find(d=>d.study==='s4').status,'ok');
 const cut=P.loo(E,c.parse('A,B,.2,.1,s1\nB,C,.3,.2,s2\nA,C,.6,.15,s3\nC,D,.1,.3,s4\nD,E,.2,.2,s5'),'FE');
 assert.equal(cut.drops.find(d=>d.study==='s4').reason,'The treatment network is disconnected.');
});
test('plus core does not call run() or change the displayed result',()=>{
 const {c,document}=harness(),P=c.AlmIncoPlusCore,E=engine(c);let runs=0;const old=c.run;c.run=()=>{runs++;old();};
 const before=JSON.stringify(c._almLastInco()),html=document.getElementById('ns-body').innerHTML;
 for(const ex of c.AlmIncoExamples)for(const m of ['FE','DL','PM']){P.loo(E,c.parse(ex.text),m);P.compare3(E,c.parse(ex.text));}
 assert.equal(runs,0);assert.equal(JSON.stringify(c._almLastInco()),before);assert.equal(document.getElementById('ns-body').innerHTML,html);
});
test('parseIssues explains exactly the rows parse() drops',()=>{
 const {c}=harness(),X=c.AlmIncoPlus;
 const cases=['t1,t2,TE,seTE,study\nA,B,.2,.1,s1\nB,C,.3,.2,s2\nA,C,.6,.15,s3','A,B,.2,0,s1\nA,B,x,.1\nA,A,.1,.1\n,B,.1,.1\nB,C,.3,\n\nA,C,.6,.15,s3,extra','"A,B,.2,.1','A,B,.2,.1\r\n"B, x",C,.3,.2\r\nA,C,.6,-1\r\n'];
 for(const t of cases){
  const r=X.parseIssues(t);
  if(r.unterminated){assert.equal(c.parse(t).length,0);continue;}
  const nonblank=t.replace(/\r/g,'').split('\n').filter(l=>l.split(',').some(x=>x.trim()!=='')).length;
  assert.equal(c.parse(t).length+r.ignored.length,nonblank,t);
 }
 assert.match(X.issueMessage(cases[0]),/line 1 looks like a header/);
 assert.match(X.issueMessage(cases[1]),/line 1 SE must be > 0/);assert.match(X.issueMessage(cases[1]),/line 2 effect “x” is not a number/);
 assert.match(X.issueMessage(cases[1]),/both treatments are “A”/);assert.match(X.issueMessage(cases[1]),/Columns after the fifth are ignored \(line 7\)/);
 assert.match(X.issueMessage(cases[2]),/opened on line 1 is never closed/);
});
for(const model of ['FE','DL','PM'])test('self-verifying '+model+' R script embeds every displayed quantity and fails closed',()=>{
 const {c}=harness(),P=c.AlmIncoPlusCore,E=engine(c),rows=c.parse(c.AlmIncoExamples[0].text),L=P.loo(E,rows,model);
 const s=P.buildRScript({rows,loo:L},{loo:true,date:'test'});
 assert.match(s,/allmeta check: %d\/%d quantities match/);assert.match(s,/quit\(status = 1\)/);assert.match(s,/packageVersion\("netmeta"\)/);
 assert.match(s,/\.QE\.func/);assert.match(s,/tau\.preset/);
 const n=(s.match(/^check\(/gm)||[]).length;assert.ok(n>=L.drops.length*10,'checks '+n);
 assert.equal((s.match(/without .*: status/g)||[]).length,L.drops.length);
});
