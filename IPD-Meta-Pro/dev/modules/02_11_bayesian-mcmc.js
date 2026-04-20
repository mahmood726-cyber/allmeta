const BayesianMCMC = {



 runMCMC: (effects, variances, options = {}) => {

 const {

 iterations = 10000,

 burnin = 2000,

 chains = 4,

 priorMuMean = 0,

 priorMuSD = 10,

 priorTauType = 'halfnormal',

 priorTauScale = 1,

 seed = 42

 } = options;



 const k = effects.length;

 const results = [];



 for (let chain = 0; chain < chains; chain++) {

 const rng = createSeededRNG(seed + chain * 1000);



 let mu = effects[Math.floor(rng() * k)] + (rng() - 0.5);

 let tau = 0.1 + rng() * 0.5;



 const muSamples = [];

 const tauSamples = [];



 let muProposalSD = 0.1;

 let tauProposalSD = 0.05;

 let muAccept = 0, tauAccept = 0;



 for (let iter = 0; iter < iterations; iter++) {



 const muProposal = mu + Stats.normalQuantile(rng()) * muProposalSD;



 const llCurrent = BayesianMCMC.logLikelihood(effects, variances, mu, tau);

 const llProposal = BayesianMCMC.logLikelihood(effects, variances, muProposal, tau);



 // Use log-prior directly to avoid log(0) numerical instability

 const logPriorCurrent = -0.5 * Math.pow((mu - priorMuMean) / priorMuSD, 2);

 const logPriorProposal = -0.5 * Math.pow((muProposal - priorMuMean) / priorMuSD, 2);



 const logAcceptRatio = (llProposal + logPriorProposal) - (llCurrent + logPriorCurrent);



 if (Math.log(rng()) < logAcceptRatio) {

 mu = muProposal;

 muAccept++;

 }



 const tauProposal = Math.abs(tau + Stats.normalQuantile(rng()) * tauProposalSD);



 const llCurrentTau = BayesianMCMC.logLikelihood(effects, variances, mu, tau);

 const llProposalTau = BayesianMCMC.logLikelihood(effects, variances, mu, tauProposal);



 // Use log-prior directly to avoid log(0) numerical instability

 const logPriorCurrentTau = BayesianMCMC.logTauPrior(tau, priorTauType, priorTauScale);

 const logPriorProposalTau = BayesianMCMC.logTauPrior(tauProposal, priorTauType, priorTauScale);



 const logAcceptRatioTau = (llProposalTau + logPriorProposalTau) - (llCurrentTau + logPriorCurrentTau);



 if (Math.log(rng()) < logAcceptRatioTau) {

 tau = tauProposal;

 tauAccept++;

 }



 if (iter < burnin && iter > 0 && iter % 100 === 0) {

 const muRate = muAccept / iter;

 const tauRate = tauAccept / iter;

 if (muRate < 0.2) muProposalSD *= 0.8;

 else if (muRate > 0.5) muProposalSD *= 1.2;

 if (tauRate < 0.2) tauProposalSD *= 0.8;

 else if (tauRate > 0.5) tauProposalSD *= 1.2;

 }



 if (iter >= burnin) {

 muSamples.push(mu);

 tauSamples.push(tau);

 }

 }



 results.push({ muSamples, tauSamples });

 }



 const allMu = results.flatMap(r => r.muSamples);

 const allTau = results.flatMap(r => r.tauSamples);



 const muMean = Stats.mean(allMu);

 const muMedian = Stats.median(allMu);

 const muSD = Stats.sd(allMu, 1);

 const muLower = Stats.quantile(allMu, 0.025);

 const muUpper = Stats.quantile(allMu, 0.975);



 const tauMean = Stats.mean(allTau);

 const tauMedian = Stats.median(allTau);



 const probNegative = allMu.filter(m => m < 0).length / allMu.length;



 const rHat = BayesianMCMC.calculateRhat(results.map(r => r.muSamples));

 const ess = BayesianMCMC.calculateESS(allMu);

 const geweke = BayesianMCMC.calculateGeweke(results.map(r => r.muSamples));

 const converged = rHat < 1.1 && ess > 400 && Math.abs(geweke.meanZ) < 2;



 return {

 chains: results,

 mu: { mean: muMean, median: muMedian, sd: muSD, lower: muLower, upper: muUpper },

 tau: { mean: tauMean, median: tauMedian },

 probNegative,

 rHat,

 ess,

 geweke,

 converged,

 samples: { mu: allMu, tau: allTau }

 };

 },



 logLikelihood: (effects, variances, mu, tau) => {

 const tau2 = tau * tau;

 let ll = 0;

 for (let i = 0; i < effects.length; i++) {

 const totalVar = variances[i] + tau2;

 ll += -0.5 * Math.log(2 * Math.PI * totalVar) - Math.pow(effects[i] - mu, 2) / (2 * totalVar);

 }

 return ll;

 },



 tauPrior: (tau, type, scale) => {

 if (tau < 0) return 0;

 switch (type) {

 case 'uniform':

 return tau < 2 ? 0.5 : 0;

 case 'halfnormal':

 return 2 * Stats.normalPDF(tau, 0, scale);

 case 'halfcauchy':

 return 2 / (Math.PI * scale * (1 + Math.pow(tau / scale, 2)));

 default:

 return 1;

 }

 },



 logTauPrior: (tau, type, scale) => {

 if (tau < 0) return -Infinity;

 switch (type) {

 case 'uniform':

 return tau < 2 ? Math.log(0.5) : -Infinity;

 case 'halfnormal':

 return Math.log(2) - 0.5 * Math.pow(tau / scale, 2) - Math.log(scale * Math.sqrt(2 * Math.PI));

 case 'halfcauchy':

 return Math.log(2) - Math.log(Math.PI * scale) - Math.log(1 + Math.pow(tau / scale, 2));

 default:

 return 0;

 }

 },



 calculateRhat: (chains) => {

 const m = chains.length;

 const n = chains[0].length;



 const chainMeans = chains.map(c => Stats.mean(c));

 const overallMean = Stats.mean(chainMeans);



 const B = n * chains.reduce((sum, _, i) => sum + Math.pow(chainMeans[i] - overallMean, 2), 0) / (m - 1);



 const W = Stats.mean(chains.map(c => Stats.variance(c, 1)));



 const varPlus = ((n - 1) / n) * W + (1 / n) * B;



 return Math.sqrt(varPlus / W);

 },



 // Effective Sample Size (ESS) - accounts for autocorrelation

 // Reference: Gelman A et al. Bayesian Data Analysis, 3rd ed. 2013

 calculateESS: (samples) => {

 const n = samples.length;

 if (n < 10) return n;



 const mean = Stats.mean(samples);

 const variance = Stats.variance(samples, 1);

 if (variance === 0) return n;



 // Calculate autocorrelations up to lag 100 or n/2

 const maxLag = Math.min(Math.floor(n / 2), 100);

 let sumRho = 0;



 for (let k = 1; k <= maxLag; k++) {

 let autoCorr = 0;

 for (let i = 0; i < n - k; i++) {

 autoCorr += (samples[i] - mean) * (samples[i + k] - mean);

 }

 autoCorr = autoCorr / ((n - k) * variance);



 // Stop when autocorrelation drops below 0.05 (near zero)

 if (autoCorr < 0.05) break;

 sumRho += autoCorr;

 }



 // ESS = n / (1 + 2 * sum of autocorrelations)

 const ess = Math.floor(n / (1 + 2 * sumRho));

 return Math.max(1, Math.min(ess, n)); // Bound between 1 and n

 },



 // Geweke Diagnostic - compares first 10% vs last 50% of chain

 // Reference: Geweke J. Bayesian Statistics 4. 1992:169-193

 calculateGeweke: (chains) => {

 const zScores = chains.map(chain => {

 const n = chain.length;

 const nA = Math.floor(n * 0.1); // First 10%

 const nB = Math.floor(n * 0.5); // Last 50%



 const chainA = chain.slice(0, nA);

 const chainB = chain.slice(n - nB);



 const meanA = Stats.mean(chainA);

 const meanB = Stats.mean(chainB);

 const varA = Stats.variance(chainA, 1) / nA;

 const varB = Stats.variance(chainB, 1) / nB;



 // Z-score for difference in means

 const se = Math.sqrt(varA + varB);

 return se > 0 ? (meanA - meanB) / se : 0;

 });



 const meanZ = Stats.mean(zScores.map(z => Math.abs(z)));

 const allPass = zScores.every(z => Math.abs(z) < 2);



 return {

 zScores: zScores,

 meanZ: meanZ,

 allPass: allPass,

 interpretation: allPass ?

 "Geweke test passed (|z| < 2 for all chains)" :

 "WARNING: Geweke test suggests non-stationarity in some chains"

 };

 }

 };



 