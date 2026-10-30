(function(){
  'use strict';
  const api=window.AlmMultilevelPlus,pins=window.AlmMultilevelPlusPins;
  const sourcePath='validate/plus-corpus/corpus-plus.json',refPath='validate/plus-corpus/reference-plus.json';
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
  // Independent axis-label oracle (v1.7 tick-step rule, as limit-ma and gosh).
  // Each axis scale is calibrated by least squares from the plotted marks, whose
  // values are R-validated (audit gates every mark against R). A label is checked
  // only when the marks span at least 20% of the labelled axis length and the
  // affine residual is at most 1e-7 CSS px; it fails when more than half the
  // median tick step from its inferred value. Coarse labels are "not checked".
  let axisLabels=[];
  const axisSummary=rows=>['Axis labels: '+rows.filter(r=>r.checked).length+' checked; '+rows.filter(r=>!r.checked).length+' not checked.',...rows.filter(r=>!r.checked).map(r=>(r.id?r.id+' ':'')+r.axis+': '+r.message)];
  function calibratedTicks(samples,ticks,name){
    const row={axis:name,checked:false,message:'axis labels: not checked (scale not determined by validated marks)'};
    const fail=message=>{row.failure=name+' calibrated axis '+message;return row;};
    const length=Math.abs(ticks[1]?.position-ticks[0]?.position);
    if(samples.length<2||samples.some(p=>!p.every(Number.isFinite))||!Number.isFinite(length)||length===0)return row;
    const values=samples.map(p=>p[0]),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo;
    const positions=samples.map(p=>p[1]);
    row.coverage=(Math.max(...positions)-Math.min(...positions))/length;
    if(span===0||row.coverage<.2)return row;
    const sum=xs=>{let s=0,c=0;for(const x of xs){const t=s+x;c+=Math.abs(s)>=Math.abs(x)?(s-t)+x:(x-t)+s;s=t;}return s+c;};
    const z=values.map(v=>(v-lo)/span),zm=sum(z)/z.length;
    const pm=sum(positions)/samples.length,variance=sum(z.map(v=>(v-zm)**2));
    const slope=sum(z.map((v,i)=>(v-zm)*(positions[i]-pm)))/variance,intercept=pm-slope*zm;
    row.residual=Math.max(...samples.map((p,i)=>Math.abs(p[1]-(intercept+slope*z[i]))));
    if(!Number.isFinite(slope)||slope===0||!Number.isFinite(row.residual)||row.residual>1e-7)return row;
    row.checked=true;row.message='axis labels: checked';
    const labels=ticks.map(t=>Number(t.text));
    if(ticks.length<2||ticks.some(t=>!t.text.trim()||!Number.isFinite(t.position))||!labels.every(Number.isFinite))return fail('tick coverage');
    const inferred=ticks.map(t=>lo+span*(t.position-intercept)/slope);
    if(!inferred.every(Number.isFinite))return fail('invalid inferred endpoints');
    const ordered=ticks.map((t,i)=>({position:t.position,value:inferred[i],label:labels[i]})).sort((a,b)=>a.position-b.position);
    const spacings=ordered.slice(1).map((t,i)=>Math.abs(t.value-ordered[i].value)).sort((a,b)=>a-b);
    const middle=Math.floor(spacings.length/2);
    const step=spacings.length%2?spacings[middle]:spacings[middle-1]/2+spacings[middle]/2;
    if(!Number.isFinite(step)||step<=0)return fail('invalid inferred tick step');
    row.step=step;
    // Shown resolution is only an eligibility gate, never an error allowance.
    let units;
    try{units=ticks.map(t=>{const match=t.text.trim().match(/^[+-]?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);if(!match)throw 0;return 10**(Number(match[3]||0)-(match[2]||'').length);});}
    catch{return fail('invalid numeric label');}
    if(ordered.slice(1).some((t,i)=>t.label===ordered[i].label)||units.some(unit=>unit>step/2)){
      row.checked=false;row.message='axis labels: not checked (labels coarser than tick spacing)';return row;
    }
    for(let i=0;i<labels.length;i++)if(Math.abs(labels[i]-inferred[i])>step/2)return fail('label does not match mark scale');
    return row;
  }
  // Tick positions are the label anchors: the text x for horizontal-axis labels,
  // the text baseline y for vertical-axis labels. Only two endpoint ticks exist.
  function axisOracle(svg,p){
    if(!svg)return ['x','y'].map(axis=>({axis,checked:false,message:'axis labels: not checked (plot not rendered)',failure:axis+' plot not rendered'}));
    const screen=(n,x,y)=>{const m=n.getScreenCTM();return m?new DOMPoint(x,y).matrixTransform(m):{x:NaN,y:NaN};};
    const attr=(n,k)=>Number(n.getAttribute(k));
    const marks=[...svg.querySelectorAll('circle')].map(n=>screen(n,attr(n,'cx'),attr(n,'cy')));
    return ['x','y'].map(axis=>{
      const values=axis==='x'?p.x:p.ll;
      const samples=marks.length===values.length?values.map((v,i)=>[v,marks[i][axis]]):[];
      const ticks=[...svg.querySelectorAll(`[data-plus-tick-label="${axis}"]`)].map(n=>({text:n.textContent,position:screen(n,attr(n,'x'),attr(n,'y'))[axis]}));
      return calibratedTicks(samples,ticks,axis);
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
        const oracle=axisOracle(current[j],r.profiles[j]).map(row=>({...row,axis:'plot '+j+' '+row.axis}));axisLabels.push(...oracle);
        const labels=count&&actual.every((v,i)=>v&&v.text===expected[i].text)&&oracle.every(row=>!row.failure);
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
      out.push({quantity:'display.'+key,pass:c.length===1&&c[0].textContent===String(av[key])&&c[0].previousElementSibling?.textContent===api.label(key)&&numerical(Number(c[0].textContent),value,key).pass});
    }
    let exported;try{exported=JSON.parse(api.exportText());}catch{}
    const keys=(obj,expected)=>obj&&typeof obj==='object'&&JSON.stringify(Object.keys(obj).sort())===JSON.stringify(expected.slice().sort());
    out.push({quantity:'export.schema',pass:!!exported&&keys(exported,['model','inference','status','rows','clusters','robust','logLik','profiles'])&&exported.model==='Three-level REML; diagonal sampling V'&&exported.inference==='CR2; Satterthwaite; 95% confidence'&&exported.status==='ok'&&keys(exported.robust,['estimate','se','df','t','p','lower','upper'])&&Array.isArray(exported.profiles)&&exported.profiles.length===2&&exported.profiles.every(p=>keys(p,['estimate','lower','upper','x','ll'])&&Array.isArray(p.x)&&p.x.length===9&&Array.isArray(p.ll)&&p.ll.length===9)});
    let ev={};try{ev=api.quantities(exported);}catch{}
    for(const [key,value] of Object.entries(rv))out.push({quantity:'export.'+key,pass:numerical(ev[key],value,key).pass});
    // Every scale mark above must match R. Use those checked app marks for the
    // clean render, avoiding false failures at decimal tick-rounding boundaries.
    const marksOK=Object.keys(rv).filter(k=>/^profile\.[01]\.(x|ll)\./.test(k)).every(k=>numerical(av[k],rv[k],k).pass);
    out.push(...(await plotChecks(a)).map(c=>({...c,pass:c.pass&&marksOK})));return out;
  }
  const refusalCases=[
    {text:'A,1,0.1',reason:'Need at least three valid effect rows'},
    {text:'A,1,0.1\nA,2,0.1\nA,3,0.1',reason:'Need at least two clusters'},
    {text:'A,1,0.1\nB,2,0.1\nC,3,0.1',reason:'Variance components are not identifiable without repeated effects'},
    {text:'A,1,0\nA,2,0.1\nB,3,0.1',reason:'Need finite effects, positive variances and cluster labels'}
  ];
  function refusalChecks(reason,expected){return [
    {quantity:'reason',pass:reason===expected},
    {quantity:'display',pass:document.querySelector('#alm-plus-output [data-refusal]')?.textContent===expected},
    {quantity:'export',pass:(()=>{try{api.exportText();return false;}catch{return true;}})()}
  ];}
  async function replay(files,progress){
    const corpus=files[sourcePath],refs=files[refPath],names=Object.keys(corpus);
    if(names.length!==44||Object.keys(refs).length!==44||names.some(n=>refs[n]?.status!=='ok'))throw Error('Incomplete plus reference corpus');
    const original=api.capture(),input=document.getElementById('src'),text=input.value;
    let checks=0,passed=0;const failed=[],axisCoverage=[];
    function record(id,rows){for(const row of rows){checks++;if(row.pass)passed++;else failed.push({id,...row});}}
    try {
      for(const [i,id] of names.entries()){
        const clusters=[...new Set(corpus[id].map(r=>r.cluster))];
        input.value=corpus[id].map(r=>[clusters.indexOf(r.cluster),r.y,Math.sqrt(r.v)].join(',')).join('\n');
        const a=api.calculate();axisLabels=[];record(id,await audit(a,refs[id]));axisCoverage.push(...axisLabels.map(row=>({...row,id})));
        progress(`Extras: ${i+1}/44 configurations; ${passed}/${checks} passed`);await new Promise(r=>setTimeout(r,0));
      }
      for(const [i,c] of refusalCases.entries()){
        input.value=c.text;let reason='';try{api.calculate();}catch(e){reason=e.message;}
        record('refusal.'+i,refusalChecks(reason,c.reason));
      }
    } finally {input.value=text;api.restore(original);}
    return {checks,passed,failed,maxima:{},axisCoverage,refusals:refusalCases.map(x=>x.reason),summaryLines:[...axisSummary(axisCoverage),'44 configurations. Numerical values, displayed cells, JSON exports, two profile plots and four refusals. CR2 references: clubSandwich 0.7.0; profiles: metafor 5.2-1.','Iterative tolerance 1e-6 relative to max(1,|R|); p-values 1e-9 absolute. Counts, labels and refusals exact. Plot geometry: 0.05 CSS px versus a clean same-browser render; painted styles exact.','Axis labels: endpoint labels checked against the scale calibrated from R-validated marks; a label more than half a tick step from its inferred value fails. Coarse or uncalibrated axes are reported not checked.']};
  }
  const adapter={app:'multilevel-ma-plus',paper:{checks:pins.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Extras R reproduction instructions',runUrl:'validate/README-plus.md'},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState:()=>{const rows=api.rows(),result=api.calculate();return {rows,result,note:'Live webR checks variance profiles and REML log-likelihood only. CR2 is checked against pinned native clubSandwich references in the full extras replay.'};},buildScript,
      appValues:s=>liveKeys(s.result).map(key=>({key,label:api.label(key),value:api.quantities(s.result)[key]})),compare:{tolerance:{default:1e-6},kind:Object.fromEntries(['logLik',...Array.from({length:2},(_,j)=>['estimate','lower','upper',...Array.from({length:9},(_,i)=>['x.'+i,'ll.'+i]).flat()].map(k=>`profile.${j}.${k}`)).flat()].map(k=>[k,'rel']))}},
    corpus:{files:pins.files,run:(files,progress)=>alm.urlState.withoutWrites(()=>replay(files,progress))}};
  window.AlmMultilevelPlusValidationAdapter=adapter;
  window.AlmMultilevelPlusAudit={audit,plotChecks,snapshot,axisOracle,refusalCases,refusalChecks};
  window.AlmMultilevelPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
  document.querySelector('#alm-plus-validate h2').textContent='Validate the extras in R';
  // Distinct accessible names: the original panel's buttons keep theirs (as gosh).
  for(const button of document.querySelectorAll('#alm-plus-validate button')){if(button.textContent==='Re-run full validation')button.textContent='Re-run extras validation';if(button.textContent==='Validate this analysis in R')button.textContent='Validate the extras in R';}
})();
