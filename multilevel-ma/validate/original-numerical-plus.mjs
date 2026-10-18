// Supplementary numerical regression; this is NOT the 528-check browser replay.
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const context=vm.createContext({console});context.window=context;
vm.runInContext(read('../../shared/stats-qt.js'),context);
vm.runInContext(read('../../shared/ma-core.js'),context);
vm.runInContext(read('../../shared/multilevel-reml.js'),context);
const html=read('../index.html'),start=html.indexOf('    function fit(rows) {'),end=html.indexOf('    // ---- axis state',start);
const originalFit=html.slice(start,end);vm.runInContext(originalFit,context);
const corpus=JSON.parse(read('corpus/corpus.json')),refs=JSON.parse(read('corpus/reference.json'));
let checks=0,passed=0;const failed=[],results={};
function check(id,key,a,r,tol){checks++;const diff=Math.abs(a-r)/Math.max(1,Math.abs(r));if(Number.isFinite(diff)&&diff<=tol)passed++;else failed.push({id,key,a,r,diff,tol});}
for(const [id,rows] of Object.entries(corpus)){
  const r=context.AlmMultilevelREML.fit(rows),m=context.fit(rows.map(x=>({study:'cluster_'+x.cluster,te:x.y,se:Math.sqrt(x.v)})));
  for(const key of ['mu','se','ciLo','ciHi','sigma2Between','sigma2Within','logLik'])check(id,key,r[key],refs[id].values[key],1e-6);
  const w=rows.map(x=>1/x.v),sw=w.reduce((a,b)=>a+b,0),typ=(rows.length-1)/(sw-w.reduce((a,b)=>a+b*b,0)/sw),den=m.tau2_study+m.tau2_within+typ;
  for(const [key,n] of [['I2_study',m.tau2_study],['I2_within',m.tau2_within],['I2_sampling',typ]])check(id,key,m[key],n/den,1e-9);
  results[id]={r,m};
}
const report={scope:'440 numerical checks only; excludes 88 browser rendering/count checks',checks,passed,failed,originalFitSHA256:createHash('sha256').update(originalFit).digest('hex'),results};
writeFileSync(new URL((process.env.REPLAY_STAGE||'before')+'-numerical-original-plus.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks,passed,failed,originalFitSHA256:report.originalFitSHA256}));if(failed.length)process.exitCode=1;
