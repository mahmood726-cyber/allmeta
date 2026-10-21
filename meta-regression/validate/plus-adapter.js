(function(){
 'use strict';
 const manifest=window.AlmMetaPlusManifest,contract=AlmMetaPlusContract,UI=AlmMetaPlusUI;
 const files=manifest.files,fmt=x=>x.toPrecision(12),$=id=>document.getElementById(id);
 // Freeze clean stylesheet rules and renderer before any validation mutations.
 const draw=UI.plot,host=document.createElement('div');
 host.setAttribute('aria-hidden','true');host.style.cssText='all:initial;position:fixed;left:-100000px;top:0;visibility:visible;pointer-events:none';
 const shadow=host.attachShadow({mode:'closed'}),css=document.createElement('style');
 css.textContent=[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n');}catch{return '';}}).join('\n').replaceAll(':root',':host');
 shadow.append(css);const mount=document.createElement('div');mount.id='plus-plot';shadow.append(mount);document.body.append(host);
 function displayed(r,c){
  const failures=[],expected={};
  if(r.status!=='ok'){
   if($('plus-status').textContent!=='Refused: '+r.reason)failures.push('refusal text');
   if($('plus-results').children.length||$('plus-plot').children.length)failures.push('stale refused output');
   return failures;
  }
  for(const model of ['full','reduced']){
   const v=r[model],terms=model==='full'?r.terms:r.reducedTerms;
   for(const key of ['k','p','tau2','logLik','AIC','BIC'])expected[model+'.'+key]=v[key];
   for(const key of ['beta','se','z','pval','ciLo','ciHi'])v[key].forEach((n,i)=>expected[model+'.'+key+'.'+i]=n);
   const table=document.querySelector(`[data-model="${model}"]`),headers=[...table?.querySelectorAll('thead th')||[]];
   if(headers.map(n=>n.textContent).join('|')!=='Term|Estimate|SE|z|p|CI lower|CI upper')failures.push(model+' column labels');
   const labels=[...document.querySelectorAll(`[data-term^="${model}."]`)];
   if(labels.length!==terms.length||labels.some((n,i)=>n.textContent!==terms[i]||!table?.contains(n)))failures.push(model+' term labels');
   if(table?.querySelectorAll('tbody tr').length!==terms.length)failures.push(model+' row count');
   [...table?.querySelectorAll('tbody tr')||[]].forEach((row,i)=>{
    const cells=[...row.children];
    if(cells.length!==7||cells[0].textContent!==terms[i])failures.push(model+' coefficient row');
    ['beta','se','z','pval','ciLo','ciHi'].forEach((key,j)=>{if(cells[j+1]?.querySelector('[data-plus-number]')?.dataset.plusNumber!==model+'.'+key+'.'+i)failures.push(model+' coefficient position');});
   });
   const heading=document.querySelector(`[data-model-heading="${model}"]`);
   if(heading?.textContent!==(model==='full'?'Full model':'Reduced model'))failures.push(model+' heading');
  }
  for(const [k,v]of Object.entries(r.comparison))expected['comparison.'+k]=v;
  for(const model of ['full','reduced','comparison']){
   const labels=model==='comparison'?{LRT:'Likelihood-ratio statistic',df:'Degrees of freedom',pval:'p'}:{k:'Studies',p:'Coefficients',tau2:'Residual tau-squared',logLik:'Log likelihood',AIC:'AIC',BIC:'BIC'};
   const dl=document.querySelector(`[data-summary="${model}"]`),children=[...dl?.children||[]];
   if(children.length!==2*Object.keys(labels).length)failures.push(model+' summary count');
   Object.entries(labels).forEach(([key,label],i)=>{if(children[i*2]?.textContent!==label||children[i*2+1]?.querySelector('[data-plus-number]')?.dataset.plusNumber!==model+'.'+key)failures.push(model+' summary label or position');});
  }
  r.plot.held.forEach((v,i)=>expected['plot.held.'+i]=v);
  const nodes=[...document.querySelectorAll('#plus-results [data-plus-number]')];
  if(nodes.length!==Object.keys(expected).length)failures.push('number count');
  for(const [k,v]of Object.entries(expected)){
   const matched=nodes.filter(n=>n.dataset.plusNumber===k);
   if(matched.length!==1||matched[0].textContent!==fmt(v))failures.push(k+' display');
   if(typeof getComputedStyle==='function'&&matched.length===1)for(let n=matched[0];n&&n.id!=='alm-plus';n=n.parentElement){const style=getComputedStyle(n);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)failures.push(k+' hidden');}
  }
  const held=[...document.querySelectorAll('#plus-results [data-held-label]')];
  if(held.length!==c.names.length-1||held.some((n,i)=>n.textContent!==c.names[i+1]))failures.push('held moderator labels');
  const comparison=c.interaction?'Full model adds the interaction between the first two moderators to the additive model.':'Full model adds the remaining moderators to the model containing the first moderator.';
  if(document.querySelector('[data-comparison-label]')?.textContent!==comparison)failures.push('comparison description');
  return failures;
 }
 function geometry(r,c){
  const failures=[],notes=[];
  if(r.status!=='ok')return {failures,notes};
  const actual=$('plus-plot').querySelector('svg');
  if(!actual)return {failures:['missing plot'],notes};
  host.style.width=$('plus-plot').getBoundingClientRect().width+'px';
  mount.innerHTML=draw(r,c);const reference=mount.querySelector('svg');
  const aa=[actual,...actual.querySelectorAll('*')],bb=[reference,...reference.querySelectorAll('*')];
  if(aa.length!==bb.length)return {failures:['plot structure'],notes};
  const originA=actual.getBoundingClientRect(),originB=reference.getBoundingClientRect();
  const screen=(n,x,y)=>{const m=n.getScreenCTM();if(!m)throw Error('Missing plot transform');return new DOMPoint(x,y).matrixTransform(m);};
  const dots=[...actual.querySelectorAll('[data-role="bubble"]')];
  const uncalibrated=new Set();
  for(const axis of ['x','y']){
   const values=axis==='x'?c.mods.map(r=>r[0]):c.yi;
   const a=values.indexOf(Math.min(...values)),b=values.indexOf(Math.max(...values));
   if(values[a]===values[b])uncalibrated.add(axis);
   else if(dots[a]&&dots[b]){
    const point=i=>screen(dots[i],dots[i].cx.baseVal.value,dots[i].cy.baseVal.value)[axis];
    if(Math.abs(point(a)-point(b))<.02)uncalibrated.add(axis);
   }
  }
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.02;
  // Effective screen bounds and computed CSS capture geometry, font and paint.
  // Reference translation is removed; sizes and every relative location remain.
  aa.forEach((n,i)=>{
   const ref=bb[i];if(n.localName!==ref.localName){failures.push('plot role '+i);return;}
   const a=n.getBoundingClientRect(),b=ref.getBoundingClientRect();
   const uncheckedLabel=n.hasAttribute('data-tick')&&uncalibrated.has(n.getAttribute('data-tick'));
   if(!uncheckedLabel)for(const [av,bv]of [[a.x-originA.x,b.x-originB.x],[a.y-originA.y,b.y-originB.y],[a.width,b.width],[a.height,b.height]])if(!close(av,bv))failures.push('screen geometry '+i);
   const sa=getComputedStyle(n),sb=getComputedStyle(ref);
   // Compare every computed paint property, excluding layout/interaction-only
   // values affected by the deliberately different reference location.
   const ignore=new Set(['cursor','perspective-origin','transform-origin']);
   for(const key of sa){
    if(key.startsWith('--')||ignore.has(key))continue;
    if(sa.getPropertyValue(key)!==sb.getPropertyValue(key))failures.push('paint '+i+' '+key);
   }
   if(n.localName==='text'&&!uncheckedLabel&&n.textContent!==ref.textContent)failures.push('plot text '+i);
   // Bounds alone cannot detect internal curve distortions.
   if(n.localName==='polyline'||n.localName==='polygon'){
    if(n.points.numberOfItems!==ref.points.numberOfItems){failures.push('curve vertices');return;}
    for(let j=0;j<n.points.numberOfItems;j++){
     const p=n.points.getItem(j),q=ref.points.getItem(j),ap=screen(n,p.x,p.y),bp=screen(ref,q.x,q.y);
     if(!close(ap.x-originA.x,bp.x-originB.x)||!close(ap.y-originA.y,bp.y-originB.y))failures.push('curve vertex '+i+'.'+j);
    }
   }
  });
  if(!(originA.width>0&&originA.height>0))failures.push('plot has no area');
  for(let n=actual;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)!==1||s.clipPath!=='none'||s.maskImage!=='none')failures.push('plot ancestor hides or clips paint');}
  if(dots.length!==c.yi.length)failures.push('bubble count');
  // Identify each scale from R-input study marks. No metadata or renderer scale
  // is used to infer the values attached to the on-screen ticks.
  for(const axis of ['x','y']){
   const values=axis==='x'?c.mods.map(r=>r[0]):c.yi;
   let a=0,b=0;for(let i=0;i<values.length;i++){if(values[i]<values[a])a=i;if(values[i]>values[b])b=i;}
   const point=i=>{const n=dots[i];return screen(n,n.cx.baseVal.value,n.cy.baseVal.value)[axis];};
   if(!dots[a]||!dots[b])continue;
   const pa=point(a),pb=point(b),span=values[b]-values[a];
   if(span===0||Math.abs(pb-pa)<.02){notes.push(axis+' axis labels: not checked (marks do not determine the scale)');continue;}
   const ticks=[...actual.querySelectorAll(`[data-axis="${axis}"]`)],labels=[...actual.querySelectorAll(`[data-tick="${axis}"]`)];
   if(ticks.length!==2||labels.length!==2){failures.push(axis+' axis labels');continue;}
   ticks.forEach((tick,i)=>{
    const position=screen(tick,tick.x1.baseVal.value,tick.y1.baseVal.value)[axis],inferred=values[a]+(position-pa)/(pb-pa)*span,label=Number(labels[i].textContent);
    const rounding=inferred===0?0:Math.pow(10,Math.floor(Math.log10(Math.abs(inferred)))-5)/2;
    const arithmetic=64*Number.EPSILON*Math.max(1,Math.abs(values[a]),Math.abs(values[b]),Math.abs(inferred),span*Math.max(Math.abs(pa),Math.abs(pb),Math.abs(position))/Math.abs(pb-pa))*(1+Math.abs((position-pa)/(pb-pa)));
    if(!Number.isFinite(label)||Math.abs(label-inferred)>rounding+arithmetic)failures.push(axis+' calibrated tick '+i);
   });
   notes.push(axis+' axis labels: checked against R-input marks');
  }
  failures.push(...contract.plotValues(actual,r,c,screen));
  return {failures:[...new Set(failures)],notes};
 }
 function renderAudit(r,c){const g=geometry(r,c);return {failures:[...displayed(r,c),...g.failures],notes:g.notes};}
 async function replay(loaded,progress){
  const corpus=loaded[files[0].path],refs=loaded[files[1].path];
  if(!Array.isArray(corpus)||corpus.length!==manifest.configurations||!Array.isArray(refs)||refs.length!==corpus.length||new Set(corpus.map(c=>c.id)).size!==corpus.length)throw Error('Corpus coverage mismatch');
  const snap=UI.snapshot(),locks=[...document.querySelectorAll('#alm-plus input,#alm-plus textarea,#alm-plus button')].filter(n=>!n.closest('#alm-plus-validate')).map(n=>[n,n.disabled]);locks.forEach(([n])=>n.disabled=true);
  let checks=0,passed=0;const failed=[],maxima={},refusals=[];
  const check=(id,row)=>{checks++;if(row.pass)passed++;else failed.push({id,quantity:row.key,...row});if(row.kind!=='exact')maxima[row.key]=Math.max(maxima[row.key]||0,row.diff);};
  try{
   for(let i=0;i<corpus.length;i++){
    const c=corpus[i],ref=refs[i];if(c.id!==ref.id)throw Error('Reference identifier mismatch');
    const result=AlmMetaPlus.compute(c);UI.render(result,c);
    for(const row of contract.audit(result,ref.result))check(c.id,row);
    const render=renderAudit(result,c);
    check(c.id,{key:'render',app:render.failures.length,ref:0,...contract.compare(render.failures.length,0,'render.status'),details:render});
    if(result.status==='refused')refusals.push({id:c.id,reason:result.reason});
    progress(`Extras: ${i+1}/${corpus.length} configurations; ${passed}/${checks} checks passed`);
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{UI.restore(snap);locks.forEach(([n,d])=>n.disabled=d);}
  return {checks,passed,failed,maxima,refusals,summaryLines:['ML corpus with metafor '+manifest.versions.metafor+'. Numerical and visible-output checks are separate.','Each fit is recomputed from source rows. Refusals and labels compare exactly.','Plot coordinates, effective screen geometry and computed style compare with a clean same-browser reference. Axis labels are not checked when marks do not identify the scale.']};
 }
 function liveScript(s){
  const c=s.input,vec=a=>'c('+a.join(',')+')';
  // The embedded R function is generated verbatim from reference.R by pin-plus.mjs.
  return manifest.referenceR+`\nc <- list(yi=${vec(c.yi)},vi=${vec(c.vi)},mods=list(${c.mods.map(vec).join(',')}),names=c(${c.names.map(n=>JSON.stringify(n)).join(',')}),interaction=${c.interaction?'TRUE':'FALSE'})
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\\n',sep='')\n`;
 }
 const live={packages:['metafor'],paperVersions:{metafor:manifest.versions.metafor},compare:{tolerance:{default:1e-6},kind:{}},currentState(){
  const input=UI.parse($('plus-data').value,$('plus-interaction').checked),result=AlmMetaPlus.compute(input);UI.render(result,input);
  const failures=renderAudit(result,input).failures;if(failures.length)throw Error('Displayed output contract failed: '+failures.join(', '));
  const flat=contract.flatten(result),values=Object.entries(flat).map(([key,value])=>({key,value,label:key}));
  for(const {key,value}of values){const r=contract.rule(key,value);live.compare.kind[key]=r.kind;live.compare.tolerance[key]=r.tol;}
  return {input,values,note:'ML, identical study rows for both models; normal-theory inference. Desktop reference metafor '+manifest.versions.metafor+'; live webR metafor version is reported separately.'};
 },appValues:s=>s.values,buildScript:liveScript};
 const adapter={app:'meta-regression-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Extras reference and scope',runUrl:'validate/README-plus.md'},live,corpus:{files,run:replay}};
 window.AlmMetaPlusValidationAdapter=adapter;
 window.AlmMetaPlusValidation=AlmValidate.mount($('alm-plus-validate'),adapter);
 $('alm-plus-validate').querySelector('h2').textContent='Validate the extras in R';
 window.AlmMetaPlusDisplay=Object.freeze({displayed,geometry,renderAudit});
})();
