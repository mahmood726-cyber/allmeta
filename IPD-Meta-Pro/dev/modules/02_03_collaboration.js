const CollaborationSystem = {

 encode: function() {

 var state = { data: (APP.currentData||[]).slice(0,30), settings: APP.analysisSettings, v:'2', t:Date.now() };

 try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); } catch(e) { return null; }

 },

 getShareURL: function() {

 var enc = this.encode();

 if (!enc || enc.length > 2000) return null;

 return location.origin + location.pathname + '?s=' + enc;

 },

 loadFromURL: function() {

 var p = new URLSearchParams(location.search).get('s');

 if (p) { try { var s = JSON.parse(decodeURIComponent(escape(atob(p)))); if(s.data)APP.currentData=s.data; console.log('Loaded shared state'); } catch(e){ console.warn('Failed to load shared state:', e.message); } }

 },

 downloadState: function() {

 var b = new Blob([JSON.stringify({data:APP.currentData,results:APP.lastResults,t:Date.now()},null,2)],{type:'application/json'});

 var url = URL.createObjectURL(b);

 var a = document.createElement('a');

 a.href = url;

 a.download = 'ipd-analysis-' + new Date().toISOString().slice(0,10) + '.json';

 document.body.appendChild(a);

 a.click();

 setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);

 },

 show: function() {

 var url = this.getShareURL();

 var h = '<div class="modal-overlay active"><div class="modal" style="max-width:550px">';

 h += '<div class="modal-header"><h3>Share Analysis</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 h += '<div class="modal-body">';

 if (url) {

 h += '<p><b>Shareable Link:</b></p><input id="shareUrl" value="'+url+'" style="width:100%;padding:0.5rem" readonly>';

 h += '<button class="btn btn-primary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(document.getElementById(\'shareUrl\').value);alert(\'Copied!\')">Copy</button>';

 } else {

 h += '<p>Data too large for URL. Use file export:</p>';

 }

 h += '<hr style="margin:1rem 0"><button class="btn btn-secondary" onclick="CollaborationSystem.downloadState()">Download State File</button>';

 h += '</div></div></div>';

 var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);

 }

 };

 document.addEventListener('DOMContentLoaded', function(){ CollaborationSystem.loadFromURL(); });



 const LivingReviewSystem = {

 snapshots: [],

 load: function() { try { var s=localStorage.getItem('ipd_snapshots'); if(s)this.snapshots=JSON.parse(s); } catch(e){ console.warn('Failed to load snapshots:', e.message); } },

 save: function() { try { localStorage.setItem('ipd_snapshots',JSON.stringify(this.snapshots)); } catch(e){ console.warn('Failed to save snapshots:', e.message); } },

 take: function(r,label) {

 this.snapshots.push({ id:Date.now(), t:new Date().toISOString(), label:label||'Snapshot', k:r.nStudies||r.k, est:r.estimate||r.pooledEffect, ci:[r.ci_lower,r.ci_upper], p:r.pValue, I2:r.I2 });

 this.save();

 },

 checkChange: function() {

 if (this.snapshots.length<2) return null;

 var f=this.snapshots[0], l=this.snapshots[this.snapshots.length-1];

 return { sigChange:(f.p<0.05)!==(l.p<0.05), dirChange:(f.est>0)!==(l.est>0), effectChange:Math.abs((l.est-f.est)/f.est)*100 };

 },

 show: function() {

 this.load();

 var chg = this.checkChange();

 var h = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:85vh;overflow-y:auto">';

 h += '<div class="modal-header"><h3>Living Review Dashboard</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 h += '<div class="modal-body">';

 h += '<p style="margin-bottom:1rem">Track how conclusions evolve as evidence accumulates. <em>(Elliott 2017)</em></p>';

 if (this.snapshots.length===0) { h += '<p>No snapshots yet. Save current analysis to begin tracking.</p>'; }

 else {

 h += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem"><tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Date</th><th>k</th><th>Effect</th><th>p</th><th>I2</th></tr>';

 this.snapshots.forEach(function(s){

 h += '<tr><td style="padding:0.5rem">'+new Date(s.t).toLocaleDateString()+'</td><td>'+s.k+'</td><td>'+(s.est?s.est.toFixed(3):'?')+'</td><td style="'+(s.p<0.05?'color:#22c55e':'')+'">'+(s.p?s.p.toFixed(4):'?')+'</td><td>'+(s.I2?s.I2.toFixed(0)+'%':'?')+'</td></tr>';

 }); h += '</table>';

 if (chg && (chg.sigChange||chg.dirChange)) {

 h += '<div style="background:rgba(239,68,68,0.1);padding:1rem;margin-top:1rem;border-radius:8px"><b style="color:#ef4444">Conclusion Changed!</b>';

 if(chg.sigChange) h+='<p>Significance status changed</p>';

 if(chg.dirChange) h+='<p>Effect direction reversed</p>';

 h += '</div>';

 }

 }

 h += '<div style="margin-top:1rem"><button class="btn btn-primary" onclick="LivingReviewSystem.saveCurrent()">Save Current</button>';

 h += '<button class="btn btn-secondary" style="margin-left:0.5rem" onclick="if(confirm(\'Clear all?\'))LivingReviewSystem.clear()">Clear All</button></div>';

 h += '</div></div></div>';

 var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);

 },

 saveCurrent: function() { if(!APP.lastResults){alert('Run analysis first');return;} this.take(APP.lastResults,prompt('Label:')); alert('Saved!'); },

 clear: function() { this.snapshots=[]; this.save(); alert('Cleared'); }

 };



 const MLHeterogeneityExplorer = {

 calcImportance: function(studies, covs) {

 var res = {};

 var effs = studies.map(function(s){return s.yi||s.effect||0;});

 var wts = studies.map(function(s){return 1/(s.vi||s.variance||0.01);});

 var sumW = wts.reduce(function(a,b){return a+b;},0);

 var pooled = effs.reduce(function(s,e,i){return s+e*wts[i];},0)/sumW;

 var baseSS = effs.reduce(function(s,e,i){return s+wts[i]*Math.pow(e-pooled,2);},0);

 var self = this;

 covs.forEach(function(c){

 var vals = studies.map(function(s){return s[c];}).filter(function(v){return v!==undefined&&v!==null;});

 if (vals.length < studies.length*0.5) { res[c]={imp:0,note:'Insufficient'}; return; }

 var grps = self.group(studies,c);

 var withinSS = 0;

 Object.values(grps).forEach(function(g){

 if(g.length<2)return;

 var ge = g.map(function(s){return s.yi||s.effect||0;});

 var gm = ge.reduce(function(a,b){return a+b;},0)/ge.length;

 withinSS += ge.reduce(function(s,e){return s+Math.pow(e-gm,2);},0);

 });

 res[c] = { imp: Math.max(0,(baseSS-withinSS)/baseSS*100), interp: (baseSS-withinSS)/baseSS>0.25?'Major':'Minor' };

 });

 return res;

 },

 group: function(studies,c) {

 var grps = {};

 var nums = studies.map(function(s){return s[c];}).filter(function(v){return typeof v==='number';});

 var med = nums.length>0 ? nums.sort(function(a,b){return a-b;})[Math.floor(nums.length/2)] : null;

 studies.forEach(function(s){

 var v = s[c]; if(typeof v==='number'&&med!==null) v = v<=med?'Low':'High';

 if(v!==undefined&&v!==null) { if(!grps[v])grps[v]=[]; grps[v].push(s); }

 });

 return grps;

 },

 detectCovs: function(studies) {

 if(!studies||!studies[0])return[];

 var excl=['yi','vi','effect','variance','se','weight','id'];

 return Object.keys(studies[0]).filter(function(k){

 if(excl.indexOf(k.toLowerCase())>=0)return false;

 return studies.filter(function(s){return s[k]!==undefined;}).length>=studies.length*0.5;

 });

 },

 show: function() {

 var data = APP.currentData;

 if(!data||data.length===0){alert('No data');return;}

 var covs = this.detectCovs(data);

 if(covs.length===0){alert('No covariates found');return;}

 var imp = this.calcImportance(data, covs);

 var sorted = Object.entries(imp).sort(function(a,b){return b[1].imp-a[1].imp;});

 var h = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';

 h += '<div class="modal-header"><h3>ML Heterogeneity Explorer</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 h += '<div class="modal-body"><p>Which variables explain between-study variance:</p>';

 h += '<table style="width:100%;border-collapse:collapse"><tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem;text-align:left">Variable</th><th>Importance</th><th>Role</th></tr>';

 sorted.forEach(function(e){

 var bar = Math.min(100,e[1].imp);

 h += '<tr><td style="padding:0.5rem">'+e[0]+'</td><td><div style="background:var(--bg-tertiary);height:16px;width:100px;display:inline-block"><div style="background:#3b82f6;height:100%;width:'+bar+'%"></div></div> '+e[1].imp.toFixed(1)+'%</td><td>'+e[1].interp+'</td></tr>';

 }); h += '</table>';

 h += '<p style="margin-top:1rem;font-size:0.9rem">High-importance variables should be prioritized in subgroup analyses.</p>';

 h += '</div></div></div>';

 var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);

 }

 };



 const ResultsInterpreter = {

 interpret: function(r) {

 var sects=[], eff=r.estimate||r.pooledEffect;

 sects.push(eff>0 ? 'Positive effect ('+eff.toFixed(3)+')' : eff<0 ? 'Negative effect ('+eff.toFixed(3)+')' : 'No effect');

 if(r.pValue!==undefined) sects.push(r.pValue<0.001?'Highly significant (p<0.001)':r.pValue<0.05?'Significant (p='+r.pValue.toFixed(3)+')':'Not significant (p='+r.pValue.toFixed(3)+')');

 if(r.I2!==undefined) sects.push(r.I2<25?'Consistent results (I2='+r.I2.toFixed(0)+'%)':r.I2<50?'Moderate variation':r.I2<75?'Substantial variation':'Considerable variation (interpret cautiously)');

 return { summary:sects[0], full:sects.join('. ')+'.' };

 },

 abstract: function(r) {

 var k=r.nStudies||r.k||'?', e=r.estimate||r.pooledEffect;

 return 'RESULTS: '+k+' studies. Pooled effect: '+(e?e.toFixed(3):'?')+' (95% CI: '+(r.ci_lower?r.ci_lower.toFixed(2):'?')+' to '+(r.ci_upper?r.ci_upper.toFixed(2):'?')+')'+(r.pValue?', p='+r.pValue.toFixed(3):'')+'. '+(r.I2!==undefined?'I2='+r.I2.toFixed(0)+'%.':'');

 },

 show: function() {

 if(!APP.lastResults){alert('Run analysis first');return;}

 var i=this.interpret(APP.lastResults), ab=this.abstract(APP.lastResults);

 var h = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';

 h += '<div class="modal-header"><h3>Plain Language Interpretation</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 h += '<div class="modal-body">';

 h += '<div style="padding:1rem;background:var(--bg-tertiary);border-radius:8px;margin-bottom:1rem"><h4>Summary</h4><p style="font-size:1.1rem">'+i.summary+'</p></div>';

 h += '<p>'+i.full+'</p>';

 h += '<h4 style="margin-top:1.5rem">Draft Abstract</h4><textarea id="absText" style="width:100%;height:70px;padding:0.5rem" readonly>'+ab+'</textarea>';

 h += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(document.getElementById(\'absText\').value)">Copy</button>';

 h += '</div></div></div>';

 var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);

 }

 };



 const OneClickAnalysis = {

 run: function() {

 if(!APP.currentData||APP.currentData.length===0){alert('No data');return;}

 var rep=['='+'='.repeat(50),'ONE-CLICK COMPLETE ANALYSIS','Generated: '+new Date().toISOString(),'='+'='.repeat(50),''];



 var m = AutoMethodSelector.run ? AutoMethodSelector.analyze(APP.currentData) : null;

 if(m) rep.push('DATA: '+m.n+' studies, I2='+m.I2.toFixed(1)+'%','');



 if(APP.lastResults) {

 var r=APP.lastResults;

 rep.push('POOLED EFFECT: '+(r.estimate||r.pooledEffect||'?'));

 rep.push('95% CI: ['+(r.ci_lower||'?')+', '+(r.ci_upper||'?')+']');

 rep.push('p-value: '+(r.pValue||'?'));

 rep.push('I2: '+(r.I2?r.I2.toFixed(1)+'%':'?'),'');

 }



 if(APP.lastResults&&GRADEAssessment) { var g=GRADEAssessment.assess(APP.lastResults); rep.push('GRADE: '+g.certainty,''); }



 if(APP.lastResults&&ResultsInterpreter) { var i=ResultsInterpreter.interpret(APP.lastResults); rep.push('INTERPRETATION: '+i.full,''); }



 if(APP.lastResults&&LivingReviewSystem) { LivingReviewSystem.take(APP.lastResults,'OneClick'); rep.push('Living review snapshot saved.',''); }

 rep.push('='+'='.repeat(50));

 var h = '<div class="modal-overlay active"><div class="modal" style="max-width:700px">';

 h += '<div class="modal-header"><h3>Complete Analysis</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 h += '<div class="modal-body"><pre style="background:var(--bg-tertiary);padding:1rem;overflow:auto;max-height:50vh;font-size:0.85rem">'+rep.join('\n')+'</pre>';

 h += '<button class="btn btn-primary" style="margin-top:1rem" onclick="navigator.clipboard.writeText(document.querySelector(\'pre\').textContent)">Copy</button></div></div></div>';

 var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);

 }

 };



 const SelectionModels = {



 copasModel: function(effects, variances, rho) {

 rho = rho || 0.5;

 const n = effects.length;

 const ses = variances.map(v => Math.sqrt(v));



 const weights = variances.map(v => 1/v);

 const sumW = weights.reduce((a,b) => a+b, 0);

 const thetaHat = effects.reduce((s,e,i) => s + e*weights[i], 0) / sumW;



 const gamma0 = 0;

 const gamma1 = rho * 2;



 const adjWeights = effects.map((e, i) => {

 const selectProb = this.normalCDF(gamma0 + gamma1 / ses[i]);

 return weights[i] * selectProb;

 });

 const adjSumW = adjWeights.reduce((a,b) => a+b, 0);

 const adjTheta = effects.reduce((s,e,i) => s + e*adjWeights[i], 0) / adjSumW;



 return {

 original: thetaHat,

 adjusted: adjTheta,

 rho: rho,

 bias: thetaHat - adjTheta,

 interpretation: Math.abs(thetaHat - adjTheta) < 0.1 ?

 'Minimal sensitivity to selection' :

 'Results sensitive to selection assumptions'

 };

 },



 petPeese: function(effects, variances) {

 const ses = variances.map(v => Math.sqrt(v));

 const n = effects.length;



 const petReg = this.weightedRegression(ses, effects, variances.map(v => 1/v));



 const peeseReg = this.weightedRegression(variances, effects, variances.map(v => 1/v));



 const petZ = petReg.intercept / petReg.seIntercept;

 const petP = 2 * (1 - this.normalCDF(Math.abs(petZ)));

 const usePeese = petP < 0.10;



 return {

 pet: {

 intercept: petReg.intercept,

 se: petReg.seIntercept,

 p: petP,

 interpretation: 'Effect at infinite precision (SE=0)'

 },

 peese: {

 intercept: peeseReg.intercept,

 se: peeseReg.seIntercept,

 interpretation: 'Effect at zero variance'

 },

 recommendation: usePeese ?

 'Use PEESE estimate (evidence of small-study effects)' :

 'Use PET estimate (no clear small-study effects)',

 adjustedEffect: usePeese ? peeseReg.intercept : petReg.intercept,

 adjustedSE: usePeese ? peeseReg.seIntercept : petReg.seIntercept

 };

 },



 threeParameterSelection: function(effects, variances, pCutoffs) {

 pCutoffs = pCutoffs || [0.025, 0.5, 1.0];

 const n = effects.length;

 const ses = variances.map(v => Math.sqrt(v));



 const zScores = effects.map((e, i) => e / ses[i]);

 const pValues = zScores.map(z => 1 - this.normalCDF(z));



 const counts = [0, 0, 0];

 effects.forEach((e, i) => {

 if (pValues[i] <= pCutoffs[0]) counts[0]++;

 else if (pValues[i] <= pCutoffs[1]) counts[1]++;

 else counts[2]++;

 });



 const expected = [n * pCutoffs[0], n * (pCutoffs[1] - pCutoffs[0]), n * (1 - pCutoffs[1])];

 const selectionWeights = counts.map((c, i) => expected[i] > 0 ? c / expected[i] : 1);

 const maxW = Math.max(...selectionWeights);

 const normWeights = selectionWeights.map(w => w / maxW);



 return {

 intervals: pCutoffs.map((p, i) => ({

 cutoff: p,

 observed: counts[i],

 expected: expected[i].toFixed(1),

 selectionWeight: normWeights[i].toFixed(2)

 })),

 evidenceOfSelection: normWeights[2] < 0.5,

 interpretation: normWeights[2] < 0.5 ?

 'Evidence of selection against non-significant results' :

 'No strong evidence of p-value based selection'

 };

 },



 normalCDF: function(x) {

 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;

 const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

 const sign = x < 0 ? -1 : 1;

 x = Math.abs(x) / Math.sqrt(2);

 const t = 1 / (1 + p * x);

 const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

 return 0.5 * (1 + sign * y);

 },



 weightedRegression: function(x, y, weights) {

 const n = x.length;

 const sumW = weights.reduce((a,b) => a+b, 0);

 const sumWX = x.reduce((s,xi,i) => s + weights[i]*xi, 0);

 const sumWY = y.reduce((s,yi,i) => s + weights[i]*yi, 0);

 const sumWXY = x.reduce((s,xi,i) => s + weights[i]*xi*y[i], 0);

 const sumWX2 = x.reduce((s,xi,i) => s + weights[i]*xi*xi, 0);



 const slope = (sumW*sumWXY - sumWX*sumWY) / (sumW*sumWX2 - sumWX*sumWX);

 const intercept = (sumWY - slope*sumWX) / sumW;



 const predicted = x.map(xi => intercept + slope*xi);

 const residuals = y.map((yi,i) => yi - predicted[i]);

 const mse = residuals.reduce((s,r,i) => s + weights[i]*r*r, 0) / (n-2);

 const seSlope = Math.sqrt(mse * sumW / (sumW*sumWX2 - sumWX*sumWX));

 const seIntercept = Math.sqrt(mse * sumWX2 / (sumW*sumWX2 - sumWX*sumWX));



 return { intercept, slope, seIntercept, seSlope };

 },



 showSelectionModelAnalysis: function() {

 if (!APP.results || !APP.results.studies) {

 alert('Run analysis first');

 return;

 }

 const effects = APP.results.studies.map(s => s.effect);

 const variances = APP.results.studies.map(s => s.variance);



 const copas = this.copasModel(effects, variances, 0.5);

 const petPeese = this.petPeese(effects, variances);

 const threePSM = this.threeParameterSelection(effects, variances);



 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>Selection Models for Publication Bias</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<h4>1. Copas Selection Model</h4>';

 html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Models correlation between effect size and selection probability.</p>';

 html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';

 html += '<th style="padding:0.5rem">Original</th><th>Adjusted (rho=0.5)</th><th>Bias</th></tr>';

 html += '<tr><td style="padding:0.5rem;text-align:center">' + copas.original.toFixed(3) + '</td>';

 html += '<td style="text-align:center">' + copas.adjusted.toFixed(3) + '</td>';

 html += '<td style="text-align:center">' + copas.bias.toFixed(3) + '</td></tr></table>';

 html += '<p><em>' + copas.interpretation + '</em></p>';



 html += '<h4 style="margin-top:1.5rem">2. PET-PEESE Analysis</h4>';

 html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Stanley & Doucouliagos (2014): Precision-effect tests.</p>';

 html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';

 html += '<th style="padding:0.5rem">Method</th><th>Estimate</th><th>SE</th><th>Interpretation</th></tr>';

 html += '<tr><td style="padding:0.5rem">PET</td><td>' + petPeese.pet.intercept.toFixed(3) + '</td>';

 html += '<td>' + petPeese.pet.se.toFixed(3) + '</td><td>' + petPeese.pet.interpretation + '</td></tr>';

 html += '<tr><td style="padding:0.5rem">PEESE</td><td>' + petPeese.peese.intercept.toFixed(3) + '</td>';

 html += '<td>' + petPeese.peese.se.toFixed(3) + '</td><td>' + petPeese.peese.interpretation + '</td></tr></table>';

 html += '<p style="background:rgba(59,130,246,0.1);padding:0.75rem;border-radius:8px"><strong>Recommendation:</strong> ' + petPeese.recommendation + '</p>';



 html += '<h4 style="margin-top:1.5rem">3. Three-Parameter Selection Model</h4>';

 html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Vevea & Hedges (1995): Selection weights by p-value interval.</p>';

 html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';

 html += '<th style="padding:0.5rem">P-value Interval</th><th>Observed</th><th>Expected</th><th>Selection Weight</th></tr>';

 threePSM.intervals.forEach(function(int) {

 html += '<tr><td style="padding:0.5rem">p <= ' + int.cutoff + '</td>';

 html += '<td style="text-align:center">' + int.observed + '</td>';

 html += '<td style="text-align:center">' + int.expected + '</td>';

 html += '<td style="text-align:center">' + int.selectionWeight + '</td></tr>';

 });

 html += '</table>';

 html += '<p><em>' + threePSM.interpretation + '</em></p>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>References</h4>';

 html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li>Copas JB. What works?: selectivity models and meta-analysis. JRSS A. 1999;162:95-109</li>';

 html += '<li>Stanley TD, Doucouliagos H. Meta-regression approximations. Res Synth Methods. 2014;5:312-328</li>';

 html += '<li>Vevea JL, Hedges LV. A general linear model for estimating effect size. Psychol Methods. 1995;1:81-97</li>';

 html += '</ul></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 }

 };



 const EValueCalculator = {



 forRiskRatio: function(rr, ciLower, ciUpper) {



 const rrUse = rr >= 1 ? rr : 1/rr;

 const eValue = rrUse + Math.sqrt(rrUse * (rrUse - 1));



 const ciUse = rr >= 1 ? ciLower : 1/ciUpper;

 const eCi = ciUse >= 1 ? ciUse + Math.sqrt(ciUse * (ciUse - 1)) : 1;



 return {

 eValue: eValue,

 eCiLimit: eCi,

 interpretation: this.interpretEValue(eValue),

 description: 'An unmeasured confounder would need to be associated with both treatment and outcome by RR >= ' + eValue.toFixed(2) + ' to explain away the observed effect'

 };

 },



 forHazardRatio: function(hr, ciLower, ciUpper) {

 return this.forRiskRatio(hr, ciLower, ciUpper);

 },



 forOddsRatio: function(or, ciLower, ciUpper, prevalence) {

 prevalence = prevalence || 0.1;



 const rr = or / ((1 - prevalence) + prevalence * or);

 const rrLower = ciLower / ((1 - prevalence) + prevalence * ciLower);

 const rrUpper = ciUpper / ((1 - prevalence) + prevalence * ciUpper);

 return this.forRiskRatio(rr, rrLower, rrUpper);

 },



 forSMD: function(smd, ciLower, ciUpper) {



 const rr = Math.exp(0.91 * Math.abs(smd));

 const rrLower = Math.exp(0.91 * Math.abs(ciLower));

 const rrUpper = Math.exp(0.91 * Math.abs(ciUpper));

 return this.forRiskRatio(rr, Math.min(rrLower, rrUpper), Math.max(rrLower, rrUpper));

 },



 interpretEValue: function(eValue) {

 if (eValue >= 4) return 'Strong: Very large unmeasured confounding needed';

 if (eValue >= 2.5) return 'Moderate-Strong: Substantial confounding needed';

 if (eValue >= 1.5) return 'Moderate: Moderate confounding could explain effect';

 return 'Weak: Small confounding could explain effect';

 },



 showEValueCalculator: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';

 html += '<div class="modal-header"><h3>E-Value Calculator</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">The E-value indicates how strong unmeasured confounding would need to be to explain away an observed effect. <em>(VanderWeele & Ding, Ann Intern Med 2017)</em></p>';



 html += '<div style="display:grid;gap:1rem">';

 html += '<div><label>Effect Measure:</label><select id="evalMeasure" style="width:100%;padding:0.5rem;margin-top:0.25rem">';

 html += '<option value="rr">Risk Ratio / Hazard Ratio</option><option value="or">Odds Ratio</option><option value="smd">Standardized Mean Difference</option></select></div>';

 html += '<div><label>Effect Estimate:</label><input id="evalEffect" type="number" step="0.01" value="1.5" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

 html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">';

 html += '<div><label>CI Lower:</label><input id="evalLower" type="number" step="0.01" value="1.2" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

 html += '<div><label>CI Upper:</label><input id="evalUpper" type="number" step="0.01" value="1.9" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div></div>';

 html += '<div id="evalPrevalence" style="display:none"><label>Outcome Prevalence (for OR):</label><input id="evalPrev" type="number" step="0.01" value="0.1" min="0" max="1" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

 html += '<button class="btn btn-primary" onclick="EValueCalculator.calculate()">Calculate E-Value</button>';

 html += '</div>';



 html += '<div id="evalResult" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>Interpretation Guide</h4>';

 html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li><strong>E-value >= 4:</strong> Very robust - large confounding needed</li>';

 html += '<li><strong>E-value 2.5-4:</strong> Moderately robust</li>';

 html += '<li><strong>E-value 1.5-2.5:</strong> Some sensitivity to confounding</li>';

 html += '<li><strong>E-value < 1.5:</strong> Weak - easily explained by confounding</li>';

 html += '</ul></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);



 document.getElementById('evalMeasure').onchange = function() {

 document.getElementById('evalPrevalence').style.display = this.value === 'or' ? 'block' : 'none';

 };

 },



 calculate: function() {

 var measure = document.getElementById('evalMeasure').value;

 var effect = parseFloat(document.getElementById('evalEffect').value);

 var lower = parseFloat(document.getElementById('evalLower').value);

 var upper = parseFloat(document.getElementById('evalUpper').value);

 var prev = parseFloat(document.getElementById('evalPrev').value) || 0.1;



 var result;

 if (measure === 'rr') result = this.forRiskRatio(effect, lower, upper);

 else if (measure === 'or') result = this.forOddsRatio(effect, lower, upper, prev);

 else result = this.forSMD(effect, lower, upper);



 var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-left:4px solid #22c55e;border-radius:8px">';

 html += '<h4 style="margin:0">E-Value Results</h4>';

 html += '<p style="margin-top:0.5rem"><strong>E-value for point estimate:</strong> ' + result.eValue.toFixed(2) + '</p>';

 html += '<p><strong>E-value for CI limit:</strong> ' + result.eCiLimit.toFixed(2) + '</p>';

 html += '<p><strong>Strength:</strong> ' + result.interpretation + '</p>';

 html += '<p style="font-size:0.9rem;margin-top:0.75rem">' + result.description + '</p>';

 html += '</div>';



 document.getElementById('evalResult').innerHTML = html;

 document.getElementById('evalResult').style.display = 'block';

 }

 };



 const MultiplicityAdjustment = {



 bonferroni: function(pValues) {

 const m = pValues.length;

 return pValues.map(function(p) { return Math.min(1, p * m); });

 },



 holm: function(pValues) {

 const m = pValues.length;

 const indexed = pValues.map(function(p, i) { return {p: p, i: i}; });

 indexed.sort(function(a, b) { return a.p - b.p; });



 var maxAdj = 0;

 var adjusted = new Array(m);

 indexed.forEach(function(item, rank) {

 var adj = item.p * (m - rank);

 maxAdj = Math.max(maxAdj, adj);

 adjusted[item.i] = Math.min(1, maxAdj);

 });

 return adjusted;

 },



 benjaminiHochberg: function(pValues) {

 const m = pValues.length;

 const indexed = pValues.map(function(p, i) { return {p: p, i: i}; });

 indexed.sort(function(a, b) { return b.p - a.p; });



 var minAdj = 1;

 var adjusted = new Array(m);

 indexed.forEach(function(item, idx) {

 var rank = m - idx;

 var adj = item.p * m / rank;

 minAdj = Math.min(minAdj, adj);

 adjusted[item.i] = Math.min(1, minAdj);

 });

 return adjusted;

 },



 interactionTest: function(effect1, se1, effect2, se2) {

 var diff = effect1 - effect2;

 var seDiff = Math.sqrt(se1*se1 + se2*se2);

 var z = diff / seDiff;

 var p = 2 * (1 - this.normalCDF(Math.abs(z)));

 return { difference: diff, se: seDiff, z: z, p: p };

 },



 normalCDF: function(x) {

 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;

 const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

 const sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2);

 const t = 1 / (1 + p * x);

 const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

 return 0.5 * (1 + sign * y);

 },



 showMultiplicityPanel: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px">';

 html += '<div class="modal-header"><h3>Multiplicity Adjustments for Subgroup Analyses</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<div style="background:rgba(239,68,68,0.1);padding:1rem;border-radius:8px;margin-bottom:1rem">';

 html += '<strong>Warning:</strong> Multiple subgroup comparisons inflate Type I error. ';

 html += 'Always use interaction tests rather than comparing p-values across subgroups.';

 html += '</div>';



 html += '<h4>Enter P-Values from Subgroup Analyses</h4>';

 html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem">Enter comma-separated p-values:</p>';

 html += '<input id="multPValues" type="text" placeholder="0.03, 0.15, 0.04, 0.008" style="width:100%;padding:0.5rem">';

 html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="MultiplicityAdjustment.calculate()">Calculate Adjusted P-Values</button>';



 html += '<div id="multResult" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>Best Practice (Sun et al. BMJ 2012)</h4>';

 html += '<ol style="font-size:0.9rem;margin-left:1.5rem">';

 html += '<li>Pre-specify a small number of subgroups (ideally &le;5)</li>';

 html += '<li>Use interaction tests, not separate p-values</li>';

 html += '<li>Report interaction p-values, not subgroup-specific p-values</li>';

 html += '<li>Consider exploratory vs confirmatory intent</li>';

 html += '<li>Apply Bonferroni or BH correction for multiple comparisons</li>';

 html += '</ol></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 calculate: function() {

 var input = document.getElementById('multPValues').value;

 var pValues = input.split(',').map(function(s) { return parseFloat(s.trim()); }).filter(function(p) { return !isNaN(p); });



 if (pValues.length < 2) { alert('Enter at least 2 p-values'); return; }



 var bonf = this.bonferroni(pValues);

 var holm = this.holm(pValues);

 var bh = this.benjaminiHochberg(pValues);



 var html = '<table style="width:100%;border-collapse:collapse">';

 html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Original</th><th>Bonferroni</th><th>Holm</th><th>BH (FDR)</th></tr>';

 pValues.forEach(function(p, i) {

 html += '<tr><td style="padding:0.5rem;text-align:center">' + p.toFixed(4) + '</td>';

 html += '<td style="text-align:center;' + (bonf[i] < 0.05 ? 'color:#22c55e' : '') + '">' + bonf[i].toFixed(4) + '</td>';

 html += '<td style="text-align:center;' + (holm[i] < 0.05 ? 'color:#22c55e' : '') + '">' + holm[i].toFixed(4) + '</td>';

 html += '<td style="text-align:center;' + (bh[i] < 0.05 ? 'color:#22c55e' : '') + '">' + bh[i].toFixed(4) + '</td></tr>';

 });

 html += '</table>';



 var sigBonf = bonf.filter(function(p) { return p < 0.05; }).length;

 var sigHolm = holm.filter(function(p) { return p < 0.05; }).length;

 var sigBH = bh.filter(function(p) { return p < 0.05; }).length;

 var sigOrig = pValues.filter(function(p) { return p < 0.05; }).length;



 html += '<div style="margin-top:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<p><strong>Significant at 0.05:</strong></p>';

 html += '<p>Original: ' + sigOrig + ' | Bonferroni: ' + sigBonf + ' | Holm: ' + sigHolm + ' | BH: ' + sigBH + '</p>';

 html += '</div>';



 document.getElementById('multResult').innerHTML = html;

 document.getElementById('multResult').style.display = 'block';

 }

 };



 const StageDecisionTool = {

 assess: function(config) {

 var score = { oneStage: 0, twoStage: 0 };

 var recommendations = [];



 if (config.testInteractions) {

 score.oneStage += 3;

 recommendations.push({favor: 'one-stage', reason: 'Testing treatment-covariate interactions (avoid ecological bias)'});

 }



 if (config.smallStudies || config.rareEvents) {

 score.oneStage += 2;

 recommendations.push({favor: 'one-stage', reason: 'Small studies/rare events (better borrowing of information)'});

 }



 if (config.nonLinearEffects) {

 score.oneStage += 2;

 recommendations.push({favor: 'one-stage', reason: 'Non-linear dose-response or time-varying effects'});

 }



 if (config.varyingFollowUp) {

 score.oneStage += 1;

 recommendations.push({favor: 'one-stage', reason: 'Varying follow-up times across studies'});

 }



 if (config.needStudySummary) {

 score.twoStage += 2;

 recommendations.push({favor: 'two-stage', reason: 'Need study-level summaries for forest plot'});

 }



 if (config.simplicityPreferred) {

 score.twoStage += 1;

 recommendations.push({favor: 'two-stage', reason: 'Simpler computation and interpretation'});

 }



 if (config.standardREOK) {

 score.twoStage += 1;

 recommendations.push({favor: 'two-stage', reason: 'Standard random-effects model adequate'});

 }



 if (config.balancedDesigns) {

 score.twoStage += 1;

 recommendations.push({favor: 'two-stage', reason: 'Balanced study designs (similar results expected)'});

 }



 return {

 scores: score,

 recommendations: recommendations,

 overallRecommendation: score.oneStage > score.twoStage ? 'ONE-STAGE' :

 score.oneStage < score.twoStage ? 'TWO-STAGE' : 'EITHER (consider both)',

 details: score.oneStage > score.twoStage ?

 'One-stage preferred for treatment effect heterogeneity, interactions, or sparse data' :

 'Two-stage suitable for standard pooling with study-level summaries'

 };

 },



 showDecisionTool: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>One-Stage vs Two-Stage IPD-MA</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">Answer these questions to determine the optimal approach. <em>(Debray et al. Res Synth Methods 2015)</em></p>';



 var questions = [

 {id: 'testInteractions', q: 'Do you want to test treatment-covariate interactions?'},

 {id: 'smallStudies', q: 'Are some studies small (<50 per arm)?'},

 {id: 'rareEvents', q: 'Are events rare (<10 per study)?'},

 {id: 'nonLinearEffects', q: 'Do you need to model non-linear or time-varying effects?'},

 {id: 'varyingFollowUp', q: 'Do studies have substantially different follow-up times?'},

 {id: 'needStudySummary', q: 'Do you need study-level summaries for presentation?'},

 {id: 'simplicityPreferred', q: 'Is computational simplicity important?'},

 {id: 'standardREOK', q: 'Is a standard random-effects model sufficient?'},

 {id: 'balancedDesigns', q: 'Are study designs reasonably balanced?'}

 ];



 html += '<form id="stageDecisionForm">';

 questions.forEach(function(q) {

 html += '<div style="margin-bottom:0.75rem;padding:0.75rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<label style="display:flex;align-items:center;cursor:pointer">';

 html += '<input type="checkbox" id="' + q.id + '" style="margin-right:0.75rem">';

 html += q.q + '</label></div>';

 });

 html += '</form>';



 html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="StageDecisionTool.evaluate()">Get Recommendation</button>';

 html += '<div id="stageResult" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>Key Differences</h4>';

 html += '<table style="width:100%;font-size:0.85rem;border-collapse:collapse">';

 html += '<tr><th style="padding:0.5rem;text-align:left">Aspect</th><th>One-Stage</th><th>Two-Stage</th></tr>';

 html += '<tr><td style="padding:0.5rem">Model</td><td>GLMM/mixed model</td><td>Study summary + RE</td></tr>';

 html += '<tr><td style="padding:0.5rem">Interactions</td><td>Within-study only</td><td>Ecological bias risk</td></tr>';

 html += '<tr><td style="padding:0.5rem">Sparse data</td><td>Better handling</td><td>May be biased</td></tr>';

 html += '<tr><td style="padding:0.5rem">Complexity</td><td>Higher</td><td>Lower</td></tr>';

 html += '</table></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 evaluate: function() {

 var config = {};

 ['testInteractions', 'smallStudies', 'rareEvents', 'nonLinearEffects', 'varyingFollowUp',

 'needStudySummary', 'simplicityPreferred', 'standardREOK', 'balancedDesigns'].forEach(function(id) {

 config[id] = document.getElementById(id).checked;

 });



 var result = this.assess(config);

 var color = result.overallRecommendation.includes('ONE') ? '#3b82f6' :

 result.overallRecommendation.includes('TWO') ? '#22c55e' : '#f59e0b';



 var html = '<div style="padding:1.5rem;background:' + color + '20;border-left:4px solid ' + color + ';border-radius:8px">';

 html += '<h3 style="color:' + color + ';margin:0">Recommendation: ' + result.overallRecommendation + '</h3>';

 html += '<p style="margin-top:0.5rem">' + result.details + '</p>';

 html += '</div>';



 if (result.recommendations.length > 0) {

 html += '<h4 style="margin-top:1rem">Factors Considered:</h4><ul style="margin-left:1.5rem">';

 result.recommendations.forEach(function(r) {

 var icon = r.favor === 'one-stage' ? '1' : '2';

 html += '<li><strong>[' + icon + '-stage]</strong> ' + r.reason + '</li>';

 });

 html += '</ul>';

 }



 document.getElementById('stageResult').innerHTML = html;

 document.getElementById('stageResult').style.display = 'block';

 }

 };



 const ProtocolRegistration = {

 check: function() {

 if (!localStorage.getItem('ipd_protocol_reminded')) {

 this.showReminder();

 }

 },



 showReminder: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:600px">';

 html += '<div class="modal-header"><h3>Protocol Registration Reminder</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<div style="background:rgba(59,130,246,0.1);padding:1rem;border-radius:8px;margin-bottom:1rem">';

 html += '<strong>Best Practice:</strong> IPD meta-analyses should be registered prospectively.';

 html += '</div>';



 html += '<h4>Registration Resources:</h4>';

 html += '<ul style="margin-left:1.5rem;line-height:2">';

 html += '<li><strong>PROSPERO:</strong> crd.york.ac.uk/prospero</li>';

 html += '<li><strong>OSF Registries:</strong> osf.io/registries</li>';

 html += '<li><strong>Protocol template:</strong> PRISMA-P 2015</li>';

 html += '</ul>';



 html += '<h4 style="margin-top:1rem">Key Protocol Elements:</h4>';

 html += '<ol style="margin-left:1.5rem;font-size:0.9rem">';

 html += '<li>PICO question and eligibility criteria</li>';

 html += '<li>Primary and secondary outcomes</li>';

 html += '<li>Pre-specified subgroup analyses</li>';

 html += '<li>Statistical methods (one-stage/two-stage)</li>';

 html += '<li>Risk of bias assessment plan</li>';

 html += '<li>Data collection procedures</li>';

 html += '</ol>';



 html += '<div style="margin-top:1.5rem">';

 html += '<label><input type="checkbox" id="dontShowProtocol" style="margin-right:0.5rem">Don\'t show this reminder again</label>';

 html += '</div>';



 html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="ProtocolRegistration.dismiss()">Continue to Analysis</button>';

 html += '</div></div></div>';



 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 dismiss: function() {

 if (document.getElementById('dontShowProtocol').checked) {

 localStorage.setItem('ipd_protocol_reminded', 'true');

 }

 document.querySelector('.modal-overlay').remove();

 },



 showProtocolTemplate: function() {

 var template = 'IPD META-ANALYSIS PROTOCOL TEMPLATE\n';

 template += '=' .repeat(40) + '\n\n';

 template += '1. TITLE:\n [Title of the IPD meta-analysis]\n\n';

 template += '2. REGISTRATION:\n PROSPERO ID: CRD__________\n Date: __________\n\n';

 template += '3. BACKGROUND AND RATIONALE:\n [Why is this IPD-MA needed?]\n\n';

 template += '4. OBJECTIVES:\n Primary: \n Secondary: \n\n';

 template += '5. ELIGIBILITY CRITERIA:\n Population: \n Intervention: \n Comparator: \n Outcomes: \n Study types: \n\n';

 template += '6. DATA SOURCES:\n [Databases, registries, author contacts]\n\n';

 template += '7. IPD COLLECTION:\n Variables requested: \n Data cleaning: \n Missing data: \n\n';

 template += '8. RISK OF BIAS:\n Tool: [Cochrane RoB 2.0 / NOS / other]\n\n';

 template += '9. STATISTICAL METHODS:\n Approach: [one-stage / two-stage]\n Heterogeneity: \n Subgroups: \n Sensitivity: \n\n';

 template += '10. PRISMA-IPD CHECKLIST: Attached\n';



 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px">';

 html += '<div class="modal-header"><h3>Protocol Template</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';

 html += '<textarea style="width:100%;height:400px;font-family:monospace;font-size:0.85rem;padding:1rem" readonly>' + template + '</textarea>';

 html += '<button class="btn btn-secondary" style="margin-top:1rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy Template</button>';

 html += '</div></div></div>';



 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 }

 };



 const DataAvailabilityGenerator = {

 templates: {

 fullOpen: 'Individual participant data that underlie the results reported in this article, after deidentification (text, tables, figures, and appendices), will be available to qualified researchers who submit a methodologically sound proposal. Data will be available immediately following publication with no end date. Proposals should be directed to [contact email]. To gain access, data requestors will need to sign a data access agreement.',



 restrictedAccess: 'The individual participant data underlying this meta-analysis were obtained from the original study investigators under data sharing agreements that do not permit public sharing. Researchers wishing to access the data should contact the original study authors directly. Aggregate study-level data are provided in the supplementary materials.',



 onRequest: 'Deidentified individual participant data will be made available on reasonable request to the corresponding author, subject to approval by the IPD-MA Collaborative Group steering committee and execution of a data sharing agreement.',



 notAvailable: 'Due to ethical restrictions and data sharing agreements with the original trialists, individual participant data cannot be shared. Aggregate study-level data supporting the findings are available in the supplementary materials.',



 repository: 'Individual participant data have been deposited in [repository name] with accession number [number]. Data are available under [license type] license following registration and approval.'

 },



 show: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>Data Availability Statement Generator</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">Select the appropriate data sharing arrangement and customize:</p>';



 html += '<div style="margin-bottom:1rem"><label><strong>Data Availability Type:</strong></label>';

 html += '<select id="dataAvailType" style="width:100%;padding:0.5rem;margin-top:0.25rem" onchange="DataAvailabilityGenerator.updateTemplate()">';

 html += '<option value="fullOpen">Fully Open Access</option>';

 html += '<option value="onRequest">Available on Request</option>';

 html += '<option value="restrictedAccess">Restricted (contact original authors)</option>';

 html += '<option value="repository">Repository Deposit</option>';

 html += '<option value="notAvailable">Not Available</option>';

 html += '</select></div>';



 html += '<div style="margin-bottom:1rem"><label><strong>Statement:</strong></label>';

 html += '<textarea id="dataAvailStatement" style="width:100%;height:150px;padding:0.5rem;margin-top:0.25rem">' + this.templates.fullOpen + '</textarea></div>';



 html += '<button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById(\'dataAvailStatement\').value);alert(\'Copied!\')">Copy Statement</button>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>ICMJE Recommendations</h4>';

 html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li>State what data are available and how to access</li>';

 html += '<li>Specify any conditions or restrictions</li>';

 html += '<li>Include repository/accession numbers if applicable</li>';

 html += '<li>Note any ethical or legal constraints</li>';

 html += '</ul></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 updateTemplate: function() {

 var type = document.getElementById('dataAvailType').value;

 document.getElementById('dataAvailStatement').value = this.templates[type];

 }

 };



 const MissingDataSensitivity = {

 mechanisms: {

 MCAR: {

 name: 'Missing Completely at Random',

 description: 'Missingness unrelated to any variables',

 analysis: 'Complete case analysis valid but loses power',

 sensitivity: 'Low'

 },

 MAR: {

 name: 'Missing at Random',

 description: 'Missingness related to observed variables only',

 analysis: 'Multiple imputation or mixed models appropriate',

 sensitivity: 'Moderate'

 },

 MNAR: {

 name: 'Missing Not at Random',

 description: 'Missingness related to unobserved values',

 analysis: 'Requires sensitivity analysis (pattern mixture, selection models)',

 sensitivity: 'High - results may be biased'

 }

 },



 deltaAdjustment: function(effect, se, delta) {



 var adjusted = effect + delta;

 var z = adjusted / se;

 var p = 2 * (1 - this.normalCDF(Math.abs(z)));

 return {

 original: effect,

 delta: delta,

 adjusted: adjusted,

 se: se,

 z: z,

 p: p,

 stillSignificant: p < 0.05

 };

 },



 findTippingPoint: function(effect, se) {



 var tippingPoint = 0;

 var direction = effect > 0 ? -1 : 1;

 var step = 0.01;



 for (var delta = 0; Math.abs(delta) < Math.abs(effect) * 3; delta += direction * step) {

 var adj = effect + delta;

 var z = adj / se;

 var p = 2 * (1 - this.normalCDF(Math.abs(z)));

 if (p >= 0.05) {

 tippingPoint = delta;

 break;

 }

 }



 return {

 tippingPoint: tippingPoint,

 interpretation: 'Result becomes non-significant if missing outcomes differ by ' + Math.abs(tippingPoint).toFixed(3) + ' from observed'

 };

 },



 normalCDF: function(x) {

 var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;

 var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

 var sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2);

 var t = 1 / (1 + p * x);

 var y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

 return 0.5 * (1 + sign * y);

 },



 showPanel: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>Missing Data Sensitivity Analysis</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<h4>Missing Data Mechanisms</h4>';

 html += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:1.5rem">';

 html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Mechanism</th><th>Description</th><th>Approach</th></tr>';

 Object.values(this.mechanisms).forEach(function(m) {

 html += '<tr><td style="padding:0.5rem"><strong>' + m.name + '</strong></td>';

 html += '<td>' + m.description + '</td><td>' + m.analysis + '</td></tr>';

 });

 html += '</table>';



 html += '<h4>Delta-Adjustment Analysis</h4>';

 html += '<p style="font-size:0.85rem;margin-bottom:1rem">Test sensitivity of results if missing outcomes differ from observed by delta:</p>';



 html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:1rem">';

 html += '<div><label>Effect estimate:</label><input id="missingEffect" type="number" step="0.01" value="0.5" style="width:100%;padding:0.5rem"></div>';

 html += '<div><label>Standard error:</label><input id="missingSE" type="number" step="0.01" value="0.15" style="width:100%;padding:0.5rem"></div>';

 html += '<div><label>Delta (shift):</label><input id="missingDelta" type="number" step="0.05" value="-0.2" style="width:100%;padding:0.5rem"></div>';

 html += '</div>';



 html += '<button class="btn btn-primary" onclick="MissingDataSensitivity.analyze()">Run Sensitivity Analysis</button>';

 html += '<div id="missingResult" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>Reporting Recommendations (White et al. 2008)</h4>';

 html += '<ol style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li>Report extent of missing data by variable</li>';

 html += '<li>State assumed missing data mechanism</li>';

 html += '<li>Describe primary analysis approach</li>';

 html += '<li>Conduct sensitivity analyses under MNAR</li>';

 html += '<li>Report tipping point if applicable</li>';

 html += '</ol></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 analyze: function() {

 var effect = parseFloat(document.getElementById('missingEffect').value);

 var se = parseFloat(document.getElementById('missingSE').value);

 var delta = parseFloat(document.getElementById('missingDelta').value);



 var adj = this.deltaAdjustment(effect, se, delta);

 var tip = this.findTippingPoint(effect, se);



 var html = '<div style="padding:1rem;background:rgba(59,130,246,0.1);border-radius:8px">';

 html += '<h4>Results</h4>';

 html += '<table style="width:100%;margin-top:0.5rem;border-collapse:collapse">';

 html += '<tr><td style="padding:0.5rem"><strong>Original effect:</strong></td><td>' + effect.toFixed(3) + '</td></tr>';

 html += '<tr><td style="padding:0.5rem"><strong>Adjusted effect (delta=' + delta + '):</strong></td><td>' + adj.adjusted.toFixed(3) + '</td></tr>';

 html += '<tr><td style="padding:0.5rem"><strong>Adjusted p-value:</strong></td><td style="' + (adj.stillSignificant ? 'color:#22c55e' : 'color:#ef4444') + '">' + adj.p.toFixed(4) + '</td></tr>';

 html += '<tr><td style="padding:0.5rem"><strong>Still significant?</strong></td><td>' + (adj.stillSignificant ? 'Yes' : 'No') + '</td></tr>';

 html += '</table>';

 html += '<p style="margin-top:1rem"><strong>Tipping point:</strong> ' + tip.tippingPoint.toFixed(3) + '</p>';

 html += '<p style="font-size:0.9rem"><em>' + tip.interpretation + '</em></p>';

 html += '</div>';



 document.getElementById('missingResult').innerHTML = html;

 document.getElementById('missingResult').style.display = 'block';

 }

 };



 const ConflictOfInterest = {

 categories: [

 'Financial relationships with industry',

 'Grants or research funding',

 'Employment by commercial entity',

 'Stock ownership or options',

 'Consultancy fees',

 'Expert testimony',

 'Patents or royalties',

 'Travel/meeting expenses',

 'Personal relationships',

 'Academic competition',

 'Intellectual preconceptions'

 ],



 generateStatement: function(hasConflicts, details) {

 if (!hasConflicts) {

 return 'The authors declare no conflicts of interest. All authors have completed the ICMJE uniform disclosure form. No author has received funding from any commercial entity related to this work.';

 } else {

 return 'The authors declare the following potential conflicts of interest: ' + details + '. All other authors declare no conflicts of interest. The funders had no role in study design, data collection, analysis, interpretation, or manuscript preparation.';

 }

 },



 show: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>Conflict of Interest Declaration</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">Complete this declaration for all authors (ICMJE requirement):</p>';



 html += '<div style="margin-bottom:1rem">';

 html += '<label><input type="radio" name="hasCOI" value="no" checked onchange="ConflictOfInterest.toggleDetails(false)"> No conflicts of interest to declare</label><br>';

 html += '<label><input type="radio" name="hasCOI" value="yes" onchange="ConflictOfInterest.toggleDetails(true)"> Potential conflicts to disclose</label>';

 html += '</div>';



 html += '<div id="coiDetails" style="display:none;margin-bottom:1rem">';

 html += '<h4>Check all that apply:</h4>';

 this.categories.forEach(function(cat, i) {

 html += '<label style="display:block;margin:0.25rem 0"><input type="checkbox" id="coi' + i + '"> ' + cat + '</label>';

 });

 html += '<div style="margin-top:1rem"><label><strong>Details:</strong></label>';

 html += '<textarea id="coiText" style="width:100%;height:80px;padding:0.5rem;margin-top:0.25rem" placeholder="Describe specific conflicts..."></textarea></div>';

 html += '</div>';



 html += '<button class="btn btn-primary" onclick="ConflictOfInterest.generate()">Generate Statement</button>';



 html += '<div id="coiStatement" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>ICMJE Guidelines</h4>';

 html += '<p style="font-size:0.85rem">All authors must disclose any financial and personal relationships that could be viewed as potential conflicts of interest. This includes:</p>';

 html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li>Relationships in the past 36 months</li>';

 html += '<li>Both direct and indirect financial interests</li>';

 html += '<li>Relationships of immediate family members</li>';

 html += '</ul></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 toggleDetails: function(show) {

 document.getElementById('coiDetails').style.display = show ? 'block' : 'none';

 },



 generate: function() {

 var hasConflicts = document.querySelector('input[name="hasCOI"]:checked').value === 'yes';

 var details = document.getElementById('coiText') ? document.getElementById('coiText').value : '';

 var statement = this.generateStatement(hasConflicts, details);



 var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-radius:8px">';

 html += '<h4>COI Statement</h4>';

 html += '<textarea style="width:100%;height:100px;padding:0.5rem;margin-top:0.5rem" readonly>' + statement + '</textarea>';

 html += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy</button>';

 html += '</div>';



 document.getElementById('coiStatement').innerHTML = html;

 document.getElementById('coiStatement').style.display = 'block';

 }

 };



 const NMACertainty = {

 domains: {

 withinStudyBias: { name: 'Within-study bias', weight: 1 },

 reportingBias: { name: 'Reporting bias', weight: 1 },

 indirectness: { name: 'Indirectness', weight: 1 },

 imprecision: { name: 'Imprecision', weight: 1 },

 heterogeneity: { name: 'Heterogeneity', weight: 1 },

 incoherence: { name: 'Incoherence', weight: 1 }

 },



 levels: ['No concerns', 'Some concerns', 'Major concerns'],

 ratings: ['High', 'Moderate', 'Low', 'Very Low'],



 assess: function(comparison, assessments) {

 var totalConcerns = 0;

 var domainResults = {};



 Object.keys(this.domains).forEach(function(domain) {

 var level = assessments[domain] ?? 0;

 domainResults[domain] = {

 level: level,

 label: NMACertainty.levels[level]

 };

 totalConcerns += level;

 });



 var certainty;

 if (totalConcerns === 0) certainty = 0;

 else if (totalConcerns <= 2) certainty = 1;

 else if (totalConcerns <= 4) certainty = 2;

 else certainty = 3;



 return {

 comparison: comparison,

 domains: domainResults,

 totalConcerns: totalConcerns,

 certainty: certainty,

 rating: this.ratings[certainty]

 };

 },



 show: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>CINeMA: Confidence in NMA</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">Assess certainty for each treatment comparison. <em>(Nikolakopoulou et al. PLoS Med 2020)</em></p>';



 html += '<div style="margin-bottom:1.5rem"><label><strong>Comparison:</strong></label>';

 html += '<input id="cinemaComparison" type="text" placeholder="e.g., Treatment A vs Treatment B" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';



 html += '<h4>Rate Each Domain:</h4>';

 html += '<table style="width:100%;border-collapse:collapse;margin-bottom:1rem">';

 html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Domain</th><th>No concerns</th><th>Some concerns</th><th>Major concerns</th></tr>';



 Object.entries(this.domains).forEach(function(entry) {

 var key = entry[0], domain = entry[1];

 html += '<tr><td style="padding:0.5rem"><strong>' + domain.name + '</strong></td>';

 for (var i = 0; i < 3; i++) {

 html += '<td style="text-align:center"><input type="radio" name="' + key + '" value="' + i + '"' + (i === 0 ? ' checked' : '') + '></td>';

 }

 html += '</tr>';

 });

 html += '</table>';



 html += '<button class="btn btn-primary" onclick="NMACertainty.calculate()">Calculate Certainty</button>';

 html += '<div id="cinemaResult" style="margin-top:1.5rem;display:none"></div>';



 html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';

 html += '<h4>CINeMA Domains Explained</h4>';

 html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';

 html += '<li><strong>Within-study bias:</strong> RoB in contributing studies</li>';

 html += '<li><strong>Reporting bias:</strong> Small-study effects, publication bias</li>';

 html += '<li><strong>Indirectness:</strong> Applicability to target population</li>';

 html += '<li><strong>Imprecision:</strong> Width of confidence interval</li>';

 html += '<li><strong>Heterogeneity:</strong> Variability in effects</li>';

 html += '<li><strong>Incoherence:</strong> Inconsistency between direct and indirect</li>';

 html += '</ul></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 calculate: function() {

 var comparison = document.getElementById('cinemaComparison').value || 'Unnamed comparison';

 var assessments = {};



 Object.keys(this.domains).forEach(function(domain) {

 var selected = document.querySelector('input[name="' + domain + '"]:checked');

 assessments[domain] = selected ? parseInt(selected.value) : 0;

 });



 var result = this.assess(comparison, assessments);

 var colors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];



 var html = '<div style="padding:1.5rem;background:' + colors[result.certainty] + '20;border-left:4px solid ' + colors[result.certainty] + ';border-radius:8px">';

 html += '<h3 style="color:' + colors[result.certainty] + ';margin:0">Certainty: ' + result.rating + '</h3>';

 html += '<p style="margin-top:0.5rem">Comparison: ' + result.comparison + '</p>';

 html += '</div>';



 html += '<h4 style="margin-top:1rem">Domain Assessments:</h4>';

 html += '<ul style="margin-left:1.5rem">';

 Object.entries(result.domains).forEach(function(entry) {

 var domain = entry[0], data = entry[1];

 var icon = data.level === 0 ? '&#10003;' : data.level === 1 ? '~' : '&#10007;';

 html += '<li>' + NMACertainty.domains[domain].name + ': ' + icon + ' ' + data.label + '</li>';

 });

 html += '</ul>';



 document.getElementById('cinemaResult').innerHTML = html;

 document.getElementById('cinemaResult').style.display = 'block';

 }

 };



 const AuthorContributions = {

 roles: [

 'Conceptualization',

 'Data curation',

 'Formal analysis',

 'Funding acquisition',

 'Investigation',

 'Methodology',

 'Project administration',

 'Resources',

 'Software',

 'Supervision',

 'Validation',

 'Visualization',

 'Writing - original draft',

 'Writing - review & editing'

 ],



 show: function() {

 var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:90vh;overflow-y:auto">';

 html += '<div class="modal-header"><h3>CRediT Author Contributions</h3>';

 html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>';

 html += '<div class="modal-body">';



 html += '<p style="margin-bottom:1rem">Assign contributions using the CRediT taxonomy. <em>(casrai.org/credit)</em></p>';



 html += '<div style="margin-bottom:1rem"><label><strong>Authors (comma-separated):</strong></label>';

 html += '<input id="creditAuthors" type="text" placeholder="Smith J, Jones A, Williams B" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';



 html += '<h4>Select roles for each contribution:</h4>';

 html += '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);padding:1rem;border-radius:8px">';

 this.roles.forEach(function(role, i) {

 html += '<div style="margin-bottom:0.75rem"><label><strong>' + role + ':</strong></label>';

 html += '<input id="credit' + i + '" type="text" placeholder="Author initials (e.g., JS, AJ)" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

 });

 html += '</div>';



 html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="AuthorContributions.generate()">Generate Statement</button>';

 html += '<div id="creditResult" style="margin-top:1.5rem;display:none"></div>';



 html += '</div></div></div>';

 var m = document.createElement('div'); m.innerHTML = html;

 document.body.appendChild(m.firstChild);

 },



 generate: function() {

 var authors = document.getElementById('creditAuthors').value;

 var contributions = [];

 var self = this;



 this.roles.forEach(function(role, i) {

 var value = document.getElementById('credit' + i).value.trim();

 if (value) contributions.push('<strong>' + role + ':</strong> ' + value);

 });



 if (contributions.length === 0) {

 alert('Please assign at least one role');

 return;

 }



 var statement = '<strong>Author Contributions:</strong> ' + contributions.join('. ') + '.';



 var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-radius:8px">';

 html += '<h4>CRediT Statement</h4>';

 html += '<div style="margin-top:0.5rem;padding:1rem;background:var(--bg-secondary);border-radius:8px">' + statement + '</div>';

 html += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText)">Copy</button>';

 html += '</div>';



 document.getElementById('creditResult').innerHTML = html;

 document.getElementById('creditResult').style.display = 'block';

 }

 };



 const IPD_APP_BUILD_ID = '2026-03-07-fixall-1';

 const APP = {

data: null,

 buildId: IPD_APP_BUILD_ID,

 variables: [],

 results: null,

 bayesianResults: null,

 config: {

 studyVar: null,

 treatmentVar: null,

 timeVar: null,

 eventVar: null,

 outcomeType: 'survival',

 analysisApproach: 'two-stage',

 effectMeasure: 'HR',

 reMethod: 'REML',

 confLevel: 0.95,

 useHKSJ: true,

 strictQCGateEnabled: false,

 fastPathMode: false,

 sopLockEnabled: false,

 sopLockRequireDataMatch: true,

 sopLockRequireStrictQC: true,

 sopLockMinQCScore: 80,

 firstRunAdoptionBoosterEnabled: true,

 firstRunAdoptionBoosterAutoRun: true,

 firstRunAdoptionBoosterBuildBundles: true,

 firstRunAdoptionBoosterPreservePanel: true

 }

 };



// =============================================================================

// MODAL MANAGER - Centralized Modal Management with Cleanup

// =============================================================================

const ModalManager = {

 _activeModals: [],

 _animationFrames: [],



 // Clean up all existing modals before creating new one

 closeAll: function() {

  document.querySelectorAll('.modal-overlay').forEach(m => {

   m.remove();

  });

  this._activeModals = [];

  // Cancel any pending animation frames

  this._animationFrames.forEach(id => cancelAnimationFrame(id));

  this._animationFrames = [];

 },



 // Create a modal with automatic cleanup

 create: function(title, content, options = {}) {

  // Clean up existing modals unless allowMultiple is true

  if (!options.allowMultiple) {

   this.closeAll();

  }

  // Save previously focused element for focus restoration
  const previousFocus = document.activeElement;

  const modal = document.createElement('div');

  modal.className = 'modal-overlay active';

  modal.setAttribute('role', 'dialog');

  modal.setAttribute('aria-modal', 'true');

  modal.setAttribute('aria-label', title);



  const closeHandler = () => {

   if (options.onClose) options.onClose();

   modal.removeEventListener('keydown', trapFocus);

   modal.remove();

   const idx = this._activeModals.indexOf(modal);

   if (idx > -1) this._activeModals.splice(idx, 1);

   // Restore focus to previously focused element
   if (previousFocus && previousFocus.focus) previousFocus.focus();

  };

  // Focus trap handler to keep Tab/Shift+Tab within modal
  function trapFocus(e) {
   if (e.key !== 'Tab') return;
   const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
   if (focusable.length === 0) return;
   const first = focusable[0];
   const last = focusable[focusable.length - 1];
   if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
   else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }



  modal.innerHTML = `

   <div class="modal-content" style="${options.style || 'max-width:900px;'}">

    <button class="modal-close" aria-label="Close modal">&times;</button>

    <h2>${escapeHTML(title)}</h2>

    <div class="modal-body">${content}</div>

    ${options.hideFooter ? '' : '<div class="modal-footer"><button class="btn btn-primary modal-close-btn">Close</button></div>'}

   </div>

  `;



  // Attach close handlers

  modal.querySelector('.modal-close').addEventListener('click', closeHandler);

  const closeBtn = modal.querySelector('.modal-close-btn');

  if (closeBtn) closeBtn.addEventListener('click', closeHandler);



  // Close on backdrop click

  modal.addEventListener('click', (e) => {

   if (e.target === modal) closeHandler();

  });



  // Close on Escape key

  const escHandler = (e) => {

   if (e.key === 'Escape') {

    closeHandler();

    document.removeEventListener('keydown', escHandler);

   }

  };

  document.addEventListener('keydown', escHandler);



  document.body.appendChild(modal);

  this._activeModals.push(modal);

  // Attach focus trap and focus first focusable element
  modal.addEventListener('keydown', trapFocus);
  const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) firstFocusable.focus();

  return { modal, close: closeHandler };

 },



 // Register animation frame for cleanup

 registerAnimationFrame: function(id) {

  this._animationFrames.push(id);

 },



 // Cancel animation frame and remove from registry

 cancelAnimationFrame: function(id) {

  cancelAnimationFrame(id);

  const idx = this._animationFrames.indexOf(id);

  if (idx > -1) this._animationFrames.splice(idx, 1);

 }

};



// Convenience function for showing results modals

function showResultsModal(title, html, options = {}) {

 return ModalManager.create(title, html, options);

}



// Smart number formatting with dynamic precision based on magnitude

function formatNumber(value, defaultDecimals = 3) {

 if (value == null || isNaN(value)) return 'NA';

 if (!isFinite(value)) return value > 0 ? '∞' : '-∞';



 const absVal = Math.abs(value);



 // Very small numbers: use scientific notation or more decimals

 if (absVal > 0 && absVal < 0.001) {

  if (absVal < 0.0001) {

   return value.toExponential(2);

  }

  return value.toFixed(5);

 }



 // Very large numbers: use fewer decimals or scientific notation

 if (absVal >= 10000) {

  return value.toExponential(2);

 }

 if (absVal >= 100) {

  return value.toFixed(1);

 }



 // Standard range: use default decimals

 return value.toFixed(defaultDecimals);

}



// Format effect size for display (handles log-transformed values)

function formatEffect(effect, isLogScale = false, defaultDecimals = 3) {

 const displayValue = isLogScale ? Math.exp(effect) : effect;

 return formatNumber(displayValue, defaultDecimals);

}



// =============================================================================

// ERROR HANDLER - Centralized Error Management & Recovery

// =============================================================================

const ErrorHandler = {

    errors: [],

    maxErrors: 100,

    listeners: [],

    suppressUI: false,



    // Error severity levels

    SEVERITY: {

        INFO: 'info',

        WARNING: 'warning',

        ERROR: 'error',

        CRITICAL: 'critical'

    },



    // Error categories for targeted handling

    CATEGORY: {

        DATA: 'data',

        ANALYSIS: 'analysis',

        VALIDATION: 'validation',

        NETWORK: 'network',

        RENDER: 'render',

        WORKER: 'worker',

        SYSTEM: 'system'

    },



    // Initialize error handler with global error catching

    init: function() {

        window.onerror = (msg, url, line, col, error) => {

            this.handle(error || new Error(msg), {

                category: this.CATEGORY.SYSTEM,

                severity: this.SEVERITY.ERROR,

                context: { url, line, col }

            });

            return false;

        };



        window.onunhandledrejection = (event) => {

            this.handle(event.reason || new Error('Unhandled Promise rejection'), {

                category: this.CATEGORY.SYSTEM,

                severity: this.SEVERITY.ERROR,

                context: { type: 'promise' }

            });

        };



        console.log('[ErrorHandler] Initialized with global error catching');

    },



    // Main error handling method

    handle: function(error, options = {}) {

        const {

            category = this.CATEGORY.SYSTEM,

            severity = this.SEVERITY.ERROR,

            context = {},

            recoverable = true,

            userMessage = null,

            silent = false

        } = options;



        const errorEntry = {

            id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

            timestamp: new Date().toISOString(),

            message: error.message || String(error),

            stack: error.stack || null,

            category,

            severity,

            context,

            recoverable,

            handled: false

        };



        // Store error

        this.errors.push(errorEntry);

        if (this.errors.length > this.maxErrors) {

            this.errors.shift();

        }



        // Log to console with appropriate level

        const logFn = severity === this.SEVERITY.CRITICAL || severity === this.SEVERITY.ERROR

            ? console.error

            : severity === this.SEVERITY.WARNING ? console.warn : console.log;

        logFn(`[${category.toUpperCase()}] ${errorEntry.message}`, context);



        // Notify listeners

        this.listeners.forEach(listener => {

            try {

                listener(errorEntry);

            } catch (e) {

                console.error('Error in error listener:', e);

            }

        });



        // Show UI notification unless suppressed

        if (!silent && !this.suppressUI) {

            this.showNotification(errorEntry, userMessage);

        }



        // Mark as handled

        errorEntry.handled = true;



        return errorEntry;

    },



    // Wrap a function with error handling

    wrap: function(fn, options = {}) {

        const self = this;

        return function(...args) {

            try {

                const result = fn.apply(this, args);

                if (result && typeof result.then === 'function') {

                    return result.catch(error => {

                        self.handle(error, options);

                        throw error;

                    });

                }

                return result;

            } catch (error) {

                self.handle(error, options);

                throw error;

            }

        };

    },



    // Safe execution with fallback

    tryRun: function(fn, fallback = null, options = {}) {

        try {

            const result = fn();

            if (result && typeof result.then === 'function') {

                return result.catch(error => {

                    this.handle(error, { ...options, silent: true });

                    return typeof fallback === 'function' ? fallback(error) : fallback;

                });

            }

            return result;

        } catch (error) {

            this.handle(error, { ...options, silent: true });

            return typeof fallback === 'function' ? fallback(error) : fallback;

        }

    },



    // Data validation errors

    dataError: function(message, context = {}) {

        return this.handle(new Error(message), {

            category: this.CATEGORY.DATA,

            severity: this.SEVERITY.WARNING,

            context,

            userMessage: `Data Issue: ${message}`

        });

    },



    // Analysis errors

    analysisError: function(message, context = {}) {

        return this.handle(new Error(message), {

            category: this.CATEGORY.ANALYSIS,

            severity: this.SEVERITY.ERROR,

            context,

            userMessage: `Analysis Error: ${message}`

        });

    },



    // Validation errors

    validationError: function(message, field = null, context = {}) {

        return this.handle(new Error(message), {

            category: this.CATEGORY.VALIDATION,

            severity: this.SEVERITY.WARNING,

            context: { field, ...context },

            userMessage: field ? `Validation: ${field} - ${message}` : message

        });

    },



    // Show notification to user

    showNotification: function(errorEntry, customMessage = null) {

        const message = customMessage || errorEntry.message;

        const isWarning = errorEntry.severity === this.SEVERITY.WARNING ||

                          errorEntry.severity === this.SEVERITY.INFO;



        // Use existing notification system if available

        if (typeof showNotification === 'function') {

            showNotification(message, isWarning ? 'warning' : 'error');

        } else {

            // Fallback: create toast notification

            this.createToast(message, errorEntry.severity);

        }

    },



    // Create toast notification

    createToast: function(message, severity) {

        const toast = document.createElement('div');

        toast.className = 'error-toast';

        toast.style.cssText = `

            position: fixed;

            bottom: 20px;

            right: 20px;

            padding: 1rem 1.5rem;

            background: ${severity === 'error' || severity === 'critical' ? 'var(--accent-danger)' :

                          severity === 'warning' ? 'var(--accent-warning)' : 'var(--accent-info)'};

            color: white;

            border-radius: 8px;

            box-shadow: var(--shadow-lg);

            z-index: 10000;

            max-width: 400px;

            animation: slideInRight 0.3s ease;

            cursor: pointer;

        `;

        toast.textContent = message;

        toast.onclick = () => toast.remove();



        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 5000);

    },



    // Get recent errors

    getRecentErrors: function(count = 10, category = null) {

        let filtered = this.errors;

        if (category) {

            filtered = filtered.filter(e => e.category === category);

        }

        return filtered.slice(-count);

    },



    // Clear error history

    clear: function() {

        this.errors = [];

    },



    // Add listener for errors

    addListener: function(fn) {

        this.listeners.push(fn);

        return () => {

            this.listeners = this.listeners.filter(l => l !== fn);

        };

    },



    // Generate error report

    generateReport: function() {

        const summary = {

            total: this.errors.length,

            byCategory: {},

            bySeverity: {},

            recentCritical: this.errors.filter(e =>

                e.severity === this.SEVERITY.CRITICAL || e.severity === this.SEVERITY.ERROR

            ).slice(-5)

        };



        this.errors.forEach(e => {

            summary.byCategory[e.category] = (summary.byCategory[e.category] ?? 0) + 1;

            summary.bySeverity[e.severity] = (summary.bySeverity[e.severity] ?? 0) + 1;

        });



        return summary;

    }

};



// Initialize ErrorHandler on load

ErrorHandler.init();



// =============================================================================

// INPUT VALIDATOR - Comprehensive Data Validation

// =============================================================================

const InputValidator = {

    // Validate numeric input

    isNumeric: function(value, options = {}) {

        const { min = -Infinity, max = Infinity, allowNaN = false, allowInfinity = false } = options;



        if (value === null || value === undefined || value === '') {

            return { valid: false, error: 'Value is required' };

        }



        const num = Number(value);



        if (isNaN(num) && !allowNaN) {

            return { valid: false, error: 'Value must be a number' };

        }



        if (!isFinite(num) && !allowInfinity) {

            return { valid: false, error: 'Value must be finite' };

        }



        if (num < min) {

            return { valid: false, error: `Value must be at least ${min}` };

        }



        if (num > max) {

            return { valid: false, error: `Value must be at most ${max}` };

        }



        return { valid: true, value: num };

    },



    // Validate positive number

    isPositive: function(value, options = {}) {

        return this.isNumeric(value, { min: 0, ...options });

    },



    // Validate probability (0-1)

    isProbability: function(value) {

        return this.isNumeric(value, { min: 0, max: 1 });

    },



    // Validate integer

    isInteger: function(value, options = {}) {

        const numResult = this.isNumeric(value, options);

        if (!numResult.valid) return numResult;



        if (!Number.isInteger(numResult.value)) {

            return { valid: false, error: 'Value must be an integer' };

        }



        return numResult;

    },



    // Validate array of numbers

    isNumericArray: function(arr, options = {}) {

        if (!Array.isArray(arr)) {

            return { valid: false, error: 'Input must be an array' };

        }



        const { minLength = 0, maxLength = Infinity } = options;



        if (arr.length < minLength) {

            return { valid: false, error: `Array must have at least ${minLength} elements` };

        }



        if (arr.length > maxLength) {

            return { valid: false, error: `Array must have at most ${maxLength} elements` };

        }



        const validated = [];

        for (let i = 0; i < arr.length; i++) {

            const result = this.isNumeric(arr[i], options);

            if (!result.valid) {

                return { valid: false, error: `Element ${i}: ${result.error}` };

            }

            validated.push(result.value);

        }



        return { valid: true, value: validated };

    },



    // Validate data has minimum studies

    hasMinStudies: function(data, minK = 3) {

        if (!data || !Array.isArray(data)) {

            return { valid: false, error: 'No data provided' };

        }



        if (data.length < minK) {

            return {

                valid: false,

                error: `Insufficient studies: ${data.length} provided, minimum ${minK} required for reliable meta-analysis`,

                warning: data.length >= 2 ? 'Results with k<3 should be interpreted with extreme caution' : null

            };

        }



        return { valid: true, value: data.length };

    },



    // Check for separation (all effects in one direction)

    checkSeparation: function(data, effectField = 'yi') {

        if (!data || data.length < 2) return { valid: true };



        const effects = data.map(d => d[effectField]).filter(e => e != null && !isNaN(e));

        const allPositive = effects.every(e => e >= 0);

        const allNegative = effects.every(e => e <= 0);



        if (allPositive || allNegative) {

            return {

                valid: false,

                warning: 'Separation detected: all effects are in the same direction. This may cause estimation problems.',

                details: { allPositive, allNegative, effectRange: [Math.min(...effects), Math.max(...effects)] }

            };

        }



        return { valid: true };

    },



    // Check for collinearity in covariates

    checkCollinearity: function(data, covariates) {

        if (!covariates || covariates.length < 2) return { valid: true };



        const warnings = [];



        // Simple correlation check between numeric covariates

        for (let i = 0; i < covariates.length; i++) {

            for (let j = i + 1; j < covariates.length; j++) {

                const cov1 = covariates[i];

                const cov2 = covariates[j];



                const vals1 = data.map(d => d[cov1]).filter(v => v != null && !isNaN(Number(v)));

                const vals2 = data.map(d => d[cov2]).filter(v => v != null && !isNaN(Number(v)));



                if (vals1.length > 2 && vals2.length > 2) {

                    const corr = this._correlation(vals1.map(Number), vals2.map(Number));

                    if (Math.abs(corr) > 0.9) {

                        warnings.push(`High collinearity (r=${corr.toFixed(3)}) between ${cov1} and ${cov2}`);

                    }

                }

            }

        }



        return {

            valid: warnings.length === 0,

            warnings: warnings.length > 0 ? warnings : null

        };

    },



    // Helper: Pearson correlation

    _correlation: function(x, y) {

        const n = Math.min(x.length, y.length);

        if (n < 2) return 0;



        const meanX = x.reduce((a, b) => a + b, 0) / n;

        const meanY = y.reduce((a, b) => a + b, 0) / n;



        let num = 0, denX = 0, denY = 0;

        for (let i = 0; i < n; i++) {

            const dx = x[i] - meanX;

            const dy = y[i] - meanY;

            num += dx * dy;

            denX += dx * dx;

            denY += dy * dy;

        }



        const den = Math.sqrt(denX * denY);

        return den === 0 ? 0 : num / den;

    },



    // Comprehensive data validation

    validateDataset: function(data, options = {}) {

        const { effectField = 'yi', varianceField = 'vi', requirePositiveVariance = true } = options;

        const issues = [];

        const warnings = [];



        // Check minimum studies

        const minStudies = this.hasMinStudies(data, options.minK || 3);

        if (!minStudies.valid) {

            if (minStudies.warning) {

                warnings.push(minStudies.warning);

            } else {

                issues.push(minStudies.error);

            }

        }



        // Validate individual records

        data.forEach((record, i) => {

            const effectResult = this.isNumeric(record[effectField]);

            if (!effectResult.valid) {

                issues.push(`Study ${i + 1}: Invalid effect size - ${effectResult.error}`);

            }



            const varResult = requirePositiveVariance

                ? this.isPositive(record[varianceField])

                : this.isNumeric(record[varianceField]);

            if (!varResult.valid) {

                issues.push(`Study ${i + 1}: Invalid variance - ${varResult.error}`);

            }

        });



        // Check separation

        const separation = this.checkSeparation(data, effectField);

        if (!separation.valid && separation.warning) {

            warnings.push(separation.warning);

        }



        return {

            valid: issues.length === 0,

            issues,

            warnings,

            studyCount: data.length

        };

    }

};



// =============================================================================

// FORM VALIDATOR - Automated Form Validation with Real-time Feedback

// =============================================================================

const FormValidator = {

    // Validation rules registry

    rules: {

        confLevel: { min: 0.5, max: 0.999, type: 'probability', label: 'Confidence Level' },

        nSamples: { min: 100, max: 1000000, type: 'integer', label: 'Number of Samples' },

        burnin: { min: 0, max: 100000, type: 'integer', label: 'Burn-in Period' },

        alpha: { min: 0.001, max: 0.5, type: 'number', label: 'Alpha Level' },

        nBoot: { min: 100, max: 100000, type: 'integer', label: 'Bootstrap Iterations' },

        minNodeSize: { min: 1, max: 1000, type: 'integer', label: 'Min Node Size' },

        maxDepth: { min: 1, max: 20, type: 'integer', label: 'Max Tree Depth' },

        priorMean: { min: -100, max: 100, type: 'number', label: 'Prior Mean' },

        priorVar: { min: 0.001, max: 1000, type: 'number', label: 'Prior Variance' },

        tauPrior: { min: 0, max: 100, type: 'number', label: 'Tau Prior Scale' },

        iterations: { min: 1, max: 100, type: 'integer', label: 'Iterations' }

    },



    // Initialize automatic validation on all registered fields

    init: function() {

        Object.keys(this.rules).forEach(fieldId => {

            const field = document.getElementById(fieldId);

            if (field) {

                field.addEventListener('change', () => this.validateField(fieldId));

                field.addEventListener('blur', () => this.validateField(fieldId));

                // Add validation indicator

                this.addValidationIndicator(field);

            }

        });



        // Also validate required select fields

        ['varStudy', 'varTreatment', 'varTime', 'varEvent', 'outcomeType', 'reMethod'].forEach(id => {

            const field = document.getElementById(id);

            if (field) {

                field.addEventListener('change', () => this.validateSelect(id));

            }

        });



        console.log('[FormValidator] Initialized automatic validation');

    },



    // Add visual validation indicator

    addValidationIndicator: function(field) {

        if (!field.parentElement.querySelector('.validation-indicator')) {

            const indicator = document.createElement('span');

            indicator.className = 'validation-indicator';

            indicator.style.cssText = `

                position: absolute; right: 10px; top: 50%; transform: translateY(-50%);

                font-size: 0.8rem; display: none;

            `;

            const parent = field.parentElement;

            parent.style.position = 'relative';

            parent.appendChild(indicator);

        }

    },



    // Validate a single field

    validateField: function(fieldId) {

        const field = document.getElementById(fieldId);

        const rule = this.rules[fieldId];

        if (!field || !rule) return { valid: true };



        const value = field.value;

        let result;



        switch (rule.type) {

            case 'probability':

                result = InputValidator.isProbability(value);

                break;

            case 'integer':

                result = InputValidator.isInteger(value, { min: rule.min, max: rule.max });

                break;

            case 'number':

            default:

                result = InputValidator.isNumeric(value, { min: rule.min, max: rule.max });

        }



        this.showFieldValidation(field, result, rule.label);

        return result;

    },



    // Validate select field has selection

    validateSelect: function(fieldId) {

        const field = document.getElementById(fieldId);

        if (!field) return { valid: true };



        const valid = field.value && field.value !== '';

        this.showFieldValidation(field, { valid }, field.previousElementSibling?.textContent || fieldId);

        return { valid };

    },



    // Show validation feedback on field

    showFieldValidation: function(field, result, label) {

        const indicator = field.parentElement.querySelector('.validation-indicator');



        // Update field style

        field.style.borderColor = result.valid ? '' : 'var(--accent-danger)';



        // Update indicator

        if (indicator) {

            indicator.style.display = result.valid ? 'none' : 'inline';

            indicator.textContent = result.valid ? '✓' : '✗';

            indicator.style.color = result.valid ? 'var(--accent-success)' : 'var(--accent-danger)';

        }



        // Log validation error

        if (!result.valid) {

            ErrorHandler.validationError(result.error || 'Invalid value', label);

        }

    },



    // Validate all fields before analysis

    validateAll: function() {

        const errors = [];

        const warnings = [];



        // Validate numeric inputs

        Object.keys(this.rules).forEach(fieldId => {

            const result = this.validateField(fieldId);

            if (!result.valid) {

                errors.push(`${this.rules[fieldId].label}: ${result.error}`);

            }

        });



        // Validate required selects

        ['varStudy', 'varTreatment'].forEach(id => {

            const result = this.validateSelect(id);

            if (!result.valid) {

                errors.push(`${id.replace('var', '')}: Required field not selected`);

            }

        });



        // Check outcome type specific requirements

        const outcomeType = document.getElementById('outcomeType')?.value;

        if (outcomeType === 'survival') {

            const timeResult = this.validateSelect('varTime');

            if (!timeResult.valid) {

                errors.push('Time Variable: Required for survival analysis');

            }

        }



        const eventResult = this.validateSelect('varEvent');

        if (!eventResult.valid) {

            errors.push('Event Variable: Required field not selected');

        }



        return {

            valid: errors.length === 0,

            errors,

            warnings

        };

    },



    // Show validation summary

    showValidationSummary: function(result) {

        if (!result.valid) {

            const message = `Validation errors:\n• ${result.errors.join('\n• ')}`;

            showNotification(message, 'error');

            return false;

        }

        return true;

    }

};



// Initialize FormValidator after DOM ready

document.addEventListener('DOMContentLoaded', function() {

    setTimeout(() => FormValidator.init(), 1000);

});



// =============================================================================

// UNDO/REDO MANAGER - Ctrl+Z / Ctrl+Y Support

// =============================================================================

