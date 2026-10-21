import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance,UI=require("../../../../shared/alm-entry-ui.js");
const source="🧪 7/84 in the amber group vs 11/86 in the blue group";
function record(){
  let r=P.create({pastedText:source,label:"Ellis 2022",reference:"Ellis et al., Synthetic trial report.",location:"Table 6",doi:"10.1000/example",pmid:"123456"});
  r=P.fromCandidate(r,A.extract(source,"counts").candidates[0],{treatmentIndex:1,controlIndex:0,outcome:"Rash",timepoint:"8 weeks",denominator:"ITT",randomisation:"individuals"});
  r.usedAs="log odds ratio (computed by the app from events and totals)";return r;
}
test("create stores verbatim UTF-16 text and independent identities",()=>{
  const a=P.create({pastedText:source}),b=P.create({pastedText:source});assert.equal(a.pastedText,source);assert.notEqual(a.id,b.id);assert.equal(a.confirmed,false);assert.equal(a.confirmedAt,null);
});
test("user assignment maps reversed arms and retains source spans",()=>{
  const r=record();assert.deepEqual(r.values.map(v=>[v.field,v.value]),[["ci",7],["n2i",84],["ai",11],["n1i",86]]);
  r.values.forEach(v=>assert.equal(source.slice(...v.span),v.text));
  assert.ok(r.flags.some(f=>f.code==="TIMEPOINT_CHOSEN"));
});
test("an unmapped arm is never silently treatment",()=>{
  const r=P.fromCandidate(P.create({pastedText:source}),A.extract(source,"counts").candidates[0]);
  assert.equal(r.values[0].field,"arm0.events");assert.ok(!r.values.some(v=>v.field==="ai"));
});
test("sentence records the source, interpretation and no conversion",()=>{
  const s=P.sentence(record());assert.match(s,/From Ellis 2022 \(Table 6\)/);assert.ok(s.includes(source));assert.match(s,/events \(treatment\) 11/);assert.match(s,/We converted: none/);assert.match(s,/Used as: log odds ratio/);
});
test("conversion captures formula, inputs, output, citation and resets confirmation",()=>{
  const r=record();r.confirmed=true;r.confirmedAt="earlier";
  const c={field:"sd",formula:"SD = SE × sqrt(n)",citation:"Cochrane Handbook v6.5 §6.5.2.2",inputs:{se:2,n:49},value:14,flags:[{code:"SD_FROM_SE",text:"SD estimated from SE"}]};
  const updated=P.applyConversion(r,c);assert.equal(updated.confirmed,false);assert.equal(updated.confirmedAt,null);assert.equal(updated.conversions[0].output,14);assert.equal(updated.flags.at(-1).code,"SD_FROM_SE");assert.ok(P.sentence(updated).includes(c.formula));
  c.inputs.n=0;assert.equal(updated.conversions[0].inputs.n,49);assert.equal(r.conversions.length,0);
});
test("required metadata and explicit confirmation gate validation",()=>{
  const r=record();assert.deepEqual(P.validate(r),["confirmed"]);P.confirm(r,{by:"EE"});assert.deepEqual(P.validate(r),[]);
  r.label="2022";r.reference=" ";r.location="";assert.deepEqual(P.validate(r),["label","reference","location"]);
});
for(const label of ["García 2020","O'Neil 1998","Ng et al. 2024","Smith 2019a"])test("author/year label: "+label,()=>{
  const r=record();r.label=label;P.confirm(r,{by:"EE"});assert.ok(!P.validate(r).includes("label"));
});
test("blocking flags prevent validation",()=>{
  const r=record();P.confirm(r,{by:"EE"});r.flags.push({blocking:true,text:"Invalid counts"});assert.ok(P.validate(r).includes("blocking flags"));
});
test("CSV quotes line breaks, quotes and all provenance fields",()=>{
  const r=record();r.reference='Title "quoted"\nsecond line';const csv=P.toCSV([r]);assert.ok(csv.includes('"Title ""quoted""\nsecond line"'));assert.ok(csv.includes('"pastedText"'));assert.ok(csv.includes('"conversions"'));assert.ok(csv.includes(source));
});
for(const value of ["=SUM(1,2)","+SUM(1,2)","-SUM(1,2)","@SUM(1,2)","  =SUM(1,2)","\t=SUM(1,2)","\r=SUM(1,2)"])test("CSV neutralises spreadsheet formula: "+JSON.stringify(value),()=>{
  const r=record();r.reference=value;assert.ok(P.toCSV([r]).includes('"'+("'"+value).replace(/"/g,'""')+'"'));
});
test("DOCX paragraph preparation needs no ZIP global",()=>{
  const p=P.toDocxParagraphs([record()]);assert.ok(Array.isArray(p));assert.ok(p[0].includes("We read:"));assert.ok(p[1].includes("10.1000/example"));assert.ok(p[2].includes("8 weeks"));
});
test("PLANTED DEFECT: an altered span or value invalidates a confirmed record",()=>{
  const r=record();P.confirm(r,{by:"EE"});assert.deepEqual(P.validate(r),[]);
  r.values[0].span[1]++;assert.ok(P.validate(r).includes("span:ci"));
  const b=record();P.confirm(b,{by:"EE"});b.values[0].value=8;assert.ok(P.validate(b).includes("span:ci"));
});

// DOM behavior tests deliberately make no browser-layout or assistive-technology claim.
class Element {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.handlers={};this._text="";this.value="";this.disabled=false;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join("");}
  appendChild(c){this.children.push(c);c.parent=this;return c;}
  replaceChildren(...cs){this.children=[];this._text="";cs.forEach(c=>this.appendChild(c));}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
  async fire(type){for(const fn of this.handlers[type]||[])await fn({target:this});}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
}
const descendants=el=>[el,...el.children.flatMap(descendants)];
function setup(schema="binary2x2",apply=()=>({ok:true}),usedAs="log odds ratio (computed by the app from events and totals)"){
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);
  const panel=UI.mount(root,{schema,apply,usedAs}),all=()=>descendants(root);
  const button=text=>all().find(e=>e.tagName==="button"&&e.textContent===text);
  const field=text=>all().find(e=>e.tagName==="label"&&e.textContent.startsWith(text))?.children.find(e=>e.tagName==="input"||e.tagName==="select");
  async function set(title,value){const e=field(title);assert.ok(e,title);e.value=String(value);await e.fire(e.tagName==="select"?"change":"input");}
  async function add(text=source,index=0){
    all().find(e=>e.tagName==="textarea").value=text;await button("Extract candidates").fire("click");await set("Choose the source result",index);await button("Add chosen result").fire("click");
  }
  async function complete(){
    for(const [title,value] of [["Your initials","EE"],["Study label","Ellis 2022"],["Full reference","Synthetic journal report"],["Source type","Table"],["Location","6"],["Treatment arm","1"],["Control arm","0"],["Outcome measured","Rash"],["Timepoint","8 weeks"],["Who is counted","ITT"],["What was randomised?","individuals"]])await set(title,value);
    const confirm=field("I confirm");assert.equal(confirm.disabled,false);confirm.checked=true;await confirm.fire("change");
  }
  return {root,panel,all,button,field,set,add,complete};
}
test("paper UI requires selection, metadata, arm mapping and confirmation before apply",async()=>{
  let received,stored;const h=setup("binary2x2",rs=>{received=rs;stored=globalThis.AlmFeaturesState.provenance;return {ok:true};});
  await h.add();assert.equal(h.button("Use these rows").disabled,true);
  await h.complete();assert.equal(h.button("Use these rows").disabled,false);await h.button("Use these rows").fire("click");
  assert.equal(received[0].ai,11);assert.equal(received[0].ci,7);assert.equal(stored[0].confirmed,true);assert.ok(stored[0].confirmedAt);assert.deepEqual(received[0].provenance,stored[0]);
});
test("paper UI editing source metadata revokes confirmation",async()=>{
  const h=setup();await h.add();await h.complete();await h.set("Source type","Figure");await h.set("Location","7");
  assert.equal(h.field("I confirm").checked,false);assert.equal(h.button("Use these rows").disabled,true);assert.equal(h.panel.getResult().provenance[0].confirmedAt,null);
});
test("paper UI uses source slices and safe nodes for marks and malicious text",async()=>{
  const h=setup();await h.add('<img src=x onerror=alert(1)> '+source);
  assert.equal(h.all().filter(e=>e.tagName==="mark").length,4);assert.ok(!h.all().some(e=>e.tagName==="img"));assert.ok(h.root.textContent.includes("<img src=x"));
  assert.ok(h.all().some(e=>e.className==="alm-entry-sr-only"));assert.ok(h.all().some(e=>e.tagName==="small"&&e.attrs["aria-hidden"]==="true"));
});
test("paper UI links require user clicks and reject executable DOI/PMID text",async()=>{
  const h=setup();await h.add();await h.set("DOI","javascript:alert(1)");await h.set("PMID","<script>");
  const links=h.all().filter(e=>e.tagName==="a");assert.ok(links.every(e=>e.hidden));
  await h.set("DOI","10.1000/abcd");await h.set("PMID","123456");
  assert.ok(links.every(e=>!e.hidden&&e.target==="_blank"&&e.rel.includes("noopener")));assert.match(links[0].href,/^https:\/\/doi\.org\//);assert.match(links[1].href,/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//);
});
test("paper UI requires every row to validate",async()=>{
  const h=setup();await h.add();await h.complete();assert.equal(h.button("Use these rows").disabled,false);
  await h.add("4/55 vs 9/58");assert.equal(h.button("Use these rows").disabled,true);
});
test("paper UI refuses identical arm selections",async()=>{
  const h=setup();await h.add();await h.complete();await h.set("Control arm",1);assert.equal(h.field("I confirm").disabled,true);assert.equal(h.button("Use these rows").disabled,true);
});
test("paper UI warns when DOCX dependency is absent",async()=>{
  const h=setup();await h.add();await h.button("Export provenance DOCX").fire("click");assert.match(h.root.textContent,/DOCX export needs AlmZip/);
});
test("paper UI records effect conversions and sends computed values",async()=>{
  let received;const h=setup("generic",rs=>{received=rs;return {ok:true};},"log risk ratio");
  await h.add("RR 0.72 (95% CI 0.51-0.94)");
  for(const [k,v] of [["Your initials","EE"],["Study label","Ellis 2022"],["Full reference","Report"],["Source type","Text"],["Location","p. 7"],["Outcome measured","Rash"],["Timepoint","8 weeks"],["What was randomised?","individuals"],["Analysis population","not stated"],["Adjusted for other factors?","not stated"],["Type of value","not stated"]])await h.set(k,v);
  const confirm=h.field("I confirm");assert.equal(confirm.disabled,false);confirm.checked=true;await confirm.fire("change");await h.button("Use these rows").fire("click");
  assert.equal(received[0].yi,Math.log(.72));assert.equal(received[0].sei,A.seFromCI({lo:.51,hi:.94,ratio:true,level:.95}).value);assert.equal(received[0].provenance.conversions.length,2);
});
test("paper UI failed apply restores previous provenance state",async()=>{
  const h=setup("binary2x2",()=>({ok:false}));globalThis.AlmFeaturesState={provenance:["previous"]};
  await h.add();await h.complete();await h.button("Use these rows").fire("click");
  assert.deepEqual(globalThis.AlmFeaturesState.provenance,["previous"]);assert.match(h.root.textContent,/Could not apply/);
});
test("paper UI applies a single explicitly selected arm to a proportion app",async()=>{
  let received;const h=setup("proportion",rs=>{received=rs;return {ok:true};},"proportion (computed from events and total)");
  await h.add("7/84 (8.3%)");
  for(const [k,v] of [["Your initials","EE"],["Study label","Ellis 2022"],["Full reference","Report"],["Source type","Table"],["Location","4"],["Arm to use","0"],["This arm is","intervention"],["Outcome measured","Rash"],["Timepoint","8 weeks"],["Who is counted","ITT"],["What was randomised?","individuals"]])await h.set(k,v);
  const confirm=h.field("I confirm");assert.equal(confirm.disabled,false);confirm.checked=true;await confirm.fire("change");await h.button("Use these rows").fire("click");
  assert.equal(received[0].xi,7);assert.equal(received[0].ni,84);assert.deepEqual(received[0].provenance.values.map(v=>v.field),["xi","ni"]);
});
test("paper UI requires scale confirmation for a negative ratio interval",async()=>{
  let received;const h=setup("generic",rs=>{received=rs;return {ok:true};},"log hazard ratio");
  await h.add("HR -0.3 (95% CI -0.5 to -0.1)");
  for(const [k,v] of [["Your initials","EE"],["Study label","Ellis 2022"],["Full reference","Report"],["Source type","Text"],["Location","p. 7"],["Outcome measured","Rash"],["Timepoint","8 weeks"],["What was randomised?","individuals"],["Analysis population","not stated"],["Adjusted for other factors?","not stated"],["Type of value","not stated"]])await h.set(k,v);
  assert.equal(h.field("I confirm").disabled,true);await h.set("Ratio scale","log");
  const confirm=h.field("I confirm");assert.equal(confirm.disabled,false);confirm.checked=true;await confirm.fire("change");await h.button("Use these rows").fire("click");
  assert.equal(received[0].yi,-.3);assert.equal(received[0].provenance.choice.scale,"log");
});
test("PLANTED DEFECT: paper UI's validation gate catches corrupted numeric provenance",async()=>{
  const h=setup();await h.add();await h.complete();
  const r=h.panel.getResult().provenance[0];r.values[0].span[0]++;
  let called=false;const saved=globalThis.AlmFeaturesState;
  // Click revalidates independently of the button's previous enabled appearance.
  globalThis.AlmFeaturesState={get provenance(){called=true;return [];}};
  await h.button("Use these rows").fire("click");assert.equal(called,false);globalThis.AlmFeaturesState=saved;
});
