import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../report-text.js');
const spec = {model:'random',estimator:'REML',test:'adhoc',measure:'MD'};
const shown = {k:{text:'8',source:'#k'},estimate:{text:'-0.230',source:'#estimate'},i2:{text:'55%',source:'#i2'}};
test('exact model choices and export formats; pending DOI disclosed',()=>{
  const r=api.methods(spec);
  assert.match(r.text,/restricted maximum likelihood/);
  assert.match(r.text,/modified Hartung\u2013Knapp.*floored at unity/);
  assert.match(r.vancouver,/Viechtbauer W/); assert.match(r.bibtex,/@article\{metafor/);
  assert.match(r.ris,/TY  - JOUR/); assert.deepEqual(r.pendingReferences,['metafor']);
  assert.doesNotMatch(r.bibtex,/doi =/); assert.doesNotMatch(r.ris,/DO  -/);
});
test('normal, ordinary HK, modified HK and t remain distinct',()=>{
  for(const [key,word] of [['z','normal (Wald)'],['knha','the Hartung\u2013Knapp method'],['adhoc','modified Hartung\u2013Knapp'],['t','t-based']])
    assert.ok(api.methods({...spec,test:key}).text.includes(word));
});
test('all declared estimators and measures are accepted explicitly',()=>{
  for(const estimator of ['DL','PM','REML','ML','HE','HS','SJ','EB'])
    for(const measure of ['MD','SMD','RR','OR','HR','RD','generic']) assert.ok(api.methods({...spec,estimator,measure}).text);
  assert.match(api.methods({...spec,model:'common',estimator:'FE',test:'z'}).text,/common-effect/);
});
test('unsupported and inconsistent specs fail closed',()=>{
  for(const s of [null,{}, {...spec,test:'HK'}, {...spec,estimator:'toString'}, {...spec,measure:'unknown'}, {...spec,model:'common'}, {...spec,estimator:'FE'}, {...spec,model:'common',estimator:'FE'}])
    assert.throws(()=>api.methods(s),TypeError);
});
test('interpretation preserves rounded display strings and provenance',()=>{
  const r=api.interpret(spec,shown); assert.match(r.text,/-0\.230/);
  assert.match(r.text,/few studies/); assert.match(r.text,/moderate/); assert.match(r.text,/substantial/);
  assert.deepEqual(r.provenance[1],{key:'estimate',...shown.estimate});
  assert.equal(api.assertProvenance(r.text,shown),true);
});
test('all overlap boundaries preserve both applicable categories',()=>{
  for(const [n,words] of [[0,['might not']],[30,['might not','moderate']],[40,['might not','moderate']],[50,['moderate','substantial']],[60,['moderate','substantial']],[75,['substantial','considerable']],[90,['substantial','considerable']],[100,['considerable']]]){
    const r=api.interpret(spec,{i2:{text:String(n)+'%',source:'#i2'}});
    words.forEach(w=>assert.ok(r.text.includes(w)));
  }
});
test('small-k boundary is explicit without fabricating a count',()=>{
  assert.doesNotMatch(api.interpret(spec,{k:{text:'10',source:'#k'}}).text,/few studies/);
});
test('missing provenance, nonnumeric values and unknown output keys refuse',()=>{
  for(const d of [{},null,{k:{text:'8'}},{p:{text:'NaN',source:'#p'}},{k:{text:'1',source:'#k'}},{k:{text:'2.5',source:'#k'}},{i2:{text:'101%',source:'#i2'}},{i2:{text:'<30%',source:'#i2'}},{other:{text:'42',source:'#x'}}])
    assert.throws(()=>api.interpret(spec,d),TypeError);
});
test('invented or rerounded numbers fail provenance check',()=>{
  for(const text of ['Estimate: -0.23','Risk: 999','Confidence: 95%']) assert.throws(()=>api.assertProvenance(text,shown),/Undisplayed/);
  assert.equal(api.assertProvenance('Estimate: -0.230',shown),true);
});
test('banned phrase lint has positive and negative controls',()=>{
  for(const phrase of ['proves benefit','no effect','no heterogeneity','no publication bias','clinically significant','definitive','publication-ready','statistically insignificant']){
    assert.ok(api.lint(phrase).length); assert.throws(()=>api.assertProvenance(phrase,shown),/Banned/);
  }
  assert.deepEqual(api.lint(api.interpret(spec,shown).text),[]);
});
test('p inequalities and scientific notation are copied without numerical conversion',()=>{
  const d={p:{text:'<1e-5',source:'#p'}};
  assert.match(api.interpret(spec,d).text,/<1e-5/);
});
test('inputs are not mutated and repeated calls are deterministic',()=>{
  const before=JSON.stringify(shown); assert.deepEqual(api.interpret(spec,shown),api.interpret(spec,shown));
  assert.equal(JSON.stringify(shown),before);
});
