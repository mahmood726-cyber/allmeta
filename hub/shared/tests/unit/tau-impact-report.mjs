// Read-only numerical comparison; writes audit artifacts only when requested.
// Run from root: node hub/shared/tests/unit/tau-impact-report.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const old=p=>execFileSync('git',['show',`a3f20c28096cb41c1f333bdd187ac00d92e5ef31:${p}`],{encoding:'utf8',maxBuffer:32*1024*1024});
function engine(reader){
  const ctx=vm.createContext({document:{getElementById:()=>({})}});ctx.window=ctx;
  for(const p of ['shared/ma-core.js','shared/heterogeneity-ci.js']) vm.runInContext(reader(p),ctx);
  const html=read('heterogeneity/index.html');
  const s=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function computeAll('));
  vm.runInContext(s.slice(0,s.indexOf('    function renderStats(studies, chosen) {'))+'\n})();',ctx);
  return ctx;
}
const before=engine(old),after=engine(read);
const changes=[];
function diff(a,b,path){
  if(typeof a==='number' && typeof b==='number') {
    if(!Object.is(a,b)) changes.push({field:path,before:a,after:b});
  } else if(a && b && typeof a==='object') for(const k of Object.keys(a)) diff(a[k],b[k],`${path}.${k}`);
}
const refs=JSON.parse(read('hub/shared/tests/r/p05-heterogeneity-reference.json'));
for(const d of refs.cases){
  const text=d.yi.map((y,i)=>`Study ${i+1},${y},${d.se[i]}`).join('\n');
  for(const m of d.methods) diff(before.__almHetCompute(text,m),after.__almHetCompute(text,m),`P05.${d.id}.${m}`);
}
const caseChanges=changes.length;
const corpus=JSON.parse(read('heterogeneity/validate/corpus/corpus.json'));
for(const d of corpus) for(const m of ['pm','eb','reml','ml','sj','he','hs','dl'])
  diff(before.__almHetCompute(d.text,m),after.__almHetCompute(d.text,m),`corpus.${d.id}.${m}`);
const stress=JSON.parse(read('hub/shared/tests/unit/tau-bracketing-reference.json'));
const reproduction=[];
for(const [name,d] of Object.entries(stress.cases)){
  for(const method of ['PM','EB','REML','DL']){
    const fn='tau2'+(method==='EB'?'PM':method);
    reproduction.push({dataset:name,method,before:before.AlmMaCore[fn](d.yi,d.vi),after:after.AlmMaCore[fn](d.yi,d.vi),R:d.fits[method].tau2});
  }
  const rows=d.yi.map((est,i)=>({est,v:d.vi[i]}));
  for(const key of ['tau2Lo','tau2Hi']) reproduction.push({dataset:name,method:`QP.${key}`,before:before.AlmHetCI.qProfileCI(rows)[key],after:after.AlmHetCI.qProfileCI(rows)[key],R:d[key]});
}
writeFileSync('tau-audit/reproduction.json',JSON.stringify(reproduction,null,2)+'\n');
writeFileSync('tau-audit/p05-number-changes.json',JSON.stringify(changes,null,2)+'\n');
console.log(JSON.stringify({p05ChangedLeaves:caseChanges,corpusChangedLeaves:changes.length-caseChanges,corpusDatasets:corpus.length}));
console.table(reproduction);
