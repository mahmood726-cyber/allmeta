const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../hybrid-core.js');
test('PICO extraction returns literal structural snippets, never invented fields',()=>{const P=require('../pico.js'),text='Adults with asthma received inhaled therapy versus placebo. The primary outcome was symptom control.';const e=P.extract(text);assert.deepEqual(new Set(e.map(x=>x.field)),new Set(['population','intervention','comparator','outcome']));for(const x of e)assert.equal(x.text,text.slice(x.start,x.end));assert.deepEqual(P.extract('No structured clinical description.'),[]);});
test('protocol matches synonyms with evidence offsets, boundaries and escaped literal regex',()=>{
 const rules=[{id:'p',field:'population',terms:['heart failure','HF'],mode:'require'},{id:'x',field:'design',terms:['animal'],mode:'exclude'}];
 const text='HF in adults; no animal experiment. CHF is different.';const r=H.match(text,rules);
 assert.equal(r.hits.filter(h=>h.rule==='p').length,1);assert.equal(r.hits[0].text,'HF');assert.equal(text.slice(r.hits[0].start,r.hits[0].end),'HF');
 assert.equal(r.hits.find(h=>h.rule==='x').negated,true);assert.equal(r.flags.includes('x'),false);
 assert.equal(H.match('a+b is literal',[{id:'q',field:'intervention',terms:['a+b'],mode:'prefer'}]).hits.length,1);
 assert.throws(()=>H.validateRules([{id:'x',field:'bad',terms:['a'],mode:'require'}]));
});
test('sparse logistic regression is deterministic, separates text and never mutates labels',()=>{
 const recs=[{id:'a',title:'cardiac heart therapy'},{id:'b',title:'cardiac heart treatment'},{id:'c',title:'molecular mouse protein'},{id:'d',title:'molecular protein animal'},{id:'e',title:'heart cardiac therapy'},{id:'f',title:'mouse protein molecular'}];
 const labels={a:1,b:1,c:0,d:0};const a=H.train(recs,labels),b=H.train(recs,labels);
 assert.deepEqual(a.scores,b.scores);assert.ok(a.scores.e>a.scores.f);assert.equal(Object.keys(labels).length,4);assert.equal(a.version,H.VERSION);
 assert.throws(()=>H.train(recs,{a:1}));assert.throws(()=>H.train([{id:'x',title:'a'},{id:'x',title:'b'}],labels));
});
test('frozen random sample is reproducible, unique and independent of ranking',()=>{
 const ids=Array.from({length:100},(_,i)=>String(i));const a=H.sample(ids,20,123);
 assert.deepEqual(a,H.sample(ids,20,123));assert.equal(new Set(a).size,20);assert.notDeepEqual(a,ids.slice(0,20));assert.throws(()=>H.sample(ids,101,1));
});
test('fixed-sample hypergeometric bounds cover census and refuse invalid inputs',()=>{
 assert.equal(H.upperEligible(100,100,7,.05),7);assert.equal(H.upperEligible(100,0,0,.05),100);
 assert.ok(H.upperEligible(1000,100,0,.05)>0);assert.ok(H.upperEligible(1000,100,2,.05)>H.upperEligible(1000,100,0,.05));
 assert.throws(()=>H.upperEligible(100,10,11,.05));assert.throws(()=>H.upperEligible(100,10,0,0));
 assert.equal(H.auditResult({N:100,n:10,found:20,round:1,labels:[0,0]}).complete,false);
 const x=H.auditResult({N:100,n:100,found:20,round:1,labels:Array(100).fill(0)});assert.equal(x.recallLower,1);assert.equal(x.alpha,.025);
});
test('repeated-audit alpha budget is at most 0.05',()=>{let sum=0;for(let j=1;j<=10000;j++)sum+=H.alphaFor(j);assert.ok(sum<.05);});
