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
function displayed(expected){
 const failures=[];
 for(const n of document.querySelectorAll('#alm-plus [data-plus-number]')){const key=n.dataset.plusNumber,v=expected[key];if(!finite(v)||n.textContent!==v.toPrecision(12))failures.push(key);}
 for(const n of document.querySelectorAll('#alm-plus [data-plus-category]'))if(n.textContent!==expected[n.dataset.plusCategory])failures.push(n.dataset.plusCategory);
 for(const n of document.querySelectorAll('#alm-plus [data-plus-refusal]'))if(n.textContent!=='Refused: '+expected[n.dataset.plusRefusal+'.reason'])failures.push(n.dataset.plusRefusal+'.reason');
 for(const [key,v] of Object.entries(expected))if(finite(v)&&!key.endsWith('.length')&&!document.querySelector('#alm-plus [data-plus-number="'+key+'"]'))failures.push(key+' missing');
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
    const renderFailures=displayed(af);check(c.id,'render',renderFailures.length,0,true);
    progress('Sensitivity replay '+(i+1)+'/'+corpus.length+'; '+checks+' checks');await new Promise(r=>setTimeout(r,0));
   }
  }finally{__almLimitValidationRestore(snap);AlmLimitPlusUI.restore(ui);document.getElementById('plus-status').textContent=status;locks.forEach(([n,d])=>n.disabled=d);}
  if(checks!==manifest.checks)throw Error('Sensitivity check cardinality mismatch: '+checks+' != '+manifest.checks);
  return {checks,passed,failed,maxima,summaryLines:['Independent sensitivity oracle: meta 8.5-0, metafor 5.2-1, metasens 1.5-3.','Refusals pass only when both implementations refuse for the same reason.','Closed-form tolerance 1e-9 relative; selection parameters/logLik 1e-6 and SE/CI 1e-4.']};
  });
 }
 const adapter={app:'limit-ma-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Sensitivity oracle protocol',runUrl:'validate/README-plus.md'},corpus:{files,run:replay}};
 window.AlmLimitPlusValidationAdapter=adapter;window.AlmLimitPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
 document.querySelectorAll('#alm-plus-validate button').forEach(b=>{if(b.textContent==='Re-run full validation')b.textContent='Re-run sensitivity validation';});
}
window.AlmLimitPlusContract={validate,flatten,displayed,tolerance};
window.AlmLimitPlusReady=mount().catch(e=>{document.getElementById('alm-plus-validate').textContent='Validation unavailable: '+e.message;throw e;});
})();