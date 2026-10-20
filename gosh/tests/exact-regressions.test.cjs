const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const enginePath = process.env.GOSH_EXACT_ENGINE || path.join(__dirname, '../exact-enum.js');
const uiPath = process.env.GOSH_EXACT_UI || path.join(__dirname, '../exact-ui.js');
const E = require(enginePath);

function page(noWorker=false) {
  const nodes = {}, workers = [];
  function node() { return {style:{}, hidden:false, value:'auto', textContent:'', innerHTML:'', children:[],
    append(...xs) { this.children.push(...xs); }, replaceChildren(...xs) { this.children=xs; },
    setAttribute(k,v) { this[k]=v; }, addEventListener(k,fn) {this[k]=fn;}, querySelector() { return node(); }}; }
  const el = id => nodes[id] ||= node();
  for (const id of ['exact-summary','exact-perstudy']) { el(id).tBodies=[node()]; el(id).tHead=node(); el(id).caption=node(); }
  class Worker { constructor() { if(noWorker)throw Error('worker unavailable'); workers.push(this); } postMessage() {} terminate() { this.stopped=true; } }
  let readyCalls=0;
  const window={AlmGoshExactEngine:E,__almGoshExactReady(){readyCalls++;}};
  vm.runInNewContext(fs.readFileSync(uiPath,'utf8'), {window, document:{getElementById:el,createElement:node}, Worker, setTimeout,clearTimeout,console});
  const request = (k=16) => ({rows:Array.from({length:k},(_,i)=>({te:i/10,se:1,label:'S'+i})),model:'FE',apply(){}});
  const complete = () => { const res=E.run([0,.2,.3],[.1,.2,.3],'FE'); res.k=16; workers.at(-1).onmessage({data:{type:'done',id:1,result:res}}); };
  return {el,workers,request,complete,ui:window.AlmGoshExact,readyCalls};
}
test('controller initializes the previously restored page when loaded',()=>assert.equal(page().readyCalls,1));
test('page loads the comparator required by its browser replay',()=>{
  const html=fs.readFileSync(process.env.GOSH_PAGE||path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/<script src="validate\/exact\/compare.js"><\/script>/);
  assert.match(html,/window\.__almGoshExactReady\s*=/);
});
test('sample switch clears exact tables and cached result restores full status',()=>{
  const p=page(), req=p.request(); p.ui.request(req);p.complete();
  assert.ok(p.el('exact-summary').tBodies[0].children.length);
  p.el('enum-mode').value='sample';p.ui.request(req);
  assert.equal(p.el('exact-summary').tBodies[0].children.length,0);
  assert.equal(p.el('exact-summary').hidden,true);
  p.el('enum-mode').value='exact';p.ui.request(req);
  assert.match(p.el('exact-status').textContent,/^Exact: all/);
});
test('clearing input invalidates pending manual exact request',()=>{
  const p=page();p.ui.request(p.request());p.ui.request(null);
  const before=p.workers.length;p.el('exact-run').onclick();assert.equal(p.workers.length,before);
});
test('sampling mode cannot bypass exact study limit through manual run',()=>{
  const p=page();p.el('enum-mode').value='sample';p.ui.request(p.request(31));
  p.el('exact-run').onclick();assert.equal(p.workers.length,0);assert.equal(p.el('exact-run').hidden,true);
});
test('manual run reuses completed result instead of claiming a sampled preview',()=>{
  const p=page();p.ui.request(p.request());p.complete();const n=p.workers.length;
  p.el('exact-run').onclick();assert.equal(p.workers.length,n);assert.match(p.el('exact-status').textContent,/^Exact: all/);
});
test('editing inputs stops pending worker and prevents stale completion',()=>{
  const p=page();p.ui.request(p.request());const w=p.workers[0];p.el('src').input();
  assert.equal(w.stopped,true);const status=p.el('exact-status').textContent;p.complete();
  assert.equal(p.el('exact-status').textContent,status);assert.match(status,/Inputs changed/);
});
test('exact and sample result labels propagate into export objects and SVG',()=>{
  const p=page();for(const sampled of [false,true]) {
    const result={sampled,k:16,n_subsets:sampled?5000:65535};p.el('plot').innerHTML='<rect/>';
    p.ui.labelResult(result);assert.match(result.enumeration_label,sampled?/random sample of 5,000/:/all 2\^16-1 subsets \(exact\)/);
    assert.ok(p.el('plot').innerHTML.includes(result.enumeration_label));
  }
});
test('fallback completes with the actual engine when workers are unavailable',async()=>{
  const p=page(true),req=p.request(16);
  const res=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fallback timeout')),10000);req.apply=r=>{clearTimeout(timer);resolve(r);};p.ui.request(req);});
  assert.equal(res.n_subsets,65535);assert.match(p.el('exact-status').textContent,/^Exact: all/);
});
test('nonrepresentable arithmetic and invalid grids refuse before enumeration',()=>{
  for(const [te,se] of [[[1,2],[1e-300,1]],[[1e308,-1e308],[1,1]],[[1,2],[1e300,1]]])
    assert.throws(()=>E.run(te,se,'DL'),/numeric|range|represent|finite/i);
  assert.throws(()=>E.run([1,2],[1,1],'FE',{gridX:-1}),/grid/i);
});
test('quantile collection cap is checked before allocating large buffers',()=>{
  let large=0;const module={exports:{}};
  const Float64=new Proxy(Float64Array,{construct(target,args){if(args[0]>4000000)large++;return new target(...args);}});
  vm.runInNewContext(fs.readFileSync(enginePath,'utf8'),{module,Float64Array:Float64});
  const e=module.exports.createEngine(Array(23).fill(.25),Array(23).fill(1),'FE');
  e.mainPass(0,e.highCount);assert.throws(()=>e.planQuantiles(),/exceed/);assert.equal(large,0);
});
