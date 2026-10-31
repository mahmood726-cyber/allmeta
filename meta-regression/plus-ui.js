(function(){
 'use strict';
 const $=id=>document.getElementById(id), escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>n.toPrecision(12), number=(key,n)=>`<span data-plus-number="${key}">${fmt(n)}</span>`;
 let current=null;
 const DECIMAL=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
 const RANK=/not of full rank|rank deficient/;
 function advise(reason){$('plus-advice').textContent=reason&&RANK.test(reason)?'Hint: if the moderators are on very different scales (for example year and sample size), centre or rescale them (for example year minus 2000, or sample size in thousands) and fit again. If a column repeats another, remove it.':'';}
 function parse(text,interaction){
  const lines=text.trim().split(/\r?\n/).map(l=>l.split(',').map(s=>s.trim()));
  const names=lines.shift();
  if(names.length<4||names.length>5||names[0]!=='yi'||names[1]!=='vi')throw Error('The first line must be the header yi,vi followed by two or three moderator names (found: '+names.join(',').slice(0,80)+')');
  lines.forEach((r,i)=>{
   const where='Row '+(i+1)+' (line '+(i+2)+')';
   if(r.length!==names.length)throw Error(where+' has '+r.length+' values but the header has '+names.length+'. Every cell must contain finite numbers; rows with missing values are refused, not dropped');
   r.forEach((x,j)=>{if(!x||!DECIMAL.test(x)||!Number.isFinite(Number(x)))throw Error(where+', column '+names[j]+': '+(x?'"'+x.slice(0,20)+'" is not a number':'value is missing')+'. Every cell must contain finite numbers; rows with missing values are refused, not dropped');});
   if(!(Number(r[1])>0))throw Error(where+', column vi: sampling variances must be greater than zero');
  });
  const rows=lines.map(r=>r.map(Number));
  const input={yi:rows.map(r=>r[0]),vi:rows.map(r=>r[1]),mods:rows.map(r=>r.slice(2)),names:names.slice(2),interaction};
  AlmMetaPlus.validate(input);return input;
 }
 function plot(r,c){
  if(r.status!=='ok')return '';
  const p=r.plot,lo=p.x[0],hi=p.x.at(-1),low=Math.min(...c.yi,...p.ciLo),high=Math.max(...c.yi,...p.ciHi);
  const pad=(high-low)*.08||1,ylo=low-pad,yhi=high+pad;
  const X=v=>70+600*(v-lo)/(hi-lo),Y=v=>360-320*(v-ylo)/(yhi-ylo);
  const points=values=>p.x.map((v,i)=>`${X(v)},${Y(values[i])}`).join(' ');
  const band=points(p.ciHi)+' '+p.x.map((v,i)=>`${X(v)},${Y(p.ciLo[i])}`).reverse().join(' ');
  const maxWeight=Math.max(...p.weights);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440" role="img" aria-label="ML meta-regression bubble plot with confidence band" style="all:initial;display:block;width:100%;height:auto;background:#fff;color:#17212b;font:12px Arial,sans-serif;overflow:hidden">
   <rect x="0" y="0" width="720" height="440" fill="#fff"/>
   <polygon data-role="band" points="${band}" fill="#c7dded" stroke="none"/>
   <polyline data-role="fit" points="${points(p.pred)}" fill="none" stroke="#174d73" stroke-width="2"/>
   ${c.yi.map((v,i)=>`<circle data-role="bubble" cx="${X(c.mods[i][0])}" cy="${Y(v)}" r="${12*Math.sqrt(p.weights[i]/maxWeight)}" fill="#356d94" fill-opacity="0.6" stroke="#174d73" stroke-width="1"/>`).join('')}
   <path d="M70 40V360H670" fill="none" stroke="#17212b" stroke-width="1"/>
   ${[lo,hi].map(v=>`<line data-axis="x" x1="${X(v)}" x2="${X(v)}" y1="360" y2="365" stroke="#17212b"/><text data-tick="x" x="${X(v)}" y="384" text-anchor="middle" fill="#17212b">${v.toPrecision(6)}</text>`).join('')}
   ${[ylo,yhi].map(v=>`<line data-axis="y" x1="65" x2="70" y1="${Y(v)}" y2="${Y(v)}" stroke="#17212b"/><text data-tick="y" x="62" y="${Y(v)+4}" text-anchor="end" fill="#17212b">${v.toPrecision(6)}</text>`).join('')}
   <text data-title="x" x="370" y="422" text-anchor="middle" fill="#17212b">${escape(c.names[0])}</text>
   <text data-title="y" x="20" y="200" transform="rotate(-90 20 200)" text-anchor="middle" fill="#17212b">Effect (entered scale)</text>
  </svg>`;
 }
 function render(r,c){
  current={result:structuredClone(r),input:structuredClone(c)};
  $('plus-export').disabled=r.status!=='ok';
  $('plus-status').classList.toggle('plus-refused',r.status!=='ok');
  advise(r.status!=='ok'?r.reason:'');
  if(r.status!=='ok'){$('plus-status').textContent='Refused: '+r.reason;$('plus-results').replaceChildren();$('plus-plot').replaceChildren();return;}
  $('plus-status').textContent='ML models fitted on the same complete rows. Normal-theory inference; 95% confidence intervals.';
  let html='';
  for(const model of ['reduced','full']){
   const v=r[model],terms=model==='full'?r.terms:r.reducedTerms;
   html+=`<h3 data-model-heading="${model}">${model==='full'?'Full model':'Reduced model'}</h3><table data-model="${model}"><thead><tr>${['Term','Estimate','SE','z','p','CI lower','CI upper'].map(t=>'<th scope="col">'+t+'</th>').join('')}</tr></thead><tbody>`;
   terms.forEach((name,i)=>{html+=`<tr><th scope="row" data-term="${model}.${i}">${escape(name)}</th>${['beta','se','z','pval','ciLo','ciHi'].map(key=>`<td>${number(model+'.'+key+'.'+i,v[key][i])}</td>`).join('')}</tr>`;});
   html+=`</tbody></table><dl data-summary="${model}">`;
   for(const [key,label] of Object.entries({k:'Studies',p:'Coefficients',tau2:'Residual tau-squared',logLik:'Log likelihood',AIC:'AIC',BIC:'BIC'}))html+=`<dt>${label}</dt><dd>${number(model+'.'+key,v[key])}</dd>`;
   html+='</dl>';
  }
  html+=`<h3>Nested model comparison (ML)</h3><p data-comparison-label>${c.interaction?'Full model adds the interaction between the first two moderators to the additive model.':'Full model adds the remaining moderators to the model containing the first moderator.'}</p><dl data-summary="comparison">`;
  for(const [key,label]of Object.entries({LRT:'Likelihood-ratio statistic',df:'Degrees of freedom',pval:'p'}))html+=`<dt>${label}</dt><dd>${number('comparison.'+key,r.comparison[key])}</dd>`;
  html+='</dl><p>Bubble area is proportional to the ML inverse-variance weight. The line and confidence band vary the first moderator; other moderators are held at their arithmetic means. Observed study effects are unadjusted.</p><dl>';
  r.plot.held.forEach((v,i)=>{html+=`<dt data-held-label="${i}">${escape(c.names[i+1])}</dt><dd>${number('plot.held.'+i,v)}</dd>`;});
  html+='</dl>';
  $('plus-results').innerHTML=html;$('plus-plot').innerHTML=plot(r,c);
 }
 function run(){
  try{const c=parse($('plus-data').value,$('plus-interaction').checked);render(AlmMetaPlus.compute(c),c);}
  catch(e){current=null;advise(e.message);$('plus-status').textContent='Refused: '+e.message;$('plus-status').classList.add('plus-refused');$('plus-results').replaceChildren();$('plus-plot').replaceChildren();$('plus-export').disabled=true;}
 }
 function exportPayload(){if(!current||current.result.status!=='ok')throw Error('Fit valid inputs before exporting');return structuredClone({schema:'meta-regression-plus-v1',...current,...(window.AlmBuildInfo?{producedBy:window.AlmBuildInfo}:{})});}
 $('plus-run').onclick=run;
 const example=$('plus-data').defaultValue;
 $('plus-example').onclick=()=>{$('plus-data').value=example;$('plus-interaction').checked=false;run();$('plus-status').textContent='Example loaded (metadat::dat.bcg: year and absolute latitude). '+$('plus-status').textContent;};
 $('plus-data').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();run();}});
 for(const id of ['plus-data','plus-interaction'])$(id).addEventListener('input',()=>{current=null;advise('');$('plus-status').classList.remove('plus-refused');$('plus-status').textContent='Inputs changed. Fit the models to update results.';$('plus-results').replaceChildren();$('plus-plot').replaceChildren();$('plus-export').disabled=true;});
 $('plus-export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(exportPayload(),null,2)+'\n'],{type:'application/json'}));a.href=url;a.download='meta-regression-plus.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 window.AlmMetaPlusUI=Object.freeze({parse,render,run,plot,exportPayload,current:()=>structuredClone(current),snapshot:()=>({data:$('plus-data').value,interaction:$('plus-interaction').checked,current:structuredClone(current),status:$('plus-status').textContent}),restore:s=>{$('plus-data').value=s.data;$('plus-interaction').checked=s.interaction;if(s.current)render(s.current.result,s.current.input);else{current=null;$('plus-results').replaceChildren();$('plus-plot').replaceChildren();$('plus-export').disabled=true;}$('plus-status').textContent=s.status;}});
 run();
})();
