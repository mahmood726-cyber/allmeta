/* IPD diagnostic rendering, 2026-10-12. No estimator replacements.
 * Baujat coordinates follow metafor::baujat.rma (squared Pearson residual,
 * squared change divided by the omitted-model coefficient variance).
 * Net Heat is computed by real netmeta in WebR, not a generic heat map.
 */
(function () {
  'use strict';
  const version = '2026-10-12.1';
  const methods = { FE: 'fixedEffect', DL: 'randomEffectsDL', REML: 'randomEffectsREML',
    PM: 'randomEffectsPM', SJ: 'randomEffectsSJ', HE: 'randomEffectsHE', ML: 'randomEffectsML' };
  let cache = null, frame = null, runtimePromise = null, netImage = null, netKey = '', netBusy = false;
  const finite = Number.isFinite;
  const clone = x => JSON.parse(JSON.stringify(x));
  const settings = () => ({ ...APP.config, ...(APP.analysisSettings || {}) });
  const ratioScale = s => s.outcomeType === 'survival' || (s.outcomeType === 'binary' && s.effectMeasure !== 'RD');
  function fit(studies, s) {
    const fn = methods[s.reMethod || 'REML'];
    if (!fn || typeof MetaAnalysis[fn] !== 'function') throw new Error('Unsupported estimator: ' + s.reMethod);
    const y = studies.map(x => x.effect), v = studies.map(x => x.variance);
    let r = MetaAnalysis[fn](y, v);
    if (s.useHKSJ) r = MetaAnalysis.applyHKSJ(r, y, v);
    const se = s.useHKSJ ? r.seHKSJ : r.se;
    const level = finite(s.confLevel) && s.confLevel > 0 && s.confLevel < 1 ? s.confLevel : 0.95;
    const critical = s.useHKSJ ? Stats.tQuantile(1 - (1 - level) / 2, studies.length - 1)
      : Stats.normalQuantile(1 - (1 - level) / 2);
    if (![r.pooled, se, critical].every(finite) || se <= 0) throw new Error('The omitted-study model could not be estimated.');
    return { estimate: r.pooled, se, variance: se * se, lower: r.pooled - critical * se,
      upper: r.pooled + critical * se, tau2: r.tau2 || 0, I2: r.I2 || 0 };
  }
  function computeDiagnostics(results, s) {
    if (!results || !Array.isArray(results.studies) || !results.pooled) throw new Error('Run a two-stage analysis to calculate study diagnostics.');
    const studies = results.studies;
    if (studies.length < 3) throw new Error('At least three studies are needed so every omitted-study fit retains two studies.');
    if (studies.some(x => !finite(x.effect) || !finite(x.variance) || x.variance <= 0)) throw new Error('Study effects and positive variances are required; invalid studies are not silently replaced.');
    const full = fit(studies, s);
    if (!finite(results.pooled.pooled) || Math.abs(full.estimate - results.pooled.pooled) > 1e-7 * Math.max(1, Math.abs(full.estimate))) {
      throw new Error('Saved results and estimator settings do not match. Rerun the analysis before calculating diagnostics.');
    }
    const tau2 = full.tau2;
    const totalW = studies.reduce((a, x) => a + 1 / (x.variance + tau2), 0);
    const rows = studies.map((study, i) => {
      const omitted = fit(studies.filter((_, j) => j !== i), s);
      const change = omitted.estimate - full.estimate;
      return { study: String(study.study ?? study.name ?? ('Study ' + (i + 1))), index: i + 1,
        omitted, change, pearsonSquared: (study.effect - full.estimate) ** 2 / (study.variance + tau2),
        influence: change ** 2 / omitted.variance, standardisedChange: change / omitted.se,
        weight: (1 / (study.variance + tau2)) / totalW };
    });
    return { rows, full, settings: clone(s), ratio: ratioScale(s), method: s.reMethod || 'REML' };
  }
  function theme() {
    const css = getComputedStyle(document.body);
    return { bg: css.getPropertyValue('--bg-secondary').trim() || '#111827',
      text: css.getPropertyValue('--text-primary').trim() || '#f9fafb',
      muted: css.getPropertyValue('--text-muted').trim() || '#9ca3af',
      accent: css.getPropertyValue('--accent-primary').trim() || '#6366f1' };
  }
  function surface(id, height) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const width = canvas.parentElement.getBoundingClientRect().width;
    if (width <= 0) return null;
    canvas.hidden = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.cssText = `display:block;width:100%;height:${height}px;max-width:100%`;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = theme(); ctx.fillStyle = t.bg; ctx.fillRect(0, 0, width, height);
    ctx.font = '12px system-ui'; ctx.fillStyle = t.text; ctx.strokeStyle = t.muted;
    return { canvas, ctx, width, height, t };
  }
  function status(id, text) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    let p = document.getElementById(id + 'Status');
    if (!p) { p = document.createElement('p'); p.id = id + 'Status'; p.setAttribute('role', 'status'); p.style.cssText = 'font-size:.85rem;padding:.5rem;line-height:1.5'; canvas.parentElement.appendChild(p); }
    p.textContent = text;
  }
  function unavailable(id, message) {
    const canvas = document.getElementById(id);
    if (canvas) { canvas.hidden = true; canvas.style.display = 'none'; canvas.dataset.plotState = 'unavailable'; delete canvas.dataset.rows; }
    status(id, message);
  }
  function nfmt(x) { return Math.abs(x) >= 1000 || (Math.abs(x) > 0 && Math.abs(x) < 0.001) ? x.toExponential(2) : x.toFixed(3); }
  function drawBaujat(d) {
    const p = surface('baujatPlot', 340); if (!p) return;
    const { ctx, width: w, height: h, t, canvas } = p;
    const left = 62, right = 20, top = 26, bottom = 65;
    const maxX = Math.max(...d.rows.map(x => x.pearsonSquared), 1e-6) * 1.15;
    const maxY = Math.max(...d.rows.map(x => x.influence), 1e-6) * 1.15;
    const x = v => left + v / maxX * (w - left - right), y = v => h - bottom - v / maxY * (h - top - bottom);
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, h-bottom); ctx.lineTo(w-right, h-bottom); ctx.stroke();
    for (let i=0; i<=4; i++) { ctx.fillStyle=t.muted; ctx.textAlign='center'; ctx.fillText(nfmt(maxX*i/4),x(maxX*i/4),h-bottom+20); ctx.textAlign='right';ctx.fillText(nfmt(maxY*i/4),left-6,y(maxY*i/4)+4); }
    d.rows.forEach(r => {ctx.fillStyle=t.accent;ctx.beginPath();ctx.arc(x(r.pearsonSquared),y(r.influence),4,0,Math.PI*2);ctx.fill();ctx.fillStyle=t.text;ctx.textAlign='left';ctx.fillText(String(r.index),x(r.pearsonSquared)+6,y(r.influence)-5);});
    ctx.textAlign='center';ctx.fillStyle=t.text;ctx.fillText(d.method==='FE'?'Contribution to Q':'Squared Pearson residual',w/2,h-14);
    ctx.save();ctx.translate(14,h/2);ctx.rotate(-Math.PI/2);ctx.fillText('Influence on pooled estimate',0,0);ctx.restore();
    canvas.dataset.plotState='ready'; canvas.dataset.rows=String(d.rows.length);
    status('baujatPlot', `${d.method}${d.settings.useHKSJ ? ' + modified HKSJ' : ''}. Labels are study numbers in the table. Both coordinates use the actual study effects and refitted omitted-study models.`);
  }
  function drawLOO(d) {
    const p = surface('looPlot', Math.max(330, 78+d.rows.length*30)); if (!p) return;
    const {ctx,width:w,height:h,t,canvas}=p;
    const left=Math.min(150,w*.34),right=20,top=25,bottom=55;
    let lo=Math.min(d.full.lower,...d.rows.map(r=>r.omitted.lower)), hi=Math.max(d.full.upper,...d.rows.map(r=>r.omitted.upper));
    const span=Math.max(hi-lo,1e-6);lo-=span*.08;hi+=span*.08;
    const x=v=>left+(v-lo)/(hi-lo)*(w-left-right);
    ctx.strokeStyle=t.muted;ctx.beginPath();ctx.moveTo(left,h-bottom);ctx.lineTo(w-right,h-bottom);ctx.stroke();
    ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x(d.full.estimate),top);ctx.lineTo(x(d.full.estimate),h-bottom);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;ctx.textAlign='center';ctx.fillStyle=t.muted;ctx.fillText(nfmt(d.ratio?Math.exp(v):v),x(v),h-bottom+22);}
    d.rows.forEach((r,i)=>{const y=top+(i+.5)*(h-bottom-top)/d.rows.length;ctx.strokeStyle=t.accent;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(r.omitted.lower),y);ctx.lineTo(x(r.omitted.upper),y);ctx.stroke();ctx.fillStyle=t.accent;ctx.beginPath();ctx.arc(x(r.omitted.estimate),y,4,0,Math.PI*2);ctx.fill();ctx.textAlign='right';ctx.fillStyle=t.text;const label=`${r.index}. ${r.study}`;ctx.fillText(label.length>21?label.slice(0,18)+'…':label,left-8,y+4);});
    ctx.textAlign='center';ctx.fillStyle=t.text;ctx.fillText(`${d.settings.effectMeasure || 'Effect'}${d.ratio?' (log-spaced axis)':''}`,w/2,h-10);
    canvas.dataset.plotState='ready';canvas.dataset.rows=String(d.rows.length);
    status('looPlot', `Omit one study at a time; ${(100*(d.settings.confLevel || .95)).toFixed(0)}% intervals use the saved ${d.method}${d.settings.useHKSJ?' + modified HKSJ':''} settings. Dashed line: full-analysis estimate.`);
  }
  function drawTable(d) {
    const body=document.getElementById('influenceTableBody');if(!body)return;
    const headers=['Study','Omitted effect (CI)','Change (model scale)','Baujat influence','Change / omitted SE','Weight share','|Change / SE| > 2?'];
    document.querySelectorAll('#influenceTable thead th').forEach((th,i)=>{if(headers[i])th.textContent=headers[i];});
    body.replaceChildren();
    d.rows.forEach(r=>{const tr=document.createElement('tr');const disp=x=>nfmt(d.ratio?Math.exp(x):x);const cells=[`${r.index}. ${r.study}`,`${disp(r.omitted.estimate)} (${disp(r.omitted.lower)}, ${disp(r.omitted.upper)})`,nfmt(r.change),nfmt(r.influence),nfmt(r.standardisedChange),(100*r.weight).toFixed(1)+'%',Math.abs(r.standardisedChange)>2?'Yes — inspect':'No'];cells.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});body.appendChild(tr);});
  }
  function renderDiagnostics() {
    try {
      const s=settings();const key=JSON.stringify({studies:APP.results?.studies,pooled:APP.results?.pooled,settings:s});
      if(!cache || cache.key!==key) cache={key,value:computeDiagnostics(APP.results,s)};
      drawBaujat(cache.value);drawLOO(cache.value);drawTable(cache.value);
    } catch(e) {cache=null; unavailable('baujatPlot',e.message);unavailable('looPlot',e.message);document.getElementById('influenceTableBody')?.replaceChildren();}
  }
  function networkInput() {
    if(!Array.isArray(APP.data)||!APP.data.length)throw new Error('Load network data before generating Net Heat.');
    // Loading a dataset updates the input controls before a fitted APP.config
    // exists. Resolve the current controls, without rewriting saved settings.
    const cfg={
      outcomeType:document.getElementById('outcomeType')?.value || APP.config.outcomeType,
      outcomeVar:document.getElementById('varEvent')?.value || APP.config.eventVar || APP.config.outcomeVar
    };
    if(cfg.outcomeType==='survival')throw new Error('Net Heat needs compatible study contrasts. This adapter supports continuous mean differences or binary log odds ratios, not conversion of censored survival data to binary outcomes.');
    if(!['continuous','binary'].includes(cfg.outcomeType)||!cfg.outcomeVar)throw new Error('Select a continuous or binary outcome and its variable in Data & Setup.');
    if(APP.data.some(row=>row[cfg.outcomeVar]===null||row[cfg.outcomeVar]===undefined||String(row[cfg.outcomeVar]).trim()===''||!finite(Number(row[cfg.outcomeVar]))||(cfg.outcomeType==='binary'&&![0,1].includes(Number(row[cfg.outcomeVar])))))throw new Error('The selected outcome contains missing or invalid values. Binary outcomes must be coded 0 or 1; missing outcomes are not treated as non-events.');
    let trtVar=document.getElementById('varTreatment')?.value || APP.config.treatmentVar || 'treatment_name';
    const distinct=key=>new Set(APP.data.map(row=>row[key]).filter(v=>v!==undefined&&v!==null)).size;
    if(distinct(trtVar)<3&&distinct('treatment_name')>=3)trtVar='treatment_name';
    const studyVar=document.getElementById('varStudy')?.value || APP.config.studyVar || 'study_id';
    const groups=new Map();
    for(const row of APP.data){const id=row[studyVar],trt=row[trtVar]??row.treatment_name;if(id==null||trt==null)throw new Error('Every network row requires study and treatment labels.');if(!groups.has(String(id)))groups.set(String(id),new Map());const arms=groups.get(String(id));if(!arms.has(String(trt)))arms.set(String(trt),[]);arms.get(String(trt)).push(row);}
    let rows=[];
    for(const [study,groupsByArm] of groups){const arms=[...groupsByArm].map(([trt,data])=>networkArmSummary(data,cfg.outcomeType,cfg.outcomeVar,trt,study));if(arms.some(a=>!a))throw new Error('A study arm has insufficient usable outcome data.');if(arms.length<2)throw new Error('Every study in Net Heat must contain at least two treatment arms.');for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){const row=networkPairwiseComparison(arms[i],arms[j],cfg.outcomeType);if(!row||!finite(row.effect)||!finite(row.variance)||row.variance<=0)throw new Error('Invalid study contrast: '+study);rows.push({...row,
      effect:cfg.outcomeType==='continuous'?row.effect:-row.effect});}}
    let trts=[...new Set(rows.flatMap(r=>[r.treatment1,r.treatment2]))];
    if(trts.length<3)throw new Error('At least three treatments are required for a Net Heat inconsistency plot.');
    const neighbours=new Map(trts.map(t=>[t,new Set()]));rows.forEach(r=>{neighbours.get(r.treatment1).add(r.treatment2);neighbours.get(r.treatment2).add(r.treatment1);});
    const allTreatments=trts.slice(), allRows=rows.length, unseen=new Set(trts), components=[];
    while(unseen.size){const first=unseen.values().next().value,seen=new Set([first]),stack=[first];unseen.delete(first);while(stack.length){for(const treatment of neighbours.get(stack.pop()))if(!seen.has(treatment)){seen.add(treatment);unseen.delete(treatment);stack.push(treatment);}}components.push([...seen].sort());}
    components.sort((a,b)=>b.length-a.length||a.join('|').localeCompare(b.join('|')));
    const select=document.getElementById('ipdNetHeatComponent');
    const signature=JSON.stringify(components);
    if(select&&select.dataset.components!==signature){
      const previous=select.value;select.replaceChildren();
      if(components.length>1){const empty=document.createElement('option');empty.value='';empty.textContent='Choose a connected component';select.appendChild(empty);}
      for(const component of components){const option=document.createElement('option');option.value=JSON.stringify(component);option.textContent=component.join(', ');select.appendChild(option);}
      if([...select.options].some(o=>o.value===previous))select.value=previous;
      select.dataset.components=signature;
    }
    if(select)select.parentElement.hidden=components.length<2;
    if(components.length>1){
      const chosen=components.find(component=>JSON.stringify(component)===select?.value);
      if(!chosen)throw new Error('The network has '+components.length+' disconnected components. Choose one above; treatments from different components cannot be combined in a Net Heat plot.');
      const allowed=new Set(chosen);rows=rows.filter(r=>allowed.has(r.treatment1)&&allowed.has(r.treatment2));trts=chosen;
    }
    const componentNote=components.length>1 ? 'Selected component: '+trts.join(', ')+'. '+(allRows-rows.length)+' contrasts from other components excluded by your selection.' : 'Complete connected network.';
    if(trts.length<3)throw new Error('The selected component needs at least three treatments for Net Heat.');
    const edges=new Set(rows.map(r=>JSON.stringify([r.treatment1,r.treatment2].sort())));
    if(edges.size<trts.length)throw new Error('The network has no closed evidence loop: inconsistency is not estimable, so no Net Heat plot is defined.');
    return {rows,measure:cfg.outcomeType==='continuous'?'MD':'OR',model:'common',componentNote,key:JSON.stringify({rows,measure:cfg.outcomeType})};
  }
  async function runtime() {
    if(!runtimePromise)runtimePromise=(async()=>{let url=new URL('../r-shiny/shinylive/webr/webr.mjs',location.href);let mod;try{mod=await import(url.href);}catch{url=new URL('https://webr.r-wasm.org/v0.5.4/webr.mjs');mod=await import(url.href);}const r=new mod.WebR({baseUrl:new URL('.',url).href,interactive:false});await r.init();await r.installPackages(['netmeta']);return r;})().catch(e=>{runtimePromise=null;throw e;});
    return runtimePromise;
  }
  function paintNetHeat() {
    if(!netImage)return;
    const p=surface('netHeatPlot',Math.max(340,Math.min(720,document.getElementById('netHeatPlot').parentElement.clientWidth)));if(!p)return;
    p.ctx.drawImage(netImage,0,0,p.width,p.height);p.canvas.dataset.plotState='ready';
  }
  async function runNetHeat() {
    if(netBusy)return;
    let input;try{input=networkInput();}catch(e){unavailable('netHeatPlot',e.message);return;}
    if(netImage && netKey===input.key){paintNetHeat();return;}
    netBusy=true;const button=document.getElementById('ipdNetHeatRun');button.disabled=true;
    unavailable('netHeatPlot','Loading local R and netmeta, then computing the common-effect design-by-treatment Net Heat plot. Data remains in this browser.');
    let shelter,capture;
    try {
      const r=await runtime();shelter=await new r.Shelter();
      const c=(values)=>'c('+values.map(v=>typeof v==='number'?String(v):JSON.stringify(String(v))).join(',')+')';
      const code=`d <- data.frame(TE=${c(input.rows.map(x=>x.effect))}, seTE=${c(input.rows.map(x=>Math.sqrt(x.variance)))}, treat1=${c(input.rows.map(x=>x.treatment1))}, treat2=${c(input.rows.map(x=>x.treatment2))}, studlab=${c(input.rows.map(x=>x.study))}, stringsAsFactors=FALSE)\nnm <- netmeta::netmeta(TE, seTE, treat1, treat2, studlab, data=d, sm=${JSON.stringify(input.measure)}, common=TRUE, random=FALSE)\ndec <- netmeta::decomp.design(nm)\nif (is.null(dec) || is.null(dec$Q.inc.detach) || nrow(dec$Q.inc.detach)==0) stop('No detachable design provides estimable inconsistency; Net Heat is not defined for this network.')\ngraphics::plot.new(); withCallingHandlers(netmeta::netheat(nm, random=FALSE, showall=TRUE), warning=function(w) { cat('Net Heat warning: ',conditionMessage(w),'\\n',sep=''); invokeRestart('muffleWarning') })\ncat('netmeta ',as.character(utils::packageVersion('netmeta')),'; common-effect Net Heat; ',nrow(d),' study contrasts',sep='')`;
      capture=await shelter.captureR(code,{withAutoprint:true,captureGraphics:{width:750,height:750,capture:true}});
      // Discard the context-initialisation page; it is never user output.
      if(capture.images?.length){capture.images[0].close();capture.images=capture.images.slice(1);}
      const err=capture.output.find(x=>x.type==='error');if(err)throw new Error(typeof err.data==='string'?err.data:err.data?.message||'R rejected the network.');
      if(!capture.images?.length){
        const reason=capture.output.filter(x=>['warning','message','stderr','stdout'].includes(x.type)).map(x=>typeof x.data==='string'?x.data:(x.data?.message||JSON.stringify(x.data))).join('; ');
        throw new Error(reason || 'R returned no Net Heat graphic for this design.');
      }
      if(networkInput().key!==input.key)throw new Error('Data changed during computation. Generate Net Heat again for the current data.');
      const img=capture.images[capture.images.length-1];if(netImage)netImage.close();netImage=img;netKey=input.key;
      capture.images.slice(0,-1).forEach(x=>x.close());capture.images=[];
      paintNetHeat();document.getElementById('netHeatPlot').dataset.rows=String(input.rows.length);
      const text=capture.output.filter(x=>x.type==='stdout').map(x=>x.data).join('\n');
      status('netHeatPlot',text+'\n'+input.componentNote+'\nGrey squares: design contributions; colours: changes in inconsistency after detaching designs. This R diagnostic does not replace the app’s fitted results.');
    }catch(e){if(netImage){netImage.close();netImage=null;}netKey='';unavailable('netHeatPlot','Net Heat unavailable: '+e.message+' You can retry after checking the data or network connection.');}
    finally{capture?.images?.forEach(x=>x.close());if(shelter)await shelter.purge().catch(()=>{});netBusy=false;button.disabled=false;}
  }
  function renderNetState() {
    if(netBusy)return;
    try{const input=networkInput();if(netImage&&input.key===netKey){paintNetHeat();return;}if(netImage){netImage.close();netImage=null;}netKey='';unavailable('netHeatPlot',input.componentNote+' Generate a common-effect Net Heat plot from the current '+input.measure+' contrasts using netmeta in browser-side R. The first run downloads the R package.');}
    catch(e){if(netImage){netImage.close();netImage=null;}netKey='';unavailable('netHeatPlot',e.message);}
  }
  function schedule() {
    if(frame!==null)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=null;const active=document.querySelector('.panel.active')?.id;if(active==='panel-heterogeneity')renderDiagnostics();if(active==='panel-consistency')renderNetState();});
  }
  const net=document.getElementById('netHeatPlot');
  if(net){const label=document.createElement('label');label.hidden=true;label.style.cssText='display:block;margin-bottom:.75rem';label.textContent='Connected component for Net Heat';const select=document.createElement('select');select.id='ipdNetHeatComponent';select.className='form-select';select.setAttribute('aria-label','Connected component for Net Heat');label.appendChild(select);net.parentElement.insertBefore(label,net);}

  if(net){const button=document.createElement('button');button.id='ipdNetHeatRun';button.type='button';button.className='btn btn-primary';button.textContent='Generate Net Heat in R';button.addEventListener('click',runNetHeat);net.parentElement.insertBefore(button,net);}
  const observer=new MutationObserver(schedule);document.querySelectorAll('.panel').forEach(p=>observer.observe(p,{attributes:true,attributeFilter:['class']}));
  observer.observe(document.body,{attributes:true,attributeFilter:['class','data-theme']});
  window.addEventListener('resize',schedule);
  document.addEventListener('change',schedule);
  const prevUpdate=window.updateResults;
  if(typeof prevUpdate==='function')window.updateResults=function(...args){const r=prevUpdate.apply(this,args);cache=null;schedule();return r;};
  window.IPDPlotCompletion=Object.freeze({version,computeDiagnostics,networkInput,runNetHeat,schedule,
    getDiagnostics:()=>cache?clone(cache.value):null});
  renderDiagnostics();renderNetState();
})();
