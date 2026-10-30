(function(){
'use strict';
// Sensitivity UI is outside the frozen primary contract.
const TEXT_SKIP='#alm-plus';
const contractAll=selector=>[...document.querySelectorAll(selector)].filter(n=>!n.closest(TEXT_SKIP));
const files=[{"path": "validate/corpus/corpus.json", "sha256": "a9232d92c3b777c09033b327e8b7df5e332e8b68aadb130d8e164fa4cc437744", "bytes": 638350}, {"path": "validate/corpus/reference.json", "sha256": "5efb8a571a600db2c117d57413b745104089bdef34e7a8410d096883f4081237", "bytes": 1609819}];
const scalar=['k','fe_est','fe_se','fe_ci_lo','fe_ci_hi','re_est','re_se','re_ci_lo','re_ci_hi','tau2_dl','tau_dl','limit_est','limit_se','limit_ci_lo','limit_ci_hi','slope','alpha_r','beta_r','Q','Q_small','Q_resid','G_squared'];
const refusalId='dat.hartmannboyce2018::001';
const refusalReason="Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies.";
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function field(x,k){if(!x||!Object.hasOwn(x,k))throw Error('Missing field '+k);return x[k];}
function vector(x,k){if(!Array.isArray(x)||x.length!==k||x.some(v=>!finite(v)))throw Error('Invalid vector');return x;}
function source(c){const k=field(c,'te').length;vector(c.te,k);vector(field(c,'se'),k);const rows=vector(field(c,'source_rows'),k);if(c.k!==k||k<3||c.se.some(x=>x<=0)||rows.some(x=>!Number.isInteger(x)||x<1)||new Set(rows).size!==k)throw Error('Invalid source rows');return k;}
function validateValues(v,k,who){for(const q of scalar){const x=field(v,q);if(!(finite(x)||(q==='G_squared'&&x===null)))throw Error('Invalid '+who+' quantity '+q);}if(Object.keys(v).some(q=>![...scalar,'te_limit','_schema'].includes(q)))throw Error('Unexpected quantity');if(v.k!==k)throw Error('Invalid k');vector(field(v,'te_limit'),k);}
function index(a){if(!Array.isArray(a)||a.length!==169)throw Error('Expected exactly 169 configurations');const m=new Map();for(const x of a){if(typeof x.id!=='string'||!x.id||m.has(x.id))throw Error('Duplicate or invalid identifier');m.set(x.id,x);}return m;}
function capture(c){const r=window._almLastLimit();
   const body=document.getElementById('body').textContent;
   if(!r) return {id:c.id,status:'refused',reason:'page returned no results',body};
   const invalid=[]; validateValues(r,c.te.length,'app');
   const xmin=Math.min(r.limit_est,...c.te)-.1, xmax=Math.max(r.limit_est,...c.te)+.1, ymax=Math.max(...c.se)*1.1;
   const X=x=>xmin+(x-60)/520*(xmax-xmin),Y=y=>(y-20)/280*ymax;
   const points=contractAll('#plot circle').map(n=>({x:X(+n.getAttribute('cx')),y:Y(+n.getAttribute('cy'))}));
   const curve=document.querySelector('#plot polyline[data-regression]');
   let regression=[];
   if(curve) regression=curve.getAttribute('points').trim().split(/\s+/).map(p=>{const [x,y]=p.split(',').map(Number);return{x:X(x),y:Y(y)}});
   else {
    const line=document.querySelector('#plot line[stroke-dasharray="4 3"]');
    if(line){const x1=+line.getAttribute('x1'),x2=+line.getAttribute('x2'),y1=+line.getAttribute('y1'),y2=+line.getAttribute('y2');regression=Array.from({length:65},(_,i)=>({x:X(x1+(x2-x1)*i/64),y:Y(y1+(y2-y1)*i/64)}))}
   }
   // Corpus probes stay at 65 positions on the visible rendered polyline.
   // No estimator equation is used to reconstruct missing/off-screen geometry.
   if(contractAll('#plot polyline[data-regression]').length!==1) throw new Error('Expected one connected automatic-bound curve');
   const vertices=regression;
   if(vertices.length<2) throw new Error('Missing visible regression');
   regression=Array.from({length:65},(_,i)=>{
     const y=vertices[0].y+(vertices.at(-1).y-vertices[0].y)*(i/64);
     let j=1; while(j<vertices.length-1 && vertices[j].y<y) j++;
     const a=vertices[j-1],b=vertices[j];
     const t=(y-a.y)/(b.y-a.y);
     return {x:a.x+(b.x-a.x)*t,y};
   });
   const table=contractAll('#body tr');
   const expected=[['Fixed effect','fe'],['Random effects (DL)','re'],['Limit (R\u00fccker)','limit']];
   const fmt=x=>Number.isFinite(x)?x.toFixed(3):'\u2014';
   const headerRows=document.getElementById('body').closest('table').tHead?.rows;
   const headers=['Method','Estimate','SE','95% CI'];
   const header_ok=headerRows?.length===1&&headerRows[0].cells.length===headers.length&&
     headers.every((text,i)=>headerRows[0].cells[i].textContent===text);
   const table_ok=header_ok&&table.length===expected.length&&table.every((row,i)=>{
     const [label,prefix]=expected[i];
     const cells=[label,fmt(r[prefix+'_est']),fmt(r[prefix+'_se']),
       '['+fmt(r[prefix+'_ci_lo'])+', '+fmt(r[prefix+'_ci_hi'])+']'];
     return row.cells.length===cells.length&&cells.every((text,j)=>row.cells[j].textContent===text);
   });
   return {id:c.id,status:invalid.length?'invalid':'ok',reason:invalid.length?'nonfinite fields '+invalid.join(','):'',values:r,points,regression,table_ok,body};
}
function values(v){validateValues(v,v.k,'app');return scalar.map(q=>({key:q,label:q,value:v[q]})).concat(v.te_limit.map((x,i)=>({key:'te_limit.'+i,label:'te_limit.'+i,value:x})));}
async function replay(loaded,progress){
 const corpus=index(loaded[files[0].path]),refs=index(loaded[files[1].path]);
 if([...corpus.keys()].some(id=>!refs.has(id)))throw Error('Coverage mismatch');
 let refusals=0;
 for(const [id,c] of corpus){const k=source(c),r=refs.get(id);if(r.status==='refused'){if(id!==refusalId||r.reason!==refusalReason)throw Error('Unexpected refusal');refusals++;}else{if(r.status!=='ok'||id===refusalId)throw Error('Reference refusal changed');validateValues(field(r,'values'),k,'reference');for(const f of ['points','regression'])for(const axis of ['x','y'])vector(field(field(r,f),axis),f==='points'?k:65);}}
 if(refusals!==1)throw Error('Documented refusal missing');
 if(!window.alm?.urlState?.withoutWrites)throw Error('URL-state replay guard unavailable');
 const savedDraft=localStorage.getItem('alm-autosave:limit-ma');
 const snap=__almLimitValidationSnapshot(),locks=[...document.querySelectorAll('textarea,input,select,button')].filter(x=>!x.closest('#alm-validate')).map(x=>[x,x.disabled]);locks.forEach(([x])=>x.disabled=true);
 let checks=0,passed=0;const failed=[],maxima={};
 function check(id,q,a,r){const d=AlmValidate.compare(a,r,'rel',1e-9);checks++;if(d.pass)passed++;else failed.push({id,quantity:q,app:a,ref:r,tol:1e-9,...d});maxima[q]=Math.max(maxima[q]||0,d.diff);}
 return alm.urlState.withoutWrites(async()=>{try{let done=0;for(const [id,c] of corpus){
  __almLimitValidationRun(c.te.map((x,i)=>`${x}, ${c.se[i]}, row ${c.source_rows[i]}`).join('\n'),true);
  const a=capture(c),r=refs.get(id);
  check(id,'status',a.status===r.status?1:0,1);
  if(r.status==='ok'&&a.status==='ok'){
   for(const q of scalar)check(id,q,a.values[q],r.values[q]);
   check(id,'te_limit_length',a.values.te_limit.length,r.values.te_limit.length);
   r.values.te_limit.forEach((x,i)=>check(id,'te_limit',a.values.te_limit[i],x));
   check(id,'table_render',Number(a.table_ok),1);
   for(const f of ['points','regression']){check(id,f+'_length',a[f].length,r[f].x.length);r[f].x.forEach((_,i)=>{for(const axis of ['x','y'])check(id,f+'_'+axis,a[f][i]?.[axis],r[f][axis][i]);});}
  }
  progress(`Replaying ${++done}/169 configurations; ${checks} checks`);await new Promise(r=>setTimeout(r,0));
 }}finally{__almLimitValidationRestore(snap);if(savedDraft===null)localStorage.removeItem('alm-autosave:limit-ma');else localStorage.setItem('alm-autosave:limit-ma',savedDraft);locks.forEach(([x,d])=>x.disabled=d);}
 if(checks!==55525)throw Error('Primary check cardinality mismatch');
 return {checks,passed,failed,maxima,refusals:[{id:refusalId,reason:refusalReason}],summaryLines:['Full primary comparison: 169 configurations, 113 datasets, 9852 effect rows; page code and rendered geometry, no archived app outputs.','dat.hartmannboyce2018::001: R internal REML non-convergence remains a failed status comparison, never a pass.','Paper: meta 8.5-0 / metasens 1.5-3. Relative tolerance 1e-9.']};});
}
function currentState(){
 const text=document.getElementById('src').value,rows=window.__almLimitParse(text);
 if(rows.length<3)throw Error('Need at least three valid effect rows; invalid lines refused');
 const te=rows.map(r=>r.te),se=rows.map(r=>r.se);
 __almLimitValidationRun(text,false);const v=values(_almLastLimit());
 adapter.live.compare.kind=Object.fromEntries(v.map(x=>[x.key,'rel']));
 return {te,se,values:v,note:'DL + beta0; all exported estimates, SEs, CIs, heterogeneity, Q decomposition and shrunken studies. Live meta 8.3-0 / metasens 1.5-3; paper meta 8.5-0 / metasens 1.5-3. R refusal is not a pass.'};
}
function buildScript(s){return `
te <- c(${s.te.join(',')}); se <- c(${s.se.join(',')})
m <- meta::metagen(te,se,method.tau='DL',method.random.ci='classic',level=.95,level.ma=.95,method.tau.ci='')
l <- metasens::limitmeta(m,method.adjust='beta0')
get <- function(x,k) {stopifnot(k %in% names(x));x[[k,exact=TRUE]]}
out <- list(k=get(m,'k'))
mapping <- c(fe_est='TE.common',fe_se='seTE.common',fe_ci_lo='lower.common',fe_ci_hi='upper.common',re_est='TE.random',re_se='seTE.random',re_ci_lo='lower.random',re_ci_hi='upper.random',tau2_dl='tau2',tau_dl='tau')
for(q in names(mapping))out[[q]]<-get(m,mapping[[q,exact=TRUE]])
mapping <- c(limit_est='TE.adjust',limit_se='seTE.adjust',limit_ci_lo='lower.adjust',limit_ci_hi='upper.adjust',slope='beta.r',alpha_r='alpha.r',beta_r='beta.r',Q='Q',Q_small='Q.small',Q_resid='Q.resid',G_squared='G.squared')
for(q in names(mapping))out[[q]]<-get(l,mapping[[q,exact=TRUE]])
v<-get(l,'TE.limit');stopifnot(length(v)==length(te));for(i in seq_along(v))out[[paste0('te_limit.',i-1)]]<-v[i]
emit <- function(q){x<-out[[q,exact=TRUE]];stopifnot(is.numeric(x),length(x)==1);if(q=='G_squared'&&is.na(x))'null' else {stopifnot(is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(names(out),emit,'')),collapse=','),'}\\n',sep='')
`;}
const adapter={app:'limit-ma',contract:{excludedRoots:[TEXT_SKIP]},paper:{checks:55525,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'R re-execution instructions',runUrl:'validate/README.md'},live:{packages:['meta','metasens'],paperVersions:{meta:'8.5-0',metasens:'1.5-3'},currentState,buildScript,appValues:s=>s.values,compare:{tolerance:{default:1e-9},kind:{}}},corpus:{files,run:replay}};
window.AlmLimitValidationAdapter=adapter;
window.AlmLimitValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
})();
