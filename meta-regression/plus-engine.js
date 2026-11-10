/* Independent ML extension. The original single-moderator engine is untouched. */
(function (root) {
  'use strict';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const sum = xs => { let s=0,c=0; for(const x of xs){const t=s+x;c+=Math.abs(s)>=Math.abs(x)?(s-t)+x:(x-t)+s;s=t;}return s+c; };
  const dot = (a,b) => sum(a.map((x,i)=>x*b[i]));
  function logGamma(z) {
    const a=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z--;let x=.99999999999980993;for(let i=0;i<a.length;i++)x+=a[i]/(z+i+1);
    const t=z+7.5;return .9189385332046727+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function gammaQ(a,x) {
    if(x<=0)return 1;if(!finite(x))return 0;
    const e=Math.exp(-x+a*Math.log(x)-logGamma(a));
    if(x<a+1){let d=1/a,s=d;for(let i=1;i<10000;i++){d*=x/(a+i);s+=d;if(Math.abs(d)<Math.abs(s)*2e-16)break;}return Math.max(0,1-s*e);}
    let b=x+1-a,c=1e300,d=1/b,h=d;
    for(let i=1;i<10000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const q=d*c;h*=q;if(Math.abs(q-1)<3e-16)break;}
    return Math.max(0,Math.min(1,e*h));
  }
  function prepare(X) {
    const p=X[0].length, k=X.length, means=Array(p).fill(0),scales=Array(p).fill(1);
    for(let j=1;j<p;j++){means[j]=sum(X.map(r=>r[j]))/k;scales[j]=Math.max(...X.map(r=>Math.abs(r[j]-means[j])));if(!(scales[j]>0))throw Error('Moderator design is rank deficient');}
    const Z=X.map(r=>r.map((x,j)=>j?(x-means[j])/scales[j]:1));
    const T=Array.from({length:p},()=>Array(p).fill(0));T[0][0]=1;
    for(let j=1;j<p;j++){T[j][j]=1/scales[j];T[0][j]=-means[j]/scales[j];}
    return {Z,T};
  }
  function wls(y,Z,w) {
    const p=Z[0].length, sw=sum(w),sqrtw=w.map(x=>Math.sqrt(x/sw)),Q=[],R=Array.from({length:p},()=>Array(p).fill(0));
    for(let j=0;j<p;j++){
      let q=Z.map((r,i)=>r[j]*sqrtw[i]);
      for(let pass=0;pass<2;pass++)for(let l=0;l<j;l++){const t=dot(Q[l],q);R[l][j]+=t;q=q.map((v,i)=>v-t*Q[l][i]);}
      R[j][j]=Math.sqrt(dot(q,q));if(R[j][j]<1e-10)throw Error('Moderator design is rank deficient');
      Q.push(q.map(v=>v/R[j][j]));
    }
    const solve=rhs=>{const b=Array(p).fill(0);for(let j=p-1;j>=0;j--)b[j]=(rhs[j]-dot(R[j],b))/R[j][j];return b;};
    const offset=sum(y)/y.length, b=solve(Q.map(q=>dot(q,y.map((v,i)=>(v-offset)*sqrtw[i]))));b[0]+=offset;
    const invCols=Array.from({length:p},(_,j)=>solve(Array.from({length:p},(_,l)=>+(j===l))));
    const inv=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>sum(invCols.map(c=>c[i]*c[j]))));
    const residual=y.map((v,i)=>v-dot(Z[i],b));
    return {b,vcov:inv.map(r=>r.map(x=>x/sw)),residual,rss:sum(residual.map((r,i)=>w[i]*r*r))};
  }
  function fit(y,v,X) {
    const k=y.length,p=X[0].length,{Z,T}=prepare(X);
    const unweighted=wls(y,Z,Array(k).fill(1));
    // metafor's raw model-matrix positive-definiteness gate (evtol=1e-7).
    const A=Array.from({length:p},(_,j)=>Array.from({length:p},(_,l)=>sum(X.map(r=>r[j]*r[l]))));
    for(let it=0;it<100*p*p;it++){
      let i=0,j=1;for(let a=0;a<p;a++)for(let b=a+1;b<p;b++)if(Math.abs(A[a][b])>Math.abs(A[i][j])){i=a;j=b;}
      if(Math.abs(A[i][j])<1e-14)break;
      const t=(A[j][j]-A[i][i])/(2*A[i][j]),u=(t>=0?1:-1)/(Math.abs(t)+Math.sqrt(1+t*t)),co=1/Math.sqrt(1+u*u),si=u*co;
      const ai=A[i][i],aj=A[j][j],aij=A[i][j];A[i][i]=ai-u*aij;A[j][j]=aj+u*aij;A[i][j]=A[j][i]=0;
      for(let l=0;l<p;l++)if(l!==i&&l!==j){const x=A[l][i],z=A[l][j];A[l][i]=A[i][l]=co*x-si*z;A[l][j]=A[j][l]=si*x+co*z;}
    }
    if(A.some((r,i)=>r[i]<=1e-7))throw Error('Model matrix not of full rank. Cannot fit model.');
    const trPV=sum(v.map((vi,i)=>vi*(1-dot(Z[i],unweighted.vcov.map(r=>dot(r,Z[i]))))));
    // Harmonic sampling variance limits imprecise rows; outcome variance keeps
    // the tolerance commensurate with the fitted spread, above rounding noise.
    const meanY=sum(y)/k,threshold=1e-12*Math.max(k/sum(v.map(vi=>1/vi)),sum(y.map(v=>(v-meanY)**2))/(k-1));
    let tau2=Math.max(0,(unweighted.rss-trPV)/(k-p)),converged=false;
    for(let iter=0;iter<=10000;iter++){
      const w=v.map(vi=>1/(vi+tau2)),f=wls(y,Z,w);
      let adj=.5*(sum(f.residual.map((r,i)=>(r*w[i])**2))-sum(w))/sum(w.map(wi=>wi*wi));
      while(tau2+adj<0)adj/=2;
      const old=tau2;tau2+=adj;
      if(Math.abs(tau2-old)<=threshold){converged=true;break;}
    }
    if(!converged)throw Error("Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies.");
    const at=t=>{const f=wls(y,Z,v.map(vi=>1/(vi+t)));return {...f,ll:-.5*(k*Math.log(2*Math.PI)+sum(v.map(vi=>Math.log(vi+t)))+f.rss)};};
    let f=at(tau2);const zero=at(0);if(zero.ll-f.ll>Math.pow(2,-13)&&tau2>threshold){tau2=0;f=zero;}
    const beta=T.map(r=>dot(r,f.b));
    const vcov=T.map(r=>T.map(s=>dot(r,f.vcov.map(t=>dot(t,s)))));
    const se=vcov.map((r,i)=>Math.sqrt(r[i])),z=beta.map((b,i)=>b/se[i]);
    return {values:{k,p,tau2,beta,se,z,pval:z.map(z=>gammaQ(.5,z*z/2)),ciLo:beta.map((b,i)=>b-1.959963984540054*se[i]),ciHi:beta.map((b,i)=>b+1.959963984540054*se[i]),logLik:f.ll,AIC:-2*f.ll+2*(p+1),BIC:-2*f.ll+(p+1)*Math.log(k)},vcov};
  }
  function validate(c) {
    if(!c||!Array.isArray(c.yi)||!Array.isArray(c.vi)||!Array.isArray(c.mods)||!Array.isArray(c.names)||c.names.length<2||c.names.length>3||typeof c.interaction!=='boolean')throw Error('Enter two or three numeric moderators');
    if(new Set(c.names).size!==c.names.length||c.names.some(n=>typeof n!=='string'||!/^\w[\w. -]*$/.test(n)))throw Error('Moderator names must be distinct plain text');
    const k=c.yi.length;
    if(!k||c.vi.length!==k||c.mods.length!==k||!c.yi.every(finite)||!c.vi.every(v=>finite(v)&&v>0)||c.mods.some(r=>!Array.isArray(r)||r.length!==c.names.length||!r.every(finite)))throw Error('Invalid input rows');
  }
  function compute(c) {
    try {
      validate(c);const y=c.yi,v=c.vi,z=c.mods,k=y.length;
      const terms=['intercept',...c.names];if(c.interaction)terms.push(c.names.slice(0,2).join(':'));
      const X=z.map(r=>[1,...r,...(c.interaction?[r[0]*r[1]]:[])]);
      if(k<=X[0].length)return {status:'refused',reason:'Need more studies than coefficients'};
      const full=fit(y,v,X),reducedX=X.map(r=>c.interaction?r.slice(0,-1):r.slice(0,2)),reduced=fit(y,v,reducedX);
      const likelihoodGain=full.values.logLik-reduced.values.logLik;
      const likelihoodRoundoff=64*Number.EPSILON*Math.max(1,Math.abs(full.values.logLik),Math.abs(reduced.values.logLik));
      // A nested full model cannot have a lower optimum; only clamp floating-point roundoff.
      if(likelihoodGain < -likelihoodRoundoff)throw Error('Full-model likelihood is lower than reduced-model likelihood; ML optimization did not converge.');
      const df=full.values.p-reduced.values.p,LRT=Math.max(0,2*likelihoodGain);
      const means=c.names.map((_,j)=>sum(z.map(r=>r[j]))/k),lo=Math.min(...z.map(r=>r[0])),hi=Math.max(...z.map(r=>r[0]));
      const x=Array.from({length:41},(_,i)=>lo+(hi-lo)*i/40),pred=[],se=[];
      for(const xi of x){const r=[1,xi,...means.slice(1),...(c.interaction?[xi*means[1]]:[])];pred.push(dot(r,full.values.beta));se.push(Math.sqrt(Math.max(0,dot(r,full.vcov.map(s=>dot(s,r))))));}
      const w=v.map(vi=>1/(vi+full.values.tau2)),sw=sum(w);
      return {status:'ok',terms,reducedTerms:terms.slice(0,reducedX[0].length),full:full.values,reduced:reduced.values,comparison:{LRT,df,pval:gammaQ(df/2,LRT/2)},plot:{x,pred,se,ciLo:pred.map((v,i)=>v-1.959963984540054*se[i]),ciHi:pred.map((v,i)=>v+1.959963984540054*se[i]),weights:w.map(w=>100*w/sw),held:means.slice(1)}};
    }catch(e){return {status:'refused',reason:e.message};}
  }
  root.AlmMetaPlus=Object.freeze({compute,validate});
})(typeof window==='undefined'?globalThis:window);
