(function(g){
'use strict';
const expit=x=>1/(1+Math.exp(-x));
function fit(rows,method='reml',correction='all') {
 if(!['reml','ml','fixed'].includes(method)||!['all','single','none'].includes(correction))throw Error('Invalid method or correction');
 if(!Array.isArray(rows)||rows.length<4||rows.some(r=>!['TP','FN','FP','TN'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)||!Number.isFinite(r.x)))throw Error('At least four complete rows with non-negative integer counts and a finite covariate are required');
 if(rows.some(r=>r.TP+r.FN===0||r.FP+r.TN===0))throw Error('Each study needs diseased and non-diseased participants');
 if(correction==='none'&&rows.some(r=>['TP','FN','FP','TN'].some(k=>r[k]===0)))throw Error('Uncorrected zero cell');
 if(new Set(rows.map(r=>r.x)).size<2)throw Error('Covariate must vary');
 const f=g.AlmDTAPlusBivariate.fit(rows.map(r=>({tp:r.TP,fn:r.FN,fp:r.FP,tn:r.TN})),{method,correctionControl:correction,correction:0.5,X:rows.map(r=>[1,r.x]),covariateNames:['(Intercept)','x']});
 if(f.converged===false||!f.coef.every(Number.isFinite))throw Error('Model did not converge');
 return f;
}
function predict(f,at,prevalence){
 if(!Number.isFinite(at)||!Number.isFinite(prevalence)||prevalence<0||prevalence>1)throw Error('Prediction value must be finite and prevalence between zero and one');
 const L=[[1,at,0,0],[0,0,1,at]];
 const mu=L.map(l=>l.reduce((s,v,i)=>s+v*f.coef[i],0));
 const C=L.map(a=>L.map(b=>a.reduce((s,v,i)=>s+v*b.reduce((t,w,j)=>t+w*f.vcov[i][j],0),0)));
 const regions={};
 for(const kind of ['confidence','prediction']){
  const S=C.map((r,i)=>r.map((v,j)=>v+(kind==='prediction'?f.Psi[i][j]:0)));
  const rho=S[0][1]/Math.sqrt(S[0][0]*S[1][1]);
  if(!Number.isFinite(rho)||Math.abs(rho)>1+1e-12)throw Error('Invalid region covariance');
  regions[kind]=Array.from({length:100},(_,i)=>{const t=2*Math.PI*i/100,a=Math.sqrt(Math.max(0,1+rho))*Math.cos(t),b=Math.sqrt(Math.max(0,1-rho))*Math.sin(t);return [expit(mu[0]+Math.sqrt(5.991464547107979*S[0][0]/2)*(a+b)),expit(mu[1]+Math.sqrt(5.991464547107979*S[1][1]/2)*(a-b))];});
 }
 const sens=expit(mu[0]),fp=expit(mu[1]);
 const positive=prevalence*sens/(prevalence*sens+(1-prevalence)*fp),negative=prevalence*(1-sens)/(prevalence*(1-sens)+(1-prevalence)*(1-fp));
 if(![sens,fp,positive,negative,...mu,...C.flat(),...Object.values(regions).flat(2)].every(Number.isFinite))throw Error('Prediction is numerically undefined at these inputs');
 return {at,prevalence,sens,spec:1-fp,mu,C,regions,positive,negative};
}
g.AlmDTAPlus={fit,predict};
})(globalThis);