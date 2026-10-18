/* Independent sensitivity calculations. No archived outputs are used by the engine. */
(function(g){
'use strict';
const Z=1.959963984540054;
const refusal=reason=>({status:'refused',reason});
const ok=values=>({status:'ok',values});
function lg(z){
 const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
 if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-lg(1-z);
 z--;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
 const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
function betacf(a,b,x){
 let c=1,d=1-(a+b)*x/(a+1);const floor=1e-300;
 if(Math.abs(d)<floor)d=floor;d=1/d;let h=d;
 for(let m=1;m<10000;m++){
  for(const aa of [m*(b-m)*x/((a+2*m-1)*(a+2*m)),-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1))]){
   d=1+aa*d;if(Math.abs(d)<floor)d=floor;c=1+aa/c;if(Math.abs(c)<floor)c=floor;d=1/d;h*=d*c;
  }
  if(Math.abs(d*c-1)<2e-15)return h;
 }
 throw Error('beta-convergence');
}
function beta(a,b,x){
 if(x<=0)return 0;if(x>=1)return 1;
 const v=Math.exp(lg(a+b)-lg(a)-lg(b)+a*Math.log(x)+b*Math.log1p(-x));
 return x<(a+1)/(a+b+2)?v*betacf(a,b,x)/a:1-v*betacf(b,a,1-x)/b;
}
function tp(t,df){return beta(df/2,.5,df/(df+t*t));}
function tq(p,df){let lo=0,hi=1;while(tp(hi,df)>2*(1-p))hi*=2;for(let i=0;i<100;i++){const m=(lo+hi)/2;if(tp(m,df)>2*(1-p))lo=m;else hi=m;}return(lo+hi)/2;}
function chisqSF(x,df){
 if(!Number.isFinite(x)||x<0||df<=0)throw Error('invalid-chi-square');
 if(x===0)return 1;
 const a=df/2,z=x/2,scale=Math.exp(-z+a*Math.log(z)-lg(a));
 if(z<a+1){let term=1/a,sum=term;for(let n=1;n<10000;n++){term*=z/(a+n);sum+=term;if(Math.abs(term)<Math.abs(sum)*2e-15)return Math.max(0,1-sum*scale);} }
 else {let b=z+1-a,c=1e300,d=1/b,h=d;for(let i=1;i<10000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<2e-15)return scale*h;}}
 throw Error('gamma-convergence');
}
function reg(y,s,power){
 if(s.every(v=>v===s[0]))return refusal('singular-design');
 const n=y.length,x=s.map(v=>v**power),w=s.map(v=>1/(v*v)),sw=w.reduce((a,b)=>a+b,0);
 const mx=x.reduce((a,v,i)=>a+w[i]*v,0)/sw,my=y.reduce((a,v,i)=>a+w[i]*v,0)/sw;
 let xx=0,xy=0;for(let i=0;i<n;i++){xx+=w[i]*(x[i]-mx)**2;xy+=w[i]*(x[i]-mx)*(y[i]-my);}
 if(!(xx>0))return refusal('singular-design');
 const slope=xy/xx,mu=my-slope*mx,df=n-2;
 const rss=y.reduce((a,v,i)=>a+w[i]*(v-mu-slope*x[i])**2,0);
 const se=Math.sqrt(rss/df*(1/sw+mx*mx/xx)),t=mu/se,crit=tq(.975,df);
 if(!(se>0)||![mu,slope,t].every(Number.isFinite))return refusal('undefined-regression');
 return ok({mu,slope,se,ciLo:mu-crit*se,ciHi:mu+crit*se,t,p:tp(t,df),df});
}
function conditional(pet,peese,alpha){
 if(!(alpha>0&&alpha<1))return refusal('invalid-alpha');
 if(pet.status!=='ok')return pet;
 if(Math.abs(pet.values.p-alpha)<1e-8)return refusal('alpha-tie');
 const branch=pet.values.p<alpha?'PEESE':'PET',r=branch==='PET'?pet:peese;
 return r.status==='ok'?{...r,branch}:r;
}
function peters(c){
 const b=c.binary,k=c.te.length;
 if(!b)return refusal('binary-arm-counts-required');
 if(!['OR','RR'].includes(b.measure)||!Array.isArray(b.rows)||b.rows.length!==k)return refusal('invalid-binary-input');
 const x=[],w=[];
 for(let i=0;i<k;i++){
  const row=b.rows[i];if(!Array.isArray(row)||row.length!==4||!row.every(Number.isInteger))return refusal('invalid-binary-input');
  const [a,n1,c0,n2]=row,b0=n1-a,d=n2-c0;if(Math.min(a,b0,c0,d)<=0)return refusal('positive-arm-cells-required');
  const effect=b.measure==='OR'?Math.log(a*d/(b0*c0)):Math.log((a/n1)/(c0/n2));
  const se=Math.sqrt(b.measure==='OR'?1/a+1/b0+1/c0+1/d:1/a-1/n1+1/c0-1/n2);
  if(Math.abs(effect-c.te[i])>1e-9*Math.max(1,Math.abs(effect))||Math.abs(se-c.se[i])>1e-9*Math.max(1,se))return refusal('binary-effect-mismatch');
  x.push(1/(n1+n2));w.push(1/(1/(a+c0)+1/(b0+d)));
 }
 if(k<10)return refusal('k-below-10');
 if(x.every(a=>a===x[0]))return refusal('singular-design');
 const sw=w.reduce((a,b)=>a+b,0),mx=x.reduce((a,b,i)=>a+w[i]*b,0)/sw,my=c.te.reduce((a,b,i)=>a+w[i]*b,0)/sw;
 const xx=x.reduce((a,b,i)=>a+w[i]*(b-mx)**2,0),xy=x.reduce((a,b,i)=>a+w[i]*(b-mx)*(c.te[i]-my),0),slope=xy/xx,intercept=my-slope*mx;
 const rss=c.te.reduce((a,b,i)=>a+w[i]*(b-intercept-slope*x[i])**2,0),statistic=slope/Math.sqrt(rss/(k-2)/xx);
 return Number.isFinite(statistic)?ok({statistic,df:k-2,p:tp(statistic,k-2)}):refusal('undefined-regression');
}
function compute(c,limit,alpha=.1){
 const y=c.te,s=c.se;
 if(!Array.isArray(y)||!Array.isArray(s)||y.length!==s.length||y.length<3||!y.every(Number.isFinite)||!s.every(v=>Number.isFinite(v)&&v>0))throw Error('invalid-input');
 const v=s.map(x=>x*x),k=y.length,pool=g.AlmMaCore.pool(y,v,{method:'DL'}),r={};
 pool.ciLo=pool.mu-Z*pool.se;pool.ciHi=pool.mu+Z*pool.se;
 r.RE=ok(Object.fromEntries(['mu','se','ciLo','ciHi','tau2'].map(key=>[key,pool[key]])));
 let limitReason='limit-fit-unavailable';
 if(limit){try{g.AlmLimitPlusMLStart(limit.te_limit,v,'REML');}catch(e){limitReason=e.message;limit=null;}}
 if(limit){
  r.limit=ok({mu:limit.limit_est,se:limit.limit_se,ciLo:limit.limit_ci_lo,ciHi:limit.limit_ci_hi});
  r.Qsmall=Number.isFinite(limit.Q_small)?ok({statistic:limit.Q_small,df:1,p:chisqSF(limit.Q_small,1)}):refusal('undefined-Qsmall');
  r.Qresid=Number.isFinite(limit.Q_resid)?ok({statistic:limit.Q_resid,df:k-2,p:chisqSF(limit.Q_resid,k-2)}):refusal('undefined-Qresid');
  r.shift=ok({value:limit.limit_est-pool.mu});
  r.G2=Number.isFinite(limit.G_squared)?ok({value:limit.G_squared}):refusal('undefined-G2');
 }else for(const key of ['limit','Qsmall','Qresid','shift','G2'])r[key]=refusal(limitReason);
 const f=g.AlmTrimFill.trimAndFill(y,v,{method:'DL',maCommon:true});
 r.trimfill=ok({mu:f.mu,se:f.se,ciLo:f.mu-Z*f.se,ciHi:f.mu+Z*f.se,tau2:f.tau2,k0:f.k0,side:f.side,imputed:f.imputed.map(x=>x.yi),imputedSE:f.imputed.map(x=>Math.sqrt(x.vi))});
 r.PET=reg(y,s,1);r.PEESE=reg(y,s,2);r.conditional=conditional(r.PET,r.PEESE,alpha);
 if(k<10)r.Egger=refusal('k-below-10');
 else {
  // The PET slope equals the intercept of SND ~ precision.
  const x=s.map(z=>1/z),z=y.map((a,i)=>a/s[i]);
  const mx=x.reduce((a,b)=>a+b,0)/k,my=z.reduce((a,b)=>a+b,0)/k;
  const xx=x.reduce((a,b)=>a+(b-mx)**2,0),xy=x.reduce((a,b,i)=>a+(b-mx)*(z[i]-my),0);
  if(x.every(v=>v===x[0])||!(xx>0))r.Egger=refusal('singular-design');
  else {const slope=xy/xx,intercept=my-slope*mx,rss=z.reduce((a,b,i)=>a+(b-intercept-slope*x[i])**2,0),se=Math.sqrt(rss/(k-2)*(1/k+mx*mx/xx)),t=intercept/se;
   r.Egger=Number.isFinite(t)?ok({statistic:t,df:k-2,p:tp(t,k-2)}):refusal('undefined-regression');}
 }
 // Effect/SE rows contain no validated binary arm counts; never infer them.
 r.Peters=peters(c);
 const groups=y.map((a,i)=>a/s[i]>Z);
 if(groups.every(Boolean)||groups.every(x=>!x))r.selection=refusal('empty-interval');
 else {
  try {const f=g.AlmLimitPlusSelModel.fit(y,v,{method:'ML',steps:[.025],optimize:g.AlmLimitPlusOptimize,start:g.AlmLimitPlusMLStart(y,v)});
   r.selection=[f.mu,f.tau2,f.se,f.logLik,...f.delta].every(Number.isFinite)?ok({mu:f.mu,tau2:f.tau2,delta:f.delta[1],se:f.se,ciLo:f.mu-Z*f.se,ciHi:f.mu+Z*f.se,logLik:f.logLik}):refusal('selection-fit-undefined');
  }catch(e){r.selection=refusal(e.message);}
 }
 for(const [key,result] of Object.entries(r)){
  if(result.status==='ok'&&Object.values(result.values).some(v=>typeof v==='number'?!Number.isFinite(v):Array.isArray(v)?!v.every(Number.isFinite):typeof v!=='string'))r[key]=refusal('nonfinite-result');
 }
 return r;
}
g.AlmLimitPlus={compute,peters,reg,conditional,chisqSF,tp,tq};
if(typeof module!=='undefined')module.exports=g.AlmLimitPlus;
})(typeof window!=='undefined'?window:globalThis);
