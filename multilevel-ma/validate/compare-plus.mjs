import {readFileSync,writeFileSync} from 'node:fs';
import '../plus-engine.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const corpus=read('corpus/corpus.json'),refs=read(process.env.ALM_REFERENCE || 'plus-corpus/reference-plus.json');
let checks=0,passed=0;const failed=[],maxima={};
function check(id,key,app,ref,tol){
  const d=typeof app==='number'&&typeof ref==='number'&&Number.isFinite(app)&&Number.isFinite(ref)?Math.abs(app-ref)/(key.endsWith('.p')?1:Math.max(1,Math.abs(ref))):Infinity;
  checks++;if(d<=tol)passed++;else failed.push({id,key,app,ref,d,tol});maxima[key]=Math.max(maxima[key]||0,d);
}
for(const [id,r] of Object.entries(refs)){
  if(r.status!=='ok'){failed.push({id,reference:r.reason});continue;}
  const a=AlmMultilevelPlusEngine.fit(corpus[id]);
  for(const key of ['rows','clusters','logLik'])check(id,key,a[key],r[key],key==='logLik'?1e-6:0);
  for(const key of Object.keys(r.robust))check(id,'robust.'+key,a.robust[key],r.robust[key],key==='p'?1e-9:1e-6);
  const closed=AlmMultilevelPlusEngine.cr2(corpus[id],...(r.cr2Sigma2||r.profiles.map(p=>p.estimate)));
  for(const key of Object.keys(r.robust))check(id,'closed.'+key,closed[key],r.robust[key],1e-9);
  for(let j=0;j<2;j++)for(const key of ['estimate','lower','upper','x','ll']){
    if(Array.isArray(r.profiles[j][key]))r.profiles[j][key].forEach((v,i)=>check(id,`profile${j}.${key}.${i}`,a.profiles[j][key][i],v,1e-6));
    else check(id,`profile${j}.${key}`,a.profiles[j][key],r.profiles[j][key],1e-6);
  }
  console.log(id,failed.filter(x=>x.id===id).length?'FAIL':'PASS');
}
const complete=Object.keys(refs).length===44&&checks===2596;
const report={complete,configurations:Object.keys(refs).length,checks,passed,failed,maxima};
writeFileSync(new URL('numerical-plus.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({complete,checks,passed,failed},null,2));
if(failed.length||!complete)process.exitCode=1;
