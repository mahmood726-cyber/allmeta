import {readFileSync,writeFileSync} from 'node:fs';
import '../plus-engine.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
// Two pinned corpora: the 44 metadat configurations, and the 21 few-cluster regime
// configurations (two and three clusters, and one double-boundary design metafor's default
// optimiser refuses), which the metadat set does not reach - its minimum is four clusters.
const sets=[
  {corpus:read('corpus/corpus.json'),refs:read(process.env.ALM_REFERENCE||'plus-corpus/reference-plus.json'),count:44},
  {corpus:read('plus-corpus/regime-corpus-plus.json'),refs:read(process.env.ALM_REGIME_REFERENCE||'plus-corpus/regime-reference-plus.json'),count:21}
];
let checks=0,passed=0;const failed=[],maxima={};
function check(id,key,app,ref,tol){
  // null on both sides is a declared unavailable quantity (a profile limit the bounded search
  // did not reach); null on one side only must fail. Same convention as AlmValidate.compare.
  const d=app===null&&ref===null?0:
    typeof app==='number'&&typeof ref==='number'&&Number.isFinite(app)&&Number.isFinite(ref)?Math.abs(app-ref)/(key.endsWith('.p')?1:Math.max(1,Math.abs(ref))):Infinity;
  checks++;if(d<=tol)passed++;else failed.push({id,key,app,ref,d,tol});maxima[key]=Math.max(maxima[key]||0,d);
}
// metafor's confint.rma.mv searches [0, max(10, 100*estimate)] and returns that bound itself as
// the limit when the likelihood-ratio cutoff is not crossed inside it, flagged only by ub.sign.
// No reference limit may therefore sit at that bound: generate-plus.R widens the bound until the
// limit is interior, so a limit equal to it means the guard was bypassed or removed.
const bounds={limits:0,interior:0,atDefaultBound:[]};
// The engine must not sit at a worse restricted-likelihood optimum than R. The slack is 1e-12
// relative to max(1,|R|), the same scale convention as the numerical tolerances: the rounding
// noise of a sum over a hundred rows is relative, and the largest observed shortfall is 2.6e-12
// on a log-likelihood of 442.66, i.e. 5.8e-15 relative. Real differences here are 1e-9 and up.
const likelihood={configurations:0,engineLower:[]};
const notLower=(engine,r)=>engine+1e-12*Math.max(1,Math.abs(r))>=r;
function auditBound(id,j,r){
  const upper=r.profiles[j].upper,bound=Math.max(10,100*r.profiles[j].estimate);
  bounds.limits++;
  if(typeof upper==='number'&&Math.abs(upper-bound)<=1e-8*Math.max(1,bound))bounds.atDefaultBound.push({id,component:j,upper,bound});
  else bounds.interior++;
}
let configurations=0;
for(const set of sets){
  if(Object.keys(set.refs).length!==set.count)failed.push({reference:'expected '+set.count+' configurations, found '+Object.keys(set.refs).length});
  for(const [id,r] of Object.entries(set.refs)){
    configurations++;
    if(r.status!=='ok'){failed.push({id,reference:r.reason});continue;}
    const a=AlmMultilevelPlusEngine.fit(set.corpus[id]);
    for(const key of ['rows','clusters','logLik'])check(id,key,a[key],r[key],key==='logLik'?1e-6:0);
    likelihood.configurations++;
    if(!notLower(a.logLik,r.logLik))likelihood.engineLower.push({id,engine:a.logLik,r:r.logLik});
    for(const key of Object.keys(r.robust))check(id,'robust.'+key,a.robust[key],r.robust[key],key==='p'?1e-9:1e-6);
    const closed=AlmMultilevelPlusEngine.cr2(set.corpus[id],...(r.cr2Sigma2||r.profiles.map(p=>p.estimate)));
    for(const key of Object.keys(r.robust))check(id,'closed.'+key,closed[key],r.robust[key],1e-9);
    for(let j=0;j<2;j++){
      auditBound(id,j,r);
      for(const key of ['estimate','lower','upper','x','ll']){
        if(Array.isArray(r.profiles[j][key]))r.profiles[j][key].forEach((v,i)=>check(id,`profile${j}.${key}.${i}`,a.profiles[j][key][i],v,1e-6));
        else check(id,`profile${j}.${key}`,a.profiles[j][key],r.profiles[j][key],1e-6);
      }
    }
    console.log(id,failed.filter(x=>x.id===id).length?'FAIL':'PASS');
  }
}
const complete=configurations===65&&checks===3835&&bounds.limits===130&&bounds.atDefaultBound.length===0&&likelihood.engineLower.length===0;
const report={complete,configurations,checks,passed,failed,bounds,likelihood,maxima};
writeFileSync(new URL('numerical-plus.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('PINNED PROFILE LIMITS INTERIOR '+bounds.interior+'/'+bounds.limits);
console.log('RESTRICTED LOG-LIKELIHOOD NOT BELOW R '+(likelihood.configurations-likelihood.engineLower.length)+'/'+likelihood.configurations);
console.log(JSON.stringify({complete,configurations,checks,passed,failed,bounds,likelihood},null,2));
if(failed.length||!complete)process.exitCode=1;
