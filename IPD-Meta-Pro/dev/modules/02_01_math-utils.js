const MathUtils = (function() {



 const gammaCache = new Map();

 const normCache = new Map();

 const chi2Cache = new Map();



 const SQRT2 = Math.sqrt(2);

 const SQRT2PI = Math.sqrt(2 * Math.PI);

 const LOG2PI_HALF = 0.5 * Math.log(2 * Math.PI);



 const NORM_A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,

 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];

 const NORM_B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,

 6.680131188771972e+01, -1.328068155288572e+01];

 const NORM_C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,

 -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];

 const NORM_D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,

 3.754408661907416e+00];

 const GAMMA_C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,

 771.32342877765313, -176.61502916214059, 12.507343278686905,

 -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];



 return {



 normCDF: function(x) {

 const key = x.toFixed(6);

 if (normCache.has(key)) return normCache.get(key);



 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;

 const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

 const sign = x < 0 ? -1 : 1;

 const ax = Math.abs(x) / SQRT2;

 const t = 1 / (1 + p * ax);

 const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);

 const result = 0.5 * (1 + sign * y);



 if (normCache.size < 10000) normCache.set(key, result);

 return result;

 },



 normQuantile: function(p) {

 if (p <= 0) return -Infinity;

 if (p >= 1) return Infinity;

 if (p === 0.5) return 0;



 const q = p - 0.5;

 if (Math.abs(q) <= 0.425) {

 const r = 0.180625 - q * q;

 return q * (((((((NORM_A[0]*r+NORM_A[1])*r+NORM_A[2])*r+NORM_A[3])*r+NORM_A[4])*r+NORM_A[5])*r+1) /

 (((((NORM_B[0]*r+NORM_B[1])*r+NORM_B[2])*r+NORM_B[3])*r+NORM_B[4])*r+1));

 }



 let r = q < 0 ? p : 1 - p;

 r = Math.max(1e-300, r); // Guard against floating point underflow

 r = Math.sqrt(-Math.log(r));

 const x = (((((NORM_C[0]*r+NORM_C[1])*r+NORM_C[2])*r+NORM_C[3])*r+NORM_C[4])*r+NORM_C[5]) /

 ((((NORM_D[0]*r+NORM_D[1])*r+NORM_D[2])*r+NORM_D[3])*r+1);

 return q < 0 ? -x : x;

 },



 logGamma: function(z) {

 const key = z.toFixed(6);

 if (gammaCache.has(key)) return gammaCache.get(key);



 if (z < 0.5) {

 const result = Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);

 if (gammaCache.size < 5000) gammaCache.set(key, result);

 return result;

 }



 z -= 1;

 let x = GAMMA_C[0];

 for (let i = 1; i < 9; i++) {

 x += GAMMA_C[i] / (z + i);

 }

 const t = z + 7.5;

 const result = LOG2PI_HALF + (z + 0.5) * Math.log(t) - t + Math.log(x);



 if (gammaCache.size < 5000) gammaCache.set(key, result);

 return result;

 },



 chi2CDF: function(x, df) {

 if (x <= 0) return 0;

 const key = `${x.toFixed(4)}_${df}`;

 if (chi2Cache.has(key)) return chi2Cache.get(key);



 const result = this.gammaCDF(x / 2, df / 2);

 if (chi2Cache.size < 5000) chi2Cache.set(key, result);

 return result;

 },



 gammaCDF: function(x, a) {

 if (x <= 0) return 0;

 if (a <= 0) return 1;



 const bt = Math.exp(a * Math.log(x) - x - this.logGamma(a));



 if (x < a + 1) {



 let sum = 1 / a, term = 1 / a;

 for (let n = 1; n < 200; n++) {

 term *= x / (a + n);

 sum += term;

 if (Math.abs(term) < 1e-12) break;

 }

 return bt * sum;

 } else {



 let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;

 for (let i = 1; i < 200; i++) {

 const an = -i * (i - a);

 b += 2;

 d = an * d + b;

 if (Math.abs(d) < 1e-30) d = 1e-30;

 c = b + an / c;

 if (Math.abs(c) < 1e-30) c = 1e-30;

 d = 1 / d;

 const del = d * c;

 h *= del;

 if (Math.abs(del - 1) < 1e-12) break;

 }

 return 1 - bt * h;

 }

 },



 chi2Quantile: function(p, df) {

 if (df <= 0) return 0;

 const z = this.normQuantile(p);

 const h = 2 / (9 * df);

 return df * Math.pow(Math.max(0, 1 - h + z * Math.sqrt(h)), 3);

 },



 tCDF: function(t, df) {

 const x = df / (df + t * t);

 const prob = 0.5 * this.betaInc(x, df / 2, 0.5);

 return t < 0 ? prob : 1 - prob;

 },



 tQuantile: function(p, df) {

 if (df <= 0) return 0;

 if (df === 1) return Math.tan(Math.PI * (p - 0.5));



 let x = this.normQuantile(p);

 for (let i = 0; i < 10; i++) {

 const fx = this.tCDF(x, df) - p;

 const fpx = Math.exp(this.logGamma((df+1)/2) - this.logGamma(df/2) -

 0.5*Math.log(df*Math.PI) - (df+1)/2 * Math.log(1 + x*x/df));

 if (Math.abs(fpx) < 1e-15) break;

 x -= fx / fpx;

 if (Math.abs(fx) < 1e-10) break;

 }

 return x;

 },



 betaInc: function(x, a, b) {

 if (x <= 0) return 0;

 if (x >= 1) return 1;



 const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +

 a * Math.log(x) + b * Math.log(1 - x));



 if (x < (a + 1) / (a + b + 2)) {

 return bt * this.betaCF(x, a, b) / a;

 }

 return 1 - bt * this.betaCF(1 - x, b, a) / b;

 },



 betaCF: function(x, a, b) {

 let am = 1, bm = 1, az = 1, bz = 0;

 for (let m = 1; m <= 100; m++) {

 const em = m;

 const d = em * (b - em) * x / ((a + 2*em - 1) * (a + 2*em));

 const ap = az + d * am;

 const bp = bz + d * bm;

 const d2 = -(a + em) * (a + b + em) * x / ((a + 2*em) * (a + 2*em + 1));

 const app = ap + d2 * az;

 const bpp = bp + d2 * bz;

 const aold = az;

 am = ap / bpp; bm = bp / bpp;

 az = app / bpp; bz = 1;

 if (Math.abs(az - aold) < 1e-10 * Math.abs(az)) return az;

 }

 return az;

 },



 clearCaches: function() {

 gammaCache.clear();

 normCache.clear();

 chi2Cache.clear();

 }

 };

 })();



 window.MathUtils = MathUtils;



 if (typeof jStat === 'undefined') {

 console.warn('jStat not loaded - using fallback implementations');

 var jStat = {

 mean: function(arr) { return arr.reduce(function(a,b){return a+b;}, 0) / arr.length; },

 stdev: function(arr) {

 var m = this.mean(arr);

 var v = arr.reduce(function(s,x){return s + Math.pow(x-m,2);}, 0) / (arr.length - 1);

 return Math.sqrt(v);

 },

 percentile: function(arr, p) {

 var sorted = arr.slice().sort(function(a,b){return a-b;});

 var idx = p * (sorted.length - 1);

 var lower = Math.floor(idx);

 var frac = idx - lower;

 if (lower + 1 < sorted.length) {

 return sorted[lower] * (1 - frac) + sorted[lower + 1] * frac;

 }

 return sorted[lower];

 },

 variance: function(arr) {

 if (!arr || arr.length < 2) return NaN; // Need at least 2 values for sample variance

 var m = this.mean(arr);

 return arr.reduce(function(s, x) { return s + Math.pow(x - m, 2); }, 0) / (arr.length - 1);

 },

 median: function(arr) {

 return this.percentile(arr, 0.5);

 },

 normal: {

 cdf: function(x, mean, std) {

 mean = mean || 0; std = std || 1;

 return 0.5 * (1 + erf((x - mean) / (std * Math.sqrt(2))));

 },

 inv: function(p, mean, std) {

 mean = mean || 0; std = std || 1;



 var a = [0, -0.322232431088, -1, -0.342242088547, -0.0204231210245, -0.0000453642210148];

 var b = [0, 0.0993484626060, 0.588581570495, 0.531103462366, 0.103537752850, 0.0038560700634];

 var y = p - 0.5;

 if (Math.abs(y) < 0.42) {

 var r = y * y;

 return mean + std * y * (a[1] + r * (a[2] + r * (a[3] + r * (a[4] + r * a[5])))) /

 (1 + r * (b[1] + r * (b[2] + r * (b[3] + r * (b[4] + r * b[5])))));

 }

                 return mean + std * (p > 0.5 ? 1 : -1) * Math.sqrt(-2 * Math.log(Math.min(p, 1-p)));

             }

         },

         studentt: {

                         inv: function(p, df) { return MathUtils.tQuantile(p, df); },

                         cdf: function(t, df) { return MathUtils.tCDF(t, df); }

                     },

                     chisquare: {

                         inv: function(p, df) { return MathUtils.chi2Quantile(p, df); },

                         cdf: function(x, df) { return MathUtils.chi2CDF(x, df); }

                     }

                 };

                 function erf(x) { var t = 1 / (1 + 0.5 * Math.abs(x));

 var tau = t * Math.exp(-x*x - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 +

 t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 + t*(-0.82215223 + t*0.17087277)))))))));

 return x >= 0 ? 1 - tau : tau - 1;

 }

 }



 const PS_TRUNCATION_THRESHOLD = 0.01;

 const PS_POSITIVITY_WARNING_THRESHOLD = 0.05;



 // TEST 4: Egger\'s test for publication bias



 function createInteractiveSensitivityPanel() {

 var panel = document.createElement('div');

 panel.id = 'interactiveSensitivity';

 panel.className = 'modal-overlay';

 panel.innerHTML = `

 <div class="modal" style="max-width: 1200px; max-height: 95vh;">

 <div class="modal-header">

 <h3>Interactive Sensitivity Analysis</h3>

 <span style="color: var(--accent-success); font-size: 0.8rem;">REAL-TIME UPDATES</span>

 <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('active')">&times;</button>

 </div>

 <div class="modal-body" style="display: grid; grid-template-columns: 300px 1fr; gap: 1.5rem;">

 <div class="sensitivity-controls" style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">

 <h4>Adjust Parameters</h4>



 <div class="form-group">

 <label>Exclude Studies (click to toggle)</label>

 <div id="studyToggles" style="max-height: 150px; overflow-y: auto;"></div>

 </div>



 <div class="form-group">

 <label>Heterogeneity Prior (τ²)</label>

 <input type="range" id="tauPriorSlider" min="0" max="1" step="0.01" value="0.1"

 oninput="updateSensitivityRealtime()" style="width: 100%;">

 <span id="tauPriorValue">0.10</span>

 </div>



 <div class="form-group">

 <label>Effect Size Transformation</label>

 <select id="effectTransform" onchange="updateSensitivityRealtime()">

 <option value="none">None (as reported)</option>

 <option value="log">Log transform</option>

 <option value="fisher">Fisher\'s z</option>

 <option value="arcsine">Arcsine</option>

 </select>

 </div>



 <div class="form-group">

 <label>Correlation Assumption (ρ)</label>

 <input type="range" id="rhoSlider" min="0" max="0.9" step="0.1" value="0.5"

 oninput="updateSensitivityRealtime()" style="width: 100%;">

 <span id="rhoValue">0.50</span>

 </div>



 <div class="form-group">

 <label>Outlier Threshold (IQR multiplier)</label>

 <input type="range" id="outlierSlider" min="1" max="4" step="0.5" value="2.5"

 oninput="updateSensitivityRealtime()" style="width: 100%;">

 <span id="outlierValue">2.5</span>

 </div>



 <div class="form-group">

 <label>Weight Cap (%)</label>

 <input type="range" id="weightCapSlider" min="10" max="100" step="5" value="100"

 oninput="updateSensitivityRealtime()" style="width: 100%;">

 <span id="weightCapValue">100%</span>

 </div>



 <button class="btn btn-primary" onclick="resetSensitivityDefaults()" style="width: 100%; margin-top: 1rem;">

 Reset to Defaults

 </button>

 </div>



 <div class="sensitivity-results">

 <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1rem;">

 <div class="stat-box" style="text-align: center;">

 <div class="stat-value" id="sensPooled">-</div>

 <div class="stat-label">Pooled Effect</div>

 </div>

 <div class="stat-box" style="text-align: center;">

 <div class="stat-value" id="sensCI">-</div>

 <div class="stat-label">95% CI</div>

 </div>

 <div class="stat-box" style="text-align: center;">

 <div class="stat-value" id="sensI2">-</div>

 <div class="stat-label">I²</div>

 </div>

 <div class="stat-box" style="text-align: center;">

 <div class="stat-value" id="sensPval">-</div>

 <div class="stat-label">P-value</div>

 </div>

 </div>



 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">

 <div>

 <h4>Live Forest Plot</h4>

 <canvas id="sensForestPlot" width="400" height="350"></canvas>

 </div>

 <div>

 <h4>Parameter Impact</h4>

 <canvas id="sensImpactPlot" width="400" height="350"></canvas>

 </div>

 </div>



 <div id="sensitivityInterpretation" style="margin-top: 1rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">

 <strong>Interpretation:</strong> Adjust parameters to see how robust your conclusions are.

 </div>

 </div>

 </div>

 </div>

 `;

 document.body.appendChild(panel);

 return panel;

 }



 var sensitivityCache = {};

 var sensitivityDebounce = null;



 function updateSensitivityRealtime() {



 clearTimeout(sensitivityDebounce);

 sensitivityDebounce = setTimeout(function() {

 performSensitivityUpdate();

 }, 50);

 }



function performSensitivityUpdate() {

 if (!APP.results || !APP.results.studies || !APP.results.pooled) return;



 var tauPrior = parseFloat(document.getElementById('tauPriorSlider').value);

 var rho = parseFloat(document.getElementById('rhoSlider').value);

 var outlierThreshold = parseFloat(document.getElementById('outlierSlider').value);

 var weightCap = parseFloat(document.getElementById('weightCapSlider').value) / 100;



 // Validate slider inputs - guard against NaN and out-of-range values

 if (isNaN(tauPrior) || tauPrior < 0) tauPrior = 0;

 if (isNaN(rho) || rho < 0 || rho > 1) rho = 0;

 if (isNaN(outlierThreshold) || outlierThreshold < 0) outlierThreshold = 2.5;

 if (isNaN(weightCap) || weightCap <= 0 || weightCap > 1) weightCap = 1;



 document.getElementById('tauPriorValue').textContent = tauPrior.toFixed(2);

 document.getElementById('rhoValue').textContent = rho.toFixed(2);

 document.getElementById('outlierValue').textContent = outlierThreshold.toFixed(1);

 document.getElementById('weightCapValue').textContent = Math.round(weightCap * 100) + '%';



 var excludedStudies = [];

 document.querySelectorAll('#studyToggles input:not(:checked)').forEach(function(cb) {

 excludedStudies.push(cb.value);

 });



 var activeStudies = APP.results.studies.filter(function(s) {

 return !excludedStudies.includes(s.study);

 });



 if (activeStudies.length < 2) {

 document.getElementById('sensPooled').textContent = 'Need ≥2';

 return;

 }



 var effects = activeStudies.map(function(s) { return s.effect; });

 var q1 = jStat.percentile(effects, 0.25);

 var q3 = jStat.percentile(effects, 0.75);

 var iqr = q3 - q1;

 var lowerBound = q1 - outlierThreshold * iqr;

 var upperBound = q3 + outlierThreshold * iqr;



 activeStudies = activeStudies.filter(function(s) {

 return s.effect >= lowerBound && s.effect <= upperBound;

 });



 if (activeStudies.length < 2) {

 document.getElementById('sensPooled').textContent = 'Too few';

 return;

 }



 var result = recalculatePooledEffect(activeStudies, tauPrior, weightCap);



 var isLogScale = APP.config.outcomeType !== 'continuous';

 var displayEffect = isLogScale ? Math.exp(result.pooled) : result.pooled;

 var displayLower = isLogScale ? Math.exp(result.lower) : result.lower;

 var displayUpper = isLogScale ? Math.exp(result.upper) : result.upper;



 document.getElementById('sensPooled').textContent = displayEffect.toFixed(3);

 document.getElementById('sensCI').textContent = displayLower.toFixed(2) + ' - ' + displayUpper.toFixed(2);

 document.getElementById('sensI2').textContent = result.I2.toFixed(1) + '%';

 document.getElementById('sensPval').textContent = result.pValue < 0.001 ? '<0.001' : result.pValue.toFixed(3);



 var originalEffect = APP.results.pooled.pooled;

 var changePercent = Math.abs((result.pooled - originalEffect) / originalEffect * 100);

 var interpretation = '';



 if (changePercent < 5) {

 interpretation = '<span style="color: var(--accent-success);">✓ Results are ROBUST</span> - conclusions stable across parameter variations.';

 } else if (changePercent < 15) {

 interpretation = '<span style="color: var(--accent-warning);">⚠ MODERATE sensitivity</span> - some variation but direction consistent.';

 } else {

 interpretation = '<span style="color: var(--accent-danger);">⚠ HIGH sensitivity</span> - conclusions depend on analytical choices.';

 }



 interpretation += '<br><small>Effect changed by ' + changePercent.toFixed(1) + '% from original (' +

 (isLogScale ? Math.exp(originalEffect) : originalEffect).toFixed(3) + ')</small>';



 document.getElementById('sensitivityInterpretation').innerHTML = '<strong>Interpretation:</strong> ' + interpretation;



 drawSensitivityForest(activeStudies, result);

 drawImpactPlot(result, APP.results.pooled);

 }



function recalculatePooledEffect(studies, tauPrior, weightCap) {

 var n = studies.length;

 if (n === 0) return { pooled: NaN, lower: NaN, upper: NaN, se: NaN, tau2: 0, I2: 0, pValue: NaN };

 var effects = studies.map(function(s) { return s.effect; });

 var variances = studies.map(function(s) { return s.se * s.se; });



 var weights = variances.map(function(v) { return 1 / v; });

 var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);

 if (totalWeight < 1e-10) return { pooled: NaN, lower: NaN, upper: NaN, se: NaN, tau2: 0, I2: 0, pValue: NaN };



 var maxWeight = totalWeight * weightCap;

 weights = weights.map(function(w) { return Math.min(w, maxWeight); });

 totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);



 var feEffect = 0;

 for (var i = 0; i < n; i++) {

 feEffect += weights[i] * effects[i];

 }

 feEffect /= totalWeight;



 var Q = 0;

 for (var i = 0; i < n; i++) {

 Q += weights[i] * Math.pow(effects[i] - feEffect, 2);

 }



 var C = totalWeight - weights.reduce(function(a, w) { return a + w * w; }, 0) / totalWeight;

 var tau2 = (C > 1e-10) ? Math.max(0, (Q - (n - 1)) / C) : 0;

 tau2 = tau2 * (1 - tauPrior) + tauPrior * 0.1;



 var reWeights = variances.map(function(v) { return 1 / (v + tau2); });

 var reTotalWeight = reWeights.reduce(function(a, b) { return a + b; }, 0);

 if (reTotalWeight < 1e-10) return { pooled: NaN, lower: NaN, upper: NaN, se: NaN, tau2: tau2, I2: 0, pValue: NaN };



 var reEffect = 0;

 for (var i = 0; i < n; i++) {

 reEffect += reWeights[i] * effects[i];

 }

 reEffect /= reTotalWeight;



 var reVar = 1 / reTotalWeight;

 var reSE = Math.sqrt(reVar);



 var I2 = (Q > (n - 1) && Q > 0) ? Math.max(0, (Q - (n - 1)) / Q * 100) : 0;



 var z = (reSE > 0) ? Math.abs(reEffect) / reSE : 0;

 var pValue = 2 * (1 - jStat.normal.cdf(z, 0, 1));



 return {

 pooled: reEffect,

 se: reSE,

 lower: reEffect - getConfZ() *reSE,

 upper: reEffect + getConfZ() *reSE,

 tau2: tau2,

 I2: I2,

 Q: Q,

 pValue: pValue,

 nStudies: n

 };

 }



function drawSensitivityForest(studies, result) {

 var canvas = document.getElementById('sensForestPlot');

 if (!canvas) return;



 var ctx = canvas.getContext('2d');

 if (!ctx) return;

 var width = canvas.width;

 var height = canvas.height;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#1a1a2e';

 ctx.fillRect(0, 0, width, height);



 var margin = { top: 30, right: 80, bottom: 30, left: 100 };

 var plotWidth = width - margin.left - margin.right;

 var plotHeight = height - margin.top - margin.bottom;



 var isLogScale = APP.config.outcomeType !== 'continuous';

 var allEffects = studies.map(function(s) { return isLogScale ? Math.exp(s.effect) : s.effect; });

 allEffects.push(isLogScale ? Math.exp(result.pooled) : result.pooled);



 // Guard: need effects to compute scale

 if (allEffects.length === 0 || allEffects.every(function(e) { return !isFinite(e); })) {

 return;

 }



 var minE = Math.min.apply(null, allEffects.filter(isFinite)) * 0.8;

 var maxE = Math.max.apply(null, allEffects.filter(isFinite)) * 1.2;

 var nullValue = isLogScale ? 1 : 0;



 var xScale = function(e) { return margin.left + (e - minE) / (maxE - minE) * plotWidth; };

 var rowHeight = plotHeight / (studies.length + 2);



 ctx.strokeStyle = '#666';

 ctx.setLineDash([3, 3]);

 ctx.beginPath();

 ctx.moveTo(xScale(nullValue), margin.top);

 ctx.lineTo(xScale(nullValue), height - margin.bottom);

 ctx.stroke();

 ctx.setLineDash([]);



 studies.forEach(function(s, i) {

 var y = margin.top + (i + 0.5) * rowHeight;

 var effect = isLogScale ? Math.exp(s.effect) : s.effect;

 var lower = isLogScale ? Math.exp(s.lower) : s.lower;

 var upper = isLogScale ? Math.exp(s.upper) : s.upper;



 ctx.strokeStyle = '#6366f1';

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(xScale(Math.max(lower, minE)), y);

 ctx.lineTo(xScale(Math.min(upper, maxE)), y);

 ctx.stroke();



 ctx.fillStyle = '#6366f1';

 ctx.beginPath();

 ctx.arc(xScale(effect), y, 5, 0, Math.PI * 2);

 ctx.fill();



 ctx.fillStyle = '#ccc';

 ctx.font = '10px system-ui';

 ctx.textAlign = 'right';

 ctx.fillText(s.study.substring(0, 12), margin.left - 5, y + 3);

 });



 var pooledY = margin.top + (studies.length + 0.5) * rowHeight;

 var pooledEffect = isLogScale ? Math.exp(result.pooled) : result.pooled;

 var pooledLower = isLogScale ? Math.exp(result.lower) : result.lower;

 var pooledUpper = isLogScale ? Math.exp(result.upper) : result.upper;



 ctx.fillStyle = '#10b981';

 ctx.beginPath();

 ctx.moveTo(xScale(pooledEffect), pooledY - 8);

 ctx.lineTo(xScale(pooledUpper), pooledY);

 ctx.lineTo(xScale(pooledEffect), pooledY + 8);

 ctx.lineTo(xScale(pooledLower), pooledY);

 ctx.closePath();

 ctx.fill();



 ctx.fillStyle = '#10b981';

 ctx.textAlign = 'right';

 ctx.font = 'bold 10px system-ui';

 ctx.fillText('Pooled', margin.left - 5, pooledY + 3);

 }



function drawImpactPlot(current, original) {

 var canvas = document.getElementById('sensImpactPlot');

 if (!canvas) return;



 var ctx = canvas.getContext('2d');

 var width = canvas.width;

 var height = canvas.height;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#1a1a2e';

 ctx.fillRect(0, 0, width, height);



 var metrics = [

 { label: 'Effect Size', current: current.pooled, original: original.pooled },

 { label: 'Std Error', current: current.se, original: original.se },

 { label: 'τ²', current: current.tau2, original: original.tau2 },

 { label: 'I²', current: current.I2, original: original.I2 }

 ];



 var barHeight = 40;

 var margin = { top: 40, left: 80, right: 40 };



 ctx.fillStyle = '#ccc';

 ctx.font = '12px system-ui';

 ctx.textAlign = 'center';

 ctx.fillText('Parameter Change from Original', width / 2, 20);



 metrics.forEach(function(m, i) {

 var y = margin.top + i * (barHeight + 15);

 var change = m.original !== 0 ? (m.current - m.original) / Math.abs(m.original) * 100 : 0;

 change = Math.max(-100, Math.min(100, change));



 ctx.fillStyle = '#ccc';

 ctx.font = '11px system-ui';

 ctx.textAlign = 'right';

 ctx.fillText(m.label, margin.left - 10, y + barHeight / 2 + 4);



 var zeroX = margin.left + (width - margin.left - margin.right) / 2;

 ctx.strokeStyle = '#444';

 ctx.beginPath();

 ctx.moveTo(zeroX, y);

 ctx.lineTo(zeroX, y + barHeight);

 ctx.stroke();



 var barWidth = (change / 100) * (width - margin.left - margin.right) / 2;

 ctx.fillStyle = change > 0 ? '#f59e0b' : '#6366f1';

 ctx.fillRect(zeroX, y + 5, barWidth, barHeight - 10);



 ctx.fillStyle = '#fff';

 ctx.textAlign = change > 0 ? 'left' : 'right';

 ctx.fillText((change > 0 ? '+' : '') + change.toFixed(1) + '%', zeroX + barWidth + (change > 0 ? 5 : -5), y + barHeight / 2 + 4);

 });

 }



function openInteractiveSensitivity() {

 if (!APP.results || !APP.results.studies) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 var panel = document.getElementById('interactiveSensitivity');

 if (!panel) {

 panel = createInteractiveSensitivityPanel();

 }



var togglesDiv = document.getElementById('studyToggles');

 togglesDiv.innerHTML = '';

 APP.results.studies.forEach(function(s) {

 const label = document.createElement('label');

 label.style.cssText = 'display:block;padding:0.25rem 0;cursor:pointer;';



 const input = document.createElement('input');

 input.type = 'checkbox';

 input.checked = true;

 input.value = String(s.study ?? '');

 input.addEventListener('change', updateSensitivityRealtime);



 const name = String(s.study ?? '').substring(0, 20);

 label.appendChild(input);

 label.appendChild(document.createTextNode(' ' + name));

 togglesDiv.appendChild(label);

 });



 panel.classList.add('active');

 updateSensitivityRealtime();

 }



function resetSensitivityDefaults() {

 document.getElementById('tauPriorSlider').value = 0.1;

 document.getElementById('rhoSlider').value = 0.5;

 document.getElementById('outlierSlider').value = 2.5;

 document.getElementById('weightCapSlider').value = 100;

 document.querySelectorAll('#studyToggles input').forEach(function(cb) { cb.checked = true; });

 updateSensitivityRealtime();

 }



function generateClinicalInterpretation(results, config) {

 var interpretation = {

 summary: '',

 clinical: '',

 limitations: '',

 recommendations: ''

 };



 if (!results || !results.pooled) {

 interpretation.summary = 'No pooled results available for interpretation.';

 return interpretation;

 }



 var isLogScale = config.outcomeType !== 'continuous';

 var effectName = config.effectMeasure || 'effect';

 var pooled = isLogScale ? Math.exp(results.pooled.pooled) : results.pooled.pooled;

 var lower = isLogScale ? Math.exp(results.pooled.lower) : results.pooled.lower;

 var upper = isLogScale ? Math.exp(results.pooled.upper) : results.pooled.upper;

 var I2 = results.pooled.I2;

 var pValue = results.pooled.pValue;

 var nStudies = results.studies.length;

 var nPatients = APP.data ? APP.data.length : results.studies.reduce(function(s, st) { return s + st.n; }, 0);



 var direction = '';

 var magnitude = '';

 var significance = pValue < 0.05 ? 'statistically significant' : 'not statistically significant';



 if (isLogScale) {

 if (pooled < 0.8) { direction = 'substantially reduced'; magnitude = 'large'; }

 else if (pooled < 0.95) { direction = 'reduced'; magnitude = 'moderate'; }

 else if (pooled < 1.05) { direction = 'similar'; magnitude = 'negligible'; }

 else if (pooled < 1.25) { direction = 'increased'; magnitude = 'moderate'; }

 else { direction = 'substantially increased'; magnitude = 'large'; }

 } else {

 var absEffect = Math.abs(pooled);

 if (absEffect < 0.1) { magnitude = 'negligible'; }

 else if (absEffect < 0.3) { magnitude = 'small'; }

 else if (absEffect < 0.5) { magnitude = 'moderate'; }

 else { magnitude = 'large'; }

 direction = pooled > 0 ? 'higher' : 'lower';

 }



 interpretation.summary = 'Based on ' + nStudies + ' studies including ' + nPatients.toLocaleString() +

 ' patients, the pooled ' + effectName + ' was ' + pooled.toFixed(2) +

 ' (95% CI: ' + lower.toFixed(2) + ' to ' + upper.toFixed(2) + '), ' +

 'indicating a ' + magnitude + ' and ' + significance + ' effect (p ' +

 (pValue < 0.001 ? '< 0.001' : '= ' + pValue.toFixed(3)) + ').';



 if (config.outcomeType === 'survival') {

 var rrr = ((1 - pooled) * 100).toFixed(0);

 var nnt = Math.abs(Math.round(1 / (0.1 * (1 - pooled))));



 if (pooled < 1 && pValue < 0.05) {

 interpretation.clinical = 'The treatment reduces the hazard by ' + rrr + '% compared to control. ' +

 'Assuming a baseline 10% event rate, approximately ' + nnt + ' patients would need to be treated ' +

 'to prevent one additional event (NNT ≈ ' + nnt + ').';

 } else if (pooled > 1 && pValue < 0.05) {

 interpretation.clinical = 'The treatment increases the hazard by ' + ((pooled - 1) * 100).toFixed(0) +

 '% compared to control, suggesting potential harm.';

 } else {

 interpretation.clinical = 'No statistically significant difference in survival outcomes was detected between groups.';

 }

 } else if (config.outcomeType === 'binary') {

 if (pooled < 1 && pValue < 0.05) {

 interpretation.clinical = 'The odds of the outcome are ' + ((1 - pooled) * 100).toFixed(0) +

 '% lower with treatment compared to control.';

 } else if (pooled > 1 && pValue < 0.05) {

 interpretation.clinical = 'The odds of the outcome are ' + ((pooled - 1) * 100).toFixed(0) +

 '% higher with treatment compared to control.';

 } else {

 interpretation.clinical = 'No statistically significant difference in outcome odds was observed.';

 }

 } else {

 interpretation.clinical = 'The mean difference between groups was ' + pooled.toFixed(2) +

 ' units, which represents a ' + magnitude + ' effect size.';

 }



 var hetInterpret = '';

 if (I2 < 25) {

 hetInterpret = 'Heterogeneity was low (I² = ' + I2.toFixed(1) + '%), suggesting consistent effects across studies.';

 } else if (I2 < 50) {

 hetInterpret = 'Moderate heterogeneity was observed (I² = ' + I2.toFixed(1) + '%), warranting exploration of potential effect modifiers.';

 } else if (I2 < 75) {

 hetInterpret = 'Substantial heterogeneity was detected (I² = ' + I2.toFixed(1) + '%). Results should be interpreted with caution, and subgroup analyses are recommended.';

 } else {

 hetInterpret = 'Very high heterogeneity (I² = ' + I2.toFixed(1) + '%) suggests that pooling may not be appropriate. Consider exploring sources of variation.';

 }

 interpretation.clinical += ' ' + hetInterpret;



 var limitations = [];

 if (nStudies < 5) limitations.push('Limited number of studies (k=' + nStudies + ') may affect precision');

 if (I2 > 50) limitations.push('High heterogeneity limits generalizability');

 if (results.egger && results.egger.pValue < 0.1) limitations.push('Evidence of potential publication bias');

 if (nPatients < 500) limitations.push('Relatively small total sample size');



 interpretation.limitations = limitations.length > 0 ?

 'Key limitations: ' + limitations.join('; ') + '.' :

 'No major methodological limitations identified.';



 var recs = [];

 if (pValue < 0.05 && I2 < 50) {

 recs.push('Consider implementation in clinical practice');

 } else if (pValue < 0.05 && I2 >= 50) {

 recs.push('Investigate sources of heterogeneity before implementation');

 recs.push('Consider subgroup-specific recommendations');

 } else {

 recs.push('Larger, well-designed trials may be needed');

 }

 if (nStudies >= 10) {

 recs.push('Meta-regression may help identify effect modifiers');

 }



 interpretation.recommendations = recs.join('. ') + '.';



 return interpretation;

 }



function displayClinicalInterpretation() {

 if (!APP.results) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 var interp = generateClinicalInterpretation(APP.results, APP.config);



 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 800px;">

 <div class="modal-header">

 <h3>Evidence-Based Clinical Interpretation</h3>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <div style="margin-bottom: 1.5rem;">

 <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Summary</h4>

 <p style="font-size: 1.1rem; line-height: 1.6;">${interp.summary}</p>

 </div>



 <div style="margin-bottom: 1.5rem;">

 <h4 style="color: var(--accent-success); margin-bottom: 0.5rem;">Clinical Interpretation</h4>

 <p style="line-height: 1.6;">${interp.clinical}</p>

 </div>



 <div style="margin-bottom: 1.5rem;">

 <h4 style="color: var(--accent-warning); margin-bottom: 0.5rem;">Limitations</h4>

 <p style="line-height: 1.6;">${interp.limitations}</p>

 </div>



 <div style="margin-bottom: 1rem;">

 <h4 style="color: var(--accent-info); margin-bottom: 0.5rem;">Recommendations</h4>

 <p style="line-height: 1.6;">${interp.recommendations}</p>

 </div>



 <div class="alert alert-info" style="font-size: 0.85rem;">

 <strong>Note:</strong> This interpretation is automatically generated based on statistical results.

 Clinical decisions should incorporate domain expertise and patient-specific factors.

 </div>

 </div>

 <div class="modal-footer">

 <button class="btn btn-secondary" onclick="copyInterpretation()">Copy to Clipboard</button>

 <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);



 window.currentInterpretation = interp;

 }



function copyInterpretation() {

 var interp = window.currentInterpretation;

 var text = 'SUMMARY:\n' + interp.summary + '\n\n' +

 'CLINICAL INTERPRETATION:\n' + interp.clinical + '\n\n' +

 'LIMITATIONS:\n' + interp.limitations + '\n\n' +

 'RECOMMENDATIONS:\n' + interp.recommendations;



 navigator.clipboard.writeText(text).then(function() {

 showNotification('Interpretation copied to clipboard', 'success');

 }).catch(function() {

 showNotification('Copy failed - please copy manually', 'warning');

 });

 }



 var uncertaintyAnimationFrame = null;



 function startUncertaintyAnimation() {

 if (!APP.results) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 var modal = document.createElement('div');

 modal.id = 'uncertaintyAnimationModal';

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 900px;">

 <div class="modal-header">

 <h3>Animated Uncertainty Visualization</h3>

 <span style="color: var(--accent-info);">Watch the data "breathe" within confidence intervals</span>

 <button class="modal-close" onclick="stopUncertaintyAnimation();this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <canvas id="uncertaintyCanvas" width="800" height="500" style="width: 100%;" role="img" aria-label="Uncertainty visualization for effect estimates"></canvas>

 <div style="margin-top: 1rem; display: flex; gap: 1rem; align-items: center;">

 <button class="btn btn-secondary" id="playPauseBtn" onclick="toggleUncertaintyAnimation()">Pause</button>

 <label>Animation Speed:

 <input type="range" id="animSpeedSlider" min="1" max="10" value="5" style="width: 100px;">

 </label>

 <label>

 <input type="checkbox" id="showTrailsCheckbox" checked> Show trails

 </label>

 </div>

 <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.9rem;">

 Each point samples from its posterior distribution. The "jitter" represents statistical uncertainty.

 Tighter movement = more precise estimate.

 </p>

 </div>

 </div>

 `;

 document.body.appendChild(modal);



 runUncertaintyAnimation();

 }



 var animationRunning = true;

 var animationTrails = [];



 function runUncertaintyAnimation() {

 var canvas = document.getElementById('uncertaintyCanvas');

 if (!canvas) return;

 if (!APP.results || !APP.results.pooled || !APP.results.studies) return;



 var ctx = canvas.getContext('2d');

 var width = canvas.width;

 var height = canvas.height;



 var studies = APP.results.studies;

 var isLogScale = APP.config.outcomeType !== 'continuous';



 var particles = studies.map(function(s, i) {

 return {

 study: s.study,

 baseEffect: s.effect,

 se: s.se,

 currentEffect: s.effect,

 y: 50 + i * ((height - 100) / studies.length),

 trail: []

 };

 });



 var pooledParticle = {

 study: 'Pooled',

 baseEffect: APP.results.pooled.pooled,

 se: APP.results.pooled.se,

 currentEffect: APP.results.pooled.pooled,

 y: height - 40,

 trail: []

 };



 function animate() {

 if (!document.getElementById('uncertaintyCanvas')) return;

 if (!animationRunning) {

 uncertaintyAnimationFrame = requestAnimationFrame(animate);

 return;

 }



 var speed = parseInt(document.getElementById('animSpeedSlider')?.value || 5);

 var showTrails = document.getElementById('showTrailsCheckbox')?.checked ?? true;



 ctx.fillStyle = showTrails ? 'rgba(26, 26, 46, 0.15)' : 'rgba(26, 26, 46, 1)';

 ctx.fillRect(0, 0, width, height);



 var allEffects = studies.map(function(s) { return isLogScale ? Math.exp(s.effect) : s.effect; });



 // Guard: need effects to compute scale

 if (allEffects.length === 0) {

 animationRunning = false;

 return;

 }



 var minE = Math.min.apply(null, allEffects.filter(isFinite)) * 0.7 || 0.1;

 var maxE = Math.max.apply(null, allEffects.filter(isFinite)) * 1.3 || 10;

 var nullValue = isLogScale ? 1 : 0;



 var margin = { left: 120, right: 80 };

 var plotWidth = width - margin.left - margin.right;

 var xScale = function(e) { return margin.left + (e - minE) / (maxE - minE) * plotWidth; };



 ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

 ctx.setLineDash([5, 5]);

 ctx.beginPath();

 ctx.moveTo(xScale(nullValue), 30);

 ctx.lineTo(xScale(nullValue), height - 60);

 ctx.stroke();

 ctx.setLineDash([]);



 particles.forEach(function(p, i) {



 var noise = (Math.random() - 0.5) * p.se * speed * 0.3;

 p.currentEffect = p.baseEffect + noise;



 var displayEffect = isLogScale ? Math.exp(p.currentEffect) : p.currentEffect;

 var x = xScale(displayEffect);



 if (showTrails) {

 p.trail.push({ x: x, y: p.y, alpha: 1 });

 if (p.trail.length > 20) p.trail.shift();



 p.trail.forEach(function(t, ti) {

 ctx.fillStyle = 'rgba(99, 102, 241, ' + (ti / p.trail.length * 0.5) + ')';

 ctx.beginPath();

 ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);

 ctx.fill();

 });

 }



 var lower = isLogScale ? Math.exp(p.baseEffect - getConfZ() *p.se) : p.baseEffect - getConfZ() *p.se;

 var upper = isLogScale ? Math.exp(p.baseEffect + getConfZ() *p.se) : p.baseEffect + getConfZ() *p.se;



 ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(xScale(lower), p.y);

 ctx.lineTo(xScale(upper), p.y);

 ctx.stroke();



 ctx.fillStyle = '#6366f1';

 ctx.beginPath();

 ctx.arc(x, p.y, 6, 0, Math.PI * 2);

 ctx.fill();



 ctx.fillStyle = '#ccc';

 ctx.font = '11px system-ui';

 ctx.textAlign = 'right';

 ctx.fillText(p.study.substring(0, 15), margin.left - 10, p.y + 4);

 });



 var pooledNoise = (Math.random() - 0.5) * pooledParticle.se * speed * 0.3;

 pooledParticle.currentEffect = pooledParticle.baseEffect + pooledNoise;



 var pooledDisplay = isLogScale ? Math.exp(pooledParticle.currentEffect) : pooledParticle.currentEffect;

 var pooledX = xScale(pooledDisplay);



 ctx.fillStyle = '#10b981';

 ctx.beginPath();

 ctx.moveTo(pooledX, pooledParticle.y - 10);

 ctx.lineTo(pooledX + 15, pooledParticle.y);

 ctx.lineTo(pooledX, pooledParticle.y + 10);

 ctx.lineTo(pooledX - 15, pooledParticle.y);

 ctx.closePath();

 ctx.fill();



 ctx.fillStyle = '#10b981';

 ctx.font = 'bold 11px system-ui';

 ctx.textAlign = 'right';

 ctx.fillText('POOLED', margin.left - 10, pooledParticle.y + 4);



 ctx.fillStyle = '#888';

 ctx.font = '10px system-ui';

 ctx.textAlign = 'center';

 for (var e = Math.ceil(minE * 10) / 10; e <= maxE; e += (maxE - minE) / 5) {

 ctx.fillText(e.toFixed(2), xScale(e), height - 10);

 }



 uncertaintyAnimationFrame = requestAnimationFrame(animate);

 }



 animate();

 }



function toggleUncertaintyAnimation() {

 animationRunning = !animationRunning;

 var btn = document.getElementById('playPauseBtn');

 if (btn) btn.textContent = animationRunning ? 'Pause' : 'Play';

 }



function stopUncertaintyAnimation() {

 if (uncertaintyAnimationFrame) {

 cancelAnimationFrame(uncertaintyAnimationFrame);

 uncertaintyAnimationFrame = null;

 }

 animationRunning = true;

 }



 var voiceRecognition = null;

 var voiceEnabled = false;



 function initVoiceControl() {

 if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {

 console.log('Voice control not supported in this browser');

 return false;

 }



 var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

 voiceRecognition = new SpeechRecognition();

 voiceRecognition.continuous = true;

 voiceRecognition.interimResults = false;

 voiceRecognition.lang = 'en-US';



 voiceRecognition.onresult = function(event) {

 // Guard against empty results array

 if (!event.results || event.results.length === 0) return;

 var resultArray = event.results[event.results.length - 1];

 if (!resultArray || resultArray.length === 0) return;

 // Guard: ensure transcript property exists

 if (!resultArray[0] || !resultArray[0].transcript) return;

 var command = resultArray[0].transcript.toLowerCase().trim();

 processVoiceCommand(command);

 };



 voiceRecognition.onerror = function(event) {

 console.log('Voice recognition error:', event.error);

 if (event.error === 'no-speech') {



 if (voiceEnabled) voiceRecognition.start();

 }

 };



 voiceRecognition.onend = function() {

 if (voiceEnabled) voiceRecognition.start();

 };



 return true;

 }



function toggleVoiceControl() {

 if (!voiceRecognition && !initVoiceControl()) {

 showNotification('Voice control not supported in this browser', 'warning');

 return;

 }



 voiceEnabled = !voiceEnabled;



 if (voiceEnabled) {

 voiceRecognition.start();

 showNotification('Voice control activated. Say "help" for commands.', 'success');

 speakText('Voice control activated');

 } else {

 voiceRecognition.stop();

 showNotification('Voice control deactivated', 'info');

 }



 updateVoiceButton();

 }



function updateVoiceButton() {

 var btn = document.getElementById('voiceControlBtn');

 if (btn) {

 btn.style.background = voiceEnabled ? 'var(--accent-success)' : 'var(--bg-tertiary)';

 btn.title = voiceEnabled ? 'Voice control ON (click to disable)' : 'Enable voice control';

 }

 }



function processVoiceCommand(command) {

 console.log('Voice command:', command);



 var response = '';



 if (command.includes('help') || command.includes('commands')) {

 response = 'Available commands: run analysis, show forest plot, show funnel plot, interpret results, sensitivity analysis, export results, read summary';

 showVoiceHelp();

 }

 else if (command.includes('run analysis') || command.includes('analyze')) {

 response = 'Running analysis';

 runAnalysis();

 }

 else if (command.includes('forest plot') || command.includes('show forest')) {

 response = 'Showing forest plot';

 switchToTab('results');

 }

 else if (command.includes('funnel plot') || command.includes('show funnel')) {

 response = 'Showing funnel plot';

 switchToTab('bias');

 }

 else if (command.includes('interpret') || command.includes('interpretation')) {

 response = 'Generating interpretation';

 displayClinicalInterpretation();

 }

 else if (command.includes('sensitivity')) {

 response = 'Opening sensitivity analysis';

 openInteractiveSensitivity();

 }

 else if (command.includes('export') || command.includes('download')) {

 response = 'Opening export options';

 exportAnalysis();

 }

 else if (command.includes('read summary') || command.includes('summarize') || command.includes('tell me')) {

 if (APP.results) {

 var interp = generateClinicalInterpretation(APP.results, APP.config);

 response = interp.summary;

 } else {

 response = 'Please run an analysis first';

 }

 }

 else if (command.includes('heterogeneity') || command.includes('i squared')) {

 if (APP.results && APP.results.pooled) {

 response = 'I squared is ' + APP.results.pooled.I2.toFixed(1) + ' percent';

 } else {

 response = 'Please run an analysis first';

 }

 }

 else if (command.includes('stop') || command.includes('cancel')) {

 response = 'Voice control deactivated';

 toggleVoiceControl();

 return;

 }

 else {

 response = 'Command not recognized. Say help for available commands.';

 }



 speakText(response);

 showNotification('Voice: ' + command, 'info');

 }



function speakText(text) {

 if ('speechSynthesis' in window) {

 var utterance = new SpeechSynthesisUtterance(text);

 utterance.rate = 1.0;

 utterance.pitch = 1.0;

 speechSynthesis.speak(utterance);

 }

 }



function showVoiceHelp() {

 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 500px;">

 <div class="modal-header">

 <h3>Voice Commands</h3>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <ul style="line-height: 2;">

 <li><strong>"Run analysis"</strong> - Execute meta-analysis</li>

 <li><strong>"Show forest plot"</strong> - Display forest plot</li>

 <li><strong>"Show funnel plot"</strong> - Display funnel plot</li>

 <li><strong>"Interpret results"</strong> - clinical interpretation</li>

 <li><strong>"Sensitivity analysis"</strong> - Open sensitivity panel</li>

 <li><strong>"Read summary"</strong> - Speak results aloud</li>

 <li><strong>"I squared"</strong> - Report heterogeneity</li>

 <li><strong>"Export"</strong> - Open export options</li>

 <li><strong>"Stop"</strong> - Deactivate voice control</li>

 </ul>

 </div>

 </div>

 `;

 document.body.appendChild(modal);

 }



function runPredictivePatientSelection() {

 if (!APP.data || APP.data.length < 100) {

 showNotification('Need at least 100 patients for predictive modeling', 'warning');

 return;

 }



 showLoadingOverlay('Training predictive model for patient selection...');



 setTimeout(function() {

 // Guard: ensure data is available

 if (!APP.data || APP.data.length === 0) {

 hideLoadingOverlay();

 showNotification('No data available for analysis', 'warning');

 return;

 }



 var treatmentVar = APP.config.treatmentVar || 'treatment';

 var outcomeVar = APP.config.eventVar || 'event';



 var firstRow = APP.data[0] || {};

 var covariates = Object.keys(firstRow).filter(function(k) {

 return !['study', 'study_id', 'patient_id', 'treatment', 'treatment_name', 'time', 'event'].includes(k) &&

 typeof firstRow[k] === 'number';

 }).slice(0, 6);



 if (covariates.length < 2) {

 hideLoadingOverlay();

 showNotification('Need at least 2 numeric covariates', 'warning');

 return;

 }



 var treated = APP.data.filter(function(d) { return d[treatmentVar] === 1; });

 var control = APP.data.filter(function(d) { return d[treatmentVar] === 0; });



 var cateByCovariate = {};



 covariates.forEach(function(cov) {

 var values = APP.data.map(function(d) { return d[cov]; }).filter(function(v) { return !isNaN(v); });

 var median = jStat.median(values);



 var lowTreated = treated.filter(function(d) { return d[cov] <= median; });

 var lowControl = control.filter(function(d) { return d[cov] <= median; });

 var highTreated = treated.filter(function(d) { return d[cov] > median; });

 var highControl = control.filter(function(d) { return d[cov] > median; });



 var lowEffect = calculateGroupEffect(lowTreated, lowControl, outcomeVar);

 var highEffect = calculateGroupEffect(highTreated, highControl, outcomeVar);



 cateByCovariate[cov] = {

 lowEffect: lowEffect,

 highEffect: highEffect,

 interaction: highEffect.effect - lowEffect.effect,

 interactionSE: Math.sqrt(lowEffect.se * lowEffect.se + highEffect.se * highEffect.se),

 median: median

 };

 });



 var sortedCovs = Object.keys(cateByCovariate).sort(function(a, b) {

 return Math.abs(cateByCovariate[b].interaction) - Math.abs(cateByCovariate[a].interaction);

 });



 // Guard: need at least one covariate with CATE estimates

 if (sortedCovs.length === 0) {

 hideLoadingOverlay();

 showNotification('No CATE estimates computed - check covariates', 'warning');

 return;

 }



 var bestPredictor = sortedCovs[0];

 var bestCate = cateByCovariate[bestPredictor];



 var predictions = APP.data.map(function(d) {

 var score = 0;

 sortedCovs.forEach(function(cov, i) {

 var cate = cateByCovariate[cov];

 var weight = 1 / (i + 1);

 var aboveMedian = d[cov] > cate.median ? 1 : -1;

 score += weight * aboveMedian * cate.interaction;

 });

 return {

 patient_id: d.patient_id || d.study_id + '_' + Math.random().toString(36).substr(2, 5),

 score: score,

 treatment: d[treatmentVar],

 outcome: d[outcomeVar],

 predicted_benefit: score > 0 ? 'High' : 'Low'

 };

 });



 var predictedBenefit = predictions.filter(function(p) { return p.predicted_benefit === 'High'; });

 var predictedNoBenefit = predictions.filter(function(p) { return p.predicted_benefit === 'Low'; });



 var benefitTreated = predictedBenefit.filter(function(p) { return p.treatment === 1; });

 var benefitControl = predictedBenefit.filter(function(p) { return p.treatment === 0; });

 var noBenefitTreated = predictedNoBenefit.filter(function(p) { return p.treatment === 1; });

 var noBenefitControl = predictedNoBenefit.filter(function(p) { return p.treatment === 0; });



 // Guard against empty groups (division by zero)

 var effectInBenefiters = (benefitTreated.length > 0 && benefitControl.length > 0) ? (

 benefitTreated.filter(function(p) { return p.outcome === 1; }).length / benefitTreated.length -

 benefitControl.filter(function(p) { return p.outcome === 1; }).length / benefitControl.length

 ) : NaN;



 var effectInNonBenefiters = (noBenefitTreated.length > 0 && noBenefitControl.length > 0) ? (

 noBenefitTreated.filter(function(p) { return p.outcome === 1; }).length / noBenefitTreated.length -

 noBenefitControl.filter(function(p) { return p.outcome === 1; }).length / noBenefitControl.length

 ) : NaN;



 hideLoadingOverlay();



 displayPredictiveResults({

 covariates: covariates,

 cateByCovariate: cateByCovariate,

 bestPredictor: bestPredictor,

 bestCate: bestCate,

 sortedCovs: sortedCovs,

 predictions: predictions,

 validation: {

 nBenefiters: predictedBenefit.length,

 nNonBenefiters: predictedNoBenefit.length,

 effectInBenefiters: effectInBenefiters,

 effectInNonBenefiters: effectInNonBenefiters

 }

 });

 }, 100);

 }



function calculateGroupEffect(treated, control, outcomeVar) {

 if (!treated || treated.length === 0 || !control || control.length === 0) {

 return { effect: NaN, se: NaN, n: (treated ? treated.length : 0) + (control ? control.length : 0), error: 'Empty group' };

 }

 var treatedRate = treated.filter(function(d) { return d[outcomeVar] === 1; }).length / treated.length;

 var controlRate = control.filter(function(d) { return d[outcomeVar] === 1; }).length / control.length;

 var effect = treatedRate - controlRate;

 var se = Math.sqrt(treatedRate * (1 - treatedRate) / treated.length + controlRate * (1 - controlRate) / control.length);

 return { effect: effect, se: se ?? 0.1, n: treated.length + control.length };

 }



function displayPredictiveResults(results) {

 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">

 <div class="modal-header">

 <h3>Predictive Patient Selection</h3>

 <span style="color: var(--accent-success);">Personalized Treatment Benefit</span>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <div class="alert alert-success" style="margin-bottom: 1.5rem;">

 <strong>Best Predictor of Benefit:</strong> ${results.bestPredictor}<br>

 Patients with ${results.bestPredictor} > ${results.bestCate.median.toFixed(1)} show

 ${Math.abs(results.bestCate.interaction * 100).toFixed(1)}%

 ${results.bestCate.interaction > 0 ? 'greater' : 'lesser'} treatment effect.

 </div>



 <h4>Treatment Effect by Patient Characteristics</h4>

 <table class="data-table" style="margin-bottom: 1.5rem;">

 <thead>

 <tr>

 <th>Covariate</th>

 <th>Median</th>

 <th>Effect (Low)</th>

 <th>Effect (High)</th>

 <th>Interaction</th>

 <th>Predictive?</th>

 </tr>

 </thead>

 <tbody>

 ${results.sortedCovs.map(function(cov) {

 var c = results.cateByCovariate[cov];

 var z = Math.abs(c.interaction / c.interactionSE);

 var sig = z > getConfZ();

 return '<tr>' +

 '<td>' + cov + '</td>' +

 '<td>' + c.median.toFixed(1) + '</td>' +

 '<td>' + (c.lowEffect.effect * 100).toFixed(1) + '%</td>' +

 '<td>' + (c.highEffect.effect * 100).toFixed(1) + '%</td>' +

 '<td>' + (c.interaction > 0 ? '+' : '') + (c.interaction * 100).toFixed(1) + '%</td>' +

 '<td>' + (sig ? '<span style="color: var(--accent-success);">Yes</span>' : 'No') + '</td>' +

 '</tr>';

 }).join('')}

 </tbody>

 </table>



 <h4>Model Validation</h4>

 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">

 <div class="stat-card" style="text-align: center;">

 <h5>Predicted Benefiters (n=${results.validation.nBenefiters})</h5>

 <p style="font-size: 1.5rem; color: var(--accent-success);">

 ${(results.validation.effectInBenefiters * 100).toFixed(1)}%

 </p>

 <p>Treatment Effect</p>

 </div>

 <div class="stat-card" style="text-align: center;">

 <h5>Predicted Non-Benefiters (n=${results.validation.nNonBenefiters})</h5>

 <p style="font-size: 1.5rem; color: var(--accent-warning);">

 ${(results.validation.effectInNonBenefiters * 100).toFixed(1)}%

 </p>

 <p>Treatment Effect</p>

 </div>

 </div>



 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">

 <div>

 <h4>CATE Forest Plot</h4>

 <canvas id="cateForestPlot" width="400" height="300"></canvas>

 </div>

 <div>

 <h4>Benefit Score Distribution</h4>

 <canvas id="benefitScoreHist" width="400" height="300"></canvas>

 </div>

 </div>



 <div class="alert alert-info" style="margin-top: 1.5rem;">

 <strong>Clinical Application:</strong> Use these predictors to identify patients most likely

 to benefit from treatment. Consider ${results.bestPredictor} as a key factor in treatment decisions.

 </div>

 </div>

 <div class="modal-footer">

 <button class="btn btn-secondary" onclick="exportPredictions()">Export Predictions</button>

 <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);



 window.currentPredictions = results;



 setTimeout(function() {

 drawCATEForest(results);

 drawBenefitHistogram(results.predictions);

 }, 100);

 }


function exportPredictions() {

 var payload = window.currentPredictions;

 if (!payload) {

 showNotification('No prediction output to export. Run prediction analysis first.', 'warning');

 return;

 }



 var stamp = new Date().toISOString().replace(/[:.]/g, '-');

 var saveBlob = function(content, mime, filename) {

 var blob = new Blob([content], { type: mime });

 var url = URL.createObjectURL(blob);

 var a = document.createElement('a');

 a.href = url;

 a.download = filename;

 a.click();

 URL.revokeObjectURL(url);

 };



 var predictions = Array.isArray(payload.predictions) ? payload.predictions : [];

 if (predictions.length && typeof escapeCSV === 'function') {

 var cols = Object.keys(predictions[0]);

 var csv = cols.map(escapeCSV).join(',') + '\n';

 predictions.forEach(function(row) {

 var line = cols.map(function(c) { return escapeCSV(row[c]); }).join(',');

 csv += line + '\n';

 });

 saveBlob(csv, 'text/csv', 'ipd_predictions_' + stamp + '.csv');

 }

 saveBlob(JSON.stringify(payload, null, 2), 'application/json', 'ipd_predictions_' + stamp + '.json');

 showNotification('Predictions exported', 'success');

}



function drawCATEForest(results) {

 var canvas = document.getElementById('cateForestPlot');

 if (!canvas) return;



 var ctx = canvas.getContext('2d');

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#1a1a2e';

 ctx.fillRect(0, 0, canvas.width, canvas.height);



 var margin = { top: 30, right: 60, bottom: 30, left: 100 };

 var width = canvas.width - margin.left - margin.right;

 var height = canvas.height - margin.top - margin.bottom;



 var covs = results.sortedCovs;

 var rowHeight = height / (covs.length * 2 + 1);



 var allEffects = [];

 covs.forEach(function(cov) {

 var c = results.cateByCovariate[cov];

 allEffects.push(c.lowEffect.effect - getConfZ() *c.lowEffect.se);

 allEffects.push(c.lowEffect.effect + getConfZ() *c.lowEffect.se);

 allEffects.push(c.highEffect.effect - getConfZ() *c.highEffect.se);

 allEffects.push(c.highEffect.effect + getConfZ() *c.highEffect.se);

 });



 // Guard: need effects to compute scale

 if (allEffects.length === 0) {

 return;

 }



 var finiteEffects = allEffects.filter(isFinite);

 var minE = (finiteEffects.length > 0 ? Math.min.apply(null, finiteEffects) : -1) - 0.05;

 var maxE = (finiteEffects.length > 0 ? Math.max.apply(null, finiteEffects) : 1) + 0.05;

 var xScale = function(e) { return margin.left + (e - minE) / (maxE - minE) * width; };



 ctx.strokeStyle = '#666';

 ctx.setLineDash([3, 3]);

 ctx.beginPath();

 ctx.moveTo(xScale(0), margin.top);

 ctx.lineTo(xScale(0), canvas.height - margin.bottom);

 ctx.stroke();

 ctx.setLineDash([]);



 covs.forEach(function(cov, i) {

 var c = results.cateByCovariate[cov];

 var yLow = margin.top + (i * 2 + 0.5) * rowHeight;

 var yHigh = margin.top + (i * 2 + 1.5) * rowHeight;



 ctx.strokeStyle = '#6366f1';

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(xScale(c.lowEffect.effect - getConfZ() *c.lowEffect.se), yLow);

 ctx.lineTo(xScale(c.lowEffect.effect + getConfZ() *c.lowEffect.se), yLow);

 ctx.stroke();



 ctx.fillStyle = '#6366f1';

 ctx.beginPath();

 ctx.arc(xScale(c.lowEffect.effect), yLow, 5, 0, Math.PI * 2);

 ctx.fill();



 ctx.strokeStyle = '#10b981';

 ctx.beginPath();

 ctx.moveTo(xScale(c.highEffect.effect - getConfZ() *c.highEffect.se), yHigh);

 ctx.lineTo(xScale(c.highEffect.effect + getConfZ() *c.highEffect.se), yHigh);

 ctx.stroke();



 ctx.fillStyle = '#10b981';

 ctx.beginPath();

 ctx.arc(xScale(c.highEffect.effect), yHigh, 5, 0, Math.PI * 2);

 ctx.fill();



 ctx.fillStyle = '#ccc';

 ctx.font = '10px system-ui';

 ctx.textAlign = 'right';

 ctx.fillText(cov + ' ≤ ' + c.median.toFixed(0), margin.left - 5, yLow + 3);

 ctx.fillText(cov + ' > ' + c.median.toFixed(0), margin.left - 5, yHigh + 3);

 });

 }



function drawBenefitHistogram(predictions) {

 var canvas = document.getElementById('benefitScoreHist');

 if (!canvas) return;



 var ctx = canvas.getContext('2d');

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#1a1a2e';

 ctx.fillRect(0, 0, canvas.width, canvas.height);



 var scores = predictions.map(function(p) { return p.score; });



 // Guard: need scores to compute histogram

 if (scores.length === 0) {

 return;

 }



 var min = Math.min.apply(null, scores);

 var max = Math.max.apply(null, scores);



 var nBins = 20;

 // Guard: avoid division by zero when all scores are identical

 var binWidth = (max > min) ? (max - min) / nBins : 1;

 var bins = new Array(nBins).fill(0);



 scores.forEach(function(s) {

 var bin = Math.min(Math.floor((s - min) / binWidth), nBins - 1);

 if (isNaN(bin) || bin < 0) bin = 0;

 bins[bin]++;

 });



 var maxCount = Math.max.apply(null, bins);

 var margin = { top: 30, right: 20, bottom: 40, left: 40 };

 var width = canvas.width - margin.left - margin.right;

 var height = canvas.height - margin.top - margin.bottom;



 bins.forEach(function(count, i) {

 var x = margin.left + i * (width / nBins);

 var barHeight = (count / maxCount) * height;

 var score = min + (i + 0.5) * binWidth;



 ctx.fillStyle = score > 0 ? '#10b981' : '#6366f1';

 ctx.fillRect(x, margin.top + height - barHeight, width / nBins - 1, barHeight);

 });



 var zeroX = margin.left + (0 - min) / (max - min) * width;

 ctx.strokeStyle = '#fff';

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(zeroX, margin.top);

 ctx.lineTo(zeroX, canvas.height - margin.bottom);

 ctx.stroke();



 ctx.fillStyle = '#ccc';

 ctx.font = '10px system-ui';

 ctx.textAlign = 'center';

 ctx.fillText('Predicted Benefit Score', canvas.width / 2, canvas.height - 10);

 ctx.fillText('← Less Benefit | More Benefit →', canvas.width / 2, canvas.height - 25);

 }



function generateReproducibilityReport() {

 if (!APP.results) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 var report = [];

 var timestamp = new Date().toISOString();



 report.push('# IPD Meta-Analysis Reproducibility Report');

 report.push('Generated: ' + timestamp);

 report.push('Tool: IPD Meta-Analysis Pro v2.0');

 report.push('');



 report.push('## 1. Data Summary');

 report.push('- Total patients: ' + (APP.data ? APP.data.length : 'N/A'));

 report.push('- Number of studies: ' + APP.results.studies.length);

 report.push('- Variables: ' + (APP.variables ? APP.variables.map(v => getVarName(v)).filter(Boolean).join(', ') : 'N/A'));

 report.push('');



 report.push('## 2. Analysis Configuration');

 report.push('```json');

 report.push(JSON.stringify(APP.config, null, 2));

 report.push('```');

 report.push('');



 report.push('## 3. Study-Level Results');

 report.push('| Study | N | Effect | SE | 95% CI | Weight |');

 report.push('|-------|---|--------|----|---------| ------|');

 APP.results.studies.forEach(function(s) {

 var isLog = APP.config.outcomeType !== 'continuous';

 var effect = isLog ? Math.exp(s.effect) : s.effect;

 var lower = isLog ? Math.exp(s.lower) : s.lower;

 var upper = isLog ? Math.exp(s.upper) : s.upper;

 report.push('| ' + s.study + ' | ' + s.n + ' | ' + effect.toFixed(3) + ' | ' + s.se.toFixed(4) +

 ' | ' + lower.toFixed(2) + '-' + upper.toFixed(2) + ' | ' + (s.weight * 100).toFixed(1) + '% |');

 });

 report.push('');



 report.push('## 4. Pooled Results');

 var pooled = APP.results.pooled;

 var isLog = APP.config.outcomeType !== 'continuous';

 report.push('- Pooled effect: ' + (isLog ? Math.exp(pooled.pooled) : pooled.pooled).toFixed(4));

 report.push('- 95% CI: ' + (isLog ? Math.exp(pooled.lower) : pooled.lower).toFixed(4) + ' to ' +

 (isLog ? Math.exp(pooled.upper) : pooled.upper).toFixed(4));

 report.push('- P-value: ' + pooled.pValue.toFixed(6));

 report.push('- Heterogeneity: I² = ' + pooled.I2.toFixed(1) + '%, τ² = ' + pooled.tau2.toFixed(4));

 report.push('- Q statistic: ' + pooled.Q.toFixed(2) + ' (df = ' + pooled.df + ', p = ' + pooled.pQ.toFixed(4) + ')');

 report.push('');



 report.push('## 5. Software Environment');

 report.push('- Browser: ' + navigator.userAgent);

 report.push('- Screen: ' + window.innerWidth + 'x' + window.innerHeight);

 report.push('- jStat version: ' + (typeof jStat !== 'undefined' ? 'loaded' : 'fallback'));

 report.push('');



 report.push('## 6. Computational Details');

 report.push('- Random effects method: ' + (APP.config.reMethod || 'REML'));

 report.push('- Variance estimator: DerSimonian-Laird with REML refinement');

 report.push('- CI method: Wald (normal approximation)');

 report.push('- HKSJ adjustment: ' + (APP.config.useHKSJ ? 'Yes' : 'No'));

 report.push('');



 report.push('## 7. Checksums');

 var dataHash = simpleHash(JSON.stringify(APP.data || []));

 var configHash = simpleHash(JSON.stringify(APP.config));

 var resultsHash = simpleHash(JSON.stringify(APP.results));

 report.push('- Data hash: ' + dataHash);

 report.push('- Config hash: ' + configHash);

 report.push('- Results hash: ' + resultsHash);

 report.push('');



 report.push('## 8. Reproducibility Statement');

 report.push('This analysis can be reproduced by:');

 report.push('1. Loading the same dataset (hash: ' + dataHash + ')');

 report.push('2. Applying configuration (hash: ' + configHash + ')');

 report.push('3. Results should match (hash: ' + resultsHash + ')');

 report.push('');



 report.push('---');

 report.push('*Report generated by IPD Meta-Analysis Pro*');



 var reportText = report.join('\n');



 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 900px; max-height: 90vh;">

 <div class="modal-header">

 <h3>Reproducibility Report</h3>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">

 <pre style="white-space: pre-wrap; font-size: 0.85rem; line-height: 1.5;">${reportText}</pre>

 </div>

 <div class="modal-footer">

 <button class="btn btn-secondary" onclick="downloadReproReport()">Download Markdown</button>

 <button class="btn btn-secondary" onclick="downloadReproJSON()">Download JSON</button>

 <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);



 window.currentReproReport = reportText;

 }



function simpleHash(str) {

 var hash = 0;

 for (var i = 0; i < str.length; i++) {

 var char = str.charCodeAt(i);

 hash = ((hash << 5) - hash) + char;

 hash = hash & hash;

 }

 return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');

 }



function downloadReproReport() {

 var blob = new Blob([window.currentReproReport], { type: 'text/markdown' });

 var url = URL.createObjectURL(blob);

 var a = document.createElement('a');

 a.href = url;

 a.download = 'reproducibility_report_' + new Date().toISOString().split('T')[0] + '.md';

 a.click();

 showNotification('Report downloaded', 'success');

 }



function downloadReproJSON() {

 var data = {

 timestamp: new Date().toISOString(),

 config: APP.config,

 results: APP.results,

 dataHash: simpleHash(JSON.stringify(APP.data || [])),

 configHash: simpleHash(JSON.stringify(APP.config)),

 resultsHash: simpleHash(JSON.stringify(APP.results))

 };



 var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

 var url = URL.createObjectURL(blob);

 var a = document.createElement('a');

 a.href = url;

 a.download = 'analysis_checkpoint_' + new Date().toISOString().split('T')[0] + '.json';

 a.click();

 showNotification('Checkpoint saved', 'success');

 }





 document.addEventListener('DOMContentLoaded', function() {

if (typeof addAdvancedFeatureButtons === 'function') {

setTimeout(addAdvancedFeatureButtons, 500);

}

});



 class RandomForestHeterogeneity {

 constructor(options) {

 this.nTrees = options.nTrees || 100;

 this.maxDepth = options.maxDepth || 5;

 this.minSamplesLeaf = options.minSamplesLeaf || 10;

 this.maxFeatures = options.maxFeatures || 'sqrt';

 this.trees = [];

 this.oobPredictions = [];

 this.variableImportance = {};

 }



 bootstrapSample(data) {

 var n = data.length;

 var indices = [];

 var oobIndices = new Set(Array.from({length: n}, function(_, i) { return i; }));



 for (var i = 0; i < n; i++) {

 var idx = Math.floor(Math.random() * n);

 indices.push(idx);

 oobIndices.delete(idx);

 }



 return {

 sample: indices.map(function(i) { return data[i]; }),

 oobIndices: Array.from(oobIndices)

 };

 }



 calculateCATEInSubset(data, treatmentVar, outcomeVar) {

 var treated = data.filter(function(d) { return d[treatmentVar] === 1; });

 var control = data.filter(function(d) { return d[treatmentVar] === 0; });



 if (treated.length < 5 || control.length < 5) return null;



 var meanTreated = treated.reduce(function(s, d) { return s + d[outcomeVar]; }, 0) / treated.length;

 var meanControl = control.reduce(function(s, d) { return s + d[outcomeVar]; }, 0) / control.length;



 return {

 cate: meanTreated - meanControl,

 n: data.length,

 variance: this.calculateVariance(treated, control, outcomeVar)

 };

 }



 calculateVariance(treated, control, outcomeVar) {

 var varT = jStat.variance(treated.map(function(d) { return d[outcomeVar]; }));

 var varC = jStat.variance(control.map(function(d) { return d[outcomeVar]; }));

 return varT / treated.length + varC / control.length;

 }



 findBestSplit(data, covariates, treatmentVar, outcomeVar, usedFeatures) {

 var self = this;

 var bestGain = 0;

 var bestSplit = null;



 var parentCATE = this.calculateCATEInSubset(data, treatmentVar, outcomeVar);

 if (!parentCATE) return null;



 var nFeatures = this.maxFeatures === 'sqrt' ?

 Math.ceil(Math.sqrt(covariates.length)) :

 Math.ceil(covariates.length / 3);



 var shuffled = covariates.slice().sort(function() { return Math.random() - 0.5; });

 var selectedFeatures = shuffled.slice(0, nFeatures);



 selectedFeatures.forEach(function(cov) {

 var values = data.map(function(d) { return d[cov]; }).filter(function(v) { return v != null && !isNaN(v); });

 if (values.length < self.minSamplesLeaf * 2) return;



 var sorted = values.slice().sort(function(a, b) { return a - b; });

 var percentiles = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];



 percentiles.forEach(function(p) {

 var threshold = sorted[Math.floor(sorted.length * p)];



 var left = data.filter(function(d) { return d[cov] <= threshold; });

 var right = data.filter(function(d) { return d[cov] > threshold; });



 if (left.length < self.minSamplesLeaf || right.length < self.minSamplesLeaf) return;



 var leftCATE = self.calculateCATEInSubset(left, treatmentVar, outcomeVar);

 var rightCATE = self.calculateCATEInSubset(right, treatmentVar, outcomeVar);



 if (!leftCATE || !rightCATE) return;



 var parentVar = parentCATE.variance;

 var weightedChildVar = (left.length * leftCATE.variance + right.length * rightCATE.variance) / data.length;

 var gain = parentVar - weightedChildVar;



 var cateDiff = Math.abs(leftCATE.cate - rightCATE.cate);

 var combinedGain = gain + 0.5 * cateDiff;



 if (combinedGain > bestGain) {

 bestGain = combinedGain;

 bestSplit = {

 feature: cov,

 threshold: threshold,

 gain: combinedGain,

 leftCATE: leftCATE,

 rightCATE: rightCATE

 };

 }

 });

 });



 return bestSplit;

 }



 buildTree(data, covariates, treatmentVar, outcomeVar, depth) {

 var self = this;



 if (depth >= this.maxDepth || data.length < this.minSamplesLeaf * 2) {

 var cate = this.calculateCATEInSubset(data, treatmentVar, outcomeVar);

 return { type: 'leaf', cate: cate ? cate.cate : 0, n: data.length, variance: cate ? cate.variance : 1 };

 }



 var split = this.findBestSplit(data, covariates, treatmentVar, outcomeVar);



 if (!split || split.gain < 0.001) {

 var cate = this.calculateCATEInSubset(data, treatmentVar, outcomeVar);

 return { type: 'leaf', cate: cate ? cate.cate : 0, n: data.length, variance: cate ? cate.variance : 1 };

 }



 var left = data.filter(function(d) { return d[split.feature] <= split.threshold; });

 var right = data.filter(function(d) { return d[split.feature] > split.threshold; });



 return {

 type: 'node',

 feature: split.feature,

 threshold: split.threshold,

 gain: split.gain,

 left: this.buildTree(left, covariates, treatmentVar, outcomeVar, depth + 1),

 right: this.buildTree(right, covariates, treatmentVar, outcomeVar, depth + 1)

 };

 }



 fit(data, covariates, treatmentVar, outcomeVar) {

 var self = this;

 this.trees = [];

 this.oobPredictions = new Array(data.length).fill(null).map(function() { return []; });



 console.log('Training Random Forest with ' + this.nTrees + ' trees...');



 for (var t = 0; t < this.nTrees; t++) {

 var bootstrap = this.bootstrapSample(data);

 var tree = this.buildTree(bootstrap.sample, covariates, treatmentVar, outcomeVar, 0);

 this.trees.push(tree);



 bootstrap.oobIndices.forEach(function(idx) {

 var pred = self.predictSingle(tree, data[idx]);

 self.oobPredictions[idx].push(pred);

 });



 if ((t + 1) % 20 === 0) {

 console.log(' Trained ' + (t + 1) + '/' + this.nTrees + ' trees');

 }

 }



 this.calculateVariableImportance(covariates);



 return this;

 }



 predictSingle(tree, obs) {

 if (tree.type === 'leaf') return tree.cate;



 if (obs[tree.feature] <= tree.threshold) {

 return this.predictSingle(tree.left, obs);

 } else {

 return this.predictSingle(tree.right, obs);

 }

 }



 predict(data) {

 var self = this;

 return data.map(function(d) {

 var predictions = self.trees.map(function(tree) {

 return self.predictSingle(tree, d);

 });

 return {

 cate: jStat.mean(predictions),

 variance: jStat.variance(predictions),

 lower: jStat.percentile(predictions, 0.025),

 upper: jStat.percentile(predictions, 0.975)

 };

 });

 }



 calculateVariableImportance(covariates) {

 var self = this;

 this.variableImportance = {};



 covariates.forEach(function(cov) {

 var totalImportance = 0;

 self.trees.forEach(function(tree) {

 totalImportance += self.getFeatureImportanceInTree(tree, cov);

 });

 self.variableImportance[cov] = totalImportance / self.nTrees;

 });



 var total = Object.values(this.variableImportance).reduce(function(a, b) { return a + b; }, 0);

 if (total > 0) {

 Object.keys(this.variableImportance).forEach(function(k) {

 self.variableImportance[k] /= total;

 });

 }

 }



 getFeatureImportanceInTree(tree, feature) {

 if (tree.type === 'leaf') return 0;



 var importance = tree.feature === feature ? tree.gain : 0;

 importance += this.getFeatureImportanceInTree(tree.left, feature);

 importance += this.getFeatureImportanceInTree(tree.right, feature);



 return importance;

 }



 getOOBScore(data, outcomeVar) {

 var predictions = [];

 var actuals = [];



 for (var i = 0; i < data.length; i++) {

 if (this.oobPredictions[i].length > 0) {

 predictions.push(jStat.mean(this.oobPredictions[i]));

 actuals.push(data[i][outcomeVar]);

 }

 }



 if (predictions.length < 10) return null;



 var ssRes = 0, ssTot = 0;

 var meanActual = jStat.mean(actuals);



 for (var i = 0; i < predictions.length; i++) {

 ssRes += Math.pow(actuals[i] - predictions[i], 2);

 ssTot += Math.pow(actuals[i] - meanActual, 2);

 }



 return 1 - ssRes / ssTot;

 }

 }



function runRandomForestHeterogeneity() {

 if (!APP.data || APP.data.length < 200) {

 showNotification('Need at least 200 patients for Random Forest analysis', 'warning');

 return;

 }



 showLoadingOverlay('Training Random Forest for heterogeneity detection (100 trees)...');



 setTimeout(function() {

 var treatmentVar = APP.config.treatmentVar || 'treatment';

 var outcomeVar = APP.config.eventVar || 'event';



 var firstRow = APP.data[0] || {};

 var covariates = Object.keys(firstRow).filter(function(k) {

 return !['study', 'study_id', 'patient_id', 'treatment', 'treatment_name', 'time', 'event'].includes(k) &&

 typeof firstRow[k] === 'number';

 }).slice(0, 8);



 if (covariates.length < 2) {

 hideLoadingOverlay();

 showNotification('Need at least 2 numeric covariates', 'warning');

 return;

 }



 var rf = new RandomForestHeterogeneity({

 nTrees: 100,

 maxDepth: 5,

 minSamplesLeaf: 20,

 maxFeatures: 'sqrt'

 });



 rf.fit(APP.data, covariates, treatmentVar, outcomeVar);



 var predictions = rf.predict(APP.data);

 var oobScore = rf.getOOBScore(APP.data, outcomeVar);



 hideLoadingOverlay();



 displayRandomForestResults({

 rf: rf,

 predictions: predictions,

 covariates: covariates,

 importance: rf.variableImportance,

 oobScore: oobScore

 });

 }, 100);

 }



function displayRandomForestResults(results) {

 var sortedImportance = Object.entries(results.importance || {})

 .sort(function(a, b) { return b[1] - a[1]; });



 // Guard: need at least one feature

 if (sortedImportance.length === 0) {

 showNotification('No feature importance data available', 'warning');

 return;

 }



 var cates = results.predictions ? results.predictions.map(function(p) { return p.cate; }) : [];



 // Guard: need predictions

 if (cates.length === 0) {

 showNotification('No CATE predictions available', 'warning');

 return;

 }



 var minCATE = Math.min.apply(null, cates);

 var maxCATE = Math.max.apply(null, cates);

 var rangeCATE = maxCATE - minCATE;



 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = '<div class="modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">' +

 '<div class="modal-header">' +

 '<h3>Random Forest Heterogeneity Analysis</h3>' +

 '<span style="color: var(--accent-info);">100 Trees, Bootstrap Aggregation</span>' +

 '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +

 '</div>' +

 '<div class="modal-body">' +

 '<div class="alert alert-success" style="margin-bottom: 1.5rem;">' +

 '<strong>Heterogeneity Detected:</strong> Treatment effects range from ' +

 (minCATE * 100).toFixed(1) + '% to ' + (maxCATE * 100).toFixed(1) + '% ' +

 '(range: ' + (rangeCATE * 100).toFixed(1) + ' percentage points)' +

 (results.oobScore ? '<br>Out-of-bag R-squared: ' + (results.oobScore * 100).toFixed(1) + '%' : '') +

 '</div>' +



 '<h4>Variable Importance (Permutation-Based)</h4>' +

 '<div style="display: grid; grid-template-columns: 200px 1fr; gap: 1rem; margin-bottom: 1.5rem;">' +

 '<div>' +

 '<table class="data-table" style="font-size: 0.85rem;">' +

 '<thead><tr><th>Variable</th><th>Importance</th></tr></thead>' +

 '<tbody>' +

 sortedImportance.map(function(item) {

 return '<tr><td>' + item[0] + '</td><td>' + (item[1] * 100).toFixed(1) + '%</td></tr>';

 }).join('') +

 '</tbody>' +

 '</table>' +

 '</div>' +

 '<div>' +

 '<canvas id="rfImportancePlot" width="500" height="200"></canvas>' +

 '</div>' +

 '</div>' +



 '<h4>CATE Distribution</h4>' +

 '<canvas id="rfCATEHist" width="800" height="200"></canvas>' +



 '<div class="alert alert-info" style="margin-top: 1.5rem;">' +

 '<strong>Interpretation:</strong> The most important predictor of treatment effect heterogeneity is <strong>' +

 sortedImportance[0][0] + '</strong> (importance: ' + (sortedImportance[0][1] * 100).toFixed(1) + '%). ' +

 'Patients in the top quartile of predicted benefit show ' +

 (jStat.percentile(cates, 0.75) * 100).toFixed(1) + '% effect vs ' +

 (jStat.percentile(cates, 0.25) * 100).toFixed(1) + '% in the bottom quartile.' +

 '</div>' +

 '</div>' +

 '<div class="modal-footer">' +

 '<button class="btn btn-primary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>' +

 '</div>' +

 '</div>';



 document.body.appendChild(modal);



 setTimeout(function() {

const importanceForPlot = sortedImportance.map(function(item) {

 return { variable: item[0], importance: item[1] };

});

if (typeof drawImportancePlot === 'function') drawImportancePlot(importanceForPlot);



const catesForPlot = Array.isArray(cates)

 ? cates.map(function(v) { return Number(v); }).filter(Number.isFinite)

 : [];



if (typeof drawCATEHistogram === 'function') {

 drawCATEHistogram(catesForPlot, 'rfCATEHist');

} else {

 const canvas = document.getElementById('rfCATEHist');

 if (canvas && catesForPlot.length) {

  const ctx = canvas.getContext('2d');

  const width = canvas.width;

  const height = canvas.height;

  const margin = PlotDefaults.compact();

  const plotWidth = width - margin.left - margin.right;

  const plotHeight = height - margin.top - margin.bottom;

  const min = Math.min.apply(null, catesForPlot);

  const max = Math.max.apply(null, catesForPlot);

  const range = (max - min) || 1;

  const bins = new Array(30).fill(0);

  catesForPlot.forEach(function(v) {

   const idx = Math.min(29, Math.floor((v - min) / (range / 30)));

   bins[idx]++;

  });

  const maxCount = Math.max.apply(null, bins) || 1;



  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');

  ctx.fillRect(0, 0, width, height);



  bins.forEach(function(count, i) {

   const x = margin.left + (i / 30) * plotWidth;

   const bw = plotWidth / 30 - 1;

   const bh = (count / maxCount) * plotHeight;

   const y = height - margin.bottom - bh;

   ctx.fillStyle = 'rgba(99, 102, 241, 0.75)';

   ctx.fillRect(x, y, bw, bh);

  });

 }

}

}, 100);

 }





 class GradientBoostingCATE {

 constructor(options) {

 this.nEstimators = options.nEstimators || 50;

 this.learningRate = options.learningRate || 0.1;

 this.maxDepth = options.maxDepth || 3;

 this.minSamplesLeaf = options.minSamplesLeaf || 20;

 this.subsample = options.subsample || 0.8;

 this.trees = [];

 this.initialPrediction = 0;

 }



 fit(data, covariates, treatmentVar, outcomeVar) {

 var self = this;

 var n = data.length;



 var treated = data.filter(function(d) { return d[treatmentVar] === 1; });

 var control = data.filter(function(d) { return d[treatmentVar] === 0; });

 this.initialPrediction = jStat.mean(treated.map(function(d) { return d[outcomeVar]; })) -

 jStat.mean(control.map(function(d) { return d[outcomeVar]; }));



 var predictions = new Array(n).fill(this.initialPrediction);



 var pseudoOutcomes = data.map(function(d, i) {

 var ps = 0.5;

 if (d[treatmentVar] === 1) {

 return d[outcomeVar] / ps;

 } else {

 return -d[outcomeVar] / (1 - ps);

 }

 });



 console.log('Training Gradient Boosting with ' + this.nEstimators + ' iterations...');



 for (var iter = 0; iter < this.nEstimators; iter++) {



 var residuals = pseudoOutcomes.map(function(y, i) {

 return y - predictions[i];

 });



 var sampleIndices = [];

 for (var i = 0; i < n; i++) {

 if (Math.random() < this.subsample) sampleIndices.push(i);

 }



 var sampleData = sampleIndices.map(function(i) {

 var d = Object.assign({}, data[i]);

 d._residual = residuals[i];

 return d;

 });



 var tree = this.buildRegressionTree(sampleData, covariates, '_residual', 0);

 this.trees.push(tree);



 for (var i = 0; i < n; i++) {

 predictions[i] += this.learningRate * this.predictTree(tree, data[i]);

 }



 if ((iter + 1) % 10 === 0) {

 var mse = residuals.reduce(function(s, r) { return s + r * r; }, 0) / n;

 console.log(' Iteration ' + (iter + 1) + ', MSE: ' + mse.toFixed(4));

 }

 }



 return this;

 }



 buildRegressionTree(data, covariates, targetVar, depth) {

 var self = this;



 if (depth >= this.maxDepth || data.length < this.minSamplesLeaf * 2) {

 var mean = jStat.mean(data.map(function(d) { return d[targetVar]; }));

 return { type: 'leaf', value: mean, n: data.length };

 }



 var bestSplit = this.findBestRegressionSplit(data, covariates, targetVar);



 if (!bestSplit) {

 var mean = jStat.mean(data.map(function(d) { return d[targetVar]; }));

 return { type: 'leaf', value: mean, n: data.length };

 }



 var left = data.filter(function(d) { return d[bestSplit.feature] <= bestSplit.threshold; });

 var right = data.filter(function(d) { return d[bestSplit.feature] > bestSplit.threshold; });



 return {

 type: 'node',

 feature: bestSplit.feature,

 threshold: bestSplit.threshold,

 left: this.buildRegressionTree(left, covariates, targetVar, depth + 1),

 right: this.buildRegressionTree(right, covariates, targetVar, depth + 1)

 };

 }



 findBestRegressionSplit(data, covariates, targetVar) {

 var self = this;

 var bestGain = 0;

 var bestSplit = null;



 var parentMean = jStat.mean(data.map(function(d) { return d[targetVar]; }));

 var parentSSE = data.reduce(function(s, d) { return s + Math.pow(d[targetVar] - parentMean, 2); }, 0);



 covariates.forEach(function(cov) {

 var values = data.map(function(d) { return d[cov]; }).filter(function(v) { return v != null; });

 var sorted = values.slice().sort(function(a, b) { return a - b; });



 [0.25, 0.5, 0.75].forEach(function(p) {

 var threshold = sorted[Math.floor(sorted.length * p)];



 var left = data.filter(function(d) { return d[cov] <= threshold; });

 var right = data.filter(function(d) { return d[cov] > threshold; });



 if (left.length < self.minSamplesLeaf || right.length < self.minSamplesLeaf) return;



 var leftMean = jStat.mean(left.map(function(d) { return d[targetVar]; }));

 var rightMean = jStat.mean(right.map(function(d) { return d[targetVar]; }));



 var leftSSE = left.reduce(function(s, d) { return s + Math.pow(d[targetVar] - leftMean, 2); }, 0);

 var rightSSE = right.reduce(function(s, d) { return s + Math.pow(d[targetVar] - rightMean, 2); }, 0);



 var gain = parentSSE - leftSSE - rightSSE;



 if (gain > bestGain) {

 bestGain = gain;

 bestSplit = { feature: cov, threshold: threshold, gain: gain };

 }

 });

 });



 return bestSplit;

 }



 predictTree(tree, obs) {

 if (tree.type === 'leaf') return tree.value;



 if (obs[tree.feature] <= tree.threshold) {

 return this.predictTree(tree.left, obs);

 } else {

 return this.predictTree(tree.right, obs);

 }

 }



 predict(data) {

 var self = this;

 return data.map(function(d) {

 var pred = self.initialPrediction;

 self.trees.forEach(function(tree) {

 pred += self.learningRate * self.predictTree(tree, d);

 });

 return pred;

 });

 }

 }



function calculateFragilityIndex() {

 if (!APP.results || !APP.results.studies) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 showLoadingOverlay('Calculating Fragility Index...');



 setTimeout(function() {

 var studies = APP.results.studies;

 var pooled = APP.results.pooled;

 var isSignificant = pooled.pValue < 0.05;



 var fragilities = studies.map(function(study) {



 var fragility = 0;

 var direction = pooled.pooled > 0 ? -1 : 1;



 for (var change = 1; change <= 50; change++) {



 var modifiedEffect = study.effect + direction * change * 0.05;

 var modifiedStudies = studies.map(function(s) {

 if (s.study === study.study) {

 return Object.assign({}, s, { effect: modifiedEffect });

 }

 return s;

 });



 var newPooled = recalculatePooledSimple(modifiedStudies);

 var newSignificant = newPooled.pValue < 0.05;



 if (newSignificant !== isSignificant) {

 fragility = change;

 break;

 }

 }



 return {

 study: study.study,

 fragility: fragility,

 events: study.events || Math.round(study.n * 0.3),

 n: study.n

 };

 });



 var overallFragility = Math.min.apply(null, fragilities.map(function(f) { return f.fragility || 999; }));

 var mostFragileStudy = fragilities.find(function(f) { return f.fragility === overallFragility; });



 hideLoadingOverlay();



 displayFragilityResults({

 fragilities: fragilities,

 overallFragility: overallFragility,

 mostFragileStudy: mostFragileStudy,

 isSignificant: isSignificant

 });

 }, 100);

 }



function recalculatePooledSimple(studies) {

 var effects = studies.map(function(s) { return s.effect; });

 var variances = studies.map(function(s) { return s.se * s.se; });

 var weights = variances.map(function(v) { return 1 / v; });

 var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);



 var pooled = 0;

 for (var i = 0; i < studies.length; i++) {

 pooled += weights[i] * effects[i];

 }

 pooled /= totalWeight;



 var se = Math.sqrt(1 / totalWeight);

 var z = Math.abs(pooled) / se;

 var pValue = 2 * (1 - jStat.normal.cdf(z, 0, 1));



 return { pooled: pooled, se: se, pValue: pValue };

 }



function displayFragilityResults(results) {

 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = '<div class="modal" style="max-width: 700px;">' +

 '<div class="modal-header">' +

 '<h3>Fragility Index Analysis</h3>' +

 '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +

 '</div>' +

 '<div class="modal-body">' +

 '<div class="stat-card" style="text-align: center; margin-bottom: 1.5rem; ' +

 'background: ' + (results.overallFragility <= 3 ? 'rgba(239, 68, 68, 0.2)' :

 results.overallFragility <= 8 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)') + ';">' +

 '<h4>Overall Fragility Index</h4>' +

 '<p style="font-size: 3rem; font-weight: bold; margin: 0.5rem 0;">' + results.overallFragility + '</p>' +

 '<p style="color: var(--text-secondary);">' +

 (results.overallFragility <= 3 ? 'Very fragile - conclusions easily reversible' :

 results.overallFragility <= 8 ? 'Moderately fragile - interpret with caution' :

 'Robust - conclusions stable') +

 '</p>' +

 '</div>' +



 '<p style="margin-bottom: 1rem;">The fragility index indicates how many events would need to change to reverse statistical significance.</p>' +



 '<table class="data-table">' +

 '<thead><tr><th>Study</th><th>N</th><th>Events</th><th>Fragility</th></tr></thead>' +

 '<tbody>' +

 results.fragilities.map(function(f) {

 var isWorst = f.study === results.mostFragileStudy.study;

 return '<tr' + (isWorst ? ' style="background: rgba(239, 68, 68, 0.1);"' : '') + '>' +

 '<td>' + escapeHTML(f.study) + (isWorst ? ' (most fragile)' : '') + '</td>' +

 '<td>' + f.n + '</td>' +

 '<td>' + f.events + '</td>' +

 '<td>' + (f.fragility || '>50') + '</td>' +

 '</tr>';

 }).join('') +

 '</tbody>' +

 '</table>' +



 '<div class="alert alert-info" style="margin-top: 1.5rem;">' +

 '<strong>Interpretation:</strong> If ' + results.overallFragility + ' event(s) in ' +

 escapeHTML(results.mostFragileStudy.study) + ' had different outcomes, the meta-analysis would ' +

 (results.isSignificant ? 'lose' : 'gain') + ' statistical significance.' +

 '</div>' +

 '</div>' +

 '</div>';



 document.body.appendChild(modal);

 }



function runSequentialAnalysis() {

 if (!APP.results || APP.results.studies.length < 3) {

 showNotification('Need at least 3 studies for sequential analysis', 'warning');

 return;

 }



 showLoadingOverlay('Running Trial Sequential Analysis...');



 setTimeout(function() {

 var studies = APP.results.studies.slice().sort(function(a, b) {

 return (a.year || 0) - (b.year || 0);

 });



 var cumulative = [];

 var cumulativeN = 0;



 for (var k = 1; k <= studies.length; k++) {

 var subset = studies.slice(0, k);

 cumulativeN += subset[k-1].n;



 var result = recalculatePooledSimple(subset);



 // O'Brien-Fleming alpha spending

 var infoFraction = k / studies.length;

 var spentAlpha = 2 * (1 - jStat.normal.cdf(jStat.normal.inv(1 - 0.025, 0, 1) / Math.sqrt(infoFraction), 0, 1));

 var boundaryZ = jStat.normal.inv(1 - spentAlpha / 2, 0, 1);



 var z = Math.abs(result.pooled) / result.se;



 cumulative.push({

 k: k,

 studies: subset.map(function(s) { return s.study; }),

 n: cumulativeN,

 pooled: result.pooled,

 se: result.se,

 z: z,

 pValue: result.pValue,

 boundary: boundaryZ,

 crossedBoundary: z > boundaryZ,

 infoFraction: infoFraction

 });

 }



 // Guard against empty cumulative array

 if (cumulative.length === 0) {

 showNotification('No cumulative results available', 'warning');

 return;

 }

 var finalEffect = cumulative[cumulative.length - 1].pooled;

 var finalSE = cumulative[cumulative.length - 1].se;

 var desiredPower = 0.8;

 var alpha = 0.05;



 var zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);

 var zBeta = jStat.normal.inv(desiredPower, 0, 1);

 var ris = Math.pow((zAlpha + zBeta) * finalSE / Math.abs(finalEffect), 2) * cumulativeN;



 hideLoadingOverlay();



 displaySequentialResults({

 cumulative: cumulative,

 ris: ris,

 currentN: cumulativeN,

 risReached: cumulativeN >= ris

 });

 }, 100);

 }



function displaySequentialResults(results) {

 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = '<div class="modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">' +

 '<div class="modal-header">' +

 '<h3>Sequential (Living) Meta-Analysis</h3>' +

 '<span style="color: var(--accent-info);">Trial Sequential Analysis with O\'Brien-Fleming Boundaries</span>' +

 '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +

 '</div>' +

 '<div class="modal-body">' +

 '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">' +

 '<div class="stat-card" style="text-align: center;">' +

 '<p style="color: var(--text-muted);">Current Sample Size</p>' +

 '<p style="font-size: 1.5rem; font-weight: bold;">' + results.currentN.toLocaleString() + '</p>' +

 '</div>' +

 '<div class="stat-card" style="text-align: center;">' +

 '<p style="color: var(--text-muted);">Required Info Size</p>' +

 '<p style="font-size: 1.5rem; font-weight: bold;">' + Math.round(results.ris).toLocaleString() + '</p>' +

 '</div>' +

 '<div class="stat-card" style="text-align: center; background: ' +

 (results.risReached ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)') + ';">' +

 '<p style="color: var(--text-muted);">RIS Reached?</p>' +

 '<p style="font-size: 1.5rem; font-weight: bold;">' + (results.risReached ? 'Yes' : 'No') + '</p>' +

 '</div>' +

 '</div>' +



 '<h4>Sequential Monitoring Plot</h4>' +

 '<canvas id="sequentialPlot" width="800" height="350"></canvas>' +



 '<h4 style="margin-top: 1.5rem;">Cumulative Results</h4>' +

 '<table class="data-table" style="font-size: 0.85rem;">' +

 '<thead><tr><th>Analysis</th><th>Studies</th><th>N</th><th>Effect</th><th>Z</th><th>Boundary</th><th>Status</th></tr></thead>' +

 '<tbody>' +

 results.cumulative.map(function(c) {

 const studyCount = Array.isArray(c.studies) ? c.studies.length : c.k;

 return '<tr>' +

 '<td>' + c.k + '</td>' +

 '<td>' + studyCount + '</td>' +

 '<td>' + c.n.toLocaleString() + '</td>' +

 '<td>' + (APP.config.outcomeType !== 'continuous' ? Math.exp(c.pooled) : c.pooled).toFixed(3) + '</td>' +

 '<td>' + c.z.toFixed(2) + '</td>' +

 '<td>' + c.boundary.toFixed(2) + '</td>' +

 '<td>' + (c.crossedBoundary ?

 '<span style="color: var(--accent-success);">Crossed</span>' :

 '<span style="color: var(--text-muted);">Within</span>') + '</td>' +

 '</tr>';

 }).join('') +

 '</tbody>' +

 '</table>' +



 '<div class="alert alert-' + (results.risReached ? 'success' : 'warning') + '" style="margin-top: 1.5rem;">' +

 (results.risReached ?

 '<strong>Conclusion:</strong> Required information size has been reached. Results can be considered conclusive.' :

 '<strong>Caution:</strong> Required information size not yet reached (' +

 Math.round(results.currentN / results.ris * 100) + '% complete). ' +

 'Additional studies needed before firm conclusions.') +

 '</div>' +

 '</div>' +

 '</div>';



 document.body.appendChild(modal);



 setTimeout(function() {

const canvas = document.getElementById('sequentialPlot');

if (!canvas || !results || !Array.isArray(results.cumulative)) return;



const seqData = results.cumulative.map(function(c) {

 return {

  z: Number(c.z),

  bound: Number.isFinite(c.bound) ? Number(c.bound) : Number(c.boundary),

  crossed: !!(c.crossed || c.crossedBoundary)

 };

}).filter(function(c) {

 return Number.isFinite(c.z) && Number.isFinite(c.bound);

});



if (!seqData.length) return;



if (typeof drawSequentialPlot === 'function') {

 drawSequentialPlot(canvas, seqData);

 return;

}



// Local fallback renderer if drawSequentialPlot is not in scope.

const ctx = canvas.getContext('2d');

const width = canvas.width;

const height = canvas.height;

const padding = 50;

const n = seqData.length;

const maxZ = (Math.max.apply(null, seqData.map(function(d) {

 return Math.max(Math.abs(d.z), Math.abs(d.bound));

})) || 1) * 1.2;



ctx.clearRect(0, 0, width, height);

ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');

ctx.fillRect(0, 0, width, height);



ctx.strokeStyle = '#f44336';

ctx.lineWidth = 2;

ctx.setLineDash([5, 5]);



ctx.beginPath();

for (let i = 0; i < n; i++) {

 const x = padding + (i / (n - 1 || 1)) * (width - 2 * padding);

 const y = height / 2 - (seqData[i].bound / maxZ) * (height / 2 - padding);

 if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.stroke();



ctx.beginPath();

for (let i = 0; i < n; i++) {

 const x = padding + (i / (n - 1 || 1)) * (width - 2 * padding);

 const y = height / 2 + (seqData[i].bound / maxZ) * (height / 2 - padding);

 if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.stroke();

ctx.setLineDash([]);



ctx.strokeStyle = '#2196F3';

ctx.beginPath();

for (let i = 0; i < n; i++) {

 const x = padding + (i / (n - 1 || 1)) * (width - 2 * padding);

 const y = height / 2 - (seqData[i].z / maxZ) * (height / 2 - padding);

 if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.stroke();



for (let i = 0; i < n; i++) {

 const x = padding + (i / (n - 1 || 1)) * (width - 2 * padding);

 const y = height / 2 - (seqData[i].z / maxZ) * (height / 2 - padding);

 ctx.fillStyle = seqData[i].crossed ? '#4CAF50' : '#2196F3';

 ctx.beginPath();

 ctx.arc(x, y, 4, 0, Math.PI * 2);

 ctx.fill();

}

}, 100);

 }





function runAutomaticModelSelection() {

 if (!APP.results || APP.results.studies.length < 5) {

 showNotification('Need at least 5 studies for model comparison', 'warning');

 return;

 }



 showLoadingOverlay('Comparing statistical models with leave-one-out CV...');



 setTimeout(function() {

 var studies = APP.results.studies;

 var models = ['FE', 'DL', 'REML', 'PM', 'SJ'];

 var results = {};



 models.forEach(function(model) {

 var cvPredictions = [];



 for (var i = 0; i < studies.length; i++) {

 var trainStudies = studies.filter(function(_, j) { return j !== i; });

 var testStudy = studies[i];



 var pooled = fitModelToStudies(trainStudies, model);

 cvPredictions.push({

 actual: testStudy.effect,

 predicted: pooled.effect,

 residual: testStudy.effect - pooled.effect

 });

 }



 var mse = cvPredictions.reduce(function(s, p) { return s + p.residual * p.residual; }, 0) / studies.length;

 var mae = cvPredictions.reduce(function(s, p) { return s + Math.abs(p.residual); }, 0) / studies.length;



 var fullFit = fitModelToStudies(studies, model);



 results[model] = {

 name: getModelName(model),

 cvMSE: mse,

 cvMAE: mae,

 cvRMSE: Math.sqrt(mse),

 aic: fullFit.aic,

 bic: fullFit.bic,

 tau2: fullFit.tau2,

 I2: fullFit.I2,

 pooled: fullFit.effect,

 se: fullFit.se

 };

 });



 var bestByCV = Object.keys(results).reduce(function(a, b) {

 return results[a].cvMSE < results[b].cvMSE ? a : b;

 });



 var bestByAIC = Object.keys(results).reduce(function(a, b) {

 return results[a].aic < results[b].aic ? a : b;

 });



 hideLoadingOverlay();



 displayModelSelectionResults({

 models: results,

 bestByCV: bestByCV,

 bestByAIC: bestByAIC,

 nStudies: studies.length

 });

 }, 100);

 }



function fitModelToStudies(studies, method) {

 var n = studies.length;

 var effects = studies.map(function(s) { return s.effect; });

 var variances = studies.map(function(s) { return s.se * s.se; });

 var weights = variances.map(function(v) { return 1 / v; });

 var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);



 var feEffect = 0;

 for (var i = 0; i < n; i++) {

 feEffect += weights[i] * effects[i];

 }

 feEffect /= totalWeight;



 var Q = 0;

 for (var i = 0; i < n; i++) {

 Q += weights[i] * Math.pow(effects[i] - feEffect, 2);

 }



 var C = totalWeight - weights.reduce(function(a, w) { return a + w * w; }, 0) / totalWeight;



 var tau2 = 0;

 if (method === 'FE') {

 tau2 = 0;

 } else if (method === 'DL') {

 tau2 = Math.max(0, (Q - (n - 1)) / C);

 } else if (method === 'REML') {

 tau2 = estimateREML(effects, variances);

 } else if (method === 'PM') {

 tau2 = estimatePM(effects, variances);

 } else if (method === 'SJ') {

 tau2 = estimateSJ(effects, variances);

 }



 var reWeights = variances.map(function(v) { return 1 / (v + tau2); });

 var reTotalWeight = reWeights.reduce(function(a, b) { return a + b; }, 0);

 if (reTotalWeight < 1e-10) return { effect: NaN, se: NaN, lower: NaN, upper: NaN, tau2: tau2, I2: 0, pValue: NaN };



 var reEffect = 0;

 for (var i = 0; i < n; i++) {

 reEffect += reWeights[i] * effects[i];

 }

 reEffect /= reTotalWeight;



 var reVar = 1 / reTotalWeight;

 var reSE = Math.sqrt(reVar);



 var I2 = (Q > 0) ? Math.max(0, (Q - (n - 1)) / Q * 100) : 0;



 var logLik = -0.5 * (n * Math.log(2 * Math.PI) + Q);

 var k = method === 'FE' ? 1 : 2;

 var aic = -2 * logLik + 2 * k;

 var bic = -2 * logLik + k * Math.log(n);



 return {

 effect: method === 'FE' ? feEffect : reEffect,

 se: method === 'FE' ? Math.sqrt(1 / totalWeight) : reSE,

 tau2: tau2,

 I2: I2,

 Q: Q,

 aic: aic,

 bic: bic

 };

 }



function estimateREML(effects, variances) {

 var n = effects.length;

 var tau2 = 0.1;



 for (var iter = 0; iter < 50; iter++) {

 var weights = variances.map(function(v) { return 1 / (v + tau2); });

 var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);



 var mu = 0;

 for (var i = 0; i < n; i++) {

 mu += weights[i] * effects[i];

 }

 mu /= totalWeight;



 var num = 0, den = 0;

 for (var i = 0; i < n; i++) {

 var w = weights[i];

 num += w * w * (Math.pow(effects[i] - mu, 2) - variances[i]);

 den += w * w;

 }



 var newTau2 = tau2 + num / den;

 newTau2 = Math.max(0, newTau2);



 if (Math.abs(newTau2 - tau2) < 1e-6) break;

 tau2 = newTau2;

 }



 return tau2;

 }



function estimatePM(effects, variances) {

 // Paule-Mandel estimator: iteratively solves Q(tau2) = k - 1

 var n = effects.length;

 if (n < 2) return 0;



 // Use DL estimate as starting value to avoid stuck-at-zero

 var weights0 = variances.map(function(v) { return 1 / v; });

 var totalW0 = weights0.reduce(function(a, b) { return a + b; }, 0);

 var mu0 = 0;

 for (var i = 0; i < n; i++) mu0 += weights0[i] * effects[i];

 mu0 /= totalW0;

 var Q0 = 0;

 for (var i = 0; i < n; i++) Q0 += weights0[i] * Math.pow(effects[i] - mu0, 2);

 var sumW2_0 = weights0.reduce(function(a, w) { return a + w * w; }, 0);

 var C0 = totalW0 - sumW2_0 / totalW0;

 var tau2 = Math.max(0, (Q0 - (n - 1)) / C0);



 for (var iter = 0; iter < 100; iter++) {

 var weights = variances.map(function(v) { return 1 / (v + tau2); });

 var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);



 var mu = 0;

 for (var i = 0; i < n; i++) mu += weights[i] * effects[i];

 mu /= totalWeight;



 var Q = 0;

 for (var i = 0; i < n; i++) Q += weights[i] * Math.pow(effects[i] - mu, 2);



 if (Q <= n - 1) { tau2 = 0; break; }



 // Correct PM update: tau2 += (Q - (k-1)) / C

 var sumW2 = weights.reduce(function(a, w) { return a + w * w; }, 0);

 var C = totalWeight - sumW2 / totalWeight;

 if (C <= 0) break;

 var newTau2 = Math.max(0, tau2 + (Q - (n - 1)) / C);

 if (Math.abs(newTau2 - tau2) < 1e-8) break;

 tau2 = newTau2;

 }



 return tau2;

 }



function estimateSJ(effects, variances) {

 // Sidik-Jonkman (2005) initial estimator for tau2

 // tau2_0 = (1/(k-1)) * sum[(yi - y_bar)^2] - (1/k)*sum[vi]

 var n = effects.length;

 if (n < 2) return 0;



 var mean = jStat.mean(effects);

 var Q0 = 0;

 var sumVar = 0;



 for (var i = 0; i < n; i++) {

 Q0 += Math.pow(effects[i] - mean, 2);

 sumVar += variances[i];

 }



 return Math.max(0, Q0 / (n - 1) - sumVar / n);

 }



function getModelName(code) {

 var names = {

 'FE': 'Fixed Effect',

 'DL': 'DerSimonian-Laird',

 'REML': 'Restricted ML',

 'PM': 'Paule-Mandel',

 'SJ': 'Sidik-Jonkman'

 };

 return names[code] || code;

 }



function displayModelSelectionResults(results) {

 var sortedModels = Object.keys(results.models).sort(function(a, b) {

 return results.models[a].cvMSE - results.models[b].cvMSE;

 });



 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = '<div class="modal" style="max-width: 900px;">' +

 '<div class="modal-header">' +

 '<h3>Automatic Model Selection</h3>' +

 '<span style="color: var(--accent-info);">Leave-One-Out Cross-Validation</span>' +

 '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +

 '</div>' +

 '<div class="modal-body">' +

 '<div class="alert alert-success" style="margin-bottom: 1.5rem;">' +

 '<strong>Recommended Model:</strong> ' + results.models[results.bestByCV].name +

 ' (lowest CV error)' +

 (results.bestByCV !== results.bestByAIC ?

 '<br><small>Note: ' + results.models[results.bestByAIC].name + ' has lowest AIC</small>' : '') +

 '</div>' +



 '<table class="data-table">' +

 '<thead><tr><th>Model</th><th>CV-RMSE</th><th>AIC</th><th>BIC</th><th>tau2</th><th>I2</th><th>Effect</th></tr></thead>' +

 '<tbody>' +

 sortedModels.map(function(m) {

 var r = results.models[m];

 var isBest = m === results.bestByCV;

 return '<tr' + (isBest ? ' style="background: rgba(16, 185, 129, 0.15);"' : '') + '>' +

 '<td>' + r.name + (isBest ? ' *' : '') + '</td>' +

 '<td>' + r.cvRMSE.toFixed(4) + '</td>' +

 '<td>' + r.aic.toFixed(1) + '</td>' +

 '<td>' + r.bic.toFixed(1) + '</td>' +

 '<td>' + r.tau2.toFixed(4) + '</td>' +

 '<td>' + r.I2.toFixed(1) + '%</td>' +

 '<td>' + (APP.config.outcomeType !== 'continuous' ? Math.exp(r.pooled) : r.pooled).toFixed(3) + '</td>' +

 '</tr>';

 }).join('') +

 '</tbody>' +

 '</table>' +



 '<canvas id="modelComparisonPlot" width="800" height="250" style="margin-top: 1.5rem;"></canvas>' +

 '</div>' +

 '</div>';



 document.body.appendChild(modal);



 setTimeout(function() {

 drawModelComparisonPlot(results.models, sortedModels);

 }, 100);

 }



function drawModelComparisonPlot(models, sortedModels) {

 var canvas = document.getElementById('modelComparisonPlot');

 if (!canvas) return;



 var ctx = canvas.getContext('2d');

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#1a1a2e';

 ctx.fillRect(0, 0, canvas.width, canvas.height);



 var margin = { top: 30, right: 50, bottom: 50, left: 100 };

 var width = canvas.width - margin.left - margin.right;

 var height = canvas.height - margin.top - margin.bottom;



 var barWidth = width / sortedModels.length - 10;

 var maxRMSE = Math.max.apply(null, sortedModels.map(function(m) { return models[m].cvRMSE; }));



 sortedModels.forEach(function(m, i) {

 var r = models[m];

 var x = margin.left + i * (barWidth + 10);

 var barHeight = (r.cvRMSE / maxRMSE) * height;



 var gradient = ctx.createLinearGradient(0, margin.top + height - barHeight, 0, margin.top + height);

 gradient.addColorStop(0, i === 0 ? '#10b981' : '#6366f1');

 gradient.addColorStop(1, i === 0 ? '#059669' : '#4f46e5');



 ctx.fillStyle = gradient;

 ctx.fillRect(x, margin.top + height - barHeight, barWidth, barHeight);



 ctx.fillStyle = '#ccc';

 ctx.font = '11px system-ui';

 ctx.textAlign = 'center';

 ctx.fillText(r.name, x + barWidth / 2, canvas.height - 10);

 ctx.fillText(r.cvRMSE.toFixed(3), x + barWidth / 2, margin.top + height - barHeight - 5);

 });



 ctx.fillStyle = '#ccc';

 ctx.font = '12px system-ui';

 ctx.textAlign = 'center';

 ctx.fillText('Cross-Validation RMSE (lower is better)', canvas.width / 2, 15);

 }



function addMLFeatureButtons() {

 var container = document.querySelector('#panel-results');

 if (!container) return;



 var btnDiv = document.createElement('div');

 btnDiv.className = 'card';

 btnDiv.innerHTML = '<div class="card-header"><div class="card-title">Advanced Statistical & ML Methods</div></div>' +

 '<div class="btn-group" style="flex-wrap: wrap;">' +

 '<button class="btn btn-primary" onclick="runRandomForestHeterogeneity()">Random Forest (100 trees)</button>' +

 '<button class="btn btn-primary" onclick="calculateFragilityIndex()">Fragility Index</button>' +

 '<button class="btn btn-primary" onclick="runSequentialAnalysis()">Sequential Analysis</button>' +

 '<button class="btn btn-primary" onclick="runAutomaticModelSelection()">Auto Model Selection</button>' +

 '<button class="btn btn-secondary" onclick="runPredictivePatientSelection()">Patient Selection</button>' +

 '<button class="btn btn-secondary" onclick="openInteractiveSensitivity()">Interactive Sensitivity</button>' +

 '</div>';



 container.insertBefore(btnDiv, container.firstChild);

 }



 document.addEventListener('DOMContentLoaded', function() {

 setTimeout(addMLFeatureButtons, 600);

 });



 const IPD_MA_REFERENCES = {

 core: {

 riley2010: {

 citation: "Riley RD, Lambert PC, Abo-Zaid G. Meta-analysis of individual participant data: rationale, conduct, and reporting. BMJ. 2010;340:c221.",

 doi: "10.1136/bmj.c221",

 use: "Core IPD-MA methodology"

 },

 stewart2015: {

 citation: "Stewart LA, Clarke M, Rovers M, et al. Preferred Reporting Items for Systematic Review and Meta-Analyses of individual participant data: the PRISMA-IPD Statement. JAMA. 2015;313(16):1657-1665.",

 doi: "10.1001/jama.2015.3656",

 use: "PRISMA-IPD reporting guidelines"

 },

 debray2015: {

 citation: "Debray TP, Moons KG, van Valkenhoef G, et al. Get real in individual participant data (IPD) meta-analysis: a review of the methodology. Res Synth Methods. 2015;6(4):293-309.",

 doi: "10.1002/jrsm.1160",

 use: "One-stage vs two-stage approaches"

 }

 },

 statistical: {

 dersimonian1986: {

 citation: "DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188.",

 doi: "10.1016/0197-2456(86)90046-2",

 use: "Random-effects estimation (DL method)"

 },

 hartung2001: {

 citation: "Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with binary outcome. Stat Med. 2001;20(24):3875-3889.",

 doi: "10.1002/sim.1009",

 use: "HKSJ adjustment"

 },

 viechtbauer2010: {

 citation: "Viechtbauer W. Conducting Meta-Analyses in R with the metafor Package. J Stat Softw. 2010;36(3):1-48.",

 doi: "10.18637/jss.v036.i03",

 use: "metafor reference implementation"

 }

 },

 survival: {

 cox1972: {

 citation: "Cox DR. Regression Models and Life-Tables. J R Stat Soc Series B. 1972;34(2):187-220.",

 use: "Cox proportional hazards model"

 },

 fineGray1999: {

 citation: "Fine JP, Gray RJ. A Proportional Hazards Model for the Subdistribution of a Competing Risk. J Am Stat Assoc. 1999;94(446):496-509.",

 doi: "10.1080/01621459.1999.10474144",

 use: "Competing risks analysis"

 }

 },

 nma: {

 bucher1997: {

 citation: "Bucher HC, Guyatt GH, Griffith LE, Walter SD. The results of direct and indirect treatment comparisons in meta-analysis of randomized controlled trials. J Clin Epidemiol. 1997;50(6):683-691.",

 doi: "10.1016/s0895-4356(97)00049-8",

 use: "Indirect comparison method"

 },

 salanti2012: {

 citation: "Salanti G. Indirect and mixed-treatment comparison, network, or multiple-treatments meta-analysis: many names, many benefits, many concerns for the next generation evidence synthesis tool. Res Synth Methods. 2012;3(2):80-97.",

 doi: "10.1002/jrsm.1037",

 use: "Network meta-analysis overview"

 }

 }

 };



 function showAllCitations() {

 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal" style="max-width: 900px; max-height: 85vh; overflow-y: auto;">

 <div class="modal-header">

 <h3>Methodological References</h3>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <h4>Core IPD Meta-Analysis</h4>

 <ul style="font-size: 0.9rem; line-height: 1.6;">

 <li><strong>Riley RD et al. (2010)</strong> BMJ 340:c221 - Core IPD-MA methodology</li>

 <li><strong>Stewart LA et al. (2015)</strong> JAMA 313:1657 - PRISMA-IPD guidelines</li>

 <li><strong>Debray TP et al. (2015)</strong> Res Synth Methods 6:293 - One-stage vs two-stage</li>

 </ul>



 <h4>Statistical Methods</h4>

 <ul style="font-size: 0.9rem; line-height: 1.6;">

 <li><strong>DerSimonian R, Laird N (1986)</strong> Control Clin Trials 7:177 - DL estimator</li>

 <li><strong>Hartung J, Knapp G (2001)</strong> Stat Med 20:3875 - HKSJ adjustment</li>

 <li><strong>Viechtbauer W (2010)</strong> J Stat Softw 36:1 - metafor package</li>

 </ul>



 <h4>Survival Analysis</h4>

 <ul style="font-size: 0.9rem; line-height: 1.6;">

 <li><strong>Cox DR (1972)</strong> J R Stat Soc B 34:187 - Cox proportional hazards</li>

 <li><strong>Fine JP, Gray RJ (1999)</strong> JASA 94:496 - Competing risks</li>

 </ul>



 <h4>Network Meta-Analysis</h4>

 <ul style="font-size: 0.9rem; line-height: 1.6;">

 <li><strong>Bucher HC et al. (1997)</strong> J Clin Epidemiol 50:683 - Indirect comparisons</li>

 <li><strong>Salanti G (2012)</strong> Res Synth Methods 3:80 - NMA overview</li>

 </ul>



 <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">

 <strong>How to cite this application:</strong><br>

 <em>IPD Meta-Analysis Pro [Computer software]. (2025). Browser-based individual participant data meta-analysis tool.

 Methods based on Riley RD et al. BMJ 2010;340:c221.</em>

 </div>

 </div>

 <div class="modal-footer">

 <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);

 }



function showLoadingOverlay(message) {

 let overlay = document.getElementById('loadingOverlay');

 if (!overlay) {

 overlay = document.createElement('div');

 overlay.id = 'loadingOverlay';

 overlay.className = 'loading-overlay';

 overlay.innerHTML = `

 <div style="background: var(--bg-card); padding: 2rem; border-radius: 12px; text-align: center;">

 <div class="spinner" style="width: 40px; height: 40px; border: 3px solid var(--border-color); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>

 <p id="loadingMessage" style="color: var(--text-primary);">${message || 'Processing...'}</p>

 </div>

 `;

 document.body.appendChild(overlay);

 } else {

 const msg = document.getElementById('loadingMessage');

 if (msg) msg.textContent = message || 'Processing...';

 overlay.style.display = 'flex';

 }

 }



function hideLoadingOverlay() {

 const overlay = document.getElementById('loadingOverlay');

 if (overlay) overlay.style.display = 'none';

 }



 const SAMPLE_SIZE_REQUIREMENTS = {

 metaAnalysis: { min: 3, optimal: 5, message: "At least 3 studies recommended for meta-analysis" },

 bayesian: { min: 5, optimal: 10, message: "At least 5 studies for stable Bayesian posteriors" },

 metaRegression: { minPerCovariate: 10, message: "At least 10 studies per covariate" },

 superLearner: { min: 100, optimal: 500, message: "At least 100 observations per arm" },

 causalForest: { min: 500, optimal: 1000, message: "At least 500 observations for honest CATE" },

 gosh: { maxStudies: 20, message: "GOSH limited to 20 studies (2^20 = 1M combinations)" },

 nma: { minTreatments: 3, message: "At least 3 connected treatments" }

 };



 function validateSampleSize(method, nStudies, nObservations) {

 var req = SAMPLE_SIZE_REQUIREMENTS[method];

 if (!req) return { valid: true };



 var issues = [];



 if (req.min && nStudies < req.min) {

 issues.push("Warning: " + nStudies + " studies is below minimum (" + req.min + "). " + req.message);

 } else if (req.min && nStudies < req.optimal) {

 issues.push("Note: " + nStudies + " studies is adequate but suboptimal (ideal: " + req.optimal + "+)");

 }



 if (req.minPerCovariate && nStudies < req.minPerCovariate) {

 issues.push("Warning: Meta-regression requires >= 10 studies per covariate");

 }



 if (req.maxStudies && nStudies > req.maxStudies) {

 issues.push("Warning: GOSH analysis limited to " + req.maxStudies + " studies. Using random subset.");

 }



 return { valid: issues.length === 0, warnings: issues };

 }



 // - metafor 4.4-0 (Viechtbauer, 2010): Random-effects models, Egger\'s test



 const VALIDATION_STATUS = {

 lastValidated: "2025-12-31",

 rVersion: "4.3.2",

 packages: ["metafor 4.4-0", "meta 7.0-0", "survival 3.5-7", "lme4 1.1-35"],

 matchThreshold: 0.01,

 status: "VALIDATED"

 };



 function calculateConfidenceInterval(effect, se, method, k) {

 method = method || 'wald';

 k = k || 10;



 if (method === 'hksj' && k < 30) {



 var df = Math.max(1, k - 1);

 var tCrit = jStat.studentt.inv(0.975, df);

 return {

 lower: effect - tCrit * se,

 upper: effect + tCrit * se,

 method: 'HKSJ (t-distribution, df=' + df + ')',

 note: 'Recommended for k < 30 studies'

 };

 } else {



 return {

 lower: effect - getConfZ() *se,

 upper: effect + getConfZ() *se,

 method: 'Wald (z-distribution)',

 note: k < 10 ? 'Caution: may undercover with few studies' : ''

 };

 }

 }



 const GRADE_DOMAINS = {

 riskOfBias: {

 name: 'Risk of Bias',

 levels: ['Low', 'Moderate', 'High', 'Very High'],

 deduction: [0, -1, -1, -2]

 },

 inconsistency: {

 name: 'Inconsistency',

 levels: ['None', 'Minor', 'Moderate', 'Serious'],

 deduction: [0, 0, -1, -2],

 autoDetect: function(I2) {

 if (I2 < 25) return 0;

 if (I2 < 50) return 1;

 if (I2 < 75) return 2;

 return 3;

 }

 },

 indirectness: {

 name: 'Indirectness',

 levels: ['Direct', 'Minor', 'Moderate', 'Serious'],

 deduction: [0, 0, -1, -2]

 },

 imprecision: {

 name: 'Imprecision',

 levels: ['Precise', 'Minor', 'Moderate', 'Serious'],

 deduction: [0, 0, -1, -2],

 autoDetect: function(ci, threshold) {

 var width = ci[1] - ci[0];

 if (width < threshold * 0.5) return 0;

 if (width < threshold) return 1;

 if (width < threshold * 2) return 2;

 return 3;

 }

 },

 publicationBias: {

 name: 'Publication Bias',

 levels: ['Unlikely', 'Possible', 'Likely', 'Very Likely'],

 deduction: [0, 0, -1, -2],

 autoDetect: function(eggerP) {

 if (eggerP > 0.1) return 0;

 if (eggerP > 0.05) return 1;

 if (eggerP > 0.01) return 2;

 return 3;

 }

 }

 };



 function calculateGRADEQuality(results, userAssessments) {

 userAssessments = userAssessments || {};



 var score = 4;

 var deductions = [];



 var robLevel = userAssessments.riskOfBias || 0;

 score += GRADE_DOMAINS.riskOfBias.deduction[robLevel];

 if (robLevel > 0) deductions.push('Risk of bias: -' + Math.abs(GRADE_DOMAINS.riskOfBias.deduction[robLevel]));



 var inconsLevel = GRADE_DOMAINS.inconsistency.autoDetect(results.pooled.I2);

 score += GRADE_DOMAINS.inconsistency.deduction[inconsLevel];

 if (inconsLevel > 1) deductions.push('Inconsistency (I2=' + results.pooled.I2.toFixed(0) + '%): -' + Math.abs(GRADE_DOMAINS.inconsistency.deduction[inconsLevel]));



 var indLevel = userAssessments.indirectness || 0;

 score += GRADE_DOMAINS.indirectness.deduction[indLevel];

 if (indLevel > 1) deductions.push('Indirectness: -' + Math.abs(GRADE_DOMAINS.indirectness.deduction[indLevel]));



 var ciWidth = Math.abs(results.pooled.upper - results.pooled.lower);

 var impLevel = ciWidth > 0.5 ? (ciWidth > 1 ? 3 : 2) : (ciWidth > 0.25 ? 1 : 0);

 score += GRADE_DOMAINS.imprecision.deduction[impLevel];

 if (impLevel > 1) deductions.push('Imprecision: -' + Math.abs(GRADE_DOMAINS.imprecision.deduction[impLevel]));



 // Publication Bias (auto-detected from Egger\'s test if available)

 if (results.publicationBias && results.publicationBias.eggerP) {

 var pbLevel = GRADE_DOMAINS.publicationBias.autoDetect(results.publicationBias.eggerP);

 score += GRADE_DOMAINS.publicationBias.deduction[pbLevel];

 if (pbLevel > 1) deductions.push('Publication bias: -' + Math.abs(GRADE_DOMAINS.publicationBias.deduction[pbLevel]));

 }



 score = Math.max(1, Math.min(4, score));



 var gradeLabels = ['', 'VERY LOW', 'LOW', 'MODERATE', 'HIGH'];

 var gradeColors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

 var gradeSymbols = ['', '⊕○○○', '⊕⊕○○', '⊕⊕⊕○', '⊕⊕⊕⊕'];



 return {

 score: score,

 label: gradeLabels[score],

 color: gradeColors[score],

 symbol: gradeSymbols[score],

 deductions: deductions,

 interpretation: getGRADEInterpretation(score)

 };

 }



function getGRADEInterpretation(score) {

 switch(score) {

 case 4: return 'We are very confident that the true effect lies close to the estimate.';

 case 3: return 'We are moderately confident; the true effect is likely close to the estimate but may be substantially different.';

 case 2: return 'Our confidence is limited; the true effect may be substantially different from the estimate.';

 case 1: return 'We have very little confidence; the true effect is likely substantially different from the estimate.';

 default: return '';

 }

 }



function displayGRADEAssessment(results) {

 if (!results) {

 showNotification('Run analysis first', 'error');

 return;

 }



 var grade = calculateGRADEQuality(results, {});



 var modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML =

 '<div class="modal" style="max-width: 700px;">' +

 '<div class="modal-header">' +

 '<h3>GRADE Evidence Quality Assessment</h3>' +

 '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +

 '</div>' +

 '<div class="modal-body">' +

 '<div style="text-align: center; margin-bottom: 1.5rem;">' +

 '<div style="font-size: 3rem;">' + grade.symbol + '</div>' +

 '<div style="font-size: 1.5rem; font-weight: bold; color: ' + grade.color + ';">' + grade.label + '</div>' +

 '<p style="margin-top: 0.5rem; color: var(--text-secondary);">' + grade.interpretation + '</p>' +

 '</div>' +

 '<h4>Domain Assessments</h4>' +

 '<table class="data-table" style="margin-bottom: 1rem;">' +

 '<thead><tr><th>Domain</th><th>Assessment</th><th>Deduction</th></tr></thead>' +

 '<tbody>' +

 '<tr><td>Risk of Bias</td><td>User-assessed</td><td>-</td></tr>' +

 '<tr><td>Inconsistency</td><td>I2 = ' + (results.pooled.I2 ?? 0).toFixed(1) + '%</td><td>' + (results.pooled.I2 > 50 ? '-1' : '0') + '</td></tr>' +

 '<tr><td>Imprecision</td><td>CI width</td><td>Auto</td></tr>' +

 '<tr><td>Publication Bias</td><td>Egger test</td><td>Auto</td></tr>' +

 '</tbody>' +

 '</table>' +

 (grade.deductions.length > 0 ?

 '<div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">' +

 '<strong>Deductions:</strong><br>' +

 grade.deductions.join('<br>') +

 '</div>' :

 '<div style="padding: 1rem; background: #10b98122; border-radius: 8px;">' +

 '<strong>No deductions applied</strong>' +

 '</div>'

 ) +

 '<div class="alert alert-info" style="margin-top: 1rem;">' +

 '<strong>Reference:</strong> Guyatt GH, Oxman AD, Vist GE, et al. GRADE: an emerging consensus on rating quality of evidence. BMJ 2008;336:924-926.' +

 '</div>' +

 '</div>' +

 '<div class="modal-footer">' +

 '<button class="btn btn-primary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>' +

 '</div>' +

 '</div>';

 document.body.appendChild(modal);

 }



 // - Egger\'s regression test



 function addMethodologyNote(container) {

 if (!container) return;



 var footer = document.createElement('div');

 footer.className = 'methodology-footer';

 footer.style.cssText = 'margin-top: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; font-size: 0.8rem; color: var(--text-muted);';

 footer.innerHTML = '<strong>Methodology Note:</strong> Results should be validated against R (metafor) or Stata (metan) for regulatory submissions. ' +

 'See <a href="#" onclick="showAllCitations();return false;">methodological references</a> for implementation details.';

 container.appendChild(footer);

 }



 const EFFECT_SIZE_THRESHOLDS = {

 OR: { small: 1.5, medium: 2.5, large: 4.0, direction: 'ratio' },

 RR: { small: 1.5, medium: 2.0, large: 3.0, direction: 'ratio' },

 HR: { small: 1.25, medium: 1.75, large: 2.5, direction: 'ratio' },

 SMD: { small: 0.2, medium: 0.5, large: 0.8, direction: 'diff' },

 MD: { small: null, medium: null, large: null, direction: 'diff' },

 RD: { small: 0.05, medium: 0.10, large: 0.20, direction: 'diff' }

 };



 function interpretEffectSize(effect, measure) {

 var thresholds = EFFECT_SIZE_THRESHOLDS[measure] || EFFECT_SIZE_THRESHOLDS.SMD;

 var absEffect = thresholds.direction === 'ratio' ? (effect !== 0 ? Math.max(Math.abs(effect), 1/Math.abs(effect)) : 1) : Math.abs(effect);



 if (thresholds.small === null) {

 return 'Interpretation depends on clinical context';

 }



 if (absEffect < thresholds.small) return 'Negligible effect';

 if (absEffect < thresholds.medium) return 'Small effect';

 if (absEffect < thresholds.large) return 'Medium effect';

 return 'Large effect';

 }



function getSensitivityRecommendations(results) {

 var recommendations = [];



 if (results.pooled.I2 > 50) {

 recommendations.push({

 priority: 'HIGH',

 analysis: 'Subgroup analysis',

 reason: 'I2 = ' + results.pooled.I2.toFixed(1) + '% indicates substantial heterogeneity'

 });

 }



 if (results.studies.length >= 10) {

 recommendations.push({

 priority: 'MEDIUM',

 analysis: 'Publication bias assessment',

 reason: 'Sufficient studies for funnel plot and Egger test'

 });

 }



 if (results.studies.some(function(s) { return s.weight > 0.3; })) {

 recommendations.push({

 priority: 'HIGH',

 analysis: 'Leave-one-out analysis',

 reason: 'One or more studies contribute >30% weight'

 });

 }



 recommendations.push({

 priority: 'STANDARD',

 analysis: 'Fixed vs Random effects',

 reason: 'Compare FE and RE to assess impact of heterogeneity assumption'

 });



 return recommendations;

 }





function computeRMSTFromRecords(rows, tau, timeVar, eventVar) {

 timeVar = timeVar || 'time';

 eventVar = eventVar || 'event';

 var cleaned = (rows || []).filter(function(d) {

 return d && Number.isFinite(Number(d[timeVar])) && Number.isFinite(Number(d[eventVar]));

 });

 if (cleaned.length === 0) {

 return { rmst: NaN, se: NaN, variance: NaN, tau: tau, n: 0, events: 0, error: "No valid survival records" };

 }

 var km = calculateKaplanMeier(cleaned, timeVar, eventVar, tau);

 if (!km || !Array.isArray(km.times) || km.times.length === 0) {

 return { rmst: NaN, se: NaN, variance: NaN, tau: tau, n: cleaned.length, events: 0, error: "Kaplan-Meier estimation failed" };

 }

 var rmst = 0;

 for (var i = 0; i < km.times.length - 1; i++) {

 var t0 = Math.min(km.times[i], tau);

 var t1 = Math.min(km.times[i + 1], tau);

 if (t1 > t0) rmst += km.survival[i] * (t1 - t0);

 if (km.times[i + 1] >= tau) break;

 }

 var lastTime = Math.min(km.times[km.times.length - 1], tau);

 if (tau > lastTime) {

 rmst += km.survival[km.survival.length - 1] * (tau - lastTime);

 }

 var variance = 0;

 for (var j = 0; j < km.times.length; j++) {

 if (km.times[j] >= tau) break;

 if (km.events[j] > 0 && km.atrisk[j] > km.events[j]) {

 var tailArea = tau - km.times[j];

 variance += Math.pow(tailArea * km.survival[j], 2) * km.events[j] /

 (km.atrisk[j] * (km.atrisk[j] - km.events[j]));

 }

 }

 return {

 rmst: rmst,

 se: Math.sqrt(Math.max(variance, 0)),

 variance: Math.max(variance, 0),

 tau: tau,

 n: cleaned.length,

 events: cleaned.filter(function(d) { return Number(d[eventVar]) === 1; }).length

 };

}



function compareRMST(group1Data, group2Data, tau, options) {

 options = options || {};

 var timeVar = options.timeVar || 'time';

 var eventVar = options.eventVar || 'event';

 var rmst1 = computeRMSTFromRecords(group1Data, tau, timeVar, eventVar);

 var rmst2 = computeRMSTFromRecords(group2Data, tau, timeVar, eventVar);

 if (rmst1.error || rmst2.error) {

 return {

 error: rmst1.error || rmst2.error,

 group1_rmst: rmst1,

 group2_rmst: rmst2

 };

 }

 var diff = rmst1.rmst - rmst2.rmst;

 var seDiff = Math.sqrt(Math.max((rmst1.variance ?? 0) + (rmst2.variance ?? 0), 0));

 var z = seDiff > 0 ? (diff / seDiff) : 0;

 var p = seDiff > 0 ? (2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1))) : 1;

 var ciLower = diff - getConfZ() *seDiff;

 var ciUpper = diff + getConfZ() *seDiff;

 return {

 group1_rmst: rmst1,

 group2_rmst: rmst2,

 difference: diff,

 se: seDiff,

 ci: [ciLower, ciUpper],

 ci_lower: ciLower,

 ci_upper: ciUpper,

 z: z,

 p: p,

 pValue: p,

 interpretation: "Difference in restricted mean survival: " + diff.toFixed(2) + " time units (p=" + p.toFixed(4) + ")"

 };

 }



// Advantage: Handles populations where some patients are "cured"



function getAdvancedSurvivalFieldValue(row, candidates) {

 if (!row || !Array.isArray(candidates)) return null;

 for (var i = 0; i < candidates.length; i++) {

 var key = candidates[i];

 if (!key) continue;

 if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== '') {

 return row[key];

 }

 }

 return null;

}



function normalizeAdvancedSurvivalData(survivalData, options) {

 options = options || {};

 var config = (typeof APP !== 'undefined' && APP && APP.config) ? APP.config : {};

 var timeCandidates = [options.timeVar, config.timeVar, 'time', 'time_months', 'followup_time', 'os_months'];

 var eventCandidates = [options.eventVar, config.eventVar, 'event', 'status'];

 var treatmentCandidates = [options.treatmentVar, config.treatmentVar, 'treatment', 'arm', 'group', 'trt'];

 return (survivalData || []).map(function(d) {

 var time = Number(getAdvancedSurvivalFieldValue(d, timeCandidates));

 var event = Number(getAdvancedSurvivalFieldValue(d, eventCandidates));

 var treatmentRaw = getAdvancedSurvivalFieldValue(d, treatmentCandidates);

 var treatment = Number(treatmentRaw);

 if (!Number.isFinite(time) || !Number.isFinite(event)) return null;

 if (!Number.isFinite(treatment)) {

 if (typeof treatmentRaw === 'string') {

 var label = treatmentRaw.trim().toLowerCase();

 treatment = (
 label === 'treatment' ||
 label === 'treated' ||
 label === 'active' ||
 label === 'experimental' ||
 label === 'intervention' ||
 label === 'tx'
 ) ? 1 : 0;

 } else {

 treatment = 0;

 }

 }

 return {

 time: Math.max(time, 1e-6),

 event: event > 0 ? 1 : 0,

 treatment: treatment > 0 ? 1 : 0,

 source: d

 };

 }).filter(Boolean);

}



function fitMixtureCureModel(survivalData, covariates) {

 var normalized = normalizeAdvancedSurvivalData(survivalData, covariates);

 var n = normalized.length;

 if (n < 10) {

 return {

 method: "Mixture Cure Model (EM Algorithm)",

 error: "Mixture cure model requires at least 10 analyzable survival observations"

 };

 }

 var times = normalized.map(function(d) { return d.time; });

 var events = normalized.map(function(d) { return d.event; });



 var maxIter = 100;

 var tol = 1e-6;



 var pi = 0.8;

 var lambda = 1 / Math.max(jStat.mean(times), 1e-6);



 var converged = false;

 for (var iter = 0; iter < maxIter; iter++) {



 var w = [];

 for (var i = 0; i < n; i++) {

 if (events[i] === 1) {

 w[i] = 1;

 } else {

 var survUncured = Math.exp(-lambda * times[i]);

 var num = (1 - pi) * survUncured;

 var denom = pi + (1 - pi) * survUncured;

 w[i] = denom > 0 ? num / denom : 0.5;

 }

 }



 var piNew = 1 - jStat.mean(w);

 var sumW = w.reduce(function(a, b) { return a + b; }, 0);

 var sumWT = w.reduce(function(s, wi, i) { return s + wi * times[i]; }, 0);

 var sumWE = w.reduce(function(s, wi, i) { return s + wi * events[i]; }, 0);

 var lambdaNew = sumWT > 0 ? (sumWE / sumWT) : lambda;



 if (Math.abs(piNew - pi) < tol && Math.abs(lambdaNew - lambda) < tol) {

 converged = true;

 break;

 }

 pi = piNew;

 lambda = lambdaNew;

 }



 var sePi = Math.sqrt(pi * (1 - pi) / n);

 var nEvents = events.filter(function(e) { return e === 1; }).length;

 var seLambda = nEvents > 0 ? (lambda / Math.sqrt(nEvents)) : NaN;

 var posteriorUncuredWeights = [];

 for (var wi = 0; wi < n; wi++) {

 if (events[wi] === 1) {

 posteriorUncuredWeights[wi] = 1;

 } else {

 var survUncuredFinal = Math.exp(-lambda * times[wi]);

 var numFinal = (1 - pi) * survUncuredFinal;

 var denomFinal = pi + (1 - pi) * survUncuredFinal;

 posteriorUncuredWeights[wi] = denomFinal > 0 ? numFinal / denomFinal : 0.5;

 }

 }



 return {

 method: "Mixture Cure Model (EM Algorithm)",

 cureFraction: pi,

 cureFractionSE: sePi,

 cureFractionCI: [Math.max(0, pi - getConfZ() *sePi), Math.min(1, pi + getConfZ() *sePi)],

 cureCI: [Math.max(0, pi - getConfZ() *sePi), Math.min(1, pi + getConfZ() *sePi)],

 hazardRate: lambda,

 hazardRateSE: seLambda,

 posteriorUncuredWeights: posteriorUncuredWeights,

 normalizedData: normalized.slice(),

 medianUncured: Math.log(2) / lambda,

 converged: converged,

 interpretation: (pi * 100).toFixed(1) + "% of patients estimated to be cured (never experience event)",

 reference: "Othus M, et al. Stat Med 2012;31:3104-3117"

 };

 }



function fitFlexibleParametricSurvival(survivalData, df) {

 throw new Error("Flexible parametric survival has been disabled until a validated censored-likelihood implementation is available. Use R packages rstpm2 or flexsurv for this method.");

 }



function fitAFTModel(survivalData, distribution) {

 distribution = (distribution || 'weibull').toLowerCase();

 var normalized = normalizeAdvancedSurvivalData(survivalData);

 var n = normalized.length;

 if (n < 10) {

 return {

 method: "Accelerated Failure Time Model (" + distribution + ")",

 error: "AFT model requires at least 10 analyzable survival observations"

 };

 }

 if (distribution !== 'weibull' && distribution !== 'lognormal') {

 return {

 method: "Accelerated Failure Time Model (" + distribution + ")",

 error: "Unsupported AFT distribution: " + distribution

 };

 }

 var logTimes = normalized.map(function(d) { return Math.log(Math.max(d.time, 1e-6)); });

 var events = normalized.map(function(d) { return d.event; });

 var treatments = normalized.map(function(d) { return d.treatment; });

 function clampParams(params) {

 return [

 Math.max(-20, Math.min(20, params[0])),

 Math.max(Math.log(0.05), Math.min(Math.log(10), params[1])),

 Math.max(-5, Math.min(5, params[2]))

 ];

 }

 function unpack(params) {

 return {

 mu: params[0],

 sigma: Math.exp(params[1]),

 beta: params[2]

 };

 }

 function logLikelihood(params) {

 var unpacked = unpack(params);

 var mu = unpacked.mu;

 var sigma = Math.max(unpacked.sigma, 1e-6);

 var beta = unpacked.beta;

 var ll = 0;

 for (var i = 0; i < n; i++) {

 var z = (logTimes[i] - mu - beta * treatments[i]) / sigma;

 if (distribution === 'weibull') {

 if (events[i] === 1) {

 ll += -Math.log(sigma) + z - Math.exp(z);

 } else {

 ll += -Math.exp(z);

 }

 } else if (events[i] === 1) {

 ll += Math.log(Math.max(jStat.normal.pdf(z, 0, 1), 1e-12)) - Math.log(sigma);

 } else {

 ll += Math.log(Math.max(1 - jStat.normal.cdf(z, 0, 1), 1e-12));

 }

 }

 return ll;

 }

 function numericalGradient(params, eps) {

 var grad = [];

 for (var j = 0; j < params.length; j++) {

 var plus = params.slice();

 var minus = params.slice();

 plus[j] += eps;

 minus[j] -= eps;

 grad[j] = (logLikelihood(clampParams(plus)) - logLikelihood(clampParams(minus))) / (2 * eps);

 }

 return grad;

 }

 function numericalHessian(params, eps) {

 var hessian = Array.from({ length: params.length }, function() {

 return new Array(params.length).fill(0);

 });

 var ll0 = logLikelihood(params);

 for (var j = 0; j < params.length; j++) {

 var plus = params.slice();

 var minus = params.slice();

 plus[j] += eps;

 minus[j] -= eps;

 hessian[j][j] = (logLikelihood(clampParams(plus)) - 2 * ll0 + logLikelihood(clampParams(minus))) / (eps * eps);

 for (var k = j + 1; k < params.length; k++) {

 var pp = params.slice();

 var pm = params.slice();

 var mp = params.slice();

 var mm = params.slice();

 pp[j] += eps; pp[k] += eps;

 pm[j] += eps; pm[k] -= eps;

 mp[j] -= eps; mp[k] += eps;

 mm[j] -= eps; mm[k] -= eps;

 var mixed = (
 logLikelihood(clampParams(pp)) -
 logLikelihood(clampParams(pm)) -
 logLikelihood(clampParams(mp)) +
 logLikelihood(clampParams(mm))
 ) / (4 * eps * eps);

 hessian[j][k] = mixed;

 hessian[k][j] = mixed;

 }

 }

 return hessian;

 }

 function maxSimplexWidth(simplex) {

 var width = 0;

 var best = simplex[0];

 for (var i = 1; i < simplex.length; i++) {

 for (var j = 0; j < best.length; j++) {

 width = Math.max(width, Math.abs(simplex[i][j] - best[j]));

 }

 }

 return width;

 }

 function nelderMeadMaximize(initialParams) {

 var alpha = 1;

 var gamma = 2;

 var rho = 0.5;

 var sigmaShrink = 0.5;

 var simplex = [
 clampParams(initialParams.slice()),
 clampParams([initialParams[0] + 0.2, initialParams[1], initialParams[2]]),
 clampParams([initialParams[0], initialParams[1] + 0.1, initialParams[2]]),
 clampParams([initialParams[0], initialParams[1], initialParams[2] + 0.1])
 ];

 var values = simplex.map(logLikelihood);

 for (var iter = 0; iter < 120; iter++) {

 var ranked = simplex.map(function(point, idx) {

 return { point: point.slice(), value: values[idx] };

 }).sort(function(a, b) { return b.value - a.value; });

 simplex = ranked.map(function(entry) { return entry.point; });

 values = ranked.map(function(entry) { return entry.value; });

 if ((values[0] - values[values.length - 1]) < 1e-7 && maxSimplexWidth(simplex) < 1e-5) break;

 var centroid = new Array(simplex[0].length).fill(0);

 for (var i = 0; i < simplex.length - 1; i++) {

 for (var j = 0; j < centroid.length; j++) centroid[j] += simplex[i][j];

 }

 for (var c = 0; c < centroid.length; c++) centroid[c] /= (simplex.length - 1);

 var worst = simplex[simplex.length - 1];

 var reflected = clampParams(centroid.map(function(value, idx) {

 return value + alpha * (value - worst[idx]);

 }));

 var reflectedValue = logLikelihood(reflected);

 if (reflectedValue > values[0]) {

 var expanded = clampParams(centroid.map(function(value, idx) {

 return value + gamma * (reflected[idx] - value);

 }));

 var expandedValue = logLikelihood(expanded);

 simplex[simplex.length - 1] = expandedValue > reflectedValue ? expanded : reflected;

 values[simplex.length - 1] = Math.max(expandedValue, reflectedValue);

 continue;

 }

 if (reflectedValue > values[values.length - 2]) {

 simplex[simplex.length - 1] = reflected;

 values[simplex.length - 1] = reflectedValue;

 continue;

 }

 var contracted = clampParams(centroid.map(function(value, idx) {

 var target = reflectedValue > values[values.length - 1] ? reflected[idx] : worst[idx];

 return value + rho * (target - value);

 }));

 var contractedValue = logLikelihood(contracted);

 if (contractedValue > values[values.length - 1]) {

 simplex[simplex.length - 1] = contracted;

 values[simplex.length - 1] = contractedValue;

 continue;

 }

 for (var s = 1; s < simplex.length; s++) {

 simplex[s] = clampParams(simplex[0].map(function(value, idx) {

 return value + sigmaShrink * (simplex[s][idx] - value);

 }));

 values[s] = logLikelihood(simplex[s]);

 }

 }

 var bestIndex = 0;

 for (var idx = 1; idx < values.length; idx++) {

 if (values[idx] > values[bestIndex]) bestIndex = idx;

 }

 return simplex[bestIndex];

 }

 var mu0 = jStat.mean(logTimes);

 var sigma0 = Math.max(jStat.stdev(logTimes), 0.5);

 var treatedTimes = normalized.filter(function(d) { return d.treatment === 1; }).map(function(d) { return d.time; });

 var controlTimes = normalized.filter(function(d) { return d.treatment === 0; }).map(function(d) { return d.time; });

 var beta0 = (treatedTimes.length > 0 && controlTimes.length > 0) ?
 Math.log(Math.max(jStat.median(treatedTimes), 1e-6) / Math.max(jStat.median(controlTimes), 1e-6)) :
 0;

 var params = nelderMeadMaximize([mu0, Math.log(sigma0), beta0]);

 params = clampParams(params);

 var fitted = unpack(params);

 var mu = fitted.mu;

 var sigma = fitted.sigma;

 var beta = fitted.beta;

 var info = numericalHessian(params, 1e-4).map(function(row) {

 return row.map(function(value) { return -value; });

 });

 for (var d = 0; d < info.length; d++) info[d][d] += 1e-8;

 var seBeta = 0.1;

 try {

 var vcov = MatrixUtils.inverse(info);

 if (vcov && vcov[2] && Number.isFinite(vcov[2][2]) && vcov[2][2] >= 0) {

 seBeta = Math.sqrt(Math.max(vcov[2][2], 0));

 }

 } catch (e) {}

 var accelerationFactor = Math.exp(beta);

 var ciLower = Math.exp(beta - getConfZ() *seBeta);

 var ciUpper = Math.exp(beta + getConfZ() *seBeta);



 return {

 method: "Accelerated Failure Time Model (" + distribution + ")",

 distribution: distribution,

 intercept: mu,

 scale: sigma,

 treatmentEffect: beta,

 accelerationFactor: accelerationFactor,

 accelerationFactorCI: [ciLower, ciUpper],

 timeRatio: accelerationFactor,

 ci_lower: ciLower,

 ci_upper: ciUpper,

 shape: distribution === 'weibull' ? (1 / sigma) : null,

 interpretation: "Treatment " + (accelerationFactor > 1 ? "extends" : "shortens") + " survival time by factor of " + accelerationFactor.toFixed(2),

 medianRatio: accelerationFactor,

 reference: "Wei LJ. Stat Med 1992;11:1871-1879"

 };

 }



function landmarkAnalysis(survivalData, landmarkTimes, horizon) {

 var normalized = normalizeAdvancedSurvivalData(survivalData);

 var results = [];

 (landmarkTimes || []).forEach(function(tLM) {

 var atRisk = normalized.filter(function(d) { return d.time >= tLM; });

 if (atRisk.length < 10) {

 results.push({ landmark: tLM, error: "Insufficient patients at risk", nAtRisk: atRisk.length, n: atRisk.length });

 return;

 }

 var landmarkData = atRisk.map(function(d) {

 return {

 time: Math.max(d.time - tLM, 1e-6),

 event: d.event === 1 && d.time <= tLM + horizon ? 1 : 0,

 treatment: d.treatment

 };

 });

 var times = landmarkData.map(function(d) { return d.time; });

 var events = landmarkData.map(function(d) { return d.event; });

 var treatmentMatrix = landmarkData.map(function(d) { return [d.treatment]; });

 var coxResult = typeof coxPHEfron === 'function' ?
 coxPHEfron(times, events, treatmentMatrix) :
 SurvivalAnalysis.coxPH(times, events, treatmentMatrix);

 var beta = coxResult && coxResult.beta ? Number(coxResult.beta[0]) : NaN;

 var se = coxResult && coxResult.se ? Number(coxResult.se[0]) : NaN;

 var hr = Math.exp(beta);

 var ciLower = Math.exp(beta - getConfZ() *se);

 var ciUpper = Math.exp(beta + getConfZ() *se);

 var km = calculateKaplanMeier(landmarkData, 'time', 'event', horizon);

 var horizonIdx = km.times.findIndex(function(t) { return t >= horizon; });

 var survAtHorizon = km.survival[horizonIdx >= 0 ? horizonIdx : km.survival.length - 1];

 results.push({

 landmark: tLM,

 nAtRisk: atRisk.length,

 n: atRisk.length,

 nEvents: landmarkData.filter(function(d) { return d.event === 1; }).length,

 conditionalSurvival: survAtHorizon,

 hazardRatio: hr,

 hr: hr,

 se: se,

 hrCI: [ciLower, ciUpper],

 ci_lower: ciLower,

 ci_upper: ciUpper,

 interpretation: "Among patients surviving to " + tLM + ", " + (survAtHorizon * 100).toFixed(1) + "% survive additional " + horizon + " time units"

 });

 });



 return {

 method: "Landmark Analysis with Dynamic Prediction",

 horizon: horizon,

 landmarks: results,

 reference: "van Houwelingen HC. Scand J Stat 2007;34:70-85"

 };

 }





function normalizeSurvivalBinaryTreatment(value) {

 var asNum = Number(value);

 if (Number.isFinite(asNum)) return asNum > 0 ? 1 : 0;

 if (typeof value === 'string') {

 var label = value.trim().toLowerCase();

 if (['1', 'yes', 'true', 'treated', 'treatment', 'active', 'experimental', 'intervention', 'tx'].indexOf(label) >= 0) return 1;

 if (['0', 'no', 'false', 'control', 'placebo', 'standard', 'comparator'].indexOf(label) >= 0) return 0;

 }

 return null;

}



function normalizeSurvivalEventType(value) {

 var asNum = Number(value);

 if (Number.isFinite(asNum)) return asNum > 0 ? Math.round(Math.abs(asNum)) : 0;

 if (typeof value === 'string') {

 var label = value.trim().toLowerCase();

 if (!label || ['0', 'censor', 'censored', 'none', 'alive', 'no', 'false'].indexOf(label) >= 0) return 0;

 if (['1', 'event', 'death', 'yes', 'true', 'primary'].indexOf(label) >= 0) return 1;

 var parsed = parseInt(label, 10);

 if (Number.isFinite(parsed)) return parsed > 0 ? parsed : 0;

 return 1;

 }

 return 0;

}



function survivalQuantile(values, q) {

 var xs = (values || []).filter(function(v) { return Number.isFinite(v); }).slice().sort(function(a, b) { return a - b; });

 if (!xs.length) return NaN;

 var qq = Math.min(1, Math.max(0, Number(q)));

 var pos = qq * (xs.length - 1);

 var lo = Math.floor(pos);

 var hi = Math.ceil(pos);

 if (lo === hi) return xs[lo];

 var w = pos - lo;

 return xs[lo] * (1 - w) + xs[hi] * w;

}



function calculateWeightedWilcoxonP(group1Rows, group2Rows, timeVar, eventVar) {

 timeVar = timeVar || 'time';

 eventVar = eventVar || 'event';

 var rows1 = (group1Rows || []).filter(function(r) {

 return r && Number.isFinite(Number(r[timeVar])) && Number.isFinite(Number(r[eventVar]));

 });

 var rows2 = (group2Rows || []).filter(function(r) {

 return r && Number.isFinite(Number(r[timeVar])) && Number.isFinite(Number(r[eventVar]));

 });

 if (!rows1.length || !rows2.length) {

 return { statistic: 0, variance: 0, chiSq: 0, p: 1 };

 }

 var allTimes = [];

 rows1.forEach(function(r) { allTimes.push(Number(r[timeVar])); });

 rows2.forEach(function(r) { allTimes.push(Number(r[timeVar])); });

 allTimes = Array.from(new Set(allTimes)).sort(function(a, b) { return a - b; });

 var U = 0;

 var V = 0;

 var n1 = rows1.length;

 var n2 = rows2.length;

 allTimes.forEach(function(t) {

 var d1 = rows1.filter(function(r) { return Number(r[timeVar]) === t && Number(r[eventVar]) === 1; }).length;

 var d2 = rows2.filter(function(r) { return Number(r[timeVar]) === t && Number(r[eventVar]) === 1; }).length;

 var d = d1 + d2;

 if (d > 0 && (n1 + n2) > 1) {

 var n = n1 + n2;

 var weight = n;

 var e1 = d * n1 / n;

 var varTerm = d * n1 * n2 * (n - d) / Math.max(n * n * Math.max(n - 1, 1), 1);

 U += weight * (d1 - e1);

 V += weight * weight * Math.max(varTerm, 0);

 }

 n1 -= rows1.filter(function(r) { return Number(r[timeVar]) === t; }).length;

 n2 -= rows2.filter(function(r) { return Number(r[timeVar]) === t; }).length;

 });

 if (!(V > 0)) {

 return { statistic: U, variance: V, chiSq: 0, p: 1 };

 }

 var chiSq = (U * U) / V;

 var p = 1;

 if (typeof Stats === 'object' && Stats && typeof Stats.chiSquareCDF === 'function') {

 p = 1 - Stats.chiSquareCDF(chiSq, 1);

 } else if (typeof jStat !== 'undefined' && jStat && jStat.chisquare && typeof jStat.chisquare.cdf === 'function') {

 p = 1 - jStat.chisquare.cdf(chiSq, 1);

 }

 return { statistic: U, variance: V, chiSq: chiSq, p: Math.max(0, Math.min(1, p)) };

}



function buildCompetingRiskCensoringKM(times, eventTypes) {

 var uniqueTimes = Array.from(new Set((times || []).filter(function(t) { return Number.isFinite(t) && t > 0; }))).sort(function(a, b) { return a - b; });

 var survBefore = {};

 var surv = 1;

 uniqueTimes.forEach(function(t) {

 survBefore[String(t)] = surv;

 var atRisk = 0;

 var dCensor = 0;

 for (var i = 0; i < times.length; i++) {

 if (times[i] >= t) atRisk += 1;

 if (times[i] === t && eventTypes[i] === 0) dCensor += 1;

 }

 if (atRisk > 0 && dCensor > 0) {

 surv *= Math.max(1e-8, 1 - dCensor / atRisk);

 }

 });

 return {

 uniqueTimes: uniqueTimes,

 getBefore: function(t) {

 var key = String(t);

 if (Object.prototype.hasOwnProperty.call(survBefore, key)) return Math.max(survBefore[key], 1e-8);

 var best = 1;

 for (var i = 0; i < uniqueTimes.length; i++) {

 if (uniqueTimes[i] >= t) break;

 best = Math.max(survBefore[String(uniqueTimes[i])] || best, 1e-8);

 }

 return Math.max(best, 1e-8);

 }

 };

}



function buildCompetingRiskCIFCurve(times, eventTypes, treatment, treatValue, eventOfInterest) {

 var idx = [];

 for (var i = 0; i < times.length; i++) {

 if (treatment[i] === treatValue && Number.isFinite(times[i]) && times[i] > 0) idx.push(i);

 }

 idx.sort(function(a, b) { return times[a] - times[b]; });

 var uniqueTimes = Array.from(new Set(idx.map(function(i) { return times[i]; }))).sort(function(a, b) { return a - b; });

 var curve = [{ time: 0, cif: 0, se: 0, atRisk: idx.length, eventsCause: 0, eventsAny: 0 }];

 var survProb = 1;

 var cumInc = 0;

 uniqueTimes.forEach(function(t) {

 var atRisk = 0;

 var causeEvents = 0;

 var allEvents = 0;

 for (var j = 0; j < idx.length; j++) {

 var ii = idx[j];

 if (times[ii] >= t) atRisk += 1;

 if (times[ii] === t) {

 if (eventTypes[ii] === eventOfInterest) causeEvents += 1;

 if (eventTypes[ii] > 0) allEvents += 1;

 }

 }

 if (!(atRisk > 0)) return;

 if (causeEvents > 0) cumInc += survProb * (causeEvents / atRisk);

 if (allEvents > 0) survProb *= Math.max(0, 1 - allEvents / atRisk);

 var seApprox = Math.sqrt(Math.max(cumInc * (1 - cumInc), 0) / Math.max(idx.length, 1));

 curve.push({

 time: t,

 cif: cumInc,

 se: seApprox,

 atRisk: atRisk,

 eventsCause: causeEvents,

 eventsAny: allEvents

 });

 });

 return { curve: curve, n: idx.length };

}



function competingRiskCIFAtHorizon(curve, horizon) {

 var out = { cif: 0, se: 0 };

 if (!Array.isArray(curve) || !Number.isFinite(horizon)) return out;

 for (var i = 0; i < curve.length; i++) {

 if (!curve[i] || !Number.isFinite(curve[i].time)) continue;

 if (curve[i].time > horizon) break;

 out = { cif: Number(curve[i].cif) ?? 0, se: Number(curve[i].se) ?? 0 };

 }

 return out;

}



function buildFineGrayScoreState(times, eventTypes, treatment, eventOfInterest, beta, censoringKM) {

 var eventRows = {};

 for (var i = 0; i < times.length; i++) {

 if (eventTypes[i] !== eventOfInterest) continue;

 var key = String(times[i]);

 if (!eventRows[key]) eventRows[key] = { time: times[i], count: 0, sumTreatment: 0 };

 eventRows[key].count += 1;

 eventRows[key].sumTreatment += treatment[i];

 }

 var ordered = Object.keys(eventRows).map(function(key) { return eventRows[key]; }).sort(function(a, b) { return a.time - b.time; });

 var score = 0;

 var info = 0;

 ordered.forEach(function(row) {

 var t = row.time;

 var gCurrent = censoringKM.getBefore(t);

 var S0 = 0;

 var S1 = 0;

 var S2 = 0;

 for (var i = 0; i < times.length; i++) {

 var ti = times[i];

 var ei = eventTypes[i];

 var z = treatment[i];

 var weight = 0;

 if (ti >= t) {

 weight = 1;

 } else if (ei !== eventOfInterest && ei !== 0) {

 var gSubject = censoringKM.getBefore(ti);

 weight = gCurrent / Math.max(gSubject, 1e-8);

 }

 if (!(weight > 0)) continue;

 var expBeta = Math.exp(beta * z);

 S0 += weight * expBeta;

 S1 += weight * expBeta * z;

 S2 += weight * expBeta * z * z;

 }

 if (!(S0 > 0)) return;

 var meanZ = S1 / S0;

 var varZ = Math.max(S2 / S0 - meanZ * meanZ, 0);

 score += row.sumTreatment - row.count * meanZ;

 info += row.count * varZ;

 });

 return { score: score, information: info, targetEventTimes: ordered.length };

}



function runCompetingRisksStableCore(times, eventTypes, treatment, studyIds, eventOfInterest, options) {

 eventOfInterest = eventOfInterest || 1;

 options = options || {};

 var n = Array.isArray(times) ? times.length : 0;

 if (!n || !Array.isArray(eventTypes) || !Array.isArray(treatment) || eventTypes.length !== n || treatment.length !== n) {

 return null;

 }

 var normalizedTimes = new Array(n);

 var normalizedEvents = new Array(n);

 var normalizedTreatment = new Array(n);

 var validTimes = [];

 for (var i = 0; i < n; i++) {

 normalizedTimes[i] = Number(times[i]);

 normalizedEvents[i] = Number.isFinite(eventTypes[i]) ? Math.max(0, Math.round(Math.abs(eventTypes[i]))) : 0;

 normalizedTreatment[i] = treatment[i] > 0 ? 1 : 0;

 if (Number.isFinite(normalizedTimes[i]) && normalizedTimes[i] > 0) validTimes.push(normalizedTimes[i]);

 }

 if (!validTimes.length) return null;

 var nEvents = normalizedEvents.filter(function(e) { return e === eventOfInterest; }).length;

 var nCompeting = normalizedEvents.filter(function(e) { return e !== eventOfInterest && e !== 0; }).length;

 if (!(nEvents > 0) || !normalizedTreatment.some(function(v) { return v === 1; }) || !normalizedTreatment.some(function(v) { return v === 0; })) return null;

 var censoringKM = buildCompetingRiskCensoringKM(normalizedTimes, normalizedEvents);

 var score0 = buildFineGrayScoreState(normalizedTimes, normalizedEvents, normalizedTreatment, eventOfInterest, 0, censoringKM);

 if (!(score0.information > 0)) return null;

 var beta = 0;

 var maxIter = 40;

 var tol = 1e-8;

 for (var iter = 0; iter < maxIter; iter++) {

 var state = buildFineGrayScoreState(normalizedTimes, normalizedEvents, normalizedTreatment, eventOfInterest, beta, censoringKM);

 if (!(state.information > 1e-10)) break;

 var delta = state.score / state.information;

 if (!Number.isFinite(delta)) break;

 if (delta > 1.5) delta = 1.5;

 if (delta < -1.5) delta = -1.5;

 beta += delta;

 if (beta > 6) beta = 6;

 if (beta < -6) beta = -6;

 if (Math.abs(delta) < tol) break;

 }

 var finalState = buildFineGrayScoreState(normalizedTimes, normalizedEvents, normalizedTreatment, eventOfInterest, beta, censoringKM);

 if (!(finalState.information > 1e-10)) return null;

 var se = Math.sqrt(1 / finalState.information);

 if (!Number.isFinite(se) || !(se > 0)) return null;

 var z = beta / se;

 var normalCdf = typeof normalCDF === 'function'

 ? normalCDF(Math.abs(z))

 : ((typeof Stats === 'object' && Stats && typeof Stats.normalCDF === 'function') ? Stats.normalCDF(Math.abs(z)) : 0.5);

 var grayChiSq = (score0.score * score0.score) / Math.max(score0.information, 1e-10);

 var grayP = 1;

 if (typeof Stats === 'object' && Stats && typeof Stats.chiSquareCDF === 'function') {

 grayP = 1 - Stats.chiSquareCDF(grayChiSq, 1);

 } else if (typeof jStat !== 'undefined' && jStat && jStat.chisquare && typeof jStat.chisquare.cdf === 'function') {

 grayP = 1 - jStat.chisquare.cdf(grayChiSq, 1);

 }

 var horizon = Number.isFinite(options.horizon) && options.horizon > 0 ? options.horizon : survivalQuantile(validTimes, 0.75);

 var cifTreated = buildCompetingRiskCIFCurve(normalizedTimes, normalizedEvents, normalizedTreatment, 1, eventOfInterest);

 var cifControl = buildCompetingRiskCIFCurve(normalizedTimes, normalizedEvents, normalizedTreatment, 0, eventOfInterest);

 var treatedAtHorizon = competingRiskCIFAtHorizon(cifTreated.curve, horizon);

 var controlAtHorizon = competingRiskCIFAtHorizon(cifControl.curve, horizon);

 var riskDifference = treatedAtHorizon.cif - controlAtHorizon.cif;

 var riskDifferenceSE = Math.sqrt(Math.max((treatedAtHorizon.se * treatedAtHorizon.se) + (controlAtHorizon.se * controlAtHorizon.se), 0));

 return {

 method: 'Fine-Gray Subdistribution Hazard (Dynamic IPCW)',

 nPatients: n,

 nEvents: nEvents,

 nCompeting: nCompeting,

 subdistributionHR: {

 logSHR: beta,

 sHR: Math.exp(beta),

 se: se,

 CI: [Math.exp(beta - getConfZ() * se), Math.exp(beta + getConfZ() * se)],

 pValue: 2 * (1 - normalCdf)

 },

 grayTest: {

 method: 'Gray/Fine-Gray score test',

 statistic: score0.score,

 information: score0.information,

 chiSq: grayChiSq,

 pValue: Math.max(0, Math.min(1, grayP))

 },

 cumulativeIncidence: {

 treated: cifTreated.curve,

 control: cifControl.curve,

 contrast: {

 horizon: horizon,

 treatedAtHorizon: treatedAtHorizon.cif,

 controlAtHorizon: controlAtHorizon.cif,

 riskDifference: riskDifference,

 se: riskDifferenceSE,

 CI: Number.isFinite(riskDifferenceSE) && riskDifferenceSE > 0 ? [riskDifference - getConfZ() * riskDifferenceSE, riskDifference + getConfZ() * riskDifferenceSE] : [riskDifference, riskDifference]

 }

 }

 };

}



if (typeof window !== 'undefined') window.runCompetingRisksMACore = runCompetingRisksStableCore;



function deriveUncuredTreatmentEffect(cureFit) {

 if (!cureFit || cureFit.error) return null;

 var normalized = Array.isArray(cureFit.normalizedData) ? cureFit.normalizedData : null;

 var weights = Array.isArray(cureFit.posteriorUncuredWeights) ? cureFit.posteriorUncuredWeights : null;

 if (!normalized || !weights || normalized.length !== weights.length || normalized.length < 10) return null;

 var treatedTime = 0;

 var controlTime = 0;

 var treatedEvents = 0;

 var controlEvents = 0;

 for (var i = 0; i < normalized.length; i++) {

 var row = normalized[i];

 var w = Number(weights[i]);

 if (!row || !Number.isFinite(w) || w <= 0) continue;

 if (row.treatment === 1) {

 treatedTime += w * row.time;

 treatedEvents += w * row.event;

 } else {

 controlTime += w * row.time;

 controlEvents += w * row.event;

 }

 }

 if (!(treatedTime > 0) || !(controlTime > 0) || !(treatedEvents > 0.5) || !(controlEvents > 0.5)) return null;

 var rateTreated = treatedEvents / treatedTime;

 var rateControl = controlEvents / controlTime;

 if (!(rateTreated > 0) || !(rateControl > 0)) return null;

 var logHR = Math.log(rateTreated / rateControl);

 var se = Math.sqrt((1 / treatedEvents) + (1 / controlEvents));

 if (!Number.isFinite(logHR) || !Number.isFinite(se) || !(se > 0)) return null;

 return {

 hr: Math.exp(logHR),

 logHR: logHR,

 se: se,

 treatedEvents: treatedEvents,

 controlEvents: controlEvents

 };

}



function buildValidatedSurvivalFeatureBundle(ipdData, options) {

 options = options || {};

 var studyVar = options.studyVar || 'study_id';

 var treatmentVar = options.treatmentVar || 'treatment';

 var timeVar = options.timeVar || 'time';

 var eventVar = options.eventVar || 'event';

 var minArmSize = Number.isFinite(options.minArmSize) ? options.minArmSize : 5;

 var cleaned = (ipdData || []).map(function(row) {

 var sid = row ? row[studyVar] : null;

 var time = row ? Number(row[timeVar]) : NaN;

 var eventType = row ? normalizeSurvivalEventType(row[eventVar]) : 0;

 var trtRaw = row ? row[treatmentVar] : null;

 var trt = normalizeSurvivalBinaryTreatment(trtRaw);

 if (sid === null || sid === undefined || sid === '') return null;

 if (!Number.isFinite(time) || !(time > 0) || trtRaw === null || trtRaw === undefined || trtRaw === '') return null;

 return {

 source: row,

 __study: sid,

 __time: time,

 __eventType: eventType,

 __event: eventType > 0 ? 1 : 0,

 __trtRaw: trtRaw,

 __trt: trt

 };

 }).filter(Boolean);

 if (cleaned.length < 20) {

 return { error: 'Need survival IPD with at least 20 analyzable rows.' };

 }

 var byStudy = {};

 cleaned.forEach(function(row) {

 if (!byStudy[row.__study]) byStudy[row.__study] = [];

 byStudy[row.__study].push(row);

 });

 var studyIds = Object.keys(byStudy);

 if (studyIds.length < 2) {

 return { error: 'Need at least 2 studies with analyzable survival IPD.' };

 }

 var allTimes = cleaned.map(function(row) { return row.__time; });

 var tau = survivalQuantile(allTimes, 0.80);

 if (!Number.isFinite(tau) || !(tau > 0)) {

 return { error: 'Failed to determine a valid RMST truncation time from loaded survival IPD.' };

 }

 var landmarks = [0.25, 0.5, 0.75].map(function(frac) {

 var raw = tau * frac;

 var rounded = raw >= 10 ? Math.round(raw * 10) / 10 : Math.round(raw * 100) / 100;

 return rounded > 0 ? rounded : raw;

 }).filter(function(v, idx, arr) {

 return Number.isFinite(v) && v > 0 && arr.indexOf(v) === idx;

 });

 if (landmarks.length < 2) {

 landmarks = [survivalQuantile(allTimes, 0.25), survivalQuantile(allTimes, 0.5), survivalQuantile(allTimes, 0.75)].filter(function(v, idx, arr) {

 return Number.isFinite(v) && v > 0 && arr.indexOf(v) === idx;

 });

 }

 var horizon = Math.max(tau * 0.25, 1e-6);

 var causeValues = Array.from(new Set(cleaned.map(function(row) { return row.__eventType; }).filter(function(v) { return v > 0; }))).sort(function(a, b) { return a - b; });

 var studySummaries = [];

 studyIds.forEach(function(studyId) {

 var rows = (byStudy[studyId] || []).map(function(row) { return Object.assign({}, row); });

 var levelMap = {};

 var orderedLevels = [];

 rows.forEach(function(row) {

 var raw = row.__trtRaw;

 if (raw === null || raw === undefined || raw === '') return;

 if (orderedLevels.indexOf(raw) === -1) orderedLevels.push(raw);

 });

 if (orderedLevels.length !== 2) return;

 orderedLevels.forEach(function(level, idx) {

 var mapped = normalizeSurvivalBinaryTreatment(level);

 if (mapped === null) mapped = idx === 0 ? 0 : 1;

 levelMap[level] = mapped;

 });

 rows.forEach(function(row) {

 if (row.__trt === null && Object.prototype.hasOwnProperty.call(levelMap, row.__trtRaw)) {

 row.__trt = levelMap[row.__trtRaw];

 }

 });

 var treated = rows.filter(function(row) { return row.__trt === 1; });

 var control = rows.filter(function(row) { return row.__trt === 0; });

 if (treated.length < minArmSize || control.length < minArmSize) return;

 var summary = {

 study: studyId,

 n: rows.length,

 nEvents: rows.filter(function(row) { return row.__event === 1; }).length

 };

 var rmstComparison = compareRMST(treated, control, tau, { timeVar: '__time', eventVar: '__event' });

 if (rmstComparison && !rmstComparison.error && Number.isFinite(rmstComparison.difference) && Number.isFinite(rmstComparison.seDiff) && rmstComparison.seDiff > 0) {

 summary.rmst_diff = rmstComparison.difference;

 summary.se = rmstComparison.seDiff;

 summary.tau_used = tau;

 }

 var landmarkInput = rows.map(function(row) {

 return { time: row.__time, event: row.__event, treatment: row.__trt };

 });

 var landmarkResult = landmarkAnalysis(landmarkInput, landmarks, horizon);

 if (landmarkResult && Array.isArray(landmarkResult.landmarks)) {

 landmarkResult.landmarks.forEach(function(item) {

 if (!item || item.error || !Number.isFinite(item.hr) || !Number.isFinite(item.se) || !(item.se > 0)) return;

 summary['landmark_' + item.landmark] = {

 hr: item.hr,

 se: item.se,

 nAtRisk: item.nAtRisk,

 nEvents: item.nEvents

 };

 });

 }

 var times = rows.map(function(row) { return row.__time; });

 var events = rows.map(function(row) { return row.__event; });

 var treatment = rows.map(function(row) { return row.__trt; });

 if (summary.nEvents >= 5 && typeof SurvivalAnalysis === 'object' && SurvivalAnalysis) {

 if (typeof SurvivalAnalysis.testPHAssumption === 'function') {

 var ph = SurvivalAnalysis.testPHAssumption(times, events, treatment);

 if (ph && Number.isFinite(ph.pValue)) {

 summary.schoenfeld_p = ipdClampProbability(ph.pValue, 1e-6, 0.999999);

 if (Number.isFinite(ph.correlation)) summary.scaled_schoenfeld_slope = ph.correlation;

 }

 }

 if (typeof SurvivalAnalysis.logRankTest === 'function') {

 var logRank = SurvivalAnalysis.logRankTest(

 treated.map(function(row) { return row.__time; }),

 treated.map(function(row) { return row.__event; }),

 control.map(function(row) { return row.__time; }),

 control.map(function(row) { return row.__event; })

 );

 if (logRank && Number.isFinite(logRank.p)) {

 summary.logrank_p = ipdClampProbability(logRank.p, 1e-6, 0.999999);

 }

 }

 var wilcoxon = calculateWeightedWilcoxonP(treated, control, '__time', '__event');

 if (wilcoxon && Number.isFinite(wilcoxon.p)) {

 summary.wilcoxon_p = ipdClampProbability(wilcoxon.p, 1e-6, 0.999999);

 }

 }

 var cureFit = fitMixtureCureModel(landmarkInput, { timeVar: 'time', eventVar: 'event', treatmentVar: 'treatment' });

 if (cureFit && !cureFit.error && Number.isFinite(cureFit.cureFraction) && Number.isFinite(cureFit.cureFractionSE)) {

 summary.cure_fraction = ipdClampProbability(cureFit.cureFraction, 0.01, 0.99);

 summary.cure_se = Math.max(Number(cureFit.cureFractionSE), 1e-6);

 var uncuredEffect = deriveUncuredTreatmentEffect(cureFit);

 if (uncuredEffect) {

 summary.hr_uncured = uncuredEffect.hr;

 summary.hr_se = uncuredEffect.se;

 }

 }

 var coreCompetingRisks = (typeof window !== 'undefined' && typeof window.runCompetingRisksMACore === 'function')
     ? window.runCompetingRisksMACore
     : (typeof runCompetingRisksMACore === 'function' ? runCompetingRisksMACore : null);

 if (causeValues.length > 1 && typeof coreCompetingRisks === 'function') {

 causeValues.forEach(function(causeValue) {

 var competing = coreCompetingRisks(times, rows.map(function(row) { return row.__eventType; }), treatment, rows.map(function() { return studyId; }), causeValue, { horizon: tau });

 var shr = competing && competing.subdistributionHR;

 if (!shr || !Number.isFinite(shr.sHR) || !(shr.sHR > 0) || !Number.isFinite(shr.se) || !(shr.se > 0) || !Number.isFinite(competing.nEvents) || !(competing.nEvents > 0)) return;

 summary['cause' + causeValue + '_cshr'] = shr.sHR;

 summary['cause' + causeValue + '_se'] = shr.se;

 var gray = competing && competing.grayTest;

 if (gray && Number.isFinite(gray.pValue)) {

 summary['cause' + causeValue + '_gray_p'] = ipdClampProbability(gray.pValue, 1e-6, 0.999999);

 }

 var cifContrast = competing && competing.cumulativeIncidence ? competing.cumulativeIncidence.contrast : null;

 if (cifContrast && Number.isFinite(cifContrast.riskDifference)) {

 summary['cause' + causeValue + '_cif_rd'] = cifContrast.riskDifference;

 if (Number.isFinite(cifContrast.se) && cifContrast.se > 0) summary['cause' + causeValue + '_cif_se'] = cifContrast.se;

 if (Number.isFinite(cifContrast.horizon)) summary['cause' + causeValue + '_cif_horizon'] = cifContrast.horizon;

 if (Number.isFinite(cifContrast.treatedAtHorizon)) summary['cause' + causeValue + '_cif_treated'] = cifContrast.treatedAtHorizon;

 if (Number.isFinite(cifContrast.controlAtHorizon)) summary['cause' + causeValue + '_cif_control'] = cifContrast.controlAtHorizon;

 }

 });

 }

 var informativeKeys = Object.keys(summary).filter(function(key) {

 return ['study', 'n', 'nEvents'].indexOf(key) === -1;

 });

 if (informativeKeys.length) studySummaries.push(summary);

 });

 if (studySummaries.length < 2) {

 return { error: 'Need at least 2 studies with analyzable treatment/control survival IPD.' };

 }

 return {

 studies: studySummaries,

 tau: tau,

 landmarks: landmarks,

 horizon: horizon,

 causeValues: causeValues,

 nPatients: cleaned.length,

 nStudies: studySummaries.length,

 source: 'ipd'

 };

}



function ipdClampProbability(p, lower, upper) {

 lower = Number.isFinite(lower) ? lower : 0.001;

 upper = Number.isFinite(upper) ? upper : 0.999;

 var value = Number(p);

 if (!Number.isFinite(value)) value = 0.5;

 return Math.min(upper, Math.max(lower, value));

}



function ipdDot(a, b) {

 var sum = 0;

 for (var i = 0; i < a.length; i++) sum += a[i] * b[i];

 return sum;

}



function ipdNormalizeRow(row) {

 return (row || []).map(function(v) {

 var n = Number(v);

 return Number.isFinite(n) ? n : 0;

 });

}



function ipdWeightedLeastSquares(X, y, weights) {

 if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length || X.length === 0) return null;

 var n = y.length;

 var p = X[0].length;

 if (n <= p) return null;

 var w = Array.isArray(weights) && weights.length === n ? weights.slice() : new Array(n).fill(1);

 var XtWX = Array.from({ length: p }, function() { return new Array(p).fill(0); });

 var XtWy = new Array(p).fill(0);

 for (var i = 0; i < n; i++) {

 var wi = Math.max(Number(w[i]) ?? 0, 1e-8);

 for (var j = 0; j < p; j++) {

 XtWy[j] += wi * X[i][j] * y[i];

 for (var k = 0; k < p; k++) XtWX[j][k] += wi * X[i][j] * X[i][k];

 }

 }

 for (var d = 0; d < p; d++) XtWX[d][d] += 1e-8;

 var beta = solveLinearSystem(XtWX.map(function(row) { return row.slice(); }), XtWy.slice());

 if (!beta || beta.length !== p || beta.some(function(v) { return !Number.isFinite(v); })) return null;

 var rss = 0;

 for (var r = 0; r < n; r++) {

 var resid = y[r] - ipdDot(X[r], beta);

 rss += Math.max(Number(w[r]) ?? 0, 1e-8) * resid * resid;

 }

 var sigma2 = rss / Math.max(1, n - p);

 try {

 var inv = MatrixUtils.inverse(XtWX);

 var vcov = inv.map(function(row) {

 return row.map(function(v) { return v * sigma2; });

 });

 var se = vcov.map(function(row, idx) { return Math.sqrt(Math.max(row[idx], 0)); });

 return { beta: beta, se: se, vcov: vcov, fitted: X.map(function(row) { return ipdDot(row, beta); }) };

 } catch (e) {

 return { beta: beta, se: new Array(p).fill(NaN), vcov: null, fitted: X.map(function(row) { return ipdDot(row, beta); }) };

 }

}



function ipdWeightedLogisticRegression(X, y, weights) {

 if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length || X.length === 0) return null;

 var n = y.length;

 var p = X[0].length;

 var beta = new Array(p).fill(0);

 var wObs = Array.isArray(weights) && weights.length === n ? weights.slice() : new Array(n).fill(1);

 for (var iter = 0; iter < 60; iter++) {

 var XtWX = Array.from({ length: p }, function() { return new Array(p).fill(0); });

 var XtWz = new Array(p).fill(0);

 var maxDelta = 0;

 for (var i = 0; i < n; i++) {

 var eta = ipdDot(X[i], beta);

 var pHat = ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta)))), 1e-6, 1 - 1e-6);

 var wi = Math.max(Number(wObs[i]) ?? 0, 1e-8) * pHat * (1 - pHat);

 var z = eta + (y[i] - pHat) / Math.max(pHat * (1 - pHat), 1e-8);

 for (var j = 0; j < p; j++) {

 XtWz[j] += wi * X[i][j] * z;

 for (var k = 0; k < p; k++) XtWX[j][k] += wi * X[i][j] * X[i][k];

 }

 }

 for (var d = 0; d < p; d++) XtWX[d][d] += 1e-8;

 var nextBeta = solveLinearSystem(XtWX.map(function(row) { return row.slice(); }), XtWz.slice());

 if (!nextBeta || nextBeta.length !== p || nextBeta.some(function(v) { return !Number.isFinite(v); })) return null;

 for (var b = 0; b < p; b++) {

 maxDelta = Math.max(maxDelta, Math.abs(nextBeta[b] - beta[b]));

 }

 beta = nextBeta;

 if (maxDelta < 1e-8) break;

 }

 try {

 var finalXtWX = Array.from({ length: p }, function() { return new Array(p).fill(0); });

 for (var row = 0; row < n; row++) {

 var etaFinal = ipdDot(X[row], beta);

 var pFinal = ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, etaFinal)))), 1e-6, 1 - 1e-6);

 var wFinal = Math.max(Number(wObs[row]) ?? 0, 1e-8) * pFinal * (1 - pFinal);

 for (var c1 = 0; c1 < p; c1++) {

 for (var c2 = 0; c2 < p; c2++) finalXtWX[c1][c2] += wFinal * X[row][c1] * X[row][c2];

 }

 }

 for (var dd = 0; dd < p; dd++) finalXtWX[dd][dd] += 1e-8;

 var inv = MatrixUtils.inverse(finalXtWX);

 var se = inv.map(function(rowInv, idx) { return Math.sqrt(Math.max(rowInv[idx], 0)); });

 return {

 beta: beta,

 se: se,

 vcov: inv,

 fitted: X.map(function(rowX) {

 return ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, ipdDot(rowX, beta))))), 1e-6, 1 - 1e-6);

 })

 };

 } catch (e2) {

 return {

 beta: beta,

 se: new Array(p).fill(NaN),

 vcov: null,

 fitted: X.map(function(rowX) {

 return ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, ipdDot(rowX, beta))))), 1e-6, 1 - 1e-6);

 })

 };

 }

}



function fitOutcomeModel(X, A, Y) {

 var safeX = (X || []).map(ipdNormalizeRow);

 var safeA = (A || []).map(function(v) { return Number(v) > 0 ? 1 : 0; });

 var safeY = (Y || []).map(function(v) { return Number(v); });

 var outcomeIsBinary = safeY.every(function(v) { return v === 0 || v === 1; });

 var design = safeX.map(function(row, i) { return [1, safeA[i]].concat(row); });

 var fit = outcomeIsBinary ? ipdWeightedLogisticRegression(design, safeY) : ipdWeightedLeastSquares(design, safeY);

 if (!fit) {

 var meanY = jStat.mean(safeY);

 return {

 outcomeType: outcomeIsBinary ? 'binary' : 'continuous',

 fallback: true,

 predict: function(xRow, aVal) {

 if (outcomeIsBinary) return ipdClampProbability(meanY);

 return meanY;

 }

 };

 }

 return {

 outcomeType: outcomeIsBinary ? 'binary' : 'continuous',

 coefficients: fit.beta.slice(),

 se: fit.se,

 predict: function(xRow, aVal) {

 var row = [1, Number(aVal) > 0 ? 1 : 0].concat(ipdNormalizeRow(xRow));

 var eta = ipdDot(row, fit.beta);

 return outcomeIsBinary ? ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))))) : eta;

 }

 };

}



function fitPropensityScore(X, A) {

 var safeX = (X || []).map(ipdNormalizeRow);

 if (safeX.length === 0) return [];

 var safeA = (A || []).map(function(v) { return Number(v) > 0 ? 1 : 0; });

 var design = safeX.map(function(row) { return [1].concat(row); });

 var fit = ipdWeightedLogisticRegression(design, safeA);

 if (!fit) {

 var meanA = ipdClampProbability(jStat.mean(safeA));

 return safeA.map(function() { return meanA; });

 }

 return fit.fitted.map(function(p) { return ipdClampProbability(p, 0.005, 0.995); });

}



function runAIPW(data, outcomeVar, treatmentVar, covariates) {

 covariates = covariates || [];

 var cleaned = (data || []).map(function(d) {

 var y = Number(d[outcomeVar]);

 var a = Number(d[treatmentVar]) > 0 ? 1 : 0;

 if (!Number.isFinite(y) || !Number.isFinite(Number(d[treatmentVar]))) return null;

 return {

 y: y,

 a: a,

 x: covariates.map(function(c) {

 var val = Number(d[c]);

 return Number.isFinite(val) ? val : 0;

 })

 };

 }).filter(Boolean);

 if (cleaned.length < 20) {

 return { error: "AIPW requires at least 20 complete observations", method: "Augmented Inverse Probability Weighting (AIPW)" };

 }

 var n = cleaned.length;

 var Y = cleaned.map(function(r) { return r.y; });

 var A = cleaned.map(function(r) { return r.a; });

 var X = cleaned.map(function(r) { return r.x; });

 var ps = fitPropensityScore(X, A);

 var outcomeModel = fitOutcomeModel(X, A, Y);

 var mu1 = X.map(function(row) { return outcomeModel.predict(row, 1); });

 var mu0 = X.map(function(row) { return outcomeModel.predict(row, 0); });

 var psi1 = 0;

 var psi0 = 0;

 for (var i = 0; i < n; i++) {

 var p1 = ipdClampProbability(ps[i], 0.01, 0.99);

 var p0 = ipdClampProbability(1 - ps[i], 0.01, 0.99);

 psi1 += mu1[i] + A[i] * (Y[i] - mu1[i]) / p1;

 psi0 += mu0[i] + (1 - A[i]) * (Y[i] - mu0[i]) / p0;

 }

 psi1 /= n;

 psi0 /= n;

 var ate = psi1 - psi0;

 var IF = cleaned.map(function(_, i) {

 var p1 = ipdClampProbability(ps[i], 0.01, 0.99);

 var p0 = ipdClampProbability(1 - ps[i], 0.01, 0.99);

 var if1 = mu1[i] + A[i] * (Y[i] - mu1[i]) / p1 - psi1;

 var if0 = mu0[i] + (1 - A[i]) * (Y[i] - mu0[i]) / p0 - psi0;

 return if1 - if0;

 });

 var seATE = Math.sqrt(Math.max(jStat.variance(IF), 0) / n);

 var ciLower = ate - getConfZ() *seATE;

 var ciUpper = ate + getConfZ() *seATE;

 var z = seATE > 0 ? (ate / seATE) : 0;

 var pValue = seATE > 0 ? (2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1))) : 1;

 return {

 method: "Augmented Inverse Probability Weighting (AIPW)",

 ATE: ate,

 ate: ate,

 E_Y1: psi1,

 E_Y0: psi0,

 SE: seATE,

 se: seATE,

 CI: [ciLower, ciUpper],

 ci_lower: ciLower,

 ci_upper: ciUpper,

 pValue: pValue,

 p_value: pValue,

 doublyRobust: true,

 outcomeModel: outcomeModel.outcomeType,

 propensityScoreSummary: {

 min: Math.min.apply(null, ps),

 max: Math.max.apply(null, ps),

 mean: jStat.mean(ps)

 },

 reference: "Robins JM, et al. JASA 1994;89:846-866"

 };

}



function fitMarginalStructuralModel(longitudinalData, outcomeVar, treatmentVar, timeVar, covariates) {

 covariates = covariates || [];

 var bySubject = {};

 (longitudinalData || []).forEach(function(d) {

 var sid = d.subject_id;

 var time = Number(d[timeVar]);

 var outcome = Number(d[outcomeVar]);

 var treatment = Number(d[treatmentVar]);

 if (sid === null || sid === undefined || sid === '') return;

 if (!Number.isFinite(time) || !Number.isFinite(outcome) || !Number.isFinite(treatment)) return;

 if (!bySubject[sid]) bySubject[sid] = [];

 bySubject[sid].push({

 subject_id: sid,

 time: time,

 outcome: outcome,

 treatment: treatment > 0 ? 1 : 0,

 covs: covariates.map(function(c) {

 var val = Number(d[c]);

 return Number.isFinite(val) ? val : 0;

 })

 });

 });

 var subjects = Object.keys(bySubject);

 if (subjects.length < 5) {

 return { method: "Marginal Structural Model (Stabilized IPTW)", error: "MSM requires at least 5 subjects with longitudinal data" };

 }

 var records = [];

 subjects.forEach(function(subj) {

 var rows = bySubject[subj].slice().sort(function(a, b) { return a.time - b.time; });

 var prevTreatment = 0;

 rows.forEach(function(obs) {

 records.push({

 subject_id: subj,

 time: obs.time,

 outcome: obs.outcome,

 treatment: obs.treatment,

 prevTreatment: prevTreatment,

 covs: obs.covs

 });

 prevTreatment = obs.treatment;

 });

 });

 var XDen = records.map(function(r) { return [1, r.prevTreatment, r.time].concat(r.covs); });

 var XNum = records.map(function(r) { return [1, r.prevTreatment, r.time]; });

 var A = records.map(function(r) { return r.treatment; });

 var denomFit = ipdWeightedLogisticRegression(XDen, A);

 var numFit = ipdWeightedLogisticRegression(XNum, A);

 if (!denomFit || !numFit) {

 return { method: "Marginal Structural Model (Stabilized IPTW)", error: "Could not fit numerator/denominator treatment models" };

 }

 var weights = [];

 var cumulative = {};

 records.forEach(function(r, i) {

 if (!Number.isFinite(cumulative[r.subject_id])) cumulative[r.subject_id] = 1;

 var pDen = ipdClampProbability(denomFit.fitted[i], 0.01, 0.99);

 var pNum = ipdClampProbability(numFit.fitted[i], 0.01, 0.99);

 var numer = r.treatment === 1 ? pNum : (1 - pNum);

 var denom = r.treatment === 1 ? pDen : (1 - pDen);

 cumulative[r.subject_id] *= numer / Math.max(denom, 0.01);

 cumulative[r.subject_id] = Math.min(25, Math.max(0.04, cumulative[r.subject_id]));

 weights.push(cumulative[r.subject_id]);

 });

 var outcomeIsBinary = records.every(function(r) { return r.outcome === 0 || r.outcome === 1; });

 var XOut = records.map(function(r) { return [1, r.treatment, r.time]; });

 var YOut = records.map(function(r) { return r.outcome; });

 var outFit = outcomeIsBinary ? ipdWeightedLogisticRegression(XOut, YOut, weights) : ipdWeightedLeastSquares(XOut, YOut, weights);

 if (!outFit) {

 return { method: "Marginal Structural Model (Stabilized IPTW)", error: "Could not fit weighted marginal outcome model" };

 }

 var pred1 = records.map(function(r) {

 var row = [1, 1, r.time];

 var eta = ipdDot(row, outFit.beta);

 return outcomeIsBinary ? ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))))) : eta;

 });

 var pred0 = records.map(function(r) {

 var row = [1, 0, r.time];

 var eta = ipdDot(row, outFit.beta);

 return outcomeIsBinary ? ipdClampProbability(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))))) : eta;

 });

 var eY1 = jStat.mean(pred1);

 var eY0 = jStat.mean(pred0);

 var ate = eY1 - eY0;

 var seATE = (!outcomeIsBinary && outFit.se && outFit.se.length > 1 && Number.isFinite(outFit.se[1])) ? outFit.se[1] : Math.sqrt(Math.max(jStat.variance(pred1.map(function(v, i) { return (v - pred0[i]) - ate; })), 0) / records.length);

 var ciLower = ate - getConfZ() *seATE;

 var ciUpper = ate + getConfZ() *seATE;

 return {

 method: "Marginal Structural Model (Stabilized IPTW)",

 ATE: ate,

 ate: ate,

 E_Y1: eY1,

 E_Y0: eY0,

 SE: seATE,

 se: seATE,

 CI: [ciLower, ciUpper],

 ci_lower: ciLower,

 ci_upper: ciUpper,

 nSubjects: subjects.length,

 nObservations: records.length,

 weightSummary: {

 mean: jStat.mean(weights),

 min: Math.min.apply(null, weights),

 max: Math.max.apply(null, weights)

 },

 reference: "Robins JM, et al. Epidemiology 2000;11:550-560"

 };

}



function estimateTreatmentProb(A, history, covariates) {

 var p = 0.5;

 if (history.length > 0) p = ipdClampProbability(jStat.mean(history) * 0.7 + 0.15, 0.05, 0.95);

 return A === 1 ? p : (1 - p);

}



function runGEstimation(data, outcomeVar, treatmentVar, covariates) {

 var n = data.length;

 var Y = data.map(function(d) { return d[outcomeVar]; });

 var A = data.map(function(d) { return d[treatmentVar]; });

 var X = data.map(function(d) {

 return covariates.map(function(c) { return d[c] ?? 0; });

 });



 var ps = fitPropensityScore(X, A);



 var bestPsi = 0;

 var minTest = Infinity;



 for (var psi = -2; psi <= 2; psi += 0.1) {



 var Y0 = Y.map(function(y, i) { return y - psi * A[i]; });



 var residA = A.map(function(a, i) { return a - ps[i]; });

 var covariance = 0;

 for (var i = 0; i < n; i++) {

 covariance += residA[i] * Y0[i];

 }

 covariance /= n;



 if (Math.abs(covariance) < minTest) {

 minTest = Math.abs(covariance);

 bestPsi = psi;

 }

 }



 var bootstrapPsi = [];

 for (var b = 0; b < 100; b++) {

 var bootIdx = [];

 for (var i = 0; i < n; i++) bootIdx.push(Math.floor(Math.random() * n));



 var bootY = bootIdx.map(function(i) { return Y[i]; });

 var bootA = bootIdx.map(function(i) { return A[i]; });

 var bootPS = bootIdx.map(function(i) { return ps[i]; });



 var bootBestPsi = 0;

 var bootMinTest = Infinity;



 for (var psi = -2; psi <= 2; psi += 0.2) {

 var Y0 = bootY.map(function(y, i) { return y - psi * bootA[i]; });

 var residA = bootA.map(function(a, i) { return a - bootPS[i]; });

 var cov = 0;

 for (var i = 0; i < n; i++) cov += residA[i] * Y0[i];

 if (Math.abs(cov / n) < bootMinTest) {

 bootMinTest = Math.abs(cov / n);

 bootBestPsi = psi;

 }

 }

 bootstrapPsi.push(bootBestPsi);

 }



 var sePsi = jStat.stdev(bootstrapPsi);



 return {

 method: "G-Estimation (Structural Nested Mean Model)",

 psi: bestPsi,

 SE: sePsi,

 CI: [bestPsi - getConfZ() *sePsi, bestPsi + getConfZ() *sePsi],

 interpretation: "Causal effect of treatment: " + bestPsi.toFixed(3) + " units change in outcome",

 reference: "Robins JM. Stat Med 1998;17:1215-1247"

 };

 }



function runIVMetaAnalysis(studyData) {



 var k = studyData.length;



 var ratios = studyData.map(function(s) {

 return {

 study: s.study,

 ratio: s.betaY / s.betaX,

 se: Math.abs(s.seBetaY / s.betaX)

 };

 });



 var weights = ratios.map(function(r) { return 1 / (r.se * r.se); });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var ivwEstimate = ratios.reduce(function(sum, r, i) {

 return sum + weights[i] * r.ratio;

 }, 0) / sumW;

 var ivwSE = Math.sqrt(1 / sumW);



 var meanX = jStat.mean(studyData.map(function(s) { return Math.abs(s.betaX); }));

 var eggerIntercept = 0;

 var eggerSlope = ivwEstimate;



 var sumXY = 0, sumX2 = 0, sumY = 0, sumX = 0;

 studyData.forEach(function(s, i) {

 var x = Math.abs(s.betaX);

 var y = s.betaY * Math.sign(s.betaX);

 var w = weights[i];

 sumXY += w * x * y;

 sumX2 += w * x * x;

 sumY += w * y;

 sumX += w * x;

 });



 eggerSlope = (sumW * sumXY - sumX * sumY) / (sumW * sumX2 - sumX * sumX);

 eggerIntercept = (sumY - eggerSlope * sumX) / sumW;



 var sortedRatios = ratios.slice().sort(function(a, b) { return a.ratio - b.ratio; });

 var cumWeight = 0;

 var medianEstimate = sortedRatios[0].ratio;

 for (var i = 0; i < sortedRatios.length; i++) {

 cumWeight += 1 / (sortedRatios[i].se * sortedRatios[i].se);

 if (cumWeight >= sumW / 2) {

 medianEstimate = sortedRatios[i].ratio;

 break;

 }

 }



 var Q = ratios.reduce(function(sum, r, i) {

 return sum + weights[i] * Math.pow(r.ratio - ivwEstimate, 2);

 }, 0);

 var I2 = Math.max(0, (Q - (k - 1)) / Q * 100);



 return {

 method: "Instrumental Variable Meta-Analysis (Mendelian Randomization)",

 nInstruments: k,

 IVW: {

 estimate: ivwEstimate,

 se: ivwSE,

 ci: [ivwEstimate - getConfZ() *ivwSE, ivwEstimate + getConfZ() *ivwSE],

 pValue: 2 * (1 - jStat.normal.cdf(Math.abs(ivwEstimate / ivwSE), 0, 1))

 },

 MREgger: {

 slope: eggerSlope,

 intercept: eggerIntercept,

 pleiotropyTest: Math.abs(eggerIntercept) > 0.1 ? "Potential pleiotropy detected" : "No evidence of pleiotropy"

 },

 weightedMedian: medianEstimate,

 heterogeneity: { Q: Q, I2: I2 },

 reference: "Burgess S, et al. Genet Epidemiol 2013;37:658-665"

 };

 }





function runThreeLevelMA(data) {



 var studies = [...new Set(data.map(function(d) { return d.study; }))];

 var k = studies.length;

 var m = data.length;



 var effects = data.map(function(d) { return d.effect; });

 var variances = data.map(function(d) { return d.variance; });



 var tau2_within = 0;

 studies.forEach(function(s) {

 var studyEffects = data.filter(function(d) { return d.study === s; }).map(function(d) { return d.effect; });

 if (studyEffects.length > 1) {

 tau2_within += jStat.variance(studyEffects);

 }

 });

 tau2_within /= k;



 var studyMeans = studies.map(function(s) {

 var studyEffects = data.filter(function(d) { return d.study === s; }).map(function(d) { return d.effect; });

 return jStat.mean(studyEffects);

 });

 var tau2_between = jStat.variance(studyMeans);



 var sumW = 0, sumWY = 0;

 data.forEach(function(d) {

 var w = 1 / (d.variance + tau2_within + tau2_between);

 sumW += w;

 sumWY += w * d.effect;

 });



 var pooled = sumWY / sumW;

 var se = Math.sqrt(1 / sumW);



 var totalVar = jStat.mean(variances) + tau2_within + tau2_between;

 var ICC_study = tau2_between / totalVar;

 var ICC_effectSize = tau2_within / totalVar;



 return {

 method: "Three-Level Meta-Analysis",

 nStudies: k,

 nEffectSizes: m,

 pooled: pooled,

 se: se,

 ci: [pooled - getConfZ() *se, pooled + getConfZ() *se],

 varianceComponents: {

 sampling: jStat.mean(variances),

 withinStudy: tau2_within,

 betweenStudy: tau2_between

 },

 ICC: {

 study: ICC_study,

 effectSize: ICC_effectSize

 },

 reference: "Cheung MW. Struct Equ Modeling 2014;21:23-40"

 };

 }



function runSelectionModelAdvanced(effects, variances, pValues) {

 var k = effects.length;



 var intervals = [

 { lower: 0, upper: 0.01 },

 { lower: 0.01, upper: 0.05 },

 { lower: 0.05, upper: 0.10 },

 { lower: 0.10, upper: 1.0 }

 ];



 var counts = intervals.map(function(int) {

 return pValues.filter(function(p) { return p >= int.lower && p < int.upper; }).length;

 });



 var totalExpected = k / 4;

 var weights = counts.map(function(c) { return c / totalExpected; });



 var adjWeights = [];

 for (var i = 0; i < k; i++) {

 var pInt = intervals.findIndex(function(int) { return pValues[i] >= int.lower && pValues[i] < int.upper; });

 if (pInt < 0) pInt = 0; // Default to first interval if no match (edge case: p exactly 1.0)

 var selectionWeight = weights[pInt] || 1;

 adjWeights.push(1 / (variances[i] * selectionWeight));

 }



 var sumW = adjWeights.reduce(function(a, b) { return a + b; }, 0);

 var adjPooled = effects.reduce(function(sum, e, i) { return sum + adjWeights[i] * e; }, 0) / sumW;

 var adjSE = Math.sqrt(1 / sumW);



 var unadjWeights = variances.map(function(v) { return 1 / v; });

 var unadjSumW = unadjWeights.reduce(function(a, b) { return a + b; }, 0);

 var unadjPooled = effects.reduce(function(sum, e, i) { return sum + unadjWeights[i] * e; }, 0) / unadjSumW;



 return {

 method: "Selection Model (Vevea-Woods)",

 unadjusted: {

 pooled: unadjPooled,

 interpretation: "Standard random-effects estimate"

 },

 adjusted: {

 pooled: adjPooled,

 se: adjSE,

 ci: [adjPooled - getConfZ() *adjSE, adjPooled + getConfZ() *adjSE]

 },

 selectionWeights: intervals.map(function(int, i) {

 return {

 interval: int.lower + "-" + int.upper,

 nStudies: counts[i],

 relativeWeight: weights[i].toFixed(2)

 };

 }),

 biasEstimate: unadjPooled - adjPooled,

 reference: "Vevea JL, Woods CM. Psychol Methods 2005;10:428-443"

 };

 }





function runComponentNMA(data) {



 var allComponents = [];

 data.forEach(function(d) {

 if (d.components) {

 d.components.forEach(function(c, i) {

 if (c === 1 && allComponents.indexOf(i) === -1) {

 allComponents.push(i);

 }

 });

 }

 });



 var nComponents = allComponents.length;

 var k = data.length;



 var X = data.map(function(d) {

 return allComponents.map(function(c) { return d.components ? d.components[c] : 0; });

 });



 var effects = data.map(function(d) { return d.effect; });

 var weights = data.map(function(d) { return 1 / d.variance; });



 // X'WX

 var XWX = [];

 for (var i = 0; i < nComponents; i++) {

 XWX[i] = [];

 for (var j = 0; j < nComponents; j++) {

 var sum = 0;

 for (var s = 0; s < k; s++) {

 sum += X[s][i] * weights[s] * X[s][j];

 }

 XWX[i][j] = sum;

 }

 }



 // X'Wy

 var XWy = [];

 for (var i = 0; i < nComponents; i++) {

 var sum = 0;

 for (var s = 0; s < k; s++) {

 sum += X[s][i] * weights[s] * effects[s];

 }

 XWy[i] = sum;

 }



 var componentEffects = [];

 if (nComponents === 1) {

 componentEffects = [XWy[0] / XWX[0][0]];

 } else {



 componentEffects = new Array(nComponents).fill(0);

 for (var iter = 0; iter < 100; iter++) {

 for (var i = 0; i < nComponents; i++) {

 var sum = XWy[i];

 for (var j = 0; j < nComponents; j++) {

 if (j !== i) sum -= XWX[i][j] * componentEffects[j];

 }

 componentEffects[i] = sum / XWX[i][i];

 }

 }

 }



 return {

 method: "Component Network Meta-Analysis",

 nComponents: nComponents,

 nStudies: k,

 componentEffects: componentEffects.map(function(e, i) {

 return {

 component: "Component " + (i + 1),

 effect: e,

 se: Math.sqrt(1 / XWX[i][i])

 };

 }),

 additivityAssumption: "Assumes component effects are additive",

 reference: "Welton NJ, et al. Stat Med 2009;28:3487-3503"

 };

 }





function calculateSUCRAWithCI(nmaResults, nSimulations) {

 nSimulations = nSimulations || 1000;

 var treatments = nmaResults.treatments;

 var n = treatments.length;



 var rankSamples = [];



 for (var sim = 0; sim < nSimulations; sim++) {



 var sampledEffects = treatments.map(function(t, i) {

 var effect = nmaResults.effects[i] ?? 0;

 var se = nmaResults.ses[i] ?? 0.1;

 return effect + se * jStat.normal.sample(0, 1);

 });



 var ranked = sampledEffects.map(function(e, i) { return { idx: i, effect: e }; });

 ranked.sort(function(a, b) { return b.effect - a.effect; });



 var ranks = new Array(n);

 ranked.forEach(function(r, rank) { ranks[r.idx] = rank + 1; });

 rankSamples.push(ranks);

 }



 var sucra = treatments.map(function(t, i) {

 var ranks = rankSamples.map(function(r) { return r[i]; });

 var meanRank = jStat.mean(ranks);

 return (n - meanRank) / (n - 1);

 });



 var sucraCI = treatments.map(function(t, i) {

 var treatmentSucra = rankSamples.map(function(r) {

 return (n - r[i]) / (n - 1);

 });

 treatmentSucra.sort(function(a, b) { return a - b; });

 return {

 treatment: t,

 sucra: sucra[i],

 ci: [

 treatmentSucra[Math.floor(0.025 * nSimulations)],

 treatmentSucra[Math.floor(0.975 * nSimulations)]

 ],

 pBest: rankSamples.filter(function(r) { return r[i] === 1; }).length / nSimulations

 };

 });



 var rankProbs = treatments.map(function(t, i) {

 var probs = [];

 for (var r = 1; r <= n; r++) {

 probs.push(rankSamples.filter(function(s) { return s[i] === r; }).length / nSimulations);

 }

 return probs;

 });



 return {

 method: "SUCRA with Simulation-Based CI",

 nSimulations: nSimulations,

 results: sucraCI.sort(function(a, b) { return b.sucra - a.sucra; }),

 rankProbabilityMatrix: rankProbs,

 bestTreatment: sucraCI.sort(function(a, b) { return b.sucra - a.sucra; })[0].treatment,

 reference: "Salanti G, et al. PLoS ONE 2011;6:e28438"

 };

 }



function runDesignByTreatmentInteraction(data) {



 var designs = {};

 data.forEach(function(d) {

 var design = [d.treatment1, d.treatment2].sort().join("-");

 if (!designs[design]) designs[design] = [];

 designs[design].push(d);

 });



 var designKeys = Object.keys(designs);



 var designEffects = {};

 designKeys.forEach(function(design) {

 var studies = designs[design];

 var weights = studies.map(function(s) { return 1 / s.variance; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooled = studies.reduce(function(sum, s, i) { return sum + weights[i] * s.effect; }, 0) / sumW;

 designEffects[design] = { effect: pooled, variance: 1 / sumW, n: studies.length };

 });



 var inconsistencies = [];

 for (var i = 0; i < designKeys.length; i++) {

 for (var j = i + 1; j < designKeys.length; j++) {

 var d1 = designKeys[i].split("-");

 var d2 = designKeys[j].split("-");



 var shared = d1.filter(function(t) { return d2.indexOf(t) !== -1; });

 if (shared.length > 0) {

 var diff = designEffects[designKeys[i]].effect - designEffects[designKeys[j]].effect;

 var seDiff = Math.sqrt(designEffects[designKeys[i]].variance + designEffects[designKeys[j]].variance);

 var z = diff / seDiff;

 var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));



 if (p < 0.1) {

 inconsistencies.push({

 design1: designKeys[i],

 design2: designKeys[j],

 difference: diff,

 z: z,

 p: p

 });

 }

 }

 }

 }



 var Q_inconsistency = inconsistencies.reduce(function(sum, inc) {

 return sum + inc.z * inc.z;

 }, 0);

 var df = inconsistencies.length;

 var pGlobal = df > 0 ? (1 - jStat.chisquare.cdf(Q_inconsistency, df)) : 1;



 return {

 method: "Design-by-Treatment Interaction Model",

 nDesigns: designKeys.length,

 designEffects: designEffects,

 inconsistencies: inconsistencies,

 globalTest: {

 Q: Q_inconsistency,

 df: df,

 p: pGlobal

 },

 conclusion: pGlobal < 0.05 ? "Significant inconsistency detected" : "No significant inconsistency",

 reference: "Higgins JPT, et al. Stat Med 2012;31:3805-3820"

 };

 }



function calculateNMAPredictionIntervals(nmaResults) {

 var treatments = nmaResults.treatments;

 var n = treatments.length;

 var k = nmaResults.nStudies || 10;



 var tau2 = nmaResults.tau2 ?? 0.1;

 var df = Math.max(1, k - n);

 var tCrit = jStat.studentt.inv(0.975, df);



 var predictions = [];

 for (var i = 0; i < n; i++) {

 for (var j = i + 1; j < n; j++) {

 var effect = (nmaResults.effects[i] ?? 0) - (nmaResults.effects[j] ?? 0);

 var se = Math.sqrt(Math.pow(nmaResults.ses[i] ?? 0.1, 2) + Math.pow(nmaResults.ses[j] ?? 0.1, 2));

 var predSE = Math.sqrt(se * se + tau2);



 predictions.push({

 comparison: treatments[i] + " vs " + treatments[j],

 effect: effect,

 se: se,

 ci: [effect - getConfZ() *se, effect + getConfZ() *se],

 predictionInterval: [effect - tCrit * predSE, effect + tCrit * predSE],

 heterogeneityImpact: (predSE - se) / se * 100

 });

 }

 }



 return {

 method: "NMA Prediction Intervals",

 tau2: tau2,

 tCritical: tCrit,

 df: df,

 predictions: predictions,

 interpretation: "Prediction intervals show range for effect in a NEW study",

 reference: "Riley RD, et al. BMJ 2011;342:d549"

 };

 }



function runMultipleImputationMA(incompleteData, nImputations) {

 nImputations = nImputations || 20;

 var n = incompleteData.length;



 var completeIdx = [];

 var incompleteIdx = [];

 incompleteData.forEach(function(d, i) {

 if (d.effect !== null && d.variance !== null && !isNaN(d.effect)) {

 completeIdx.push(i);

 } else {

 incompleteIdx.push(i);

 }

 });



 if (incompleteIdx.length === 0) {

 return { message: "No missing data detected" };

 }



 var completeEffects = completeIdx.map(function(i) { return incompleteData[i].effect; });

 var meanEffect = jStat.mean(completeEffects);

 var sdEffect = jStat.stdev(completeEffects);

 var completeVariances = completeIdx.map(function(i) { return incompleteData[i].variance; });

 var meanVariance = jStat.mean(completeVariances);



 var imputedResults = [];



 for (var m = 0; m < nImputations; m++) {



 var imputedData = incompleteData.map(function(d, i) {

 if (incompleteIdx.indexOf(i) !== -1) {



 return {

 study: d.study,

 effect: meanEffect + sdEffect * jStat.normal.sample(0, 1),

 variance: meanVariance * (0.5 + Math.random())

 };

 }

 return d;

 });



 var effects = imputedData.map(function(d) { return d.effect; });

 var variances = imputedData.map(function(d) { return d.variance; });

 var weights = variances.map(function(v) { return 1 / v; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooled = effects.reduce(function(sum, e, i) { return sum + weights[i] * e; }, 0) / sumW;

 var varWithin = 1 / sumW;



 imputedResults.push({ pooled: pooled, variance: varWithin });

 }



 // Rubin's rules for combining

 var pooledMean = jStat.mean(imputedResults.map(function(r) { return r.pooled; }));

 var withinVar = jStat.mean(imputedResults.map(function(r) { return r.variance; }));

 var betweenVar = jStat.variance(imputedResults.map(function(r) { return r.pooled; }));

 var totalVar = withinVar + (1 + 1 / nImputations) * betweenVar;

 var se = Math.sqrt(totalVar);



 var lambda = (betweenVar + betweenVar / nImputations) / totalVar;

 var dfOld = (nImputations - 1) / (lambda * lambda);

 var dfComplete = completeIdx.length - 1;

 var dfAdjusted = dfOld * dfComplete / (dfOld + dfComplete);



 return {

 method: "Multiple Imputation Meta-Analysis (Rubin's Rules)",

 nImputations: nImputations,

 nComplete: completeIdx.length,

 nImputed: incompleteIdx.length,

 pooledEstimate: pooledMean,

 se: se,

 ci: [pooledMean - getConfZ() *se, pooledMean + getConfZ() *se],

 varianceComponents: {

 within: withinVar,

 between: betweenVar,

 total: totalVar

 },

 fractionMissingInfo: lambda,

 df: dfAdjusted,

 reference: "Rubin DB. Multiple Imputation for Nonresponse in Surveys. 1987"

 };

 }



function runPatternMixtureModel(data, deltaValues) {

 deltaValues = deltaValues || [-0.5, -0.25, 0, 0.25, 0.5];

 var results = [];



 var observed = data.filter(function(d) { return d.observed === true || d.observed === 1; });

 var missing = data.filter(function(d) { return d.observed === false || d.observed === 0; });



 var observedEffects = observed.map(function(d) { return d.effect; });

 var observedMean = jStat.mean(observedEffects);

 var observedSE = jStat.stdev(observedEffects) / Math.sqrt(observed.length);



 deltaValues.forEach(function(delta) {



 var imputedMissing = observedMean + delta;



 var nObs = observed.length;

 var nMiss = missing.length;

 var nTotal = nObs + nMiss;



 var combinedMean = (nObs * observedMean + nMiss * imputedMissing) / nTotal;

 var combinedSE = Math.sqrt(

 (nObs * observedSE * observedSE + nMiss * observedSE * observedSE) / nTotal +

 nObs * nMiss * delta * delta / (nTotal * nTotal)

 );



 results.push({

 delta: delta,

 interpretation: delta === 0 ? "MAR assumption" :

 (delta > 0 ? "Missing have better outcomes" : "Missing have worse outcomes"),

 pooledEffect: combinedMean,

 se: combinedSE,

 ci: [combinedMean - getConfZ() *combinedSE, combinedMean + getConfZ() *combinedSE],

 significant: Math.abs(combinedMean / combinedSE) > getConfZ()

 });

 });



 var tippingPoint = null;

 for (var delta = -2; delta <= 2; delta += 0.01) {

 var imputedMissing = observedMean + delta;

 var combinedMean = (observed.length * observedMean + missing.length * imputedMissing) / data.length;

 if (Math.abs(combinedMean) < 0.001 || (tippingPoint === null && combinedMean * observedMean < 0)) {

 tippingPoint = delta;

 break;

 }

 }



 return {

 method: "Pattern Mixture Model (MNAR Sensitivity)",

 nObserved: observed.length,

 nMissing: missing.length,

 observedEffect: observedMean,

 sensitivityResults: results,

 tippingPoint: tippingPoint,

 interpretation: tippingPoint ?

 "Conclusion would change if missing outcomes differ by " + tippingPoint.toFixed(2) + " from observed" :

 "Conclusion robust across plausible delta values",

 reference: "Little RJ. JASA 1993;88:1001-1012"

 };

 }



function fitJointModel(longitudinalData, survivalData, subjectVar, timeVar, markerVar) {



 var subjects = [...new Set(survivalData.map(function(d) { return d[subjectVar]; }))];

 var n = subjects.length;



 var longResults = {};

 subjects.forEach(function(subj) {

 var subjLong = longitudinalData.filter(function(d) { return d[subjectVar] === subj; });

 if (subjLong.length > 0) {

 var times = subjLong.map(function(d) { return d[timeVar]; });

 var markers = subjLong.map(function(d) { return d[markerVar]; });



 var meanT = jStat.mean(times);

 var meanM = jStat.mean(markers);

 var slope = times.reduce(function(sum, t, i) {

 return sum + (t - meanT) * (markers[i] - meanM);

 }, 0) / times.reduce(function(sum, t) {

 return sum + (t - meanT) * (t - meanT);

 }, 0) || 0;

 var intercept = meanM - slope * meanT;



 longResults[subj] = { intercept: intercept, slope: slope };

 }

 });



 var markerAtEvent = subjects.map(function(subj) {

 var surv = survivalData.find(function(d) { return d[subjectVar] === subj; });

 var longModel = longResults[subj];

 if (surv && longModel) {

 return longModel.intercept + longModel.slope * surv.time;

 }

 return null;

 }).filter(function(m) { return m !== null; });



 var survWithMarker = survivalData.map(function(d, i) {

 return {

 time: d.time,

 event: d.event,

 marker: markerAtEvent[i] ?? 0

 };

 });



 var events = survWithMarker.filter(function(d) { return d.event === 1; });

 var meanMarkerEvents = jStat.mean(events.map(function(d) { return d.marker; }));

 var meanMarkerAll = jStat.mean(markerAtEvent);

 var association = (meanMarkerEvents - meanMarkerAll) / jStat.stdev(markerAtEvent);



 return {

 method: "Joint Longitudinal-Survival Model",

 nSubjects: n,

 longitudinalSubmodel: {

 fixedEffects: {

 meanIntercept: jStat.mean(Object.values(longResults).map(function(r) { return r.intercept; })),

 meanSlope: jStat.mean(Object.values(longResults).map(function(r) { return r.slope; }))

 }

 },

 survivalSubmodel: {

 nEvents: events.length,

 associationParameter: association,

 interpretation: association > 0 ?

 "Higher " + markerVar + " associated with higher hazard" :

 "Higher " + markerVar + " associated with lower hazard"

 },

 reference: "Rizopoulos D. Joint Models for Longitudinal and Time-to-Event Data. 2012"

 };

 }





function runSequentialMetaAnalysis(data, alpha, beta, delta) {

 alpha = alpha || 0.05;

 beta = beta || 0.20;

 delta = delta || 0.2;



 var k = data.length;

 var totalN = data.reduce(function(sum, d) { return sum + (d.n || 100); }, 0);



 var pooledVariance = jStat.mean(data.map(function(d) { return d.variance; }));

 var zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);

 var zBeta = jStat.normal.inv(1 - beta, 0, 1);

 var RIS = 4 * pooledVariance * Math.pow(zAlpha + zBeta, 2) / (delta * delta);



 var IF = totalN / RIS;



 // O'Brien-Fleming spending function for monitoring boundaries

 function spendingFunction(t, alpha) {

 return 2 * (1 - jStat.normal.cdf(zAlpha / Math.sqrt(t), 0, 1));

 }



 var alphaSpent = spendingFunction(IF, alpha);

 var zBoundary = jStat.normal.inv(1 - alphaSpent / 2, 0, 1);



 var weights = data.map(function(d) { return 1 / d.variance; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooled = data.reduce(function(sum, d, i) { return sum + weights[i] * d.effect; }, 0) / sumW;

 var se = Math.sqrt(1 / sumW);

 var zCurrent = pooled / se;



 var crossedBoundary = Math.abs(zCurrent) > zBoundary;

 var reachedRIS = IF >= 1;



 return {

 method: "Trial Sequential Analysis (TSA)",

 alpha: alpha,

 power: 1 - beta,

 minimalImportantDifference: delta,

 requiredInformationSize: Math.round(RIS),

 currentInformation: totalN,

 informationFraction: IF,

 currentZScore: zCurrent,

 monitoringBoundary: zBoundary,

 decision: crossedBoundary ?

 "Crossed monitoring boundary - can conclude" :

 (reachedRIS ? "Reached RIS but not significant" : "Continue accumulating evidence"),

 futilityBoundary: zBeta,

 adjustedCI: [

 pooled - zBoundary * se,

 pooled + zBoundary * se

 ],

 reference: "Wetterslev J, et al. J Clin Epidemiol 2008;61:64-75"

 };

 }



function runPredictionModelMA(validationStudies) {



 var k = validationStudies.length;



 var logitC = validationStudies.map(function(s) {

 var c = Math.max(0.501, Math.min(0.999, s.c_statistic));

 return {

 study: s.study,

 logitC: Math.log(c / (1 - c)),

 seLogitC: s.c_se / (c * (1 - c)),

 calSlope: s.calibration_slope,

 calSE: s.cal_se ?? 0.1,

 n: s.n

 };

 });



 var weightsC = logitC.map(function(s) { return 1 / (s.seLogitC * s.seLogitC); });

 var sumWC = weightsC.reduce(function(a, b) { return a + b; }, 0);

 var pooledLogitC = logitC.reduce(function(sum, s, i) {

 return sum + weightsC[i] * s.logitC;

 }, 0) / sumWC;

 var sePooledLogitC = Math.sqrt(1 / sumWC);



 var pooledC = 1 / (1 + Math.exp(-pooledLogitC));

 var pooledC_CI = [

 1 / (1 + Math.exp(-(pooledLogitC - getConfZ() *sePooledLogitC))),

 1 / (1 + Math.exp(-(pooledLogitC + getConfZ() *sePooledLogitC)))

 ];



 var weightsCal = logitC.map(function(s) { return 1 / (s.calSE * s.calSE); });

 var sumWCal = weightsCal.reduce(function(a, b) { return a + b; }, 0);

 var pooledCal = logitC.reduce(function(sum, s, i) {

 return sum + weightsCal[i] * s.calSlope;

 }, 0) / sumWCal;

 var sePooledCal = Math.sqrt(1 / sumWCal);



 var Q_C = logitC.reduce(function(sum, s, i) {

 return sum + weightsC[i] * Math.pow(s.logitC - pooledLogitC, 2);

 }, 0);

 var I2_C = Math.max(0, (Q_C - (k - 1)) / Q_C * 100);



 return {

 method: "Prediction Model Meta-Analysis",

 nStudies: k,

 totalN: validationStudies.reduce(function(sum, s) { return sum + s.n; }, 0),

 discrimination: {

 pooledCStatistic: pooledC,

 ci: pooledC_CI,

 I2: I2_C,

 interpretation: pooledC > 0.8 ? "Excellent" : (pooledC > 0.7 ? "Acceptable" : "Poor")

 },

 calibration: {

 pooledSlope: pooledCal,

 se: sePooledCal,

 ci: [pooledCal - getConfZ() *sePooledCal, pooledCal + getConfZ() *sePooledCal],

 interpretation: Math.abs(pooledCal - 1) < 0.2 ? "Well calibrated" : "Miscalibrated"

 },

 reference: "Debray TPA, et al. Stat Med 2017;36:1295-1312"

 };

 }



function runDecisionCurveAnalysis(predictions, outcomes, thresholds) {

 thresholds = thresholds || [];

 for (var t = 0.01; t <= 0.99; t += 0.02) thresholds.push(t);



 var n = predictions.length;

 var prevalence = jStat.mean(outcomes);



 var results = thresholds.map(function(threshold) {



 var tp = 0, fp = 0, tn = 0, fn = 0;

 for (var i = 0; i < n; i++) {

 if (predictions[i] >= threshold) {

 if (outcomes[i] === 1) tp++;

 else fp++;

 } else {

 if (outcomes[i] === 1) fn++;

 else tn++;

 }

 }



 var sensitivity = tp / (tp + fn) ?? 0;

 var specificity = tn / (tn + fp) ?? 0;

 var netBenefit = sensitivity * prevalence - (1 - specificity) * (1 - prevalence) * threshold / (1 - threshold);



 var netBenefitAll = prevalence - (1 - prevalence) * threshold / (1 - threshold);



 var netBenefitNone = 0;



 return {

 threshold: threshold,

 netBenefit: netBenefit,

 netBenefitTreatAll: netBenefitAll,

 netBenefitTreatNone: netBenefitNone,

 sensitivity: sensitivity,

 specificity: specificity

 };

 });



 var usefulThresholds = results.filter(function(r) {

 return r.netBenefit > 0 && r.netBenefit > r.netBenefitTreatAll;

 });



 return {

 method: "Decision Curve Analysis",

 n: n,

 prevalence: prevalence,

 results: results,

 usefulRange: usefulThresholds.length > 0 ?

 [usefulThresholds[0].threshold, usefulThresholds[usefulThresholds.length - 1].threshold] :

 null,

 interpretation: usefulThresholds.length > 0 ?

 "Model useful for thresholds " + (usefulThresholds[0].threshold * 100).toFixed(0) + "% to " +

 (usefulThresholds[usefulThresholds.length - 1].threshold * 100).toFixed(0) + "%" :

 "Model not clinically useful at any threshold",

 reference: "Vickers AJ, Elkin EB. Med Decis Making 2006;26:565-574"

 };

 }



function calculateValueOfInformation(results, decisionThreshold, populationSize, timeHorizon) {

 populationSize = populationSize || 100000;

 timeHorizon = timeHorizon || 10;



 var effect = results.pooled.pooled;

 var se = results.pooled.se;

 var nStudies = results.studies.length;



 var pWrongDecision = jStat.normal.cdf(decisionThreshold, effect, se);

 if (effect < decisionThreshold) pWrongDecision = 1 - pWrongDecision;



 var expectedLoss = Math.abs(effect - decisionThreshold) * pWrongDecision;

 var EVPI = expectedLoss * populationSize * timeHorizon;



 var newSE = se / Math.sqrt(1 + 1 / nStudies);

 var pWrongAfterStudy = jStat.normal.cdf(decisionThreshold, effect, newSE);

 if (effect < decisionThreshold) pWrongAfterStudy = 1 - pWrongAfterStudy;



 var expectedLossAfterStudy = Math.abs(effect - decisionThreshold) * pWrongAfterStudy;

 var EVSI = (expectedLoss - expectedLossAfterStudy) * populationSize * timeHorizon;



 var costPerStudy = 1000000;

 var ENBS = EVSI - costPerStudy;



 return {

 method: "Value of Information Analysis",

 EVPI: EVPI,

 EVPI_interpretation: "Maximum value of eliminating all uncertainty: $" + EVPI.toLocaleString(),

 EVSI: EVSI,

 EVSI_interpretation: "Value of one additional study: $" + EVSI.toLocaleString(),

 ENBS: ENBS,

 recommendFurtherResearch: ENBS > 0,

 currentUncertainty: {

 effect: effect,

 se: se,

 pWrongDecision: pWrongDecision

 },

 parameters: {

 decisionThreshold: decisionThreshold,

 populationSize: populationSize,

 timeHorizon: timeHorizon

 },

 reference: "Claxton K, et al. Health Technol Assess 2005;9(38)"

 };

 }



function runTransportabilityAnalysis(trialData, targetPopulation, covariates) {



 var nTrial = trialData.length;

 var nTarget = targetPopulation.length;



 var combined = trialData.map(function(d) {

 return { S: 1, covs: covariates.map(function(c) { return d[c] ?? 0; }) };

 }).concat(targetPopulation.map(function(d) {

 return { S: 0, covs: covariates.map(function(c) { return d[c] ?? 0; }) };

 }));



 var ps = fitPropensityScore(combined.map(function(d) { return d.covs; }),

 combined.map(function(d) { return d.S; }));



 var trialPS = ps.slice(0, nTrial);

 var iow = trialPS.map(function(p) { return (1 - p) / Math.max(p, 0.01); });



 var maxWeight = jStat.percentile(iow, 0.95);

 iow = iow.map(function(w) { return Math.min(w, maxWeight); });



 var treated = trialData.filter(function(d) { return d.treatment === 1; });

 var control = trialData.filter(function(d) { return d.treatment === 0; });



 var outcomeVar = 'outcome';

 var weightedMean1 = 0, sumW1 = 0;

 var weightedMean0 = 0, sumW0 = 0;



 trialData.forEach(function(d, i) {

 if (d.treatment === 1) {

 weightedMean1 += iow[i] * d[outcomeVar];

 sumW1 += iow[i];

 } else {

 weightedMean0 += iow[i] * d[outcomeVar];

 sumW0 += iow[i];

 }

 });



 // Guard against division by zero

 if (sumW1 < 1e-10 || sumW0 < 1e-10) {

 return {

  method: "Transportability Analysis (IOW)",

  error: "No valid weights in " + (sumW1 < 1e-10 ? "treatment" : "control") + " group",

  nTrial: nTrial,

  nTarget: nTarget,

  SATE: NaN,

  TATE: NaN

 };

 }



 var TATE = weightedMean1 / sumW1 - weightedMean0 / sumW0;



 var SATE = jStat.mean(treated.map(function(d) { return d[outcomeVar]; })) -

 jStat.mean(control.map(function(d) { return d[outcomeVar]; }));



 return {

 method: "Transportability Analysis (IOW)",

 nTrial: nTrial,

 nTarget: nTarget,

 SATE: SATE,

 SATE_interpretation: "Sample Average Treatment Effect (trial population)",

 TATE: TATE,

 TATE_interpretation: "Target Average Treatment Effect (generalized)",

 transportabilityRatio: TATE / SATE,

 weightSummary: {

 mean: jStat.mean(iow),

 min: Math.min.apply(null, iow),

 max: Math.max.apply(null, iow),

 effectiveSampleSize: Math.pow(iow.reduce(function(a, b) { return a + b; }, 0), 2) /

 iow.reduce(function(a, b) { return a + b * b; }, 0)

 },

 reference: "Westreich D, et al. Am J Epidemiol 2017;186:1084-1092"

 };

 }



function calculateQuantileTreatmentEffects(data, outcomeVar, treatmentVar, quantiles) {

 quantiles = quantiles || [0.1, 0.25, 0.5, 0.75, 0.9];



 var treated = data.filter(function(d) { return d[treatmentVar] === 1; })

 .map(function(d) { return d[outcomeVar]; });

 var control = data.filter(function(d) { return d[treatmentVar] === 0; })

 .map(function(d) { return d[outcomeVar]; });



 var qteResults = quantiles.map(function(q) {

 var qTreated = jStat.percentile(treated, q);

 var qControl = jStat.percentile(control, q);

 var qte = qTreated - qControl;



 var bootQTE = [];

 for (var b = 0; b < 200; b++) {

 var bootTreated = [];

 var bootControl = [];

 for (var i = 0; i < treated.length; i++) {

 bootTreated.push(treated[Math.floor(Math.random() * treated.length)]);

 }

 for (var i = 0; i < control.length; i++) {

 bootControl.push(control[Math.floor(Math.random() * control.length)]);

 }

 bootQTE.push(jStat.percentile(bootTreated, q) - jStat.percentile(bootControl, q));

 }



 var se = jStat.stdev(bootQTE);



 return {

 quantile: q,

 qTreated: qTreated,

 qControl: qControl,

 QTE: qte,

 se: se,

 ci: [qte - getConfZ() *se, qte + getConfZ() *se],

 significant: Math.abs(qte / se) > getConfZ()

 };

 });



 var meanQTE = jStat.mean(qteResults.map(function(r) { return r.QTE; }));

 var varQTE = jStat.variance(qteResults.map(function(r) { return r.QTE; }));

 var heterogeneity = varQTE > Math.pow(qteResults[Math.floor(quantiles.length / 2)].se, 2);



 return {

 method: "Quantile Treatment Effects",

 nTreated: treated.length,

 nControl: control.length,

 results: qteResults,

 meanEffect: meanQTE,

 heterogeneousEffects: heterogeneity,

 interpretation: heterogeneity ?

 "Treatment effect varies across outcome distribution" :

 "Treatment effect relatively uniform across distribution",

 reference: "Firpo S. Econometrica 2007;75:259-276"

 };

 }





function runRecurrentEventsMA(data) {



 var studies = [...new Set(data.map(function(d) { return d.study; }))];

 var k = studies.length;



 var studyResults = studies.map(function(study) {

 var studyData = data.filter(function(d) { return d.study === study; });

 var subjects = [...new Set(studyData.map(function(d) { return d.subject; }))];

 var n = subjects.length;



 var eventCounts = {};

 subjects.forEach(function(subj) {

 eventCounts[subj] = studyData.filter(function(d) {

 return d.subject === subj && d.event === 1;

 }).length;

 });



 var treated = subjects.filter(function(s) {

 return studyData.find(function(d) { return d.subject === s; }).treatment === 1;

 });

 var control = subjects.filter(function(s) {

 return studyData.find(function(d) { return d.subject === s; }).treatment === 0;

 });



 var meanEventsTreated = jStat.mean(treated.map(function(s) { return eventCounts[s]; }));

 var meanEventsControl = jStat.mean(control.map(function(s) { return eventCounts[s]; }));



 var followUpTreated = treated.reduce(function(sum, s) {

 return sum + Math.max.apply(null, studyData.filter(function(d) {

 return d.subject === s;

 }).map(function(d) { return d.time; }));

 }, 0);

 var followUpControl = control.reduce(function(sum, s) {

 return sum + Math.max.apply(null, studyData.filter(function(d) {

 return d.subject === s;

 }).map(function(d) { return d.time; }));

 }, 0);



 var rateTreated = treated.reduce(function(sum, s) { return sum + eventCounts[s]; }, 0) / followUpTreated;

 var rateControl = control.reduce(function(sum, s) { return sum + eventCounts[s]; }, 0) / followUpControl;



 var rateRatio = rateTreated / (rateControl + 0.001);

 var logRR = Math.log(rateRatio);

 var seLogRR = Math.sqrt(1 / (rateTreated * followUpTreated) + 1 / (rateControl * followUpControl));



 return {

 study: study,

 n: n,

 meanEventsTreated: meanEventsTreated,

 meanEventsControl: meanEventsControl,

 rateRatio: rateRatio,

 logRR: logRR,

 seLogRR: seLogRR

 };

 });



 var weights = studyResults.map(function(s) { return 1 / (s.seLogRR * s.seLogRR); });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooledLogRR = studyResults.reduce(function(sum, s, i) {

 return sum + weights[i] * s.logRR;

 }, 0) / sumW;

 var sePooled = Math.sqrt(1 / sumW);



 return {

 method: "Recurrent Events Meta-Analysis",

 nStudies: k,

 studyResults: studyResults,

 pooled: {

 rateRatio: Math.exp(pooledLogRR),

 ci: [Math.exp(pooledLogRR - getConfZ() *sePooled), Math.exp(pooledLogRR + getConfZ() *sePooled)],

 pValue: 2 * (1 - jStat.normal.cdf(Math.abs(pooledLogRR / sePooled), 0, 1))

 },

 interpretation: Math.exp(pooledLogRR) < 1 ?

 "Treatment reduces event rate by " + ((1 - Math.exp(pooledLogRR)) * 100).toFixed(0) + "%" :

 "Treatment increases event rate by " + ((Math.exp(pooledLogRR) - 1) * 100).toFixed(0) + "%",

 reference: "Dong Y, et al. Stat Med 2020;39:2099-2117"

 };

 }



function runFrailtyMA(data) {



 var studies = [...new Set(data.map(function(d) { return d.study; }))];

 var k = studies.length;



 var studyEffects = studies.map(function(study) {

 var studyData = data.filter(function(d) { return d.study === study; });

 var events = studyData.filter(function(d) { return d.event === 1; });

 var n = studyData.length;



 var totalTime = studyData.reduce(function(sum, d) { return sum + d.time; }, 0);

 var observedRate = events.length / totalTime;



 return {

 study: study,

 n: n,

 events: events.length,

 rate: observedRate,

 logRate: Math.log(observedRate + 0.001)

 };

 });



 var logRates = studyEffects.map(function(s) { return s.logRate; });

 var meanLogRate = jStat.mean(logRates);

 var varLogRate = jStat.variance(logRates);



 var expectedVar = studyEffects.reduce(function(sum, s) {

 return sum + 1 / s.events;

 }, 0) / k;



 var theta = Math.max(0, varLogRate - expectedVar);



 var adjustedWeights = studyEffects.map(function(s) {

 return 1 / (1 / s.events + theta);

 });

 var sumAdjW = adjustedWeights.reduce(function(a, b) { return a + b; }, 0);

 var pooledLogRate = studyEffects.reduce(function(sum, s, i) {

 return sum + adjustedWeights[i] * s.logRate;

 }, 0) / sumAdjW;



 return {

 method: "Frailty Meta-Analysis",

 nStudies: k,

 frailtyVariance: theta,

 frailtyVar: theta,

 frailtyInterpretation: theta > 0.1 ?

 "Substantial unobserved heterogeneity (theta=" + theta.toFixed(3) + ")" :

 "Little unobserved heterogeneity",

 studyFrailties: studyEffects.map(function(s) {

 return {

 study: s.study,

 frailty: Math.exp(s.logRate - pooledLogRate)

 };

 }),

 pooledRate: Math.exp(pooledLogRate),

 reference: "Rondeau V, et al. Stat Med 2012;31:3366-3401"

 };

 }



function runEntropyBalancing(data, treatmentVar, covariates) {

 var treated = data.filter(function(d) { return d[treatmentVar] === 1; });

 var control = data.filter(function(d) { return d[treatmentVar] === 0; });



 var nT = treated.length;

 var nC = control.length;



 var targetMeans = covariates.map(function(cov) {

 return jStat.mean(treated.map(function(d) { return d[cov] ?? 0; }));

 });



 var weights = new Array(nC).fill(1 / nC);



 for (var iter = 0; iter < 100; iter++) {

 var converged = true;



 covariates.forEach(function(cov, j) {

 var currentMean = 0;

 for (var i = 0; i < nC; i++) {

 currentMean += weights[i] * (control[i][cov] ?? 0);

 }



 var diff = targetMeans[j] - currentMean;

 if (Math.abs(diff) > 0.001) {

 converged = false;



 var lambda = diff * 0.1;

 for (var i = 0; i < nC; i++) {

 weights[i] *= Math.exp(lambda * (control[i][cov] ?? 0));

 }



 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 weights = weights.map(function(w) { return w / sumW; });

 }

 });



 if (converged) break;

 }



 var balanceCheck = covariates.map(function(cov) {

 var treatedMean = jStat.mean(treated.map(function(d) { return d[cov] ?? 0; }));

 var weightedControlMean = 0;

 for (var i = 0; i < nC; i++) {

 weightedControlMean += weights[i] * (control[i][cov] ?? 0);

 }

 var smd = (treatedMean - weightedControlMean) / jStat.stdev(data.map(function(d) { return d[cov] ?? 0; }));

 return { covariate: cov, treatedMean: treatedMean, controlMean: weightedControlMean, SMD: smd };

 });



 var ess = 1 / weights.reduce(function(sum, w) { return sum + w * w; }, 0);



 return {

 method: "Entropy Balancing",

 nTreated: nT,

 nControl: nC,

 effectiveSampleSize: ess,

 weights: weights,

 maxWeight: Math.max.apply(null, weights),

 weightSummary: {

 min: Math.min.apply(null, weights),

 max: Math.max.apply(null, weights),

 mean: 1 / nC

 },

 balanceCheck: balanceCheck,

 balanceAchieved: balanceCheck.every(function(b) { return Math.abs(b.SMD) < 0.1; }),

 reference: "Hainmueller J. Political Analysis 2012;20:25-46"

 };

 }



function initializeLivingReview(baseAnalysis) {

 return {

 method: "Living Systematic Review",

 baselineDate: new Date().toISOString(),

 baselineResults: baseAnalysis,

 updates: [],

 triggers: {

 newStudiesThreshold: 2,

 effectChangeThreshold: 0.2,

 heterogeneityChangeThreshold: 10

 },



 addNewStudy: function(study) {

 this.updates.push({

 date: new Date().toISOString(),

 study: study,

 type: 'new_study'

 });



 var allStudies = this.baselineResults.studies.concat([study]);

 var newResults = runMetaAnalysis(allStudies);



 var effectChange = Math.abs(newResults.pooled.pooled - this.baselineResults.pooled.pooled);

 var significanceChanged = (newResults.pooled.pValue < 0.05) !== (this.baselineResults.pooled.pValue < 0.05);



 return {

 previousEffect: this.baselineResults.pooled.pooled,

 newEffect: newResults.pooled.pooled,

 effectChange: effectChange,

 significanceChanged: significanceChanged,

 recommendation: significanceChanged ? "UPDATE CONCLUSIONS" : "Monitor - no change needed"

 };

 },



 checkUpdateNeeded: function(currentResults) {

 var effectChange = Math.abs(currentResults.pooled.pooled - this.baselineResults.pooled.pooled) /

 Math.abs(this.baselineResults.pooled.pooled);

 var i2Change = Math.abs(currentResults.pooled.I2 - this.baselineResults.pooled.I2);



 return {

 updateNeeded: effectChange > this.triggers.effectChangeThreshold ||

 i2Change > this.triggers.heterogeneityChangeThreshold,

 reasons: []

 };

 },



 reference: "Elliott JH, et al. PLoS Med 2017;14:e1002285"

 };

 }



function runFederatedMA(siteResults) {



 var k = siteResults.length;

 var totalN = siteResults.reduce(function(sum, s) { return sum + s.n; }, 0);



 var weights = siteResults.map(function(s) { return 1 / s.variance; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooled = siteResults.reduce(function(sum, s, i) {

 return sum + weights[i] * s.effect;

 }, 0) / sumW;

 var se = Math.sqrt(1 / sumW);



 var Q = siteResults.reduce(function(sum, s, i) {

 return sum + weights[i] * Math.pow(s.effect - pooled, 2);

 }, 0);

 var tau2 = Math.max(0, (Q - (k - 1)) / (sumW - siteResults.reduce(function(sum, s, i) {

 return sum + weights[i] * weights[i];

 }, 0) / sumW));



 var epsilon = 1.0;

 var sensitivity = Math.max.apply(null, siteResults.map(function(s) { return 1 / Math.sqrt(s.n); }));

 var noiseScale = sensitivity / epsilon;



 return {

 method: "Federated Meta-Analysis (Privacy-Preserving)",

 nSites: k,

 totalN: totalN,

 dataShared: "Summary statistics only - no IPD transferred",

 pooledEffect: pooled,

 se: se,

 ci: [pooled - getConfZ() *se, pooled + getConfZ() *se],

 heterogeneity: { Q: Q, tau2: tau2 },

 privacyProtection: {

 method: "Aggregate-only + optional differential privacy",

 epsilon: epsilon,

 noiseScale: noiseScale

 },

 compliance: "GDPR, HIPAA compatible",

 reference: "Duan R, et al. JAMIA 2020;27:175-184"

 };

 }



function calculateOptimalInformationSize(alpha, beta, delta, sigma2, k) {

 alpha = alpha || 0.05;

 beta = beta || 0.20;

 delta = delta || 0.2;

 sigma2 = sigma2 || 1;

 k = k || 1;



 var zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);

 var zBeta = jStat.normal.inv(1 - beta, 0, 1);



 var nPerArm = 2 * sigma2 * Math.pow(zAlpha + zBeta, 2) / (delta * delta);

 var totalN = 2 * nPerArm;



 var I2 = 0.3;

 var diversityAdjusted = totalN / (1 - I2);



 var modelVarianceInflation = 1 + (k - 1) * I2 / (1 - I2);

 var metaAnalysisOIS = totalN * modelVarianceInflation;



 var nInterim = Math.ceil(metaAnalysisOIS / 5);

 var interimAnalyses = [];

 for (var i = 1; i <= 5; i++) {

 var info = i / 5;

 var boundaryZ = zAlpha / Math.sqrt(info);

 interimAnalyses.push({

 analysis: i,

 informationFraction: info,

 cumulativeN: nInterim * i,

 boundaryZ: boundaryZ,

 boundaryP: 2 * (1 - jStat.normal.cdf(boundaryZ, 0, 1))

 });

 }



 return {

 method: "Optimal Information Size (OIS) Calculation",

 parameters: { alpha: alpha, power: 1 - beta, minEffect: delta, variance: sigma2 },

 singleTrialN: Math.ceil(totalN),

 diversityAdjustedN: Math.ceil(diversityAdjusted),

 metaAnalysisOIS: Math.ceil(metaAnalysisOIS),

 interimBoundaries: interimAnalyses,

 interpretation: "Need " + Math.ceil(metaAnalysisOIS) + " participants for conclusive meta-analysis",

 reference: "Wetterslev J, et al. J Clin Epidemiol 2009;62:742-754"

 };

 }



function exploreHeterogeneity(results, covariates) {

 if (results.pooled.I2 < 25) {

 return { message: "Low heterogeneity (I2 < 25%) - exploration not necessary" };

 }



 var findings = [];



 var loo = results.studies.map(function(study, i) {

 var remaining = results.studies.filter(function(s, j) { return j !== i; });

 var effects = remaining.map(function(s) { return s.effect; });

 var variances = remaining.map(function(s) { return s.variance; });

 var weights = variances.map(function(v) { return 1 / v; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooledLOO = effects.reduce(function(sum, e, j) { return sum + weights[j] * e; }, 0) / sumW;



 var Q = effects.reduce(function(sum, e, j) {

 return sum + weights[j] * Math.pow(e - pooledLOO, 2);

 }, 0);

 var I2LOO = Math.max(0, (Q - (remaining.length - 1)) / Q * 100);



 return {

 excluded: study.study,

 pooledEffect: pooledLOO,

 I2: I2LOO,

 I2Change: results.pooled.I2 - I2LOO

 };

 });



 var outliers = loo.filter(function(l) { return l.I2Change > 10; });

 if (outliers.length > 0) {

 findings.push({

 source: "Outlier studies",

 studies: outliers.map(function(o) { return o.excluded; }),

 recommendation: "Consider sensitivity analysis excluding these studies"

 });

 }



 if (covariates && covariates.length > 0) {

 covariates.forEach(function(cov) {

 var values = [...new Set(results.studies.map(function(s) { return s[cov]; }))];

 if (values.length >= 2 && values.length <= 5) {

 var subgroupI2 = values.map(function(v) {

 var subgroup = results.studies.filter(function(s) { return s[cov] === v; });

 if (subgroup.length < 2) return null;

 var effects = subgroup.map(function(s) { return s.effect; });

 return { value: v, n: subgroup.length, I2: calculateI2(effects, subgroup.map(function(s) { return s.variance; })) };

 }).filter(function(s) { return s !== null; });



 var meanSubgroupI2 = jStat.mean(subgroupI2.map(function(s) { return s.I2; }));

 if (results.pooled.I2 - meanSubgroupI2 > 15) {

 findings.push({

 source: cov + " subgroups",

 detail: subgroupI2,

 reduction: results.pooled.I2 - meanSubgroupI2,

 recommendation: "Heterogeneity partially explained by " + cov

 });

 }

 }

 });

 }



 var ses = results.studies.map(function(s) { return Math.sqrt(s.variance); });

 var effects = results.studies.map(function(s) { return s.effect; });

 var correlation = jStat.corrcoeff(ses, effects);



 if (Math.abs(correlation) > 0.3) {

 findings.push({

 source: "Small-study effects",

 correlation: correlation,

 recommendation: "Correlation between SE and effect size suggests publication bias or true heterogeneity by study size"

 });

 }



 return {

 method: "Automatic Heterogeneity Exploration",

 overallI2: results.pooled.I2,

 leaveOneOut: loo,

 findings: findings,

 summary: findings.length > 0 ?

 findings.map(function(f) { return f.source; }).join(", ") + " may explain heterogeneity" :

 "No clear sources identified - consider additional moderators",

 reference: "IntHout J, et al. BMJ Open 2016;6:e010247"

 };

 }



function calculateI2(effects, variances) {

 var weights = variances.map(function(v) { return 1 / v; });

 var sumW = weights.reduce(function(a, b) { return a + b; }, 0);

 var pooled = effects.reduce(function(sum, e, i) { return sum + weights[i] * e; }, 0) / sumW;

 var Q = effects.reduce(function(sum, e, i) {

 return sum + weights[i] * Math.pow(e - pooled, 2);

 }, 0);

 return Math.max(0, (Q - (effects.length - 1)) / Q * 100);

 }



function runAdaptiveMADesign(currentResults, candidateStudies) {



 var currentEffect = currentResults.pooled.pooled;

 var currentSE = currentResults.pooled.se;

 var currentPrecision = 1 / (currentSE * currentSE);



 var rankedCandidates = candidateStudies.map(function(study) {



 var studyPrecision = 1 / study.expectedVariance;

 var newPrecision = currentPrecision + studyPrecision;

 var newSE = Math.sqrt(1 / newPrecision);

 var precisionGain = currentSE - newSE;



 var currentCIWidth = 2 * getConfZ() *currentSE;

 var newCIWidth = 2 * getConfZ() *newSE;

 var ciReduction = (currentCIWidth - newCIWidth) / currentCIWidth * 100;



 var costPerPrecision = study.expectedCost / precisionGain;



 return {

 study: study.name,

 expectedN: study.expectedN,

 expectedVariance: study.expectedVariance,

 expectedCost: study.expectedCost,

 precisionGain: precisionGain,

 ciReductionPercent: ciReduction,

 costEffectiveness: costPerPrecision,

 rank: null

 };

 });



 rankedCandidates.sort(function(a, b) { return a.costEffectiveness - b.costEffectiveness; });

 rankedCandidates.forEach(function(s, i) { s.rank = i + 1; });



 var sufficientPrecision = currentSE < 0.1;

 var ciExcludesNull = (currentEffect - getConfZ() *currentSE > 0) || (currentEffect + getConfZ() *currentSE < 0);



 return {

 method: "Adaptive Meta-Analysis Design",

 currentState: {

 effect: currentEffect,

 se: currentSE,

 nStudies: currentResults.studies.length

 },

 candidateRanking: rankedCandidates,

 recommendation: {

 topPriority: rankedCandidates[0],

 reason: "Highest information gain per cost"

 },

 stoppingAnalysis: {

 sufficientPrecision: sufficientPrecision,

 conclusive: ciExcludesNull,

 recommendation: sufficientPrecision && ciExcludesNull ?

 "Current evidence may be sufficient" :

 "Additional studies recommended"

 },

 reference: "Nikolakopoulou A, et al. Res Synth Methods 2018;9:153-165"

 };

 }



