import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Core from '../../../../shared/ma-core.js';
import CI from '../../../../shared/heterogeneity-ci.js';
import Perm from '../../../../shared/permutest.js';
import Mult from '../../../../shared/multiplicative-nma.js';
import NMR from '../../../../shared/nma-meta-regression.js';
import Transport from '../../../../shared/transportability-v1.js';
const ref=JSON.parse(readFileSync(new URL('tau-bracketing-reference.json',import.meta.url)));
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)/Math.max(1,Math.abs(b))<1e-9, `${a} vs R ${b}`);
for(const [name,d] of Object.entries(ref.cases)) test(`unbounded PM/EB and Q-profile: ${name}`,()=>{
  assert.equal(ref.provenance.metafor,'5.2.1');
  assert.equal(ref.provenance.script_md5,createHash('md5').update(readFileSync(new URL('tau-bracketing-reference.R',import.meta.url))).digest('hex'));
  if(name==='above_2_40') assert.ok(d.fits.PM.tau2>2**40);
  for(const m of ['PM','EB','REML','DL']) near(Core['tau2'+(m==='EB'?'PM':m)](d.yi,d.vi),d.fits[m].tau2);
  const ci=CI.qProfileCI(d.yi.map((est,i)=>({est,v:d.vi[i]})));
  near(ci.tau2Lo,d.tau2Lo); near(ci.tau2Hi,d.tau2Hi);
});
test('finite roots beyond 200 doublings are resolved',()=>{
  const d=ref.beyond_200;
  near(Core.tau2PM(d.yi,d.vi),d.tau2);
  const ci=CI.qProfileCI(d.yi.map((est,i)=>({est,v:d.vi[i]})));
  near(ci.tau2Lo,d.tau2Lo);near(ci.tau2Hi,d.tau2Hi);
});
test('permutation slope PM matches R above old ceiling',()=>{
  const d=ref.permutation;near(Perm._slopeT(d.yi,d.vi,d.xi),d.t[1]);
  near(Perm.permTestSlope(d.yi,d.vi,d.xi,{exactMax:5}).p,ref.permutationP);
});
for(const [name,engine] of [['multiplicative NMA',Mult],['network regression',NMR]]) {
  test(`${name}: PM root beyond iteration cap matches R`,()=>{
    const d=ref.intercept;near(engine._tau2_PM(d.yi.map(()=>[1e10]),d.yi,d.vi),d.tau2);
  });
  test(`${name}: nonfinite Q refuses explicitly`,()=>{
    assert.throws(()=>engine._tau2_PM([[1],[1]],[-1e308,1e308],[1,1]),{name:'RangeError'});
  });
}
test('transport PM beyond 60 doublings matches R',()=>{
  const d=ref.regression;near(Transport._tau2PM(d.yi,d.xi,d.vi),d.tau2);
});
test('nonfinite PM, permutation, transport and Q-profile refuse explicitly',()=>{
  for(const run of [()=>Core.tau2PM([-1e308,1e308],[1,1]),
    ()=>Perm._slopeT([-1e308,1e308,0],[1,1,1],[0,1,2]),
    ()=>Transport._tau2PM([-1e308,1e308,0],[0,1,2],[1,1,1]),
    ()=>CI.qProfileCI([{est:-1e308,v:1},{est:1e308,v:1}])]) assert.throws(run,{name:'RangeError'});
});

// Both quantile solvers also had ceiling/iteration-limited upper brackets.
import Stats from '../../../../shared/stats-qt.js';
import vm from 'node:vm';
for(const solver of ['core','stats']) test(`Student t ${solver} bracket beyond fixed ceilings matches R`,()=>{
  const d=ref.quantiles;
  const ctx=vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../../../shared/ma-core.js',import.meta.url),'utf8'),ctx);
  near(solver==='core'?ctx.AlmMaCore._qt(d.p,d.df):Stats.qt(d.p,d.df),d.t);
});
test('NMA extreme-unit matrix normalization preserves R root and covariance',()=>{
  const d=ref.intercept,X=d.yi.map(()=>[1]);
  for(const [engine,fit] of [[Mult,'_fitWLS'],[NMR,'_fitGLS']]){
    const t=engine._tau2_PM(X,d.yi,d.vi);near(t,d.tau2);
    const f=engine[fit](X,d.yi,d.vi,t);near(f.beta[0],d.beta);near(Math.sqrt(f.cov[0][0]),d.se);
  }
});
test('chi-square inversion refuses nonfinite or invalid brackets',()=>{
  for(const [p,df] of [[NaN,1],[.975,Infinity],[1,1]]) assert.throws(()=>CI.chiSqQuantile(p,df),{name:'RangeError'});
});
