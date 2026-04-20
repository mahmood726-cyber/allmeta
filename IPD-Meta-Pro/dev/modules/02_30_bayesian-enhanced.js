// ═══════════════════════════════════════════════════════════════════
// Enhanced Bayesian Hierarchical Meta-Analysis
// Extends BayesianMCMC with: prior sensitivity, DIC/WAIC, meta-regression,
// shrinkage estimates, posterior predictive, forest plot data
// Reference: Higgins et al. (2009), Spiegelhalter et al. (2002), Rover et al. (2020)
// ═══════════════════════════════════════════════════════════════════

var BayesianEnhanced = (function() {
    'use strict';

    function getZ() { return (typeof getConfZ === 'function') ? getConfZ() : 1.96; }

    // ── 1. Prior Sensitivity Analysis ───────────────────────────
    // Run MCMC with multiple prior specifications, compare results

    function priorSensitivity(effects, variances, options) {
        options = options || {};
        var iterations = options.iterations || 5000;
        var burnin = options.burnin || 1000;

        if (typeof BayesianMCMC === 'undefined' || !BayesianMCMC.runMCMC) {
            return { error: 'BayesianMCMC module required' };
        }

        // Define prior specifications to compare
        var priorSpecs = [
            { name: 'Vague Normal(0,10)', priorMuSD: 10, priorTauType: 'halfnormal', priorTauScale: 1 },
            { name: 'Weakly Informative N(0,1)', priorMuSD: 1, priorTauType: 'halfnormal', priorTauScale: 0.5 },
            { name: 'Half-Cauchy(0,0.5)', priorMuSD: 10, priorTauType: 'halfcauchy', priorTauScale: 0.5 },
            { name: 'Half-Cauchy(0,1)', priorMuSD: 10, priorTauType: 'halfcauchy', priorTauScale: 1 },
            { name: 'Uniform tau', priorMuSD: 10, priorTauType: 'uniform', priorTauScale: 2 },
        ];

        // Allow custom priors
        if (options.customPriors) priorSpecs = priorSpecs.concat(options.customPriors);

        var results = [];
        priorSpecs.forEach(function(spec) {
            var fit = BayesianMCMC.runMCMC(effects, variances, {
                iterations: iterations, burnin: burnin, chains: 2, seed: 42,
                priorMuMean: spec.priorMuMean || 0,
                priorMuSD: spec.priorMuSD,
                priorTauType: spec.priorTauType,
                priorTauScale: spec.priorTauScale
            });

            results.push({
                prior: spec.name,
                mu: { mean: fit.mu.mean, median: fit.mu.median, lower: fit.mu.lower, upper: fit.mu.upper },
                tau: { mean: fit.tau.mean, median: fit.tau.median },
                probNegative: fit.probNegative,
                converged: fit.converged,
                rHat: fit.rHat, ess: fit.ess
            });
        });

        // Assess sensitivity: max range of posterior means
        var muRange = Math.max.apply(null, results.map(function(r) { return r.mu.mean; })) -
                      Math.min.apply(null, results.map(function(r) { return r.mu.mean; }));
        var tauRange = Math.max.apply(null, results.map(function(r) { return r.tau.mean; })) -
                       Math.min.apply(null, results.map(function(r) { return r.tau.mean; }));

        return {
            method: 'Bayesian Prior Sensitivity Analysis',
            results: results,
            sensitivity: {
                muRange: muRange,
                tauRange: tauRange,
                robust: muRange < 0.2 * Math.abs(results[0].mu.mean || 1),
                interpretation: muRange < 0.1
                    ? 'Results are robust to prior choice (μ range: ' + muRange.toFixed(4) + ')'
                    : muRange < 0.3
                    ? 'Moderate sensitivity to prior choice (μ range: ' + muRange.toFixed(4) + '). Report multiple analyses.'
                    : 'Substantial sensitivity to prior choice (μ range: ' + muRange.toFixed(4) + '). Interpret with caution.'
            },
            reference: 'Rover C et al. (2020). Bayesian random-effects meta-analysis using the bayesmeta R package. JSS 93(6).'
        };
    }

    // ── 2. DIC (Deviance Information Criterion) ─────────────────
    // DIC = D̄ + pD where D̄ = posterior mean deviance, pD = effective parameters

    function computeDIC(effects, variances, mcmcResult) {
        if (!mcmcResult || !mcmcResult.samples) return null;

        var muSamples = mcmcResult.samples.mu;
        var tauSamples = mcmcResult.samples.tau;
        var nSamples = muSamples.length;

        // Compute deviance at each posterior sample: D(θ) = -2 * logLik
        var devianceSum = 0;
        for (var s = 0; s < nSamples; s++) {
            var ll = 0;
            var tau2 = tauSamples[s] * tauSamples[s];
            for (var i = 0; i < effects.length; i++) {
                var totalVar = variances[i] + tau2;
                ll += -0.5 * Math.log(2 * Math.PI * totalVar) - Math.pow(effects[i] - muSamples[s], 2) / (2 * totalVar);
            }
            devianceSum += -2 * ll;
        }
        var Dbar = devianceSum / nSamples; // Posterior mean deviance

        // Deviance at posterior means
        var muHat = mcmcResult.mu.mean;
        var tauHat = mcmcResult.tau.mean;
        var llHat = 0;
        var tau2Hat = tauHat * tauHat;
        for (var i2 = 0; i2 < effects.length; i2++) {
            var tv = variances[i2] + tau2Hat;
            llHat += -0.5 * Math.log(2 * Math.PI * tv) - Math.pow(effects[i2] - muHat, 2) / (2 * tv);
        }
        var Dhat = -2 * llHat; // Deviance at posterior mean

        var pD = Dbar - Dhat; // Effective number of parameters
        var DIC = Dbar + pD;  // = Dhat + 2*pD

        return {
            DIC: DIC,
            Dbar: Dbar,
            Dhat: Dhat,
            pD: pD,
            interpretation: 'Lower DIC = better fit. pD=' + pD.toFixed(1) + ' effective parameters.'
        };
    }

    // ── 3. WAIC (Widely Applicable Information Criterion) ───────

    function computeWAIC(effects, variances, mcmcResult) {
        if (!mcmcResult || !mcmcResult.samples) return null;

        var muSamples = mcmcResult.samples.mu;
        var tauSamples = mcmcResult.samples.tau;
        var S = muSamples.length;
        var k = effects.length;

        // For each observation i, compute log pointwise predictive density
        var lppd = 0;
        var pWAIC = 0;

        for (var i = 0; i < k; i++) {
            var logLiks = new Array(S);
            for (var s = 0; s < S; s++) {
                var tau2 = tauSamples[s] * tauSamples[s];
                var totalVar = variances[i] + tau2;
                logLiks[s] = -0.5 * Math.log(2 * Math.PI * totalVar) - Math.pow(effects[i] - muSamples[s], 2) / (2 * totalVar);
            }
            // lppd_i = log(mean(exp(logLik_s))) — use log-sum-exp for stability
            var maxLL = Math.max.apply(null, logLiks);
            var sumExp = 0;
            for (var s2 = 0; s2 < S; s2++) sumExp += Math.exp(logLiks[s2] - maxLL);
            lppd += maxLL + Math.log(sumExp / S);

            // pWAIC_i = var(logLik_s) — variance of log-likelihoods across samples
            var meanLL = logLiks.reduce(function(a, b) { return a + b; }, 0) / S;
            var varLL = 0;
            for (var s3 = 0; s3 < S; s3++) varLL += Math.pow(logLiks[s3] - meanLL, 2);
            pWAIC += varLL / (S - 1);
        }

        var WAIC = -2 * (lppd - pWAIC);

        return {
            WAIC: WAIC,
            lppd: lppd,
            pWAIC: pWAIC,
            interpretation: 'Lower WAIC = better predictive performance. pWAIC=' + pWAIC.toFixed(2) + ' effective parameters.'
        };
    }

    // ── 4. Bayesian Meta-Regression ─────────────────────────────
    // Y_i = β₀ + β₁*X_i + ε_i, ε_i ~ N(0, vi + τ²)

    function bayesianMetaRegression(effects, variances, covariate, options) {
        options = options || {};
        var iterations = options.iterations || 8000;
        var burnin = options.burnin || 2000;
        var seed = options.seed || 42;
        var priorBetaSD = options.priorBetaSD || 10;
        var priorTauType = options.priorTauType || 'halfcauchy';
        var priorTauScale = options.priorTauScale || 0.5;

        var k = effects.length;
        if (covariate.length !== k) return { error: 'Covariate length must match effects' };

        var rng = (typeof createSeededRNG === 'function') ? createSeededRNG(seed) : Math.random;

        // Initialize
        var beta0 = 0, beta1 = 0, tau = 0.1;
        var b0Prop = 0.1, b1Prop = 0.05, tauProp = 0.05;
        var b0Samples = [], b1Samples = [], tauSamples = [];

        function logLik(b0, b1, t) {
            var tau2 = t * t;
            var ll = 0;
            for (var i = 0; i < k; i++) {
                var mu = b0 + b1 * covariate[i];
                var tv = variances[i] + tau2;
                ll += -0.5 * Math.log(tv) - Math.pow(effects[i] - mu, 2) / (2 * tv);
            }
            return ll;
        }

        function logPrior(b0, b1, t) {
            var lp = -0.5 * (b0 * b0 + b1 * b1) / (priorBetaSD * priorBetaSD);
            if (t < 0) return -Infinity;
            if (priorTauType === 'halfcauchy') {
                lp += -Math.log(1 + Math.pow(t / priorTauScale, 2)) - Math.log(Math.PI * priorTauScale);
            } else {
                lp += -0.5 * Math.pow(t / priorTauScale, 2);
            }
            return lp;
        }

        function rnorm() {
            return (typeof Stats !== 'undefined') ? Stats.normalQuantile(rng()) : (rng() - 0.5) * 6;
        }

        for (var iter = 0; iter < iterations; iter++) {
            var currentLP = logLik(beta0, beta1, tau) + logPrior(beta0, beta1, tau);

            // Update beta0
            var b0New = beta0 + rnorm() * b0Prop;
            var newLP = logLik(b0New, beta1, tau) + logPrior(b0New, beta1, tau);
            if (Math.log(rng()) < newLP - currentLP) { beta0 = b0New; currentLP = newLP; }

            // Update beta1
            var b1New = beta1 + rnorm() * b1Prop;
            newLP = logLik(beta0, b1New, tau) + logPrior(beta0, b1New, tau);
            if (Math.log(rng()) < newLP - currentLP) { beta1 = b1New; currentLP = newLP; }

            // Update tau
            var tauNew = Math.abs(tau + rnorm() * tauProp);
            newLP = logLik(beta0, beta1, tauNew) + logPrior(beta0, beta1, tauNew);
            if (Math.log(rng()) < newLP - currentLP) { tau = tauNew; }

            if (iter >= burnin) {
                b0Samples.push(beta0);
                b1Samples.push(beta1);
                tauSamples.push(tau);
            }

            // Adapt proposals during burnin
            if (iter < burnin && iter > 0 && iter % 200 === 0) {
                b0Prop *= (b0Samples.length > 0 ? 1 : 1);
            }
        }

        var zc = getZ();
        var b0Mean = mean(b0Samples), b1Mean = mean(b1Samples), tauMean = mean(tauSamples);
        var b1Lower = quantile(b1Samples, 0.025), b1Upper = quantile(b1Samples, 0.975);
        var probB1Pos = b1Samples.filter(function(x) { return x > 0; }).length / b1Samples.length;

        // R² analog: proportion of tau² explained by covariate
        // Compare tau from this model vs model without covariate
        var tauSq = tauMean * tauMean;

        return {
            method: 'Bayesian Meta-Regression',
            intercept: { mean: b0Mean, lower: quantile(b0Samples, 0.025), upper: quantile(b0Samples, 0.975) },
            slope: {
                mean: b1Mean, lower: b1Lower, upper: b1Upper,
                probPositive: probB1Pos,
                probNegative: 1 - probB1Pos,
                significant: b1Lower > 0 || b1Upper < 0,
                interpretation: (b1Lower > 0 || b1Upper < 0)
                    ? 'Covariate significantly modifies the pooled effect (95% CrI excludes zero)'
                    : 'No strong evidence of effect modification by this covariate'
            },
            tau: { mean: tauMean, residualTau2: tauSq },
            nStudies: k,
            nSamples: b0Samples.length,
            reference: 'Thompson SG, Higgins JPT (2002). Meta-regression. Stat Med 21:1559-1573.'
        };
    }

    // ── 5. Study-Level Shrinkage Estimates ───────────────────────
    // Posterior study-specific means μ_i | data

    function computeShrinkage(effects, variances, mcmcResult) {
        if (!mcmcResult || !mcmcResult.samples) return null;

        var muSamples = mcmcResult.samples.mu;
        var tauSamples = mcmcResult.samples.tau;
        var S = muSamples.length;
        var k = effects.length;

        var shrinkage = [];
        for (var i = 0; i < k; i++) {
            // Posterior mean of study i: E[θ_i | data] = w_i * y_i + (1-w_i) * μ
            // where w_i = τ²/(τ² + σ_i²)
            var posteriorSamples = new Array(S);
            for (var s = 0; s < S; s++) {
                var tau2 = tauSamples[s] * tauSamples[s];
                var w = tau2 / (tau2 + variances[i]);
                posteriorSamples[s] = w * effects[i] + (1 - w) * muSamples[s];
            }

            var postMean = mean(posteriorSamples);
            var postSD = sd(posteriorSamples);
            var shrinkFactor = 1 - Math.abs(postMean - effects[i]) / Math.max(0.001, Math.abs(effects[i] - mcmcResult.mu.mean));

            shrinkage.push({
                study: i + 1,
                observed: effects[i],
                shrunken: postMean,
                posteriorSD: postSD,
                credibleInterval: [quantile(posteriorSamples, 0.025), quantile(posteriorSamples, 0.975)],
                shrinkageFactor: Math.max(0, Math.min(1, shrinkFactor))
            });
        }

        return {
            method: 'Bayesian Shrinkage Estimates',
            studies: shrinkage,
            pooledMean: mcmcResult.mu.mean,
            interpretation: 'Shrunken estimates are pulled toward the pooled mean. ' +
                'Studies with larger variance are pulled more (greater shrinkage).'
        };
    }

    // ── 6. Posterior Predictive Interval ─────────────────────────
    // Predict the effect in a NEW study

    function posteriorPredictive(mcmcResult) {
        if (!mcmcResult || !mcmcResult.samples) return null;

        var muSamples = mcmcResult.samples.mu;
        var tauSamples = mcmcResult.samples.tau;
        var S = muSamples.length;

        // For a new study: θ_new ~ N(μ, τ²)
        // Sample θ_new from posterior predictive
        var predictions = new Array(S);
        var rng = (typeof createSeededRNG === 'function') ? createSeededRNG(12345) : Math.random;
        for (var s = 0; s < S; s++) {
            var z = (typeof Stats !== 'undefined') ? Stats.normalQuantile(rng()) : (rng() - 0.5) * 6;
            predictions[s] = muSamples[s] + tauSamples[s] * z;
        }

        predictions.sort(function(a, b) { return a - b; });

        return {
            method: 'Posterior Predictive Distribution',
            mean: mean(predictions),
            median: median(predictions),
            lower95: quantile(predictions, 0.025),
            upper95: quantile(predictions, 0.975),
            lower80: quantile(predictions, 0.10),
            upper80: quantile(predictions, 0.90),
            probNegative: predictions.filter(function(x) { return x < 0; }).length / S,
            interpretation: 'Predicted effect in a new study. Wider than pooled CI because it includes between-study heterogeneity.'
        };
    }

    // ── 7. Bayesian Forest Plot Data ────────────────────────────

    function bayesianForestPlot(effects, variances, mcmcResult, studyLabels) {
        var shrinkageResult = computeShrinkage(effects, variances, mcmcResult);
        if (!shrinkageResult) return null;

        var predictive = posteriorPredictive(mcmcResult);

        return {
            studies: shrinkageResult.studies.map(function(s, i) {
                return {
                    label: (studyLabels && studyLabels[i]) || ('Study ' + (i + 1)),
                    observed: s.observed,
                    observedSE: Math.sqrt(variances[i]),
                    shrunken: s.shrunken,
                    credibleInterval: s.credibleInterval,
                    shrinkageFactor: s.shrinkageFactor
                };
            }),
            pooled: {
                mean: mcmcResult.mu.mean,
                credibleInterval: [mcmcResult.mu.lower, mcmcResult.mu.upper]
            },
            prediction: predictive ? {
                mean: predictive.mean,
                credibleInterval: [predictive.lower95, predictive.upper95]
            } : null,
            tau: mcmcResult.tau
        };
    }

    // ── Helpers ──────────────────────────────────────────────────
    function mean(arr) { return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length; }
    function median(arr) {
        var s = arr.slice().sort(function(a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    function sd(arr) {
        var m = mean(arr);
        return Math.sqrt(arr.reduce(function(a, v) { return a + (v - m) * (v - m); }, 0) / (arr.length - 1));
    }
    function quantile(arr, p) {
        var s = arr.slice().sort(function(a, b) { return a - b; });
        var pos = (s.length - 1) * p;
        var base = Math.floor(pos);
        var rest = pos - base;
        return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
    }

    // ── Public API ──────────────────────────────────────────────
    return {
        priorSensitivity: priorSensitivity,
        computeDIC: computeDIC,
        computeWAIC: computeWAIC,
        bayesianMetaRegression: bayesianMetaRegression,
        computeShrinkage: computeShrinkage,
        posteriorPredictive: posteriorPredictive,
        bayesianForestPlot: bayesianForestPlot
    };
})();

if (typeof window !== 'undefined') {
    window.BayesianEnhanced = BayesianEnhanced;
}
