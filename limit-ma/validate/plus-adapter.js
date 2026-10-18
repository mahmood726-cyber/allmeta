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
// Freeze the clean template and renderer before replay mutations. Shadow DOM
// isolates the reference from document selectors; never clone the tested marks.
const referenceTemplate=document.body.cloneNode(true);
referenceTemplate.lang=document.body.lang||document.documentElement.lang;
referenceTemplate.querySelectorAll('script').forEach(n=>n.remove());
referenceTemplate.querySelectorAll('button,input,select,textarea,a').forEach(n=>n.tabIndex=-1);
const drawReference=AlmLimitPlusUI.drawReference;
const referenceHost=document.createElement('div');referenceHost.setAttribute('aria-hidden','true');
referenceHost.style.all='initial';
const referenceRoot=referenceHost.attachShadow({mode:'closed'});
let referenceKey,referenceResult,referenceStyles;
// file:// deliberately denies cssRules for linked stylesheets. Load clean link
// copies in that case and freeze root custom properties before mutation.
const referenceLoads=[];
try {
 const css=document.createElement('style');
 css.textContent=[...document.styleSheets].map(s=>[...s.cssRules].map(r=>r.cssText).join('\n')).join('\n').replaceAll(':root',':host');
 referenceRoot.append(css);
}catch(error){
 if(location.protocol!=='file:'||error.name!=='SecurityError')throw error;
 const rootStyle=getComputedStyle(document.documentElement);
 for(const property of rootStyle)if(property.startsWith('--'))referenceHost.style.setProperty(property,rootStyle.getPropertyValue(property));
 for(const original of document.querySelectorAll('style,link[rel="stylesheet"]')){
  const copy=original.cloneNode(true);
  if(copy.localName==='style')copy.textContent=copy.textContent.replaceAll(':root',':host');
  else {copy.href=original.href;referenceLoads.push(new Promise((resolve,reject)=>{copy.onload=resolve;copy.onerror=()=>reject(Error('Reference stylesheet unavailable'));}));}
  referenceRoot.append(copy);
 }
}
referenceHost.style.position='fixed';referenceHost.style.left='-100000px';referenceHost.style.top='0';
referenceRoot.append(referenceTemplate);document.body.append(referenceHost);
const referenceReady=Promise.all(referenceLoads);
function paintReference(r,c,limit){
 const toggles=['limit','fill','reg','contour'].map(k=>document.getElementById('plus-'+k+'-toggle').checked);
 const key=JSON.stringify([toggles,innerWidth,innerHeight,matchMedia('(prefers-color-scheme:dark)').matches]);
 if(referenceResult===r&&referenceKey===key)return referenceStyles;
 referenceHost.style.width=document.documentElement.clientWidth+'px';
 const lookup=id=>referenceRoot.querySelector('#'+id);
 ['limit','fill','reg','contour'].forEach((k,i)=>lookup('plus-'+k+'-toggle').checked=toggles[i]);
 drawReference(r,c,limit,lookup);
 // Finish template entrance animations, without changing declared style values.
 referenceRoot.getAnimations().forEach(a=>a.finish());
 referenceStyles={};
 for(const id of ['plus-forest','plus-funnel']){
  const svg=lookup(id);
  referenceStyles[id]=[svg,...svg.querySelectorAll('*')].map(n=>{
   const computed=getComputedStyle(n),values={};
   for(const property of computed)values[property]=computed.getPropertyValue(property);
   return {tag:n.localName,values,count:computed.length,noFillArea:n.localName==='line'||(n.localName==='path'&&n.hasAttribute('data-plus-axis'))};
  });
 }
 referenceResult=r;referenceKey=key;return referenceStyles;
}
function channelPaints(values,channel){
 const color=values[channel],opacity=Number(values[channel+'-opacity']);
 const alpha=color.match(/\/\s*([\d.]+)%?\s*\)$/)||color.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
 return color!=='none'&&color!=='transparent'&&(!alpha||Number(alpha[1])>0)&&opacity>0&&
  (channel!=='stroke'||parseFloat(values['stroke-width'])>0);
}
function paintContract(reference,failures){
 for(const id of ['plus-forest','plus-funnel']){
  const svg=document.getElementById(id),nodes=[svg,...svg.querySelectorAll('*')],expected=reference[id];
  if(nodes.length!==expected.length){failures.push(id+' style structure');continue;}
  for(const [i,n] of nodes.entries()){
   const ref=expected[i];if(n.localName!==ref.tag){failures.push(id+' style role');return;}
   const actual=getComputedStyle(n),channels={};
   if(actual.length!==ref.count){failures.push(id+' '+i+' style property count');return;}
   for(const channel of ['fill','stroke']){
    const values={};for(const p of [channel,channel+'-opacity','stroke-width'])values[p]=actual.getPropertyValue(p);
    channels[channel]=channelPaints(ref.values,channel)||channelPaints(values,channel);
   }
   for(const property of actual){
    // Pointer interaction does not affect plot paint.
    if(property==='cursor')continue;
    if(!(property in ref.values)){failures.push(id+' '+i+' unexpected style property '+property);return;}
    // Ignore a channel only when neither style can paint it. Straight lines
    // and the renderer's single-segment tick paths have no fill area.
    if((ref.noFillArea||!channels.fill)&&(property==='fill'||property.startsWith('fill-')))continue;
    if(!channels.stroke&&(property==='stroke'||property.startsWith('stroke-')))continue;
    if(actual.getPropertyValue(property)!==ref.values[property]){
     failures.push(id+' '+i+' style '+property+': '+actual.getPropertyValue(property)+' != '+ref.values[property]);return;
    }
   }
  }
 }
}
// Independently invert SVG coordinates into entered effect/SE units. The gate
// uses source results (already compared to the pinned oracle), never SVG metadata.
// Relative tolerance 1e-9 with unit floor; SVG layout coordinates use the same bound.

// Axis-label coverage is separate from the numerical and geometry contracts.
let axisLabels=[];
const axisSummary=rows=>['Axis labels: '+rows.filter(r=>r.checked).length+' checked; '+rows.filter(r=>!r.checked).length+' not checked.',...rows.filter(r=>!r.checked).map(r=>(r.id?r.id+' ':'')+r.axis+': '+r.message)];
function calibratedTicks(samples,ticks,digits,name,domain) {
 const row={axis:name,checked:false,message:'axis labels: not checked (scale not determined by validated marks)'};
 axisLabels.push(row);
 const fail=message=>{throw Error(name+' calibrated axis '+message);};
 const length=Math.abs(ticks[1]?.position-ticks[0]?.position);
 if(samples.length<2||samples.some(p=>!p.every(Number.isFinite))||!Number.isFinite(length)||length===0)return;
 const values=samples.map(p=>p[0]),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo;
 const positions=samples.map(p=>p[1]);
 row.coverage=(Math.max(...positions)-Math.min(...positions))/length;
 if(span===0||row.coverage<.2)return;
 const sum=xs=>{let s=0,c=0;for(const x of xs){const t=s+x;c+=Math.abs(s)>=Math.abs(x)?(s-t)+x:(x-t)+s;s=t;}return s+c;};
 const z=values.map(v=>(v-lo)/span),zm=sum(z)/z.length;
 const pm=sum(positions)/samples.length,variance=sum(z.map(v=>(v-zm)**2));
 const slope=sum(z.map((v,i)=>(v-zm)*(positions[i]-pm)))/variance,intercept=pm-slope*zm;
 row.residual=Math.max(...samples.map((p,i)=>Math.abs(p[1]-(intercept+slope*z[i]))));
 if(!Number.isFinite(slope)||slope===0||!Number.isFinite(row.residual)||row.residual>1e-7)return;
 row.checked=true;row.message='axis labels: checked';
 const labels=ticks.map(t=>Number(t.text));
 if(ticks.length<2||ticks.some(t=>!t.text.trim()||!Number.isFinite(t.position))||!labels.every(Number.isFinite))fail('tick coverage');
 const inferred=ticks.map(t=>lo+span*(t.position-intercept)/slope);
 if(!inferred.every(Number.isFinite))fail('invalid inferred endpoints');
 const ordered=ticks.map((t,i)=>({position:t.position,value:inferred[i],label:labels[i]})).sort((a,b)=>a.position-b.position);
 const spacings=ordered.slice(1).map((t,i)=>Math.abs(t.value-ordered[i].value)).sort((a,b)=>a-b);
 const middle=Math.floor(spacings.length/2);
 const step=spacings.length%2?spacings[middle]:spacings[middle-1]/2+spacings[middle]/2;
 if(!Number.isFinite(step)||step<=0)fail('invalid inferred tick step');
 row.step=step;
 // Shown resolution is only an eligibility gate, never an error allowance.
 const units=ticks.map(t=>{
  const match=t.text.trim().match(/^[+-]?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if(!match)fail('invalid numeric label');
  return 10**(Number(match[3]||0)-(match[2]||'').length);
 });
 if(ordered.slice(1).some((t,i)=>t.label===ordered[i].label)||units.some(unit=>unit>step/2)){
  row.checked=false;row.message='axis labels: not checked (labels coarser than tick spacing)';return;
 }
 for(let i=0;i<labels.length;i++)if(Math.abs(labels[i]-inferred[i])>step/2)fail('label does not match mark scale');
}

function geometry(r,c,limit){
 axisLabels=[];
 const failures=[];
 const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
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
 // Screen-space comparisons tolerate browser float/layout rounding (0.02 CSS px).
 // CTMs include SVG transforms, CSS transforms and independent transform properties.
 const matrices=new WeakMap();
 const screen=(n,x,y)=>{if(!n)return {x:NaN,y:NaN};if(!matrices.has(n))matrices.set(n,n.getScreenCTM());const m=matrices.get(n);return m?new DOMPoint(x,y).matrixTransform(m):{x:NaN,y:NaN};};
 const center=n=>{if(!n)return {x:NaN,y:NaN};const b=n.getBBox();return screen(n,b.x+b.width/2,b.y+b.height/2);};
 const endpoint=(n,end)=>{if(!n)return {x:NaN,y:NaN};const p=n.getPointAtLength(end?n.getTotalLength():0);return screen(n,p.x,p.y);};
 function screenEq(a,b,key){if(!a||!b||![a.x,a.y,b.x,b.y].every(finite)||Math.hypot(a.x-b.x,a.y-b.y)>.02)failures.push(key+' screen');}
 // Paint is a separate contract from position. This renderer uses no clips or
 // masks: reject them conservatively, including on HTML ancestors.
 const styles=new WeakMap(),ancestry=new WeakMap();
 const style=n=>{if(!styles.has(n))styles.set(n,getComputedStyle(n));return styles.get(n);};
 function visible(n){
  if(!n)return {ok:true,opacity:1};if(ancestry.has(n))return ancestry.get(n);
  const s=style(n),parent=visible(n.parentElement),opacity=parent.opacity*Number(s.opacity);
  const value={opacity,ok:parent.ok&&s.display!=='none'&&opacity>0&&
   s.clipPath==='none'&&s.maskImage==='none'};
  ancestry.set(n,value);return value;
 }
 const intersects=(a,b)=>a.right>=b.left&&a.left<=b.right&&a.bottom>=b.top&&a.top<=b.bottom;
 function rect(svg,x1,y1,x2,y2){const a=screen(svg,x1,y1),b=screen(svg,x2,y2);return {left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};}
 for(const id of ['plus-forest','plus-funnel']){
  const svg=document.getElementById(id),viewport=svg.getBoundingClientRect();
  for(const n of svg.querySelectorAll('circle,line,polyline,path,text,tspan')){
   const s=style(n),b=n.getBoundingClientRect();
   const key=id+' '+n.localName+' paint';
   if(!visible(n).ok||s.visibility!=='visible'||
    (n.localName==='circle'&&!(parseFloat(s.r)>0))||
    (['text','tspan'].includes(n.localName)&&!(parseFloat(s.fontSize)>0))||
    !(viewport.width>0&&viewport.height>0)||!intersects(b,viewport))failures.push(key);
   // Labels occupy the margins; marks must intersect the actual data plot.
   if(['circle','line','polyline'].includes(n.localName)){
    const plot=id==='plus-forest'?rect(svg,220,5,670,240):rect(svg,60,20,660,310);
    if(!intersects(b,plot))failures.push(key+' outside plot');
   }
  }
 }
 function axis(svg,name,values,coords){
  const ticks=[...svg.querySelectorAll('[data-plus-axis="'+name+'"]')];count(ticks,2,name+' ticks');
  const labels=[...svg.querySelectorAll('[data-plus-tick-label="'+name+'"]')];count(labels,2,name+' tick labels');
  return values.map((v,i)=>{const n=ticks[i];if(n?.querySelector('title')?.textContent!==String(v))failures.push(name+' tick value');
   const label=labels[i];
   if(label?.getNumberOfChars()){
    const p=label.getStartPositionOfChar(0),width=label.getComputedTextLength(),[x,y]=coords[i];
    screenEq(screen(label,p.x,p.y),screen(svg,name==='x'?x-width/2:x-7-width,name==='x'?y+17:y+4),name+' tick label');
   }else failures.push(name+' tick label geometry');
   if(!n)return {x:NaN,y:NaN};const p=n.getPointAtLength(0),actual=screen(n,p.x,p.y);
   screenEq(actual,screen(svg,...coords[i]),name+' tick');return actual;});
 }
 const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const fits=fitMethods.filter(k=>r[k].status==='ok');
 let low=Math.min(0,...fits.map(k=>r[k].values.ciLo)),high=Math.max(0,...fits.map(k=>r[k].values.ciHi));if(low===high)high=low+1;
 const effect=x=>low+(x-220)*(high-low)/450;
 const forest=document.getElementById('plus-forest'),dots=forest.querySelectorAll('circle'),lines=forest.querySelectorAll('line');
 const fx=axis(forest,'x',[low,high],[[220,245],[670,245]]);
 const forestPoint=(x,y)=>{const p=mix(...fx,(x-low)/(high-low)),a=screen(forest,0,245),b=screen(forest,0,y);return {x:p.x+b.x-a.x,y:p.y+b.y-a.y};};
 const labels=forest.querySelectorAll('text:not([data-plus-tick-label])');count(labels,fits.length,'forest method labels');
 count(dots,fits.length,'forest estimates');count(lines,fits.length+1,'forest intervals');
 eq(effect(attr(lines[0],'x1')),0,'forest null x1');eq(effect(attr(lines[0],'x2')),0,'forest null x2');eq(attr(lines[0],'y1'),5,'forest null y1');eq(attr(lines[0],'y2'),240,'forest null y2');
 fits.forEach((key,i)=>{const v=r[key].values,y=25+30*i;
  if(labels[i]?.textContent!==forestNames[key])failures.push(key+' forest label');
  // SVG text character positions include dx/dy and descendant tspan positioning.
  const label=labels[i];
  if(label){const b=label.getBoundingClientRect(),row=rect(forest,0,y-15,215,y+15);
   if(!(b.width>0&&b.height>0)||b.left<row.left-.02||b.right>row.right+.02||b.top<row.top-.02||b.bottom>row.bottom+.02)failures.push(key+' label row bounds');}
  if(label?.getNumberOfChars()){
   const first=label.getStartPositionOfChar(0);screenEq(screen(label,first.x,first.y),forestPoint(low+(5-220)*(high-low)/450,y+4),key+' label baseline');
   for(let j=0;j<label.getNumberOfChars();j++){
    const p=label.getStartPositionOfChar(j),end=label.getEndPositionOfChar(j);
    const advance=j?label.getSubStringLength(0,j):0;
    screenEq(screen(label,p.x,p.y),screen(forest,5+advance,y+4),key+' label character '+j);
    screenEq(screen(label,end.x,end.y),screen(forest,5+label.getSubStringLength(0,j+1),y+4),key+' label end '+j);
   }
  }else failures.push(key+' empty label geometry');
  screenEq(center(dots[i]),forestPoint(v.mu,y),key+' estimate');
  for(const [a,value] of [['1',v.ciLo],['2',v.ciHi]])screenEq(endpoint(lines[i+1],a==='2'),forestPoint(value,y),key+' interval '+a);
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
 const tx=axis(funnel,'x',[min,max],[[60,310],[660,310]]),ty=axis(funnel,'y',[0,maxSE],[[60,20],[60,310]]);
 const funnelPoint=(x,se)=>{const a=mix(...tx,(x-min)/(max-min)),b=mix(...ty,se/maxSE);return {x:a.x+b.x-ty[1].x,y:a.y+b.y-ty[1].y};};
 for(const n of funnel.querySelectorAll('line'))for(const a of ['1','2'])screenEq(screen(n,attr(n,'x'+a),attr(n,'y'+a)),screen(funnel,attr(n,'x'+a),attr(n,'y'+a)),'funnel axis line');
 for(const a of ['1','2'])screenEq(endpoint(lines[0],a==='2'),forestPoint(0,a==='1'?5:240),'forest null');
 count(studies,points.length,'funnel points');count(paths,curves.length,'funnel curves');
 points.forEach(([x,se],i)=>{screenEq(center(studies[i]),funnelPoint(x,se),'funnel point '+i);eq(invertX(attr(studies[i],'cx')),x,'funnel effect '+i);eq(invertY(attr(studies[i],'cy')),se,'funnel SE '+i);});
 curves.forEach((curve,i)=>{
  const raw=paths[i]?.getAttribute('points')?.trim(),pairs=raw?raw.split(/\s+/).map(p=>p.split(',').map(Number)):[];
  count(pairs,curve.length,'curve '+i);
  curve.forEach(([x,se],j)=>{const p=pairs[j]||[];screenEq(screen(paths[i],p[0],p[1]),funnelPoint(x,se),'curve '+i+':'+j);if(p.length!==2)failures.push('curve coordinate arity');eq(invertX(p[0]),x,'curve effect '+i+':'+j);eq(invertY(p[1]),se,'curve SE '+i+':'+j);});
 });

 // Calibrate each independent axis from entered studies / validated estimates.
 // Use the source SVG point and its CTM to avoid getBBox float truncation.
 const mark=(n,axis)=>screen(n,attr(n,'cx'),attr(n,'cy'))[axis];
 function checkTicks(svg,name,samples,domain){
  const ticks=[...svg.querySelectorAll('[data-plus-axis="'+name+'"]')];
  const labels=[...svg.querySelectorAll('[data-plus-tick-label="'+name+'"]')];
  try {calibratedTicks(samples,ticks.map((n,i)=>{const p=n.getPointAtLength(0);return {text:labels[i]?.textContent||'',position:screen(n,p.x,p.y)[name]};}),3,svg.id+' '+name,domain);}
  catch(e){failures.push(e.message);}
 }
 // Validated confidence-interval endpoints also identify the forest scale.
 checkTicks(forest,'x',fits.flatMap((key,i)=>[
  [r[key].values.mu,mark(dots[i],'x')],
  ...[['1','ciLo'],['2','ciHi']].map(([end,q])=>[r[key].values[q],screen(lines[i+1],attr(lines[i+1],'x'+end),attr(lines[i+1],'y'+end)).x])
 ]),[low,high]);
 // Original study inputs are pinned inputs to R; do not use transformed or
 // imputed points to establish the scale (their geometry is checked above).
 checkTicks(funnel,'x',c.te.map((v,i)=>[v,mark(studies[i],'x')]),[min,max]);
 checkTicks(funnel,'y',c.se.map((v,i)=>[v,mark(studies[i],'y')]),[0,maxSE]);
 const titles=[...funnel.querySelectorAll('text:not([data-plus-tick-label])')];
 if(titles.length!==2||titles[0]?.textContent!=='Effect (entered scale)'||titles[1]?.textContent!=='SE')failures.push('funnel axis titles');

 // A geometry failure already fails the render. Only clean geometry needs
 // the more expensive full-property comparison; no checks are relaxed.
 if(!failures.length)paintContract(paintReference(r,c,limit),failures);
 return failures;
}
async function mount(){
 await referenceReady;
 await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
 const manifest=window.AlmLimitPlusManifest;if(!manifest)throw Error('Sensitivity pins unavailable');
 const files=manifest.files;
 async function replay(loaded,progress){
  const corpus=loaded[files[0].path],refs=loaded[files[1].path];validate(corpus,refs);
  const snap=__almLimitValidationSnapshot(),ui=AlmLimitPlusUI.snapshot(),status=document.getElementById('plus-status').textContent;
  const locks=[...document.querySelectorAll('button,input,select,textarea')].filter(n=>!n.closest('#alm-plus-validate')).map(n=>[n,n.disabled]);locks.forEach(([n])=>n.disabled=true);
  let checks=0,passed=0;const failed=[],maxima={},axisCoverage=[];
  function check(id,q,a,r,exact=false){const tol=tolerance(q),d=AlmValidate.compare(a,r,exact?'exact':'rel',tol);checks++;if(d.pass)passed++;else failed.push({id,quantity:q,app:a,ref:r,tol,...d});maxima[q]=Math.max(maxima[q]||0,d.diff);}
  return alm.urlState.withoutWrites(async()=>{try{
   for(let i=0;i<corpus.length;i++){
    const c=corpus[i];__almLimitValidationRun(c.te.map((v,j)=>v+','+c.se[j]+',row '+c.source_rows[j]).join('\n'),true);
    const limit=_almLastLimit(),a=AlmLimitPlus.compute(c,limit,.1),ref=refs[i].methods;
    AlmLimitPlusUI.render(a,c,limit);
    const af=flatten(a),rf=flatten(ref);
    for(const [q,v] of Object.entries(rf))check(c.id,q,af[q],v,typeof v!=='number'||/\.(df|k0|length)$/.test(q));
    const renderFailures=displayed(af).concat(geometry(a,c,limit));check(c.id,'render',renderFailures.length,0,true);axisCoverage.push(...axisLabels.map(row=>({...row,id:c.id})));
    if(renderFailures.length)failed[failed.length-1].details=renderFailures;
    progress('Sensitivity replay '+(i+1)+'/'+corpus.length+'; '+checks+' checks');await new Promise(r=>setTimeout(r,0));
   }
  }finally{__almLimitValidationRestore(snap);AlmLimitPlusUI.restore(ui);document.getElementById('plus-status').textContent=status;locks.forEach(([n,d])=>n.disabled=d);}
  if(checks!==manifest.checks)throw Error('Sensitivity check cardinality mismatch: '+checks+' != '+manifest.checks);
  return {checks,passed,failed,maxima,axisCoverage,summaryLines:[...axisSummary(axisCoverage),'Independent sensitivity oracle: meta 8.5-0, metafor 5.2-1, metasens 1.5-3.','Refusals pass only when both implementations refuse for the same reason.','Effective rendered geometry checked against rendered axis ticks within 0.02 CSS px; text character positions, paint visibility, viewport intersection and forest label row bounds included.','Rendered forest/funnel coordinates inverted to effect/SE units: 1e-9 relative tolerance with unit floor.','Closed-form tolerance 1e-9 relative; selection parameters/logLik 1e-6 and SE/CI 1e-4.']};
  });
 }
 const adapter={app:'limit-ma-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Sensitivity oracle protocol',runUrl:'validate/README-plus.md'},corpus:{files,run:replay}};
 window.AlmLimitPlusValidationAdapter=adapter;window.AlmLimitPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
 document.querySelectorAll('#alm-plus-validate button').forEach(b=>{if(b.textContent==='Re-run full validation')b.textContent='Re-run sensitivity validation';});
}
window.AlmLimitPlusContract={validate,flatten,displayed,geometry,tolerance,get axisLabels(){return axisLabels;}};
window.AlmLimitPlusReady=mount().catch(e=>{document.getElementById('alm-plus-validate').textContent='Validation unavailable: '+e.message;throw e;});
})();
