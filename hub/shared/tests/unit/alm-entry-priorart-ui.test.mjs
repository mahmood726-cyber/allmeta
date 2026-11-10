import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),UI=require("../../../../shared/alm-entry-ui.js");
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
function setup(){
  const doc={createElement(tag){return new Element(tag,this);}},root=new Element("div",doc);
  let applied=0;
  const panel=UI.mountProvenance(root,{schema:"generic",usedAs:"log hazard ratio",apply(){applied++;return {ok:true};}});
  const all=()=>descendants(root),button=t=>all().find(e=>e.tagName==="button"&&e.textContent===t);
  const field=t=>all().find(e=>e.tagName==="label"&&e.textContent.startsWith(t))?.children.find(e=>["input","select"].includes(e.tagName));
  const set=async(t,value)=>{const e=field(t);assert.ok(e,t);e.value=value;await e.fire(e.tagName==="select"?"change":"input");};
  const paste=async text=>{const p=all().find(e=>e.tagName==="textarea");p.value=text;await p.fire("input");await button("Extract candidates").fire("click");};
  const add=async()=>{await set("Choose the source result","0");await button("Add chosen result").fire("click");};
  const complete=async()=>{for(const [k,v] of [["Study label","Smith 2020"],["Full reference","Report"],["Location","Table 1"],["Outcome measured","Rash"],["Timepoint","12 weeks"]])await set(k,v);};
  return {root,panel,field,set,button,paste,add,complete,applied:()=>applied};
}
test("ranked alternatives are never preselected and facet decisions gate confirmation",async()=>{
  const h=setup();
  await h.paste("adjusted HR .7 (95% CI .5-.9); unadjusted HR .8 (95% CI .6-1.1)");
  assert.equal(h.field("Choose the source result").value,"");assert.equal(h.button("Add chosen result").disabled,true);
  await h.add();await h.complete();assert.equal(h.field("I confirm").disabled,true);
  assert.equal(h.field("Choose adjustment").value,"");
  await h.set("Choose adjustment","adjusted");assert.equal(h.field("I confirm").disabled,false);
  const confirm=h.field("I confirm");confirm.checked=true;await confirm.fire("change");
  assert.equal(h.button("Use these rows").disabled,false);
  await h.set("Choose adjustment","unadjusted");assert.equal(confirm.checked,false);assert.equal(confirm.disabled,true);
});
test("decimal mark auto-asks, explicit comma choice re-extracts and persists",async()=>{
  const h=setup();assert.equal(h.field("Decimal mark").value,"point");
  await h.paste("HR 0,72 (95% CI 0,51–0,94)");
  assert.equal(h.field("Decimal mark").value,"ask");
  await h.set("Decimal mark","comma");await h.button("Extract candidates").fire("click");
  await h.add();await h.complete();
  assert.equal(h.field("I confirm").disabled,false);
  const rec=h.panel.getResult().provenance[0];assert.equal(rec.decimal,"comma");assert.equal(rec.values[0].text,"0,72");
  assert.equal(rec.confirmed,false);
});
test("single candidate still requires explicit confirmation and p bound remains visible",async()=>{
  const h=setup();await h.paste("HR .7 (95% CI .5-.9); p < .001");await h.add();await h.complete();
  assert.equal(h.button("Use these rows").disabled,true);
  assert.match(h.root.textContent,/p < 0.001 \(BOUND\)/);
  const confirm=h.field("I confirm");confirm.checked=true;await confirm.fire("change");
  await h.button("Use these rows").fire("click");assert.equal(h.applied(),1);
});
test("PLANTED DEFECT: tampered replay output blocks apply after confirmation",async()=>{
  const h=setup();await h.paste("HR .7 (95% CI .5-.9)");await h.add();await h.complete();
  const confirm=h.field("I confirm");confirm.checked=true;await confirm.fire("change");
  const rec=h.panel.getResult().provenance[0];rec.conversions[0].result+=.01;
  await h.button("Use these rows").fire("click");assert.equal(h.applied(),0);
});
