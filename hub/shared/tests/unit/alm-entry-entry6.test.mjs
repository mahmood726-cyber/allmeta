// Second-batch persona review (guideline methodologist, Cochrane statistician, journal peer reviewer): N1-N6.
// Source text: PMC5244530 abstract Results paragraph (CC BY 4.0; ../fixtures/personas/LICENCE.md). PRI-SMA randomised GPs.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance,UI=require("../../../../shared/alm-entry-ui.js");
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
const effect=(choice={})=>{
  const c=A.extract(HR,"generic").candidates[0];
  return P.fromCandidate(P.create({pastedText:HR,label:"Smith 2020",reference:"Report",location:"Table 2"}),c,{outcome:"mortality",timepoint:"1 year",randomisation:"individuals",...choice});
};

// ---- N1 unit of randomisation + design effect ---------------------------------------------------------
test("N1 design effect = 1 + (m - 1) * ICC (Cochrane Handbook v6.5 §23.1.4); m given, or total / clusters, or a DE given",()=>{
  const a=A.designEffect({m:10,icc:.05});assert.equal(a.value,1+(10-1)*.05);assert.equal(a.citation,"Cochrane Handbook v6.5 §23.1.4");
  assert.equal(A.designEffect({k:45,total:258,icc:.02}).value,1+(258/45-1)*.02);
  assert.equal(A.designEffect({designEffect:1.8}).value,1.8);
  for(const bad of [{m:10,icc:1.5},{m:0.5,icc:.05},{m:10},{k:0,total:20,icc:.1},{designEffect:.9}]){
    const r=A.designEffect(bad);assert.equal(r.value,null,JSON.stringify(bad));assert.ok(r.flags.some(f=>f.blocking));
  }
});
test("N1 effective counts: events and totals divided by the SAME design effect; SE multiplied by sqrt(DE)",()=>{
  const r=A.clusterCounts({events:86,n:125,m:5.7,icc:.05}),de=1+(5.7-1)*.05;
  assert.equal(r.designEffect,de);assert.equal(r.events,86/de);assert.equal(r.n,125/de);
  assert.deepEqual(r.values,{events:86/de,n:125/de,designEffect:de});assert.equal(r.fn,"clusterCounts");
  assert.equal(A.clusterSE({se:.1,designEffect:2}).value,.1*Math.sqrt(2));
  assert.equal(A.clusterCounts({events:130,n:125,designEffect:2}).values,null);
});
test("N1 'What was randomised?' is required for every row; crossover / not randomised / not stated are flagged",()=>{
  const none=row(0,{randomisation:undefined});P.confirm(none,{by:"MA"});assert.ok(P.validate(none).includes("randomisation"));
  const ind=row(0);P.confirm(ind,{by:"MA"});assert.deepEqual(P.validate(ind),[]);
  assert.equal(ind.design.randomisation,"individuals");
  for(const [unit,code] of [["crossover","CROSSOVER_DESIGN"],["not randomised","NOT_RANDOMISED"],["not stated","NOT_STATED_RANDOMISATION"]]){
    const r=row(0,{randomisation:unit});const f=r.flags.find(x=>x.code===code);assert.ok(f,unit);assert.equal(f.blocking,false);
    assert.equal(r.conversions.length,0);P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[],unit);
  }
  assert.deepEqual(Object.keys(A.RANDOMISATION_CHOICES),["individuals","clusters","crossover","not randomised","not stated"]);
});
test("N1 clusters + adjust: a logged, replayable conversion with citation; the adjusted values are what the app gets",()=>{
  const r=row(0,{randomisation:"clusters",cluster:{action:"adjust",k:45,total:258,icc:.02,iccSource:"external"}});
  const de=1+(258/45-1)*.02,c=r.conversions.find(x=>x.fn==="clusterCounts");
  assert.ok(c);assert.equal(c.citation,"Cochrane Handbook v6.5 §23.1.4");assert.deepEqual(c.output,{events:86/de,n:125/de,designEffect:de});
  assert.deepEqual(c.fields,{events:"xi",n:"ni"});assert.match(c.formula,/1 \+ \(M − 1\) × ICC/);
  assert.equal(A.replay(r.conversions).ok,true);
  assert.deepEqual(P.adjusted(r,{exact:true}),{xi:86/de,ni:125/de});
  // Whole numbers for entry (the apps parse integer counts), rounded explicitly and logged.
  assert.deepEqual(P.adjusted(r),{xi:Math.round(86/de),ni:Math.round(125/de)});assert.deepEqual(c.rounded,{events:Math.round(86/de),n:Math.round(125/de)});
  const f=r.flags.find(x=>x.code==="CLUSTER_COUNTS_ROUNDED");assert.ok(f&&!f.blocking);assert.match(f.text,new RegExp("86 → "+(+(86/de).toFixed(2))+" → "+Math.round(86/de)+" events"));
  assert.equal(r.design.cluster.iccSource,"external");
  P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[]);
  assert.match(P.sentence(r),/design effect/);
});
test("N1 clusters + decline: CLUSTER_NOT_ADJUSTED warning in flags, CSV and Methods; no conversion",()=>{
  const r=row(0,{randomisation:"clusters",cluster:{action:"decline"}});
  const f=r.flags.find(x=>x.code==="CLUSTER_NOT_ADJUSTED");assert.ok(f);assert.equal(f.blocking,false);assert.equal(r.conversions.length,0);
  P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[]);
  assert.match(P.toCSV([r]),/CLUSTER_NOT_ADJUSTED/);
  assert.match(P.methods([r,row(1,{role:"control"})]).join(" "),/1 row from a cluster-randomised trial was not adjusted for clustering/);
  const adj=row(0,{randomisation:"clusters",cluster:{action:"adjust",m:5,icc:.05,iccSource:"assumed"}});
  assert.match(P.methods([adj]).join(" "),/design effect.*Cochrane Handbook v6\.5 §23\.1\.4/);
});
test("N1 clusters need an adjustment choice and an ICC source; invalid inputs block",()=>{
  const open=row(0,{randomisation:"clusters"});P.confirm(open,{by:"MA"});assert.ok(P.validate(open).includes("cluster adjustment"));
  const noSource=row(0,{randomisation:"clusters",cluster:{action:"adjust",m:5,icc:.05}});P.confirm(noSource,{by:"MA"});
  assert.ok(P.validate(noSource).includes("blocking flags"));assert.ok(noSource.flags.some(f=>f.code==="CLUSTER_INPUTS"&&/source/.test(f.text)));
  const bad=row(0,{randomisation:"clusters",cluster:{action:"adjust",icc:.05,iccSource:"this paper"}});
  assert.ok(bad.flags.some(f=>f.code==="CLUSTER_INPUTS"&&f.blocking));
  const eff=effect({randomisation:"clusters",cluster:{action:"already"},facets:{analysisSet:"not stated",adjustment:"not stated",phase:"not stated"}});
  P.confirm(eff,{by:"MA"});assert.deepEqual(P.validate(eff),[]);assert.ok(eff.flags.some(f=>f.code==="CLUSTER_ANALYSIS_REPORTED"));
  const cnt=row(0,{randomisation:"clusters",cluster:{action:"already"}});P.confirm(cnt,{by:"MA"});assert.ok(P.validate(cnt).includes("cluster adjustment"));
});
test("PLANTED DEFECT N1: a design-effect conversion stored with the wrong formula (1 + m * ICC) fails replay",()=>{
  const r=row(0,{randomisation:"clusters",cluster:{action:"adjust",m:5,icc:.05,iccSource:"this paper"}});
  const c=r.conversions.find(x=>x.fn==="clusterCounts"),wrong=1+5*.05;
  c.result=c.output={events:86/wrong,n:125/wrong,designEffect:wrong};
  assert.equal(A.replay(r.conversions).ok,false);P.confirm(r,{by:"MA"});assert.ok(P.validate(r).includes("conversion replay"));
});

// ---- N5 explicit "not stated" ------------------------------------------------------------------------
test("N5 a row cannot be confirmed while any shown facet is unknown; 'not stated' is a user statement + CSV flag",()=>{
  const r=effect();P.confirm(r,{by:"MA"});
  const missing=P.validate(r);for(const k of ["analysisSet","adjustment","phase"])assert.ok(missing.includes("unknown:"+k),k);
  assert.ok(!missing.includes("unknown:arm"));assert.ok(!missing.includes("unknown:timepoint"));
  const ok=effect({facets:{analysisSet:"not stated",adjustment:"adjusted",phase:"not stated"}});P.confirm(ok,{by:"MA"});
  assert.deepEqual(P.validate(ok),[]);
  assert.equal(ok.facets.adjustment,"adjusted");assert.equal(ok.facets.analysisSet,"not stated");
  assert.deepEqual(ok.flags.filter(f=>/^NOT_STATED_/.test(f.code)).map(f=>f.code).sort(),["NOT_STATED_ANALYSISSET","NOT_STATED_PHASE"]);
  assert.deepEqual(ok.statements.map(s=>s.facet).sort(),["analysisSet","phase"]);assert.ok(ok.statements.every(s=>s.by==="user"&&s.value==="not stated in source"));
  const csv=P.toCSV([ok]);assert.match(csv,/NOT_STATED_ANALYSISSET/);assert.match(csv,/NOT_STATED_PHASE/);
});
test("N5 counts: 'Not stated' denominator and timepoint become NOT_STATED_ANALYSISSET / NOT_STATED_TIMEPOINT",()=>{
  const r=row(0,{denominator:"not stated",timepoint:"not stated",facets:{timepoint:"not stated"}});
  assert.deepEqual(r.flags.filter(f=>/^NOT_STATED_/.test(f.code)).map(f=>f.code).sort(),["NOT_STATED_ANALYSISSET","NOT_STATED_TIMEPOINT"]);
  const open=row(0,{denominator:undefined});P.confirm(open,{by:"MA"});assert.ok(P.validate(open).includes("unknown:analysisSet"));
});
test("PLANTED DEFECT N5: a record whose facet is still 'unknown' cannot pass validation",()=>{
  const r=row(0);r.facets.timepoint="unknown";P.confirm(r,{by:"MA"});assert.ok(P.validate(r).includes("unknown:timepoint"));
});

// ---- N3 structured source ----------------------------------------------------------------------------
test("N3 source type + number/page; legacy location strings are parsed; type is required",()=>{
  assert.deepEqual(P.create({location:"Table 2"}).source,{type:"Table",detail:"2"});
  assert.deepEqual(P.create({location:"Abstract, Results paragraph"}).source,{type:"Abstract",detail:"Results paragraph"});
  assert.deepEqual(P.create({location:"Supplement S4"}).source,{type:"Supplement",detail:"S4"});
  assert.deepEqual(P.create({location:"p. 5"}).source,{type:"Text",detail:"p. 5"});
  assert.deepEqual(A.SOURCE_TYPES,["Abstract","Table","Figure","Text","Supplement","Registry"]);
  assert.equal(P.sourceLocation({type:"Table",detail:"2"}),"Table 2");
  assert.equal(P.sourceLocation({type:"Abstract",detail:"Results paragraph"}),"Abstract, Results paragraph");
  assert.equal(P.sourceLocation({type:"Registry",detail:""}),"Registry");
  const r=row(0,{},{location:"somewhere"});P.confirm(r,{by:"MA"});assert.ok(P.validate(r).includes("source type"));
  assert.equal(A.ABSTRACT_NOTE,"Abstracts often round values or differ from the full-text tables; check the full text if available.");
  const v=row(0);v.source.verifiedAgainst="Table 2";const csv=P.toCSV([v]),head=csv.split("\r\n")[0];
  for(const k of ["sourceType","sourceDetail","verifiedAgainst"])assert.match(head,new RegExp('"'+k+'"'));
  assert.match(csv.split("\r\n")[1],/"Abstract","Results paragraph","Table 2"/);
});

// ---- N2 outcome definition ---------------------------------------------------------------------------
test("N2 optional verbatim outcome definition, stored with its span when selected from the paste",()=>{
  const text=PASTE.slice(PASTE.indexOf("continued antidepressants until"),PASTE.indexOf(" (86/125")),at=PASTE.indexOf(text);assert.ok(at>0);
  const r=row(0);r.outcomeDefinition=P.outcomeDefinition(r,text,[at,at+text.length]);
  assert.equal(r.outcomeDefinition.text,text);assert.deepEqual(r.outcomeDefinition.span,[at,at+text.length]);assert.ok(r.outcomeDefinition.selector.length===2);
  P.confirm(r,{by:"MA"});assert.deepEqual(P.validate(r),[]);
  r.outcomeDefinition.span=[at+1,at+text.length];assert.ok(P.validate(r).includes("outcome definition"));
  const typed=row(0);typed.outcomeDefinition=P.outcomeDefinition(typed,"on antidepressants at 6 months");assert.equal(typed.outcomeDefinition.span,undefined);
  P.confirm(typed,{by:"MA"});assert.deepEqual(P.validate(typed),[]);
  assert.match(P.toCSV([typed]).split("\r\n")[0],/"outcomeDefinition"/);
});

// ---- N4 auditability ---------------------------------------------------------------------------------
test("N4 confirmedBy (initials) and confirmedVia are required with a confirmation and exported",()=>{
  const r=row(0);r.confirmed=true;r.confirmedAt=new Date().toISOString();assert.ok(P.validate(r).includes("confirmed by"));
  P.confirm(r,{by:" MA "});assert.equal(r.confirmedBy,"MA");assert.equal(r.confirmedVia,"row");assert.ok(r.confirmedAt);
  assert.deepEqual(P.validate(r),[]);
  const head=P.toCSV([r]).split("\r\n")[0];for(const k of ["confirmedBy","confirmedVia","sourceHash"])assert.match(head,new RegExp('"'+k+'"'));
  assert.throws(()=>P.confirm(row(0),{by:""}),/initials/);
  assert.throws(()=>P.confirm(row(0),{by:"MA",via:"magic"}),/row|bulk/);
});
test("N4 second extractor: fromCSV round-trips toCSV; compare lists value, span and facet differences (read-only)",()=>{
  const a=row(0),b=row(1,{role:"control"},{label:"PRI-SMA 2016 TAU"});for(const r of [a,b])P.confirm(r,{by:"MA"});
  const csv=P.toCSV([a,b]),back=P.fromCSV(csv);
  assert.equal(back.length,2);assert.deepEqual(back[0].values,a.values);assert.deepEqual(back[1].facets,b.facets);assert.equal(back[0].pastedText,PASTE);
  const injected=row(0,{},{reference:"=HYPERLINK(1)"});assert.equal(P.fromCSV(P.toCSV([injected]))[0].reference,"=HYPERLINK(1)");
  const theirs=JSON.parse(JSON.stringify([a,b]));
  theirs[0].values[0].value=85;theirs[0].values[0].span=[10,12];theirs[1].facets.timepoint="12 month";theirs[1].choice.role="intervention";
  const before=JSON.stringify([a,b]),report=P.compare([a,b],P.fromCSV(P.toCSV(theirs)));
  assert.equal(JSON.stringify([a,b]),before,"compare must not modify the rows");
  assert.equal(report.rows.length,2);assert.ok(report.differences>=4);
  const what=report.rows.flatMap(r=>r.diffs.map(d=>r.label+"|"+d.what));
  for(const w of ["PRI-SMA 2016|value xi","PRI-SMA 2016|span xi","PRI-SMA 2016 TAU|facet timepoint","PRI-SMA 2016 TAU|arm role"])assert.ok(what.includes(w),w+" in "+what.join(","));
  const same=P.compare([a,b],P.fromCSV(csv));assert.equal(same.differences,0);
  const extra=P.compare([a],P.fromCSV(csv));assert.deepEqual(extra.rows.map(r=>r.status),["matched","only in the other extraction"]);
});

// ---- N6 source hash ----------------------------------------------------------------------------------
test("N6 sha256 matches node:crypto (UTF-8, padding boundaries)",()=>{
  for(const s of ["","abc","a".repeat(55),"a".repeat(56),"a".repeat(64),"a".repeat(119),PASTE,"1·23 − 0,5 (95% CI 0.6–1.1) é ✓ 𝛼"])
    assert.equal(A.sha256(s),createHash("sha256").update(s,"utf8").digest("hex"),JSON.stringify(s.slice(0,20)));
});
test("N6 confirmation stores the source hash; changed paste box marks the row; tampering fails validation",()=>{
  const r=row(0);P.confirm(r,{by:"MA",boxText:PASTE});
  assert.equal(r.sourceHash,A.sha256(PASTE));assert.equal(r.confirmedAgainst,A.sha256(PASTE));
  assert.equal(P.sourceChanged(r,PASTE),false);assert.equal(P.sourceChanged(r,PASTE+" "),true);
  const re=JSON.parse(JSON.stringify(r));P.confirm(re,{by:"MA",boxText:PASTE+" "});assert.equal(P.sourceChanged(re,PASTE+" "),false);
  const t=JSON.parse(JSON.stringify(r));t.pastedText=PASTE.replace("significantly more","more");assert.ok(P.validate(t).includes("source hash"));
  assert.equal(P.sourceChanged(row(0),"anything"),false);
});

// ---- UI (fake DOM) ---------------------------------------------------------------------------------
class Element {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.handlers={};this._text="";this.value="";this.disabled=false;this.hidden=false;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join("");}
  appendChild(c){if(c.parent)c.parent.children=c.parent.children.filter(x=>x!==c);this.children.push(c);c.parent=this;return c;}
  insertBefore(c,ref){if(c.parent)c.parent.children=c.parent.children.filter(x=>x!==c);const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,c);c.parent=this;return c;}
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
  const box=()=>all().find(e=>e.tagName==="textarea");
  const paste=async text=>{const p=box();p.value=text;await p.fire("input");await button("Extract candidates").fire("click");};
  const addFirst=async(re=/86\/125/)=>{const ch=field("Choose the source result");const opt=all(ch).find(o=>o.tagName==="option"&&re.test(o.textContent));await set("Choose the source result",opt.value);await button("Add chosen result").fire("click");return cards().at(-1);};
  const fill=async(card,label,arm,role,unit="individuals")=>{
    for(const [k,v] of [["Study label",label],["Full reference",REF],["Source type","Abstract"],["Location: number or page","Results paragraph"],["DOI","10.1186/s12875-016-0578-9"],["Arm to use",String(arm)],["Outcome measured","continued antidepressants"],["This arm is",role],["Timepoint","6 month"],["What was randomised?",unit]])await set(k,v,card);
    await set(`Who is counted in ${arm?133:125}?`,"ITT",card);
  };
  return {root,panel,all,button,field,set,cards,box,paste,addFirst,fill,applied:()=>applied};
}
test("UI N4: initials are asked once per session and are required before any confirmation",async()=>{
  const h=setup();await h.paste(PASTE);const c=await h.addFirst();await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  assert.equal(h.field("I confirm",c).disabled,true);assert.match(c.textContent,/Enter your initials/);
  await h.set("Your initials");assert.equal(h.field("I confirm",c).disabled,true);
  await h.set("Your initials","MA");assert.equal(h.field("I confirm",c).disabled,false);
  await h.set("I confirm",true,c);const rec=h.panel.getResult().provenance[0];
  assert.equal(rec.confirmedBy,"MA");assert.equal(rec.confirmedVia,"row");assert.equal(rec.sourceHash,A.sha256(PASTE));
  assert.ok(!h.all().some(e=>e.tagName==="button"&&/confirm all/i.test(e.textContent)),"no bulk confirm exists");
});
test("UI N1: 'What was randomised?' is required; clusters ask m or clusters+total, ICC + source or DE; adjusted counts go to the app",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();
  await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention","");
  assert.deepEqual(h.all(h.field("What was randomised?",c)).filter(o=>o.tagName==="option").map(o=>o.textContent),["Choose…","Individuals","Clusters (e.g. practices)","Crossover periods","Not randomised","Not stated"]);
  assert.equal(h.field("I confirm",c).disabled,true);assert.match(c.textContent,/Say what was randomised/);
  const cluster=h.all(c).find(e=>e.className==="alm-entry-cluster");assert.ok(cluster&&!visible(cluster));
  await h.set("What was randomised?","clusters",c);assert.ok(visible(cluster));assert.equal(h.field("I confirm",c).disabled,true);
  for(const [k,v] of [["Number of clusters","45"],["Total participants in all clusters","258"],["ICC (intracluster correlation)","0.02"],["Source of the ICC or design effect","external"],["Adjust for clustering?","adjust"]])await h.set(k,v,c);
  const de=1+(258/45-1)*.02;
  assert.ok(cluster.textContent.includes(`Design effect = 1 + (M − 1) × ICC = ${de.toFixed(3)} (M = 258 / 45); events 86 → ${+(86/de).toFixed(2)}, total in this group 125 → ${+(125/de).toFixed(2)} (entered as ${Math.round(86/de)} of ${Math.round(125/de)})`),cluster.textContent);
  assert.equal(h.field("I confirm",c).disabled,false);
  await h.set("I confirm",true,c);await h.button("Use these rows").fire("click");
  const [rec]=h.applied();assert.equal(rec.xi,Math.round(86/de));assert.equal(rec.ni,Math.round(125/de));
  assert.ok(rec.provenance.conversions.some(x=>x.fn==="clusterCounts"&&x.citation==="Cochrane Handbook v6.5 §23.1.4"));
  assert.ok(globalThis.AlmFeaturesState.entryMethods.some(s=>/design effect/.test(s)));
});
test("UI N1: declining the adjustment keeps the counts and shows CLUSTER_NOT_ADJUSTED in checks and Methods",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();
  await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention","clusters");
  await h.set("Adjust for clustering?","decline",c);assert.equal(h.field("I confirm",c).disabled,false);
  assert.match(c.textContent,/not adjusted for clustering/);
  await h.set("I confirm",true,c);await h.button("Use these rows").fire("click");
  const [rec]=h.applied();assert.equal(rec.xi,86);assert.ok(rec.provenance.flags.some(f=>f.code==="CLUSTER_NOT_ADJUSTED"));
  assert.ok(globalThis.AlmFeaturesState.entryMethods.some(s=>/not adjusted for clustering/.test(s)));
  assert.ok(globalThis.AlmFeaturesState.entryLog.some(e=>e.flags&&e.flags.some(f=>f.code==="CLUSTER_NOT_ADJUSTED")));
});
test("UI N5: effect rows show each unknown facet with 'Not stated in source'; confirm blocked until all are set",async()=>{
  const h=setup("generic");await h.set("Your initials","MA");await h.paste(HR);const c=await h.addFirst(/0\.80/);
  for(const [k,v] of [["Study label","Smith 2020"],["Full reference","Report"],["Source type","Table"],["Location: number or page","2"],["Outcome measured","mortality"],["Timepoint","not stated"],["What was randomised?","individuals"]])await h.set(k,v,c);
  assert.equal(h.field("I confirm",c).disabled,true);
  const sel=h.field("Analysis population",c);assert.ok(sel);
  assert.ok(h.all(sel).some(o=>o.tagName==="option"&&o.textContent==="Not stated in source"));
  await h.set("Analysis population","not stated",c);await h.set("Adjusted for other factors?","not stated",c);assert.equal(h.field("I confirm",c).disabled,true);
  await h.set("Type of value","follow-up",c);assert.equal(h.field("I confirm",c).disabled,false);
  const rec=h.panel.getResult().provenance[0];
  assert.deepEqual(rec.flags.filter(f=>/^NOT_STATED_/.test(f.code)).map(f=>f.code).sort(),["NOT_STATED_ADJUSTMENT","NOT_STATED_ANALYSISSET","NOT_STATED_TIMEPOINT"]);
  assert.equal(rec.facets.phase,"follow-up");
});
test("UI N3: Source type select; Abstract shows the full-text warning and an optional 'Verified against'",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();
  assert.deepEqual(h.all(h.field("Source type",c)).filter(o=>o.tagName==="option").map(o=>o.textContent),["Choose…","Abstract","Table","Figure","Text","Supplement","Registry"]);
  const note=h.all(c).find(e=>e.className==="alm-entry-abstract-note");assert.ok(note&&!visible(note));
  await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  assert.ok(visible(note));assert.equal(note.textContent.startsWith(A.ABSTRACT_NOTE),true);
  await h.set("Verified against",  "Table 2",c);
  const rec=h.panel.getResult().provenance[0];assert.deepEqual(rec.source,{type:"Abstract",detail:"Results paragraph",verifiedAgainst:"Table 2"});assert.equal(rec.location,"Abstract, Results paragraph");
  await h.set("Source type","Table",c);assert.ok(!visible(note));
  await h.set("Source type","",c);assert.equal(h.field("I confirm",c).disabled,true);assert.match(c.textContent,/source type/);
});
test("UI N2: outcome definition typed, or taken from the text selected in the paste box (stored with span)",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  const text=PASTE.slice(PASTE.indexOf("continued antidepressants until"),PASTE.indexOf(" (86/125")),at=PASTE.indexOf(text);
  const p=h.box();p.selectionStart=at;p.selectionEnd=at+text.length;
  await h.button("Use the text selected in the paste box",c).fire("click");
  let rec=h.panel.getResult().provenance[0];assert.deepEqual(rec.outcomeDefinition.span,[at,at+text.length]);assert.equal(rec.outcomeDefinition.text,text);
  assert.equal(h.field("Outcome as defined in the paper",c).value,text);
  assert.equal(h.field("I confirm",c).disabled,false);
  await h.set("Outcome as defined in the paper","on antidepressants at 6 months",c);
  rec=h.panel.getResult().provenance[0];assert.equal(rec.outcomeDefinition.text,"on antidepressants at 6 months");assert.equal(rec.outcomeDefinition.span,undefined);
});
test("UI N6: a changed paste box marks confirmed rows and blocks 'Use these rows' until reverted or re-confirmed",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  await h.set("I confirm",true,c);const use=h.button("Use these rows");assert.equal(use.disabled,false);
  const p=h.box();p.value=PASTE.replace("86/125","186/125");await p.fire("input");
  const mark=h.all(c).find(e=>e.className==="alm-entry-source-changed");assert.ok(mark&&visible(mark));
  assert.match(mark.textContent,/source text changed since confirmation/i);assert.equal(use.disabled,true);
  p.value=PASTE;await p.fire("input");assert.ok(!visible(mark));assert.equal(use.disabled,false);
  p.value="Another paper: 3/40 vs 5/41";await p.fire("input");assert.equal(use.disabled,true);
  await h.button("Re-confirm this row",c).fire("click");assert.equal(use.disabled,false);assert.ok(!visible(mark));
  const rec=h.panel.getResult().provenance[0];assert.equal(rec.confirmedAgainst,A.sha256("Another paper: 3/40 vs 5/41"));assert.equal(rec.sourceHash,A.sha256(PASTE));
});
test("UI N4: 'Compare with another extraction (CSV)' lists per-row differences and changes nothing",async()=>{
  const h=setup();await h.set("Your initials","MA");await h.paste(PASTE);const c=await h.addFirst();await h.fill(c,"PRI-SMA 2016 intervention arm",0,"intervention");
  await h.set("I confirm",true,c);
  const mine=h.panel.getResult().provenance,theirs=JSON.parse(JSON.stringify(mine));theirs[0].values[0].value=85;theirs[0].facets.timepoint="12 month";
  const before=JSON.stringify(mine);
  const file=h.field("Compare with another extraction (CSV)");assert.ok(file&&file.type==="file");
  file.files=[{text:async()=>P.toCSV(theirs)}];await file.fire("change");
  const out=h.all().find(e=>e.className==="alm-entry-compare");assert.ok(out&&visible(out));
  assert.match(out.textContent,/2 differences/);assert.match(out.textContent,/value xi: 86 here, 85 in the other extraction/);assert.match(out.textContent,/facet timepoint: 6 month here, 12 month in the other extraction/);
  assert.equal(JSON.stringify(h.panel.getResult().provenance),before);assert.equal(h.field("I confirm",c).checked,true);
});
