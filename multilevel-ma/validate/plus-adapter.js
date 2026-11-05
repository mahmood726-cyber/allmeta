(function(){
  'use strict';
  const api=window.AlmMultilevelPlus,pins=window.AlmMultilevelPlusPins;
  const sourcePath='validate/plus-corpus/corpus-plus.json',refPath='validate/plus-corpus/reference-plus.json';
  // The few-cluster regime corpus: two- and three-cluster designs and one double-boundary design
  // metafor's default optimiser refuses. The metadat corpus has at least four clusters, so this is
  // the only part of the replay that reaches the regime where confint.rma.mv's search bound bites.
  const regimeSourcePath='validate/plus-corpus/regime-corpus-plus.json',regimeRefPath='validate/plus-corpus/regime-reference-plus.json';
  const numerical=(a,r,key)=>AlmValidate.compare(a,r,key==='robust.p'?'abs':'rel',key==='rows'||key==='clusters'?0:key==='robust.p'?1e-9:1e-6);
  const liveKeys=r=>Object.keys(api.quantities(r)).filter(k=>k==='logLik'||k.startsWith('profile.'));
  function buildScript(s){
    const clusters=[...new Set(s.rows.map(r=>r.cluster))],v=f=>'c('+s.rows.map(f).join(',')+')';
    return `print(.libPaths())
cat('metafor ',as.character(packageVersion('metafor')),'\\n')
d <- data.frame(y=${v(r=>r.y)},v=${v(r=>r.v)},cluster=${v(r=>clusters.indexOf(r.cluster)+1)},id=seq_len(${s.rows.length}))
f <- metafor::rma.mv(y,v,random=~1|cluster/id,data=d,method='REML',control=list(rel.tol=1e-10))
ans <- c(logLik=as.numeric(logLik(f)))
for(j in 1:2) {
 ci <- confint(f,sigma2=j,control=list(tol=1e-8,maxiter=1000))$random[1,]
 grid <- seq(0,max(ci[3],f$sigma2[j]*1.5,1e-8),length.out=9)
 pr <- profile(f,sigma2=j,steps=grid,plot=FALSE,progbar=FALSE)
 values <- c(f$sigma2[j],ci[2],ci[3],as.vector(rbind(grid,pr$ll)))
 keys <- c('estimate','lower','upper',as.vector(rbind(paste0('x.',0:8),paste0('ll.',0:8))))
 names(values) <- paste0('profile.',j-1,'.',keys)
 ans <- c(ans,values)
}
stopifnot(all(is.finite(ans)))
cat('ALMJSON:{',paste(sprintf('"%s":%.17g',names(ans),ans),collapse=','),'}\\n',sep='')`;
  }
  function snapshot(svg){
    if(!svg)return null;
    const rect=svg.getBoundingClientRect();
    if(!(rect.width>0&&rect.height>0)||!svg.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
    return [svg,...svg.children].map(el=>{
      const css=getComputedStyle(el),m=el.getScreenCTM();
      if(!m)return null;
      const pt=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(m);return [p.x-rect.x,p.y-rect.y];};
      let geometry=[];
      if(el===svg)geometry=[0,0,rect.width,rect.height];
      else if(typeof el.getTotalLength==='function'){
        const len=el.getTotalLength();for(let i=0;i<=24;i++){const p=el.getPointAtLength(len*i/24);geometry.push(...pt(p.x,p.y));}
      } else {const b=el.getBBox();geometry=[...pt(b.x,b.y),...pt(b.x+b.width,b.y+b.height)];}
      let opacity=1;const effects=[];
      for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);opacity*=Number(s.opacity);for(const k of ['filter','clipPath','maskImage','mixBlendMode'])if(s[k]&&s[k]!=='none'&&s[k]!=='normal')effects.push([k,s[k]]);}
      return {tag:el.tagName,text:el===svg?'':el.textContent,geometry,style:['fill','stroke','strokeWidth','fillOpacity','strokeOpacity','visibility','display','fontSize','fontFamily','fontWeight','strokeDasharray','strokeLinecap','strokeLinejoin','vectorEffect',...(el===svg?['backgroundColor']:[])].map(k=>css[k]),opacity,effects};
    });
  }
  async function plotChecks(r){
    const host=document.createElement('div');host.setAttribute('aria-hidden','true');
    const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
    style.textContent=':host{all:initial!important;position:fixed!important;left:-20000px!important;top:0!important;width:620px!important;display:block!important;opacity:1!important;visibility:visible!important;pointer-events:none!important}';shadow.append(style);
    document.body.append(host);
    try {
      const doc=document;
      const current=[...document.querySelectorAll('#alm-plus-output svg')],out=[];
      for(let j=0;j<2;j++){
        const ref=api.plot(doc,r.profiles[j],j);
        // Match the actual layout width, while retaining a separate CSS environment.
        ref.style.width=(current[j]?.getBoundingClientRect().width||600)+'px';ref.style.maxWidth='none';shadow.append(ref);
        const actual=snapshot(current[j]),expected=snapshot(ref);
        const count=!!actual&&!!expected&&actual.length===expected.length;
        const geometry=count&&actual.every((v,i)=>v&&v.tag===expected[i].tag&&v.geometry.length===expected[i].geometry.length&&v.geometry.every((x,k)=>Math.abs(x-expected[i].geometry[k])<=.05));
        const painted=count&&actual.every((v,i)=>v&&JSON.stringify(v.style)===JSON.stringify(expected[i].style)&&v.opacity===expected[i].opacity&&JSON.stringify(v.effects)===JSON.stringify(expected[i].effects));
        // The scales are determined entirely by R-validated x/ll marks.
        const labels=count&&actual.every((v,i)=>v&&v.text===expected[i].text);
        out.push({quantity:`plot.${j}.geometry`,pass:geometry},{quantity:`plot.${j}.paint`,pass:painted},{quantity:`plot.${j}.labels`,pass:labels});
      }
      return out;
    } finally {host.remove();}
  }
  async function audit(a,r){
    const out=[],av=api.quantities(a),rv=api.quantities(r);
    for(const [key,value] of Object.entries(rv))out.push({quantity:key,app:av[key],ref:value,...numerical(av[key],value,key)});
    const cells=[...document.querySelectorAll('#alm-plus-output [data-quantity]')];
    const output=document.getElementById('alm-plus-output'),container=document.getElementById('alm-plus');
    const schema=container.firstElementChild?.textContent==='Cluster-robust inference and variance profiles'&&
      container.children[1]?.textContent==='Intercept-only three-level REML with diagonal sampling variances. CR2 uses study clusters and Satterthwaite degrees of freedom. Variance intervals are 95% profile-likelihood intervals. These extras fit the current input separately.'&&
      output.querySelector('h3')?.textContent==='CR2 cluster-robust inference'&&
      JSON.stringify([...output.querySelectorAll('figcaption')].map(n=>n.textContent))===JSON.stringify(['Between-study variance','Within-study variance'].map(n=>n+': the other component is re-estimated at each point. The interval uses the profile likelihood-ratio cutoff.'))&&
      output.querySelector('summary')?.textContent==='Profile coordinates'&&document.getElementById('alm-plus-status').textContent==='Extras calculated.';
    out.push({quantity:'display.schema',pass:schema});
    out.push({quantity:'display.count',pass:cells.length===Object.keys(rv).length});
    for(const [key,value] of Object.entries(rv)){
      const c=cells.filter(el=>el.dataset.quantity===key);
      // An unavailable quantity is displayed as text, so read the cell back as null in that
      // case: the displayed text and the reference must then both say not estimable.
      const text=c.length===1?c[0].textContent:null,parsed=text===api.notEstimable?null:Number(text);
      out.push({quantity:'display.'+key,pass:c.length===1&&text===api.display(av[key])&&c[0].previousElementSibling?.textContent===api.label(key)&&numerical(parsed,value,key).pass});
    }
    let exported;try{exported=JSON.parse(api.exportText());}catch{}
    const keys=(obj,expected)=>obj&&typeof obj==='object'&&JSON.stringify(Object.keys(obj).sort())===JSON.stringify(expected.slice().sort());
    const build=window.AlmBuildInfo||null;
    const provenance=build===null?exported?.producedBy===null:!!keys(exported?.producedBy,Object.keys(build))&&Object.keys(build).every(key=>exported.producedBy[key]===build[key]);
    out.push({quantity:'export.schema',pass:!!exported&&keys(exported,['model','inference','status','rows','clusters','robust','logLik','profiles','producedBy'])&&provenance&&exported.model==='Three-level REML; diagonal sampling V'&&exported.inference==='CR2; Satterthwaite; 95% confidence'&&exported.status==='ok'&&keys(exported.robust,['estimate','se','df','t','p','lower','upper'])&&Array.isArray(exported.profiles)&&exported.profiles.length===2&&exported.profiles.every(p=>keys(p,['estimate','lower','upper','x','ll'])&&Array.isArray(p.x)&&p.x.length===9&&Array.isArray(p.ll)&&p.ll.length===9)});
    let ev={};try{ev=api.quantities(exported);}catch{}
    for(const [key,value] of Object.entries(rv))out.push({quantity:'export.'+key,pass:numerical(ev[key],value,key).pass});
    // Every scale mark above must match R. Use those checked app marks for the
    // clean render, avoiding false failures at decimal tick-rounding boundaries.
    const marksOK=Object.keys(rv).filter(k=>/^profile\.[01]\.(x|ll)\./.test(k)).every(k=>numerical(av[k],rv[k],k).pass);
    out.push(...(await plotChecks(a)).map(c=>({...c,pass:c.pass&&marksOK})));return out;
  }
  const rowRefusal='Row 1: need a study label, a finite effect and a positive standard error';
  const refusalCases=[
    {text:'A,1,0.1',reason:'Need at least three valid effect rows'},
    {text:'A,1,0.1\nA,2,0.1\nA,3,0.1',reason:'Need at least two clusters'},
    {text:'A,1,0.1\nB,2,0.1\nC,3,0.1',reason:'Variance components are not identifiable without repeated effects'},
    {text:'A,1,0\nA,2,0.1\nB,3,0.1',reason:rowRefusal},
    // Decimal and exponent forms only: Number() also reads radix literals, so '0x1F' would
    // otherwise be analysed as 31 instead of refused.
    {text:'A,0x1F,0.1\nA,2,0.1\nB,3,0.1',reason:rowRefusal},
    {text:'A,0b101,0.1\nA,2,0.1\nB,3,0.1',reason:rowRefusal},
    {text:'A,1,0o17\nA,2,0.1\nB,3,0.1',reason:rowRefusal},
    {text:'A,Infinity,0.1\nA,2,0.1\nB,3,0.1',reason:rowRefusal}
  ];
  function refusalChecks(reason,expected){return [
    {quantity:'reason',pass:reason===expected},
    {quantity:'display',pass:document.querySelector('#alm-plus-output [data-refusal]')?.textContent===expected},
    {quantity:'export',pass:(()=>{try{api.exportText();return false;}catch{return true;}})()}
  ];}
  async function replay(files,progress){
    const entries=[];
    for(const [sp,rp,count] of [[sourcePath,refPath,44],[regimeSourcePath,regimeRefPath,21]]){
      const corpus=files[sp],refs=files[rp],names=Object.keys(corpus);
      if(names.length!==count||Object.keys(refs).length!==count||names.some(n=>refs[n]?.status!=='ok'))throw Error('Incomplete plus reference corpus');
      for(const id of names)entries.push([id,corpus[id],refs[id]]);
    }
    const original=api.capture(),input=document.getElementById('src'),text=input.value;
    let checks=0,passed=0;const failed=[];
    function record(id,rows){for(const row of rows){checks++;if(row.pass)passed++;else failed.push({id,...row});}}
    try {
      for(const [i,[id,rows,ref]] of entries.entries()){
        const clusters=[...new Set(rows.map(r=>r.cluster))];
        input.value=rows.map(r=>[clusters.indexOf(r.cluster),r.y,Math.sqrt(r.v)].join(',')).join('\n');
        const a=api.calculate();record(id,await audit(a,ref));
        progress(`Extras: ${i+1}/${entries.length} configurations; ${passed}/${checks} passed`);await new Promise(r=>setTimeout(r,0));
      }
      for(const [i,c] of refusalCases.entries()){
        input.value=c.text;let reason='';try{api.calculate();}catch(e){reason=e.message;}
        record('refusal.'+i,refusalChecks(reason,c.reason));
      }
    } finally {input.value=text;api.restore(original);}
    return {checks,passed,failed,maxima:{},refusals:refusalCases.map(x=>x.reason),summaryLines:['65 configurations: 44 from metadat and 21 few-cluster regime designs. Numerical values, displayed cells, JSON exports, two profile plots and eight refusals. CR2 references: clubSandwich 0.7.0; profiles: metafor 5.2-1 with its upper search bound widened until each limit is interior.','Iterative tolerance 1e-6 relative to max(1,|R|); p-values 1e-9 absolute. Counts, labels and refusals exact. Plot geometry: 0.05 CSS px versus a clean same-browser render; painted styles exact.']};
  }
  const adapter={app:'multilevel-ma-plus',paper:{checks:pins.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Extras R reproduction instructions',runUrl:'validate/README-plus.md'},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState:()=>{const rows=api.rows(),result=api.calculate();return {rows,result,note:'Live webR checks variance profiles and REML log-likelihood only. CR2 is checked against pinned native clubSandwich references in the full extras replay.'};},buildScript,
      appValues:s=>liveKeys(s.result).map(key=>({key,label:api.label(key),value:api.quantities(s.result)[key]})),compare:{tolerance:{default:1e-6},kind:Object.fromEntries(['logLik',...Array.from({length:2},(_,j)=>['estimate','lower','upper',...Array.from({length:9},(_,i)=>['x.'+i,'ll.'+i]).flat()].map(k=>`profile.${j}.${k}`)).flat()].map(k=>[k,'rel']))}},
    corpus:{files:pins.files,run:(files,progress)=>alm.urlState.withoutWrites(()=>replay(files,progress))}};
  window.AlmMultilevelPlusValidationAdapter=adapter;
  window.AlmMultilevelPlusAudit={audit,plotChecks,snapshot,refusalCases,refusalChecks};
  window.AlmMultilevelPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
  document.querySelector('#alm-plus-validate h2').textContent='Validate the extras in R';
  // Distinct accessible names from the original panel's buttons (same pattern as limit-ma).
  const rename={'Validate this analysis in R':'Validate the current extras in R (live profiles)','Replay published corpus (stored references)':'Replay the extras corpus (stored references)'};
  document.querySelectorAll('#alm-plus-validate button').forEach(b=>{if(rename[b.textContent])b.textContent=rename[b.textContent];});
})();
