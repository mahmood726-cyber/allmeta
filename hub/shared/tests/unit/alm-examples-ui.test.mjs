// Unit DOM double: tests loading/provenance/staleness, not app statistics or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root=new URL('../../../../',import.meta.url);
const script=readFileSync(new URL('shared/alm-examples.js',root),'utf8');
const fixture=JSON.parse(readFileSync(new URL('validation/examples/correlation-ma/dat.molloy2014.json',root),'utf8'));

function setup(transform=x=>x) {
  const nodes=new Map();
  class Element {
    constructor(tag) {this.tagName=tag;this.children=[];this.style={};this.dataset={};this.handlers={};this.value='';this.textContent='';}
    set id(x) {this._id=x;nodes.set(x,this);} get id(){return this._id;}
    append(...x){this.children.push(...x);if(this.tagName==='select' && !this.value)this.value=x[0]?.value||'';}
    setAttribute(k,v){this[k]=v;}
    addEventListener(k,fn){this.handlers[k]=fn;}
    dispatchEvent(e){this.handlers[e.type]?.(e);}
    closest(){return null;}
  }
  const input=new Element('textarea');input.id='f-data';input.value='Original synthetic input';
  const method=new Element('select');method.id='f-method';method.value='DL';
  const result=new Element('strong');result.textContent='0.125';
  const headline={get textContent(){return `k = 16 · pooled r = ${result.textContent} [0.100, 0.150] · τ²(z) = 0.0100 · I² = 20.0%`;}};
  const body=new Element('body');
  const document={readyState:'complete',body,createElement:t=>new Element(t),getElementById:id=>nodes.get(id),
    querySelector:s=>s==='#f-data'?input:s==='#headline strong'?result:s==='#headline'?headline:null,
    querySelectorAll:()=>[input,method]};
  // A deliberately fixed UI test double; no computed research result is claimed.
  const adapter={packages:['test-double'],currentState:()=>({}),appValues:()=>Object.entries({r:.125,r_lo:.1,r_hi:.15,tau2_z:.01,I2:.2}).map(([key,value])=>({key,value})),
    buildScript:()=>'',compare:{kind:{r:'rel'},tolerance:{default:1e-9}}};
  const ctx={document,console,structuredClone,setTimeout,Event:class{constructor(type){this.type=type;}},
    fetch:async()=>({ok:true,json:async()=>transform(structuredClone(fixture))}),AlmLiveAdapters:{'correlation-ma':adapter}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(script,ctx);ctx.AlmExamples.register('correlation-ma');
  return {ctx,nodes,input,result,load:()=>nodes.get('alm-real-example-load').handlers.click()};
}
test('mount leaves defaults intact; deliberate load shows source and licence',async()=>{
  const h=setup();assert.equal(h.input.value,'Original synthetic input');
  assert.equal(h.nodes.get('alm-real-example-citation').textContent,'');
  await h.load();
  assert.equal(h.nodes.get('alm-real-example-status').dataset.state,'ready');
  assert.match(h.nodes.get('alm-real-example-citation').textContent,/Molloy/);
  assert.match(h.nodes.get('alm-real-example-citation').textContent,/Data values are facts/);
  assert.equal(h.ctx.AlmExamples.capture().display[0].value,.125);
});
test('planted missing citation refuses load before altering the original input',async()=>{
  const h=setup(d=>{delete d.citation;return d;});await h.load();
  assert.equal(h.nodes.get('alm-real-example-status').dataset.state,'error');
  assert.equal(h.input.value,'Original synthetic input');
  assert.throws(()=>h.ctx.AlmExamples.capture(),/example/);
});
test('planted display mutation and stale inputs are independently rejected',async()=>{
  const h=setup();await h.load();
  h.result.textContent='12345';assert.throws(()=>h.ctx.AlmExamples.capture(),/Displayed/);
  h.result.textContent='0.125';assert.doesNotThrow(()=>h.ctx.AlmExamples.capture());
  h.input.value+='\nnew data';assert.throws(()=>h.ctx.AlmExamples.capture(),/inputs changed/);
});

test('example panel outside main is a named landmark with a visible heading',()=>{
  const h=setup(), panel=h.nodes.get('alm-real-example-panel');
  const title=h.nodes.get(panel['aria-labelledby']);
  assert.ok(title, 'the panel must reference an existing heading');
  assert.equal(title.tagName,'h2');
  assert.equal(title.textContent,'Real example');
  assert.ok(panel.children.includes(title));
  // Control: the picker still has its visible enclosing label.
  const picker=h.nodes.get('alm-real-example-choice');
  assert.ok(panel.children.some(el=>el.tagName==='label' && el.children.includes(picker)));
});

test('loading an example names every analysis option it changed, old -> new',async()=>{
  const h=setup();await h.load();
  const text=h.nodes.get('alm-real-example-status').textContent;
  assert.equal(h.nodes.get('f-method').value,'REML');
  // The double has no <label>/<option> elements, so the id and raw values are the fallback wording.
  assert.match(text,/Analysis updated; f-method: "DL" -> "REML"\.$/);
  // Control: an option that already has the published value is not reported as a change.
  const same=setup();same.nodes.get('f-method').value='REML';await same.load();
  assert.match(same.nodes.get('alm-real-example-status').textContent,/Analysis updated; no analysis options changed\.$/);
});
