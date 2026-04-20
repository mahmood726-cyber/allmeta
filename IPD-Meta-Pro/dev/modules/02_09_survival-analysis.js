const SurvivalAnalysis = {



 kaplanMeier: (times, events) => {



 const data = times.map((t, i) => ({ time: t, event: events[i] }))

 .sort((a, b) => a.time - b.time);



 const n = data.length;

 const results = [];

 let atRisk = n;

 let survProb = 1;



 let i = 0;

 while (i < n) {

 const currentTime = data[i].time;

 let deaths = 0;

 let censored = 0;



 while (i < n && data[i].time === currentTime) {

 if (data[i].event === 1) deaths++;

 else censored++;

 i++;

 }



 if (deaths > 0) {

 survProb *= (atRisk - deaths) / atRisk;



 let varSum = 0;

 for (const r of results) {

 if (r.deaths > 0 && r.atRisk > r.deaths) {

 varSum += r.deaths / (r.atRisk * (r.atRisk - r.deaths));

 }

 }

 if (atRisk > deaths) {

 varSum += deaths / (atRisk * (atRisk - deaths));

 }

 const se = survProb <= 0 ? 0 : survProb * Math.sqrt(Math.max(0, varSum));



 results.push({

 time: currentTime,

 atRisk,

 deaths,

 censored,

 survival: survProb,

 se,

 ciLower: Math.max(0, survProb - getConfZ() *se),

 ciUpper: Math.min(1, survProb + getConfZ() *se)

 });

 }



 atRisk -= (deaths + censored);

 }



 results.unshift({

 time: 0, atRisk: n, deaths: 0, censored: 0,

 survival: 1, se: 0, ciLower: 1, ciUpper: 1

 });



 return results;

 },



 logRankTest: (times1, events1, times2, events2) => {



 const allTimes = [...new Set([...times1, ...times2])].sort((a, b) => a - b);



 let O1 = 0, E1 = 0, V = 0;

 let n1 = times1.length, n2 = times2.length;



 for (const t of allTimes) {



 const d1 = times1.filter((ti, i) => ti === t && events1[i] === 1).length;

 const d2 = times2.filter((ti, i) => ti === t && events2[i] === 1).length;

 const d = d1 + d2;



 if (d > 0 && (n1 + n2) > 1) {

 const n = n1 + n2;

 const e1 = d * n1 / n;



 O1 += d1;

 E1 += e1;

 V += d * n1 * n2 * (n - d) / (n * n * (n - 1));

 }



 n1 -= times1.filter((ti, i) => ti === t).length;

 n2 -= times2.filter((ti, i) => ti === t).length;

 }



 if (!Number.isFinite(V) || V <= 0) {

 return { chiSq: 0, p: 1, O1, E1, V: 0 };

 }



 const chiSq = Math.pow(O1 - E1, 2) / V;

 const p = 1 - Stats.chiSquareCDF(chiSq, 1);



 return { chiSq, p, O1, E1, V };

 },



 coxPH: (times, events, covariates) => {

 const n = times.length;

 const p = covariates[0].length;



 let beta = new Array(p).fill(0);

 const maxIter = 50;

 const tol = 1e-8;



 const order = times.map((t, i) => i)

 .sort((a, b) => times[a] - times[b]);



 for (let iter = 0; iter < maxIter; iter++) {



 const eta = covariates.map(x => x.reduce((sum, xi, j) => sum + xi * beta[j], 0));

 const expEta = eta.map(e => Math.exp(e));



 const score = new Array(p).fill(0);

 const hessian = Array(p).fill().map(() => new Array(p).fill(0));



 let s0 = 0, s1 = new Array(p).fill(0), s2 = Array(p).fill().map(() => new Array(p).fill(0));



 for (let ii = n - 1; ii >= 0; ii--) {

 const i = order[ii];



 s0 += expEta[i];

 for (let j = 0; j < p; j++) {

 s1[j] += covariates[i][j] * expEta[i];

 for (let k = 0; k <= j; k++) {

 const val = covariates[i][j] * covariates[i][k] * expEta[i];

 s2[j][k] += val;

 if (j !== k) s2[k][j] += val;

 }

 }



 if (events[i] === 1) {

 for (let j = 0; j < p; j++) {

 score[j] += covariates[i][j] - s1[j] / s0;

 for (let k = 0; k <= j; k++) {

 const val = s2[j][k] / s0 - (s1[j] / s0) * (s1[k] / s0);

 hessian[j][k] -= val;

 if (j !== k) hessian[k][j] -= val;

 }

 }

 }

 }



 if (p === 1) {

 const delta = score[0] / (-hessian[0][0]);

 beta[0] += delta;

 if (Math.abs(delta) < tol) break;

 } else {



 const invH = MatrixUtils.inverse(hessian);

 const delta = MatrixUtils.multiply(invH, score);

 let maxDelta = 0;

 for (let j = 0; j < p; j++) {

 beta[j] += delta[j];

 maxDelta = Math.max(maxDelta, Math.abs(delta[j]));

 }

 if (maxDelta < tol) break;

 }

 }



 const eta = covariates.map(x => x.reduce((sum, xi, j) => sum + xi * beta[j], 0));

 const expEta = eta.map(e => Math.exp(e));



 const hessian = Array(p).fill().map(() => new Array(p).fill(0));

 let s0 = 0, s1 = new Array(p).fill(0), s2 = Array(p).fill().map(() => new Array(p).fill(0));



 for (let ii = n - 1; ii >= 0; ii--) {

 const i = order[ii];

 s0 += expEta[i];

 for (let j = 0; j < p; j++) {

 s1[j] += covariates[i][j] * expEta[i];

 for (let k = 0; k <= j; k++) {

 const val = covariates[i][j] * covariates[i][k] * expEta[i];

 s2[j][k] += val;

 if (j !== k) s2[k][j] += val;

 }

 }



 if (events[i] === 1) {

 for (let j = 0; j < p; j++) {

 for (let k = 0; k <= j; k++) {

 const val = s2[j][k] / s0 - (s1[j] / s0) * (s1[k] / s0);

 hessian[j][k] -= val;

 if (j !== k) hessian[k][j] -= val;

 }

 }

 }

 }



 const vcov = MatrixUtils.inverse(hessian.map(row => row.map(v => -v)));

 const se = vcov.map((row, i) => Math.sqrt(row[i]));

 const hr = beta.map(b => Math.exp(b));

 const z = beta.map((b, i) => b / se[i]);

 const pvals = z.map(zv => 2 * (1 - Stats.normalCDF(Math.abs(zv))));



 return { beta, se, hr, z, pvals, vcov };

 }

 };



// Compatibility shim for advanced modules that call Statistics.coxRegression().
// Delegates to SurvivalAnalysis.coxPH and returns a stable summary object.
const Statistics = {

 coxRegression: (data, timeVar, eventVar, treatmentVar) => {

 const rows = (data || []).filter(d =>
 d &&
 Number.isFinite(Number(d[timeVar])) &&
 Number.isFinite(Number(d[eventVar]))
 );

 if (rows.length < 5) {
 return {
 effect: 0,
 beta: 0,
 hr: 1,
 se: 1,
 lower: Math.exp(-getConfZ()),
 upper: Math.exp(getConfZ()),
 ci: [Math.exp(-getConfZ()), Math.exp(getConfZ())],
 p: 1,
 aic: 0
 };
 }

 const times = rows.map(d => Number(d[timeVar]));
 const events = rows.map(d => Number(d[eventVar]) > 0 ? 1 : 0);
 const covariates = rows.map(d => {
 const raw = d[treatmentVar];
 const asNum = Number(raw);
 if (Number.isFinite(asNum)) return [asNum > 0 ? 1 : 0];
 if (typeof raw === 'string') {
 const s = raw.toLowerCase();
 return [(s === 'treatment' || s === 'treated' || s === '1' || s === 'yes' || s === 'true') ? 1 : 0];
 }
 return [0];
 });

 try {
 const fit = SurvivalAnalysis.coxPH(times, events, covariates);
 const beta = (fit.beta && Number.isFinite(fit.beta[0])) ? Number(fit.beta[0]) : 0;
 const se = (fit.se && Number.isFinite(fit.se[0]) && fit.se[0] > 0) ? Number(fit.se[0]) : 1;
 const hr = Math.exp(beta);
 const lower = Math.exp(beta - getConfZ() * se);
 const upper = Math.exp(beta + getConfZ() * se);
 const p = 2 * (1 - Stats.normalCDF(Math.abs(beta / se)));
 return {
 effect: beta,
 beta: beta,
 hr: hr,
 se: se,
 lower: lower,
 upper: upper,
 ci: [lower, upper],
 p: p,
 aic: 0
 };
 } catch (e) {
 const fallbackRows = rows.map((d, idx) => ({
 time: Number(d[timeVar]),
 event: Number(d[eventVar]) > 0 ? 1 : 0,
 treatment: covariates[idx][0]
 }));
 const crude = calculateCoxPH(fallbackRows);
 const hr = Number.isFinite(crude.hr) && crude.hr > 0 ? crude.hr : 1;
 const se = Number.isFinite(crude.se) && crude.se > 0 ? crude.se : 1;
 const beta = Math.log(hr);
 const lower = Math.exp(beta - getConfZ() * se);
 const upper = Math.exp(beta + getConfZ() * se);
 const p = 2 * (1 - Stats.normalCDF(Math.abs(beta / se)));
 return {
 effect: beta,
 beta: beta,
 hr: hr,
 se: se,
 lower: lower,
 upper: upper,
 ci: [lower, upper],
 p: p,
 aic: 0
 };
 }
 }

};


 const MatrixUtils = {

 inverse: (matrix) => {

 const n = matrix.length;

 const augmented = matrix.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);



 for (let i = 0; i < n; i++) {

 let maxRow = i;

 for (let k = i + 1; k < n; k++) {

 if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {

 maxRow = k;

 }

 }

 [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];



 const pivot = augmented[i][i];

 for (let j = 0; j < 2 * n; j++) {

 augmented[i][j] /= pivot;

 }



 for (let k = 0; k < n; k++) {

 if (k !== i) {

 const factor = augmented[k][i];

 for (let j = 0; j < 2 * n; j++) {

 augmented[k][j] -= factor * augmented[i][j];

 }

 }

 }

 }



 return augmented.map(row => row.slice(n));

 },



 multiply: (matrix, vector) => {

 return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));

 }

 };



 // =============================================================================

 // BAYESIAN MCMC ENGINE

 // =============================================================================

 // Current: Pure JavaScript Metropolis-Hastings implementation

 //

 // FUTURE ENHANCEMENT: WebAssembly (WASM) Acceleration

 // - Compile core MCMC loops to WASM for 10-50x speedup

 // - Enable larger datasets (>100,000 iterations) in browser

 // - Potential libraries: emscripten-compiled Stan, wasm-stats

 // - Target: Sub-second MCMC for standard meta-analysis

 //

 // References:

 // - WebAssembly: https://webassembly.org/

 // - Gelman A et al. Bayesian Data Analysis, 3rd ed. 2013

 // =============================================================================



 // Seeded PRNG (xoshiro128** algorithm) for reproducible MCMC

 
