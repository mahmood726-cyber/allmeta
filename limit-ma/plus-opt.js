/* BFGS with central numerical gradients and deterministic backtracking.
 * Default numerical controls follow R optim (BFGS); no stochastic starts.
 */
(function(g){'use strict';
function minimize(f,start){
 const n=start.length,eps=.001,rtol=Math.sqrt(Number.EPSILON),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const gradient=x=>x.map((_,i)=>{const a=x.slice(),b=x.slice();a[i]+=eps;b[i]-=eps;return(f(a)-f(b))/(2*eps);});
 let x=start.slice(),value=f(x),grad=gradient(x),H,iterations=1,sinceReset=0,reset=true;
 for(let step=0;step<10000;step++){
  if(reset){H=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));sinceReset=0;reset=false;}
  const direction=H.map(row=>-dot(row,grad)),descent=dot(direction,grad);
  if(!(descent<0)){if(sinceReset===0)return{x,f:value};reset=true;continue;}
  let rate=1,next,newValue=value,changed=false;
  for(let j=0;j<1000;j++){
   next=x.map((v,i)=>v+rate*direction[i]);changed=next.some((v,i)=>10+v!==10+x[i]);if(!changed)break;
   newValue=f(next);if(Number.isFinite(newValue)&&newValue<=value+.0001*rate*descent)break;rate*=.2;
  }
  const enough=Math.abs(newValue-value)>rtol*(Math.abs(value)+rtol);
  if(!enough||!changed){x=next;value=newValue;if(sinceReset===0)return{x,f:value};reset=true;continue;}
  const nextGrad=gradient(next),s=direction.map(v=>rate*v),y=nextGrad.map((v,i)=>v-grad[i]),sy=dot(s,y);
  x=next;value=newValue;grad=nextGrad;iterations++;sinceReset++;
  if(iterations>=100)throw Error("Optimizer (optim) did not achieve convergence (convergence = 1).");
  if(sy>0){const Hy=H.map(row=>dot(row,y)),factor=(1+dot(y,Hy)/sy)/sy;H=H.map((row,i)=>row.map((v,j)=>v+factor*s[i]*s[j]-(Hy[i]*s[j]+s[i]*Hy[j])/sy));}
  else reset=true;
  if(sinceReset>2*n)reset=true;
 }
 throw Error('selection-optimizer-limit');
}

// Intercept-only rma(method="ML") Fisher scoring defaults, including its
// convergence threshold. The selection fit is sensitive to the parent start.
g.AlmLimitPlusMLStart=function(y,v,method){
 const k=y.length,avg=y.reduce((a,b)=>a+b,0)/k;
 let t=Math.max(0,y.reduce((a,b)=>a+(b-avg)**2,0)/(k-1)-v.reduce((a,b)=>a+b,0)/k);
 function fit(t){const w=v.map(a=>1/(a+t)),sw=w.reduce((a,b)=>a+b,0),mu=y.reduce((a,b,i)=>a+w[i]*b,0)/sw;return {w,sw,mu,ll:-.5*v.reduce((a,b,i)=>a+Math.log(2*Math.PI*(b+t))+(y[i]-mu)**2/(b+t),0)};}
 for(let i=0;i<=100;i++){
  const f=fit(t),w2=f.w.map(a=>a*a),sw2=w2.reduce((a,b)=>a+b,0),sw3=f.w.reduce((a,b)=>a+b*b*b,0);
  const reml=method==='REML',trP=f.sw-sw2/f.sw,trPP=sw2-2*sw3/f.sw+sw2*sw2/(f.sw*f.sw);
  let adj=(y.reduce((a,b,j)=>a+w2[j]*(b-f.mu)**2,0)-(reml?trP:f.sw))/(reml?trPP:sw2);
  while(t+adj<0)adj/=2;const next=t+adj,change=Math.abs(adj);t=next;
  if(i===100)throw Error("Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies.");
  if(change<=1e-5){if(t>1e-5&&fit(0).ll-fit(t).ll>Number.EPSILON**.25)t=0;return {mu:fit(t).mu,tau2:t};}
 }
};
g.AlmLimitPlusOptimize=function(f,x){const r=minimize(v=>f([v[0],v[1],v[3]]),[x[0],x[1],1,x[2]]);return{x:[r.x[0],r.x[1],r.x[3]],f:r.f};};
})(typeof window!=='undefined'?window:globalThis);