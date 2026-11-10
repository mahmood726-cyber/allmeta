// Multi-persona review (clinician, student, non-native speaker): data-entry UX + integrity fixes U1-U8.
// Source text: PMC5244530 abstract Results paragraph (CC BY 4.0; ../fixtures/personas/LICENCE.md).
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance,UI=require("../../../../shared/alm-entry-ui.js");
const MD=readFileSync(new URL("../fixtures/personas/PMC5244530.md",import.meta.url),"utf8");
const START=MD.indexOf("## Results ")+"## Results ".length,PASTE=MD.slice(START,MD.indexOf(" ## Conclusions",START));
const TYPO=PASTE.replace("86/125","186/125");
const REF="PRI-SMA trial report, BMC Family Practice; doi:10.1186/s12875-016-0578-9 (PMC5244530)";
const counts=text=>A.extract(text,"proportion",{outcome:"continued antidepressants"}).candidates.find(c=>c.kind==="counts"&&c.values.arms.length===2);
function row(armIndex,choice={},meta={}){
  const c=counts(PASTE);
  let r=P.create({pastedText:PASTE,label:"PRI-SMA 2016",reference:REF,location:"Abstract",doi:"10.1186/s12875-016-0578-9",...meta});
  r=P.fromCandidate(r,c,{armIndex,outcome:"continued antidepressants",timepoint:"6 month",facets:{timepoint:"6 month"},...choice});
  r.usedAs="events and total of one arm";return r;
}

// ---- U1 arm integrity -------------------------------------------------------------------------------
test("U1 per-number arm cue: the cue before '86/125' is not stamped on '78/133'",()=>{
  const c=counts(PASTE);
  assert.equal(c.armCues[0].value,"intervention");assert.equal(PASTE.slice(...c.armCues[0].span),c.armCues[0].text);
  assert.equal(c.armCues[1],null);
  assert.equal(c.valueFacets["arms.0.events"].arm.value,"intervention");
  assert.equal(c.valueFacets["arms.1.events"].arm.value,"unknown");
  assert.equal(c.valueFacets["arms.1.n"].arm.value,"unknown");
});
test("U1 own printed labels win: each arm keeps the words next to its own numbers",()=>{
  const c=A.extract("Relapse: 12/80 in the placebo group vs 7/82 in the intervention group","proportion").candidates[0];
  assert.deepEqual(c.armCues.map(a=>a&&a.value),["placebo","intervention"]);
});
test("U1 regression: the TAU row is NOT stamped intervention (facet follows the chosen role, cue stored separately)",()=>{
  const r=row(1,{role:"control"},{label:"PRI-SMA 2016 TAU arm"});
  assert.equal(r.facets.arm,"control");assert.equal(r.choice.role,"control");assert.equal(r.armCue,null);
  for(const v of r.values)assert.notEqual(v.facets.arm.value,"intervention");
  const csv=P.toCSV([r]);assert.doesNotMatch(csv.split("\r\n")[1],/"intervention"/);
  const head=csv.split("\r\n")[0];assert.match(head,/"armRole"/);assert.match(head,/"armCue"/);
  r.confirmed=true;assert.deepEqual(P.validate(r),[]);
});
test("U1 role is REQUIRED for a single printed arm (no default)",()=>{
  const r=row(0);assert.equal(r.facets.arm,"not chosen");r.confirmed=true;assert.ok(P.validate(r).includes("arm role"));
  const ok=row(0,{role:"intervention"});ok.confirmed=true;assert.deepEqual(P.validate(ok),[]);
  assert.equal(P.fromCandidate(P.create({pastedText:PASTE}),counts(PASTE),{armIndex:0,role:"bogus"}).choice.role,"bogus");
  const bogus=row(0,{role:"bogus"});bogus.confirmed=true;assert.ok(P.validate(bogus).includes("arm role"));
});
test("U1 cue 'intervention group' vs role Control blocks until acknowledged",()=>{
  const r=row(0,{role:"control"});r.confirmed=true;
  const issues=P.armIssues(r);assert.equal(issues.length,1);assert.equal(issues[0].code,"ARM_CUE_CONTRADICTS");
  assert.match(issues[0].text,/in the intervention group/);
  assert.ok(P.validate(r).includes("arm contradiction"));
  r.choice.armAck=P.armAckKey(r);assert.deepEqual(P.validate(r),[]);
  r.choice.armAck="stale";assert.ok(P.validate(r).includes("arm contradiction"));
});
test("U1 label TAU/control/usual care/placebo vs role Intervention blocks until acknowledged",()=>{
  for(const label of ["PRI-SMA 2016 TAU arm","Smith 2019 control","Smith 2019 usual care","Smith 2019 placebo"]){
    const r=row(1,{role:"intervention"},{label});r.confirmed=true;
    assert.deepEqual(P.armIssues(r).map(i=>i.code),["ARM_LABEL_CONTRADICTS"],label);
    assert.ok(P.validate(r).includes("arm contradiction"));
    r.choice.armAck=P.armAckKey(r);assert.deepEqual(P.validate(r),[]);
  }
  const fine=row(1,{role:"control"},{label:"PRI-SMA 2016 TAU arm"});assert.deepEqual(P.armIssues(fine),[]);
  const other=row(0,{role:"other"});assert.deepEqual(P.armIssues(other),[]);
});
test("U1 two rows from one source using the same printed arm are flagged",()=>{
  const a=row(0,{role:"intervention"},{label:"PRI-SMA 2016 a"}),b=row(0,{role:"control"},{label:"PRI-SMA 2016 b"});
  const same=P.sameArm([a,b]);assert.equal(same.length,1);assert.deepEqual(same[0].rows,[0,1]);assert.match(same[0].text,/86 of 125/);
  assert.deepEqual(P.sameArm([a,row(1,{role:"control"})]),[]);
});
test("PLANTED DEFECT U1: a candidate-level first cue copied to every arm is caught",()=>{
  const c=counts(PASTE),bad=JSON.parse(JSON.stringify(c));bad.armCues=[c.armCues[0],c.armCues[0]];
  const r=P.fromCandidate(P.create({pastedText:PASTE,label:"PRI-SMA 2016",reference:REF,location:"Abstract"}),bad,{armIndex:1,role:"control",outcome:"x",timepoint:"6 month",facets:{timepoint:"6 month"}});
  r.confirmed=true;assert.ok(P.validate(r).includes("arm contradiction"));
});

// ---- U2 same-source guard and counting --------------------------------------------------------------
test("U2 summary counts DISTINCT reports (DOI > PMID > normalised reference), rows and arms",()=>{
  const a=row(0,{role:"intervention"}),b=row(1,{role:"control"});
  assert.deepEqual(P.summary([a,b]),{reports:1,rows:2,arms:2});
  assert.equal(P.summarySentence([a,b]),"Data were extracted from 1 report (2 arms).");
  const c=row(0,{role:"intervention"},{doi:"https://doi.org/10.1186/S12875-016-0578-9"});assert.equal(P.summary([a,c]).reports,1);
  const d=row(0,{role:"intervention"},{doi:"",pmid:"28100182",reference:"Another  report."}),e=row(1,{role:"control"},{doi:"",pmid:"28100182",reference:"different text"});
  assert.equal(P.summary([d,e]).reports,1);
  const f=row(0,{role:"intervention"},{doi:"",pmid:"",reference:"Smith J. Trial, 2019."}),g=row(1,{role:"control"},{doi:"",pmid:"",reference:"smith j trial 2019"});
  assert.equal(P.summary([f,g]).reports,1);
  const h=row(0,{role:"intervention"},{doi:"10.1/x"}),i=row(1,{role:"control"},{doi:"10.1/y"});
  assert.deepEqual(P.summary([h,i]),{reports:2,rows:2,arms:2});
  assert.equal(P.summarySentence([h,i]),"Data were extracted from 2 reports.");
  assert.deepEqual(P.summary([]),{reports:0,rows:0,arms:0});
});
test("U2 sameSource groups rows by shared DOI, PMID, reference or pasted text",()=>{
  const a=row(0,{role:"intervention"}),b=row(1,{role:"control"},{doi:"",reference:"x"});
  assert.deepEqual(P.sameSource([a,b]),[[0,1]]);
  const c=P.create({pastedText:"1/2 vs 3/4",reference:"other",doi:"10.1/z"});assert.deepEqual(P.sameSource([a,c]),[]);
  assert.ok(A.SINGLE_GROUP_SCHEMAS.includes("proportion"));assert.ok(!A.SINGLE_GROUP_SCHEMAS.includes("binary2x2"));
});
test("PLANTED DEFECT U2: counting rows as reports is detected",()=>{
  const naive=records=>({reports:records.length});
  assert.notEqual(naive([row(0),row(1)]).reports,P.summary([row(0),row(1)]).reports);
});

// ---- U3 no silent drops ----------------------------------------------------------------------------
test("U3 events > total is SHOWN as a flagged candidate, never skipped, and ranked last",()=>{
  const out=A.extract(TYPO,"proportion");
  const bad=out.candidates.find(c=>c.kind==="counts"&&c.values.arms.some(a=>a.events===186));
  assert.ok(bad,"186/125 offered");assert.equal(bad.flagged,true);
  assert.ok(bad.sanity.some(f=>f.text==="Found 186/125 — events cannot exceed the total; check the paper"));
  assert.equal(out.candidates.at(-1).flagged,true);
  assert.ok(out.candidates.filter(c=>!c.flagged).every(c=>!c.sanity.length));
});
test("U3 lower > upper and zero totals are flagged candidates",()=>{
  const ci=A.extract("RR 0.70 (95% CI 0.90 to 0.50)","generic").candidates[0];
  assert.equal(ci.flagged,true);assert.match(ci.sanity[0].text,/^Found 0.90 to 0.50 — the lower limit is above the upper limit; check the paper$/);
  const z=A.extract("3/0 vs 4/50","proportion").candidates.find(c=>c.values.arms.some(a=>a.n===0));
  assert.ok(z&&z.flagged);assert.ok(z.sanity.some(f=>/the total cannot be 0/.test(f.text)));
});
test("U3 a flagged arm becomes a blocking row flag in provenance",()=>{
  const c=A.extract(TYPO,"proportion").candidates.find(c=>c.flagged);
  const r=P.fromCandidate(P.create({pastedText:TYPO}),c,{armIndex:c.values.arms.findIndex(a=>a.events===186),role:"intervention"});
  assert.ok(r.flags.some(f=>f.blocking&&/cannot exceed the total/.test(f.text)));
});

// ---- U4 timepoint evidence -------------------------------------------------------------------------
test("U4 timepoint options say where each one occurs; nothing preselected",()=>{
  const c=counts(PASTE);
  const opts=A.timepointOptions(PASTE,c,0);
  assert.deepEqual(opts.map(o=>[o.value,o.where]),[["6 month","next"],["12 month","elsewhere"]]);
  assert.equal(opts[0].label,"6 month — written next to these numbers");assert.equal(opts[1].label,"12 month — elsewhere in the paste");
  assert.deepEqual(A.timepointOptions("Rash: 3/40 vs 5/41",A.extract("Rash: 3/40 vs 5/41","proportion").candidates[0],0),[]);
});
test("U4 choosing a timepoint that is not the nearest is a warning, not a block",()=>{
  const r=row(0,{role:"intervention",timepoint:"12 month",facets:{timepoint:"12 month"}});r.confirmed=true;
  assert.deepEqual(P.validate(r),[]);
  assert.ok(r.flags.some(f=>f.code==="TIMEPOINT_NOT_NEAREST"&&!f.blocking&&/6 month/.test(f.text)));
  const n=row(0,{role:"intervention",timepoint:"not stated",facets:{timepoint:"not stated"}});n.confirmed=true;assert.deepEqual(P.validate(n),[]);
  const none=row(0,{role:"intervention",timepoint:"",facets:{}});none.confirmed=true;assert.ok(P.validate(none).includes("facet:timepoint"));
});

// ---- U5 confirmation line --------------------------------------------------------------------------
test("U5 one short structured line per row and the source clause containing the numbers",()=>{
  const r=row(0,{role:"intervention",denominator:"not stated"});
  assert.equal(P.line(r),"86 events of 125 · Intervention · continued antidepressants · 6 month · counted: not stated");
  const u=row(1);assert.equal(P.line(u),"78 events of 133 · arm: not chosen · continued antidepressants · 6 month · counted: not chosen");
  const cl=P.clause(r);assert.ok(cl.text.startsWith("However, significantly more patients"));assert.ok(cl.text.endsWith("0.05)."));
  assert.equal(PASTE.slice(cl.start,cl.end),cl.text);
});

// ---- U6 denominator --------------------------------------------------------------------------------
test("U6 denominator is stored as the analysis-set facet; counts hide adjustment and phase",()=>{
  const r=row(0,{role:"intervention",denominator:"ITT"});assert.equal(r.facets.analysisSet,"ITT");
  assert.equal(row(0,{role:"intervention",denominator:"followed up"}).facets.analysisSet,"followed up");
  const c=counts(PASTE);assert.ok(!c.requiredFacets.some(f=>["adjustment","phase","analysisSet"].includes(f.key)));
  assert.ok(!("adjustment" in c.facets)&&!("phase" in c.facets));
  assert.deepEqual(Object.keys(A.DENOMINATOR_CHOICES),["ITT","followed up","not stated"]);
});

// ---- U7 decimal ------------------------------------------------------------------------------------
test("U7 decimal preview shows how each comma number is read",()=>{
  assert.deepEqual(A.decimalPreview("mean 68,8 (SD 12,1)","comma").map(p=>p.message),["68,8 read as 68.8 — correct?","12,1 read as 12.1 — correct?"]);
  assert.deepEqual(A.decimalPreview("n = 1,234","point").map(p=>p.message),["1,234 read as 1234 — correct?"]);
  assert.deepEqual(A.decimalPreview("68,8","point").map(p=>p.message),["68,8 read as two numbers, 68 and 8 — correct?"]);
  assert.match(A.decimalPreview("68,8","ask")[0].message,/^68,8: choose the decimal mark/);
  assert.deepEqual(A.decimalPreview("12.5 and 3",undefined),[]);
  assert.equal(A.extract("HR 0,72 (95% CI 0,51 to 0,94)","generic").decimal,"ask");
});

// ---- U8 wording ------------------------------------------------------------------------------------
test("U8 block messages use plain words and name the row",()=>{
  const f=A.sanity([{study:"PRI-SMA 2016 intervention arm",xi:186,ni:125}],"proportion").find(f=>f.blocking);
  assert.equal(f.text,"Events (186) cannot be more than the total in this group (125). Check row 'PRI-SMA 2016 intervention arm'.");
  const m=A.convert(A.parseTable("Study\tEvents\nA\t3"),{0:"study",1:"xi"},"proportion").flags.find(f=>f.code==="missing-field");
  assert.match(m.text,/total in this group/);assert.doesNotMatch(m.text,/\bni\b/);
  assert.equal(A.FIELD_LABELS.xi,"events");assert.equal(A.FIELD_LABELS.ni,"total in this group");
  assert.equal(A.plural(1,"candidate"),"1 candidate");assert.equal(A.plural(2,"blocking issue"),"2 blocking issues");
  assert.equal(A.plural(0,"warning"),"0 warnings");
});

// ---- UI (fake DOM) ---------------------------------------------------------------------------------
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
}
const descendants=el=>[el,...el.children.flatMap(descendants)];
const visible=el=>{for(let e=el;e;e=e.parent)if(e.hidden)return false;return true;};
function setup(schema="proportion"){
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);
  let applied=null;globalThis.AlmFeaturesState={};
  const panel=UI.mountProvenance(root,{schema,usedAs:"events and total of the chosen arm",apply(rs){applied=rs;return {ok:true};}});
  const all=(from=root)=>descendants(from),button=(t,from)=>all(from).find(e=>e.tagName==="button"&&e.textContent===t);
  const field=(t,from)=>all(from).find(e=>e.tagName==="label"&&e.textContent.startsWith(t))?.children.find(e=>["input","select","textarea"].includes(e.tagName));
  const set=async(t,value,from)=>{const e=field(t,from);assert.ok(e,t);if(e.type==="checkbox")e.checked=value;else e.value=value;await e.fire(e.tagName==="select"||e.type==="checkbox"?"change":"input");};
  const cards=()=>all().filter(e=>e.tagName==="fieldset");
  const paste=async text=>{const p=all().find(e=>e.tagName==="textarea");p.value=text;await p.fire("input");await button("Extract candidates").fire("click");};
  const addCounts=async()=>{const ch=field("Choose the source result");const opt=all(ch).find(o=>o.tagName==="option"&&/86\/125/.test(o.textContent));await set("Choose the source result",opt.value);await button("Add chosen result").fire("click");return cards().at(-1);};
  const fill=async(card,label,arm,role)=>{
    for(const [k,v] of [["Study label",label],["Full reference",REF],["Location","Abstract, Results paragraph"],["DOI","10.1186/s12875-016-0578-9"],["Arm to use",String(arm)],["Outcome measured","continued antidepressants"]])await set(k,v,card);
    if(role)await set("This arm is",role,card);
  };
  return {root,panel,all,button,field,set,cards,paste,addCounts,fill,applied:()=>applied};
}
test("UI U1+U5: confirm stays disabled until role AND timepoint AND denominator are chosen; role is never preselected",async()=>{
  const h=setup();await h.paste(PASTE);const c=await h.addCounts();await h.fill(c,"PRI-SMA 2016 intervention arm",0);
  assert.equal(h.field("This arm is",c).value,"");assert.equal(h.field("Timepoint",c).value,"");
  assert.equal(h.field("I confirm",c).disabled,true);
  await h.set("This arm is","intervention",c);assert.equal(h.field("I confirm",c).disabled,true);
  await h.set("Timepoint","6 month",c);assert.equal(h.field("I confirm",c).disabled,true);
  await h.set("Who is counted in 125?","ITT",c);assert.equal(h.field("I confirm",c).disabled,false);
  const line=h.all(c).find(e=>e.className==="alm-entry-line");
  assert.equal(line.textContent,"86 events of 125 · Intervention · continued antidepressants · 6 month · counted: all randomised (ITT)");
  // The confirm control sits right after the line and the source clause.
  const kids=c.children,i=kids.indexOf(line);assert.equal(kids[i+1].className,"alm-entry-clause");assert.ok(descendants(kids[i+2]).some(e=>e.type==="checkbox"&&e.parent.textContent.startsWith("I confirm")));
  assert.equal(h.all(kids[i+1]).filter(e=>e.tagName==="mark").length,2);
  const full=h.all(c).find(e=>e.tagName==="details");assert.ok(full&&full.textContent.startsWith("Show full pasted text"));
});
test("UI U1: TAU row with cue contradiction blocks confirm until acknowledged; facet follows the role",async()=>{
  const h=setup();await h.paste(PASTE);
  const c1=await h.addCounts();await h.fill(c1,"PRI-SMA 2016 intervention arm",0,"control");
  await h.set("Timepoint","6 month",c1);await h.set("Who is counted in 125?","not stated",c1);
  assert.equal(h.field("I confirm",c1).disabled,true);
  assert.match(c1.textContent,/says "in the intervention group"/);
  await h.set("I have checked the arm",true,c1);assert.equal(h.field("I confirm",c1).disabled,false);
  await h.set("This arm is","intervention",c1);assert.ok(!h.field("I have checked the arm",c1)||!visible(h.field("I have checked the arm",c1)));
  const c2=await h.addCounts();await h.fill(c2,"PRI-SMA 2016 TAU arm",1,"intervention");
  await h.set("Timepoint","6 month",c2);await h.set("Who is counted in 133?","not stated",c2);
  assert.equal(h.field("I confirm",c2).disabled,true);assert.match(c2.textContent,/label "PRI-SMA 2016 TAU arm"/);
  await h.set("This arm is","control",c2);assert.equal(h.field("I confirm",c2).disabled,false);
  const rec=h.panel.getResult().provenance[1];assert.equal(rec.facets.arm,"control");assert.equal(rec.armCue,null);
});
test("UI U1: same printed arm twice from one source blocks both rows",async()=>{
  const h=setup();await h.paste(PASTE);
  const c1=await h.addCounts();await h.fill(c1,"PRI-SMA 2016 a",0,"intervention");
  const c2=await h.addCounts();await h.fill(c2,"PRI-SMA 2016 b",0,"intervention");
  for(const c of [c1,c2]){await h.set("Timepoint","6 month",c);await h.set("Who is counted in 125?","ITT",c);}
  assert.equal(h.field("I confirm",c1).disabled,true);assert.match(c1.textContent,/same printed numbers/);
  await h.set("Arm to use","1",c2);await h.set("Who is counted in 133?","ITT",c2);await h.set("Timepoint","6 month",c2);
  assert.equal(h.field("I confirm",c1).disabled,false);
});
async function twoArms(h){
  await h.paste(PASTE);
  const c1=await h.addCounts();await h.fill(c1,"PRI-SMA 2016 intervention arm",0,"intervention");
  const c2=await h.addCounts();await h.fill(c2,"PRI-SMA 2016 TAU arm",1,"control");
  for(const [c,n] of [[c1,125],[c2,133]]){await h.set("Timepoint","6 month",c);await h.set(`Who is counted in ${n}?`,"not stated",c);await h.set("I confirm",true,c);}
  return [c1,c2];
}
test("UI U2: same-source notice blocks 'Use these rows' until the explicit opt-in; opt-in is recorded",async()=>{
  const h=setup();await twoArms(h);
  const notice=h.all().find(e=>e.className==="alm-entry-same-source");
  assert.ok(visible(notice));
  assert.ok(notice.textContent.includes("These rows are different arms of ONE trial. This app pools single groups; it does not compare arms. To compare intervention with control, use a two-group analysis."));
  assert.equal(h.button("Use these rows").disabled,true);
  await h.set("I understand these rows are arms of one trial",true);assert.equal(h.button("Use these rows").disabled,false);
  await h.button("Use these rows").fire("click");
  const recs=h.applied();assert.equal(recs.length,2);
  for(const r of recs){assert.equal(r.provenance.sameSourceOptIn.acknowledged,true);assert.match(r.provenance.sameSourceOptIn.text,/ONE trial/);}
  assert.deepEqual(globalThis.AlmFeaturesState.provenanceSummary,{reports:1,rows:2,arms:2});
  assert.match(h.root.textContent,/Data were extracted from 1 report \(2 arms\)\./);
});
test("UI U2: two-group schemas get no blocking same-source notice",async()=>{
  const h=setup("binary2x2");await h.paste("4/55 vs 9/58; 6/55 vs 10/58");
  assert.ok(!h.all().some(e=>e.className==="alm-entry-same-source"&&visible(e)));
});
test("UI U3+U8: flagged candidate is listed in plain words; no rank/score/rule IDs on screen; plurals",async()=>{
  const h=setup();await h.paste(TYPO);
  const opts=h.all(h.field("Choose the source result")).filter(o=>o.tagName==="option").map(o=>o.textContent);
  assert.ok(opts.some(t=>t.includes("Found 186/125 — events cannot exceed the total; check the paper")),JSON.stringify(opts));
  assert.doesNotMatch(h.root.textContent,/Rank \d|score \d|R-[A-Z]+-/);
  assert.match(h.root.textContent,/\b1 candidate \(1 flagged: check the paper\)/);
  const h1=setup();await h1.paste("Rash: 3/40 vs 5/41");assert.match(h1.root.textContent,/\b1 candidate\b(?!s)/);
  const h2=setup();const p=h2.all().find(e=>e.tagName==="textarea");p.value=PASTE;await p.fire("input");
  await h2.set("Outcome to look for","continued antidepressants");await h2.button("Extract candidates").fire("click");
  const best=h2.all(h2.field("Choose the source result")).filter(o=>o.tagName==="option").map(o=>o.textContent);
  assert.ok(best.some(t=>t.startsWith("Best match for 'continued antidepressants': ")),JSON.stringify(best));
});
test("UI U4: one merged timepoint control with evidence, Not stated and Other…; warning when not nearest",async()=>{
  const h=setup();await h.paste(PASTE);const c=await h.addCounts();await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  const sel=h.field("Timepoint",c),labels=h.all(sel).filter(o=>o.tagName==="option").map(o=>o.textContent);
  assert.deepEqual(labels,["Choose…","6 month — written next to these numbers","12 month — elsewhere in the paste","Not stated","Other…"]);
  assert.ok(!h.all(c).some(e=>e.tagName==="label"&&e.textContent.startsWith("Timepoint (or not stated)")));
  await h.set("Timepoint","12 month",c);assert.match(c.textContent,/The timepoint written next to these numbers is "6 month"/);
  await h.set("Timepoint","__other__",c);const other=h.field("Other timepoint",c);assert.ok(other&&visible(other));
  await h.set("Other timepoint","26 weeks",c);assert.equal(h.panel.getResult().provenance[0].choice.timepoint,"26 weeks");
});
test("UI U6: counts show 'Who is counted' and hide adjustment/phase",async()=>{
  const h=setup();await h.paste(PASTE);const c=await h.addCounts();
  assert.ok(h.field("Who is counted in the total?",c));await h.set("Arm to use","0",c);
  const sel=h.field("Who is counted in 125?",c);assert.ok(sel);
  assert.deepEqual(h.all(sel).filter(o=>o.tagName==="option").map(o=>o.textContent),["Choose…","All randomised (ITT)","Only those followed up","Not stated"]);
  assert.ok(!h.all(c).some(e=>e.tagName==="label"&&/^Choose (phase|adjustment)|^Type of value/.test(e.textContent)));
  const g=setup("generic");await g.paste("baseline HR 0.7 (95% CI 0.5-0.9); follow-up HR 0.8 (95% CI 0.6-1.1)");
  await g.set("Choose the source result","0");await g.button("Add chosen result").fire("click");
  const t=g.field("Type of value");assert.ok(t);assert.ok(g.all(t).some(o=>o.textContent==="at follow-up"));
});
test("UI U7: comma between digits defaults to ask and previews the parsed numbers",async()=>{
  const h=setup("generic");const p=h.all().find(e=>e.tagName==="textarea");p.value="mean 68,8 (SD 12,1)";await p.fire("input");
  assert.equal(h.field("Decimal mark").value,"ask");assert.match(h.root.textContent,/68,8: choose the decimal mark/);
  await h.set("Decimal mark","comma");assert.match(h.root.textContent,/68,8 read as 68\.8 — correct\?/);
});
test("UI U8: Extract is first after the paste box; fixed counts note; facet prompts clear when answered; edited-since-confirmation label",async()=>{
  const h=setup();const sec=h.root.children[0],kids=sec.children;
  const ta=kids.findIndex(e=>e.tagName==="textarea");assert.equal(kids[ta+1].textContent,"Extract candidates");assert.equal(kids[ta+1].className,"alm-entry-primary");
  assert.ok(h.root.textContent.includes("Percentages and p-values are never used as counts."));
  await twoArms(h);
  const c1=h.cards()[0],todo=h.all(c1).find(e=>e.className==="alm-entry-todo");assert.equal(todo.children.length,0);
  await h.set("Timepoint","",c1);assert.ok(todo.textContent.includes("Choose the timepoint"));
  await h.set("Timepoint","6 month",c1);assert.equal(todo.children.length,0);await h.set("I confirm",true,c1);
  const p=h.all().find(e=>e.tagName==="textarea");p.value=PASTE+" extra";await p.fire("input");
  assert.match(h.root.textContent,/Edited since confirmation/);
  p.value=PASTE;await p.fire("input");assert.doesNotMatch(h.root.textContent,/Edited since confirmation/);
});
test("UI U8 table workflow: schema columns first, 'More column types…' expands, plain block text, plurals",async()=>{
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);
  UI.mount(root,{schema:"proportion",apply:()=>({ok:true})});
  const all=()=>descendants(root),ta=all().find(e=>e.tagName==="textarea");
  ta.value="Study\tEvents\tTotal\nPRI-SMA 2016 intervention arm\t186\t125";await ta.fire("input");
  await all().find(e=>e.tagName==="button"&&e.textContent==="Preview and convert").fire("click");
  const sel=()=>all().find(e=>e.tagName==="select"&&e.id.includes("map-1"));
  const names=()=>descendants(sel()).filter(o=>o.tagName==="option").map(o=>o.textContent);
  assert.deepEqual(names(),["Ignore column","Study label","events","total in this group"]);
  await all().find(e=>e.tagName==="button"&&e.textContent==="More column types…").fire("click");
  assert.ok(names().length>10);assert.ok(!names().includes("xi"));
  assert.ok(all().some(e=>e.className==="alm-entry-block"&&e.textContent.includes("Events (186) cannot be more than the total in this group (125). Check row 'PRI-SMA 2016 intervention arm'.")));
  assert.match(root.textContent,/1 row; 2 blocking issues; 1 warning\./);assert.doesNotMatch(root.textContent,/\bxi\b|\bni\b/);
});
