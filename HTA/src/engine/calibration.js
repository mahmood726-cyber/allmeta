/**
 * Model Calibration Engine for HTA Models
 * Likelihood-based calibration with optimization algorithms
 *
 * Reference:
 * - Vanni et al. "Calibrating Models in Economic Evaluation"
 * - Alarid-Escudero et al. "A Tutorial on Time-Dependent Cohort State-Transition Models"
 * - TreeAge Pro Calibration Tool equivalent
 *
 * Features:
 * - Likelihood-based calibration
 * - Nelder-Mead optimization
 * - Bayesian calibration (MCMC)
 * - Multiple target support
 * - Goodness-of-fit metrics
 * - Parameter bounds enforcement
 */

class CalibrationEngine {
    constructor(options = {}) {
        this.options = {
            maxIterations: 1000,
            tolerance: 1e-8,
            seed: 12345,
            verbose: false,
            ...options
        };

        this.rng = typeof PCG32 !== 'undefined' ? new PCG32(this.options.seed) : null;
        this.auditLogger = typeof getAuditLogger !== 'undefined' ? getAuditLogger() : null;
        this.evaluationCount = 0;
        this.progressCallback = null;
    }

    /**
     * Set progress callback
     */
    onProgress(callback) {
        this.progressCallback = callback;
    }

    /**
     * Random number generator
     */
    random() {
        return this.rng ? this.rng.random() : Math.random();
    }

    /**
     * Define calibration targets
     *
     * @example
     * targets = [
     *   { type: 'survival', time: 5, observed: 0.65, se: 0.05, state: 'alive' },
     *   { type: 'prevalence', time: 10, observed: 0.20, se: 0.03, state: 'progressed' },
     *   { type: 'incidence', time: 1, observed: 0.08, se: 0.02, transition: 'stable->progressed' }
     * ]
     */
    createTargets(targetDefinitions) {
        return targetDefinitions.map((def, idx) => ({
            id: def.id || `target_${idx}`,
            type: def.type,
            time: def.time,
            observed: def.observed,
            se: def.se || def.observed * 0.1,
            weight: def.weight || 1,
            state: def.state,
            transition: def.transition,
            ...def
        }));
    }

    /**
     * Run calibration
     *
     * @param {Object} project - HTA project
     * @param {Array} calibrationParams - Parameters to calibrate
     * @param {Array} targets - Calibration targets
     * @param {Object} options - Calibration options
     */
    async calibrate(project, calibrationParams, targets, options = {}) {
        const method = options.method || 'nelder-mead';
        const startTime = performance.now();

        this.evaluationCount = 0;

        // Extract initial values and bounds
        const paramInfo = this.extractParameterInfo(project, calibrationParams);

        // Run optimization
        let result;
        switch (method.toLowerCase()) {
            case 'nelder-mead':
                result = await this.nelderMead(project, paramInfo, targets, options);
                break;
            case 'mcmc':
            case 'bayesian':
                result = await this.mcmcCalibration(project, paramInfo, targets, options);
                break;
            case 'grid':
                result = await this.gridSearch(project, paramInfo, targets, options);
                break;
            default:
                result = await this.nelderMead(project, paramInfo, targets, options);
        }

        result.computation_time_ms = performance.now() - startTime;
        result.evaluations = this.evaluationCount;

        // Log to audit
        if (this.auditLogger) {
            this.auditLogger.info('calibration', 'Calibration completed', {
                method: method,
                parameters: calibrationParams.length,
                targets: targets.length,
                finalLogLik: result.logLikelihood,
                converged: result.converged
            });
        }

        return result;
    }

    /**
     * Extract parameter info (initial values, bounds)
     */
    extractParameterInfo(project, calibrationParams) {
        const params = project.parameters || {};
        const info = [];

        for (const paramDef of calibrationParams) {
            const paramId = typeof paramDef === 'string' ? paramDef : paramDef.id;
            const param = params[paramId];

            if (!param) {
                throw new Error(`Parameter ${paramId} not found in project`);
            }

            const defaultBounds = this.getDefaultBounds(param);

            info.push({
                id: paramId,
                initial: paramDef.initial ?? param.value,
                lower: paramDef.lower ?? defaultBounds.lower,
                upper: paramDef.upper ?? defaultBounds.upper,
                scale: paramDef.scale || 'linear',  // 'linear', 'log', 'logit'
                prior: paramDef.prior || null
            });
        }

        return info;
    }

    /**
     * Get default bounds based on parameter type
     */
    getDefaultBounds(param) {
        const dist = param.distribution?.type?.toLowerCase();
        const value = param.value;

        switch (dist) {
            case 'beta':
                return { lower: 0.001, upper: 0.999 };
            case 'gamma':
            case 'lognormal':
                return { lower: 0.001, upper: value * 10 };
            case 'normal':
                return { lower: value - 3 * (param.distribution.sd || value * 0.2),
                         upper: value + 3 * (param.distribution.sd || value * 0.2) };
            default:
                if (value >= 0 && value <= 1) {
                    return { lower: 0, upper: 1 };
                }
                return { lower: value * 0.1, upper: value * 10 };
        }
    }

    /**
     * Calculate log-likelihood for current parameter values
     */
    calculateLogLikelihood(project, paramValues, targets) {
        this.evaluationCount++;

        // Run model with current parameters
        const modelOutputs = this.runModelForCalibration(project, paramValues);

        let logLik = 0;

        for (const target of targets) {
            const predicted = this.extractModelOutput(modelOutputs, target);

            if (predicted === null || predicted === undefined) {
                continue;
            }

            // Weighted squared error (Gaussian likelihood)
            const diff = predicted - target.observed;
            const variance = target.se ** 2;
            const contribution = -0.5 * Math.log(2 * Math.PI * variance)
                                - 0.5 * (diff ** 2) / variance;

            logLik += target.weight * contribution;
        }

        return logLik;
    }

    /**
     * Run model with specific parameter values
     */
    runModelForCalibration(project, paramValues) {
        // Create modified project with calibration parameters
        const modifiedProject = JSON.parse(JSON.stringify(project));

        for (const [paramId, value] of Object.entries(paramValues)) {
            if (modifiedProject.parameters[paramId]) {
                modifiedProject.parameters[paramId].value = value;
            }
        }

        // Run Markov model
        if (typeof MarkovEngine !== 'undefined') {
            const engine = new MarkovEngine();
            const results = engine.runAllStrategies(modifiedProject);
            return results;
        }

        return null;
    }

    /**
     * Extract model output matching target
     */
    extractModelOutput(modelOutputs, target) {
        if (!modelOutputs?.strategies) return null;

        // Get first strategy results
        const strategyKey = Object.keys(modelOutputs.strategies)[0];
        const stratResults = modelOutputs.strategies[strategyKey];

        if (!stratResults?.trace) return null;

        const trace = stratResults.trace;
        const cycleIdx = Math.min(target.time, trace.cycles.length - 1);

        switch (target.type) {
            case 'survival':
            case 'prevalence': {
                // Proportion in specified state at time t
                const stateTrace = trace.states[target.state];
                if (stateTrace && stateTrace[cycleIdx] !== undefined) {
                    return stateTrace[cycleIdx];
                }
                break;
            }

            case 'cumulative_survival': {
                // 1 - proportion in death state
                const deathState = Object.keys(trace.states).find(s =>
                    s.toLowerCase().includes('dead') || s.toLowerCase().includes('death')
                );
                if (deathState && trace.states[deathState]) {
                    return 1 - trace.states[deathState][cycleIdx];
                }
                break;
            }

            case 'mortality':
            case 'death_proportion': {
                const deathState = Object.keys(trace.states).find(s =>
                    s.toLowerCase().includes('dead') || s.toLowerCase().includes('death')
                );
                if (deathState && trace.states[deathState]) {
                    return trace.states[deathState][cycleIdx];
                }
                break;
            }

            case 'cost': {
                // Cumulative cost up to time t
                if (trace.cumulative_costs && trace.cumulative_costs[cycleIdx] !== undefined) {
                    return trace.cumulative_costs[cycleIdx];
                }
                break;
            }
        }

        return null;
    }

    /**
     * Nelder-Mead simplex optimization
     */
    async nelderMead(project, paramInfo, targets, options = {}) {
        const n = paramInfo.length;
        const maxIter = options.maxIterations || this.options.maxIterations;
        const tol = options.tolerance || this.options.tolerance;

        // Reflection/expansion/contraction coefficients
        const alpha = 1.0;    // Reflection
        const gamma = 2.0;    // Expansion
        const rho = 0.5;      // Contraction
        const sigma = 0.5;    // Shrink

        // Initialize simplex
        const simplex = this.initializeSimplex(paramInfo);

        // Evaluate all vertices
        const values = [];
        for (const vertex of simplex) {
            const paramValues = this.arrayToParamValues(vertex, paramInfo);
            values.push(this.calculateLogLikelihood(project, paramValues, targets));
        }

        let iterations = 0;
        let converged = false;

        while (iterations < maxIter) {
            // Sort vertices by function value (descending for maximization)
            const indices = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);

            // Check convergence
            const range = values[indices[0]] - values[indices[n]];
            if (range < tol) {
                converged = true;
                break;
            }

            // Best, second worst, and worst indices
            const best = indices[0];
            const secondWorst = indices[n - 1];
            const worst = indices[n];

            // Calculate centroid (excluding worst)
            const centroid = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    centroid[j] += simplex[indices[i]][j] / n;
                }
            }

            // Reflection
            const reflected = centroid.map((c, j) =>
                this.clampValue(c + alpha * (c - simplex[worst][j]), paramInfo[j])
            );
            const reflectedVal = this.calculateLogLikelihood(
                project, this.arrayToParamValues(reflected, paramInfo), targets
            );

            if (reflectedVal > values[secondWorst] && reflectedVal <= values[best]) {
                // Accept reflection
                simplex[worst] = reflected;
                values[worst] = reflectedVal;
            } else if (reflectedVal > values[best]) {
                // Expansion
                const expanded = centroid.map((c, j) =>
                    this.clampValue(c + gamma * (reflected[j] - c), paramInfo[j])
                );
                const expandedVal = this.calculateLogLikelihood(
                    project, this.arrayToParamValues(expanded, paramInfo), targets
                );

                if (expandedVal > reflectedVal) {
                    simplex[worst] = expanded;
                    values[worst] = expandedVal;
                } else {
                    simplex[worst] = reflected;
                    values[worst] = reflectedVal;
                }
            } else {
                // Contraction
                const contracted = centroid.map((c, j) =>
                    this.clampValue(c + rho * (simplex[worst][j] - c), paramInfo[j])
                );
                const contractedVal = this.calculateLogLikelihood(
                    project, this.arrayToParamValues(contracted, paramInfo), targets
                );

                if (contractedVal > values[worst]) {
                    simplex[worst] = contracted;
                    values[worst] = contractedVal;
                } else {
                    // Shrink
                    for (let i = 1; i <= n; i++) {
                        const idx = indices[i];
                        for (let j = 0; j < n; j++) {
                            simplex[idx][j] = simplex[best][j] +
                                sigma * (simplex[idx][j] - simplex[best][j]);
                            simplex[idx][j] = this.clampValue(simplex[idx][j], paramInfo[j]);
                        }
                        values[idx] = this.calculateLogLikelihood(
                            project, this.arrayToParamValues(simplex[idx], paramInfo), targets
                        );
                    }
                }
            }

            iterations++;

            // Progress callback
            if (this.progressCallback && iterations % 10 === 0) {
                await this.progressCallback(iterations, maxIter, values[indices[0]]);
            }
        }

        // Get best solution
        const bestIdx = values.indexOf(Math.max(...values));
        const bestParams = this.arrayToParamValues(simplex[bestIdx], paramInfo);

        // Calculate goodness of fit
        const gof = this.calculateGoodnessOfFit(project, bestParams, targets);

        return {
            method: 'nelder-mead',
            converged: converged,
            iterations: iterations,
            parameters: bestParams,
            logLikelihood: values[bestIdx],
            goodnessOfFit: gof,
            targetComparison: this.getTargetComparison(project, bestParams, targets)
        };
    }

    /**
     * Initialize simplex around initial values
     */
    initializeSimplex(paramInfo) {
        const n = paramInfo.length;
        const simplex = [];

        // First vertex at initial values
        const initial = paramInfo.map(p => p.initial);
        simplex.push(initial);

        // Remaining vertices offset by 5% of range
        for (let i = 0; i < n; i++) {
            const vertex = [...initial];
            const range = paramInfo[i].upper - paramInfo[i].lower;
            vertex[i] = Math.min(
                paramInfo[i].upper,
                Math.max(paramInfo[i].lower, vertex[i] + 0.05 * range)
            );
            simplex.push(vertex);
        }

        return simplex;
    }

    /**
     * Convert parameter array to named object
     */
    arrayToParamValues(array, paramInfo) {
        const values = {};
        for (let i = 0; i < paramInfo.length; i++) {
            values[paramInfo[i].id] = array[i];
        }
        return values;
    }

    /**
     * Clamp value to parameter bounds
     */
    clampValue(value, paramDef) {
        return Math.max(paramDef.lower, Math.min(paramDef.upper, value));
    }

    /**
     * MCMC Bayesian calibration using Metropolis-Hastings
     */
    async mcmcCalibration(project, paramInfo, targets, options = {}) {
        const n = paramInfo.length;
        const numSamples = options.samples || 5000;
        const burnin = options.burnin || 1000;
        const thin = options.thin || 1;

        // Initialize chain at initial values
        let current = paramInfo.map(p => p.initial);
        let currentLogLik = this.calculateLogLikelihood(
            project, this.arrayToParamValues(current, paramInfo), targets
        );
        let currentLogPrior = this.calculateLogPrior(current, paramInfo);

        // Adaptive proposal scale
        const proposalScale = paramInfo.map(p => (p.upper - p.lower) * 0.1);

        // Storage for samples
        const samples = [];
        const logLikValues = [];
        let acceptCount = 0;

        for (let iter = 0; iter < numSamples; iter++) {
            // Propose new values
            const proposed = current.map((val, i) =>
                this.clampValue(
                    val + this.randomNormal(0, proposalScale[i]),
                    paramInfo[i]
                )
            );

            const proposedLogLik = this.calculateLogLikelihood(
                project, this.arrayToParamValues(proposed, paramInfo), targets
            );
            const proposedLogPrior = this.calculateLogPrior(proposed, paramInfo);

            // Metropolis-Hastings acceptance
            const logAcceptRatio = (proposedLogLik + proposedLogPrior) -
                                   (currentLogLik + currentLogPrior);

            if (Math.log(this.random()) < logAcceptRatio) {
                current = proposed;
                currentLogLik = proposedLogLik;
                currentLogPrior = proposedLogPrior;
                acceptCount++;
            }

            // Store sample (after burnin, with thinning)
            if (iter >= burnin && (iter - burnin) % thin === 0) {
                samples.push([...current]);
                logLikValues.push(currentLogLik);
            }

            // Progress callback
            if (this.progressCallback && iter % 100 === 0) {
                await this.progressCallback(iter, numSamples, currentLogLik);
            }
        }

        // Calculate posterior statistics
        const posteriorMeans = new Array(n).fill(0);
        const posteriorSDs = new Array(n).fill(0);

        for (const sample of samples) {
            for (let i = 0; i < n; i++) {
                posteriorMeans[i] += sample[i] / samples.length;
            }
        }

        for (const sample of samples) {
            for (let i = 0; i < n; i++) {
                posteriorSDs[i] += (sample[i] - posteriorMeans[i]) ** 2;
            }
        }

        for (let i = 0; i < n; i++) {
            posteriorSDs[i] = Math.sqrt(posteriorSDs[i] / (samples.length - 1));
        }

        // Best parameters (MAP estimate)
        const bestIdx = logLikValues.indexOf(Math.max(...logLikValues));
        const bestParams = this.arrayToParamValues(samples[bestIdx], paramInfo);

        return {
            method: 'mcmc',
            converged: true,
            samples: samples.length,
            acceptanceRate: acceptCount / numSamples,
            parameters: bestParams,
            posteriorMeans: this.arrayToParamValues(posteriorMeans, paramInfo),
            posteriorSDs: this.arrayToParamValues(posteriorSDs, paramInfo),
            logLikelihood: logLikValues[bestIdx],
            goodnessOfFit: this.calculateGoodnessOfFit(project, bestParams, targets),
            targetComparison: this.getTargetComparison(project, bestParams, targets),
            chainSamples: samples,
            chainLogLik: logLikValues
        };
    }

    /**
     * Calculate log prior probability
     */
    calculateLogPrior(values, paramInfo) {
        let logPrior = 0;

        for (let i = 0; i < values.length; i++) {
            const info = paramInfo[i];
            const value = values[i];

            if (info.prior) {
                // Use specified prior
                logPrior += this.evaluateLogPrior(value, info.prior);
            } else {
                // Uniform prior (constant contribution, can ignore)
                if (value < info.lower || value > info.upper) {
                    return -Infinity;
                }
            }
        }

        return logPrior;
    }

    /**
     * Evaluate log prior for specific distribution
     */
    evaluateLogPrior(value, prior) {
        switch (prior.type?.toLowerCase()) {
            case 'normal':
                return -0.5 * ((value - prior.mean) / prior.sd) ** 2;

            case 'beta': {
                if (value <= 0 || value >= 1) return -Infinity;
                return (prior.alpha - 1) * Math.log(value) +
                       (prior.beta - 1) * Math.log(1 - value);
            }

            case 'gamma': {
                if (value <= 0) return -Infinity;
                const shape = prior.shape || prior.alpha;
                const rate = prior.rate || 1 / prior.scale;
                return (shape - 1) * Math.log(value) - rate * value;
            }

            default:
                return 0;  // Uniform
        }
    }

    /**
     * Random normal (Box-Muller)
     */
    randomNormal(mean = 0, sd = 1) {
        const u1 = this.random();
        const u2 = this.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }

    /**
     * Grid search calibration
     */
    async gridSearch(project, paramInfo, targets, options = {}) {
        const gridPoints = options.gridPoints || 5;
        const n = paramInfo.length;

        // Generate grid
        const grids = paramInfo.map(info => {
            const points = [];
            for (let i = 0; i < gridPoints; i++) {
                points.push(info.lower + (info.upper - info.lower) * i / (gridPoints - 1));
            }
            return points;
        });

        // Evaluate all combinations
        let bestParams = null;
        let bestLogLik = -Infinity;

        const totalCombinations = Math.pow(gridPoints, n);
        let combination = 0;

        const evaluateGrid = async (paramIndex, currentValues) => {
            if (paramIndex === n) {
                const paramValues = this.arrayToParamValues(currentValues, paramInfo);
                const logLik = this.calculateLogLikelihood(project, paramValues, targets);

                combination++;
                if (this.progressCallback && combination % 10 === 0) {
                    await this.progressCallback(combination, totalCombinations, bestLogLik);
                }

                if (logLik > bestLogLik) {
                    bestLogLik = logLik;
                    bestParams = { ...paramValues };
                }
                return;
            }

            for (const value of grids[paramIndex]) {
                await evaluateGrid(paramIndex + 1, [...currentValues, value]);
            }
        };

        await evaluateGrid(0, []);

        return {
            method: 'grid',
            converged: true,
            gridPoints: gridPoints,
            totalEvaluations: totalCombinations,
            parameters: bestParams,
            logLikelihood: bestLogLik,
            goodnessOfFit: this.calculateGoodnessOfFit(project, bestParams, targets),
            targetComparison: this.getTargetComparison(project, bestParams, targets)
        };
    }

    /**
     * Calculate goodness of fit metrics
     */
    calculateGoodnessOfFit(project, paramValues, targets) {
        const modelOutputs = this.runModelForCalibration(project, paramValues);

        let sumSqError = 0;
        let sumSqTotal = 0;
        const meanObserved = targets.reduce((s, t) => s + t.observed, 0) / targets.length;
        let chi2 = 0;
        let n = 0;

        for (const target of targets) {
            const predicted = this.extractModelOutput(modelOutputs, target);
            if (predicted === null) continue;

            const error = predicted - target.observed;
            sumSqError += error ** 2;
            sumSqTotal += (target.observed - meanObserved) ** 2;
            chi2 += (error / target.se) ** 2;
            n++;
        }

        const rSquared = sumSqTotal > 0 ? 1 - sumSqError / sumSqTotal : 0;
        const rmse = Math.sqrt(sumSqError / n);
        const pValue = n > 0 ? 1 - this.chiSquaredCDF(chi2, n) : 1;

        return {
            rSquared: rSquared,
            rmse: rmse,
            chiSquared: chi2,
            degreesOfFreedom: n,
            pValue: pValue,
            aic: 2 * Object.keys(paramValues).length - 2 * this.calculateLogLikelihood(project, paramValues, targets),
            bic: Object.keys(paramValues).length * Math.log(n) - 2 * this.calculateLogLikelihood(project, paramValues, targets)
        };
    }

    /**
     * Chi-squared CDF approximation
     */
    chiSquaredCDF(x, df) {
        if (x <= 0) return 0;
        return this.regularizedGammaP(df / 2, x / 2);
    }

    /**
     * Regularized lower incomplete gamma function P(a, x)
     */
    regularizedGammaP(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        if (x < a + 1) {
            // Series representation
            let sum = 1 / a;
            let term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-10) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
        } else {
            // Continued fraction
            return 1 - this.regularizedGammaQ(a, x);
        }
    }

    /**
     * Upper incomplete gamma Q(a, x) = 1 - P(a, x)
     */
    regularizedGammaQ(a, x) {
        let b = x + 1 - a;
        let c = 1e30;
        let d = 1 / b;
        let h = d;

        for (let i = 1; i < 100; i++) {
            const an = -i * (i - a);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = b + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1) < 1e-10) break;
        }

        return Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
    }

    /**
     * Log gamma function
     */
    logGamma(x) {
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

    /**
     * Get comparison of predicted vs observed for each target
     */
    getTargetComparison(project, paramValues, targets) {
        const modelOutputs = this.runModelForCalibration(project, paramValues);
        const comparison = [];

        for (const target of targets) {
            const predicted = this.extractModelOutput(modelOutputs, target);
            comparison.push({
                id: target.id,
                type: target.type,
                time: target.time,
                observed: target.observed,
                predicted: predicted,
                error: predicted !== null ? predicted - target.observed : null,
                percentError: predicted !== null ?
                    ((predicted - target.observed) / target.observed * 100) : null,
                withinCI: predicted !== null ?
                    Math.abs(predicted - target.observed) <= StatUtils.normalInverseCDF(0.975) * target.se : null
            });
        }

        return comparison;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CalibrationEngine = CalibrationEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CalibrationEngine };
}
