/* Fixed clean renderer for the extras display contract; independent of the UI renderer. */
(function(g){'use strict';
function plot(q){const path=kind=>q.regions[kind].map((v,i)=>(i?'L':'M')+(50+340*v[1])+','+(370-340*v[0])).join(' ')+' Z';return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Conditional ROC regions" viewBox="0 0 440 420" width="440" height="420" style="display:block;max-width:100%;height:auto;background:white;color:black">
<path d="M50 30 V370 H390" fill="none" stroke="black" stroke-width="1"/>
<path data-region="prediction" d="${path('prediction')}" fill="none" stroke="#a34c00" stroke-width="2" stroke-dasharray="6 4"/>
<path data-region="confidence" d="${path('confidence')}" fill="none" stroke="#1554a0" stroke-width="2"/>
<circle cx="${50+340*(1-q.spec)}" cy="${370-340*q.sens}" r="4" fill="black"/>
<g font-family="sans-serif" font-size="12" fill="black"><text x="45" y="388">0</text><text x="385" y="388">1</text><text x="32" y="374">0</text><text x="32" y="35">1</text><text x="145" y="410">False positive rate</text><text transform="translate(15 245) rotate(-90)">Sensitivity</text></g></svg>`;}
const fields=['estimate','se','z','p','lo','hi'];
function html(m){const q=m.prediction;return `<p>Studies: <span data-value="studies">${m.studies}</span></p><table><caption>Regression coefficients (logit scale)</caption><thead><tr><th>Outcome</th><th>Term</th>${fields.map(k=>'<th>'+k+'</th>').join('')}</tr></thead><tbody>${m.coefficients.map((r,i)=>'<tr><th>'+r.outcome+'</th><th>'+r.term+'</th>'+fields.map(k=>`<td data-value="coefficients.${i}.${k}">${r[k]}</td>`).join('')+'</tr>').join('')}</tbody></table><dl>${[['sens','Sensitivity'],['spec','Specificity'],['positive','Disease probability after a positive test'],['negative','Disease probability after a negative test']].map(([k,l])=>`<dt>${l}</dt><dd data-value="prediction.${k}">${q[k]}</dd>`).join('')}</dl>${plot(q)}<p>Blue solid: confidence region. Brown dashed: prediction region.</p>`;}
g.AlmDTAPlusReference=Object.freeze({plot,html});})(globalThis);
