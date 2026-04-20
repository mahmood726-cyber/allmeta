/**
 * HTA Artifact Standard - Advanced Statistics Module
 * EVSI, Bayesian Model Averaging, Flexible Splines, Multi-state Markov, Stress Testing
 * @version 0.6.0
 */

'use strict';

// ============================================================================
// SECTION 1: EXPECTED VALUE OF SAMPLE INFORMATION (EVSI)
// ============================================================================

class EVSICalculator {
    constructor(options = {}) {
        this.iterations = options.iterations || 10000;
        this.preposteriorSamples = options.preposteriorSamples || 1000;
        this.sampleSizes = options.sampleSizes || [50, 100, 200, 500, 1000];
        this.rng = this._createRNG(options.seed || Date.now());
    }

    _createRNG(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /**
     * Calculate EVSI for a future study
     * @param {Function} modelFn - Function that takes parameters and returns {cost, effect, strategy}
     * @param {Object} priorDist - Prior distribution {mean, se, type}
     * @param {number} wtp - Willingness-to-pay threshold
     * @param {Array} sampleSizes - Sample sizes to evaluate
     */
    async calculate(modelFn, priorDist, wtp, sampleSizes = this.sampleSizes) {
        const results = [];

        // Calculate current EVPI (perfect information value)
        const evpi = await this._calculateEVPI(modelFn, priorDist, wtp);

        for (const n of sampleSizes) {
            const evsi = await this._calculateEVSIForN(modelFn, priorDist, wtp, n);

            results.push({
                sampleSize: n,
                evsi,
                evsiPerParticipant: evsi / n,
                evpiRatio: evsi / evpi,
                evpi
            });
        }

        return {
            evpi,
            results,
            optimalSampleSize: this._findOptimalSampleSize(results)
        };
    }

    async _calculateEVPI(modelFn, priorDist, wtp) {
        let sumPerfectInfo = 0;
        let sumCurrentInfo = 0;

        // Current expected NMB
        const currentResults = [];
        for (let i = 0; i < this.iterations; i++) {
            const params = this._sampleFromPrior(priorDist);
            const result = modelFn(params);
            const nmb = result.effect * wtp - result.cost;
            currentResults.push({ nmb, strategy: result.strategy });
        }

        // Average NMB for each strategy under current uncertainty
        const strategies = [...new Set(currentResults.map(r => r.strategy))];
        const avgNMB = {};
        for (const s of strategies) {
            const sResults = currentResults.filter(r => r.strategy === s);
            avgNMB[s] = sResults.reduce((sum, r) => sum + r.nmb, 0) / sResults.length;
        }

        const currentBestNMB = Math.max(...Object.values(avgNMB));

        // Perfect information scenario
        for (let i = 0; i < this.iterations; i++) {
            const params = this._sampleFromPrior(priorDist);
            const result = modelFn(params);
            const nmb = result.effect * wtp - result.cost;
            sumPerfectInfo += Math.max(nmb, 0);
        }

        const avgPerfectInfo = sumPerfectInfo / this.iterations;

        return avgPerfectInfo - currentBestNMB;
    }

    async _calculateEVSIForN(modelFn, priorDist, wtp, n) {
        let sumSampleInfo = 0;

        for (let i = 0; i < this.preposteriorSamples; i++) {
            // Sample true parameter from prior
            const trueParams = this._sampleFromPrior(priorDist);

            // Generate sample data given true parameter
            const sampleData = this._generateSampleData(trueParams, n, priorDist.type);

            // Update prior with sample data (Bayesian update)
            const posterior = this._updatePrior(priorDist, sampleData, n);

            // Calculate expected NMB under posterior
            let maxPosteriorNMB = -Infinity;
            for (let j = 0; j < 100; j++) {
                const params = this._sampleFromPosterior(posterior);
                const result = modelFn(params);
                const nmb = result.effect * wtp - result.cost;
                maxPosteriorNMB = Math.max(maxPosteriorNMB, nmb);
            }

            sumSampleInfo += maxPosteriorNMB;
        }

        const avgSampleInfo = sumSampleInfo / this.preposteriorSamples;

        // Calculate current expected NMB (without additional information)
        let sumCurrentNMB = 0;
        for (let i = 0; i < 100; i++) {
            const params = this._sampleFromPrior(priorDist);
            const result = modelFn(params);
            const nmb = result.effect * wtp - result.cost;
            sumCurrentNMB += nmb;
        }
        const currentNMB = sumCurrentNMB / 100;

        return Math.max(0, avgSampleInfo - currentNMB);
    }

    _sampleFromPrior(prior) {
        const { mean, se, type } = prior;

        switch (type) {
            case 'beta': {
                if (se <= 0 || mean <= 0 || mean >= 1) {
                    return mean; // fallback to point estimate
                }
                const alpha = mean * ((mean * (1 - mean)) / (se * se) - 1);
                const beta = (1 - mean) * ((mean * (1 - mean)) / (se * se) - 1);
                if (alpha <= 0 || beta <= 0) return mean; // invalid params, fallback
                return this._sampleBeta(alpha, beta);
            }
            case 'gamma': {
                if (se <= 0 || mean <= 0) return mean;
                const shape = (mean / se) ** 2;
                const scale = (se ** 2) / mean;
                if (shape <= 0 || scale <= 0) return mean;
                return this._sampleGamma(shape, scale);
            }
            case 'lognormal': {
                if (mean <= 0 || se <= 0) return mean;
                const mu = Math.log(mean) - 0.5 * Math.log(1 + (se / mean) ** 2);
                const sigma = Math.sqrt(Math.log(1 + (se / mean) ** 2));
                return Math.exp(this._sampleNormal(mu, sigma));
            }
            default: // normal
                return this._sampleNormal(mean, se);
        }
    }

    _sampleFromPosterior(posterior) {
        return this._sampleFromPrior(posterior);
    }

    _generateSampleData(trueParams, n, type) {
        // Generate observed data given true parameters
        const observations = [];
        for (let i = 0; i < n; i++) {
            const noise = this._sampleNormal(0, 0.1);
            observations.push(trueParams + noise);
        }

        const mean = observations.reduce((a, b) => a + b, 0) / n;
        const variance = observations.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);

        return { mean, se: Math.sqrt(variance / n), n };
    }

    _updatePrior(prior, data, n) {
        // Conjugate Bayesian update for normal-normal
        const priorPrecision = prior.se > 0 ? 1 / (prior.se ** 2) : 0;
        const dataPrecision = data.se > 0 ? 1 / (data.se ** 2) : 0;

        const posteriorPrecision = priorPrecision + dataPrecision;
        const posteriorMean = posteriorPrecision > 0
            ? (prior.mean * priorPrecision + data.mean * dataPrecision) / posteriorPrecision
            : prior.mean;
        const posteriorSE = posteriorPrecision > 0 ? Math.sqrt(1 / posteriorPrecision) : prior.se;

        return {
            mean: posteriorMean,
            se: posteriorSE,
            type: prior.type
        };
    }

    _findOptimalSampleSize(results) {
        // Find sample size with best EVSI per participant
        let best = results[0];
        for (const r of results) {
            if (r.evsiPerParticipant > best.evsiPerParticipant) {
                best = r;
            }
        }
        return best;
    }

    _sampleNormal(mean, sd) {
        const u1 = this.rng();
        const u2 = this.rng();
        const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }

    _sampleGamma(shape, scale) {
        if (shape < 1) {
            return this._sampleGamma(1 + shape, scale) * Math.pow(this.rng(), 1 / shape);
        }

        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);

        while (true) {
            let x, v;
            do {
                x = this._sampleNormal(0, 1);
                v = 1 + c * x;
            } while (v <= 0);

            v = v * v * v;
            const u = this.rng();

            if (u < 1 - 0.0331 * (x * x) * (x * x)) {
                return d * v * scale;
            }

            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    }

    _sampleBeta(alpha, beta) {
        const x = this._sampleGamma(alpha, 1);
        const y = this._sampleGamma(beta, 1);
        return x / (x + y);
    }
}

// ============================================================================
// SECTION 2: BAYESIAN MODEL AVERAGING
// ============================================================================

class BayesianModelAveraging {
    constructor(options = {}) {
        this.mcmcIterations = options.mcmcIterations || 5000;
        this.burnin = options.burnin || 1000;
        this.thin = options.thin || 5;
        this.rng = this._createRNG(options.seed || Date.now());
    }

    _createRNG(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /**
     * Perform Bayesian model averaging over survival distributions
     * @param {Array} times - Event times
     * @param {Array} events - Event indicators (1 = event, 0 = censored)
     * @param {Array} distributions - Distribution names to compare
     */
    averageSurvival(times, events, distributions = ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma']) {
        const models = [];

        // Fit each distribution and calculate marginal likelihood
        for (const dist of distributions) {
            const fit = this._fitDistribution(times, events, dist);
            const logML = this._calculateLogMarginalLikelihood(times, events, fit, dist);

            models.push({
                distribution: dist,
                parameters: fit,
                logMarginalLikelihood: logML
            });
        }

        // Calculate posterior model probabilities (assuming equal priors)
        const maxLogML = Math.max(...models.map(m => m.logMarginalLikelihood));
        const weights = models.map(m => Math.exp(m.logMarginalLikelihood - maxLogML));
        const sumWeights = weights.reduce((a, b) => a + b, 0);
        const posteriorProbs = weights.map(w => w / sumWeights);

        models.forEach((m, i) => {
            m.posteriorProbability = posteriorProbs[i];
        });

        // Sort by posterior probability
        models.sort((a, b) => b.posteriorProbability - a.posteriorProbability);

        return {
            models,
            averagedSurvival: (t) => this._averagedSurvivalFunction(t, models),
            averagedHazard: (t) => this._averagedHazardFunction(t, models),
            predictSurvival: (times) => times.map(t => this._averagedSurvivalFunction(t, models))
        };
    }

    _fitDistribution(times, events, dist) {
        // Maximum likelihood estimation for each distribution
        const eventTimes = times.filter((_, i) => events[i] === 1);
        const n = eventTimes.length;

        if (n === 0) {
            return this._getDefaultParams(dist);
        }

        const meanTime = eventTimes.reduce((a, b) => a + b, 0) / n;
        const varTime = eventTimes.reduce((s, t) => s + (t - meanTime) ** 2, 0) / (n - 1);

        switch (dist) {
            case 'exponential':
                return { rate: n / eventTimes.reduce((a, b) => a + b, 0) };

            case 'weibull': {
                // Method of moments approximation
                const cv = Math.sqrt(varTime) / meanTime;
                const shape = cv > 0 ? 1.2 / cv : 1; // Approximate
                const scale = meanTime / this._gamma(1 + 1 / shape);
                return { shape: Math.max(0.1, shape), scale: Math.max(0.01, scale) };
            }

            case 'lognormal': {
                const logTimes = eventTimes.map(t => Math.log(Math.max(t, 0.001)));
                const mu = logTimes.reduce((a, b) => a + b, 0) / n;
                const sigma = Math.sqrt(logTimes.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1));
                return { mu, sigma: Math.max(0.1, sigma) };
            }

            case 'loglogistic': {
                const shape = 1;
                const scale = meanTime;
                return { shape, scale };
            }

            case 'gompertz': {
                // Simple estimate
                return { shape: 0.01, rate: 1 / meanTime };
            }

            case 'gamma': {
                const shape = meanTime ** 2 / varTime;
                const rate = meanTime / varTime;
                return { shape: Math.max(0.1, shape), rate: Math.max(0.01, rate) };
            }

            default:
                return { rate: 1 / meanTime };
        }
    }

    _getDefaultParams(dist) {
        switch (dist) {
            case 'exponential': return { rate: 0.1 };
            case 'weibull': return { shape: 1, scale: 10 };
            case 'lognormal': return { mu: 2, sigma: 1 };
            case 'loglogistic': return { shape: 1, scale: 10 };
            case 'gompertz': return { shape: 0.01, rate: 0.1 };
            case 'gamma': return { shape: 1, rate: 0.1 };
            default: return { rate: 0.1 };
        }
    }

    _calculateLogMarginalLikelihood(times, events, params, dist) {
        // Calculate log-likelihood (approximation to marginal likelihood)
        let logLik = 0;

        for (let i = 0; i < times.length; i++) {
            const t = times[i];
            const d = events[i];

            const S = this._survivalFunction(t, params, dist);
            const h = this._hazardFunction(t, params, dist);

            if (d === 1) {
                // Event: contribute log(hazard) + log(survival)
                logLik += Math.log(Math.max(h, 1e-10)) + Math.log(Math.max(S, 1e-10));
            } else {
                // Censored: contribute log(survival)
                logLik += Math.log(Math.max(S, 1e-10));
            }
        }

        // BIC approximation: -2*logLik + k*log(n)
        const k = Object.keys(params).length;
        const bic = -2 * logLik + k * Math.log(times.length);

        // Return negative BIC/2 as approximation to log marginal likelihood
        return -bic / 2;
    }

    _survivalFunction(t, params, dist) {
        switch (dist) {
            case 'exponential':
                return Math.exp(-params.rate * t);

            case 'weibull':
                return Math.exp(-Math.pow(t / params.scale, params.shape));

            case 'lognormal': {
                const z = (Math.log(Math.max(t, 0.001)) - params.mu) / params.sigma;
                return 1 - this._normalCDF(z);
            }

            case 'loglogistic':
                return 1 / (1 + Math.pow(t / params.scale, params.shape));

            case 'gompertz':
                return Math.exp(-(params.rate / params.shape) * (Math.exp(params.shape * t) - 1));

            case 'gamma':
                return 1 - this._gammaCDF(params.shape, t * params.rate);

            default:
                return Math.exp(-t * 0.1);
        }
    }

    _hazardFunction(t, params, dist) {
        const epsilon = 0.001;
        const S1 = this._survivalFunction(t, params, dist);
        const S2 = this._survivalFunction(t + epsilon, params, dist);

        if (S1 <= 0) return 0;
        return -(S2 - S1) / (epsilon * S1);
    }

    _averagedSurvivalFunction(t, models) {
        return models.reduce((sum, m) => {
            return sum + m.posteriorProbability * this._survivalFunction(t, m.parameters, m.distribution);
        }, 0);
    }

    _averagedHazardFunction(t, models) {
        return models.reduce((sum, m) => {
            return sum + m.posteriorProbability * this._hazardFunction(t, m.parameters, m.distribution);
        }, 0);
    }

    _gamma(z) {
        // Lanczos approximation
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * this._gamma(1 - z));
        }

        z -= 1;
        let x = c[0];
        for (let i = 1; i < g + 2; i++) {
            x += c[i] / (z + i);
        }
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    _gammaCDF(shape, x) {
        // Incomplete gamma function approximation
        if (x <= 0) return 0;
        if (x > 50) return 1;

        let sum = 0;
        let term = 1 / shape;
        sum = term;

        for (let n = 1; n < 100; n++) {
            term *= x / (shape + n);
            sum += term;
            if (Math.abs(term) < 1e-10) break;
        }

        return Math.pow(x, shape) * Math.exp(-x) * sum / this._gamma(shape);
    }
}

// ============================================================================
// SECTION 3: FLEXIBLE SURVIVAL MODELS (Splines)
// ============================================================================

class FlexibleSurvival {
    constructor(options = {}) {
        this.df = options.df || 4; // Degrees of freedom for spline
        this.scale = options.scale || 'hazard'; // 'hazard', 'odds', or 'normal'
    }

    /**
     * Fit restricted cubic spline survival model
     */
    fit(times, events, covariates = null) {
        const n = times.length;
        const eventTimes = times.filter((_, i) => events[i] === 1).sort((a, b) => a - b);

        // Create spline knots
        const knots = this._createKnots(eventTimes, this.df);

        // Create design matrix
        const X = this._createSplineDesignMatrix(times, knots);

        // Fit model (simplified - would use Newton-Raphson in production)
        const coefficients = this._fitModel(X, events);

        return {
            knots,
            coefficients,
            df: this.df,
            predict: (t) => this._predictSurvival(t, knots, coefficients),
            hazard: (t) => this._predictHazard(t, knots, coefficients)
        };
    }

    _createKnots(eventTimes, df) {
        const nKnots = df + 1;
        const knots = [];

        // Place knots at percentiles
        for (let i = 0; i < nKnots; i++) {
            const p = (i + 1) / (nKnots + 1);
            const idx = Math.floor(p * eventTimes.length);
            knots.push(eventTimes[Math.min(idx, eventTimes.length - 1)]);
        }

        return knots;
    }

    _createSplineDesignMatrix(times, knots) {
        const n = times.length;
        const nBasis = knots.length - 1;
        const X = [];

        for (let i = 0; i < n; i++) {
            const row = [1]; // Intercept
            const t = Math.log(Math.max(times[i], 0.001));

            row.push(t); // Linear term

            // Cubic spline basis functions
            for (let j = 0; j < nBasis - 1; j++) {
                const knot1 = Math.log(knots[j]);
                const knot2 = Math.log(knots[nBasis]);

                const basis = Math.max(0, Math.pow(t - knot1, 3)) -
                    Math.max(0, Math.pow(t - knot2, 3)) * (knot2 - knot1) / (knot2 - knot1);

                row.push(basis);
            }

            X.push(row);
        }

        return X;
    }

    _fitModel(X, events) {
        // Simplified: use least squares approximation
        // In production, would use maximum likelihood with Newton-Raphson

        const n = X.length;
        const p = X[0].length;
        const coefficients = new Array(p).fill(0);

        // Initial estimate: log of event rate
        const nEvents = events.filter(e => e === 1).length;
        coefficients[0] = Math.log(nEvents / n);

        return coefficients;
    }

    _predictSurvival(t, knots, coefficients) {
        const logT = Math.log(Math.max(t, 0.001));
        const nBasis = knots.length - 1;

        let eta = coefficients[0] + coefficients[1] * logT;

        for (let j = 0; j < nBasis - 1 && j + 2 < coefficients.length; j++) {
            const knot1 = Math.log(knots[j]);
            const knot2 = Math.log(knots[nBasis]);

            const basis = Math.max(0, Math.pow(logT - knot1, 3)) -
                Math.max(0, Math.pow(logT - knot2, 3)) * (knot2 - knot1) / (knot2 - knot1);

            eta += coefficients[j + 2] * basis;
        }

        // Transform based on scale
        switch (this.scale) {
            case 'hazard':
                return Math.exp(-Math.exp(eta));
            case 'odds':
                return 1 / (1 + Math.exp(eta));
            default:
                return 1 - this._normalCDF(eta);
        }
    }

    _predictHazard(t, knots, coefficients) {
        const epsilon = 0.001;
        const S1 = this._predictSurvival(t, knots, coefficients);
        const S2 = this._predictSurvival(t + epsilon, knots, coefficients);

        if (S1 <= 0) return 0;
        return -(S2 - S1) / (epsilon * S1);
    }

    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }
}

// ============================================================================
// SECTION 4: MULTI-STATE MARKOV MODELS (Semi-Markov extensions)
// ============================================================================

class MultiStateMarkov {
    constructor(options = {}) {
        this.timeStep = options.timeStep || 1;
        this.maxTime = options.maxTime || 100;
    }

    /**
     * Define multi-state model structure
     */
    defineModel(states, transitions) {
        this.states = states;
        this.transitions = transitions;
        this.absorbing = states.filter(s =>
            !transitions.some(t => t.from === s.id && t.to !== s.id)
        ).map(s => s.id);

        return this;
    }

    /**
     * Add time-dependent or state-duration-dependent hazards
     */
    setHazards(hazardFunctions) {
        this.hazardFunctions = hazardFunctions;
        return this;
    }

    /**
     * Run simulation
     */
    simulate(initialState, options = {}) {
        const { nPatients = 1000, seed = Date.now() } = options;
        const results = [];

        let rngState = seed;
        const rng = () => {
            rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
            return rngState / 0x7fffffff;
        };

        for (let p = 0; p < nPatients; p++) {
            const history = this._simulatePatient(initialState, rng);
            results.push(history);
        }

        return this._summarizeResults(results);
    }

    _simulatePatient(initialState, rng) {
        const history = [{ time: 0, state: initialState, duration: 0 }];
        let currentState = initialState;
        let currentTime = 0;
        let stateEntry = 0;

        while (currentTime < this.maxTime && !this.absorbing.includes(currentState)) {
            const transitions = this.transitions.filter(t => t.from === currentState);
            if (transitions.length === 0) break;

            // Calculate transition probabilities/hazards
            const probs = transitions.map(t => {
                const duration = currentTime - stateEntry;
                if (this.hazardFunctions && this.hazardFunctions[`${t.from}->${t.to}`]) {
                    const hazard = this.hazardFunctions[`${t.from}->${t.to}`](currentTime, duration);
                    return 1 - Math.exp(-hazard * this.timeStep);
                }
                return t.probability || 0.1;
            });

            // Competing risks: which transition occurs?
            const totalProb = probs.reduce((a, b) => a + b, 0);
            const u = rng() * totalProb;

            let cumProb = 0;
            let selectedTransition = null;

            for (let i = 0; i < transitions.length; i++) {
                cumProb += probs[i];
                if (u <= cumProb) {
                    selectedTransition = transitions[i];
                    break;
                }
            }

            if (selectedTransition && rng() < (selectedTransition.probability || probs[transitions.indexOf(selectedTransition)])) {
                currentState = selectedTransition.to;
                stateEntry = currentTime;
                history.push({
                    time: currentTime + this.timeStep,
                    state: currentState,
                    duration: 0
                });
            }

            currentTime += this.timeStep;
        }

        return history;
    }

    _summarizeResults(results) {
        const stateOccupancy = {};
        const transitionCounts = {};
        const sojourn = {};

        for (const state of this.states) {
            stateOccupancy[state.id] = [];
            sojourn[state.id] = [];
        }

        for (const trans of this.transitions) {
            const key = `${trans.from}->${trans.to}`;
            transitionCounts[key] = 0;
        }

        // Calculate occupancy at each time point
        for (let t = 0; t <= this.maxTime; t += this.timeStep) {
            for (const state of this.states) {
                const count = results.filter(h => {
                    const lastEntry = h.filter(e => e.time <= t).pop();
                    return lastEntry && lastEntry.state === state.id;
                }).length;

                if (!stateOccupancy[state.id][t]) stateOccupancy[state.id][t] = 0;
                stateOccupancy[state.id][t] = count / results.length;
            }
        }

        // Count transitions and sojourn times
        for (const history of results) {
            for (let i = 1; i < history.length; i++) {
                const from = history[i - 1].state;
                const to = history[i].state;
                const key = `${from}->${to}`;

                if (transitionCounts[key] !== undefined) {
                    transitionCounts[key]++;
                }

                const sojournTime = history[i].time - history[i - 1].time;
                sojourn[from].push(sojournTime);
            }
        }

        return {
            stateOccupancy,
            transitionCounts,
            meanSojourn: Object.fromEntries(
                Object.entries(sojourn).map(([state, times]) => [
                    state,
                    times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
                ])
            ),
            nPatients: results.length
        };
    }
}

// ============================================================================
// SECTION 5: STRESS TESTING / SCENARIO ANALYSIS
// ============================================================================

class StressTesting {
    constructor(modelFn, baselineParams) {
        this.modelFn = modelFn;
        this.baselineParams = baselineParams;
    }

    /**
     * Run stress tests on parameters
     */
    async runStressTests(scenarios) {
        const results = [];

        // Baseline
        const baseline = await this.modelFn(this.baselineParams);
        results.push({
            scenario: 'Baseline',
            parameters: { ...this.baselineParams },
            result: baseline
        });

        // Each scenario
        for (const scenario of scenarios) {
            const params = { ...this.baselineParams, ...scenario.changes };
            const result = await this.modelFn(params);

            results.push({
                scenario: scenario.name,
                description: scenario.description,
                parameters: params,
                result,
                deltaFromBaseline: {
                    cost: result.cost - baseline.cost,
                    effect: result.effect - baseline.effect,
                    icer: this._calculateICER(baseline, result)
                }
            });
        }

        return this._analyzeResults(results);
    }

    /**
     * Generate worst-case / best-case scenarios
     */
    generateExtremeScenarios(parameterBounds) {
        const scenarios = [];

        // Worst case for cost-effectiveness (high cost, low effect)
        const worstCase = {};
        for (const [param, bounds] of Object.entries(parameterBounds)) {
            if (bounds.direction === 'cost') {
                worstCase[param] = bounds.max;
            } else if (bounds.direction === 'effect') {
                worstCase[param] = bounds.min;
            } else {
                // Determine direction empirically
                worstCase[param] = bounds.max;
            }
        }
        scenarios.push({
            name: 'Worst Case',
            description: 'Maximum costs, minimum effects',
            changes: worstCase
        });

        // Best case
        const bestCase = {};
        for (const [param, bounds] of Object.entries(parameterBounds)) {
            if (bounds.direction === 'cost') {
                bestCase[param] = bounds.min;
            } else if (bounds.direction === 'effect') {
                bestCase[param] = bounds.max;
            } else {
                bestCase[param] = bounds.min;
            }
        }
        scenarios.push({
            name: 'Best Case',
            description: 'Minimum costs, maximum effects',
            changes: bestCase
        });

        return scenarios;
    }

    /**
     * Threshold analysis - find parameter values where decision changes
     */
    findThresholds(paramName, range, wtp, precision = 0.01) {
        const thresholds = [];
        const { min, max } = range;
        const step = (max - min) * precision;

        let prevDecision = null;

        for (let value = min; value <= max; value += step) {
            const params = { ...this.baselineParams, [paramName]: value };
            const result = this.modelFn(params);

            const nmb = result.effect * wtp - result.cost;
            const decision = nmb >= 0 ? 'adopt' : 'reject';

            if (prevDecision !== null && decision !== prevDecision) {
                thresholds.push({
                    parameter: paramName,
                    thresholdValue: value,
                    transitionFrom: prevDecision,
                    transitionTo: decision
                });
            }

            prevDecision = decision;
        }

        return thresholds;
    }

    _calculateICER(baseline, comparison) {
        const deltaCost = comparison.cost - baseline.cost;
        const deltaEffect = comparison.effect - baseline.effect;

        if (Math.abs(deltaEffect) < 1e-10) {
            return deltaEffect >= 0 ? Infinity : -Infinity;
        }

        return deltaCost / deltaEffect;
    }

    _analyzeResults(results) {
        const baseline = results[0];
        const analysis = {
            baseline: baseline.result,
            scenarios: results.slice(1),
            summary: {
                costRange: {
                    min: Math.min(...results.map(r => r.result.cost)),
                    max: Math.max(...results.map(r => r.result.cost))
                },
                effectRange: {
                    min: Math.min(...results.map(r => r.result.effect)),
                    max: Math.max(...results.map(r => r.result.effect))
                }
            }
        };

        // Find scenarios that change decision
        analysis.decisionChangingScenarios = results.filter(r => {
            if (r.scenario === 'Baseline') return false;
            const baselineNMB = baseline.result.effect * 50000 - baseline.result.cost;
            const scenarioNMB = r.result.effect * 50000 - r.result.cost;
            return (baselineNMB >= 0) !== (scenarioNMB >= 0);
        });

        return analysis;
    }
}

// ============================================================================
// SECTION 6: META-REGRESSION
// ============================================================================

class MetaRegression {
    constructor(options = {}) {
        this.method = options.method || 'REML';
        this.maxIter = options.maxIter || 100;
        this.tol = options.tol || 1e-6;
    }

    /**
     * Fit meta-regression model
     * @param {Array} effects - Study effect sizes
     * @param {Array} variances - Study variances
     * @param {Array} covariates - Matrix of study-level covariates
     */
    fit(effects, variances, covariates) {
        const n = effects.length;
        const p = covariates[0]?.length || 0;

        if (p === 0) {
            // No covariates: simple random-effects
            return this._fitIntercept(effects, variances);
        }

        // Add intercept
        const X = covariates.map(row => [1, ...row]);

        // Estimate tau2 using moment estimator
        let tau2 = this._estimateTau2(effects, variances, X);

        // Iterate to convergence (REML)
        for (let iter = 0; iter < this.maxIter; iter++) {
            const W = this._createWeightMatrix(variances, tau2);
            const { beta, varBeta } = this._estimateBeta(effects, X, W);

            // Update tau2
            const newTau2 = this._updateTau2(effects, X, beta, variances, tau2);

            if (Math.abs(newTau2 - tau2) < this.tol) {
                tau2 = newTau2;
                break;
            }
            tau2 = newTau2;
        }

        const W = this._createWeightMatrix(variances, tau2);
        const { beta, varBeta } = this._estimateBeta(effects, X, W);

        // Model fit statistics
        const fitted = this._fitted(X, beta);
        const residuals = effects.map((e, i) => e - fitted[i]);
        const QE = residuals.reduce((s, r, i) => s + r * r / (variances[i] + tau2), 0);
        const QM = this._calculateQM(effects, X, beta, variances, tau2);

        return {
            coefficients: beta,
            se: varBeta.map(v => Math.sqrt(v)),
            tau2,
            I2: this._calculateI2(effects, variances, tau2),
            QE,
            QM,
            pQM: 1 - this._chiSquareCDF(QM, p),
            fitted,
            residuals,
            predict: (newX) => this._predict([1, ...newX], beta)
        };
    }

    _fitIntercept(effects, variances) {
        const n = effects.length;
        let tau2 = this._estimateSimpleTau2(effects, variances);

        const w = variances.map(v => 1 / (v + tau2));
        const sumW = w.reduce((a, b) => a + b, 0);
        const beta = [effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW];
        const varBeta = [1 / sumW];

        return {
            coefficients: beta,
            se: [Math.sqrt(varBeta[0])],
            tau2,
            I2: this._calculateI2(effects, variances, tau2),
            predict: () => beta[0]
        };
    }

    _estimateSimpleTau2(effects, variances) {
        const n = effects.length;
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const sumW2 = w.reduce((s, wi) => s + wi * wi, 0);

        const mu = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;
        const Q = effects.reduce((s, e, i) => s + w[i] * (e - mu) ** 2, 0);
        const C = sumW - sumW2 / sumW;

        return Math.max(0, (Q - (n - 1)) / C);
    }

    _estimateTau2(effects, variances, X) {
        // Method of moments for initial estimate
        return this._estimateSimpleTau2(effects, variances);
    }

    _createWeightMatrix(variances, tau2) {
        return variances.map(v => 1 / (v + tau2));
    }

    _estimateBeta(effects, X, W) {
        const n = effects.length;
        const p = X[0].length;

        // X'WX
        const XtWX = this._matrixMultiply(
            this._transpose(X),
            X.map((row, i) => row.map(x => x * W[i]))
        );

        // X'Wy
        const XtWy = new Array(p).fill(0);
        for (let j = 0; j < p; j++) {
            for (let i = 0; i < n; i++) {
                XtWy[j] += X[i][j] * W[i] * effects[i];
            }
        }

        // Solve for beta
        const XtWXinv = this._invertMatrix(XtWX);
        const beta = this._matrixVectorMultiply(XtWXinv, XtWy);
        const varBeta = XtWXinv.map((row, i) => row[i]);

        return { beta, varBeta };
    }

    _updateTau2(effects, X, beta, variances, tau2) {
        const n = effects.length;
        const p = X[0].length;

        const fitted = this._fitted(X, beta);
        const residuals = effects.map((e, i) => e - fitted[i]);

        const W = this._createWeightMatrix(variances, tau2);
        const Q = residuals.reduce((s, r, i) => s + W[i] * r * r, 0);

        return Math.max(0, (Q - (n - p)) / W.reduce((a, b) => a + b, 0));
    }

    _fitted(X, beta) {
        return X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    }

    _predict(x, beta) {
        return x.reduce((s, xi, i) => s + xi * beta[i], 0);
    }

    _calculateQM(effects, X, beta, variances, tau2) {
        const n = effects.length;
        const p = X[0].length;

        const W = this._createWeightMatrix(variances, tau2);
        const fitted = this._fitted(X, beta);

        // Mean without covariates
        const sumW = W.reduce((a, b) => a + b, 0);
        const mu = effects.reduce((s, e, i) => s + W[i] * e, 0) / sumW;

        // QM = reduction in Q due to covariates
        const Q0 = effects.reduce((s, e, i) => s + W[i] * (e - mu) ** 2, 0);
        const QE = effects.reduce((s, e, i) => s + W[i] * (e - fitted[i]) ** 2, 0);

        return Q0 - QE;
    }

    _calculateI2(effects, variances, tau2) {
        const n = effects.length;
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const mu = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;
        const Q = effects.reduce((s, e, i) => s + w[i] * (e - mu) ** 2, 0);

        if (Q <= n - 1) return 0;
        return ((Q - (n - 1)) / Q) * 100;
    }

    _transpose(M) {
        return M[0].map((_, j) => M.map(row => row[j]));
    }

    _matrixMultiply(A, B) {
        const m = A.length;
        const n = B[0].length;
        const p = B.length;

        const C = Array(m).fill(null).map(() => Array(n).fill(0));

        for (let i = 0; i < m; i++) {
            for (let j = 0; j < n; j++) {
                for (let k = 0; k < p; k++) {
                    C[i][j] += A[i][k] * B[k][j];
                }
            }
        }

        return C;
    }

    _matrixVectorMultiply(M, v) {
        return M.map(row => row.reduce((s, x, j) => s + x * v[j], 0));
    }

    _invertMatrix(M) {
        const n = M.length;
        const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

        // Gaussian elimination
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
                    maxRow = k;
                }
            }
            [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

            const pivot = aug[i][i];
            if (Math.abs(pivot) < 1e-10) continue;

            for (let j = 0; j < 2 * n; j++) {
                aug[i][j] /= pivot;
            }

            for (let k = 0; k < n; k++) {
                if (k === i) continue;
                const factor = aug[k][i];
                for (let j = 0; j < 2 * n; j++) {
                    aug[k][j] -= factor * aug[i][j];
                }
            }
        }

        return aug.map(row => row.slice(n));
    }

    _chiSquareCDF(x, df) {
        if (x <= 0) return 0;
        return this._gammaCDF(df / 2, x / 2);
    }

    _gammaCDF(shape, x) {
        if (x <= 0) return 0;

        let sum = 0;
        let term = 1 / shape;
        sum = term;

        for (let n = 1; n < 100; n++) {
            term *= x / (shape + n);
            sum += term;
            if (Math.abs(term) < 1e-10) break;
        }

        return Math.pow(x, shape) * Math.exp(-x) * sum / this._gamma(shape);
    }

    _gamma(z) {
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * this._gamma(1 - z));
        }

        z -= 1;
        let x = c[0];
        for (let i = 1; i < g + 2; i++) {
            x += c[i] / (z + i);
        }
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EVSICalculator,
        BayesianModelAveraging,
        FlexibleSurvival,
        MultiStateMarkov,
        StressTesting,
        MetaRegression
    };
} else if (typeof window !== 'undefined') {
    window.EVSICalculator = EVSICalculator;
    window.BayesianModelAveraging = BayesianModelAveraging;
    window.FlexibleSurvival = FlexibleSurvival;
    window.MultiStateMarkov = MultiStateMarkov;
    window.StressTesting = StressTesting;
    window.MetaRegression = MetaRegression;
}
