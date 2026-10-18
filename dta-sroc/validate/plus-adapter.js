(function(g){
'use strict';
const el=id=>document.getElementById('plus-'+id),ui=()=>g.AlmDTAPlusUI;
let corpusPromise;
async function load(){if(!corpusPromise)corpusPromise=(async()=>{const pin=AlmDTAPlusPins.files[0],res=await fetch(pin.path,{redirect:'error'});if(!res.ok)throw Error('Extras corpus unavailable');const bytes=new Uint8Array(await res.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(bytes.includes(13)||hash!==pin.sha256)throw Error('Extras corpus SHA-256 mismatch');const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(c.cases.length!==27||c.inventory.length!==114)throw Error('Extras corpus cardinality mismatch');return c;})().catch(e=>{corpusPromise=null;throw e;});return corpusPromise;}
function flatten(o,path='',out={}){if(o!==null&&typeof o==='object'){for(const [k,v]of Object.entries(o))flatten(v,path?path+'.'+k:k,out);}else out[path]=o;return out;}
function expected(r,q,p){return {input:{rows:r.rows,method:r.method,correction:r.correction,at:q.at,prevalence:p.prevalence},studies:r.rows.length,coefficients:r.coef.map((b,i)=>({outcome:i<2?'logit sensitivity':'logit FPR',term:i%2?'x':'(Intercept)',estimate:b,se:r.se[i],z:r.z[i],p:r.p[i],lo:r.lo[i],hi:r.hi[i]})),prediction:{at:q.at,prevalence:p.prevalence,sens:q.sens,spec:q.spec,mu:q.mu,C:q.C,regions:q.regions,positive:p.positive,negative:p.negative}};}
// Transform local SVG bounds with the effective screen matrix. getBoundingClientRect
// rounds at document-coordinate magnitude; subtracting a large page offset loses
// precision that the clean iframe does not lose. This construction keeps the same
// on-screen scale/transforms without that origin-dependent rounding.
function screenBox(n,origin,m){
 if(n.tagName==='svg'){const r=n.getBoundingClientRect();return [0,0,r.width,r.height];}
 const b=n.getBBox(),xs=[],ys=[];
 for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height]){
  xs.push(m.a*x+m.c*y+(m.e-origin.x));ys.push(m.b*x+m.d*y+(m.f-origin.y));
 }
 return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
}
function painted(svg){const origin=svg.getBoundingClientRect();let opacity=1;for(let a=svg;a;a=a.parentElement)opacity*=Number(a.ownerDocument.defaultView.getComputedStyle(a).opacity);const result=[{effectiveOpacity:opacity}];for(const n of [svg,...svg.querySelectorAll('*')]){const s=n.ownerDocument.defaultView.getComputedStyle(n),r=n.getBoundingClientRect(),m=n.getScreenCTM?.();result.push({tag:n.tagName,text:n.tagName==='text'?n.textContent:'',attributes:['d','cx','cy','r','viewBox','transform'].map(k=>n.getAttribute(k)),box:screenBox(n,origin,m),matrix:m?[m.a,m.b,m.c,m.d,m.e-origin.x,m.f-origin.y]:null,style:['display','visibility','opacity','fill','fillOpacity','stroke','strokeOpacity','strokeWidth','strokeDasharray','strokeLinecap','strokeLinejoin','clipPath','filter'].concat(n.tagName==='text'?['fontFamily','fontSize','fontWeight']:[]).map(k=>s[k])});}return result;}
function compareObjects(check,id,a,b,t){const aa=flatten(a),bb=flatten(b);check(id+'/keys',JSON.stringify(Object.keys(aa).sort()),JSON.stringify(Object.keys(bb).sort()));for(const [k,v]of Object.entries(bb))check(id+'/'+k,aa[k],v,typeof v==='number'?t:0,k.endsWith('.p'));}
// Preserve the ordered label/element/key tree, excluding only numeric text and
// SVG (checked separately). This binds each key to its row, column and label,
// and rejects missing, repeated, relocated or unexpected cells and containers.
function effectivelyVisible(n){
 if(!n?.isConnected)return false;
 for(let a=n;a;a=a.parentElement){
  const style=a.ownerDocument.defaultView.getComputedStyle(a);
  if(a.hidden||a.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
  if(style.display!=='contents'&&!Array.from(a.getClientRects()).some(r=>r.width>0&&r.height>0))return false;
 }
 return true;
}
function visibleText(n){
 if(n.nodeType===3)return effectivelyVisible(n.parentElement)?n.textContent:'';
 return effectivelyVisible(n)?Array.from(n.childNodes,visibleText).join(''):'';
}
function displayStructure(root,visibleOnly=false){
 function visit(n){
  if(visibleOnly&&!effectivelyVisible(n.nodeType===3?n.parentElement:n))return null;
  if(n.nodeType===3)return n.textContent.replace(/\s+/g,' ').trim()||null;
  if(n.nodeType!==1||n.tagName==='svg')return null;
  return {tag:n.tagName,key:n.getAttribute('data-value'),colspan:n.getAttribute('colspan'),rowspan:n.getAttribute('rowspan'),children:n.hasAttribute('data-value')?[]:Array.from(n.childNodes,visit).filter(v=>v!==null)};
 }
 return Array.from(root.childNodes,visit).filter(v=>v!==null);
}
async function replay(){const c=await load(),saved={data:el('data').value,method:el('method').value,correction:el('correction').value,at:el('at').value,prevalence:el('prevalence').value,source:el('source').textContent,example:el('example').value};
 const frame=document.createElement('iframe');frame.title='Clean extras plot reference';frame.style.cssText='position:fixed;left:-10000px;top:0;width:600px;height:600px;border:0';const loaded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Clean reference frame unavailable')),15000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.onerror=()=>{clearTimeout(timer);reject(Error('Clean reference frame unavailable'));};});frame.src=new URL('validate/plus-reference-frame.html',location.href).href;document.body.append(frame);
 try{await loaded;const doc=frame.contentDocument;if(!doc?.body)throw Error('Clean reference frame unavailable');return AlmDTAPlusCore.replay(c,(r,q,p,check)=>{const id=r.id+'/display';el('example').value=String(c.cases.indexOf(r));choose(c);check(id+'/source',el('source').textContent,r.dataset+' / '+r.covariate+': x = (raw - '+r.transformation.centre+') / '+r.transformation.scale+'. Source rows: '+r.source_rows.join(', ')+'.');check(id+'/options',JSON.stringify(Array.from(el('example').options,o=>o.textContent)),JSON.stringify(['Choose reference data',...c.cases.map(v=>v.id)]));if(!r.ok){ui().set({rows:r.rows,method:r.method,correction:r.correction,at:0,prevalence:.1});check(id+'/refusal',el('error').textContent,r.refusal);check(id+'/empty',el('results').textContent,'');check(id+'/export-disabled',el('export').disabled,true);return;}
 const ref=expected(r,q,p),actual=ui().set(ref.input),t=r.method==='fixed'?1e-9:1e-6;
 check(id+'/error',el('error').textContent,'');if(!actual){check(id+'/result',false,true);return;}
 let exported;try{exported=JSON.parse(ui().exportJSON());}catch(e){check(id+'/export',false,true);return;}
 compareObjects(check,id+'/export',exported,ref,t);
 const clean=document.createElement('div');clean.innerHTML=AlmDTAPlusReference.html(ref);
 check(id+'/semantic-mapping',JSON.stringify(displayStructure(el('results'),true)),JSON.stringify(displayStructure(clean)));
 const nums=Array.from(el('results').querySelectorAll('[data-value]')).filter(effectivelyVisible),expectedNums=clean.querySelectorAll('[data-value]');check(id+'/number-count',nums.length,expectedNums.length);const ff=flatten(ref);
 // Values are looked up by the independent reference position, never the UI key.
 expectedNums.forEach((n,i)=>{const key=n.dataset.value;check(id+'/'+key,nums[i]&&visibleText(nums[i]).trim()?Number(visibleText(nums[i])):NaN,ff[key],key==='studies'?0:t,key.endsWith('.p'));});
 const text=n=>{const copy=n.cloneNode(true);copy.querySelectorAll('[data-value],svg').forEach(e=>e.remove());return copy.textContent.replace(/\s+/g,' ').trim();};check(id+'/labels',text(el('results')),text(clean));
 doc.body.innerHTML=AlmDTAPlusReference.plot(actual.prediction);const svg=el('results').querySelector('svg'),reference=doc.querySelector('svg');if(!svg){check(id+'/plot',false,true);return;}reference.style.width=svg.getBoundingClientRect().width+'px';
 compareObjects(check,id+'/paint',painted(svg),painted(reference),1e-7);
 });}finally{frame.remove();for(const k of ['data','method','correction','at','prevalence','example'])el(k).value=saved[k];el('source').textContent=saved.source;ui().render();}}
function script(s){ui().model(s);const vec=k=>'c('+s.rows.map(r=>r[k]).join(',')+')';return `print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=${vec('TP')},FN=${vec('FN')},FP=${vec('FP')},TN=${vec('TN')},x=${vec('x')}),formula=cbind(tsens,tfpr)~x,method='${s.method}',correction.control='${s.correction}',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,${s.at},0,0),c(0,0,1,${s.at})); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-${s.prevalence}
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\\n',sep='')`;}
async function live(){const s=ui().input(),m=ui().model(s);const r=await AlmWebR.runR({packages:['mada'],script:script(s)});if(!r.ok)throw Error('Live R unavailable: '+r.error);if(r.versions.mada!=='0.5.12')throw Error('Live mada version not validated');const line=r.stdout.split(/\r?\n/).find(l=>l.startsWith('ALMJSON:'));if(!line)throw Error('Live R result missing');const ref=JSON.parse(line.slice(8)),t=s.method==='fixed'?1e-9:1e-6,fail=[];let checks=0;if(JSON.stringify(Object.keys(ref).sort())!==JSON.stringify(['coef','se','z','p','lo','hi','sens','spec','positive','negative'].sort()))throw Error('Live result keys mismatch');for(const [k,v]of Object.entries(ref)){const a=['sens','spec','positive','negative'].includes(k)?m.prediction[k]:m.coefficients.map(c=>c[k==='coef'?'estimate':k]);const aa=Array.isArray(a)?a:[a],bb=Array.isArray(v)?v:[v];if(aa.length!==bb.length)throw Error('Live result shape mismatch');bb.forEach((b,i)=>{checks++;if(!Number.isFinite(aa[i])||!Number.isFinite(b)||Math.abs(aa[i]-b)>t*(k==='p'?1:Math.max(1,Math.abs(b))))fail.push(k+'.'+i);});}return {checks,passed:checks-fail.length,failures:fail};}
async function run(fn){el('validate').disabled=el('live').disabled=true;el('validation').textContent='Checking extras?';try{const r=await fn();el('validation').textContent=(r.failures.length?'FAIL':'PASS')+`: ${r.passed}/${r.checks} extras checks`;g.__dtaPlusLastValidation=r;}catch(e){el('validation').textContent='FAIL: '+e.message;}finally{el('validate').disabled=el('live').disabled=false;}}
el('validate').onclick=()=>run(replay);el('live').onclick=()=>run(live);
function choose(c){if(el('example').value==='')el('example').value='0';const r=c.cases[Number(el('example').value)];ui().set({rows:r.rows,method:r.method,correction:r.correction,at:0,prevalence:.1});el('source').textContent=r.dataset+' / '+r.covariate+': x = (raw - '+r.transformation.centre+') / '+r.transformation.scale+'. Source rows: '+r.source_rows.join(', ')+'.';}
el('load').onclick=async()=>{try{choose(await load());}catch(e){el('error').textContent=e.message;}};
load().then(c=>{c.cases.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.id;el('example').append(o);});}).catch(e=>{el('error').textContent=e.message;});
g.AlmDTAPlusValidate={load,replay,live,script,expected,painted};
})(globalThis);
