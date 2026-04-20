/**
 * Survival Analysis Engine for HTA Artifact Standard v0.2
 *
 * Features:
 * - Kaplan-Meier data import (digitized or raw)
 * - Parametric distribution fitting (7 distributions)
 * - Maximum Likelihood Estimation (MLE)
 * - AIC/BIC model selection
 * - Hazard ratio application
 * - Treatment effect waning
 * - Cure fraction models
 * - Visual comparison tools
 *
 * Distributions supported:
 * - Exponential
 * - Weibull
 * - Log-Normal
 * - Log-Logistic
 * - Gompertz
 * - Generalized Gamma
 * - Spline (Royston-Parmar)
 */

class SurvivalAnalysisEngine {
    constructor() {
        this.distributions = {
            'exponential': ExponentialDistribution,
            'weibull': WeibullDistribution,
            'lognormal': LogNormalDistribution,
            'loglogistic': LogLogisticDistribution,
            'gompertz': GompertzDistribution,
            'gamma': GeneralizedGammaDistribution,
            'spline': RoystonParmarSpline
        };
    }

    /**
     * Import Kaplan-Meier data from digitized points
     * @param {Array} points - Array of {time, survival, atRisk?} objects
     * @param {Object} options - Import options
     */
    importKaplanMeier(points, options = {}) {
        const {
            timeUnit = 'months',
            interpolate = true,
            smoothing = 0
        } = options;

        // Sort by time
        const sorted = [...points].sort((a, b) => a.time - b.time);

        // Validate survival values
        let lastSurv = 1.0;
        const validated = sorted.map((p, i) => {
            if (p.survival > lastSurv) {
                // Survival increased at this time point, capping to previous value
                p.survival = lastSurv;
            }
            lastSurv = p.survival;
            return { ...p };
        });

        // Calculate events and censoring if not provided
        const kmData = this.reconstructEvents(validated, options);

        return {
            points: validated,
            events: kmData.events,
            totalPatients: kmData.totalPatients,
            totalEvents: kmData.totalEvents,
            medianSurvival: this.calculateMedian(validated),
            meanSurvival: this.calculateRestrictedMean(validated),
            timeUnit,
            raw: kmData
        };
    }

    /**
     * Reconstruct event data from KM curve points
     * Uses the algorithm from Guyot et al. (2012) BMC Medical Research Methodology
     */
    reconstructEvents(points, options = {}) {
        const { totalPatients = 100, atRiskProvided = false } = options;

        const events = [];
        let nRisk = totalPatients;

        for (let i = 0; i < points.length; i++) {
            const curr = points[i];
            const prev = i > 0 ? points[i - 1] : { time: 0, survival: 1.0 };

            // Calculate number of events in this interval
            const survRatio = prev.survival > 0 ? curr.survival / prev.survival : 0;
            const nEvents = Math.round(nRisk * (1 - survRatio));

            // Calculate censored (if at-risk numbers provided)
            let nCensored = 0;
            if (atRiskProvided && curr.atRisk !== undefined && prev.atRisk !== undefined) {
                nCensored = prev.atRisk - curr.atRisk - nEvents;
                nCensored = Math.max(0, nCensored);
            }

            if (nEvents > 0 || nCensored > 0) {
                events.push({
                    time: curr.time,
                    events: nEvents,
                    censored: nCensored,
                    atRisk: nRisk,
                    survival: curr.survival,
                    cumHazard: -Math.log(Math.max(curr.survival, 0.001))
                });
            }

            nRisk -= (nEvents + nCensored);
            nRisk = Math.max(0, nRisk);
        }

        return {
            events,
            totalPatients,
            totalEvents: events.reduce((sum, e) => sum + e.events, 0)
        };
    }

    /**
     * Calculate median survival from KM curve
     */
    calculateMedian(points) {
        for (let i = 0; i < points.length; i++) {
            if (points[i].survival <= 0.5) {
                if (i === 0) return points[i].time;
                // Linear interpolation
                const prev = points[i - 1];
                const curr = points[i];
                const frac = (0.5 - prev.survival) / (curr.survival - prev.survival);
                return prev.time + frac * (curr.time - prev.time);
            }
        }
        return null; // Median not reached
    }

    /**
     * Calculate restricted mean survival time (RMST)
     */
    calculateRestrictedMean(points, maxTime = null) {
        if (points.length === 0) return 0;

        const tMax = maxTime || points[points.length - 1].time;
        let rmst = 0;

        for (let i = 1; i < points.length; i++) {
            if (points[i].time > tMax) break;

            const dt = points[i].time - points[i - 1].time;
            const avgSurv = (points[i].survival + points[i - 1].survival) / 2;
            rmst += dt * avgSurv;
        }

        return rmst;
    }

    /**
     * Fit all parametric distributions to KM data
     * @param {Object} kmData - Imported KM data
     * @param {Object} options - Fitting options
     */
    fitAllDistributions(kmData, options = {}) {
        const {
            distributions = ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma'],
            maxIterations = 1000,
            tolerance = 1e-8
        } = options;

        const results = {};
        const events = kmData.events || kmData.raw.events;

        for (const distName of distributions) {
            try {
                const DistClass = this.distributions[distName];
                if (!DistClass) continue;

                const dist = new DistClass();
                const fit = dist.fit(events, { maxIterations, tolerance });

                // Calculate goodness-of-fit metrics
                const gof = this.calculateGoodnessOfFit(dist, events, fit);

                results[distName] = {
                    distribution: distName,
                    parameters: fit.parameters,
                    logLikelihood: fit.logLikelihood,
                    aic: gof.aic,
                    bic: gof.bic,
                    aicc: gof.aicc,
                    rmse: gof.rmse,
                    r2: gof.r2,
                    convergence: fit.convergence,
                    iterations: fit.iterations,
                    fitted: dist
                };
            } catch (err) {
                console.warn(`Failed to fit ${distName}:`, err.message);
                results[distName] = { error: err.message };
            }
        }

        // Rank by AIC
        const ranked = Object.entries(results)
            .filter(([_, r]) => !r.error)
            .sort((a, b) => a[1].aic - b[1].aic)
            .map(([name, result], rank) => ({
                ...result,
                rank: rank + 1,
                deltaAIC: rank === 0 ? 0 : result.aic - Object.values(results).filter(r => !r.error)[0].aic
            }));

        return {
            fits: results,
            ranked,
            best: ranked[0] || null,
            recommendation: this.generateRecommendation(ranked)
        };
    }

    /**
     * Calculate goodness-of-fit metrics
     */
    calculateGoodnessOfFit(dist, events, fit) {
        const n = events.length;
        const k = Object.keys(fit.parameters).length;
        const ll = fit.logLikelihood;

        // AIC = -2*LL + 2*k
        const aic = -2 * ll + 2 * k;

        // BIC = -2*LL + k*ln(n)
        const bic = -2 * ll + k * Math.log(n);

        // AICc = AIC + 2*k*(k+1)/(n-k-1) - corrected for small samples
        const aicc = n > k + 1 ? aic + (2 * k * (k + 1)) / (n - k - 1) : Infinity;

        // Calculate predicted vs observed
        let ssRes = 0;
        let ssTot = 0;
        const meanSurv = events.reduce((s, e) => s + e.survival, 0) / n;

        for (const event of events) {
            const predicted = dist.survival(event.time);
            ssRes += (event.survival - predicted) ** 2;
            ssTot += (event.survival - meanSurv) ** 2;
        }

        const r2 = 1 - ssRes / ssTot;
        const rmse = Math.sqrt(ssRes / n);

        return { aic, bic, aicc, r2, rmse };
    }

    /**
     * Generate model selection recommendation
     */
    generateRecommendation(ranked) {
        if (ranked.length === 0) return "No models could be fitted.";
        if (ranked.length === 1) return `Only ${ranked[0].distribution} converged. Use with caution.`;

        const best = ranked[0];
        const second = ranked[1];
        const deltaAIC = second.aic - best.aic;

        let recommendation = `Best fit: ${best.distribution} (AIC: ${best.aic.toFixed(2)}).\n`;

        if (deltaAIC < 2) {
            recommendation += `However, ${second.distribution} is nearly equivalent (ΔAIC: ${deltaAIC.toFixed(2)}). `;
            recommendation += `Consider clinical plausibility and hazard function shapes for final selection.`;
        } else if (deltaAIC < 10) {
            recommendation += `${second.distribution} is also reasonable (ΔAIC: ${deltaAIC.toFixed(2)}).`;
        } else {
            recommendation += `Clear preference over alternatives (ΔAIC > 10).`;
        }

        // Add clinical considerations
        recommendation += `\n\nClinical considerations:\n`;
        recommendation += `- Weibull: Monotonic hazard (increasing or decreasing)\n`;
        recommendation += `- Log-Normal/Log-Logistic: Non-monotonic hazard (rises then falls)\n`;
        recommendation += `- Gompertz: Biological aging, background mortality\n`;
        recommendation += `- Gamma: Flexible, can capture complex patterns`;

        return recommendation;
    }

    /**
     * Apply hazard ratio to a fitted distribution
     */
    applyHazardRatio(fittedDist, hr, options = {}) {
        const {
            waning = null,  // {startTime, endTime, pattern: 'linear'|'exponential'}
            maxTime = 100
        } = options;

        return {
            survival: (t) => {
                const baseS = fittedDist.survival(t);
                let effectiveHR = hr;

                if (waning && t > waning.startTime) {
                    const waningProgress = Math.min(1, (t - waning.startTime) / (waning.endTime - waning.startTime));
                    if (waning.pattern === 'exponential') {
                        effectiveHR = 1 + (hr - 1) * Math.exp(-3 * waningProgress);
                    } else {
                        effectiveHR = hr + (1 - hr) * waningProgress;
                    }
                }

                // S_treatment(t) = S_control(t)^HR
                return Math.pow(baseS, effectiveHR);
            },
            hazard: (t) => {
                const baseH = fittedDist.hazard(t);
                let effectiveHR = hr;

                if (waning && t > waning.startTime) {
                    const waningProgress = Math.min(1, (t - waning.startTime) / (waning.endTime - waning.startTime));
                    if (waning.pattern === 'exponential') {
                        effectiveHR = 1 + (hr - 1) * Math.exp(-3 * waningProgress);
                    } else {
                        effectiveHR = hr + (1 - hr) * waningProgress;
                    }
                }

                return baseH * effectiveHR;
            },
            hr,
            waning,
            baseDistribution: fittedDist
        };
    }

    /**
     * Create cure fraction model (mixture cure model)
     */
    createCureModel(fittedDist, cureFraction) {
        // S_cure(t) = cure + (1 - cure) * S_uncured(t)
        return {
            survival: (t) => {
                return cureFraction + (1 - cureFraction) * fittedDist.survival(t);
            },
            hazard: (t) => {
                const s = fittedDist.survival(t);
                const h = fittedDist.hazard(t);
                const sCure = cureFraction + (1 - cureFraction) * s;
                return ((1 - cureFraction) * h * s) / sCure;
            },
            cureFraction,
            baseDistribution: fittedDist
        };
    }

    /**
     * Generate survival curve points for plotting
     */
    generateCurve(dist, maxTime, numPoints = 100) {
        const points = [];
        const dt = maxTime / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const t = i * dt;
            points.push({
                time: t,
                survival: dist.survival(t),
                hazard: dist.hazard ? dist.hazard(t) : null,
                cumHazard: dist.cumHazard ? dist.cumHazard(t) : -Math.log(Math.max(dist.survival(t), 1e-10))
            });
        }

        return points;
    }

    /**
     * Compare multiple survival curves
     */
    compareCurves(curves, maxTime, options = {}) {
        const { numPoints = 100, calculateDifferences = true } = options;
        const comparison = {};

        for (const [name, dist] of Object.entries(curves)) {
            comparison[name] = this.generateCurve(dist, maxTime, numPoints);
        }

        if (calculateDifferences && Object.keys(curves).length === 2) {
            const [name1, name2] = Object.keys(curves);
            const curve1 = comparison[name1];
            const curve2 = comparison[name2];

            comparison.difference = curve1.map((p, i) => ({
                time: p.time,
                survivalDiff: p.survival - curve2[i].survival,
                hazardRatio: curve2[i].hazard > 0 ? p.hazard / curve2[i].hazard : null
            }));

            // Calculate life years gained
            let lyg = 0;
            for (let i = 1; i < curve1.length; i++) {
                const dt = curve1[i].time - curve1[i - 1].time;
                const avgDiff = (curve1[i].survival - curve2[i].survival +
                               curve1[i - 1].survival - curve2[i - 1].survival) / 2;
                lyg += dt * avgDiff;
            }
            comparison.lifeYearsGained = lyg;
        }

        return comparison;
    }
}


/**
 * Exponential Distribution
 * S(t) = exp(-λt)
 * h(t) = λ (constant hazard)
 */
class ExponentialDistribution {
    constructor(lambda = null) {
        this.lambda = lambda;
        this.name = 'exponential';
        this.nParams = 1;
    }

    survival(t) {
        return Math.exp(-this.lambda * t);
    }

    hazard(t) {
        return this.lambda;
    }

    cumHazard(t) {
        return this.lambda * t;
    }

    density(t) {
        return this.lambda * Math.exp(-this.lambda * t);
    }

    fit(events, options = {}) {
        // MLE for exponential: λ = d / Σt
        // where d = total events, Σt = total person-time
        let totalEvents = 0;
        let totalTime = 0;

        for (const e of events) {
            totalEvents += e.events;
            totalTime += e.atRisk * (e.time - (events.indexOf(e) > 0 ? events[events.indexOf(e) - 1].time : 0));
        }

        // Simplified: use sum of event times
        totalTime = events.reduce((sum, e) => sum + e.time * e.events, 0);
        this.lambda = totalEvents / totalTime;

        // Log-likelihood
        const ll = this.calculateLogLikelihood(events);

        return {
            parameters: { lambda: this.lambda },
            logLikelihood: ll,
            convergence: true,
            iterations: 1
        };
    }

    calculateLogLikelihood(events) {
        let ll = 0;
        for (const e of events) {
            // Contribution from events: d * log(h(t))
            if (e.events > 0) {
                ll += e.events * Math.log(this.lambda);
            }
            // Contribution from survival: -H(t) * n_at_risk
            ll -= this.lambda * e.time * (e.events + e.censored);
        }
        return ll;
    }
}


/**
 * Weibull Distribution
 * S(t) = exp(-(λt)^γ)
 * h(t) = λγ(λt)^(γ-1)
 */
class WeibullDistribution {
    constructor(lambda = null, gamma = null) {
        this.lambda = lambda;  // scale
        this.gamma = gamma;    // shape
        this.name = 'weibull';
        this.nParams = 2;
    }

    survival(t) {
        if (t <= 0) return 1;
        return Math.exp(-Math.pow(this.lambda * t, this.gamma));
    }

    hazard(t) {
        if (t <= 0) return 0;
        return this.lambda * this.gamma * Math.pow(this.lambda * t, this.gamma - 1);
    }

    cumHazard(t) {
        return Math.pow(this.lambda * t, this.gamma);
    }

    density(t) {
        return this.hazard(t) * this.survival(t);
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;

        // Initial estimates using linear regression on log-log scale
        // log(-log(S(t))) = γ*log(λ) + γ*log(t)
        const loglogData = events
            .filter(e => e.survival > 0 && e.survival < 1)
            .map(e => ({
                x: Math.log(e.time),
                y: Math.log(-Math.log(e.survival))
            }));

        if (loglogData.length < 2) {
            // Fallback to exponential as starting point
            this.gamma = 1;
            const expDist = new ExponentialDistribution();
            expDist.fit(events);
            this.lambda = expDist.lambda;
        } else {
            // Linear regression
            const n = loglogData.length;
            const sumX = loglogData.reduce((s, p) => s + p.x, 0);
            const sumY = loglogData.reduce((s, p) => s + p.y, 0);
            const sumXY = loglogData.reduce((s, p) => s + p.x * p.y, 0);
            const sumX2 = loglogData.reduce((s, p) => s + p.x * p.x, 0);

            this.gamma = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - this.gamma * sumX) / n;
            this.lambda = Math.exp(intercept / this.gamma);
        }

        // Ensure valid starting values
        this.gamma = Math.max(0.1, Math.min(10, this.gamma));
        this.lambda = Math.max(0.001, Math.min(10, this.lambda));

        // Newton-Raphson optimization
        let converged = false;
        let iter = 0;

        for (iter = 0; iter < maxIterations; iter++) {
            const { gradient, hessian } = this.calculateGradientHessian(events);

            // Check convergence
            if (Math.abs(gradient[0]) < tolerance && Math.abs(gradient[1]) < tolerance) {
                converged = true;
                break;
            }

            // Newton step with damping
            const det = hessian[0][0] * hessian[1][1] - hessian[0][1] * hessian[1][0];
            if (Math.abs(det) < 1e-10) break;

            const invH = [
                [hessian[1][1] / det, -hessian[0][1] / det],
                [-hessian[1][0] / det, hessian[0][0] / det]
            ];

            let step = [
                invH[0][0] * gradient[0] + invH[0][1] * gradient[1],
                invH[1][0] * gradient[0] + invH[1][1] * gradient[1]
            ];

            // Damped update
            const dampFactor = 0.5;
            const newLambda = this.lambda - dampFactor * step[0];
            const newGamma = this.gamma - dampFactor * step[1];

            if (newLambda > 0 && newGamma > 0) {
                this.lambda = newLambda;
                this.gamma = newGamma;
            } else {
                // Reduce step size
                this.lambda = Math.max(0.001, this.lambda - 0.1 * step[0]);
                this.gamma = Math.max(0.1, this.gamma - 0.1 * step[1]);
            }
        }

        return {
            parameters: { lambda: this.lambda, gamma: this.gamma },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: converged,
            iterations: iter
        };
    }

    calculateLogLikelihood(events) {
        let ll = 0;
        for (const e of events) {
            if (e.events > 0) {
                ll += e.events * (Math.log(this.lambda) + Math.log(this.gamma) +
                                  (this.gamma - 1) * Math.log(this.lambda * e.time));
            }
            ll -= Math.pow(this.lambda * e.time, this.gamma) * (e.events + e.censored);
        }
        return ll;
    }

    calculateGradientHessian(events) {
        let dLambda = 0, dGamma = 0;
        let d2Lambda = 0, d2Gamma = 0, d2LambdaGamma = 0;

        for (const e of events) {
            const lt = this.lambda * e.time;
            const ltg = Math.pow(lt, this.gamma);
            const logLt = Math.log(Math.max(lt, 1e-10));

            if (e.events > 0) {
                dLambda += e.events * this.gamma / this.lambda;
                dGamma += e.events * (1 / this.gamma + logLt);
            }

            const n = e.events + e.censored;
            dLambda -= n * this.gamma * ltg / this.lambda;
            dGamma -= n * ltg * logLt;

            // Second derivatives (simplified)
            d2Lambda -= n * this.gamma * (this.gamma - 1) * ltg / (this.lambda * this.lambda);
            d2Gamma -= n * ltg * logLt * logLt;
        }

        return {
            gradient: [dLambda, dGamma],
            hessian: [[d2Lambda, d2LambdaGamma], [d2LambdaGamma, d2Gamma]]
        };
    }
}


/**
 * Log-Normal Distribution
 * S(t) = 1 - Φ((log(t) - μ) / σ)
 * h(t) = φ((log(t) - μ) / σ) / (σ * t * S(t))
 */
class LogNormalDistribution {
    constructor(mu = null, sigma = null) {
        this.mu = mu;      // location (log-scale mean)
        this.sigma = sigma; // scale (log-scale sd)
        this.name = 'lognormal';
        this.nParams = 2;
    }

    // Standard normal CDF
    normCDF(z) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

        const sign = z < 0 ? -1 : 1;
        z = Math.abs(z) / Math.sqrt(2);
        const t = 1 / (1 + p * z);
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
        return 0.5 * (1 + sign * y);
    }

    // Standard normal PDF
    normPDF(z) {
        return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    }

    survival(t) {
        if (t <= 0) return 1;
        const z = (Math.log(t) - this.mu) / this.sigma;
        return 1 - this.normCDF(z);
    }

    hazard(t) {
        if (t <= 0) return 0;
        const z = (Math.log(t) - this.mu) / this.sigma;
        const s = this.survival(t);
        if (s < 1e-10) return 0;
        return this.normPDF(z) / (this.sigma * t * s);
    }

    cumHazard(t) {
        const s = this.survival(t);
        return -Math.log(Math.max(s, 1e-10));
    }

    density(t) {
        if (t <= 0) return 0;
        const z = (Math.log(t) - this.mu) / this.sigma;
        return this.normPDF(z) / (this.sigma * t);
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;

        // Initial estimates from log-transformed event times
        const logTimes = events.flatMap(e =>
            Array(e.events).fill(Math.log(e.time))
        );

        if (logTimes.length === 0) {
            this.mu = Math.log(events[Math.floor(events.length / 2)].time);
            this.sigma = 1;
        } else {
            this.mu = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
            this.sigma = Math.sqrt(
                logTimes.reduce((s, x) => s + (x - this.mu) ** 2, 0) / logTimes.length
            ) || 1;
        }

        // Simplex optimization (Nelder-Mead)
        let params = [this.mu, Math.log(this.sigma)];
        const result = this.nelderMead(
            (p) => -this.evalLogLikelihood(events, p[0], Math.exp(p[1])),
            params,
            { maxIterations, tolerance }
        );

        this.mu = result.params[0];
        this.sigma = Math.exp(result.params[1]);

        return {
            parameters: { mu: this.mu, sigma: this.sigma },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: result.converged,
            iterations: result.iterations
        };
    }

    evalLogLikelihood(events, mu, sigma) {
        let ll = 0;
        for (const e of events) {
            const z = (Math.log(e.time) - mu) / sigma;
            if (e.events > 0) {
                ll += e.events * (Math.log(this.normPDF(z)) - Math.log(sigma) - Math.log(e.time));
            }
            const s = 1 - this.normCDF(z);
            if (s > 0) {
                ll += e.censored * Math.log(s);
            }
        }
        return ll;
    }

    calculateLogLikelihood(events) {
        return this.evalLogLikelihood(events, this.mu, this.sigma);
    }

    nelderMead(f, x0, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;
        const n = x0.length;

        // Initialize simplex
        let simplex = [{ x: [...x0], fx: f(x0) }];
        for (let i = 0; i < n; i++) {
            const xi = [...x0];
            xi[i] += 0.5;
            simplex.push({ x: xi, fx: f(xi) });
        }
        simplex.sort((a, b) => a.fx - b.fx);

        let converged = false;
        let iter = 0;

        for (iter = 0; iter < maxIterations; iter++) {
            // Check convergence
            const spread = simplex[n].fx - simplex[0].fx;
            if (spread < tolerance) {
                converged = true;
                break;
            }

            // Centroid of best n points
            const centroid = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    centroid[j] += simplex[i].x[j] / n;
                }
            }

            // Reflection
            const xr = centroid.map((c, i) => 2 * c - simplex[n].x[i]);
            const fxr = f(xr);

            if (fxr < simplex[0].fx) {
                // Expansion
                const xe = centroid.map((c, i) => 3 * c - 2 * simplex[n].x[i]);
                const fxe = f(xe);
                if (fxe < fxr) {
                    simplex[n] = { x: xe, fx: fxe };
                } else {
                    simplex[n] = { x: xr, fx: fxr };
                }
            } else if (fxr < simplex[n - 1].fx) {
                simplex[n] = { x: xr, fx: fxr };
            } else {
                // Contraction
                const xc = centroid.map((c, i) => 0.5 * (c + simplex[n].x[i]));
                const fxc = f(xc);
                if (fxc < simplex[n].fx) {
                    simplex[n] = { x: xc, fx: fxc };
                } else {
                    // Shrink
                    for (let i = 1; i <= n; i++) {
                        simplex[i].x = simplex[i].x.map((xi, j) => 0.5 * (xi + simplex[0].x[j]));
                        simplex[i].fx = f(simplex[i].x);
                    }
                }
            }

            simplex.sort((a, b) => a.fx - b.fx);
        }

        return { params: simplex[0].x, value: simplex[0].fx, converged, iterations: iter };
    }
}


/**
 * Log-Logistic Distribution
 * S(t) = 1 / (1 + (λt)^γ)
 * h(t) = λγ(λt)^(γ-1) / (1 + (λt)^γ)
 */
class LogLogisticDistribution {
    constructor(lambda = null, gamma = null) {
        this.lambda = lambda;  // scale
        this.gamma = gamma;    // shape
        this.name = 'loglogistic';
        this.nParams = 2;
    }

    survival(t) {
        if (t <= 0) return 1;
        return 1 / (1 + Math.pow(this.lambda * t, this.gamma));
    }

    hazard(t) {
        if (t <= 0) return 0;
        const lt = this.lambda * t;
        return (this.lambda * this.gamma * Math.pow(lt, this.gamma - 1)) / (1 + Math.pow(lt, this.gamma));
    }

    cumHazard(t) {
        return Math.log(1 + Math.pow(this.lambda * t, this.gamma));
    }

    density(t) {
        return this.hazard(t) * this.survival(t);
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;

        // Initial estimates from median
        const medianEvent = events.find(e => e.survival <= 0.5) || events[Math.floor(events.length / 2)];
        this.lambda = 1 / medianEvent.time;
        this.gamma = 1;

        // Nelder-Mead optimization
        const lognormal = new LogNormalDistribution();
        const result = lognormal.nelderMead(
            (p) => -this.evalLogLikelihood(events, Math.exp(p[0]), Math.exp(p[1])),
            [Math.log(this.lambda), Math.log(this.gamma)],
            { maxIterations, tolerance }
        );

        this.lambda = Math.exp(result.params[0]);
        this.gamma = Math.exp(result.params[1]);

        return {
            parameters: { lambda: this.lambda, gamma: this.gamma },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: result.converged,
            iterations: result.iterations
        };
    }

    evalLogLikelihood(events, lambda, gamma) {
        let ll = 0;
        for (const e of events) {
            const lt = lambda * e.time;
            const ltg = Math.pow(lt, gamma);

            if (e.events > 0) {
                ll += e.events * (Math.log(lambda) + Math.log(gamma) + (gamma - 1) * Math.log(lt) - Math.log(1 + ltg));
            }
            ll -= (e.events + e.censored) * Math.log(1 + ltg);
        }
        return ll;
    }

    calculateLogLikelihood(events) {
        return this.evalLogLikelihood(events, this.lambda, this.gamma);
    }
}


/**
 * Gompertz Distribution
 * S(t) = exp(-(b/a)(exp(at) - 1))
 * h(t) = b * exp(at)
 */
class GompertzDistribution {
    constructor(a = null, b = null) {
        this.a = a;  // shape (aging rate)
        this.b = b;  // scale (baseline hazard)
        this.name = 'gompertz';
        this.nParams = 2;
    }

    survival(t) {
        if (t <= 0) return 1;
        return Math.exp(-(this.b / this.a) * (Math.exp(this.a * t) - 1));
    }

    hazard(t) {
        return this.b * Math.exp(this.a * t);
    }

    cumHazard(t) {
        return (this.b / this.a) * (Math.exp(this.a * t) - 1);
    }

    density(t) {
        return this.hazard(t) * this.survival(t);
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;

        // Initial estimates
        this.a = 0.1;
        this.b = 0.01;

        // Nelder-Mead optimization
        const lognormal = new LogNormalDistribution();
        const result = lognormal.nelderMead(
            (p) => -this.evalLogLikelihood(events, p[0], Math.exp(p[1])),
            [this.a, Math.log(this.b)],
            { maxIterations, tolerance }
        );

        this.a = result.params[0];
        this.b = Math.exp(result.params[1]);

        return {
            parameters: { a: this.a, b: this.b },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: result.converged,
            iterations: result.iterations
        };
    }

    evalLogLikelihood(events, a, b) {
        let ll = 0;
        for (const e of events) {
            if (e.events > 0) {
                ll += e.events * (Math.log(b) + a * e.time);
            }
            ll -= (e.events + e.censored) * (b / a) * (Math.exp(a * e.time) - 1);
        }
        return ll;
    }

    calculateLogLikelihood(events) {
        return this.evalLogLikelihood(events, this.a, this.b);
    }
}


/**
 * Generalized Gamma Distribution
 * Flexible 3-parameter distribution that includes Weibull, Gamma, and Log-Normal as special cases
 */
class GeneralizedGammaDistribution {
    constructor(mu = null, sigma = null, Q = null) {
        this.mu = mu;      // location
        this.sigma = sigma; // scale
        this.Q = Q;        // shape (Q=0 is log-normal, Q=1 is Weibull, Q=σ is gamma)
        this.name = 'gamma';
        this.nParams = 3;
    }

    // Incomplete gamma function (regularized)
    gammainc(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        // Use series expansion for small x
        if (x < a + 1) {
            let sum = 1 / a;
            let term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-10) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.lgamma(a));
        }

        // Use continued fraction for large x
        return 1 - this.gammainc_upper(a, x);
    }

    gammainc_upper(a, x) {
        let f = 1e-30;
        let c = 1e-30;
        let d = 0;

        for (let i = 1; i < 100; i++) {
            const an = i * (a - i);
            const bn = (2 * i - 1) + x - a;
            d = bn + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = bn + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const delta = c * d;
            f *= delta;
            if (Math.abs(delta - 1) < 1e-10) break;
        }

        return f * Math.exp(-x + a * Math.log(x) - this.lgamma(a));
    }

    lgamma(x) {
        const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                   -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
        let y = x;
        let tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;
        for (let j = 0; j < 6; j++) {
            ser += c[j] / ++y;
        }
        return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    survival(t) {
        if (t <= 0) return 1;
        if (Math.abs(this.Q) < 0.001) {
            // Log-normal case
            const lognorm = new LogNormalDistribution(this.mu, this.sigma);
            return lognorm.survival(t);
        }

        const w = (Math.log(t) - this.mu) / this.sigma;
        const Q2 = this.Q * this.Q;
        const u = Q2 * Math.exp(this.Q * w);

        if (this.Q > 0) {
            return 1 - this.gammainc(1 / Q2, u);
        } else {
            return this.gammainc(1 / Q2, u);
        }
    }

    hazard(t) {
        if (t <= 0) return 0;
        const s = this.survival(t);
        if (s < 1e-10) return 0;
        return this.density(t) / s;
    }

    density(t) {
        if (t <= 0) return 0;
        if (Math.abs(this.Q) < 0.001) {
            const lognorm = new LogNormalDistribution(this.mu, this.sigma);
            return lognorm.density(t);
        }

        const w = (Math.log(t) - this.mu) / this.sigma;
        const Q2 = this.Q * this.Q;
        const absQ = Math.abs(this.Q);
        const u = Q2 * Math.exp(this.Q * w);

        const logf = Math.log(absQ) - Math.log(this.sigma) - Math.log(t) -
                     this.lgamma(1 / Q2) +
                     (1 / Q2 - 1) * Math.log(u) - u;

        return Math.exp(logf);
    }

    cumHazard(t) {
        return -Math.log(Math.max(this.survival(t), 1e-10));
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8 } = options;

        // Initial estimates from log-normal fit
        const lognorm = new LogNormalDistribution();
        lognorm.fit(events, options);
        this.mu = lognorm.mu;
        this.sigma = lognorm.sigma;
        this.Q = 0.1;

        // Nelder-Mead optimization
        const result = lognorm.nelderMead(
            (p) => -this.evalLogLikelihood(events, p[0], Math.exp(p[1]), p[2]),
            [this.mu, Math.log(this.sigma), this.Q],
            { maxIterations, tolerance }
        );

        this.mu = result.params[0];
        this.sigma = Math.exp(result.params[1]);
        this.Q = result.params[2];

        return {
            parameters: { mu: this.mu, sigma: this.sigma, Q: this.Q },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: result.converged,
            iterations: result.iterations
        };
    }

    evalLogLikelihood(events, mu, sigma, Q) {
        const oldMu = this.mu, oldSigma = this.sigma, oldQ = this.Q;
        this.mu = mu; this.sigma = sigma; this.Q = Q;

        let ll = 0;
        for (const e of events) {
            if (e.events > 0) {
                const d = this.density(e.time);
                if (d > 0) ll += e.events * Math.log(d);
            }
            if (e.censored > 0) {
                const s = this.survival(e.time);
                if (s > 0) ll += e.censored * Math.log(s);
            }
        }

        this.mu = oldMu; this.sigma = oldSigma; this.Q = oldQ;
        return ll;
    }

    calculateLogLikelihood(events) {
        return this.evalLogLikelihood(events, this.mu, this.sigma, this.Q);
    }
}


/**
 * Royston-Parmar Spline Model
 * Flexible spline-based survival model
 */
class RoystonParmarSpline {
    constructor(knots = null, gammas = null, scale = 'hazard') {
        this.knots = knots;    // spline knots on log time scale
        this.gammas = gammas;  // spline coefficients
        this.scale = scale;    // 'hazard', 'odds', or 'normal'
        this.name = 'spline';
        this.nParams = null;   // depends on number of knots
    }

    // Basis functions for restricted cubic splines
    basisFunction(x, knots) {
        const k = knots.length;
        const basis = [1, x];  // Intercept and linear term

        for (let j = 0; j < k - 2; j++) {
            const kj = knots[j];
            const kk1 = knots[k - 2];
            const kk = knots[k - 1];

            const term1 = Math.max(0, x - kj) ** 3;
            const term2 = ((kk - kj) / (kk - kk1)) * Math.max(0, x - kk1) ** 3;
            const term3 = ((kk1 - kj) / (kk - kk1)) * Math.max(0, x - kk) ** 3;

            basis.push(term1 - term2 + term3);
        }

        return basis;
    }

    // Derivative of basis functions
    basisDerivative(x, knots) {
        const k = knots.length;
        const dbasis = [0, 1];

        for (let j = 0; j < k - 2; j++) {
            const kj = knots[j];
            const kk1 = knots[k - 2];
            const kk = knots[k - 1];

            let term = 0;
            if (x > kj) term += 3 * (x - kj) ** 2;
            if (x > kk1) term -= 3 * ((kk - kj) / (kk - kk1)) * (x - kk1) ** 2;
            if (x > kk) term += 3 * ((kk1 - kj) / (kk - kk1)) * (x - kk) ** 2;

            dbasis.push(term);
        }

        return dbasis;
    }

    survival(t) {
        if (t <= 0) return 1;
        const logT = Math.log(t);
        const basis = this.basisFunction(logT, this.knots);
        const eta = basis.reduce((sum, b, i) => sum + b * (this.gammas[i] || 0), 0);

        if (this.scale === 'hazard') {
            return Math.exp(-Math.exp(eta));
        } else if (this.scale === 'odds') {
            return 1 / (1 + Math.exp(eta));
        } else {
            // Normal scale
            const lognorm = new LogNormalDistribution();
            return 1 - lognorm.normCDF(eta);
        }
    }

    hazard(t) {
        if (t <= 0) return 0;
        const logT = Math.log(t);
        const basis = this.basisFunction(logT, this.knots);
        const dbasis = this.basisDerivative(logT, this.knots);

        const eta = basis.reduce((sum, b, i) => sum + b * (this.gammas[i] || 0), 0);
        const deta = dbasis.reduce((sum, b, i) => sum + b * (this.gammas[i] || 0), 0);

        if (this.scale === 'hazard') {
            return (deta / t) * Math.exp(eta);
        } else if (this.scale === 'odds') {
            const expEta = Math.exp(eta);
            return (deta / t) * expEta / ((1 + expEta) ** 2 * (1 / (1 + expEta)));
        } else {
            const lognorm = new LogNormalDistribution();
            const s = this.survival(t);
            return s > 0 ? lognorm.normPDF(eta) * deta / (t * s) : 0;
        }
    }

    cumHazard(t) {
        return -Math.log(Math.max(this.survival(t), 1e-10));
    }

    density(t) {
        return this.hazard(t) * this.survival(t);
    }

    fit(events, options = {}) {
        const { maxIterations = 1000, tolerance = 1e-8, nKnots = 3 } = options;

        // Set knots at quantiles of log event times
        const logTimes = events.flatMap(e => Array(e.events).fill(Math.log(e.time))).sort((a, b) => a - b);

        if (logTimes.length < nKnots) {
            throw new Error('Not enough events to fit spline model');
        }

        this.knots = [];
        for (let i = 0; i < nKnots; i++) {
            const idx = Math.floor((i + 1) * logTimes.length / (nKnots + 1));
            this.knots.push(logTimes[idx]);
        }

        // Initial gammas
        this.gammas = new Array(nKnots).fill(0);
        this.gammas[0] = -2;  // Intercept for reasonable survival
        this.gammas[1] = 0.5; // Linear term
        this.nParams = nKnots;

        // Nelder-Mead optimization
        const lognorm = new LogNormalDistribution();
        const result = lognorm.nelderMead(
            (p) => -this.evalLogLikelihood(events, p),
            this.gammas,
            { maxIterations, tolerance }
        );

        this.gammas = result.params;

        return {
            parameters: { knots: this.knots, gammas: this.gammas, scale: this.scale },
            logLikelihood: this.calculateLogLikelihood(events),
            convergence: result.converged,
            iterations: result.iterations
        };
    }

    evalLogLikelihood(events, gammas) {
        const oldGammas = this.gammas;
        this.gammas = gammas;

        let ll = 0;
        for (const e of events) {
            if (e.events > 0) {
                const h = this.hazard(e.time);
                if (h > 0) ll += e.events * Math.log(h);
            }
            ll -= (e.events + e.censored) * this.cumHazard(e.time);
        }

        this.gammas = oldGammas;
        return ll;
    }

    calculateLogLikelihood(events) {
        return this.evalLogLikelihood(events, this.gammas);
    }
}


// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SurvivalAnalysisEngine,
        ExponentialDistribution,
        WeibullDistribution,
        LogNormalDistribution,
        LogLogisticDistribution,
        GompertzDistribution,
        GeneralizedGammaDistribution,
        RoystonParmarSpline
    };
}

// Browser global
if (typeof window !== 'undefined') {
    window.SurvivalAnalysisEngine = SurvivalAnalysisEngine;
    window.SurvivalDistributions = {
        Exponential: ExponentialDistribution,
        Weibull: WeibullDistribution,
        LogNormal: LogNormalDistribution,
        LogLogistic: LogLogisticDistribution,
        Gompertz: GompertzDistribution,
        GeneralizedGamma: GeneralizedGammaDistribution,
        RoystonParmar: RoystonParmarSpline
    };
}
