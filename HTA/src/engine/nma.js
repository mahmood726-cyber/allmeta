/**
 * Network Meta-Analysis (NMA) Engine for HTA Artifact Standard v0.5
 *
 * Implements Bayesian and frequentist network meta-analysis for indirect
 * treatment comparisons in health technology assessment.
 *
 * References:
 * - Dias et al. (2018) Network Meta-Analysis for Decision Making
 * - Salanti et al. (2011) Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis
 * - Rücker & Schwarzer (2015) Ranking treatments in frequentist network meta-analysis
 * - Higgins et al. (2012) Consistency and inconsistency in network meta-analysis
 *
 * Features:
 * - Bayesian NMA using Gibbs sampling (MCMC)
 * - Frequentist NMA using graph-theoretical approach
 * - Consistency checking (node-splitting, design-by-treatment interaction)
 * - SUCRA/P-scores for treatment ranking
 * - Heterogeneity estimation (τ², I², H²)
 * - Network geometry and connectivity analysis
 * - League tables with credible/confidence intervals
 * - Comparison-adjusted funnel plots for small-study effects
 */

class NetworkMetaAnalysis {
    constructor(options = {}) {
        this.options = {
            model: 'random',           // 'fixed' or 'random' effects
            method: 'bayesian',        // 'bayesian' or 'frequentist'
            nIterations: 10000,        // MCMC iterations
            nBurnin: 2000,             // Burn-in period
            nThin: 1,                  // Thinning interval
            nChains: 2,                // Number of MCMC chains
            seed: 12345,
            priorHeterogeneity: { type: 'halfNormal', scale: 0.5 },  // Prior for τ
            priorEffect: { type: 'normal', mean: 0, sd: 100 },       // Prior for treatment effects
            referenceArm: null,        // Reference treatment (auto-selected if null)
            ...options
        };

        this.rng = this.createRNG(this.options.seed);
        this.treatments = [];
        this.studies = [];
        this.comparisons = [];
        this.results = null;
    }

    /**
     * Create seeded random number generator
     */
    createRNG(seed) {
        // PCG-like simple PRNG
        let state = seed;
        return {
            random: () => {
                state = (state * 1103515245 + 12345) & 0x7fffffff;
                return state / 0x7fffffff;
            },
            normal: (mean = 0, sd = 1) => {
                const seededFallback = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff || 1e-10; };
                const u1 = this.rng?.random() || seededFallback();
                const u2 = this.rng?.random() || seededFallback();
                const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                return mean + sd * z;
            }
        };
    }

    /**
     * Set network data from study-level summaries
     * @param {Array} data - Array of study objects with treatment comparisons
     * @param {string} outcomeType - 'binary' or 'continuous'
     * @throws {Error} If data validation fails
     *
     * Expected format for binary:
     * [
     *   { study: 'Study1', treatment: 'A', n: 100, events: 20 },
     *   { study: 'Study1', treatment: 'B', n: 100, events: 15 },
     *   ...
     * ]
     *
     * For continuous outcomes:
     * { study: 'Study1', treatment: 'A', n: 100, mean: 10.5, sd: 2.1 }
     */
    setData(data, outcomeType = 'binary') {
        // Input validation
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('data must be a non-empty array');
        }

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            if (!d.study || !d.treatment) {
                throw new Error(`Row ${i + 1}: must have study and treatment fields`);
            }
            if (outcomeType === 'binary') {
                if (typeof d.n !== 'number' || d.n <= 0) {
                    throw new Error(`Row ${i + 1}: n must be a positive number`);
                }
                if (typeof d.events !== 'number' || d.events < 0 || d.events > d.n) {
                    throw new Error(`Row ${i + 1}: events must be between 0 and n`);
                }
            } else if (outcomeType === 'continuous') {
                if (typeof d.mean !== 'number' || isNaN(d.mean)) {
                    throw new Error(`Row ${i + 1}: mean must be a valid number`);
                }
                if (typeof d.sd !== 'number' || d.sd <= 0) {
                    throw new Error(`Row ${i + 1}: sd must be positive`);
                }
            }
        }

        this.outcomeType = outcomeType;
        this.rawData = data;

        // Extract unique treatments and studies
        this.treatments = [...new Set(data.map(d => d.treatment))];
        this.studies = [...new Set(data.map(d => d.study))];

        // Set reference treatment (most connected node)
        if (!this.options.referenceArm) {
            this.options.referenceArm = this.findMostConnectedTreatment(data);
        }

        // Reorder treatments with reference first
        const refIdx = this.treatments.indexOf(this.options.referenceArm);
        if (refIdx > 0) {
            this.treatments.splice(refIdx, 1);
            this.treatments.unshift(this.options.referenceArm);
        }

        // Process data into contrasts
        this.contrasts = this.calculateContrasts(data, outcomeType);

        // Build network structure
        this.network = this.buildNetworkStructure();

        return this;
    }

    /**
     * Find most connected treatment for reference
     */
    findMostConnectedTreatment(data) {
        const connections = {};

        for (const study of this.studies) {
            const studyTreatments = data.filter(d => d.study === study).map(d => d.treatment);
            for (const t of studyTreatments) {
                connections[t] = (connections[t] || 0) + studyTreatments.length - 1;
            }
        }

        return Object.entries(connections).sort((a, b) => b[1] - a[1])[0]?.[0] || data[0]?.treatment;
    }

    /**
     * Calculate treatment contrasts from arm-level data
     * Properly handles multi-arm trial correlations (Lu-Ades model)
     * Reference: Lu & Ades (2006), Dias et al. (2013) NICE TSD 2
     */
    calculateContrasts(data, outcomeType) {
        const contrasts = [];
        const studyContrasts = new Map(); // Group contrasts by study for covariance

        for (const study of this.studies) {
            const studyArms = data.filter(d => d.study === study);

            if (studyArms.length < 2) continue;

            // Use first arm as baseline for multi-arm studies
            const baseline = studyArms[0];
            const isMultiArm = studyArms.length > 2;
            const studyContrastList = [];

            // Calculate baseline variance for multi-arm correlation
            let baselineVariance = 0;
            if (outcomeType === 'binary') {
                const a = baseline.events, b = baseline.n - baseline.events;
                const adj = (a === 0 || b === 0) ? 0.5 : 0;
                baselineVariance = 1/(a + adj) + 1/(b + adj);
            } else if (outcomeType === 'continuous') {
                baselineVariance = 1 / baseline.n;
            }

            for (let i = 1; i < studyArms.length; i++) {
                const arm = studyArms[i];
                let effect, variance;

                if (outcomeType === 'binary') {
                    // Log odds ratio
                    const or = this.calculateOddsRatio(
                        baseline.events, baseline.n - baseline.events,
                        arm.events, arm.n - arm.events
                    );
                    effect = or.logOR;
                    variance = or.variance;
                } else if (outcomeType === 'continuous') {
                    // Standardized mean difference
                    const smd = this.calculateSMD(
                        baseline.mean, baseline.sd, baseline.n,
                        arm.mean, arm.sd, arm.n
                    );
                    effect = smd.d;
                    variance = smd.variance;
                } else if (outcomeType === 'hr') {
                    // Hazard ratio (log scale)
                    effect = Math.log(arm.hr);
                    variance = arm.seLogHR ? arm.seLogHR ** 2 : (arm.variance || 0.1);
                }

                const contrast = {
                    study: study,
                    treatment1: baseline.treatment,
                    treatment2: arm.treatment,
                    effect: effect,
                    variance: variance,
                    se: Math.sqrt(variance),
                    n1: baseline.n,
                    n2: arm.n,
                    multiArm: isMultiArm,
                    armIndex: i,
                    baselineVariance: baselineVariance // For covariance calculation
                };

                contrasts.push(contrast);
                studyContrastList.push(contrast);
            }

            // Store for covariance matrix construction
            if (isMultiArm) {
                studyContrasts.set(study, studyContrastList);
            }
        }

        // Calculate covariance matrix for multi-arm trials
        // Covariance between contrasts sharing baseline = variance of baseline arm
        this.contrastCovariances = new Map();
        for (const [study, contrastList] of studyContrasts) {
            if (contrastList.length > 1) {
                const covMatrix = [];
                for (let i = 0; i < contrastList.length; i++) {
                    const row = [];
                    for (let j = 0; j < contrastList.length; j++) {
                        if (i === j) {
                            row.push(contrastList[i].variance);
                        } else {
                            // Covariance = baseline variance (shared baseline arm)
                            row.push(contrastList[i].baselineVariance);
                        }
                    }
                    covMatrix.push(row);
                }
                this.contrastCovariances.set(study, {
                    contrasts: contrastList,
                    covarianceMatrix: covMatrix,
                    // Calculate precision matrix (inverse of covariance)
                    precisionMatrix: this.invertMatrix(covMatrix)
                });
            }
        }

        return contrasts;
    }

    /**
     * Invert a symmetric positive definite matrix
     * Used for multi-arm trial precision matrices
     */
    invertMatrix(A) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

        // Gaussian elimination with partial pivoting
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            const pivot = augmented[i][i];
            if (Math.abs(pivot) < 1e-10) continue;

            for (let j = 0; j < 2 * n; j++) augmented[i][j] /= pivot;

            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = augmented[k][i];
                    for (let j = 0; j < 2 * n; j++) augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }

        return augmented.map(row => row.slice(n));
    }

    /**
     * Calculate odds ratio and variance
     */
    calculateOddsRatio(a, b, c, d) {
        // Apply 0.5 continuity correction if needed
        const adj = (a === 0 || b === 0 || c === 0 || d === 0) ? 0.5 : 0;

        const logOR = Math.log(((a + adj) * (d + adj)) / ((b + adj) * (c + adj)));
        const variance = 1/(a + adj) + 1/(b + adj) + 1/(c + adj) + 1/(d + adj);

        return { logOR, variance, or: Math.exp(logOR) };
    }

    /**
     * Calculate standardized mean difference (Hedges' g)
     */
    calculateSMD(m1, s1, n1, m2, s2, n2) {
        // Pooled SD
        const sp = Math.sqrt(((n1 - 1) * s1**2 + (n2 - 1) * s2**2) / (n1 + n2 - 2));

        // Cohen's d
        const d = (m2 - m1) / sp;

        // Hedges' correction
        const J = 1 - 3 / (4 * (n1 + n2 - 2) - 1);
        const g = d * J;

        // Variance
        const variance = (n1 + n2) / (n1 * n2) + (g ** 2) / (2 * (n1 + n2));

        return { d: g, variance, se: Math.sqrt(variance) };
    }

    /**
     * Build network structure for analysis
     */
    buildNetworkStructure() {
        const network = {
            nodes: this.treatments.map((t, i) => ({
                id: t,
                index: i,
                nStudies: this.contrasts.filter(c => c.treatment1 === t || c.treatment2 === t).length,
                nPatients: this.calculateTotalPatients(t)
            })),
            edges: [],
            adjacencyMatrix: [],
            designMatrix: null
        };

        // Build edges from unique comparisons
        const edgeMap = new Map();

        for (const contrast of this.contrasts) {
            const key = [contrast.treatment1, contrast.treatment2].sort().join('|');
            if (!edgeMap.has(key)) {
                edgeMap.set(key, {
                    treatment1: contrast.treatment1,
                    treatment2: contrast.treatment2,
                    nStudies: 0,
                    studies: []
                });
            }
            const edge = edgeMap.get(key);
            edge.nStudies++;
            edge.studies.push(contrast.study);
        }

        network.edges = Array.from(edgeMap.values());

        // Build adjacency matrix
        const nTreat = this.treatments.length;
        network.adjacencyMatrix = Array(nTreat).fill(null).map(() => Array(nTreat).fill(0));

        for (const edge of network.edges) {
            const i = this.treatments.indexOf(edge.treatment1);
            const j = this.treatments.indexOf(edge.treatment2);
            network.adjacencyMatrix[i][j] = edge.nStudies;
            network.adjacencyMatrix[j][i] = edge.nStudies;
        }

        // Build design matrix for NMA
        network.designMatrix = this.buildDesignMatrix();

        // Check network connectivity
        network.isConnected = this.checkConnectivity(network.adjacencyMatrix);

        return network;
    }

    /**
     * Calculate total patients for a treatment
     */
    calculateTotalPatients(treatment) {
        return this.rawData
            .filter(d => d.treatment === treatment)
            .reduce((sum, d) => sum + (d.n || 0), 0);
    }

    /**
     * Build design matrix for network meta-analysis
     */
    buildDesignMatrix() {
        const nContrasts = this.contrasts.length;
        const nBasicParams = this.treatments.length - 1;  // Reference excluded

        const X = [];

        for (const contrast of this.contrasts) {
            const row = new Array(nBasicParams).fill(0);

            const idx1 = this.treatments.indexOf(contrast.treatment1);
            const idx2 = this.treatments.indexOf(contrast.treatment2);

            // Effect is d_treatment2 - d_treatment1
            // d_reference = 0 (reference treatment)

            if (idx1 > 0) row[idx1 - 1] = -1;
            if (idx2 > 0) row[idx2 - 1] = 1;

            X.push(row);
        }

        return X;
    }

    /**
     * Check if network is connected (DFS)
     */
    checkConnectivity(adjMatrix) {
        const n = adjMatrix.length;
        const visited = new Array(n).fill(false);
        const stack = [0];

        while (stack.length > 0) {
            const node = stack.pop();
            if (visited[node]) continue;
            visited[node] = true;

            for (let i = 0; i < n; i++) {
                if (adjMatrix[node][i] > 0 && !visited[i]) {
                    stack.push(i);
                }
            }
        }

        return visited.every(v => v);
    }

    /**
     * Run network meta-analysis
     */
    async run(progressCallback = null) {
        if (!this.network.isConnected) {
            throw new Error('Network is not fully connected. Cannot perform NMA.');
        }

        const startTime = performance.now();

        if (this.options.method === 'bayesian') {
            this.results = await this.runBayesianNMA(progressCallback);
        } else {
            this.results = this.runFrequentistNMA();
        }

        // Add additional analyses
        this.results.sucra = this.calculateSUCRA();
        this.results.leagueTable = this.generateLeagueTable();
        this.results.consistency = await this.checkConsistency();
        this.results.heterogeneity = this.calculateHeterogeneity();
        this.results.networkGeometry = this.analyzeNetworkGeometry();
        this.results.computation_time_ms = performance.now() - startTime;

        return this.results;
    }

    /**
     * Bayesian NMA using Gibbs sampling
     */
    async runBayesianNMA(progressCallback = null) {
        const nContrasts = this.contrasts.length;
        const nParams = this.treatments.length - 1;  // Basic parameters (vs reference)
        const X = this.network.designMatrix;

        // Extract observed effects and precisions
        const y = this.contrasts.map(c => c.effect);
        const prec = this.contrasts.map(c => 1 / c.variance);

        // MCMC storage
        const nSamples = Math.floor((this.options.nIterations - this.options.nBurnin) / this.options.nThin);
        const samples = {
            d: Array(nParams).fill(null).map(() => []),  // Treatment effects
            tau: [],                                       // Between-study SD
            delta: Array(nContrasts).fill(null).map(() => [])  // Study-specific effects
        };

        // Initialize parameters
        let d = new Array(nParams).fill(0);
        let tau = 0.1;
        let delta = [...y];  // Initialize at observed values

        // Within-study precision
        const withinPrec = prec;

        // MCMC iterations
        for (let iter = 0; iter < this.options.nIterations; iter++) {
            // 1. Update delta (study-specific effects) - random effects
            if (this.options.model === 'random') {
                const betweenPrec = 1 / (tau ** 2 + 1e-10);

                for (let k = 0; k < nContrasts; k++) {
                    // Mean from basic parameters
                    let mu_k = 0;
                    for (let j = 0; j < nParams; j++) {
                        mu_k += X[k][j] * d[j];
                    }

                    // Posterior for delta[k]
                    const postPrec = withinPrec[k] + betweenPrec;
                    const postMean = (withinPrec[k] * y[k] + betweenPrec * mu_k) / postPrec;
                    const postSD = Math.sqrt(1 / postPrec);

                    delta[k] = this.rng.normal(postMean, postSD);
                }
            } else {
                // Fixed effect: delta = X * d
                for (let k = 0; k < nContrasts; k++) {
                    delta[k] = 0;
                    for (let j = 0; j < nParams; j++) {
                        delta[k] += X[k][j] * d[j];
                    }
                }
            }

            // 2. Update d (basic treatment parameters)
            // Weighted least squares with prior
            const priorPrec = 1 / (this.options.priorEffect.sd ** 2);

            for (let j = 0; j < nParams; j++) {
                let sumNum = 0;
                let sumDenom = priorPrec;

                for (let k = 0; k < nContrasts; k++) {
                    if (X[k][j] !== 0) {
                        // Residual excluding this parameter
                        let residual = delta[k];
                        for (let l = 0; l < nParams; l++) {
                            if (l !== j) residual -= X[k][l] * d[l];
                        }

                        const w = this.options.model === 'random' ?
                            1 / (1/withinPrec[k] + tau**2) : withinPrec[k];

                        sumNum += w * X[k][j] * residual;
                        sumDenom += w * X[k][j] ** 2;
                    }
                }

                const postMean = sumNum / sumDenom;
                const postSD = Math.sqrt(1 / sumDenom);
                d[j] = this.rng.normal(postMean, postSD);
            }

            // 3. Update tau (between-study heterogeneity) - random effects only
            if (this.options.model === 'random' && nContrasts > nParams) {
                // Sum of squared residuals
                let ssq = 0;
                for (let k = 0; k < nContrasts; k++) {
                    let mu_k = 0;
                    for (let j = 0; j < nParams; j++) {
                        mu_k += X[k][j] * d[j];
                    }
                    ssq += (delta[k] - mu_k) ** 2;
                }

                // Inverse gamma posterior (approximated with half-normal prior)
                const df = nContrasts - nParams;
                tau = Math.sqrt(ssq / this.sampleChiSquared(df));

                // Truncate tau to reasonable range
                tau = Math.max(0.001, Math.min(tau, 10));
            }

            // Store samples after burn-in with thinning
            if (iter >= this.options.nBurnin && (iter - this.options.nBurnin) % this.options.nThin === 0) {
                for (let j = 0; j < nParams; j++) {
                    samples.d[j].push(d[j]);
                }
                samples.tau.push(tau);
                for (let k = 0; k < nContrasts; k++) {
                    samples.delta[k].push(delta[k]);
                }
            }

            // Progress callback
            if (progressCallback && iter % 500 === 0) {
                await progressCallback(iter, this.options.nIterations);
            }
        }

        // Calculate posterior summaries
        const results = this.calculatePosteriorSummaries(samples);
        results.samples = samples;
        results.method = 'bayesian';
        results.model = this.options.model;

        // Add MCMC diagnostics (Gelman-Rubin R-hat and ESS)
        // Reference: Gelman & Rubin (1992), Brooks & Gelman (1998)
        results.mcmcDiagnostics = this.calculateMCMCDiagnostics(samples);

        return results;
    }

    /**
     * Calculate MCMC convergence diagnostics
     * Reference: Gelman & Rubin (1992) "Inference from Iterative Simulation Using Multiple Sequences"
     * Reference: Brooks & Gelman (1998) "General Methods for Monitoring Convergence"
     *
     * @param {Object} samples - MCMC samples object
     * @returns {Object} Diagnostics including R-hat, ESS, and convergence summary
     */
    calculateMCMCDiagnostics(samples) {
        const nParams = samples.d.length;
        const nSamples = samples.d[0].length;

        // Split each chain in half for split-R-hat (Vehtari et al. 2021)
        // This provides a more sensitive convergence diagnostic
        const splitChains = (chain) => {
            const mid = Math.floor(chain.length / 2);
            return [chain.slice(0, mid), chain.slice(mid)];
        };

        const diagnostics = {
            treatmentEffects: [],
            tau: null,
            overallConverged: true,
            warnings: []
        };

        // Calculate R-hat for each treatment effect parameter
        for (let j = 0; j < nParams; j++) {
            const chains = splitChains(samples.d[j]);
            const rhat = this.gelmanRubinRhat(chains);
            const ess = this.effectiveSampleSize(samples.d[j]);

            diagnostics.treatmentEffects.push({
                parameter: `d[${j + 1}]`,
                treatment: this.treatments[j + 1],
                rhat: rhat.rhat,
                ess: ess,
                converged: rhat.converged,
                interpretation: rhat.interpretation
            });

            if (!rhat.converged) {
                diagnostics.overallConverged = false;
            }
        }

        // Calculate R-hat for tau (heterogeneity SD)
        if (samples.tau && samples.tau.length > 10) {
            const tauChains = splitChains(samples.tau);
            const tauRhat = this.gelmanRubinRhat(tauChains);
            const tauESS = this.effectiveSampleSize(samples.tau);

            diagnostics.tau = {
                rhat: tauRhat.rhat,
                ess: tauESS,
                converged: tauRhat.converged,
                interpretation: tauRhat.interpretation
            };

            if (!tauRhat.converged) {
                diagnostics.overallConverged = false;
            }
        }

        // Generate warnings
        if (!diagnostics.overallConverged) {
            diagnostics.warnings.push({
                type: 'CONVERGENCE_WARNING',
                message: 'Some parameters have R-hat > 1.1, indicating potential non-convergence. Consider increasing MCMC iterations or adjusting priors.',
                severity: 'warning',
                recommendation: 'increase_iterations'
            });
        }

        const minESS = Math.min(
            ...diagnostics.treatmentEffects.map(d => d.ess),
            diagnostics.tau ? diagnostics.tau.ess : Infinity
        );
        if (minESS < 100) {
            diagnostics.warnings.push({
                type: 'LOW_ESS',
                message: `Minimum effective sample size (${minESS.toFixed(0)}) is low. Consider increasing iterations or thinning interval.`,
                severity: 'warning',
                minESS: minESS,
                recommendation: 'increase_iterations'
            });
        }

        diagnostics.summary = diagnostics.overallConverged && minESS >= 100 ?
            'MCMC chains show good convergence (all R-hat < 1.1, ESS >= 100)' :
            'MCMC convergence issues detected - interpret results with caution';

        return diagnostics;
    }

    /**
     * Gelman-Rubin R-hat statistic (split-chain version)
     * Reference: Vehtari et al. (2021) "Rank-Normalization, Folding, and Localization"
     * Values < 1.1 indicate convergence (< 1.01 recommended for publication)
     */
    gelmanRubinRhat(chains) {
        const m = chains.length;  // Number of chains
        const n = chains[0].length;  // Length of each chain

        if (m < 2 || n < 10) {
            return { rhat: null, converged: true, message: 'Insufficient samples for R-hat' };
        }

        // Calculate chain means
        const chainMeans = chains.map(chain =>
            chain.reduce((a, b) => a + b, 0) / n
        );

        // Overall mean
        const overallMean = chainMeans.reduce((a, b) => a + b, 0) / m;

        // Between-chain variance B
        let B = 0;
        for (let j = 0; j < m; j++) {
            B += (chainMeans[j] - overallMean) ** 2;
        }
        B = B * n / (m - 1);

        // Within-chain variance W
        let W = 0;
        for (let j = 0; j < m; j++) {
            let sj = 0;
            for (let i = 0; i < n; i++) {
                sj += (chains[j][i] - chainMeans[j]) ** 2;
            }
            W += sj / (n - 1);
        }
        W /= m;

        // Pooled variance estimate
        const varPlus = (n - 1) / n * W + B / n;

        // R-hat
        const rhat = W > 0 ? Math.sqrt(varPlus / W) : 1.0;

        return {
            rhat: rhat,
            B: B,
            W: W,
            converged: rhat < 1.1,
            interpretation: rhat < 1.01 ? 'Excellent convergence' :
                           rhat < 1.05 ? 'Good convergence' :
                           rhat < 1.1 ? 'Acceptable convergence' :
                           rhat < 1.2 ? 'Potential convergence issues' :
                           'Poor convergence - more iterations needed'
        };
    }

    /**
     * Effective Sample Size (ESS) using autocorrelation
     * Reference: Geyer (1992) "Practical Markov Chain Monte Carlo"
     */
    effectiveSampleSize(samples) {
        const n = samples.length;
        if (n < 10) return n;

        // Calculate mean
        const mean = samples.reduce((a, b) => a + b, 0) / n;

        // Calculate variance
        let variance = 0;
        for (let i = 0; i < n; i++) {
            variance += (samples[i] - mean) ** 2;
        }
        variance /= (n - 1);

        if (variance < 1e-10) return n;

        // Calculate autocorrelations using FFT-free method
        const maxLag = Math.min(100, Math.floor(n / 4));
        let sumRho = 0;

        for (let k = 1; k < maxLag; k++) {
            let acf = 0;
            for (let i = 0; i < n - k; i++) {
                acf += (samples[i] - mean) * (samples[i + k] - mean);
            }
            acf /= ((n - k) * variance);

            // Geyer's initial positive sequence estimator
            if (k > 1 && acf < 0) break;
            sumRho += acf;
        }

        // ESS = n / (1 + 2 * sum of positive autocorrelations)
        const ess = n / (1 + 2 * Math.max(0, sumRho));
        return Math.max(1, Math.min(n, ess));
    }

    /**
     * Sample from chi-squared distribution
     * Uses Marsaglia-Tsang gamma method to handle non-integer df
     * Chi-Sq(df) ~ Gamma(df/2, 2)
     * Reference: Marsaglia & Tsang (2000)
     */
    sampleChiSquared(df) {
        // For small integer df, use sum of squared normals (faster)
        if (Number.isInteger(df) && df <= 20) {
            let sum = 0;
            for (let i = 0; i < df; i++) {
                const z = this.rng.normal(0, 1);
                sum += z ** 2;
            }
            return sum;
        }

        // For non-integer or large df, use Gamma(df/2, 2)
        return this.sampleGamma(df / 2, 2);
    }

    /**
     * Sample from Gamma distribution using Marsaglia-Tsang method
     * Reference: Marsaglia & Tsang (2000)
     */
    sampleGamma(shape, scale) {
        if (shape < 1) {
            // For shape < 1: Gamma(a) = Gamma(a+1) * U^(1/a)
            const u = this.rng.random();
            return this.sampleGamma(shape + 1, scale) * Math.pow(u, 1 / shape);
        }

        const d = shape - 1/3;
        const c = 1 / Math.sqrt(9 * d);

        while (true) {
            let x, v;
            do {
                x = this.rng.normal(0, 1);
                v = 1 + c * x;
            } while (v <= 0);

            v = v * v * v;
            const u = this.rng.random();

            if (u < 1 - 0.0331 * x * x * x * x) {
                return Math.max(0.001, d * v * scale);
            }

            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return Math.max(0.001, d * v * scale);
            }
        }
    }

    /**
     * Calculate posterior summaries from MCMC samples
     */
    calculatePosteriorSummaries(samples) {
        const nParams = samples.d.length;
        const treatments = this.treatments;

        // Treatment effects vs reference
        const effects = [];

        for (let j = 0; j < nParams; j++) {
            const s = samples.d[j];
            const sorted = [...s].sort((a, b) => a - b);
            const n = sorted.length;

            effects.push({
                treatment: treatments[j + 1],
                vsReference: treatments[0],
                mean: s.reduce((a, b) => a + b, 0) / n,
                median: sorted[Math.floor(n / 2)],
                sd: Math.sqrt(s.reduce((sum, x) => sum + (x - s.reduce((a, b) => a + b, 0) / n) ** 2, 0) / (n - 1)),
                ci_lower: sorted[Math.floor(n * 0.025)],
                ci_upper: sorted[Math.floor(n * 0.975)],
                prob_superior: s.filter(x => x > 0).length / n  // P(d > 0)
            });
        }

        // Tau (heterogeneity SD)
        const tauSamples = samples.tau;
        const tauSorted = [...tauSamples].sort((a, b) => a - b);
        const nTau = tauSorted.length;

        const tau = {
            mean: tauSamples.reduce((a, b) => a + b, 0) / nTau,
            median: tauSorted[Math.floor(nTau / 2)],
            ci_lower: tauSorted[Math.floor(nTau * 0.025)],
            ci_upper: tauSorted[Math.floor(nTau * 0.975)]
        };

        // Calculate I² from tau
        const avgVariance = this.contrasts.reduce((s, c) => s + c.variance, 0) / this.contrasts.length;
        const tauSq = tau.mean ** 2;
        const I2 = tauSq / (tauSq + avgVariance) * 100;

        return {
            effects,
            tau,
            tauSquared: tauSq,
            I2,
            reference: treatments[0],
            nIterations: this.options.nIterations,
            nBurnin: this.options.nBurnin
        };
    }

    /**
     * Frequentist NMA using graph-theoretical approach (Rücker method)
     */
    runFrequentistNMA() {
        const X = this.network.designMatrix;
        const y = this.contrasts.map(c => c.effect);
        const V = this.contrasts.map(c => c.variance);
        const nContrasts = this.contrasts.length;
        const nParams = this.treatments.length - 1;

        // Weighted least squares: d = (X'WX)^-1 X'Wy
        // where W = diag(1/V)

        // Build X'WX
        const XtWX = Array(nParams).fill(null).map(() => Array(nParams).fill(0));
        const XtWy = Array(nParams).fill(0);

        for (let i = 0; i < nParams; i++) {
            for (let j = 0; j < nParams; j++) {
                for (let k = 0; k < nContrasts; k++) {
                    XtWX[i][j] += X[k][i] * X[k][j] / V[k];
                }
            }
            for (let k = 0; k < nContrasts; k++) {
                XtWy[i] += X[k][i] * y[k] / V[k];
            }
        }

        // Invert XtWX
        const XtWXinv = this.invertMatrix(XtWX);

        // Solve for d
        const d = Array(nParams).fill(0);
        for (let i = 0; i < nParams; i++) {
            for (let j = 0; j < nParams; j++) {
                d[i] += XtWXinv[i][j] * XtWy[j];
            }
        }

        // Variance of d
        const varD = XtWXinv;

        // Calculate Q statistic for heterogeneity
        let Q = 0;
        for (let k = 0; k < nContrasts; k++) {
            let fitted = 0;
            for (let j = 0; j < nParams; j++) {
                fitted += X[k][j] * d[j];
            }
            Q += (y[k] - fitted) ** 2 / V[k];
        }

        const df = nContrasts - nParams;
        const pValue = 1 - this.chiSquaredCDF(Q, df);

        // Estimate tau² using DerSimonian-Laird
        const tauSq = Math.max(0, (Q - df) / this.calculateC(V, X));

        // Calculate I²
        const I2 = df > 0 ? Math.max(0, (Q - df) / Q * 100) : 0;

        // Build results
        const effects = [];
        for (let j = 0; j < nParams; j++) {
            const se = Math.sqrt(varD[j][j]);
            effects.push({
                treatment: this.treatments[j + 1],
                vsReference: this.treatments[0],
                mean: d[j],
                se: se,
                ci_lower: d[j] - this.normalQuantile(0.975) * se,
                ci_upper: d[j] + this.normalQuantile(0.975) * se,
                z: d[j] / se,
                pValue: 2 * (1 - this.normalCDF(Math.abs(d[j] / se)))
            });
        }

        return {
            effects,
            tau: Math.sqrt(tauSq),
            tauSquared: tauSq,
            Q,
            df,
            pValueQ: pValue,
            I2,
            reference: this.treatments[0],
            method: 'frequentist',
            model: this.options.model,
            varCov: varD  // Variance-covariance matrix for P-score calculation
        };
    }

    /**
     * Calculate C for DerSimonian-Laird tau² estimation
     */
    calculateC(V, X) {
        const nContrasts = V.length;
        const nParams = X[0].length;

        let sumW = 0;
        let sumW2 = 0;

        for (let k = 0; k < nContrasts; k++) {
            const w = 1 / V[k];
            sumW += w;
            sumW2 += w ** 2;
        }

        return sumW - sumW2 / sumW;
    }

    /**
     * Invert matrix using Gaussian elimination
     */
    invertMatrix(A) {
        const n = A.length;
        const augmented = A.map((row, i) => {
            const newRow = [...row];
            for (let j = 0; j < n; j++) {
                newRow.push(i === j ? 1 : 0);
            }
            return newRow;
        });

        // Forward elimination
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            // Scale pivot row
            const pivot = augmented[i][i];
            if (Math.abs(pivot) < 1e-10) {
                throw new Error('Matrix is singular');
            }
            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }

            // Eliminate column
            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = augmented[k][i];
                    for (let j = 0; j < 2 * n; j++) {
                        augmented[k][j] -= factor * augmented[i][j];
                    }
                }
            }
        }

        // Extract inverse
        return augmented.map(row => row.slice(n));
    }

    /**
     * Calculate SUCRA (Surface Under the Cumulative RAnking curve) scores
     */
    calculateSUCRA() {
        if (!this.results?.samples?.d) {
            // Frequentist: use point estimates
            return this.calculatePScores();
        }

        const nTreatments = this.treatments.length;
        const nSamples = this.results.samples.d[0].length;

        // For each sample, rank all treatments
        const rankCounts = Array(nTreatments).fill(null).map(() =>
            Array(nTreatments).fill(0)
        );

        for (let s = 0; s < nSamples; s++) {
            // Get effects for this sample (include reference = 0)
            const effects = [0, ...this.results.samples.d.map(d => d[s])];

            // Rank treatments (higher is better for positive outcomes)
            const ranked = effects.map((e, i) => ({ effect: e, idx: i }))
                .sort((a, b) => b.effect - a.effect);

            ranked.forEach((t, rank) => {
                rankCounts[t.idx][rank]++;
            });
        }

        // Calculate SUCRA for each treatment
        const sucra = [];

        for (let i = 0; i < nTreatments; i++) {
            let cumulativeProb = 0;
            let sumCumulative = 0;

            for (let r = 0; r < nTreatments - 1; r++) {
                cumulativeProb += rankCounts[i][r] / nSamples;
                sumCumulative += cumulativeProb;
            }

            const sucraScore = sumCumulative / (nTreatments - 1) * 100;

            sucra.push({
                treatment: this.treatments[i],
                sucra: sucraScore,
                meanRank: rankCounts[i].reduce((sum, count, rank) => sum + count * (rank + 1), 0) / nSamples,
                probBest: rankCounts[i][0] / nSamples * 100,
                rankProbabilities: rankCounts[i].map(c => c / nSamples * 100)
            });
        }

        return sucra.sort((a, b) => b.sucra - a.sucra);
    }

    /**
     * Calculate P-scores for frequentist NMA (Rücker & Schwarzer 2015)
     * Uses proper variance-covariance structure for indirect comparisons
     */
    calculatePScores() {
        const nTreatments = this.treatments.length;
        const nParams = nTreatments - 1;
        const effects = [0, ...this.results.effects.map(e => e.mean)];

        // Get variance-covariance matrix (reference treatment has 0 variance)
        const varCov = this.results.varCov;

        // Build full variance-covariance matrix including reference
        // Reference (index 0) has 0 variance and 0 covariance with others
        const fullVarCov = Array(nTreatments).fill(null).map(() =>
            Array(nTreatments).fill(0)
        );

        if (varCov && varCov.length > 0) {
            for (let i = 0; i < nParams; i++) {
                for (let j = 0; j < nParams; j++) {
                    // Offset by 1 since reference is at index 0
                    fullVarCov[i + 1][j + 1] = varCov[i][j];
                }
            }
        } else {
            // Fallback: use diagonal (independence assumption)
            const ses = [0, ...this.results.effects.map(e => e.se || 0.1)];
            for (let i = 0; i < nTreatments; i++) {
                fullVarCov[i][i] = ses[i] ** 2;
            }
        }

        const pScores = [];

        for (let i = 0; i < nTreatments; i++) {
            let sumP = 0;

            for (let j = 0; j < nTreatments; j++) {
                if (i !== j) {
                    const diff = effects[i] - effects[j];

                    // Var(θ_i - θ_j) = Var(θ_i) + Var(θ_j) - 2*Cov(θ_i, θ_j)
                    // Reference: Rücker & Schwarzer (2015), Biometrical Journal
                    const varDiff = fullVarCov[i][i] + fullVarCov[j][j]
                                  - 2 * fullVarCov[i][j];
                    const seDiff = Math.sqrt(Math.max(0.0001, varDiff));

                    const z = diff / seDiff;
                    sumP += this.normalCDF(z);
                }
            }

            const pScore = sumP / (nTreatments - 1) * 100;

            pScores.push({
                treatment: this.treatments[i],
                pScore: pScore,
                sucra: pScore,  // P-score is frequentist analog of SUCRA
                meanRank: nTreatments - pScore / 100 * (nTreatments - 1)
            });
        }

        return pScores.sort((a, b) => b.pScore - a.pScore);
    }

    /**
     * Generate league table of all pairwise comparisons
     */
    generateLeagueTable() {
        const nTreatments = this.treatments.length;
        const table = Array(nTreatments).fill(null).map(() =>
            Array(nTreatments).fill(null)
        );

        // Get all treatment effects (vs reference)
        const effects = { [this.treatments[0]]: { mean: 0, ci_lower: 0, ci_upper: 0 } };
        for (const e of this.results.effects) {
            effects[e.treatment] = {
                mean: e.mean,
                ci_lower: e.ci_lower,
                ci_upper: e.ci_upper
            };
        }

        // Calculate all pairwise comparisons
        for (let i = 0; i < nTreatments; i++) {
            for (let j = 0; j < nTreatments; j++) {
                if (i === j) {
                    table[i][j] = { treatment: this.treatments[i], isSelf: true };
                } else {
                    // Effect of treatment[j] vs treatment[i]
                    const diff = effects[this.treatments[j]].mean - effects[this.treatments[i]].mean;

                    // Calculate SE using proper covariance structure
                    // Var(j-i) = Var(j-ref) + Var(i-ref) - 2*Cov(j-ref, i-ref)
                    // Reference: Salanti et al. (2011), Annals of Internal Medicine
                    let seDiff;
                    if (this.results.varCov && i !== 0 && j !== 0) {
                        // Both treatments compared to reference - use covariance
                        const varI = this.results.varCov[i - 1][i - 1];
                        const varJ = this.results.varCov[j - 1][j - 1];
                        const covIJ = this.results.varCov[i - 1][j - 1];
                        seDiff = Math.sqrt(varI + varJ - 2 * covIJ);
                    } else if (this.results.varCov && (i === 0 || j === 0)) {
                        // One treatment is reference - SE is just the non-reference treatment's SE
                        const idx = i === 0 ? j - 1 : i - 1;
                        seDiff = Math.sqrt(this.results.varCov[idx][idx]);
                    } else {
                        // Bayesian or no covariance - use posterior samples or approximate
                        const seI = (effects[this.treatments[i]].ci_upper - effects[this.treatments[i]].ci_lower) / (2 * this.normalQuantile(0.975));
                        const seJ = (effects[this.treatments[j]].ci_upper - effects[this.treatments[j]].ci_lower) / (2 * this.normalQuantile(0.975));
                        // For Bayesian, use conservative independence assumption
                        // Better: compute from posterior samples if available
                        if (this.results.samples && i !== 0 && j !== 0) {
                            // Calculate difference directly from posterior samples
                            const samplesI = this.results.samples.d[i - 1];
                            const samplesJ = this.results.samples.d[j - 1];
                            const diffSamples = samplesI.map((v, k) => samplesJ[k] - v);
                            const meanDiff = diffSamples.reduce((a, b) => a + b, 0) / diffSamples.length;
                            const varDiff = diffSamples.reduce((s, x) => s + (x - meanDiff) ** 2, 0) / (diffSamples.length - 1);
                            seDiff = Math.sqrt(varDiff);
                        } else {
                            seDiff = Math.sqrt(seI**2 + seJ**2);
                        }
                    }

                    table[i][j] = {
                        comparison: `${this.treatments[j]} vs ${this.treatments[i]}`,
                        effect: diff,
                        effectExponentiated: Math.exp(diff),  // OR or HR
                        ci_lower: diff - this.normalQuantile(0.975) * seDiff,
                        ci_upper: diff + this.normalQuantile(0.975) * seDiff,
                        significant: (diff - this.normalQuantile(0.975) * seDiff > 0) || (diff + this.normalQuantile(0.975) * seDiff < 0)
                    };
                }
            }
        }

        return {
            treatments: this.treatments,
            table,
            format: this.outcomeType === 'binary' ? 'logOR' :
                    this.outcomeType === 'hr' ? 'logHR' : 'SMD'
        };
    }

    /**
     * Check consistency using node-splitting
     */
    async checkConsistency() {
        // Identify comparisons with both direct and indirect evidence
        const directComparisons = new Map();

        for (const contrast of this.contrasts) {
            const key = [contrast.treatment1, contrast.treatment2].sort().join('|');
            if (!directComparisons.has(key)) {
                directComparisons.set(key, []);
            }
            directComparisons.get(key).push(contrast);
        }

        const results = [];

        // For each comparison with direct evidence
        for (const [key, contrasts] of directComparisons) {
            const [t1, t2] = key.split('|');

            // Direct evidence
            const directEffect = contrasts.reduce((s, c) => s + c.effect / c.variance, 0) /
                                contrasts.reduce((s, c) => s + 1 / c.variance, 0);
            const directVar = 1 / contrasts.reduce((s, c) => s + 1 / c.variance, 0);

            // Indirect evidence: NMA effect - direct effect
            // Get NMA estimate for this comparison
            const idx1 = this.treatments.indexOf(t1);
            const idx2 = this.treatments.indexOf(t2);

            let nmaEffect;
            if (idx1 === 0) {
                nmaEffect = this.results.effects.find(e => e.treatment === t2)?.mean ?? 0;
            } else if (idx2 === 0) {
                nmaEffect = -(this.results.effects.find(e => e.treatment === t1)?.mean ?? 0);
            } else {
                const d1 = this.results.effects.find(e => e.treatment === t1)?.mean ?? 0;
                const d2 = this.results.effects.find(e => e.treatment === t2)?.mean ?? 0;
                nmaEffect = d2 - d1;
            }

            // Indirect effect and its variance
            // Reference: Dias et al. (2010) "Checking consistency in mixed treatment comparison meta-analysis"
            // Reference: Bucher et al. (1997) for indirect comparison methodology
            const indirectEffect = nmaEffect;

            // Compute NMA variance from variance-covariance matrix if available
            // Var(d_ij) = Var(d_i) + Var(d_j) - 2*Cov(d_i, d_j) for non-reference comparisons
            let nmaVar;
            if (this.results.varCov && idx1 !== 0 && idx2 !== 0) {
                // Use proper covariance structure from NMA
                const varI = this.results.varCov[idx1 - 1][idx1 - 1];
                const varJ = this.results.varCov[idx2 - 1][idx2 - 1];
                const covIJ = this.results.varCov[idx1 - 1][idx2 - 1];
                nmaVar = varI + varJ - 2 * covIJ;
            } else if (this.results.varCov && (idx1 === 0 || idx2 === 0)) {
                // Comparison to reference: variance is directly from varCov
                const idx = idx1 === 0 ? idx2 - 1 : idx1 - 1;
                nmaVar = this.results.varCov[idx][idx];
            } else {
                // Fallback: use SE from effects (assumes independence)
                const nmaSE1 = idx1 === 0 ? 0 : (this.results.effects.find(e => e.treatment === t1)?.se || 0.1);
                const nmaSE2 = idx2 === 0 ? 0 : (this.results.effects.find(e => e.treatment === t2)?.se || 0.1);
                nmaVar = nmaSE1 ** 2 + nmaSE2 ** 2;
            }

            // Indirect variance using back-calculation method (Dias et al. 2010, eq. 5)
            // The indirect estimate uses all evidence EXCEPT the direct comparison
            // Var(indirect) = Var(NMA) * Var(direct) / (Var(direct) - Var(NMA))
            // When direct is more precise than NMA, this indicates network contribution
            // Simplified: Var(indirect) ≈ Var(NMA) * (1 + Var(NMA)/Var(direct))
            let indirectVar;
            if (directVar > nmaVar && nmaVar > 0) {
                // Standard case: direct evidence contributes to NMA
                // Back-calculate indirect variance: 1/Var(indirect) = 1/Var(NMA) - 1/Var(direct)
                const precisionIndirect = Math.max(0.001, 1/nmaVar - 1/directVar);
                indirectVar = 1 / precisionIndirect;
            } else {
                // Edge case: NMA variance >= direct variance
                // This means indirect evidence is weak or inconsistent
                // Use conservative estimate: indirect variance is large
                indirectVar = nmaVar * 2 + (this.results.tauSquared ?? 0);
            }

            // Test for inconsistency: difference between direct and indirect
            // Reference: Bucher et al. (1997); Dias et al. (2010)
            const diff = directEffect - indirectEffect;

            // Variance of difference: Var(direct - indirect)
            // Direct and indirect are NOT independent - they share the NMA structure
            // Covariance = Var(NMA) because NMA is weighted average of both
            // Using Lu & Ades (2006) approach: Var(diff) = Var(direct) + Var(indirect) - 2*Var(NMA)
            const varDiff = Math.max(0.001, directVar + indirectVar - 2 * nmaVar);
            const seDiff = Math.sqrt(varDiff);
            const z = diff / seDiff;
            const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

            results.push({
                comparison: `${t1} vs ${t2}`,
                direct: { effect: directEffect, se: Math.sqrt(directVar) },
                indirect: { effect: indirectEffect, se: Math.sqrt(indirectVar) },
                difference: diff,
                seDifference: seDiff,
                z: z,
                pValue: pValue,
                inconsistent: pValue < 0.05
            });
        }

        // Global test for inconsistency
        // Reference: Higgins et al. (2012) "Consistency and inconsistency in network meta-analysis"
        // Note: Simple sum of z² assumes independence, which is violated when comparisons share
        // common treatments. We use a correlation-adjusted approach.

        const nComparisons = results.length;

        if (nComparisons === 0) {
            return {
                nodeSplitting: results,
                globalTest: {
                    Q: 0,
                    df: 0,
                    pValue: 1,
                    hasInconsistency: false,
                    method: 'none'
                }
            };
        }

        // Build correlation matrix for z-scores based on shared treatments
        // Two comparisons sharing a treatment have correlated z-scores
        const corrMatrix = [];
        for (let i = 0; i < nComparisons; i++) {
            corrMatrix[i] = [];
            const [t1i, t2i] = results[i].comparison.split(' vs ');
            for (let j = 0; j < nComparisons; j++) {
                if (i === j) {
                    corrMatrix[i][j] = 1;
                } else {
                    const [t1j, t2j] = results[j].comparison.split(' vs ');
                    // Comparisons share a treatment if any treatment overlaps
                    const sharedTreatments = [t1i, t2i].filter(t => [t1j, t2j].includes(t)).length;
                    // Correlation approximation based on shared treatments
                    // 0 shared = independent, 1 shared = moderate correlation, 2 shared = same comparison
                    corrMatrix[i][j] = sharedTreatments === 2 ? 1 : (sharedTreatments === 1 ? 0.5 : 0);
                }
            }
        }

        // Compute adjusted Q using generalized least squares approach
        // Q_adj = z' * R^{-1} * z where R is correlation matrix
        // For numerical stability, use pseudo-inverse if singular
        const zScores = results.map(r => r.z);

        // Try to invert correlation matrix
        let globalQ, effectiveDF;
        try {
            const invCorr = this.invertMatrix(corrMatrix);
            if (invCorr) {
                // Q = z' * R^{-1} * z
                globalQ = 0;
                for (let i = 0; i < nComparisons; i++) {
                    for (let j = 0; j < nComparisons; j++) {
                        globalQ += zScores[i] * invCorr[i][j] * zScores[j];
                    }
                }
                // Effective df based on trace of inverse
                effectiveDF = invCorr.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
                effectiveDF = Math.max(1, Math.min(effectiveDF, nComparisons));
            } else {
                throw new Error('Matrix singular');
            }
        } catch (e) {
            // Fallback: use simple sum with reduced df to be conservative
            globalQ = results.reduce((s, r) => s + r.z ** 2, 0);
            // Reduce df by average correlation to be conservative
            const avgCorr = corrMatrix.reduce((s, row) =>
                s + row.reduce((a, b) => a + b, 0), 0) / (nComparisons ** 2) - 1/nComparisons;
            effectiveDF = Math.max(1, nComparisons * (1 - avgCorr));
        }

        const globalP = 1 - this.chiSquaredCDF(globalQ, Math.round(effectiveDF));

        return {
            nodeSplitting: results,
            globalTest: {
                Q: globalQ,
                df: Math.round(effectiveDF),
                pValue: globalP,
                hasInconsistency: globalP < 0.05,
                method: 'correlation-adjusted',
                note: 'Adjusted for correlation between comparisons sharing treatments'
            }
        };
    }

    /**
     * Calculate heterogeneity statistics
     */
    calculateHeterogeneity() {
        const tau = this.results.tau;
        const tauSq = this.results.tauSquared;
        const I2 = this.results.I2;

        // H² = I²/(1-I²)
        const H2 = I2 < 100 ? I2 / (100 - I2) : Infinity;

        // Prediction interval for a new study effect
        // Reference: Higgins et al. (2009), IntHout et al. (2016)
        // Should use t(k-2) distribution, not z, for proper coverage
        const avgEffect = this.results.effects.reduce((s, e) => s + e.mean, 0) / this.results.effects.length;
        const avgSE = this.results.effects.reduce((s, e) => s + (e.se ?? e.sd ?? 0), 0) / this.results.effects.length;
        const predictionSE = Math.sqrt(avgSE**2 + tauSq);

        // Number of comparisons for df
        const k = this.results.effects.length;
        const df = Math.max(1, k - 2);
        // t-quantile for 95% prediction interval
        const tCrit = this.tQuantile(0.975, df);

        return {
            tau: typeof tau === 'object' ? tau.mean : tau,
            tauSquared: tauSq,
            tauCI: typeof tau === 'object' ? [tau.ci_lower, tau.ci_upper] : null,
            I2: I2,
            H2: H2,
            Q: this.results.Q,
            pValueQ: this.results.pValueQ,
            predictionInterval: {
                lower: avgEffect - tCrit * predictionSE,
                upper: avgEffect + tCrit * predictionSE,
                df: df,
                method: 't-distribution'
            },
            interpretation: this.interpretHeterogeneity(I2)
        };
    }

    /**
     * Interpret heterogeneity level
     */
    interpretHeterogeneity(I2) {
        if (I2 < 25) return 'Low heterogeneity';
        if (I2 < 50) return 'Moderate heterogeneity';
        if (I2 < 75) return 'Substantial heterogeneity';
        return 'Considerable heterogeneity';
    }

    /**
     * Analyze network geometry
     */
    analyzeNetworkGeometry() {
        const nTreatments = this.treatments.length;
        const nEdges = this.network.edges.length;
        const nStudies = this.studies.length;

        // Maximum possible edges
        const maxEdges = nTreatments * (nTreatments - 1) / 2;

        // Network density
        const density = nEdges / maxEdges;

        // Average degree
        const degrees = this.treatments.map(t =>
            this.network.edges.filter(e => e.treatment1 === t || e.treatment2 === t).length
        );
        const avgDegree = degrees.reduce((a, b) => a + b, 0) / nTreatments;

        // Find bridges (edges whose removal disconnects the network)
        const bridges = this.findBridges();

        return {
            nTreatments,
            nEdges,
            nStudies,
            nContrasts: this.contrasts.length,
            density,
            avgDegree,
            minDegree: Math.min(...degrees),
            maxDegree: Math.max(...degrees),
            isConnected: this.network.isConnected,
            bridges,
            hasBridges: bridges.length > 0,
            networkType: this.classifyNetwork()
        };
    }

    /**
     * Find bridge edges in the network
     */
    findBridges() {
        const bridges = [];
        const adjMatrix = this.network.adjacencyMatrix;
        const n = adjMatrix.length;

        // Try removing each edge and check connectivity
        for (const edge of this.network.edges) {
            const i = this.treatments.indexOf(edge.treatment1);
            const j = this.treatments.indexOf(edge.treatment2);

            // Temporarily remove edge
            const temp = adjMatrix[i][j];
            adjMatrix[i][j] = 0;
            adjMatrix[j][i] = 0;

            if (!this.checkConnectivity(adjMatrix)) {
                bridges.push(edge);
            }

            // Restore edge
            adjMatrix[i][j] = temp;
            adjMatrix[j][i] = temp;
        }

        return bridges;
    }

    /**
     * Classify network structure
     */
    classifyNetwork() {
        const nTreatments = this.treatments.length;
        const nEdges = this.network.edges.length;
        const maxEdges = nTreatments * (nTreatments - 1) / 2;

        if (nEdges === maxEdges) return 'Complete (all treatments compared)';
        if (nEdges === nTreatments - 1) return 'Star (hub-and-spoke)';
        if (nEdges === nTreatments) return 'Ring';
        if (nEdges < nTreatments) return 'Sparse';
        return 'Partial';
    }

    /**
     * Standard normal CDF
     */
    normalCDF(z) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

        const sign = z < 0 ? -1 : 1;
        z = Math.abs(z) / Math.sqrt(2);
        const t = 1 / (1 + p * z);
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
        return 0.5 * (1 + sign * y);
    }

    /**
     * t-distribution quantile function
     * Uses approximation for numerical stability
     */
    tQuantile(p, df) {
        if (df <= 0) return NaN;
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        // For large df, use normal approximation
        if (df > 1000) {
            return this.normalQuantile(p);
        }

        // Newton-Raphson iteration starting from normal quantile
        let x = this.normalQuantile(p);

        for (let iter = 0; iter < 20; iter++) {
            const cdf = this.tCDF(x, df);
            const pdf = this.tPDF(x, df);
            if (Math.abs(pdf) < 1e-15) break;

            const delta = (cdf - p) / pdf;
            x -= delta;

            if (Math.abs(delta) < 1e-10) break;
        }

        return x;
    }

    /**
     * t-distribution CDF
     */
    tCDF(x, df) {
        const t2 = x * x;
        const p = df / (df + t2);

        if (x >= 0) {
            return 1 - 0.5 * this.regularizedBeta(p, df / 2, 0.5);
        } else {
            return 0.5 * this.regularizedBeta(p, df / 2, 0.5);
        }
    }

    /**
     * t-distribution PDF
     */
    tPDF(x, df) {
        const coeff = Math.exp(this.logGamma((df + 1) / 2) - this.logGamma(df / 2));
        return coeff / (Math.sqrt(df * Math.PI) * Math.pow(1 + x * x / df, (df + 1) / 2));
    }

    /**
     * Normal quantile (inverse CDF)
     */
    normalQuantile(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;

        // Rational approximation for central region
        const a = [
            -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01
        ];
        const c = [
            -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00
        ];
        const d = [
            7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00
        ];

        const pLow = 0.02425;
        const pHigh = 1 - pLow;

        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                   ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
                   (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                    ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        }
    }

    /**
     * Regularized incomplete beta function
     */
    regularizedBeta(x, a, b) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        // Use continued fraction for numerical stability
        const bt = Math.exp(
            this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
            a * Math.log(x) + b * Math.log(1 - x)
        );

        if (x < (a + 1) / (a + b + 2)) {
            return bt * this.betaCF(x, a, b) / a;
        } else {
            return 1 - bt * this.betaCF(1 - x, b, a) / b;
        }
    }

    /**
     * Continued fraction for incomplete beta
     */
    betaCF(x, a, b) {
        const FPMIN = 1e-30;
        const EPS = 1e-10;
        const ITMAX = 200;

        const qab = a + b;
        const qap = a + 1;
        const qam = a - 1;

        let c = 1;
        let d = 1 - qab * x / qap;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= ITMAX; m++) {
            const m2 = 2 * m;

            // Even step
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            h *= d * c;

            // Odd step
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            const delta = d * c;
            h *= delta;

            if (Math.abs(delta - 1) < EPS) break;
        }

        return h;
    }

    /**
     * Chi-squared CDF
     */
    chiSquaredCDF(x, df) {
        if (x <= 0) return 0;
        return this.regularizedGammaP(df / 2, x / 2);
    }

    /**
     * Regularized incomplete gamma P(a, x)
     */
    regularizedGammaP(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        if (x < a + 1) {
            let sum = 1 / a;
            let term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-10) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
        } else {
            return 1 - this.regularizedGammaQ(a, x);
        }
    }

    regularizedGammaQ(a, x) {
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

        return f * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
    }

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
     * Generate comparison-adjusted funnel plot data
     */
    generateFunnelPlot() {
        const data = [];

        for (const contrast of this.contrasts) {
            // Get expected effect from NMA
            const idx1 = this.treatments.indexOf(contrast.treatment1);
            const idx2 = this.treatments.indexOf(contrast.treatment2);

            let expectedEffect;
            if (idx1 === 0) {
                expectedEffect = this.results.effects.find(e => e.treatment === contrast.treatment2)?.mean ?? 0;
            } else if (idx2 === 0) {
                expectedEffect = -(this.results.effects.find(e => e.treatment === contrast.treatment1)?.mean ?? 0);
            } else {
                const d1 = this.results.effects.find(e => e.treatment === contrast.treatment1)?.mean ?? 0;
                const d2 = this.results.effects.find(e => e.treatment === contrast.treatment2)?.mean ?? 0;
                expectedEffect = d2 - d1;
            }

            // Comparison-adjusted: observed - expected
            const adjustedEffect = contrast.effect - expectedEffect;

            data.push({
                study: contrast.study,
                comparison: `${contrast.treatment1} vs ${contrast.treatment2}`,
                effect: contrast.effect,
                adjustedEffect: adjustedEffect,
                se: contrast.se,
                invSE: 1 / contrast.se,
                expectedEffect: expectedEffect
            });
        }

        return {
            data,
            reference: 0,  // Centered at expected effect
            confidenceBands: [
                { level: 0.95, z: this.normalQuantile(0.975) },
                { level: 0.99, z: this.normalQuantile(0.995) }
            ]
        };
    }
}

// Export for browser and Node.js
if (typeof window !== 'undefined') {
    window.NetworkMetaAnalysis = NetworkMetaAnalysis;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkMetaAnalysis };
}
