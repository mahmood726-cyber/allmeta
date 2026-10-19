(function(g){
'use strict';
const expit=x=>1/(1+Math.exp(-x));
function fit(rows,method='reml',correction='all') {
 if(!['reml','ml','fixed'].includes(method)||!['all','single','none'].includes(correction))throw Error('Invalid method or correction');
 if(!Array.isArray(rows)||rows.length<4||rows.some(r=>!['TP','FN','FP','TN'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)||!Number.isFinite(r.x)))throw Error('At least four complete rows with non-negative integer counts and a finite covariate are required');
 if(rows.some(r=>r.TP+r.FN===0||r.FP+r.TN===0))throw Error('Each study needs diseased and non-diseased participants');
 if(correction==='none'&&rows.some(r=>['TP','FN','FP','TN'].some(k=>r[k]===0)))throw Error('Uncorrected zero cell');
 if(new Set(rows.map(r=>r.x)).size<2)throw Error('Covariate must vary');
 // The model is fitted on u=(x-centre)/scale (sample mean and SD) and reported on the supplied x scale.
 // Psi and the likelihood maximum do not depend on this reparametrisation; raw calendar years otherwise
 // give an ill-conditioned design (see validate/README-plus.md, "Raw-scale covariates").
 const centre=rows.reduce((s,r)=>s+r.x,0)/rows.length,scale=Math.sqrt(rows.reduce((s,r)=>s+(r.x-centre)**2,0)/(rows.length-1));
 const f=g.AlmDTAPlusBivariate.fit(rows.map(r=>({tp:r.TP,fn:r.FN,fp:r.FP,tn:r.TN})),{method,correctionControl:correction,correction:0.5,X:rows.map(r=>[1,(r.x-centre)/scale]),covariateNames:['(Intercept)','x']});
 if(f.converged===false||!f.coef.every(Number.isFinite))throw Error('Model did not converge');
 return toSuppliedScale(f,centre,scale);
}
// Coefficient order (Int, x) for logit sensitivity then logit FPR: b_raw = A b_u, V_raw = A V_u A'.
function toSuppliedScale(f,centre,scale){
 const A=[[1,-centre/scale,0,0],[0,1/scale,0,0],[0,0,1,-centre/scale],[0,0,0,1/scale]];
 const mul=(P,Q)=>P.map(r=>Q[0].map((_,j)=>r.reduce((s,v,k)=>s+v*Q[k][j],0)));
 const coef=A.map(r=>r.reduce((s,v,k)=>s+v*f.coef[k],0)),vcov=mul(mul(A,f.vcov),A.map((_,i)=>A.map(r=>r[i])));
 const Z975=1.959963984540054,pU=g.AlmDTAPlusBivariate._internal.pnormUpper;
 const coefTable=f.coefTable.map((t,i)=>{const b=coef[i],se=Math.sqrt(vcov[i][i]),z=b/se;return {...t,estimate:b,se,z,p:2*pU(Math.abs(z)),ci:[b-Z975*se,b+Z975*se]};});
 // REML's log-likelihood contains -log|X'WX|/2, which changes by -2*log(scale) under x=centre+scale*u.
 const logLik=f.logLik==null||f.method!=='reml'?f.logLik:f.logLik-2*Math.log(scale);
 return {...f,coef,vcov,coefTable,logLik,AIC:logLik==null?null:-2*logLik+2*f.df,BIC:logLik==null?null:-2*logLik+Math.log(2*f.k)*f.df,covariateCentre:centre,covariateScale:scale};
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
// |mean|/SD of the covariate. Above RAW_SCALE_LIMIT the UI warns that mada::reitsma on the same raw values can
// differ beyond the validation tolerance (validate/README-plus.md, "Raw-scale covariates"; check-plus-raw.mjs).
const RAW_SCALE_LIMIT=20;
function meanOverSD(rows){const n=rows.length,c=rows.reduce((s,r)=>s+r.x,0)/n;return Math.abs(c)/Math.sqrt(rows.reduce((s,r)=>s+(r.x-c)**2,0)/(n-1));}
g.AlmDTAPlus={fit,predict,meanOverSD,RAW_SCALE_LIMIT};
})(globalThis);