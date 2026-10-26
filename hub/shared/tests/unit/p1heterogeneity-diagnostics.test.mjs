import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
function section(start, end) {
  const a=html.indexOf(start), b=html.indexOf(end,a);
  assert.ok(a>=0 && b>a); return html.slice(a,b);
}
function compute() {
  const ctx=vm.createContext({window:{}, Z975:1.959963984540054});
  vm.runInContext(readFileSync(new URL('../../../../shared/ma-core.js',import.meta.url),'utf8'),ctx);
  vm.runInContext(section('    function parseStudies(text)', '    function renderStats('),ctx);
  return ctx;
}
const studies=Array.from({length:13},(_,i)=>({label:'S'+i,est:Math.sin(i)*0.9+i/15,se:0.1+i/40,v:(0.1+i/40)**2}));
function checkRefits(k, method) {
  const ctx=compute(), input=studies.slice(0,k), result=ctx.computeAll(input,method);
  for(let i=0;i<k;i++) {
    const sub=input.filter((_,j)=>j!==i);
    const tau=method==='dl'?ctx.tau2_DL(sub):ctx.tau2For(method,sub);
    const fit=ctx.poolSummary(sub,tau), row=result.loo[i];
    assert.equal(row.estimator,method);
    assert.ok(Math.abs(row.tau2-tau)<1e-12);
    assert.ok(Math.abs(row.mu-fit.mu)<1e-12);
    assert.ok(Math.abs(result.baujat[i].y-(result.sum.mu-fit.mu)**2/fit.se**2)<1e-12);
  }
}
test('P1: DL at k=10 retains DL in every LOO and Baujat refit',()=>checkRefits(10,'dl'));
test('control: DL at k=13 retains its existing refits',()=>checkRefits(13,'dl'));
for(const method of ['pm','reml','ml','eb','sj','he','hs']) test('control: '+method+' diagnostics retain estimator',()=>checkRefits(10,method));
test('control: full DL fit below k=10 still explicitly falls back to PM',()=>{
  const result=compute().computeAll(studies.slice(0,9),'dl');
  assert.equal(result.dlRefused,true); assert.equal(result.estimator,'pm');
  assert.ok(result.loo.every(r=>r.estimator==='pm'));
});
function validator({valid=true,save=true}={}) {
  const handlers={}, opened=[], current=[{label:'Current',est:0.2,se:0.1},{label:'New',est:-0.3,se:0.2}];
  let bus=[{label:'Stale',est:8,se:1}];
  const elements=new Map();
  const document={readyState:'complete', getElementById(id) {if(!elements.has(id)) elements.set(id,{value:'',addEventListener(type,fn){handlers[id+':'+type]=fn;}});return elements.get(id);}};
  const window={alm:{plotExport(){}},open(){opened.push(JSON.parse(JSON.stringify(bus)));}};
  const MaStudies={write(rows){if(save)bus=rows;return save;},attachVerifyInRButton(){handlers['btn-verify-in-r:click']=()=>window.open();}};
  window.MaStudies=MaStudies;
  const noop=()=>{};
  const ctx=vm.createContext({window,document,MaStudies,Toast:{show:noop},_lastInfo:null,_lastStudies:[],fields:{},
    render(){ctx._lastInfo=valid?{}:null;ctx._lastStudies=valid?current:[];},addWarning:noop,
    onDownloadJson:noop,onReset:noop,onExample:noop,onBusLoad:noop,onPushPooledToGrade:noop});
  vm.runInContext(section('    function onBusSave()', '    // Push the HKSJ'),ctx);
  vm.runInContext(section('    function attach()', '    const loaded = loadSaved();')+'\nattach();',ctx);
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if(match[1].includes('MaStudies.attachVerifyInRButton')) vm.runInContext(match[1],ctx);
  }
  return {click(id){assert.equal(typeof handlers[id+':click'],'function');handlers[id+':click']();},opened,current};
}
for(const id of ['btn-verify-in-r','btn-validate-webr']) {
  test('P1: '+id+' replaces stale bus with current fitted studies',()=>{const h=validator();h.click(id);assert.deepEqual(h.opened,[h.current]);});
  test('control: '+id+' does not open after invalid input',()=>{const h=validator({valid:false});h.click(id);assert.deepEqual(h.opened,[]);});
  test('control: '+id+' does not open after failed bus write',()=>{const h=validator({save:false});h.click(id);assert.deepEqual(h.opened,[]);});
}
