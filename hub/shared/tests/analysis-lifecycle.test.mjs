import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function setup(){
 const updated={hidden:true},stale={hidden:true},input={id:'data',value:'valid',matches:s=>s==='#data'};
 const events={};const window={};
 const document={getElementById:id=>id==='analysis-status'?updated:stale,querySelectorAll:()=>[input],addEventListener:(type,fn,capture)=>{assert.equal(capture,true);events[type]=fn;}};
 runInNewContext(readFileSync(new URL('../analysis-lifecycle.js',import.meta.url),'utf8'),{window,document});
 return {updated,stale,input,events,wrap:window.alm.analysisLifecycle,event:type=>events[type]({target:input})};
}
test('manual edit, successful run, refusal and exception reflect actual completion',()=>{
 const x=setup();let calls=0;const run=x.wrap(()=>{calls++;if(x.input.value==='throw')throw Error('refused');return x.input.value==='valid';},r=>r,'#data');
 run();assert.equal(x.updated.hidden,false);assert.equal(x.stale.hidden,true);
 x.input.value='invalid';x.event('input');assert.equal(x.updated.hidden,true);assert.equal(x.stale.hidden,false);
 run();assert.equal(x.updated.hidden,true);assert.equal(x.stale.hidden,true);
 x.input.value='valid';run();assert.equal(x.updated.hidden,false);
 x.input.value='throw';assert.throws(run);assert.equal(x.updated.hidden,true);assert.equal(x.stale.hidden,true);assert.equal(calls,4);
});
test('automatic input run followed by change does not re-mark completed results stale',()=>{
 const x=setup();let calls=0;const run=x.wrap(()=>{calls++;return true;},r=>r,'#data');run();
 x.input.value='changed';x.event('input');run();x.event('change');
 assert.equal(x.updated.hidden,false);assert.equal(x.stale.hidden,true);assert.equal(calls,2);
});
test('training state changes invalidate until retrained; refusals hide both notices',()=>{
 const x=setup();let label='include',ok=true;const run=x.wrap(()=>ok,r=>r,'#data',()=>label);
 run();label='exclude';run.refresh();assert.equal(x.updated.hidden,true);assert.equal(x.stale.hidden,false);
 run();run.refresh();assert.equal(x.updated.hidden,false);assert.equal(x.stale.hidden,true);
 ok=false;run();run.refresh();assert.equal(x.updated.hidden,true);assert.equal(x.stale.hidden,true);
});


test('completion observers preserve result, receiver and arguments; unsubscribe is idempotent',()=>{
 const x=setup(), context={value:42}; let observed;
 const run=x.wrap(function(arg){assert.equal(this,context);assert.equal(arg,'argument');return this.value;},r=>r===42,'#data');
 const unsubscribe=run.onComplete(result=>{observed=result;assert.equal(x.updated.hidden,false);});
 assert.equal(run.call(context,'argument'),42);assert.equal(observed,42);
 unsubscribe();unsubscribe();observed=null;run.call(context,'argument');assert.equal(observed,null);
 assert.throws(()=>run.onComplete(null),/function/);
});

test('refusals and exceptions never notify completion',()=>{
 const x=setup();let calls=0,throws=false;
 const run=x.wrap(()=>{if(throws)throw Error('failure');return false;},r=>r,'#data');
 run.onComplete(()=>calls++);assert.equal(run(),false);throws=true;assert.throws(run,/failure/);assert.equal(calls,0);
});

test('live rejects invalid options before DOM mutation',()=>{
 const x=setup(),run=x.wrap(()=>true,r=>r,'#data');
 for(const options of [undefined,{}, {inputs:'#data',toggleId:'live',debounceMs:-1},{inputs:'#data',toggleId:'live',ready:false}])
  assert.throws(()=>x.wrap.live(run,options),/Invalid live analysis options/);
 assert.throws(()=>x.wrap.live(()=>true,{inputs:'#data',toggleId:'live'}),/Invalid live analysis options/);
});
