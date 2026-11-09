import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('heterogeneity renders the PM refusal and clears stale results',()=>{
  const source=read('hub/shared/tests/unit/p05-input-scale.test.mjs');
  const factory=source.slice(source.indexOf('function appHarness()'),source.indexOf("\ntest('P05-D4 control:"));
  const harness=vm.runInNewContext(factory+'\nappHarness();',{vm,assert,readFileSync,URL,root,html:read('heterogeneity/index.html')});
  assert.ok(harness.run('A,1,1\nB,2,1\nC,3,1').info);
  // Unequal variances avoid REML's equal-variance overflow short circuit, so
  // its candidate search reaches the actual PM non-finite-Q refusal.
  const result=harness.run('A,-1e155,1\nB,1e155,2\nC,0,3');
  assert.match(result.warnings,/Analysis blocked:.*PM.*bracket/);
  assert.equal(result.info,null);assert.equal(result.stats,'');assert.equal(result.invalid,'true');
});
test('transport page displays the actual overflow refusal and clears plot/cache',()=>{
  const html=read('transportability/index.html');
  const source=html.slice(html.indexOf('    function run()'),html.indexOf('    function row('));
  const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'0',innerHTML:'stale'});return elements.get(id);};
  const ctx=vm.createContext({$,parseData:()=>[{est:-1e308,se:1,x:0},{est:1e308,se:1,x:1},{est:0,se:1,x:2}],esc:String});ctx.window=ctx;
  vm.runInContext(read('shared/transportability-v1.js'),ctx);
  vm.runInContext(source+'\nrun();',ctx);
  assert.match($('result').innerHTML,/Transport PM.*bracket/);
  assert.equal($('plot').innerHTML,'');assert.equal(ctx.__lastTransport,null);
});
test('meta-regression displays numerical refusal and clears all result caches',()=>{
  const html=read('meta-regression/index.html');
  const a=html.indexOf('    function render() {'),b=html.indexOf('    function renderAnalysis() {',a);
  assert.ok(b>a,'render must guard the complete analysis');
  const element=()=>({innerHTML:'stale',classList:{add(){}}});
  const ctx=vm.createContext({renderAnalysis(){throw new RangeError('Permutation PM search could not bracket a root');},
    escapeXml:String,warnEl:element(),statsWrap:element(),svgHost:element(),
    _lastFitted:{},_lastStudies:[1],_lastHK:{},_lastSlopeTest:{},_lastR2:1,_lastQE:{},_lastPI:{},_lastPerm:{},_lastLocScale:{}});
  vm.runInContext(html.slice(a,b)+'\nrender();',ctx);
  assert.match(ctx.warnEl.innerHTML,/Permutation PM.*bracket/);
  for(const key of ['_lastFitted','_lastHK','_lastSlopeTest','_lastQE','_lastPI','_lastPerm','_lastLocScale']) assert.equal(ctx[key],null);
  assert.equal(ctx.statsWrap.innerHTML,'');assert.equal(ctx.svgHost.innerHTML,'');
});
