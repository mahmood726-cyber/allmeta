(function(){
'use strict';
const root=document.getElementById('alm-plus');
const names={RE:'Random effects (DL)',limit:'Limit (Rücker)',trimfill:'Trim-and-fill — sensitivity only',PET:'PET',PEESE:'PEESE',conditional:'Conditional PET–PEESE',selection:'3PSM (ML, step .025)',Egger:'Egger small-study test',Peters:'Peters binary test',Qsmall:'Limit Q.small',Qresid:'Limit Q.resid',shift:'Limit minus RE shift',G2:'G²'};
const methods=['RE','limit','trimfill','PET','PEESE','conditional','selection'];
const el=id=>document.getElementById(id),fmt=x=>x.toPrecision(12);
let state=null;
function number(parent,key,x){const span=document.createElement('span');span.dataset.plusNumber=key;span.textContent=fmt(x);parent.append(span);return span;}
function cell(row,text){const td=document.createElement('td');td.textContent=text;row.append(td);return td;}
function render(results,c,limit){
 state={results,c,limit};const body=el('plus-body');body.replaceChildren();
 for(const key of methods){const r=results[key],row=document.createElement('tr');row.dataset.plusMethod=key;cell(row,names[key]);
  if(r.status!=='ok'){const td=cell(row,'Refused: '+r.reason);td.colSpan=4;td.dataset.plusRefusal=key;}
  else {for(const q of ['mu','se','ciLo','ciHi'])number(cell(row,''),key+'.'+q,r.values[q]);}
  body.append(row);
 }
 const details=el('plus-details');details.replaceChildren();
 // Every remaining scalar, array element and categorical result is inspectable.
 for(const [key,r] of Object.entries(results)){
  const item=document.createElement('div');item.dataset.plusDetail=key;
  const strong=document.createElement('strong');strong.textContent=names[key]+': ';item.append(strong);
  if(r.status!=='ok'){const s=document.createElement('span');s.dataset.plusRefusal=key;s.textContent='Refused: '+r.reason;item.append(s);}
  else {
   if(r.branch){const span=document.createElement('span');span.dataset.plusCategory=key+'.branch';span.textContent=r.branch;item.append(span,document.createTextNode('; '));}
   for(const [q,v] of Object.entries(r.values)){
    if(methods.includes(key)&&['mu','se','ciLo','ciHi'].includes(q))continue;
    item.append(document.createTextNode(q+' = '));
    if(typeof v==='number')number(item,key+'.'+q,v);
    else if(Array.isArray(v)){v.forEach((x,i)=>{if(i)item.append(document.createTextNode(', '));number(item,key+'.'+q+'.'+i,x);});if(!v.length)item.append(document.createTextNode('none'));}
    else {const s=document.createElement('span');s.dataset.plusCategory=key+'.'+q;s.textContent=v;item.append(s);}
    item.append(document.createTextNode('; '));
   }
  }
  details.append(item);
 }
 const text=el('plus-interpretation');text.replaceChildren();
 if(results.shift.status==='ok'){
  text.append(document.createTextNode('The limit estimate shifts the pooled effect by '));number(text,'shift.value',results.shift.values.value);
  text.append(document.createTextNode(' on the entered effect scale. This sensitivity comparison does not establish publication bias or a causal correction. '));
 }
 if(results.G2.status==='ok'){
  text.append(document.createTextNode('G² = '));number(text,'G2.value',results.G2.values.value);
  text.append(document.createTextNode(' is the fraction of variation unexplained by the shrunken radial regression (one minus its R-squared). Higher values indicate more unexplained variation in this diagnostic, not the probability of publication bias.'));
 }else text.append(document.createTextNode('G² interpretation unavailable: '+results.G2.reason));
 draw();
}
function svgNode(svg,tag,attrs){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;}
// Tick paths start at the calibrated value; titles expose the exact value.
function tick(svg,axis,value,x,y){
 const n=svgNode(svg,'path',{'data-plus-axis':axis,d:`M ${x} ${y} l ${axis==='x'?'0 5':'-5 0'}`,stroke:'currentColor'});
 const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=String(value);n.append(title);
 const label=svgNode(svg,'text',{x:axis==='x'?x:x-7,y:axis==='x'?y+17:y+4,'font-size':10,'text-anchor':axis==='x'?'middle':'end','data-plus-tick-label':axis});label.textContent=value.toPrecision(3);
}
function draw(plotState=state,lookup=el){
 if(!plotState)return;const {results:r,c,limit}=plotState;
 const forest=lookup('plus-forest');forest.replaceChildren();const fits=methods.filter(k=>r[k].status==='ok');
 let lo=Math.min(0,...fits.map(k=>r[k].values.ciLo)),hi=Math.max(0,...fits.map(k=>r[k].values.ciHi));if(lo===hi)hi=lo+1;
 const X=x=>220+450*(x-lo)/(hi-lo);
 svgNode(forest,'line',{x1:X(0),x2:X(0),y1:5,y2:240,stroke:'gray','stroke-dasharray':'3 3'});
 fits.forEach((key,i)=>{const v=r[key].values,y=25+i*30;svgNode(forest,'text',{x:5,y:y+4,fill:'currentColor','font-size':12}).textContent=names[key];svgNode(forest,'line',{x1:X(v.ciLo),x2:X(v.ciHi),y1:y,y2:y,stroke:'#0072B2','stroke-width':2});svgNode(forest,'circle',{cx:X(v.mu),cy:y,r:4,fill:'#0072B2'});});
 tick(forest,'x',lo,220,245);tick(forest,'x',hi,670,245);
 const svg=lookup('plus-funnel');svg.replaceChildren();
 const maxS=Math.max(...c.se)*1.1;
 const points=c.te.map((x,i)=>[x,c.se[i]]),curves=[];
 if(lookup('plus-limit-toggle').checked&&limit&&r.limit.status==='ok'){
  curves.push({color:'#0072B2',points:Array.from({length:65},(_,i)=>{const s=maxS*i/64;return[limit.beta_r+limit.alpha_r*Math.sqrt(s*s+limit.tau2_dl),s];})});
  limit.te_limit.forEach((x,i)=>points.push([x,c.se[i],'#0072B2']));
 }
 if(lookup('plus-fill-toggle').checked&&r.trimfill.status==='ok')r.trimfill.values.imputed.forEach((x,i)=>points.push([x,r.trimfill.values.imputedSE[i],'#D55E00']));
 for(const [key,power,color] of [['PET',1,'#009E73'],['PEESE',2,'#CC79A7']])if(lookup('plus-reg-toggle').checked&&r[key].status==='ok')curves.push({color,points:Array.from({length:65},(_,i)=>{const s=maxS*i/64;return[r[key].values.mu+r[key].values.slope*s**power,s];})});
 if(lookup('plus-contour-toggle').checked)for(const sign of [-1,1])curves.push({color:'#999',points:[[0,0],[sign*1.959963984540054*maxS,maxS]],dash:true});
 const xs=[...points,...curves.flatMap(x=>x.points)].map(x=>x[0]);let min=Math.min(...xs),max=Math.max(...xs);const pad=(max-min)*.05||.1;min-=pad;max+=pad;
 const xx=x=>60+600*(x-min)/(max-min),yy=s=>20+290*s/maxS;
 tick(svg,'x',min,60,310);tick(svg,'x',max,660,310);tick(svg,'y',0,60,20);tick(svg,'y',maxS,60,310);
 svgNode(svg,'line',{x1:60,x2:660,y1:310,y2:310,stroke:'currentColor'});svgNode(svg,'line',{x1:60,x2:60,y1:20,y2:310,stroke:'currentColor'});
 svgNode(svg,'text',{x:300,y:340,fill:'currentColor'}).textContent='Effect (entered scale)';svgNode(svg,'text',{x:8,y:20,fill:'currentColor'}).textContent='SE';
 for(const [x,s,color] of points)svgNode(svg,'circle',{cx:xx(x),cy:yy(s),r:3,fill:color||'currentColor','fill-opacity':color?.65:.45});
 for(const curve of curves)svgNode(svg,'polyline',{points:curve.points.map(([x,s])=>xx(x)+','+yy(s)).join(' '),fill:'none',stroke:curve.color,'stroke-width':2,...(curve.dash?{'stroke-dasharray':'4 4'}:{})});
}
function current(){
 const rows=window.__almLimitParse(el('src').value),te=rows.map(r=>r.te),se=rows.map(r=>r.se);
 if(te.length<3)throw Error('At least three studies required.');const c={te,se},measure=el('plus-binary-measure').value;
 if(measure)c.binary={measure,rows:el('plus-binary-counts').value.trim().split(/\n/).map(line=>line.split(',').map(x=>x.trim()?Number(x):NaN))};
 return c;
}
function clear(message='Run comparisons using the current input. Independent validation is separate below.'){
 state=null;
 for(const id of ['plus-body','plus-details','plus-forest','plus-funnel','plus-interpretation'])el(id).replaceChildren();
 el('plus-status').textContent=message;
}
function run(){
 try {window.__almLimitValidationRun(el('src').value,false);const c=current(),limit=window._almLastLimit();
  render(AlmLimitPlus.compute(c,limit,+el('plus-alpha').value,el('limit-error').textContent||undefined),c,limit);el('plus-status').textContent='Sensitivity calculations complete. Check the independent validation panel before interpreting results.';
 }catch(e){clear('Refused: '+e.message);}
}
root.querySelectorAll('input[type=checkbox]').forEach(n=>n.addEventListener('change',()=>draw()));
el('plus-run').addEventListener('click',run);
el('plus-alpha').addEventListener('change',()=>{if(state)run();});
window.AlmLimitPlusUI={render,run,clear,drawReference:(results,c,limit,lookup)=>draw({results,c,limit},lookup),snapshot:()=>state,restore:s=>{if(s)render(s.results,s.c,s.limit);else clear();}};
})();
