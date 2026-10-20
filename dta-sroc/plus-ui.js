(function(g){
'use strict';
const host=document.getElementById('alm-plus');
host.innerHTML=`<h2>Bivariate meta-regression extras</h2>
<p>One study-level covariate. Conditional summary point and 95% confidence and prediction regions in ROC space. No SROC curve is drawn for meta-regression, as in mada.</p>
<label>Reference configuration <select id="plus-example"><option value="">Choose reference data</option></select></label> <button id="plus-load" type="button">Load reference data</button>
<p id="plus-source"></p>
<label>Study data: TP,FN,FP,TN,x (one row per study; x in the units supplied)<textarea id="plus-data" rows="7" style="width:100%"></textarea></label>
<label>Method <select id="plus-method"><option value="reml">REML</option><option value="ml">ML</option><option value="fixed">Fixed effect</option></select></label>
<label>Continuity correction (0.5) <select id="plus-correction"><option value="all">All studies when any cell is zero</option><option value="single">Studies with a zero cell</option><option value="none">None</option></select></label>
<label>Covariate prediction value <input id="plus-at" type="number" step="any" value="0"></label>
<label>Prevalence (0 to 1) <input id="plus-prevalence" type="number" step="any" min="0" max="1" value="0.1"></label>
<button id="plus-fit" type="button">Fit extras</button> <button id="plus-export" type="button" disabled>Export extras JSON</button>
<p id="plus-error" role="status"></p><p id="plus-scale-note" role="note"></p><div id="plus-results"></div>
<h3>Validate the extras in R</h3><p>R mada 0.5.12 reference replay; separate from the original paper checks. The reference is <code>reitsma()</code> with <code>control=list(maxiter=1000, reltol=1e-12)</code>; with mada's default control, results can differ from these beyond 1e-6. <a href="validate/README-plus.md">Scope, tolerances and reproduction</a>.</p>
<button id="plus-validate" type="button">Replay pinned extras corpus</button> <button id="plus-live" type="button">Check current extras in live R</button><p id="plus-validation" role="status"></p>`;
const el=id=>document.getElementById('plus-'+id);
let current=null;
// Decimal and exponent numbers only: Number() would also accept 0x1F, 0b101, 0o17 and Infinity.
const DECIMAL=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
function input(){const rows=el('data').value.trim().split(/\r?\n/).map(line=>{const a=line.split(',');if(a.length!==5||a.some(v=>!DECIMAL.test(v.trim())))throw Error('Each row must contain TP,FN,FP,TN,x');return Object.fromEntries(['TP','FN','FP','TN','x'].map((k,i)=>[k,Number(a[i])]));});
 if(!el('at').value.trim()||!el('prevalence').value.trim())throw Error('Prediction value and prevalence are required');
 return {rows,method:el('method').value,correction:el('correction').value,at:Number(el('at').value),prevalence:Number(el('prevalence').value)};}
function model(s){const f=AlmDTAPlus.fit(s.rows,s.method,s.correction),q=AlmDTAPlus.predict(f,s.at,s.prevalence);return {input:s,coefficients:f.coefTable.map(v=>({outcome:v.outcome,term:v.term,estimate:v.estimate,se:v.se,z:v.z,p:v.p,lo:v.ci[0],hi:v.ci[1]})),prediction:q,studies:s.rows.length};}
function plot(q){const path=kind=>q.regions[kind].map((v,i)=>(i?'L':'M')+(50+340*v[1])+','+(370-340*v[0])).join(' ')+' Z';return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Conditional ROC regions" viewBox="0 0 440 420" width="440" height="420" style="display:block;max-width:100%;height:auto;background:white;color:black">
<path d="M50 30 V370 H390" fill="none" stroke="black" stroke-width="1"/>
<path data-region="prediction" d="${path('prediction')}" fill="none" stroke="#a34c00" stroke-width="2" stroke-dasharray="6 4"/>
<path data-region="confidence" d="${path('confidence')}" fill="none" stroke="#1554a0" stroke-width="2"/>
<circle cx="${50+340*(1-q.spec)}" cy="${370-340*q.sens}" r="4" fill="black"/>
<g font-family="sans-serif" font-size="12" fill="black"><text x="45" y="388">0</text><text x="385" y="388">1</text><text x="32" y="374">0</text><text x="32" y="35">1</text><text x="145" y="410">False positive rate</text><text transform="translate(15 245) rotate(-90)">Sensitivity</text></g></svg>`;}
const fields=['estimate','se','z','p','lo','hi'];
function html(m){const q=m.prediction;return `<p>Studies: <span data-value="studies">${m.studies}</span></p><table><caption>Regression coefficients (logit scale)</caption><thead><tr><th>Outcome</th><th>Term</th>${fields.map(k=>'<th>'+k+'</th>').join('')}</tr></thead><tbody>${m.coefficients.map((r,i)=>'<tr><th>'+r.outcome+'</th><th>'+r.term+'</th>'+fields.map(k=>`<td data-value="coefficients.${i}.${k}">${r[k]}</td>`).join('')+'</tr>').join('')}</tbody></table><dl>${[['sens','Sensitivity'],['spec','Specificity'],['positive','Disease probability after a positive test'],['negative','Disease probability after a negative test']].map(([k,l])=>`<dt>${l}</dt><dd data-value="prediction.${k}">${q[k]}</dd>`).join('')}</dl>${plot(q)}<p>Blue solid: confidence region. Brown dashed: prediction region.</p>`;}
function clear(){current=null;el('results').replaceChildren();el('export').disabled=true;el('error').textContent='';el('scale-note').textContent='';}
function scaleNote(s){if(!AlmDTAPlus.scaleNoteShown(s.rows))return '';const m=AlmDTAPlus.covariateMoments(s.rows);
 return `The covariate is not standardised: its mean is ${(Math.abs(m.mean)/m.sd).toPrecision(3)} standard deviations from zero and its SD is ${m.sd.toPrecision(3)}. The intercept is the value at x = 0 (for raw calendar years, far outside the data). The fit is computed on the standardised covariate, (x - mean)/SD, and reported in the supplied units, but mada::reitsma run on these raw values can differ from it by more than the 1e-6 validation tolerance in standard errors, intervals and regions (up to about 2e-4 relative in the validation set), also for a centred covariate with a large or small SD. Standardise the covariate (x - mean)/SD to compare with R.`;}
function render(){clear();try{const s=input();current=model(s);el('results').innerHTML=html(current);el('export').disabled=false;el('scale-note').textContent=scaleNote(s);}catch(e){el('error').textContent=e.message;}return current;}
function set(s){el('data').value=s.rows.map(r=>['TP','FN','FP','TN','x'].map(k=>r[k]).join(',')).join('\n');for(const k of ['method','correction','at','prevalence'])el(k).value=s[k];return render();}
function exportJSON(){if(!current)throw Error('No current extras result');return JSON.stringify(current,null,2);}
el('fit').onclick=render;el('export').onclick=()=>{const url=URL.createObjectURL(new Blob([exportJSON()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='dta-sroc-extras.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
for(const k of ['data','method','correction','at','prevalence'])el(k).addEventListener('input',()=>{clear();el('source').textContent='User data; covariate used in supplied units.';el('validation').textContent='';});
g.AlmDTAPlusUI={input,model,html,plot,render,set,exportJSON,scaleNote,get current(){return current;}};
})(globalThis);
