(function(){
'use strict';
const methods=['RE','limit','trimfill','PET','PEESE','conditional','selection','Egger','Peters','Qsmall','Qresid','shift','G2'];
const fields={RE:['mu','se','ciLo','ciHi','tau2'],limit:['mu','se','ciLo','ciHi'],trimfill:['mu','se','ciLo','ciHi','tau2','k0','side','imputed','imputedSE'],PET:['mu','slope','se','ciLo','ciHi','t','p','df'],PEESE:['mu','slope','se','ciLo','ciHi','t','p','df'],selection:['mu','tau2','delta','se','ciLo','ciHi','logLik'],Egger:['statistic','df','p'],Peters:['statistic','df','p'],Qsmall:['statistic','df','p'],Qresid:['statistic','df','p'],shift:['value'],G2:['value']};fields.conditional=fields.PET;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function validate(corpus,refs){
 if(!Array.isArray(corpus)||!Array.isArray(refs)||corpus.length!==169||refs.length!==169)throw Error('Expected 169 sensitivity configurations');
 const ids=new Set();
 corpus.forEach((c,i)=>{
  if(typeof c.id!=='string'||ids.has(c.id)||refs[i].id!==c.id)throw Error('Invalid sensitivity identifiers');ids.add(c.id);
  if(!Array.isArray(c.te)||!Array.isArray(c.se)||c.te.length!==c.k||c.se.length!==c.k||c.k<3||!c.te.every(finite)||!c.se.every(x=>finite(x)&&x>0)||!Array.isArray(c.source_rows)||c.source_rows.length!==c.k||c.source_rows.some(x=>!Number.isInteger(x)||x<1)||new Set(c.source_rows).size!==c.k)throw Error('Invalid sensitivity input');
  const m=refs[i].methods;
  if(!m||Object.keys(m).length!==methods.length)throw Error('Invalid method coverage');
  for(const key of methods){const r=m[key];if(!r||!['ok','refused'].includes(r.status))throw Error('Invalid method status');
   if(r.status==='refused'){if(typeof r.reason!=='string'||!r.reason.trim()||r.values)throw Error('Invalid refusal');continue;}
   if(!r.values||Object.keys(r.values).length!==fields[key].length)throw Error('Invalid value coverage '+key);
   for(const q of fields[key]){const v=r.values[q];if(q==='side'){if(!['left','right'].includes(v))throw Error('Invalid side');}
    else if(q==='imputed'||q==='imputedSE'){if(!Array.isArray(v)||!v.every(finite)||v.length!==r.values.k0)throw Error('Invalid fills');}
    else if(!finite(v))throw Error('Invalid reference '+key+'.'+q);
   }
   if(key==='conditional'&&!['PET','PEESE'].includes(r.branch))throw Error('Invalid branch');
  }
 });
}
function flatten(r){const out={};for(const [key,m] of Object.entries(r)){
 out[key+'.status']=m.status;
 if(m.status==='refused')out[key+'.reason']=m.reason;
 else {if(m.branch)out[key+'.branch']=m.branch;for(const [q,v] of Object.entries(m.values)){if(Array.isArray(v)){out[key+'.'+q+'.length']=v.length;v.forEach((x,i)=>out[key+'.'+q+'.'+i]=x);}else out[key+'.'+q]=v;}}
 }return out;
}
function tolerance(key){return key.startsWith('selection.')?(/\.(se|ciLo|ciHi)$/.test(key)?1e-4:1e-6):1e-9;}
const fitMethods=['RE','limit','trimfill','PET','PEESE','conditional','selection'];
// Independent display contract; do not derive expected names from rendered text.
const forestNames={RE:'Random effects (DL)',limit:'Limit (R\u00fccker)',trimfill:'Trim-and-fill \u2014 sensitivity only',PET:'PET',PEESE:'PEESE',conditional:'Conditional PET\u2013PEESE',selection:'3PSM (ML, step .025)'};
function displayed(expected){
 const failures=[];
 for(const n of document.querySelectorAll('#alm-plus [data-plus-number]')){const key=n.dataset.plusNumber,v=expected[key];if(!finite(v)||n.textContent!==v.toPrecision(12))failures.push(key);}
 for(const [key,v] of Object.entries(expected))if(finite(v)&&!key.endsWith('.length')&&!document.querySelector('#alm-plus [data-plus-number="'+key+'"]'))failures.push(key+' missing');
 const required=[];
 for(const [key,v] of Object.entries(expected)){
  const method=key.split('.')[0];
  if(key.endsWith('.reason')){
   required.push(['refusal',method,'#plus-details [data-plus-detail="'+method+'"]','Refused: '+v]);
   if(fitMethods.includes(method))required.push(['refusal',method,'#plus-body [data-plus-method="'+method+'"]','Refused: '+v]);
  }else if(key.endsWith('.branch')||key.endsWith('.side'))required.push(['category',key,'#plus-details [data-plus-detail="'+method+'"]',v]);
 }
 for(const [type,key,location,text] of required){
  const nodes=document.querySelectorAll(location+' [data-plus-'+type+'="'+key+'"]');
  if(nodes.length!==1||nodes[0].textContent!==text)failures.push(key+' '+type+' missing, misplaced, duplicated or changed');
 }
 for(const type of ['category','refusal'])if(document.querySelectorAll('#alm-plus [data-plus-'+type+']').length!==required.filter(x=>x[0]===type).length)failures.push(type+' cardinality');
 return failures;
}
// Independently invert SVG coordinates into entered effect/SE units. The gate
// uses source results (already compared to the pinned oracle), never SVG metadata.
// Relative tolerance 1e-9 with unit floor; SVG layout coordinates use the same bound.
function geometry(r,c,limit){
 const failures=[],close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
 function eq(a,b,key){if(!close(a,b))failures.push(key);}
 function attr(n,k){const s=n?.getAttribute(k);return s===null||s===undefined||s.trim()===''?NaN:Number(s);}
 function count(nodes,n,key){if(nodes.length!==n)failures.push(key+' count');}
 // This renderer emits root-coordinate SVG only. Fail closed on transforms,
 // including ancestor groups and CSS transforms, before using raw coordinates.
 for(const id of ['plus-forest','plus-funnel']){
  const svg=document.getElementById(id);
  for(const node of [svg,...svg.querySelectorAll('*')]){
   if(node.hasAttribute('transform')||getComputedStyle(node).transform!=='none')failures.push(id+' unexpected transform');
  }
 }
 const fits=fitMethods.filter(k=>r[k].status==='ok');
 let low=Math.min(0,...fits.map(k=>r[k].values.ciLo)),high=Math.max(0,...fits.map(k=>r[k].values.ciHi));if(low===high)high=low+1;
 const effect=x=>low+(x-220)*(high-low)/450;
 const forest=document.getElementById('plus-forest'),dots=forest.querySelectorAll('circle'),lines=forest.querySelectorAll('line');
 const labels=forest.querySelectorAll('text');count(labels,fits.length,'forest method labels');
 count(dots,fits.length,'forest estimates');count(lines,fits.length+1,'forest intervals');
 eq(effect(attr(lines[0],'x1')),0,'forest null x1');eq(effect(attr(lines[0],'x2')),0,'forest null x2');eq(attr(lines[0],'y1'),5,'forest null y1');eq(attr(lines[0],'y2'),240,'forest null y2');
 fits.forEach((key,i)=>{const v=r[key].values,y=25+30*i;
  if(labels[i]?.textContent!==forestNames[key])failures.push(key+' forest label');
  eq(attr(labels[i],'x'),5,key+' label x');eq(attr(labels[i],'y'),y+4,key+' label row');
  eq(effect(attr(dots[i],'cx')),v.mu,key+' estimate');eq(attr(dots[i],'cy'),y,key+' row');
  for(const [attrName,value] of [['x1',v.ciLo],['x2',v.ciHi]])eq(effect(attr(lines[i+1],attrName)),value,key+' '+attrName);
  for(const a of ['y1','y2'])eq(attr(lines[i+1],a),y,key+' '+a);
 });
 const maxSE=Math.max(...c.se)*1.1,points=c.te.map((v,i)=>[v,c.se[i]]),curves=[];
 const on=id=>document.getElementById('plus-'+id+'-toggle').checked;
 if(on('limit')&&limit&&r.limit.status==='ok'){
  curves.push(Array.from({length:65},(_,i)=>{const se=maxSE*i/64;return [limit.beta_r+limit.alpha_r*Math.sqrt(se*se+limit.tau2_dl),se];}));
  limit.te_limit.forEach((v,i)=>points.push([v,c.se[i]]));
 }
 if(on('fill')&&r.trimfill.status==='ok')r.trimfill.values.imputed.forEach((v,i)=>points.push([v,r.trimfill.values.imputedSE[i]]));
 for(const [key,power] of [['PET',1],['PEESE',2]])if(on('reg')&&r[key].status==='ok')curves.push(Array.from({length:65},(_,i)=>{const se=maxSE*i/64;return [r[key].values.mu+r[key].values.slope*Math.pow(se,power),se];}));
 if(on('contour'))for(const sign of [-1,1])curves.push([[0,0],[sign*1.959963984540054*maxSE,maxSE]]);
 const values=points.concat(curves.flat()).map(p=>p[0]);let min=Math.min(...values),max=Math.max(...values);const padding=(max-min)*.05||.1;min-=padding;max+=padding;
 const invertX=x=>min+(x-60)*(max-min)/600,invertY=y=>(y-20)*maxSE/290;
 const funnel=document.getElementById('plus-funnel'),studies=funnel.querySelectorAll('circle'),paths=funnel.querySelectorAll('polyline');
 count(studies,points.length,'funnel points');count(paths,curves.length,'funnel curves');
 points.forEach(([x,se],i)=>{eq(invertX(attr(studies[i],'cx')),x,'funnel effect '+i);eq(invertY(attr(studies[i],'cy')),se,'funnel SE '+i);});
 curves.forEach((curve,i)=>{
  const raw=paths[i]?.getAttribute('points')?.trim(),pairs=raw?raw.split(/\s+/).map(p=>p.split(',').map(Number)):[];
  count(pairs,curve.length,'curve '+i);
  curve.forEach(([x,se],j)=>{const p=pairs[j]||[];if(p.length!==2)failures.push('curve coordinate arity');eq(invertX(p[0]),x,'curve effect '+i+':'+j);eq(invertY(p[1]),se,'curve SE '+i+':'+j);});
 });
 return failures;
}
async function mount(){
 const manifest=window.AlmLimitPlusManifest;if(!manifest)throw Error('Sensitivity pins unavailable');
 const files=manifest.files;
 async function replay(loaded,progress){
  const corpus=loaded[files[0].path],refs=loaded[files[1].path];validate(corpus,refs);
  const snap=__almLimitValidationSnapshot(),ui=AlmLimitPlusUI.snapshot(),status=document.getElementById('plus-status').textContent;
  const locks=[...document.querySelectorAll('button,input,select,textarea')].filter(n=>!n.closest('#alm-plus-validate')).map(n=>[n,n.disabled]);locks.forEach(([n])=>n.disabled=true);
  let checks=0,passed=0;const failed=[],maxima={};
  function check(id,q,a,r,exact=false){const tol=tolerance(q),d=AlmValidate.compare(a,r,exact?'exact':'rel',tol);checks++;if(d.pass)passed++;else failed.push({id,quantity:q,app:a,ref:r,tol,...d});maxima[q]=Math.max(maxima[q]||0,d.diff);}
  return alm.urlState.withoutWrites(async()=>{try{
   for(let i=0;i<corpus.length;i++){
    const c=corpus[i];__almLimitValidationRun(c.te.map((v,j)=>v+','+c.se[j]+',row '+c.source_rows[j]).join('\n'),true);
    const limit=_almLastLimit(),a=AlmLimitPlus.compute(c,limit,.1),ref=refs[i].methods;
    AlmLimitPlusUI.render(a,c,limit);
    const af=flatten(a),rf=flatten(ref);
    for(const [q,v] of Object.entries(rf))check(c.id,q,af[q],v,typeof v!=='number'||/\.(df|k0|length)$/.test(q));
    const renderFailures=displayed(af).concat(geometry(a,c,limit));check(c.id,'render',renderFailures.length,0,true);
    progress('Sensitivity replay '+(i+1)+'/'+corpus.length+'; '+checks+' checks');await new Promise(r=>setTimeout(r,0));
   }
  }finally{__almLimitValidationRestore(snap);AlmLimitPlusUI.restore(ui);document.getElementById('plus-status').textContent=status;locks.forEach(([n,d])=>n.disabled=d);}
  if(checks!==manifest.checks)throw Error('Sensitivity check cardinality mismatch: '+checks+' != '+manifest.checks);
  return {checks,passed,failed,maxima,summaryLines:['Independent sensitivity oracle: meta 8.5-0, metafor 5.2-1, metasens 1.5-3.','Refusals pass only when both implementations refuse for the same reason.','Rendered forest/funnel coordinates inverted to effect/SE units: 1e-9 relative tolerance with unit floor.','Closed-form tolerance 1e-9 relative; selection parameters/logLik 1e-6 and SE/CI 1e-4.']};
  });
 }
 const adapter={app:'limit-ma-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Sensitivity oracle protocol',runUrl:'validate/README-plus.md'},corpus:{files,run:replay}};
 window.AlmLimitPlusValidationAdapter=adapter;window.AlmLimitPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
 document.querySelectorAll('#alm-plus-validate button').forEach(b=>{if(b.textContent==='Re-run full validation')b.textContent='Re-run sensitivity validation';});
}
window.AlmLimitPlusContract={validate,flatten,displayed,geometry,tolerance};
window.AlmLimitPlusReady=mount().catch(e=>{document.getElementById('alm-plus-validate').textContent='Validation unavailable: '+e.message;throw e;});
})();