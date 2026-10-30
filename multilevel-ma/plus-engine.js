/* Intercept-only nested random-intercept REML, diagonal sampling V.
 * This module is separate from the paper's original estimator.
 * CR2 uses the fitted marginal covariance as its working target.
 */
(function(root){
  'use strict';
  const sum=a=>a.reduce((s,x)=>s+x,0), finite=Number.isFinite;
  function groups(rows){
    if(!Array.isArray(rows)||rows.length<3)throw Error('Need at least three valid effect rows');
    const m=new Map();
    for(const r of rows){
      if(!finite(r.y)||!finite(r.v)||r.v<=0||r.cluster==null)throw Error('Need finite effects, positive variances and cluster labels');
      const key=String(r.cluster);if(!m.has(key))m.set(key,[]);m.get(key).push(r);
    }
    if(m.size<2)throw Error('Need at least two clusters');
    if(m.size===rows.length)throw Error('Variance components are not identifiable without repeated effects');
    return [...m.values()];
  }
  function evaluate(g,b,w){
    const blocks=g.map(a=>{
      const d=a.map(r=>1/(r.v+w)),s=sum(d),den=1+b*s;
      return {a,d,s,den,i:s/den,y:sum(a.map((r,j)=>r.y*d[j]))/den};
    });
    const info=sum(blocks.map(x=>x.i)),mu=sum(blocks.map(x=>x.y))/info;
    let value=Math.log(info),gb=0,gw=0;
    for(const x of blocks){
      const {a,d,s,den}=x,rr=a.map(r=>r.y-mu),rd=sum(rr.map((r,j)=>r*d[j]));
      const wr=rr.map((r,j)=>d[j]*(r-b*rd/den)),d2=sum(d.map(v=>v*v));
      value+=-sum(d.map(Math.log))+Math.log(den)+sum(rr.map((r,j)=>r*wr[j]));
      gb+=x.i-x.i*x.i/info-(rd/den)**2;
      gw+=s-b*d2/den-d2/(den*den*info)-sum(wr.map(r=>r*r));
      x.score=rd/den;
    }
    const n=sum(g.map(a=>a.length));
    return {value:value/2,gradient:[gb/2,gw/2],mu,info,blocks,logLik:-value/2-(n-1)/2*Math.log(2*Math.PI)+Math.log(n)/2};
  }
  // Scan a logarithmic grid, then solve every negative-to-positive score crossing.
  // Explicitly include the zero boundary and select the best objective.
  function scalar(fn,scale){
    let best={...fn(0),x:0},prev=best;
    for(let j=-30;j<=24;j++){
      let x=scale*2**j,cur={...fn(x),x};
      if(cur.value<best.value)best=cur;
      if(prev.derivative<0&&cur.derivative>=0){
        let lo=prev.x,hi=x;
        for(let it=0;it<70;it++){
          const mid=(lo+hi)/2,r=fn(mid);
          if(r.derivative>0)hi=mid;else lo=mid;
          if(hi-lo<1e-13*Math.max(scale,mid))break;
        }
        const xx=(lo+hi)/2,r={...fn(xx),x:xx};if(r.value<best.value)best=r;
      }
      prev=cur;
      if(j>6&&cur.derivative>0&&cur.value>best.value+30)break;
    }
    return best;
  }
  function fitted(g){
    const rows=g.flat(),mean=sum(rows.map(r=>r.y))/rows.length;
    const scale=Math.max(sum(rows.map(r=>(r.y-mean)**2))/rows.length,sum(rows.map(r=>r.v))/rows.length,1e-12);
    // Profile over the within component, optimising between at each evaluation.
    // No result from the original app or R corpus is used as an estimate.
    const between=w=>scalar(b=>{const r=evaluate(g,b,w);return {...r,derivative:r.gradient[0]};},scale);
    const opt=scalar(w=>{const r=between(w);return {...r,between:r.x,derivative:r.gradient[1]};},scale);
    return {b:opt.between,w:opt.x,scale,...evaluate(g,opt.between,opt.x)};
  }
  // Lanczos log-gamma and a converged continued fraction for Student's t tails.
  function logGamma(z){
    const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z--;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
    const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function betaFraction(a,b,x){
    const tiny=1e-300;let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
    for(let m=1;m<=10000;m++){
      for(const aa of [m*(b-m)*x/((a+2*m-1)*(a+2*m)),-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1))]){
        d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;
        if(aa<0&&Math.abs(delta-1)<2e-15)return h;
      }
    }
    throw Error('Student t probability did not converge');
  }
  function ibeta(a,b,x){
    if(x<=0)return 0;if(x>=1)return 1;
    const k=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
    return x<(a+1)/(a+b+2)?k*betaFraction(a,b,x)/a:1-k*betaFraction(b,a,1-x)/b;
  }
  function pvalue(t,df){return ibeta(df/2,.5,df/(df+t*t));}
  function critical(df){let lo=0,hi=2;while(pvalue(hi,df)>.05){hi*=2;if(!finite(hi))throw Error('Student t interval unavailable');}for(let i=0;i<90;i++){const m=(lo+hi)/2;if(pvalue(m,df)>.05)lo=m;else hi=m;}return (lo+hi)/2;}
  const matrix=(n,fn)=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>fn(i,j)));
  const dot=(a,b)=>sum(a.map((x,i)=>x*b[i]));
  function inverseRootAction(input,z){
    const n=z.length,A=input.map(r=>r.slice()),V=matrix(n,(i,j)=>+(i===j));
    const scale=Math.max(...A.map((r,i)=>Math.abs(r[i])));
    for(let sweep=0;sweep<100;sweep++){
      let off=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)off+=A[i][j]**2;
      if(off<scale*scale*1e-29)break;
      if(sweep===99)throw Error('CR2 eigendecomposition did not converge');
      for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){
        const apq=A[p][q];if(Math.abs(apq)<scale*1e-16)continue;
        const theta=(A[q][q]-A[p][p])/(2*apq),t=(theta>=0?1:-1)/(Math.abs(theta)+Math.hypot(theta,1)),c=1/Math.hypot(t,1),s=t*c;
        const pp=A[p][p],qq=A[q][q];A[p][p]=pp-t*apq;A[q][q]=qq+t*apq;A[p][q]=A[q][p]=0;
        for(let k=0;k<n;k++){
          if(k!==p&&k!==q){const a=A[k][p],b=A[k][q];A[k][p]=A[p][k]=c*a-s*b;A[k][q]=A[q][k]=s*a+c*b;}
          const a=V[k][p],b=V[k][q];V[k][p]=c*a-s*b;V[k][q]=s*a+c*b;
        }
      }
    }
    const coefficients=Array.from({length:n},(_,j)=>{
      if(A[j][j]<=scale*1e-14)throw Error('CR2 unavailable: singular adjustment');
      return sum(z.map((x,i)=>x*V[i][j]))/Math.sqrt(A[j][j]);
    });
    return V.map(row=>dot(row,coefficients));
  }
  function adjusted(x,b,w,info){
    const n=x.a.length,V=matrix(n,(i,j)=>b+(i===j?x.a[i].v+w:0)),L=matrix(n,()=>0);
    for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
      let v=V[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(v):v/L[j][j];
    }
    const C=matrix(n,(i,j)=>L[j][i]),rowS=C.map(sum);
    const CV=matrix(n,(i,j)=>dot(C[i],V[j]));
    const G=matrix(n,(i,j)=>dot(CV[i],C[j])-rowS[i]*rowS[j]/info);
    const cw=C.map(row=>sum(row.map((v,i)=>v*x.d[i]/x.den)));
    const z=inverseRootAction(G,cw),v=L.map(row=>dot(row,z));
    return {score:dot(v,x.a.map(r=>r.y)),total:sum(v),q:dot(v,V.map(row=>dot(row,v)))};
  }
  function cr2(g,b,w){
    const fit=evaluate(g,b,w);
    if(fit.blocks.some(x=>1-x.i/fit.info<1e-12))throw Error('CR2 unavailable: unit cluster leverage');
    const a=fit.blocks.map(x=>adjusted(x,b,w,fit.info));
    const se=Math.sqrt(sum(a.map(x=>(x.score-fit.mu*x.total)**2)))/fit.info;
    if(!(se>0))throw Error('CR2 unavailable: zero residual variance');
    const diagonal=a.map(x=>x.q-x.total*x.total/fit.info);
    let den=sum(diagonal.map(x=>x*x));
    for(let i=0;i<a.length;i++)for(let j=0;j<i;j++)den+=2*(a[i].total*a[j].total/fit.info)**2;
    const df=sum(diagonal)**2/den,t=fit.mu/se,q=critical(df);
    return {estimate:fit.mu,se,df,t,p:pvalue(t,df),lower:fit.mu-q*se,upper:fit.mu+q*se};
  }
  // Bracketing an upper profile limit starts at max(2*estimate, scale) and doubles. The search
  // is bounded two ways: at most SEARCH_DOUBLINGS doublings (about 2.3e18 times the start) and
  // at most options.searchBound, the largest component value searched, which is the analogue of
  // metafor's confint.rma.mv control vc.max and is unbounded by default. A limit that the search
  // does not reach is reported as unavailable (null), never as the bound itself: confint.rma.mv
  // returns max(10, 100*estimate) as the limit when the cutoff is not crossed inside it, and
  // flags that only through ub.sign in the returned object, with no warning or message. The
  // restricted likelihood here falls to minus infinity as a component grows (there are always at
  // least two clusters), so with the default bound the limit is finite for every admissible input.
  const SEARCH_DOUBLINGS=60;
  function profiles(g,fit,bound){
    return [0,1].map(j=>{
      const estimate=j===0?fit.b:fit.w;
      const prof=x=>scalar(z=>{const r=evaluate(g,j===0?x:z,j===0?z:x);return {...r,derivative:r.gradient[1-j]};},fit.scale);
      const cut=3.841458820694124/2,target=fit.value+cut;
      function root(lo,hi,lower){
        for(let i=0;i<75;i++){
          const mid=(lo+hi)/2,v=prof(mid).value;
          if((v>target)===lower)lo=mid;else hi=mid;
          if(hi-lo<1e-11*Math.max(fit.scale,mid))break;
        }
        return (lo+hi)/2;
      }
      const lower=prof(0).value<=target?0:root(0,estimate,true);
      let high=Math.min(Math.max(estimate*2,fit.scale),bound),iterations=0,bounded=high>estimate;
      while(bounded&&prof(high).value<target){
        if(high>=bound||++iterations>SEARCH_DOUBLINGS){bounded=false;break;}
        high=Math.min(high*2,bound);
      }
      const upper=bounded?root(estimate,high,false):null;
      const end=Math.max(bounded?upper:0,estimate*1.5,1e-8);
      const x=Array.from({length:9},(_,i)=>end*i/8),ll=x.map(v=>prof(v).logLik);
      return {estimate,lower,upper,x,ll};
    });
  }
  function fit(rows,options){
    const bound=options&&options.searchBound!==undefined?options.searchBound:Infinity;
    if(!(bound>0))throw Error('searchBound must be a positive number');
    const g=groups(rows),f=fitted(g);
    // CR2 availability does not determine whether variance profiles can be fitted.
    let robust;
    try {robust=cr2(g,f.b,f.w);}
    catch(e){
      if(!e.message.startsWith('CR2 unavailable:'))throw e;
      robust={status:'unavailable',reason:e.message};
    }
    const result={status:'ok',rows:rows.length,clusters:g.length,robust,logLik:f.logLik,profiles:profiles(g,f,bound)};
    // A null upper limit is a declared unavailable quantity, not a failed fit.
    const unfinished=p=>![p.estimate,p.lower,...p.x,...p.ll].every(finite)||(p.upper!==null&&!finite(p.upper));
    if(!finite(result.logLik)||result.profiles.some(unfinished))throw Error('Variance profile did not converge');
    return result;
  }
  root.AlmMultilevelPlusEngine={fit,cr2:(rows,b,w)=>cr2(groups(rows),b,w),pvalue,critical,searchDoublings:SEARCH_DOUBLINGS};
})(typeof window==='undefined'?globalThis:window);
