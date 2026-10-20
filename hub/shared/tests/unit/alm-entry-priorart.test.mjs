import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const A=createRequire(import.meta.url)("../../../../shared/alm-entry.js");
test("normalization retains UTF-16 offsets including collapsed mojibake and end sentinel",()=>{
  const source="🧪 HR\u00c2\u00a0０·８３; −１⋅２\u2009―\u202f２";
  const n=A.normalize(source);
  assert.equal(n.text,"🧪 HR 0.83; -1.2 - 2");assert.equal(n.map.length,n.text.length+1);
  assert.equal(n.map.at(-1),source.length);
  for(let i=0;i<n.map.length-1;i++)assert.ok(n.map[i]<=n.map[i+1]);
  assert.equal(source[n.map[n.text.indexOf("0")]],"０");
});
test("registry attributes all candidates and parser rules and extract has no anonymous regex",()=>{
  assert.equal(new Set(A.RULES.map(r=>r.id)).size,A.RULES.length);
  for(const r of A.RULES){assert.ok(r.pattern instanceof RegExp);assert.ok(r.kind&&r.description&&r.version>=1);}
  for(const text of ["RR .7 (95% CI .5-.9)","3/40 vs 4/50","mean 4 ± 2","median 5 (IQR 3-8)"])
    for(const c of A.extract(text).candidates)assert.ok(A.RULES.some(r=>c.rule===`${r.id}@${r.version}`));
  const js=readFileSync(new URL("../../../../shared/alm-entry.js",import.meta.url),"utf8");
  const extract=js.slice(js.indexOf("  function extract("),js.indexOf("  let provenanceSerial"));
  assert.doesNotMatch(extract,/new RegExp|\.matchAll\(\s*\/|\.test\([^)]*\/|\.match\(\s*\/|\.replace\(\s*\/|\.split\(\s*\//);
});
for(const [key,left,right,expected] of [
  ["adjustment","adjusted","unadjusted",["adjusted","unadjusted"]],
  ["timepoint","at 12 weeks","at 52 weeks",["12 weeks","52 weeks"]],
  ["analysisSet","per-protocol","ITT",["per-protocol","ITT"]],
  ["phase","baseline","follow-up",["baseline","follow-up"]]
])test("forced facet choice: "+key,()=>{
  const text=`${left} HR 0.7 (95% CI 0.5-0.9); ${right} HR 0.8 (95% CI 0.6-1.1)`;
  const out=A.extract(text,"generic");
  assert.deepEqual(out.candidates.map(c=>c.facets[key]),expected);
  assert.deepEqual(out.questions.find(q=>q.id==="facet:"+key).choices,expected);
  for(const c of out.candidates){
    for(const v of Object.values(c.valueFacets))assert.equal(v[key].value,c.facets[key]);
    for(const e of c.facetEvidence[key])assert.equal(text.slice(...e.span),e.text);
    let r=A.provenance.fromCandidate(A.provenance.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 1"}),c);
    r.confirmed=true;assert.ok(A.provenance.validate(r).includes("facet:"+key));
    r.choice.facets={[key]:c.facets[key]};assert.ok(!A.provenance.validate(r).includes("facet:"+key));
  }
});
test("unknown facets stay unknown and source text never silently sets user choices",()=>{
  const c=A.extract("HR 0.7 (95% CI 0.5-0.9)","generic").candidates[0];
  assert.ok(Object.values(c.facets).every(x=>x==="unknown"));
  assert.deepEqual(A.provenance.fromCandidate(A.provenance.create({pastedText:c.cue}),c).choice,{});
});
test("ranking responds to user outcome words, preserves all alternatives and explains scores",()=>{
  const text="Headache HR 0.7 (95% CI 0.5-0.9); rash HR 0.8 (95% CI 0.6-1.1)";
  const first=A.extract(text,"generic",{outcome:"headache"}),second=A.extract(text,"generic",{outcome:"rash"});
  assert.equal(first.candidates[0].values.effect,.7);assert.equal(second.candidates[0].values.effect,.8);
  assert.equal(second.candidates.length,2);
  for(const c of second.candidates)assert.equal(c.score,c.reasons.reduce((sum,r)=>sum+r.score,0));
});
test("comma setting, original quote selectors and provenance validation",()=>{
  assert.equal(A.extract("HR 0,123 (95% CI 0,100 to 0,150)","generic").decimal,"ask");
  const text="HR 0,72 (95% CI 0,51–0,94)";
  assert.equal(A.extract(text,"generic").decimal,"ask");
  assert.equal(A.extract(text,"generic").candidates.length,0);
  const c=A.extract(text,"generic",{decimal:"comma"}).candidates[0];assert.deepEqual(c.values,{effect:.72,lo:.51,hi:.94});
  const r=A.provenance.fromCandidate(A.provenance.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 1"}),c);r.confirmed=true;
  assert.deepEqual(A.provenance.validate(r),[]);assert.equal(r.decimal,"comma");
  for(const v of r.values){assert.equal(v.selector[1].exact,text.slice(...v.span));assert.ok(v.selector[1].prefix.length<=32&&v.selector[1].suffix.length<=32);}
});
test("quote fallback after whitespace changes and repeated values",()=>{
  const text="First arm 7 of 84; second arm 7 of 86.";
  const span=[text.lastIndexOf("7"),text.lastIndexOf("7")+1],selector=A.selectors(text,span);
  const repasted="First  arm 7 of 84;\n second   arm 7 of 86.";
  assert.deepEqual(A.anchor(repasted,selector),[repasted.lastIndexOf("7"),repasted.lastIndexOf("7")+1]);
  assert.equal(A.anchor("7 and 7",[{type:"TextQuoteSelector",exact:"7",prefix:"",suffix:""}]),null);
  assert.equal(A.anchor("deleted",selector),null);
});
test("all conversion functions replay after JSON export with strict equality",()=>{
  const calls=[
    ["seFromCI",{lo:.4,hi:.9,ratio:true}],["seFromP",{est:.7,p:.03,ratio:true}],
    ["estFromCI",{lo:.4,hi:.9,ratio:true}],["sdFromSE",{se:2,n:49}],
    ["sdFromCI",{lo:3,hi:5,n:59}],["eventsFromPercent",{pct:15.3,n:130}],
    ["convertFivenum",{min:1,q1:3,median:5,q3:7,max:9,n:100}]
  ];
  const logs=calls.map(([fn,args])=>A[fn](args));assert.ok(A.replay(JSON.parse(JSON.stringify(logs))).ok);
  for(const [i,entry] of A.replay(logs).results.entries())assert.deepEqual(entry.result,logs[i].result);
});
test("skewness override is explicit, flagged, replayable and appears as a conversion question",()=>{
  const a={median:1,q1:0,q3:20,n:100};
  assert.equal(A.convertFivenum(a).mean,null);
  const converted=A.convertFivenum({...a,test:false});
  assert.ok(Number.isFinite(converted.mean));assert.ok(converted.flags.some(f=>f.code==="SKEW_OVERRIDE"));
  assert.ok(A.replay([converted]).ok);
  const t=A.parseTable("Study\tSummary\tTotal\nSmith\tmedian 1 (IQR 0-20)\t100"),mapping={0:"study",1:"summary",2:"n1i"};
  const out=A.convert(t,mapping,"continuous");
  assert.ok(out.questions.some(q=>q.id==="skew:0"));
  const override=A.convert(t,mapping,"continuous",{"skew:0":"convert anyway"});
  assert.equal(override.records[0].m1i,converted.mean);assert.ok(override.steps.some(s=>s.args?.test===false));
});
for(const [name,bad,good,options,code] of [
  ["linear symmetry",{est:1,lo:0,hi:5},{est:1,lo:0,hi:2},{},"ci-asymmetric"],
  ["log symmetry",{est:2,lo:1,hi:9,ratio:true},{est:2,lo:1,hi:4,ratio:true},{},"ci-asymmetric"],
  ["p bound",{est:0,lo:-1,hi:1,p:{op:"<",value:.001}},{est:4,lo:3,hi:5,p:{op:"<",value:.001}},{},"P_CI_BOUND"],
  ["exact p",{est:0,lo:-1,hi:1,p:{op:"=",value:.01}},{est:0,lo:-1,hi:1,p:{op:"=",value:1}},{},"p-ci-inconsistent"],
  ["percentage precision",{events:1,n:3,pct:33.4,pctText:"33.4"},{events:1,n:3,pct:33.3,pctText:"33.3"},{},"PERCENT_MISMATCH"],
  ["quartiles",{min:1,q1:3,median:2,q3:4,max:5},{min:1,q1:2,median:3,q3:4,max:5},{},"QUARTILE_ORDER"],
  ["integer mean",{mean:1.25,n:3,meanText:"1.25"},{mean:1.25,n:4,meanText:"1.25"},{integerScale:true},"GRIM"]
])test("warning without mutation: "+name,()=>{
  const before=structuredClone(bad),warnings=A.consistency(bad,options);
  assert.ok(warnings.some(f=>f.code===code&&!f.blocking));assert.deepEqual(bad,before);
  assert.ok(!A.consistency(good,options).some(f=>f.code===code));
});
test("p bound retains operator, selectors and refusal to derive SE",()=>{
  const text="HR 0.7 (95% CI 0.5-0.9); p < 0.001",out=A.extract(text,"generic");
  assert.equal(out.pValues[0].op,"<");assert.equal(out.candidates[0].p.value,.001);
  assert.equal(A.seFromP({est:.7,p:out.pValues[0],ratio:true}).value,null);
  const r=A.provenance.fromCandidate(A.provenance.create({pastedText:text}),out.candidates[0]);
  assert.match(A.provenance.sentence(r),/p < 0.001 \(BOUND\)/);
});
test("opposite p bounds in one paste are not mistaken for markup",()=>{
  const out=A.extract("HR .7 (95% CI .5-.9); p < .001. HR .8 (95% CI .6-1.1); p > .05","generic");
  assert.equal(out.candidates.length,2);assert.deepEqual(out.pValues.map(p=>p.op),["<",">"]);
});
test("fraction percentages warn at their printed precision without changing counts",()=>{
  for(const text of ["7/84 (50.0%)","7 (50.0%) of 84"]){
    const c=A.extract(text,"proportion").candidates[0];
    assert.equal(c.values.arms[0].events,7);assert.equal(c.values.arms[0].n,84);
    assert.ok(c.flags.some(f=>f.code==="PERCENT_MISMATCH"&&!f.blocking));
  }
  assert.ok(!A.extract("7/84 (8.3%)","proportion").candidates[0].flags.some(f=>f.code==="PERCENT_MISMATCH"));
});
test("integer-scale table declaration enables GRIM using the printed precision",()=>{
  const table=A.parseTable("Study\tMean\tSD\tN\tMean2\tSD2\tN2\nSmith\t1.25\t1\t3\t1.25\t1\t4");
  const mapping={0:"study",1:"m1i",2:"sd1i",3:"n1i",4:"m2i",5:"sd2i",6:"n2i"};
  assert.ok(!A.convert(table,mapping,"continuous").flags.some(f=>f.code==="GRIM"));
  const out=A.convert(table,mapping,"continuous",{integerScale:true});
  assert.equal(out.flags.filter(f=>f.code==="GRIM").length,1);
  assert.equal(out.records[0].m1i,1.25);assert.equal(out.records[0].m2i,1.25);
});
test("PLANTED DEFECT: replay rejects tampered results, args, functions and versions",()=>{
  const original=A.sdFromSE({se:2,n:49});assert.ok(A.replay([original]).ok);
  for(const change of [{result:15},{args:{se:2,n:50}},{fn:"eval"},{rulesVersion:"future"}])assert.equal(A.replay([{...original,...change}]).ok,false);
});
test("PLANTED DEFECT: selectors and required facet answers cannot bypass provenance validation",()=>{
  const text="adjusted HR 0.7 (95% CI 0.5-0.9); unadjusted HR 0.8 (95% CI 0.6-1.1)";
  const c=A.extract(text,"generic").candidates[0],r=A.provenance.fromCandidate(A.provenance.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 1"}),c,{facets:{adjustment:"adjusted"}});
  r.confirmed=true;assert.deepEqual(A.provenance.validate(r),[]);
  r.choice.facets.adjustment="unadjusted";assert.ok(A.provenance.validate(r).includes("facet:adjustment"));
  r.values[0].selector[1].exact="0.8";assert.ok(A.provenance.validate(r).includes("selector:effect"));
});
