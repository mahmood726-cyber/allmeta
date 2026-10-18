import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setup,deferred} from './dom-fixture.mjs';
import {summarize,canonical,contracts} from '../replay_baseline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const result={checks:1,passed:1,failed:[],maxima:{abs:0}};
const adapter=run=>({paper:{checks:1},corpus:{files:[],run}});
const descriptor=()=>({app:'fixture',lifecycle:()=>{},describe:()=>({}),displayed:()=>({}),sensitivity:null,rExport:{live:{}}});

test('running spans await, refusals, concurrency and duplicate runs',async()=>{
  const x=setup(),a=deferred(),b=deferred();
  const first=x.window.AlmValidate.mount(x.host,adapter(()=>a.promise));
  const other=new x.Element('div');x.main.append(other);
  const second=x.window.AlmValidate.mount(other,adapter(()=>b.promise));
  assert.equal(x.window.AlmValidate.isRunning(),false);
  const p=first.runCorpus(),q=second.runCorpus();
  assert.equal(x.window.AlmValidate.isRunning(),true);
  await assert.rejects(first.runCorpus(),/already running/);
  a.resolve(result);await p;assert.equal(x.window.AlmValidate.isRunning(),true);
  b.reject(Error('fixture refusal'));await assert.rejects(q,/fixture refusal/);
  assert.equal(x.window.AlmValidate.isRunning(),false);
});

test('add-on event and silent input changes do not stale a live result; analysis edits do',async()=>{
  for(const edit of ['addon-event','addon-silent','analysis-event','analysis-silent']){
    const x=setup(),r=deferred();x.window.AlmWebR={runR:()=>r.promise};
    const aside=new x.Element('aside');aside.setAttribute('data-alm-addon','');x.main.after(aside);
    const control=new x.Element('input');aside.append(control);
    const a=adapter(()=>result);a.live={currentState:()=>({}),appValues:()=>[{key:'x',value:1}],compare:{tolerance:{default:0}},buildScript:()=>'',packages:[]};
    const widget=x.window.AlmValidate.mount(x.host,a),pending=widget.runLive();
    await Promise.resolve();await Promise.resolve();
    const target=edit.startsWith('addon')?control:x.input;target.value='changed';
    if(edit.endsWith('event')){x.document.dispatch('input',target);x.document.dispatch('change',target);}
    x.tick();r.resolve({ok:true,stdout:'ALMJSON:{"x":1}',versions:{}});
    const answer=await pending;assert.equal(!!answer.stale,edit.startsWith('analysis'));
    assert.equal(x.window.AlmValidate.isRunning(),false);
  }
});

test('host is outside main, panels lazy, work/events suspended during replay',async()=>{
  const x=setup();let calls=0;
  const d=descriptor();d.describe=()=>{throw Error('must be lazy');};
  const api=x.window.alm.addons.register(d),panel=api.panel('methods','Methods',()=>calls++);
  const aside=x.document.getElementById('alm-addons');
  assert.equal(x.document.body.children[1],aside);assert.equal(x.main.contains(aside),false);assert.equal(calls,0);
  assert.throws(()=>x.window.alm.addons.register(d),/already/);
  assert.throws(()=>api.panel('methods','Methods',()=>{}),/duplicate/);
  const gate=deferred(),widget=x.window.AlmValidate.mount(x.host,adapter(()=>gate.promise));
  const pending=widget.runCorpus();assert.equal(api.run(()=>calls++),false);assert.equal(panel.open(),false);
  assert.equal(aside.dispatch('click').prevented,true);assert.equal(calls,0);
  gate.resolve(result);await pending;assert.equal(panel.open(),true);panel.open();assert.equal(calls,1);
  assert.equal(api.run(()=>calls++),true);assert.equal(calls,2);
});

test('baseline serialization is stable and preserves failures and nonfinite maxima',()=>{
  assert.equal(contracts.length,13);
  const r={checks:3,passed:0,failed:[{id:'z'},{id:'a'},{id:'a'}],maxima:{z:Infinity,a:0}};
  assert.deepEqual(summarize(r),summarize({...r,failed:[...r.failed].reverse(),maxima:{a:0,z:Infinity}}));
  assert.equal(summarize(r).failedIdsSha256,createHash('sha256').update('["a","a","z"]').digest('hex'));
  assert.equal(summarize(r).maxima.z,'Infinity');assert.throws(()=>summarize({...r,passed:1}),/accounting/);
  assert.deepEqual(canonical({b:1,a:2}),{a:2,b:1});
});

test('frozen guard covers working, staged, committed, renamed and untracked changes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'alm-guard-'));
  const git=(...args)=>execFileSync('git',['-C',dir,'-c','commit.gpgsign=false','-c','core.hooksPath='+join(dir,'no-hooks'),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();
  const write=(path,text)=>{mkdirSync(join(dir,path,'..'),{recursive:true});writeFileSync(join(dir,path),text);};
  const guard=(...args)=>spawnSync(process.env.PYTHON||'python',[join(root,'scripts/check_frozen_paths.py'),'--repo',dir,'--base','HEAD',...args],{encoding:'utf8',timeout:60000});
  try {
    git('init');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
    write('shared/ma-core.js','original');write('gosh/validate/a.json','{}');git('add','.');git('commit','-m','fixture');
    assert.equal(guard('--lane','W0').status,0);
    write('shared/ma-core.js','changed');assert.equal(guard().status,1);git('add','.');assert.equal(guard().status,1);
    git('reset','--hard','HEAD');git('mv','gosh/validate/a.json','moved.json');assert.equal(guard().status,1);
    git('reset','--hard','HEAD');write('other/validate/new.json','{}');assert.equal(guard().status,1);
    rmSync(join(dir,'other'),{recursive:true});write('outside.js','');assert.equal(guard('--lane','W0').status,1);
    rmSync(join(dir,'outside.js'));write('hub/shared/addons-host.js','');assert.equal(guard('--lane','W0').status,0);
    assert.equal(guard('--lane','unknown').status,2);
    git('add','.');git('commit','-m','allowed');write('shared/ma-core.js','committed');git('add','.');git('commit','-m','frozen');
    const committed=spawnSync(process.env.PYTHON||'python',[join(root,'scripts/check_frozen_paths.py'),'--repo',dir,'--base','HEAD~1'],{encoding:'utf8',timeout:60000});
    assert.equal(committed.status,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
