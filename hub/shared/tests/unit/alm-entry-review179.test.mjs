// Review of PR #179 (REVIEW_179.md): each test reproduces one reviewer probe.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),UI=require("../../../../shared/alm-entry-ui.js");
const close=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const blocking=o=>o.flags.filter(f=>f.blocking);
const z=A.qnorm(.975);

// P0: "or" in "Study or Subgroup" must never make the measure a ratio.
const REVMAN_MD="Study or Subgroup\tMean Difference IV, Random, 95% CI\nSmith 2019\t2.10 [1.20, 3.00]\nJones 2020\t1.50 [0.40, 2.60]";
test("P0 RevMan mean-difference export is a difference (negative fixture)",()=>{
  const t=A.parseTable(REVMAN_MD),o=A.convert(t,A.detect(t,"generic"),"generic",{"scale:0":"natural","scale:1":"natural"});
  close(o.records[0].yi,2.10);close(o.records[1].yi,1.50);
  close(o.records[0].sei,(3.00-1.20)/(2*z));close(o.records[1].sei,(2.60-0.40)/(2*z));
  assert.ok(!o.records.some(r=>r.ratio));
  assert.ok(!o.questions.some(q=>/^scale:|^measure:/.test(q.id)));
  assert.deepEqual(blocking(o),[]);
});
test("P0 measure from headers: case-sensitive whole-token abbreviations, spelled-out names, differences never ratio",()=>{
  const m=A.measureFromHeaders;
  assert.equal(m(["Study or Subgroup"]),null);
  assert.equal(m(["Mean (SD) or median (IQR)"]),null);
  assert.equal(m(["Study OR Subgroup","Estimate"],{0:"study",1:"yi"}),null);
  assert.equal(m(["OR (95% CI)"]),"ratio");
  assert.equal(m(["HR"]),"ratio");
  assert.equal(m(["log RR"]),"ratio");
  assert.equal(m(["Odds Ratio M-H, Fixed, 95% CI"]),"ratio");
  assert.equal(m(["Risk Ratio M-H, Random, 95% CI"]),"ratio");
  assert.equal(m(["hazard ratio"]),"ratio");
  assert.equal(m(["Hr"]),null);
  assert.equal(m(["ERROR"]),null);
  assert.equal(m(["Mean Difference IV, Random, 95% CI"]),"difference");
  assert.equal(m(["Std. Mean Difference IV, Random, 95% CI"]),"difference");
  assert.equal(m(["SMD"]),"difference");
  assert.equal(m(["MD (95% CI)"]),"difference");
  assert.equal(m(["Risk Difference M-H, Fixed, 95% CI"]),"difference");
  // A difference header is never overridden into a ratio: conflicting headers decide nothing.
  assert.equal(m(["Risk Ratio","Mean Difference"]),null);
});
test("P0 a lowercase 'or' header in a generic paste asks for the measure instead of assuming ratio",()=>{
  const t=A.parseTable("Study\tMean (SD) or median (IQR)\nA\t2.10 [1.20, 3.00]"),o=A.convert(t,{0:"study",1:"est"},"generic",{"scale:0":"natural"});
  assert.ok(o.questions.some(q=>q.id==="measure:type"));
  assert.ok(blocking(o).some(f=>f.questionId==="measure:type"));
});

// P1: no measure known -> blocking measure:type question.
const HEADERLESS="Smith 2019\t0.75 (0.60-0.94)";
test("P1 headerless ratio-looking CI blocks with a measure:type question (asymmetry is a hint only)",()=>{
  const t=A.parseTable(HEADERLESS),o=A.convert(t,{0:"study",1:"est"},"generic",{});
  const q=o.questions.find(q=>q.id==="measure:type");
  assert.ok(q);assert.deepEqual(q.choices,["ratio","difference"]);
  assert.match(q.text,/log scale/);
  assert.ok(blocking(o).some(f=>f.questionId==="measure:type"));
});
test("P1 measure:type answers decide the scale; ratio then asks natural/log",()=>{
  const t=A.parseTable(HEADERLESS),map={0:"study",1:"est"};
  const pending=A.convert(t,map,"generic",{"measure:type":"ratio"});
  assert.ok(pending.questions.some(q=>q.id==="scale:0"));assert.ok(blocking(pending).length);
  const r=A.convert(t,map,"generic",{"measure:type":"ratio","scale:0":"natural"});
  close(r.records[0].yi,Math.log(.75));close(r.records[0].sei,(Math.log(.94)-Math.log(.6))/(2*z));assert.deepEqual(blocking(r),[]);
  const d=A.convert(t,map,"generic",{"measure:type":"difference"});
  close(d.records[0].yi,.75);close(d.records[0].sei,(.94-.6)/(2*z));assert.deepEqual(blocking(d),[]);
  assert.ok(d.steps.some(s=>s.method==="measure confirmed"));
});
test("P1 measure:type is asked for generic, contrast-nma and dose, not when the schema decides",()=>{
  const t=A.parseTable("Study\tEstimate\nA\t0.75 (0.60-0.94)");
  for(const s of ["generic","contrast-nma","dose"])assert.ok(A.convert(t,{0:"study",1:"est"},s,{}).questions.some(q=>q.id==="measure:type"),s);
  assert.ok(!A.convert(t,{0:"study",1:"est"},{name:"generic",ratio:true},{}).questions.some(q=>q.id==="measure:type"));
  assert.ok(!A.convert(t,{0:"study",1:"est"},{name:"generic",ratio:false},{}).questions.some(q=>q.id==="measure:type"));
  // Already on the analysis scale with a direct SE: nothing depends on the measure.
  const direct=A.parseTable("Study\tyi\tsei\nA\t0.2\t0.1");
  assert.ok(!A.convert(direct,A.detect(direct,"generic"),"generic",{}).questions.some(q=>q.id==="measure:type"));
});

// P1: decimal comma wording and semantics.
const DEC=A.parseTable("Study\tEstimate\nA\t1,23");
const decQuestion=o=>o.questions.find(q=>q.id==="decimal:0:1");
test("P1 decimal question choices are worded as decimal mark / thousands / list",()=>{
  const q=decQuestion(A.convert(DEC,A.detect(DEC,"generic"),"generic",{decimal:"ask"}));
  assert.deepEqual(q.choices,["comma","thousands","list"]);
  assert.deepEqual(q.choices.map(c=>q.labels[c]),["Decimal mark (1,23 = 1.23)","Thousands separator (1,234 = 1234)","List separator"]);
});
test("P1 a non-decimal answer never turns a bare a,b into a CI",()=>{
  for(const a of ["thousands","list","separator"]){
    const o=A.convert(DEC,A.detect(DEC,"generic"),"generic",{"decimal:0:1":a,"measure:type":"difference"});
    assert.ok(!(o.records[0].lo===1&&o.records[0].hi===23),a);
    assert.ok(!o.steps.some(s=>/CI midpoint/.test(s.text)),a);
    assert.ok(blocking(o).length,a);
  }
  assert.equal(A.parseCell("1,23",{decimal:"list"}).kind,"unknown");
  assert.equal(A.parseCell("1,23",{decimal:"thousands"}).kind,"unknown");
  assert.equal(A.parseCell("1,23",{decimal:"point"}).kind,"unknown");
});
test("P1 thousands answer strips grouping commas; list keeps commas as CI separators inside a compound cell",()=>{
  const t=A.parseTable("Study\tEvents\tTotal\nA\t12\t1,234");
  const o=A.convert(t,A.detect(t,"proportion"),"proportion",{"decimal:0:2":"thousands"});
  assert.equal(o.records[0].ni,1234);assert.deepEqual(blocking(o),[]);
  assert.equal(A.parseCell("1,234.5",{decimal:"thousands"}).value,1234.5);
  assert.deepEqual(A.parseCell("1,234",{decimal:"thousands"}).spans.value,[0,5]);
  const c=A.parseCell("0.80 (0.70,0.90)",{decimal:"list"});
  assert.equal(c.kind,"est_ci");assert.equal(c.lo,.7);assert.equal(c.hi,.9);
});
test("P1 the per-paste decimal setting is the source of truth; the question only appears in ask mode",()=>{
  const ask=A.convert(DEC,A.detect(DEC,"generic"),"generic",{decimal:"ask"});assert.ok(decQuestion(ask));
  const unset=A.convert(DEC,A.detect(DEC,"generic"),"generic",{});assert.ok(decQuestion(unset));
  const comma=A.convert(DEC,A.detect(DEC,"generic"),"generic",{decimal:"comma","measure:type":"difference"});
  assert.ok(!decQuestion(comma));assert.equal(comma.records[0].est,1.23);
  const point=A.convert(DEC,A.detect(DEC,"generic"),"generic",{decimal:"point","measure:type":"difference"});
  assert.ok(!decQuestion(point));assert.ok(blocking(point).some(f=>f.code==="unparsed-cell"));
  const grouped=A.parseTable("Study\tEvents\tTotal\nA\t12\t1,234");
  const p=A.convert(grouped,A.detect(grouped,"proportion"),"proportion",{decimal:"point"});
  assert.equal(p.records[0].ni,1234);assert.ok(!p.questions.some(q=>q.id.startsWith("decimal:")));
});
test("P1 UI renders the worded decimal choices",async()=>{
  const h=uiSetup("generic");await h.paste("Study\tEstimate\nA\t1,23");
  const text=h.root.textContent;
  assert.match(text,/Decimal mark \(1,23 = 1\.23\)/);assert.match(text,/Thousands separator \(1,234 = 1234\)/);assert.match(text,/List separator/);
});

// P1: a swap answer must not erase other unanswered questions.
test("P1 planted: unanswered column question plus swap-columns answer still blocks",()=>{
  const t=A.parseTable("Study\tA\tB\tTotal\nS1\t20\t30\t2\nS2\t40\t50\t3"),d=A.detect(t,"proportion");
  const o=A.convert(t,d,"proportion",{"swap-columns:xi:ni":"swap"});
  assert.ok(o.questions.some(q=>q.id==="column:1"));assert.ok(o.questions.some(q=>q.id==="column:2"));
  assert.ok(blocking(o).some(f=>f.questionId==="column:1"));
  // Confirming the columns and the swap resolves everything.
  const done=A.convert(t,d,"proportion",{"column:1":"xi","column:2":"ignore","swap-columns:xi:ni":"swap"});
  assert.deepEqual(done.records.map(r=>[r.xi,r.ni]),[[2,20],[3,40]]);assert.deepEqual(blocking(done),[]);
});
test("P1 planted: unanswered column question plus swap-ci answer still blocks",()=>{
  const t=A.parseTable("Study\tRR\tLower\tUpper\tMystery\nA\t2\t4\t1\tfoo"),d=A.detect(t,"generic");
  const o=A.convert(t,d,"generic",{"swap-ci:0":"swap","scale:0":"natural"});
  assert.equal(o.records[0].lo,1);assert.equal(o.records[0].hi,4);
  assert.ok(blocking(o).some(f=>f.questionId==="column:4"));
  const done=A.convert(t,d,"generic",{"swap-ci:0":"swap","scale:0":"natural","column:4":"ignore"});
  assert.deepEqual(blocking(done),[]);close(done.records[0].sei,Math.log(4)/(2*z));
});

// P1: the R gate is a true relative criterion and has a tiny-magnitude planted copy.
const ENTRY=new URL("../../../../validation/entry/",import.meta.url);
const relOK=(js,r)=>js===null?r===null:Math.abs(js-r)<=1e-10*Math.abs(r);
const oldOK=(js,r)=>js===null?r===null:Math.abs(js-r)/Math.max(1,Math.abs(r))<=1e-10;
let generated=null;
function corpora(){
  if(!generated){
    execFileSync(process.execPath,[fileURLToPath(new URL("gen_cases.mjs",ENTRY))]);
    const read=n=>JSON.parse(readFileSync(new URL(n,ENTRY),"utf8"));
    generated={cases:read("cases.json"),tiny:read("cases.planted-tiny.json"),planted:read("cases.planted.json"),
      formula:existsSync(new URL("cases.planted-formula.json",ENTRY))?read("cases.planted-formula.json"):null};
  }
  return generated;
}
function misses(base,other,ok){
  let n=0;base.forEach((c,i)=>{for(const k of Object.keys(c.js).filter(k=>["value","mean","sd"].includes(k)))if(!ok(other[i].js[k],c.js[k]))n++;});return n;
}
test("P1 check_entry.R uses a true relative tolerance (exact equality when R == 0)",()=>{
  const src=readFileSync(new URL("check_entry.R",ENTRY),"utf8");
  assert.ok(!/max\(1/.test(src),"no max(1, |r|) denominator");
  assert.match(src,/abs\(js-r\)\s*<=\s*tol\*abs\(r\)/);
});
test("P1 planted-tiny corpus perturbs one 1e-12-magnitude value by 1e-6 relative: relative gate fails it, the old gate could not",()=>{
  const {cases,tiny}=corpora();
  assert.equal(tiny.length,cases.length);
  const changed=cases.map((c,i)=>[c,tiny[i]]).filter(([a,b])=>JSON.stringify(a)!==JSON.stringify(b));
  assert.equal(changed.length,1);
  const [a,b]=changed[0];assert.ok(Math.abs(a.js.value)<1e-11&&Math.abs(a.js.value)>1e-13);close(b.js.value/a.js.value,1+1e-6,1e-9);
  assert.equal(misses(cases,tiny,relOK),1);assert.equal(misses(cases,tiny,oldOK),0);
  assert.equal(misses(cases,cases,relOK),0);
});
test("P2 planted-formula corpus comes from a copy of alm-entry.js with Luo 0.39/n -> 0.40/n",()=>{
  const {cases,formula}=corpora();
  assert.ok(formula,"cases.planted-formula.json generated");assert.equal(formula.length,cases.length);
  assert.ok(misses(cases,formula,relOK)>=10);
  // Only Luo scenario-2 means move.
  formula.forEach((c,i)=>{if(JSON.stringify(c.js)!==JSON.stringify(cases[i].js))assert.equal(c.fn,"convertFivenum");});
});
test("P1 docs and workflow no longer describe a max(1,|R|) comparator as rel 1e-10",()=>{
  const readme=readFileSync(new URL("README.md",ENTRY),"utf8"),yml=readFileSync(new URL("../../.github/workflows/features.yml",ENTRY),"utf8");
  assert.ok(!/max\(1, abs\(R\)\)/.test(readme));assert.match(readme,/abs\(JS-R\) <= 1e-10 \* abs\(R\)/);
  assert.match(yml,/cases\.planted-tiny\.json/);assert.match(yml,/cases\.planted-formula\.json/);
});

// P2s.
test("P2 per-function citations: CI/p conversions cite §6.3.x, SD conversions §6.5.2.2, rejections cite their function",()=>{
  assert.equal(A.seFromCI({lo:1,hi:2}).citation,"Cochrane Handbook v6.5 §6.3.1");
  assert.equal(A.seFromCI({lo:2,hi:1}).citation,"Cochrane Handbook v6.5 §6.3.1");
  assert.equal(A.seFromP({est:1,p:0}).citation,"Cochrane Handbook v6.5 §6.3.2");
  assert.equal(A.estFromCI({lo:2,hi:1}).citation,"Cochrane Handbook v6.5 §6.3.1");
  assert.equal(A.sdFromSE({se:1,n:4}).citation,"Cochrane Handbook v6.5 §6.5.2.2");
  assert.equal(A.sdFromCI({lo:1,hi:2,n:1}).citation,"Cochrane Handbook v6.5 §6.5.2.2");
  assert.ok(!/6\.5\.2\.2/.test(A.eventsFromPercent({pct:101,n:1}).citation));
});
test("P2 n/N vs % inconsistency warns (12/150 (50%))",()=>{
  const t=A.parseTable("Study\tEvents\nA\t12/150 (50%)"),o=A.convert(t,A.detect(t,"proportion"),"proportion",{});
  assert.ok(o.flags.some(f=>f.code==="PERCENT_MISMATCH"&&!f.blocking));
});
test("P2 content heuristic never maps a second column to an already-used events field",()=>{
  const t=A.parseTable("Study\tEvents\tX\tTotal\nA\t2\t3\t20\nB\t1\t4\t30"),d=A.detect(t,"proportion");
  assert.equal(d.mapping[1],"xi");assert.notEqual(d.mapping[2],"xi");assert.ok(d.questions.some(q=>q.id==="column:2"));
});
test("P2 five-number method choice is exposed and logged",()=>{
  const t=A.parseTable("Study\tTreatment\tMedian (IQR)\tTotal\nA\tDrug\t4 (2-7)\t25"),m={0:"study",1:"treatment",2:"summary",3:"n"};
  const def=A.convert(t,m,"arm-nma",{});
  const wan=A.convert(t,m,"arm-nma",{fivenumMethod:"wan2014"});
  close(wan.records[0].mean,(2+4+7)/3);assert.notEqual(def.records[0].mean,wan.records[0].mean);
  assert.ok(wan.steps.some(s=>/wan2014/.test(s.text)));
  assert.ok(Array.isArray(A.FIVENUM_METHODS)&&A.FIVENUM_METHODS.includes("hozo2005"));
});
test("P2 UI offers the five-number method once a median/IQR conversion occurs and logs the choice",async()=>{
  const h=uiSetup("arm-nma");
  await h.paste("Study\tTreatment\tMedian (IQR)\tTotal\nA\tDrug\t4 (2-7)\t25");
  const select=h.all().find(e=>e.tagName==="select"&&e.children.some(o=>o.value==="wan2014"));
  assert.ok(select,"method selector shown");assert.equal(select.value,"luo/wan/shi");
  select.value="wan2014";await select.fire("change");
  close(h.panel.getResult().records[0].mean,13/3);
  assert.match(h.root.textContent,/using wan2014 \(user-selected method\)/);
});
test("P2 an extras column whose header differs in case can be confirmed",async()=>{
  const h=uiSetup("proportion",["subgroup"]);await h.paste("Study\tEvents\tTotal\tSubgroup\nA\t2\t20\tx");
  const out=h.panel.getResult();
  assert.equal(out.records[0].subgroup,"x");assert.deepEqual(blocking(out),[]);
  assert.equal(h.button("Use these rows").disabled,false);
});
test("P2 extras offered as choices on every column question",async()=>{
  const h=uiSetup("proportion",["subgroup"]);await h.paste("Study\tEvents\tTotal\tGroup label\nA\t2\t20\tx");
  const q=h.panel.getResult().questions.find(q=>q.id==="column:3");assert.ok(q.choices.includes("subgroup"));
});

// Minimal DOM double (same contract as alm-entry-ui.test.mjs).
class Element {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.handlers={};this._text="";this.value="";this.disabled=false;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join("");}
  appendChild(child){this.children.push(child);child.parent=this;return child;}
  replaceChildren(...children){this.children=[];this._text="";children.forEach(c=>this.appendChild(c));}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
  async fire(type){for(const fn of this.handlers[type]||[])await fn({target:this});}
  focus(){this.ownerDocument.activeElement=this;}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function descendants(el){return [el,...el.children.flatMap(descendants)];}
function uiSetup(schema,extras=[]){
  const doc={createElement(tag){return new Element(tag,this);},getElementById(id){return descendants(this.root).find(e=>e.id===id);}};
  const root=new Element("div",doc);doc.root=root;
  const panel=UI.mount(root,{schema,extras,apply:()=>({ok:true})});
  const all=()=>descendants(root),button=text=>all().find(e=>e.tagName==="button"&&e.textContent===text);
  const paste=async text=>{all().find(e=>e.tagName==="textarea").value=text;await button("Preview and convert").fire("click");};
  return {root,panel,button,paste,all};
}
