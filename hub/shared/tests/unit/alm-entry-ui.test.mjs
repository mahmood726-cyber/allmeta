import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),UI=require("../../../../shared/alm-entry-ui.js");
// Small DOM double for behaviour tests. Browser layout/assistive technology
// testing is deliberately not claimed by this harness.
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
function setup(schema="proportion",extras=[],apply=()=>({ok:true})){
  const doc={createElement(tag){return new Element(tag,this);},getElementById(id){return descendants(this.root).find(e=>e.id===id);}};
  const root=new Element("div",doc);doc.root=root;
  const panel=UI.mount(root,{schema,extras,apply});
  const all=()=>descendants(root),get=tag=>all().find(e=>e.tagName===tag);
  const button=text=>all().find(e=>e.tagName==="button"&&e.textContent===text);
  const paste=async text=>{get("textarea").value=text;await button("Preview and convert").fire("click");};
  return {root,doc,panel,all,get,button,paste};
}
test("UI initial state and accessible labels",()=>{
  const h=setup();assert.equal(h.button("Use these rows").disabled,true);
  assert.ok(h.all().some(e=>e.tagName==="label"&&e.htmlFor===h.get("textarea").id));
  assert.ok(h.all().some(e=>e.attrs["aria-live"]==="polite"));
  assert.equal(h.all().find(e=>e.type==="file").accept,".csv,.tsv,.txt");
});
test("UI previews and applies converted records with log",async()=>{
  let received;const h=setup("proportion",[],rows=>{received=rows;return {ok:true};});
  await h.paste("Study\tEvents\tTotal\nA\t8%\t150");
  assert.equal(h.button("Use these rows").disabled,false);
  await h.button("Use these rows").fire("click");
  assert.equal(received[0].xi,12);assert.ok(globalThis.AlmFeaturesState.entryLog.some(s=>s.method==="events from percent"));
});
test("UI blocking flag disables apply",async()=>{
  const h=setup();await h.paste("Study\tEvents\tTotal\nA\t-1\t10");
  assert.equal(h.button("Use these rows").disabled,true);assert.match(h.root.textContent,/Block:/);
});
test("UI warning is text, not only colour",async()=>{
  const h=setup();await h.paste("Study\tEvents\tTotal\nA\t8.2%\t31");
  assert.equal(h.button("Use these rows").disabled,false);assert.match(h.root.textContent,/Warning:.*non-integer events/);
});
test("UI ambiguous column radio group updates mapping",async()=>{
  const h=setup();await h.paste("Study\tMystery\tTotal\nA\t2\t20");
  const fieldset=h.all().find(e=>e.tagName==="fieldset");
  assert.ok(fieldset.children.some(e=>e.tagName==="legend"));assert.equal(h.button("Use these rows").disabled,true);
  const radio=descendants(fieldset).find(e=>e.type==="radio"&&e.value==="xi");radio.focus();
  await radio.fire("change");
  assert.equal(h.button("Use these rows").disabled,false);assert.equal(h.doc.activeElement.id,radio.id);
});
test("UI confirmed CSV re-renders separate column mappings",async()=>{
  const h=setup();await h.paste("Study,Events,Total\nA,2,20");
  const radio=h.all().find(e=>e.type==="radio"&&e.value==="columns");await radio.fire("change");
  assert.equal(h.all().filter(e=>e.tagName==="select").length,3);assert.equal(h.button("Use these rows").disabled,false);
  assert.equal(h.panel.getResult().records[0].xi,2);
});
test("UI changing text invalidates prior conversion",async()=>{
  const h=setup();await h.paste("Study\tEvents\tTotal\nA\t2\t20");
  h.get("textarea").value="bad";await h.get("textarea").fire("input");
  assert.equal(h.button("Use these rows").disabled,true);assert.equal(h.panel.getResult(),null);
});
test("UI file import runs conversion",async()=>{
  const h=setup(),file=h.all().find(e=>e.type==="file");
  file.files=[{text:async()=>"Study\tEvents\tTotal\nA\t2\t20"}];
  await file.fire("change");assert.equal(h.panel.getResult().records[0].xi,2);
});
test("UI rejected file read blocks stale rows",async()=>{
  const h=setup(),file=h.all().find(e=>e.type==="file");
  await h.paste("Study\tEvents\tTotal\nA\t2\t20");
  file.files=[{text:async()=>{throw new Error("Unreadable");}}];
  await file.fire("change");assert.equal(h.button("Use these rows").disabled,true);assert.match(h.root.textContent,/Unreadable/);
});
test("UI extras pass through as text",async()=>{
  const h=setup("proportion",["subgroup"]);await h.paste("Study\tEvents\tTotal\tsubgroup\nA\t2\t20\tAdults");
  assert.equal(h.panel.getResult().records[0].subgroup,"Adults");assert.equal(h.button("Use these rows").disabled,false);
});
test("UI user markup stays literal",async()=>{
  const h=setup();await h.paste("Study\tEvents\tTotal\n<img src=x onerror=alert(1)>\t2\t20");
  assert.ok(h.all().some(e=>e.tagName==="td"&&e.textContent==="<img src=x onerror=alert(1)>"));
  assert.ok(!h.all().some(e=>e.tagName==="img"));
});
test("UI unsuccessful apply is reported without storing a success log",async()=>{
  const h=setup("proportion",[],()=>({ok:false}));globalThis.AlmFeaturesState={entryLog:["before"]};
  await h.paste("Study\tEvents\tTotal\nA\t2\t20");await h.button("Use these rows").fire("click");
  assert.match(h.root.textContent,/Could not apply/);assert.deepEqual(globalThis.AlmFeaturesState.entryLog,["before"]);
});
test("UI destroy removes panel",()=>{const h=setup();h.panel.destroy();assert.equal(h.root.children.length,0);});
test("PLANTED DEFECT: UI blocking depends on conversion flags",async()=>{
  const saved=A.convert,h=setup();await h.paste("Study\tEvents\tTotal\nA\t-1\t20");
  assert.equal(h.button("Use these rows").disabled,true);
  try{
    A.convert=(...args)=>({...saved(...args),flags:[]});
    await h.button("Preview and convert").fire("click");
    assert.equal(h.button("Use these rows").disabled,false);
  }finally{A.convert=saved;}
  await h.button("Preview and convert").fire("click");assert.equal(h.button("Use these rows").disabled,true);
});
test("core browser IIFE works without require or shared stats",()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../../../../shared/alm-entry.js",import.meta.url),"utf8"),context);
  assert.ok(context.window.AlmEntry);assert.equal(context.window.AlmEntry.sdFromSE({se:2,n:25}).value,10);
  assert.ok(Math.abs(context.window.AlmEntry.qt(.975,9)-2.2621571627982049)<1e-12);
});
test("UI browser IIFE exposes mount",()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../../../../shared/alm-entry-ui.js",import.meta.url),"utf8"),context);
  assert.equal(typeof context.window.AlmEntryUI.mount,"function");
});
