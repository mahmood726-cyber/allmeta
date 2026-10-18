/* Browser-local screening math. No network, DOM, or automatic review decisions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScreenHybrid=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='screen-hybrid-lr-1';
 const DEFAULTS=Object.freeze({maxFeatures:6000,epochs:120,rate:1,l2:0.01,bigrams:true});
 const fields=['population','intervention','comparator','outcome','design'];
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function validateRules(rules){
  if(!Array.isArray(rules)||rules.length>100)throw Error('Use at most 100 protocol rules.');const ids=new Set();
  for(const r of rules){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||!fields.includes(r.field)||!['require','exclude','prefer'].includes(r.mode)||!Array.isArray(r.terms)||!r.terms.length||r.terms.length>50||r.terms.some(t=>typeof t!=='string'||!t.trim()||t.length>120))throw Error('Invalid protocol rule. Each needs a unique ID, PICO/design field, mode and literal synonyms.');ids.add(r.id);}
  return rules;
 }
 function match(text,rules){
  text=String(text);validateRules(rules);const hits=[],missing=[],flags=[];
  for(const rule of rules){let positive=false;for(const term of rule.terms){
   const re=new RegExp('(^|[^\\p{L}\\p{N}_])('+esc(term.trim()).replace(/\s+/g,'\\s+')+')(?=$|[^\\p{L}\\p{N}_])','giu');let m;
   while((m=re.exec(text))!==null){const start=m.index+m[1].length,end=start+m[2].length;
    // Transparent local cue only; not a clinical negation classifier.
    const negated=/\b(?:no|not|without|excluding)\s+(?:\w+\s+){0,2}$/i.test(text.slice(Math.max(0,start-50),start));
    hits.push({rule:rule.id,field:rule.field,mode:rule.mode,start,end,text:text.slice(start,end),synonym:term,negated});if(!negated)positive=true;
   }
  }if(!positive&&rule.mode==='require')missing.push(rule.id);if(positive&&rule.mode==='exclude')flags.push(rule.id);}
  hits.sort((a,b)=>a.start-b.start||b.end-a.end||a.rule.localeCompare(b.rule));return {hits,missing,flags};
 }
 function tokens(text,bigrams){const words=(String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>w.length<=40);return bigrams?words.concat(words.slice(1).map((w,i)=>words[i]+'_'+w)):words;}
 function textOf(r){return [r.title||'',r.abstract||''].join(' ');}
 function prepare(records,config){
  config=Object.assign({},DEFAULTS,config);if(!Number.isInteger(config.maxFeatures)||config.maxFeatures<1||config.maxFeatures>20000)throw Error('Invalid feature limit.');
  const ids=new Set(),df=new Map(),counts=[];
  records.forEach(r=>{if(!r.id||ids.has(String(r.id)))throw Error('Record IDs must be present and unique.');ids.add(String(r.id));const tf=new Map();for(const t of tokens(textOf(r),config.bigrams))tf.set(t,(tf.get(t)||0)+1);counts.push(tf);for(const t of tf.keys())df.set(t,(df.get(t)||0)+1);});
  const terms=[...df.keys()].sort((a,b)=>df.get(b)-df.get(a)||(a<b?-1:a>b?1:0)).slice(0,config.maxFeatures),index=new Map(terms.map((t,i)=>[t,i]));
  const idf=terms.map(t=>Math.log((1+records.length)/(1+df.get(t)))+1);
  const X=counts.map(tf=>{const row=[];let norm=0;for(const [t,count]of tf){const j=index.get(t);if(j===undefined)continue;const v=(1+Math.log(count))*idf[j];norm+=v*v;row.push([j,v]);}norm=Math.sqrt(norm)||1;return row.sort((a,b)=>a[0]-b[0]).map(([j,v])=>[j,v/norm]);});
  return {ids:records.map(r=>String(r.id)),terms,idf,X,config};
 }
 function sigmoid(x){return x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));}
 function fit(data,labels){
  const cfg=data.config;if(!Number.isInteger(cfg.epochs)||cfg.epochs<1||cfg.epochs>500||!Number.isFinite(cfg.l2)||cfg.l2<=0||!Number.isFinite(cfg.rate)||cfg.rate<=0||cfg.rate>2)throw Error('Invalid training configuration.');
  const selected=[];let pos=0,neg=0;data.ids.forEach((id,i)=>{if(labels[id]===1||labels[id]===0){selected.push(i);if(labels[id])pos++;else neg++;}});
  if(pos<2||neg<2)throw Error('Label at least two includes and two excludes to train.');if(!data.terms.length)throw Error('No text features.');
  const w=new Float64Array(data.terms.length);let b=0;
  for(let epoch=0;epoch<cfg.epochs;epoch++){
   const grad=new Float64Array(w.length);let gb=0;
   for(const i of selected){let dot=b;for(const [j,v]of data.X[i])dot+=w[j]*v;const y=labels[data.ids[i]],g=(sigmoid(dot)-y)*(y?1/(2*pos):1/(2*neg));gb+=g;for(const [j,v]of data.X[i])grad[j]+=g*v;}
   for(let j=0;j<w.length;j++)w[j]-=cfg.rate*(grad[j]+cfg.l2*w[j]);b-=cfg.rate*gb;
  }
  const scores=Object.create(null);data.ids.forEach((id,i)=>{let dot=b;for(const [j,v]of data.X[i])dot+=w[j]*v;scores[id]=sigmoid(dot);});
  const terms=data.terms.map((term,j)=>({term,weight:w[j]})).sort((a,b)=>b.weight-a.weight);
  return {version:VERSION,scores,weights:Array.from(w),intercept:b,features:data.terms,idf:data.idf,config:cfg,pos,neg,topInclude:terms.slice(0,12),topExclude:terms.slice(-12).reverse()};
 }
 function train(records,labels,config){return fit(prepare(records,config),labels);}
 function random(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return (t^(t>>>14))>>>0;};}
 function sample(ids,n,seed){if(!Number.isInteger(n)||n<1||n>ids.length||new Set(ids).size!==ids.length||!Number.isInteger(seed))throw Error('Invalid audit sample.');const a=ids.slice(),next=random(seed);for(let i=a.length-1;i>0;i--){const m=i+1,limit=Math.floor(4294967296/m)*m;let x;do{x=next();}while(x>=limit);const j=x%m;[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);}
 function logGamma(z){const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];z--;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);const t=z+c.length-.5;return .9189385332046727+(z+.5)*Math.log(t)-t+Math.log(x);}
 function logChoose(n,k){if(k<0||k>n)return -Infinity;return logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1);}
 function hypergeomCDF(x,N,M,n){const lo=Math.max(0,n-(N-M)),hi=Math.min(n,M);if(x<lo)return 0;if(x>=hi)return 1;let sum=0;for(let k=lo;k<=Math.min(x,hi);k++)sum+=Math.exp(logChoose(M,k)+logChoose(N-M,n-k)-logChoose(N,n));return Math.min(1,sum);}
 function upperEligible(N,n,x,alpha){if(![N,n,x].every(Number.isSafeInteger)||N<1||n<0||n>N||x<0||x>n||!Number.isFinite(alpha)||alpha<=0||alpha>=1)throw Error('Invalid fixed-sample audit inputs.');if(!n)return N;if(n===N)return x;let lo=x,hi=N-n+x;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(hypergeomCDF(x,N,mid,n)>=alpha)lo=mid;else hi=mid-1;}return lo;}
 function alphaFor(round){if(!Number.isSafeInteger(round)||round<1)throw Error('Invalid audit round.');return .05/(round*(round+1));}
 function auditResult(a){const alpha=alphaFor(a.round);if(!Array.isArray(a.labels)||a.labels.length!==a.n||a.labels.some(x=>x!==0&&x!==1))return {complete:false,alpha};if(!Number.isSafeInteger(a.found)||a.found<0)throw Error('Invalid included count.');const x=a.labels.reduce((s,x)=>s+x,0),upper=upperEligible(a.N,a.n,x,alpha);return {complete:true,alpha,eligibleInSample:x,upperRemaining:upper,recallLower:a.found/(a.found+upper)||0};}
 function cosine(a,b){if(a.length!==b.length)throw Error('Embedding dimensions differ.');let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw Error('Invalid embedding.');dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
 return {VERSION,DEFAULTS,validateRules,match,prepare,fit,train,sample,upperEligible,hypergeomCDF,alphaFor,auditResult,cosine};
});
