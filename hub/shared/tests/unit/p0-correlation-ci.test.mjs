import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../../../../'+p, import.meta.url),'utf8');
function page() {
 const nodes = new Map();
 const el = id => { if(!nodes.has(id)) nodes.set(id,{value:id==='f-method'?'REML':'',innerHTML:'',textContent:'',get childNodes(){return [{html:this.innerHTML}];},listeners:{},addEventListener(n,f){const previous=this.listeners[n];this.listeners[n]=e=>{if(previous)previous(e);f(e);};},setAttribute(n,v){this[n]=v;},getAttribute(n){return this[n]??null;},replaceChildren(...nodes){this.innerHTML=nodes.map(n=>n.html).join('');},querySelectorAll(){return [];}}); return nodes.get(id); };
 const document={readyState:'loading',getElementById:el,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
 const ctx=vm.createContext({document,matchMedia:()=>({matches:false}),setTimeout:()=>0,clearTimeout(){},MutationObserver:class {observe(){}},console}); ctx.window=ctx;
 vm.runInContext(read('shared/ma-core.js'),ctx);
 vm.runInContext(read('correlation-ma/index.html').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 vm.runInContext(read('correlation-ma/plus-core.js'),ctx);
 vm.runInContext(read('correlation-ma/plus-ui.js').replace('else document.addEventListener("DOMContentLoaded", mount);','else mount();'),ctx);
 ctx.AlmCorrValidationPins={files:[]};
 vm.runInContext(read('correlation-ma/validate/adapter.js'),ctx);
 const choose = test => el('alm-plus').listeners.change({target:{name:'alm-plus-test',value:test}});
 return {ctx,el,choose};
}
function expected(ctx, test, method='REML') {
 const a=ctx._almLastCorrMA();
 return ctx.AlmCorrPlus.sensitivity(a.studies,{method,test}).cells.find(c=>c.method===method&&c.test===test);
}
function check(p,t) {
 const {ctx,el}=p, a=ctx._almLastCorrMA(), e=expected(ctx,t,a.method);
 assert.equal(a.r_lo,e.r_lo); assert.equal(a.r_hi,e.r_hi); assert.equal(a.se_z,e.se_z);
 assert.ok(el('headline').innerHTML.includes(e.r_lo.toFixed(3)+', '+e.r_hi.toFixed(3)));
 assert.ok(el('forest-host').innerHTML.includes("points='"+(150+(e.r_lo+1)*190)+','));
 const s=ctx.AlmCorrValidationAdapter.live.currentState();
 assert.ok(ctx.AlmCorrValidationAdapter.live.buildScript(s).includes("test='"+t+"'"));
}
test('control: initial Wald headline, forest and live R agree',()=>check(page(),'z'));
for(const t of ['knha','adhoc']) test('P0-36: '+t+' selection propagates to main outputs and live R',()=>{
 const p=page(); p.choose(t); check(p,t);
 assert.equal(p.ctx._almLastCorrMA().test,t);
 assert.equal(JSON.parse(JSON.stringify(p.ctx._almLastCorrMA())).test,t);
 p.choose('z'); check(p,'z');
});
test('control: FE retains Wald with HKSJ marked inapplicable in extras',()=>{
 const p=page();p.choose('knha');p.el('f-method').value='FE';p.el('f-method').listeners.change();check(p,'z');
});

test('P0-36: ad-hoc floor differs from unfloored HKSJ for homogeneous studies',()=>{
 const p=page();p.el('f-data').value='A,0.20,30\nB,0.21,35\nC,0.19,40';
 p.el('f-data').listeners.input();p.choose('knha');check(p,'knha');
 const width=p.ctx._almLastCorrMA().r_hi-p.ctx._almLastCorrMA().r_lo;
 p.choose('adhoc');check(p,'adhoc');
 assert.ok(p.ctx._almLastCorrMA().r_hi-p.ctx._almLastCorrMA().r_lo>width);
});
test('P0-36: selected CI survives input edits, replay and extras restore',()=>{
 const p=page();p.choose('knha');const saved=p.ctx.__almCorrValidationSnapshot();
 p.ctx.__almCorrValidationRun('z');assert.equal(p.ctx._almLastCorrMA().test,'z');
 p.ctx.__almCorrValidationRestore(saved);check(p,'knha');
 p.ctx.AlmCorrPlusUI.restore({test:'adhoc',benchmark:'cohen',loo:false});check(p,'adhoc');
 p.el('f-data').value='';p.el('f-data').listeners.input();assert.equal(p.ctx._almLastCorrMA(),null);
 p.el('f-data').value=saved.data;p.el('f-data').listeners.input();check(p,'adhoc');
});
test('control: live R refuses unknown CI methods',()=>{
 const p=page();const s=p.ctx.AlmCorrValidationAdapter.live.currentState();
 assert.throws(()=>p.ctx.AlmCorrValidationAdapter.live.buildScript({...s,test:"invalid"}),/Invalid CI method/);
});
