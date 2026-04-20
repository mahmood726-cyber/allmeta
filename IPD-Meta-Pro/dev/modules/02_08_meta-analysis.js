const MetaAnalysis = {

 MIN_VARIANCE: 1e-10,

 _prepareFE: (effects, variances) => {

 const weights = variances.map(v => 1 / Math.max(v, MetaAnalysis.MIN_VARIANCE));

 const sumW = weights.reduce((a, b) => a + b, 0);

 const pooled = effects.reduce((sum, e, i) => sum + weights[i] * e, 0) / sumW;

 let Q = 0;
 for (let i = 0; i < effects.length; i++) {
 Q += weights[i] * Math.pow(effects[i] - pooled, 2);
 }

 const sumW2 = weights.reduce((a, b) => a + b * b, 0);
 const C = sumW > 0 ? (sumW - sumW2 / sumW) : 0;
 const df = Math.max(0, effects.length - 1);
 const pQ = df > 0 ? (1 - Stats.chiSquareCDF(Q, df)) : 1;
 const I2Q = (df > 0 && Q > df && Q > 0) ? Math.max(0, 100 * (Q - df) / Q) : 0;
 const H2Q = df > 0 ? (Q / df) : 1;

 return { weights, sumW, sumW2, pooled, Q, C, df, pQ, I2Q, H2Q };

 },

 _withSummaryFields: (result, estimate = result.pooled, se = result.se, options = {}) => {

 const confLevel = (typeof APP !== 'undefined' && APP.config && Number.isFinite(APP.config.confLevel)) ? APP.config.confLevel : 0.95;
 const alpha = 1 - confLevel;
 const ciDf = Number.isFinite(options.ciDf) ? options.ciDf : null;
 const pValue = Number.isFinite(options.pValue) ? options.pValue :
  (Number.isFinite(result.pValue) ? result.pValue : (Number.isFinite(result.p) ? result.p : NaN));
 const k = Number.isFinite(options.k) ? options.k :
  (Number.isFinite(result.k) ? result.k : (Number.isFinite(result.df) ? result.df + 1 : undefined));

 let lower = NaN;
 let upper = NaN;

 if (Number.isFinite(estimate) && Number.isFinite(se)) {
  const crit = (ciDf !== null && ciDf > 0)
   ? Stats.tQuantile(1 - alpha / 2, ciDf)
   : getConfZ();
  lower = estimate - crit * se;
  upper = estimate + crit * se;
 }

 return {
  ...result,
  pooled: estimate,
  effect: estimate,
  estimate: estimate,
  lower: lower,
  upper: upper,
  ci: [lower, upper],
  ci_lower: lower,
  ci_upper: upper,
  pValue: pValue,
  k: k
 };

 },

 _buildRandomResult: (effects, variances, tau2) => {

 const tau2Safe = Math.max(0, Number(tau2) ?? 0);
 const fe = MetaAnalysis._prepareFE(effects, variances);

 const weights = variances.map(v => 1 / Math.max(v + tau2Safe, MetaAnalysis.MIN_VARIANCE));
 const sumW = weights.reduce((a, b) => a + b, 0);
 const pooled = effects.reduce((sum, e, i) => sum + weights[i] * e, 0) / sumW;
 const variance = 1 / sumW;
 const se = Math.sqrt(variance);
 const z = pooled / se;
 const p = 2 * (1 - Stats.normalCDF(Math.abs(z)));

 let I2 = 0;
 let H2 = 1;
 if (tau2Safe > 0 && fe.C > 0 && fe.df > 0) {
 const vTilde = fe.df / fe.C;
 if (vTilde > 0) {
 I2 = 100 * tau2Safe / (tau2Safe + vTilde);
 H2 = 1 / Math.max(MetaAnalysis.MIN_VARIANCE, 1 - I2 / 100);
 }
 }

 if (!isFinite(I2) || I2 < 0) I2 = 0;
 if (!isFinite(H2) || H2 < 1) H2 = 1;

 return MetaAnalysis._withSummaryFields({
 pooled, variance, se, z, p,
 weights,
 tau2: tau2Safe,
 tau: Math.sqrt(tau2Safe),
 Q: fe.Q,
 pQ: fe.pQ,
 I2: I2,
 H2: H2,
 df: fe.df
 }, pooled, se, { pValue: p, k: effects.length });

 },

 _estimateTau2PM: (effects, variances) => {

 const k = effects.length;
 const df = k - 1;
 if (k < 2) return 0;

 const qAt = (tau2) => {
 const weights = variances.map(v => 1 / Math.max(v + tau2, MetaAnalysis.MIN_VARIANCE));
 const sumW = weights.reduce((a, b) => a + b, 0);
 const pooled = effects.reduce((sum, e, i) => sum + weights[i] * e, 0) / sumW;
 let q = 0;
 for (let i = 0; i < k; i++) q += weights[i] * Math.pow(effects[i] - pooled, 2);
 return q;
 };

 if (qAt(0) <= df) return 0;

 let low = 0;
 let high = Math.max(1e-6, MetaAnalysis.randomEffectsDL(effects, variances).tau2 ?? 1e-6);
 while (qAt(high) > df && high < 1e6) high *= 2;

 for (let i = 0; i < 120; i++) {
 const mid = (low + high) / 2;
 const qMid = qAt(mid);
 if (qMid > df) low = mid;
 else high = mid;
 if (Math.abs(high - low) < 1e-10) break;
 }

 return Math.max(0, (low + high) / 2);

 },

 _weightedProjectionStats: (effects, variances, tau2) => {

 const weights = variances.map(v => 1 / Math.max(v + tau2, MetaAnalysis.MIN_VARIANCE));
 const sumW = weights.reduce((a, b) => a + b, 0);
 const sumW2 = weights.reduce((a, b) => a + b * b, 0);
 const sumW3 = weights.reduce((a, b) => a + b * b * b, 0);

 const pooled = effects.reduce((sum, e, i) => sum + weights[i] * e, 0) / sumW;

 let rss = 0;
 let yPPy = 0;
 for (let i = 0; i < effects.length; i++) {
 const resid = effects[i] - pooled;
 rss += weights[i] * resid * resid;
 const py = weights[i] * resid;
 yPPy += py * py;
 }

 const traceP = sumW - sumW2 / sumW;
 const tracePP = sumW2 - (2 * sumW3) / sumW + (sumW2 * sumW2) / (sumW * sumW);

 return { weights, sumW, sumW2, pooled, rss, yPPy, traceP, tracePP };

 },

 _estimateTau2Fisher: (effects, variances, useREML, options = {}) => {

 const k = effects.length;
 const p = 1;
 if (k <= p) return 0;

 const threshold = options.threshold ?? 1e-5;
 const maxIter = options.maxIter ?? 100;
 const tau2Min = options.tau2Min ?? 0;
 const tol = options.tol ?? 1e-4;
 const ll0check = options.ll0check ?? true;

 let tau2 = MetaAnalysis._estimateTau2HE(effects, variances);
 tau2 = Math.max(tau2Min, tau2);

 let change = threshold + 1;
 let iter = 0;

 while (change > threshold) {
 iter += 1;
 const oldTau2 = tau2;
 const stats = MetaAnalysis._weightedProjectionStats(effects, variances, tau2);

 let adj = 0;
 if (useREML) {
 if (stats.tracePP > 0) {
 adj = (stats.yPPy - stats.traceP) / stats.tracePP;
 }
 } else if (stats.sumW2 > 0) {
 adj = (stats.yPPy - stats.sumW) / stats.sumW2;
 }

 if (!isFinite(adj)) adj = 0;

 while (tau2 + adj < tau2Min) adj /= 2;
 tau2 += adj;
 change = Math.abs(oldTau2 - tau2);

 if (iter > maxIter) break;
 }

 tau2 = Math.max(tau2Min, tau2);

 if (ll0check && tau2 > threshold && variances.every(v => v > 0)) {
 const llStats0 = MetaAnalysis._weightedProjectionStats(effects, variances, 0);
 const llStats = MetaAnalysis._weightedProjectionStats(effects, variances, tau2);
 const kEff = k - p;

 let ll0;
 let ll;
 if (useREML) {
 ll0 = -0.5 * kEff * Math.log(2 * Math.PI) - 0.5 * variances.reduce((s, v) => s + Math.log(v), 0) - 0.5 * Math.log(Math.max(llStats0.sumW, MetaAnalysis.MIN_VARIANCE)) - 0.5 * llStats0.rss;
 ll = -0.5 * kEff * Math.log(2 * Math.PI) - 0.5 * variances.reduce((s, v) => s + Math.log(v + tau2), 0) - 0.5 * Math.log(Math.max(llStats.sumW, MetaAnalysis.MIN_VARIANCE)) - 0.5 * llStats.rss;
 } else {
 ll0 = -0.5 * k * Math.log(2 * Math.PI) - 0.5 * variances.reduce((s, v) => s + Math.log(v), 0) - 0.5 * llStats0.rss;
 ll = -0.5 * k * Math.log(2 * Math.PI) - 0.5 * variances.reduce((s, v) => s + Math.log(v + tau2), 0) - 0.5 * llStats.rss;
 }

 if (ll0 - ll > tol) tau2 = 0;
 }

 return Math.max(tau2Min, tau2);

 },

 _estimateTau2HE: (effects, variances) => {
 const k = effects.length;
 if (k < 2) return 0;
 const meanEffect = effects.reduce((a, b) => a + b, 0) / k;
 let ss = 0;
 for (let i = 0; i < k; i++) ss += Math.pow(effects[i] - meanEffect, 2);
 const sampleVar = ss / (k - 1);
 const meanVar = variances.reduce((a, b) => a + b, 0) / k;
 return Math.max(0, sampleVar - meanVar);
 },

 _estimateTau2SJ: (effects, variances) => {
 const k = effects.length;
 const p = 1;
 if (k <= p) return 0;

 const meanEffect = effects.reduce((a, b) => a + b, 0) / k;
 let ss = 0;
 for (let i = 0; i < k; i++) ss += Math.pow(effects[i] - meanEffect, 2);
 const tau2_0 = ss / k;

 const stats = MetaAnalysis._weightedProjectionStats(effects, variances, tau2_0);
 return Math.max(0, tau2_0 * stats.rss / (k - p));
 },

 fixedEffect: (effects, variances) => {

 const fe = MetaAnalysis._prepareFE(effects, variances);
 const variance = 1 / fe.sumW;
 const se = Math.sqrt(variance);
 const z = fe.pooled / se;
 const p = 2 * (1 - Stats.normalCDF(Math.abs(z)));

 return MetaAnalysis._withSummaryFields({
 pooled: fe.pooled,
 variance: variance,
 se: se,
 z: z,
 p: p,
 weights: fe.weights,
 tau2: 0,
 tau: 0,
 Q: fe.Q,
 pQ: fe.pQ,
 I2: fe.I2Q,
 H2: fe.H2Q,
 df: fe.df
 }, fe.pooled, se, { pValue: p, k: effects.length });

 },

 randomEffectsDL: (effects, variances) => {
 const fe = MetaAnalysis._prepareFE(effects, variances);
 const tau2 = fe.C > 0 ? Math.max(0, (fe.Q - fe.df) / fe.C) : 0;
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },

 randomEffectsREML: (effects, variances) => {
 const tau2 = MetaAnalysis._estimateTau2Fisher(effects, variances, true);
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },

 randomEffectsPM: (effects, variances) => {
 const tau2 = MetaAnalysis._estimateTau2PM(effects, variances);
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },

 randomEffectsSJ: (effects, variances) => {
 const tau2 = MetaAnalysis._estimateTau2SJ(effects, variances);
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },

 randomEffectsHE: (effects, variances) => {
 const tau2 = MetaAnalysis._estimateTau2HE(effects, variances);
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },

 randomEffectsML: (effects, variances) => {
 const tau2 = MetaAnalysis._estimateTau2Fisher(effects, variances, false);
 return MetaAnalysis._buildRandomResult(effects, variances, tau2);
 },



 applyHKSJ: (result, effects, variances) => {

 const k = effects.length;

 const weights = result.weights;

 const sumW = weights.reduce((a, b) => a + b, 0);



 let qAdj = 0;

 for (let i = 0; i < k; i++) {

 qAdj += weights[i] * Math.pow(effects[i] - result.pooled, 2);

 }

 qAdj /= (k - 1);



 const seAdj = result.se * Math.sqrt(Math.max(1, qAdj));

 const t = result.pooled / seAdj;

 const p = 2 * (1 - Stats.tCDF(Math.abs(t), k - 1));



 const adjusted = MetaAnalysis._withSummaryFields({
 ...result,
 seHKSJ: seAdj,
 tHKSJ: t,
 pHKSJ: p
 }, result.pooled, seAdj, { ciDf: k - 1, pValue: p, k: k });

 return {
 ...adjusted,
 seUnadjusted: result.se,
 pUnadjusted: result.p,
 lowerUnadjusted: result.lower,
 upperUnadjusted: result.upper,
 ciUnadjusted: result.ci,
 lowerHKSJ: adjusted.lower,
 upperHKSJ: adjusted.upper,
 ciHKSJ: adjusted.ci
 };

 },



 predictionInterval: (result, confLevel = 0.95) => {

 const k = result.df + 1;

 const tCrit = Stats.tQuantile(1 - (1 - confLevel) / 2, k - 2);

 const piWidth = tCrit * Math.sqrt(result.variance + result.tau2);



 return {

 lower: result.pooled - piWidth,

 upper: result.pooled + piWidth

 };

 },



 confidenceInterval: (estimate, se, confLevel = 0.95, df = null) => {

 const alpha = 1 - confLevel;

 let crit;

 if (df) {

 crit = Stats.tQuantile(1 - alpha / 2, df);

 } else {

 crit = Stats.normalQuantile(1 - alpha / 2);

 }

 return {

 lower: estimate - crit * se,

 upper: estimate + crit * se

 };

 }

 };



 