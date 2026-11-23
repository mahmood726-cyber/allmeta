// Cross-family reviews of PR #206 (entry5+entry6): Gemini G1-G8 and Codex C1-C9, verified against the current code.
// Each test here failed before its fix. Source text: PMC5244530 abstract Results paragraph (CC BY 4.0;
// ../fixtures/personas/LICENCE.md).
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance,UI=require("../../../../shared/alm-entry-ui.js");
const AlmText=require("../../../../shared/alm-text.js");
const MD=readFileSync(new URL("../fixtures/personas/PMC5244530.md",import.meta.url),"utf8");
const START=MD.indexOf("## Results ")+"## Results ".length,PASTE=MD.slice(START,MD.indexOf(" ## Conclusions",START));
const REF="PRI-SMA trial report, BMC Family Practice; doi:10.1186/s12875-016-0578-9 (PMC5244530)";
const HR="Mortality: HR 0.80 (95% CI 0.65 to 0.98)";
const counts=text=>A.extract(text,"proportion",{outcome:"continued antidepressants"}).candidates.find(c=>c.kind==="counts"&&c.values.arms.length===2);
function row(armIndex,choice={},meta={}){
  let r=P.create({pastedText:PASTE,label:"PRI-SMA 2016",reference:REF,location:"Abstract, Results paragraph",doi:"10.1186/s12875-016-0578-9",...meta});
  r=P.fromCandidate(r,counts(PASTE),{armIndex,role:"intervention",outcome:"continued antidepressants",timepoint:"6 month",facets:{timepoint:"6 month"},denominator:"ITT",randomisation:"individuals",...choice});
  r.usedAs="events and total of one arm";return r;
}
const NOT_STATED_FACETS={analysisSet:"not stated",adjustment:"not stated",phase:"not stated"};
const effect=(choice={},text=HR)=>{
  const c=A.extract(text,"generic").candidates[0];
  return P.fromCandidate(P.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 2"}),c,{outcome:"mortality",timepoint:"1 year",randomisation:"individuals",facets:{...NOT_STATED_FACETS},...choice});
};

// ---- fake DOM (same shape as the other entry UI suites) ------------------------------------------------
class Element {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.handlers={};this._text="";this.value="";this.disabled=false;this.hidden=false;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join("");}
  appendChild(c){if(c.parent)c.parent.children=c.parent.children.filter(x=>x!==c);this.children.push(c);c.parent=this;return c;}
  replaceChildren(...cs){this.children=[];this._text="";cs.forEach(c=>this.appendChild(c));}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k];}
  addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
  async fire(type){for(const fn of this.handlers[type]||[])await fn({target:this});}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  click(){}
}
const descendants=el=>[el,...el.children.flatMap(descendants)];
const visible=el=>{for(let e=el;e;e=e.parent)if(e.hidden)return false;return true;};
function setup(schema="proportion",usedAs="events and total of the chosen arm"){
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);
  let applied=null;globalThis.AlmFeaturesState={};
  const panel=UI.mountProvenance(root,{schema,usedAs,apply(rs){applied=rs;return {ok:true};}});
  const all=(from=root)=>descendants(from),button=(t,from)=>all(from).find(e=>e.tagName==="button"&&e.textContent===t);
  const field=(t,from)=>all(from).find(e=>e.tagName==="label"&&e.textContent.startsWith(t))?.children.find(e=>["input","select","textarea"].includes(e.tagName));
  const set=async(t,value,from)=>{const e=field(t,from);assert.ok(e,t);if(e.type==="checkbox")e.checked=value;else e.value=value;await e.fire(e.tagName==="select"||e.type==="checkbox"?"change":"input");};
  const cards=()=>all().filter(e=>e.tagName==="fieldset");
  const paste=async text=>{const p=all().find(e=>e.tagName==="textarea");p.value=text;await p.fire("input");await button("Extract candidates").fire("click");};
  const add=async re=>{const ch=field("Choose the source result");const opt=all(ch).find(o=>o.tagName==="option"&&re.test(o.textContent));assert.ok(opt,String(re));await set("Choose the source result",opt.value);await button("Add chosen result").fire("click");return cards().at(-1);};
  const todo=card=>all(card).find(e=>e.className==="alm-entry-todo");
  return {root,panel,all,button,field,set,cards,paste,add,todo,applied:()=>applied};
}

// ---- G1: CSV keeps the effect measure (and kind / level); null is an empty cell, not the string "null" --------
test("G1 an effect row exported to CSV and compared with itself shows 0 differences; measure, kind and level round-trip",()=>{
  const r=effect();P.confirm(r,{by:"MA"});
  assert.equal(r.measure,"HR");assert.equal(r.choice.measure,undefined,"the printed measure lives on rec.measure only");
  const back=P.fromCSV(P.toCSV([r]))[0];
  assert.equal(back.measure,"HR");assert.equal(back.kind,"effect_ci");assert.equal(back.level,.95);
  assert.equal(P.compare([r],[back]).differences,0,JSON.stringify(P.compare([r],[back]).rows));
  // A true difference in the measure survives the CSV.
  const theirs=JSON.parse(JSON.stringify(r));theirs.measure="OR";
  const report=P.compare([r],P.fromCSV(P.toCSV([theirs])));
  assert.deepEqual(report.rows[0].diffs.map(d=>d.what),["measure"]);
  // Unconfirmed: null fields are empty cells and read back as empty, never the text "null".
  const u=effect(),line=P.toCSV([u]).split("\r\n")[1];
  assert.doesNotMatch(line,/"null"/);
  const ub=P.fromCSV(P.toCSV([u]))[0];
  for(const k of ["confirmedAt","confirmedBy","confirmedVia","sourceHash"])assert.notEqual(ub[k],"null",k);
});

// ---- G3: cluster SE conversion logs and replays the cluster inputs ----------------------------------------
async function clusterEffectRow(h,cluster){
  await h.set("Your initials","MA");await h.paste(HR);const c=await h.add(/0\.80/);
  for(const [k,v] of [["Study label","Smith 2020"],["Full reference","Report"],["Source type","Table"],["Location: number or page","2"],["Outcome measured","mortality"],["Timepoint","not stated"],
    ["Analysis population","not stated"],["Adjusted for other factors?","not stated"],["Type of value","follow-up"],["What was randomised?","clusters"]])await h.set(k,v,c);
  for(const [k,v] of cluster)await h.set(k,v,c);
  return c;
}
test("G3 effect row + clusters (M, ICC): the SE conversion logs M and ICC and replay recomputes 1 + (M − 1) × ICC (planted 1 + M × ICC fails)",async()=>{
  const h=setup("generic","effect and SE");
  const c=await clusterEffectRow(h,[["Mean cluster size (M)","5"],["ICC (intracluster correlation)","0.05"],["Source of the ICC or design effect","assumed"],["Adjust for clustering?","adjust"]]);
  const rec=h.panel.getResult().provenance[0],conv=rec.conversions.find(x=>x.fn==="clusterSE");
  assert.ok(conv,JSON.stringify(rec.conversions.map(x=>x.fn)));
  assert.equal(conv.args.m,5);assert.equal(conv.args.icc,.05);assert.ok(!("designEffect" in conv.args),"a computed DE is replayed from M and ICC, not trusted");
  const se=(Math.log(.98)-Math.log(.65))/(2*A.qnorm(.975));
  assert.ok(Math.abs(conv.output-se*Math.sqrt(1+(5-1)*.05))<1e-15,String(conv.output));
  assert.equal(A.replay(rec.conversions).ok,true);
  // PLANTED: the stored result computed with 1 + M × ICC.
  const bad=JSON.parse(JSON.stringify(rec.conversions)),b=bad.find(x=>x.fn==="clusterSE");b.result=b.output=se*Math.sqrt(1+5*.05);
  assert.equal(A.replay(bad).ok,false);
  // Reported DE: the DE itself is the input.
  const h2=setup("generic","effect and SE");
  await clusterEffectRow(h2,[["Or: design effect reported in the paper","1.8"],["Source of the ICC or design effect","this paper"],["Adjust for clustering?","adjust"]]);
  const c2=h2.panel.getResult().provenance[0].conversions.find(x=>x.fn==="clusterSE");
  assert.equal(c2.args.designEffect,1.8);assert.ok(!("icc" in c2.args));
  assert.equal(h.field("I confirm",c).disabled,false);
});

// ---- G4: one plain-word choice per meaning in column questions -------------------------------------------
test("G4 column questions offer each plain-word meaning once (schema field preferred); choosing it fills the schema field",()=>{
  for(const schema of Object.keys(A.SCHEMAS)){
    const d=A.detect(A.parseTable("Study\tCases\tPatients\nSmith 2020\t12\t150"),schema);
    for(const q of d.questions){
      const labels=q.choices.map(v=>A.FIELD_LABELS[v]||v);
      assert.equal(new Set(labels).size,labels.length,schema+": "+labels.join(", "));
    }
  }
  const t=A.parseTable("Study\tCases\tPatients\nSmith 2020\t12\t150"),d=A.detect(t,"proportion");
  const q=d.questions.find(x=>x.id==="column:2"),pick=q.choices.filter(v=>A.FIELD_LABELS[v]==="total in this group");
  assert.deepEqual(pick,["ni"]);
  d.mapping[2]=pick[0];const out=A.convert(t,d,"proportion",{"column:2":pick[0]});
  assert.deepEqual(out.records,[{study:"Smith 2020",xi:12,ni:150}]);assert.ok(!out.flags.some(f=>f.blocking),JSON.stringify(out.flags));
});

// ---- G5 + C1: arm phrases belong to their own number ------------------------------------------------------
test("G5 an outcome word before a colon does not shadow the arm phrase in the same clause; a wrong role is caught",()=>{
  const text="In the intervention group, rash: 3/40 vs 5/41",c=A.extract(text,"proportion").candidates.find(x=>x.kind==="counts");
  assert.equal(A.armRoleOf(c.armCues[0]&&c.armCues[0].text),"intervention",JSON.stringify(c.armCues));
  assert.equal(c.armCues[1],null);
  let r=P.create({pastedText:text,label:"Lee 2020",reference:"Lee trial",location:"Table 2"});
  r=P.fromCandidate(r,c,{armIndex:0,role:"control",outcome:"rash",timepoint:"not stated",facets:{timepoint:"not stated"},denominator:"ITT",randomisation:"individuals"});
  assert.ok(P.armIssues(r).some(i=>i.code==="ARM_CUE_CONTRADICTS"));P.confirm(r,{by:"MA"});
  assert.ok(P.validate(r).includes("arm contradiction"));
});
test("C1 an arm phrase printed AFTER the first count is not reused for the next count",()=>{
  for(const text of ["12/80 in the placebo group vs 7/82 with active treatment.","Death occurred in 12/80 in the placebo group vs 7/82 with active treatment."]){
    const c=A.extract(text,"proportion").candidates.find(x=>x.kind==="counts");
    assert.equal(A.armRoleOf(c.armCues[0].text),"control",text);
    assert.notEqual(A.armRoleOf(c.armCues[1]&&c.armCues[1].text),"control",text+" "+JSON.stringify(c.armCues[1]));
    // Confirmation: choosing Intervention for 7/82 raises no false contradiction; choosing Control is not "agreed".
    const make=role=>{let r=P.create({pastedText:text,label:"Ng 2021",reference:"Ng trial",location:"Table 2"});
      r=P.fromCandidate(r,c,{armIndex:1,role,outcome:"death",timepoint:"not stated",facets:{timepoint:"not stated"},denominator:"ITT",randomisation:"individuals"});return P.confirm(r,{by:"MA"});};
    assert.deepEqual(P.armIssues(make("intervention")),[]);assert.deepEqual(P.validate(make("intervention")),[]);
  }
  // The own-label case still works.
  const c=A.extract("Relapse: 12/80 in the placebo group vs 7/82 in the intervention group","proportion").candidates[0];
  assert.deepEqual(c.armCues.map(a=>a&&a.value),["placebo","intervention"]);
});

// ---- G7: a blocked confirmation always says why --------------------------------------------------------------
test("G7 choosing the non-nearest adjustment explains the block on the card (never a disabled box with an empty list)",async()=>{
  const h=setup("generic","effect and SE");await h.set("Your initials","MA");
  await h.paste("adjusted HR 0.7 (95% CI 0.5-0.9); unadjusted HR 0.8 (95% CI 0.6-1.1)");const c=await h.add(/0\.7 /);
  for(const [k,v] of [["Study label","Smith 2020"],["Full reference","Report"],["Source type","Table"],["Location: number or page","2"],["Outcome measured","mortality"],["Timepoint","not stated"],["What was randomised?","individuals"]])await h.set(k,v,c);
  for(const k of ["Analysis population","Type of value"])if(h.field(k,c))await h.set(k,"not stated",c);
  await h.set("Choose adjustment","adjusted",c);assert.equal(h.field("I confirm",c).disabled,false,h.todo(c).textContent);
  await h.set("Choose adjustment","unadjusted",c);
  assert.equal(h.field("I confirm",c).disabled,true);
  assert.ok(h.todo(c).children.length>0,"todo is empty while confirmation is blocked");
  assert.match(h.todo(c).textContent,/“adjusted”/);
});

// ---- G8 / C8: the U2 gate itself (not a local lambda) --------------------------------------------------------
async function twoArms(h){
  await h.set("Your initials","MA");await h.paste(PASTE);
  for(const [label,arm,role,n] of [["PRI-SMA 2016 intervention arm",0,"intervention",125],["PRI-SMA 2016 TAU arm",1,"control",133]]){
    const c=await h.add(/86\/125/);
    for(const [k,v] of [["Study label",label],["Full reference",REF],["Source type","Abstract"],["Location: number or page","Results paragraph"],["DOI","10.1186/s12875-016-0578-9"],["Arm to use",String(arm)],["Outcome measured","continued antidepressants"],["This arm is",role],["Timepoint","6 month"],["What was randomised?","individuals"]])await h.set(k,v,c);
    await h.set(`Who is counted in ${n}?`,"ITT",c);await h.set("I confirm",true,c);
  }
}
test("G8 PLANTED DEFECT U2: with sameSource disabled the same-source rows would be applied without the opt-in (the gate test detects it)",async()=>{
  const gateBlocks=async()=>{const h=setup();await twoArms(h);return h.button("Use these rows").disabled;};
  assert.equal(await gateBlocks(),true,"real gate: blocked until opt-in");
  const real=P.sameSource;P.sameSource=()=>[];
  try{assert.equal(await gateBlocks(),false,"perturbed gate lets the rows through: the assertion above would FAIL");}finally{P.sameSource=real;}
});
test("C8 two-group schema: two confirmed rows from one source get the informative notice, no opt-in, and apply (planted single-group guard fails)",async()=>{
  const TEXT="Death: 4/55 vs 9/58; relapse: 6/55 vs 10/58";
  const run=async()=>{
    const h=setup("binary2x2","events and totals of both arms");await h.set("Your initials","MA");await h.paste(TEXT);
    for(const [re,outcome] of [[/4\/55/,"death"],[/6\/55/,"relapse"]]){
      const c=await h.add(re);
      for(const [k,v] of [["Study label","Kim 2019"],["Full reference","Kim trial report"],["Source type","Table"],["Location: number or page","2"],["Treatment arm","0"],["Control arm","1"],["Outcome measured",outcome],["Timepoint","not stated"],["What was randomised?","individuals"],["Who is counted","ITT"]])await h.set(k,v,c);
      await h.set("I confirm",true,c);assert.equal(h.field("I confirm",c).checked,true,h.todo(c).textContent);
    }
    return h;
  };
  const h=await run();
  const info=h.all().find(e=>e.className==="alm-entry-same-source-info");assert.ok(info&&visible(info),"informative notice shown");
  assert.ok(!h.field("I understand these rows are arms of one trial"),"no opt-in for two-group apps");
  assert.equal(h.button("Use these rows").disabled,false);
  await h.button("Use these rows").fire("click");assert.equal(h.applied().length,2);
  // PLANTED: binary2x2 treated as a single-group schema -> the rows are blocked and the assertions above fail.
  A.SINGLE_GROUP_SCHEMAS.push("binary2x2");
  try{const p=await run();assert.equal(p.button("Use these rows").disabled,true);}finally{A.SINGLE_GROUP_SCHEMAS.pop();}
});
test("G8 test_entry.ps1 runs all four planted R corpora, including cases.planted-de.json",()=>{
  const ps=readFileSync(new URL("../../../../validation/entry/test_entry.ps1",import.meta.url),"utf8");
  for(const name of ["cases.planted.json","cases.planted-tiny.json","cases.planted-formula.json","cases.planted-de.json"])
    assert.ok((ps.match(new RegExp(name.replace(/\./g,"\\."),"g"))||[]).length>=2,name+" generated and run");
});

// ---- C5: "Not stated in source" stays available for a locally unknown facet ----------------------------------
test("C5 a result whose adjustment is not stated in its own clause can be answered 'not stated' even when other results have cues",()=>{
  const text="Adjusted HR 0.7 (95% CI 0.5-0.9); unadjusted HR 0.8 (95% CI 0.6-1.1). Mortality at 1 year: HR 0.9 (95% CI 0.7 to 1.2).";
  const third=A.extract(text,"generic").candidates.find(c=>c.values.effect===.9);
  assert.equal(third.facets.adjustment,"unknown");assert.ok(third.requiredFacets.some(f=>f.key==="adjustment"));
  let r=P.fromCandidate(P.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 2"}),third,{outcome:"mortality",timepoint:"1 year",randomisation:"individuals",facets:{...NOT_STATED_FACETS,timepoint:"1 year"}});
  P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[]);
  assert.ok(r.flags.some(f=>f.code==="NOT_STATED_ADJUSTMENT"));assert.ok(r.statements.some(s=>s.facet==="adjustment"));
  // A result WITH its own cue still cannot be called "not stated".
  const first=A.extract(text,"generic").candidates.find(c=>c.values.effect===.7);
  r=P.fromCandidate(P.create({pastedText:text,label:"Smith 2020",reference:"Report",location:"Table 2"}),first,{outcome:"mortality",timepoint:"1 year",randomisation:"individuals",facets:{...NOT_STATED_FACETS,timepoint:"1 year"}});
  P.confirm(r,{by:"MA"});assert.ok(P.validate(r).includes("facet:adjustment"));
});
test("C5 UI: the required adjustment select offers 'Not stated in source' for a result with no cue of its own",async()=>{
  const h=setup("generic","effect and SE");
  await h.paste("Adjusted HR 0.7 (95% CI 0.5-0.9); unadjusted HR 0.8 (95% CI 0.6-1.1). Mortality at 1 year: HR 0.9 (95% CI 0.7 to 1.2).");
  const c=await h.add(/0\.9 /),sel=h.field("Choose adjustment",c);assert.ok(sel);
  assert.ok(h.all(sel).some(o=>o.tagName==="option"&&o.textContent==="Not stated in source"));
  const c1=await h.add(/0\.7 /);assert.ok(!h.all(h.field("Choose adjustment",c1)).some(o=>o.textContent==="Not stated in source"));
});

// ---- C6: the table workflow does not promise that percentages are never counts --------------------------------
test("C6 the table panel's note matches what it does: a percentage becomes a count only with a total, and is logged",async()=>{
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);let got=null;
  globalThis.AlmFeaturesState={};
  const panel=UI.mount(root,{schema:"proportion",apply(rs){got=rs;return {ok:true};}});
  assert.doesNotMatch(root.textContent,/Percentages and p-values are never used as counts/);
  assert.match(root.textContent,/P-values are never used as counts\. A percentage becomes a count only with its total, and the conversion is logged\./);
  const ta=descendants(root).find(e=>e.tagName==="textarea");ta.value="Study\tEvents\tTotal\nA\t8%\t150";await ta.fire("input");panel.parse();
  await descendants(root).find(e=>e.tagName==="button"&&e.textContent==="Use these rows").fire("click");
  assert.equal(got[0].xi,12);assert.ok(globalThis.AlmFeaturesState.entryLog.some(s=>s.method==="events from percent"));
});

// ---- C7: the exported CSV carries the same-source acknowledgement ---------------------------------------------
test("C7 'Export provenance CSV' after the opt-in carries sameSourceOptIn (acknowledged + timestamp) for each grouped row",async()=>{
  const h=setup();await twoArms(h);await h.set("I understand these rows are arms of one trial",true);
  let csv=null;const realURL=globalThis.URL,realBlob=globalThis.Blob;
  globalThis.URL={createObjectURL:b=>{csv=b.text;return "blob:x";},revokeObjectURL(){}};globalThis.Blob=class{constructor(parts){this.text=parts.join("");}};
  try{await h.button("Export provenance CSV").fire("click");}finally{globalThis.URL=realURL;globalThis.Blob=realBlob;}
  const back=P.fromCSV(csv);assert.equal(back.length,2);
  for(const r of back){assert.equal(r.sameSourceOptIn?.acknowledged,true,JSON.stringify(r.sameSourceOptIn));assert.match(r.sameSourceOptIn.acknowledgedAt,/^\d{4}-\d\d-\d\dT/);}
  // Without the opt-in the column stays empty.
  await h.set("I understand these rows are arms of one trial",false);
  globalThis.URL={createObjectURL:b=>{csv=b.text;return "blob:x";},revokeObjectURL(){}};globalThis.Blob=class{constructor(parts){this.text=parts.join("");}};
  try{await h.button("Export provenance CSV").fire("click");}finally{globalThis.URL=realURL;globalThis.Blob=realBlob;}
  assert.ok(P.fromCSV(csv).every(r=>r.sameSourceOptIn===undefined));
});

// ---- C9: a source type alone is not a location ----------------------------------------------------------------
test("C9 Table / Figure / Text / Supplement need a number or page; Abstract and Registry do not",()=>{
  for(const type of ["Table","Figure","Text","Supplement"]){
    const r=row(0,{},{location:"",source:{type,detail:""}});r.location=P.sourceLocation(r.source);P.confirm(r,{by:"MA"});
    assert.ok(P.validate(r).includes("location"),type);
    r.source.detail="2";r.location=P.sourceLocation(r.source);assert.deepEqual(P.validate(r),[],type);
  }
  for(const type of ["Abstract","Registry"]){
    const r=row(0,{},{location:"",source:{type,detail:""}});r.location=P.sourceLocation(r.source);P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[],type);
  }
});

// ---- X: F2 Methods counts distinct REPORTS through AlmEntry.provenance.summary ---------------------------------
const methodsTemplates={methods:T=>[T.entry()],plain:()=>["x"],results:()=>["x"]};
const ctxOf=provenance=>({app:"proportion-ma",build:{version:"v1.8.0",shortSha:"abcdef1"},entryLog:[],verify:null,provenance});
test("X F2 Methods: two arms of one trial read '1 report (2 arms)', not '2 reports'; the counts are audited",()=>{
  const a=row(0,{role:"intervention"}),b=row(1,{role:"control"},{label:"PRI-SMA 2016 TAU"});for(const r of [a,b])P.confirm(r,{by:"MA"});
  assert.deepEqual(P.summary([a,b]),{reports:1,rows:2,arms:2});
  const s=AlmText.entrySummary([a,b]);assert.equal(s.reports,1);assert.equal(s.arms,2);assert.equal(s.rows,2);
  const ctx=ctxOf([a,b]),r=AlmText.render(methodsTemplates,{},ctx);
  assert.match(r.methods.text,/^Data were extracted from 1 report \(2 arms; source location recorded for each\)\.$/,r.methods.text);
  assert.doesNotMatch(r.methods.text,/2 reports/);
  const audit=AlmText.audit(r,{},{ctx});assert.equal(audit.ok,true,JSON.stringify(audit.failures));
  // PLANTED: the arm count changed in the rendered provenance -> audit FAILS; a stale text against a 3-arm context FAILS.
  const t=JSON.parse(JSON.stringify(r)),e=t.provenance.find(p=>p.key==="entry.arms");assert.ok(e,"entry.arms is provenance-tracked");
  e.value++;e.text=String(e.value);assert.equal(AlmText.audit(t,{},{ctx}).ok,false);
  const r1=row(0,{role:"intervention"},{doi:"10.1/other",reference:"Other trial"});P.confirm(r1,{by:"MA"});
  assert.equal(AlmText.audit(r,{},{ctx:ctxOf([a,b,r1])}).ok,false);
  // Two reports, one row each: no parenthesis; rows (not arms) when a two-group row is present.
  const two=AlmText.render(methodsTemplates,{},ctxOf([a,r1]));assert.match(two.methods.text,/^Data were extracted from 2 reports \(source location recorded for each study\)\.$/,two.methods.text);
  const c2=JSON.parse(JSON.stringify(a));delete c2.choice.armIndex;c2.id="x2";
  const mixed=AlmText.entrySummary([a,b,c2]);assert.equal(mixed.reports,1);
  const rm=AlmText.render(methodsTemplates,{},ctxOf([a,b,c2]));assert.match(rm.methods.text,/1 report \(3 rows; /,rm.methods.text);
  assert.equal(AlmText.audit(rm,{},{ctx:ctxOf([a,b,c2])}).ok,true);
  // Unconfirmed rows are still not counted.
  const u=row(0,{role:"intervention"});assert.equal(AlmText.entrySummary([a,u]).reports,1);assert.equal(AlmText.entrySummary([a,u]).rows,1);
});
