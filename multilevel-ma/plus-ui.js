(function(){
  'use strict';
  const mount=document.getElementById('alm-plus');
  const labels={rows:'Effect rows',clusters:'Clusters',logLik:'REML log-likelihood','robust.estimate':'Estimate','robust.se':'CR2 standard error','robust.df':'Satterthwaite degrees of freedom','robust.t':'t statistic','robust.p':'Two-sided p-value','robust.lower':'95% CI lower','robust.upper':'95% CI upper'};
  const names=['Between-study variance','Within-study variance'];
  function quantities(r){
    const out={rows:r.rows,clusters:r.clusters,logLik:r.logLik};
    for(const [key,v] of Object.entries(r.robust))out['robust.'+key]=v;
    r.profiles.forEach((p,j)=>{for(const key of ['estimate','lower','upper'])out[`profile.${j}.${key}`]=p[key];for(let i=0;i<p.x.length;i++){out[`profile.${j}.x.${i}`]=p.x[i];out[`profile.${j}.ll.${i}`]=p.ll[i];}});
    return out;
  }
  function label(key){const p=key.split('.');return labels[key]||(names[+p[1]]+' '+({estimate:'estimate',lower:'95% profile CI lower',upper:'95% profile CI upper',x:'profile variance',ll:'profile log-likelihood'}[p[2]])+(p.length===4?' (mark '+(+p[3]+1)+')':''));}
  const node=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
  function plot(doc,p,j){
    const ns='http://www.w3.org/2000/svg';
    const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 300');svg.setAttribute('role','img');svg.setAttribute('aria-label',names[j]+' profile likelihood');
    svg.style.cssText='display:block;width:600px;max-width:100%;height:auto;background:white;color:#172030;overflow:visible;font:12px Arial,sans-serif;fill:#172030;stroke:none';
    const add=(tag,attrs,text)=>{const el=doc.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.append(el);return el;};
    const xmin=0,xmax=Math.max(...p.x),ymin=Math.min(...p.ll),ymax=Math.max(...p.ll),yr=Math.max(ymax-ymin,1e-12);
    const x=v=>75+490*(v-xmin)/(xmax-xmin),y=v=>245-200*(v-ymin)/yr;
    add('path',{d:'M75 45V245H565',fill:'none',stroke:'#172030','stroke-width':1});
    add('polyline',{points:p.x.map((v,i)=>`${x(v)},${y(p.ll[i])}`).join(' '),fill:'none',stroke:'#2457a6','stroke-width':2});
    p.x.forEach((v,i)=>add('circle',{cx:x(v),cy:y(p.ll[i]),r:3,fill:'#2457a6',stroke:'none'}));
    const text=(xx,yy,s,anchor='middle')=>add('text',{x:xx,y:yy,fill:'#172030',stroke:'none','font-size':12,'font-family':'Arial, sans-serif','font-weight':'normal','text-anchor':anchor},s);
    text(300,20,names[j]);text(320,290,'Variance');text(75,265,'0');text(565,265,xmax.toPrecision(5));text(68,248,ymin.toPrecision(5),'end');text(68,49,ymax.toPrecision(5),'end');text(75,36,'REML log-likelihood','start');
    return svg;
  }
  function render(r,target=document.getElementById('alm-plus-output')){
    target.replaceChildren();
    if(r.status!=='ok'){const p=node('p',r.reason,target);p.dataset.refusal='';p.setAttribute('role','alert');return;}
    node('h3','CR2 cluster-robust inference',target);
    const wrap=node('div',undefined,target);wrap.style.overflowX='auto';const table=node('table',undefined,wrap);node('caption','CR2 cluster-robust inference for the pooled effect (full precision)',table);const head=node('tr',undefined,node('thead',undefined,table));for(const h of ['Quantity','Value'])node('th',h,head).scope='col';
    const tbody=node('tbody',undefined,table);
    for(const [key,value] of Object.entries(quantities(r)).filter(([k])=>!/^profile\.[01]\.(x|ll)\./.test(k))){const tr=node('tr',undefined,tbody);node('th',label(key),tr).scope='row';const td=node('td',String(value),tr);td.dataset.quantity=key;}
    r.profiles.forEach((p,j)=>{const figure=node('figure',undefined,target);figure.style.margin='1rem 0';figure.append(plot(document,p,j));node('figcaption',names[j]+': the other component is re-estimated at each point. The interval uses the profile likelihood-ratio cutoff.',figure);});
    const details=node('details',undefined,target);node('summary','Profile coordinates',details);
    const pwrap=node('div',undefined,details);pwrap.style.overflowX='auto';const pt=node('table',undefined,pwrap);
    for(const [key,value] of Object.entries(quantities(r)).filter(([k])=>/^profile\.[01]\.(x|ll)\./.test(k))){const tr=node('tr',undefined,pt);node('th',label(key),tr).scope='row';const td=node('td',String(value),tr);td.dataset.quantity=key;}
  }
  function rows(){
    // Strict parsing for extras: do not silently discard malformed input rows.
    const lines=document.getElementById('src').value.trim().split(/\r?\n/).filter(x=>x.trim());
    return lines.map((line,i)=>{const a=line.split(',').map(x=>x.trim());if(a.length<3||!a[0]||!a[1]||!a[2]||!Number.isFinite(Number(a[1]))||!Number.isFinite(Number(a[2]))||Number(a[2])<=0)throw Error(`Row ${i+1}: need a study label, a finite effect and a positive standard error`);return {cluster:a[0],y:Number(a[1]),v:Number(a[2])**2};});
  }
  let result=null,source=null;
  node('h2','Cluster-robust inference and variance profiles',mount);
  node('p','Intercept-only three-level REML with diagonal sampling variances. CR2 uses study clusters and Satterthwaite degrees of freedom. Variance intervals are 95% profile-likelihood intervals. These extras fit the current input separately.',mount);
  const hint=node('p','Uses the rows in the Effect sizes box above (study, effect, SE, optional label). Each row is one effect; rows with the same study form one cluster. Needs at least two studies and at least one study with two or more effects.',mount);hint.id='alm-plus-hint';
  const controls=node('div',undefined,mount);controls.setAttribute('role','group');controls.setAttribute('aria-label','Extras controls');controls.style.cssText='display:flex;flex-wrap:wrap;gap:.5rem';
  const example=node('button','Load example and calculate',controls);example.type='button';example.id='alm-plus-example';example.setAttribute('aria-describedby','alm-plus-hint');
  const run=node('button','Calculate extras',controls);run.type='button';run.id='alm-plus-run';run.setAttribute('aria-describedby','alm-plus-hint');
  const download=node('button','Export extras (JSON)',controls);download.type='button';download.id='alm-plus-export';download.disabled=true;
  const status=node('p','Ready.',mount);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.id='alm-plus-status';
  node('div',undefined,mount).id='alm-plus-output';
  node('div',undefined,mount).id='alm-plus-validate';
  function calculate(){
    source=document.getElementById('src').value;
    try {result=AlmMultilevelPlusEngine.fit(rows());render(result);status.textContent='Extras calculated.';download.disabled=false;return result;}
    catch(e){result=null;download.disabled=true;render({status:'refused',reason:e.message});status.textContent='Extras refused: '+e.message;throw e;}
  }
  run.onclick=()=>{status.textContent='Calculating extras… large inputs can take a minute or more.';run.disabled=true;setTimeout(()=>{try{calculate();}catch{}finally{run.disabled=false;}},0);};
  // One click: restore the page's built-in example rows, refit the original analysis, then the extras.
  example.onclick=()=>{const src=document.getElementById('src');src.value=src.defaultValue;src.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('btn-run')?.click();run.onclick();};
  function exportText(){if(!result||source!==document.getElementById('src').value)throw Error('Extras out of date — calculate again');return JSON.stringify({model:'Three-level REML; diagonal sampling V',inference:'CR2; Satterthwaite; 95% confidence',...result},null,2)+'\n';}
  download.onclick=()=>{try{const url=URL.createObjectURL(new Blob([exportText()],{type:'application/json'}));const a=node('a');a.href=url;a.download='multilevel-extras.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}catch(e){status.textContent=e.message;}};
  function stale(){if(source!==null&&source!==document.getElementById('src').value){result=null;source=null;download.disabled=true;document.getElementById('alm-plus-output').replaceChildren();status.textContent='Extras out of date — calculate again';}}
  document.getElementById('src').addEventListener('input',stale);setInterval(stale,150);
  function capture(){return {result,source,status:status.textContent,html:document.getElementById('alm-plus-output').innerHTML,disabled:download.disabled};}
  function restore(s){result=s.result;source=s.source;status.textContent=s.status;document.getElementById('alm-plus-output').innerHTML=s.html;download.disabled=s.disabled;}
  window.AlmMultilevelPlus={quantities,label,plot,render,rows,calculate,exportText,capture,restore};
})();
