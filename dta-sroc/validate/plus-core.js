(function(g){'use strict';
function replay(c,visit=()=>{}){let checks=0;const failures=[];
function check(id,a,b,tol=0,absolute=false){checks++;const ok=typeof b==='number'?Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol*(absolute?1:Math.max(1,Math.abs(b))):a===b;if(!ok)failures.push({id,app:a,ref:b,tol});}
function arr(id,a,b,tol,abs=false){if(Array.isArray(b)){check(id+'/length',a?.length,b.length);b.forEach((v,i)=>arr(id+'/'+i,a?.[i],v,tol,abs));}else check(id,a,b,tol,abs);}
for(const r of c.cases){let f,error;try{f=g.AlmDTAPlus.fit(r.rows,r.method,r.correction);}catch(e){error=e.message;}check(r.id+'/ok',!!f,r.ok);if(!r.ok){check(r.id+'/refusal',error,r.refusal);visit(r,null,null,check);continue;}if(!f)continue;const t=r.method==='fixed'?1e-9:1e-6;
for(const k of ['coef','vcov','Psi'])arr(r.id+'/'+k,f[k],r[k],t);
for(const k of ['p','z','se','lo','hi'])arr(r.id+'/'+k,f.coefTable.map(v=>k==='lo'?v.ci[0]:k==='hi'?v.ci[1]:v[k]),r[k],t,k==='p');
for(const q of r.predictions)for(const p of q.post){const a=g.AlmDTAPlus.predict(f,q.at,p.prevalence);for(const k of ['sens','spec','mu','C'])arr(r.id+'/'+q.at+'/'+k,a[k],q[k],t);for(const k of ['positive','negative'])check(r.id+'/'+q.at+'/'+p.prevalence+'/'+k,a[k],p[k],t);for(const k of ['confidence','prediction'])arr(r.id+'/'+q.at+'/'+k,a.regions[k],q.regions[k],t);visit(r,q,p,check);}}
return {configurations:c.cases.length,candidates:c.inventory.length,checks,passed:checks-failures.length,failures};}
g.AlmDTAPlusCore={replay};})(globalThis);
