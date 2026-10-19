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
