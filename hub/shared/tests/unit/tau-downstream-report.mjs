// Execute baseline/current shared APIs on explicit R-backed stress inputs.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const reference=JSON.parse(read('hub/shared/tests/unit/tau-bracketing-reference.json'));
function load(baseline){
  const c=vm.createContext({Math,Number});c.window=c;
  for(const f of ['ma-core','permutest','multiplicative-nma','nma-meta-regression','transportability-v1','stats-qt']){
    const p=`shared/${f}.js`;
    vm.runInContext(baseline?execFileSync('git',['show',`a3f20c28096cb41c1f333bdd187ac00d92e5ef31:${p}`],{encoding:'utf8'}):read(p),c);
  }
  return c;
}
const before=load(true),after=load(false),results={};
const attempt=fn=>{try{return fn();}catch(e){return {error:e.message};}};
function record(name,fn){results[name]={before:attempt(()=>fn(before)),after:attempt(()=>fn(after))};}
for(const [id,d] of Object.entries(reference.cases))for(const method of ['PM','EB','REML','ML','DL'])for(const knha of [false,true])
  record(`core.${id}.${method}.${knha?'modifiedHK':'normal'}`,c=>{
    const p=c.AlmMaCore.pool(d.yi,d.vi,{method,knha,knhaFloor:true});
    return {...p,pi:c.AlmMaCore.predictionInterval({...p,df:d.yi.length-1})};
  });
const reg=reference.regression,intercept=reference.intercept,perm=reference.permutation;
record('transportability.regression',c=>c.AlmTransport.transport({studies:reg.yi.map((est,i)=>({est,se:Math.sqrt(reg.vi[i]),x:reg.xi[i]})),target:2}));
record('meta-regression.permutation',c=>c.AlmPermTest.permTestSlope(perm.yi,perm.vi,perm.xi,{exactMax:5}));
record('multiplicative-nma.intercept',c=>c.AlmMultiplicativeNMA.fit(intercept.yi.map((yi,i)=>({yi,sei:Math.sqrt(intercept.vi[i]),trtA:'A',trtB:'B'})),['A','B']));
record('nma-meta-reg.regression',c=>c.AlmNmaMetaReg.fit(reg.yi.map((yi,i)=>({yi,sei:Math.sqrt(reg.vi[i]),trtA:'A',trtB:'B',covariate:reg.xi[i]})),['A','B']));
for(const api of ['AlmMaCore','AlmStats']) record(`quantiles.${api}`,c=>({t:c[api][api==='AlmStats'?'qt':'_qt'](.975,.01)}));
writeFileSync('tau-audit/downstream-before-after.json',JSON.stringify(results,null,2)+'\n');
console.log('Recorded',Object.keys(results).length,'before/after API configurations.');
