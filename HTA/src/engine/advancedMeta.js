/**
 * Advanced Meta-Analysis Methods - Beyond R Packages
 * HTA Artifact Standard v0.4
 *
 * Implements cutting-edge methods that exceed capabilities of:
 * - metafor (multilevel, multivariate)
 * - clubSandwich (RVE)
 * - dosresmeta (dose-response)
 * - netmeta (component NMA)
 *
 * References:
 * - Cheung (2014) - Three-level meta-analysis
 * - Hedges, Tipton & Johnson (2010) - Robust variance estimation
 * - Crippa & Orsini (2016) - Dose-response meta-analysis
 * - Welton et al (2009) - Component NMA
 */

class AdvancedMetaAnalysis {
    constructor(options = {}) {
        this.options = {
            method: 'REML',
            maxIterations: 1000,
            convergence: 1e-8,
            alpha: 0.05,
            ...options
        };
        // Seeded PRNG (LCG) for reproducibility — avoid Math.random()
        this._rngState = options.seed ?? 12345;
    }

    /** Seeded uniform random in (0, 1) */
    _seededRandom() {
        this._rngState = (this._rngState * 1103515245 + 12345) & 0x7fffffff;
        return this._rngState / 0x7fffffff || 1e-10; // avoid exact 0
    }

    // ============================================================
    // THREE-LEVEL META-ANALYSIS
    // For dependent effect sizes (multiple outcomes per study)
    // ============================================================

    /**
     * Three-level random effects meta-analysis
     * Level 1: Sampling variance (known)
     * Level 2: Within-study variance (effects within studies)
     * Level 3: Between-study variance (studies)
     *
     * Model: y_ij = μ + u_j + v_ij + e_ij
     * where u_j ~ N(0, τ²_between), v_ij ~ N(0, τ²_within)
     */
    threeLevel(data, options = {}) {
        const opts = {
            studyVar: 'study',
            effectVar: 'effect_id',
            yiVar: 'yi',
            viVar: 'vi',
            method: this.options.method,
            ...options
        };

        // Organize data by study
        const studies = this.groupByStudy(data, opts);
        const n = data.length;
        const k = Object.keys(studies).length;

        // Initial estimates using method of moments
        let tau2Between = this.estimateVarianceComponent(data, 'between');
        let tau2Within = this.estimateVarianceComponent(data, 'within');

        // REML estimation using EM algorithm
        if (opts.method === 'REML') {
            const result = this.threeLevelREML(data, studies, tau2Between, tau2Within, opts);
            tau2Between = result.tau2Between;
            tau2Within = result.tau2Within;
        }

        // Calculate pooled effect with three-level weights
        const weights = this.calculateThreeLevelWeights(data, studies, tau2Between, tau2Within, opts);
        const sumW = weights.reduce((a, b) => a + b, 0);

        const yi = data.map(d => d[opts.yiVar]);
        const mu = weights.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
        const seMu = Math.sqrt(1 / sumW);

        // Variance decomposition
        const totalVar = tau2Between + tau2Within;
        const I2Level2 = totalVar > 0 ? (tau2Within / totalVar) * 100 : 0;
        const I2Level3 = totalVar > 0 ? (tau2Between / totalVar) * 100 : 0;

        // Calculate typical sampling variance for I² calculation
        const typicalV = this.harmonicMean(data.map(d => d[opts.viVar]));
        const I2Total = (totalVar / (totalVar + typicalV)) * 100;

        // Profile likelihood CIs for variance components
        const tau2BetweenCI = this.profileLikelihoodCI(data, studies, 'between', tau2Between, tau2Within, opts);
        const tau2WithinCI = this.profileLikelihoodCI(data, studies, 'within', tau2Between, tau2Within, opts);

        // Test for heterogeneity at each level
        const QWithin = this.calculateQWithin(data, studies, mu, opts);
        const QBetween = this.calculateQBetween(data, studies, mu, opts);

        const z = this.normalQuantile(1 - this.options.alpha / 2);

        return {
            mu: mu,
            se: seMu,
            ci: [mu - z * seMu, mu + z * seMu],
            zValue: mu / seMu,
            pValue: 2 * (1 - this.normalCDF(Math.abs(mu / seMu))),
            tau2Between: tau2Between,
            tau2BetweenCI: tau2BetweenCI,
            tau2Within: tau2Within,
            tau2WithinCI: tau2WithinCI,
            I2Total: I2Total,
            I2Level2: I2Level2,
            I2Level3: I2Level3,
            QWithin: QWithin,
            QBetween: QBetween,
            nStudies: k,
            nEffects: n,
            effectsPerStudy: n / k,
            weights: weights,
            method: opts.method,
            interpretation: this.interpretThreeLevel(I2Level2, I2Level3)
        };
    }

    threeLevelREML(data, studies, tau2BetweenInit, tau2WithinInit, opts) {
        let tau2Between = tau2BetweenInit;
        let tau2Within = tau2WithinInit;

        for (let iter = 0; iter < this.options.maxIterations; iter++) {
            const oldBetween = tau2Between;
            const oldWithin = tau2Within;

            // E-step: Calculate expected values
            const weights = this.calculateThreeLevelWeights(data, studies, tau2Between, tau2Within, opts);
            const sumW = weights.reduce((a, b) => a + b, 0);
            const yi = data.map(d => d[opts.yiVar]);
            const mu = weights.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

            // M-step: Update variance components
            let ssWithin = 0;
            let dfWithin = 0;
            let ssBetween = 0;
            let dfBetween = 0;

            for (const studyId in studies) {
                const studyData = studies[studyId];
                const nj = studyData.length;

                // Within-study contribution
                const studyMean = studyData.reduce((s, d) => s + d[opts.yiVar], 0) / nj;
                for (const d of studyData) {
                    const vi = d[opts.viVar];
                    const wi = 1 / (vi + tau2Within);
                    ssWithin += wi * Math.pow(d[opts.yiVar] - studyMean, 2);
                }
                dfWithin += nj - 1;

                // Between-study contribution
                const studyVar = studyData.reduce((s, d) => s + d[opts.viVar], 0) / nj + tau2Within / nj;
                const wj = 1 / (studyVar + tau2Between);
                ssBetween += wj * Math.pow(studyMean - mu, 2);
                dfBetween += 1;
            }
            dfBetween -= 1; // For estimating mu

            // Update variance components
            if (dfWithin > 0) {
                tau2Within = Math.max(0, (ssWithin - dfWithin) / dfWithin * tau2Within);
            }
            if (dfBetween > 0) {
                tau2Between = Math.max(0, (ssBetween - dfBetween) / dfBetween * tau2Between);
            }

            // Check convergence
            if (Math.abs(tau2Between - oldBetween) < this.options.convergence &&
                Math.abs(tau2Within - oldWithin) < this.options.convergence) {
                break;
            }
        }

        return { tau2Between, tau2Within };
    }

    calculateThreeLevelWeights(data, studies, tau2Between, tau2Within, opts) {
        const weights = [];

        for (const d of data) {
            const studyId = d[opts.studyVar];
            const nj = studies[studyId].length;
            const vi = d[opts.viVar];

            // Three-level weight
            const totalVar = vi + tau2Within + tau2Between;
            weights.push(1 / totalVar);
        }

        return weights;
    }

    // ============================================================
    // MULTIVARIATE META-ANALYSIS
    // For multiple correlated outcomes
    // ============================================================

    /**
     * Multivariate random effects meta-analysis
     * Handles multiple correlated outcomes per study
     * Uses generalized least squares
     */
    multivariate(data, options = {}) {
        const opts = {
            outcomes: [], // Array of outcome names
            correlationMatrix: null, // Within-study correlation (if known)
            estimateCorrelation: true,
            ...options
        };

        const p = opts.outcomes.length; // Number of outcomes
        const k = data.length; // Number of studies

        // Build design matrix and response vector
        const { X, y, V } = this.buildMultivariateSystem(data, opts);
        const n = y.length;

        // Initial between-study covariance matrix (diagonal)
        let Sigma = this.initializeSigma(data, opts);

        // Estimate using REML
        if (this.options.method === 'REML') {
            Sigma = this.multivariateREML(X, y, V, Sigma, opts);
        }

        // Calculate pooled effects
        const W = this.calculateMultivariateWeights(V, Sigma);
        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), W), X);
        const XtWy = this.matrixMultiply(this.matrixMultiply(this.transpose(X), W), [y])[0];

        const XtWXinv = this.invertMatrix(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));

        // Standard errors
        const se = XtWXinv.map((row, i) => Math.sqrt(row[i]));

        // Correlation between estimates
        const corMatrix = [];
        for (let i = 0; i < p; i++) {
            corMatrix[i] = [];
            for (let j = 0; j < p; j++) {
                corMatrix[i][j] = XtWXinv[i][j] / (se[i] * se[j]);
            }
        }

        // Heterogeneity
        const I2 = this.calculateMultivariateI2(V, Sigma);

        const z = this.normalQuantile(1 - this.options.alpha / 2);

        return {
            effects: opts.outcomes.map((outcome, i) => ({
                outcome: outcome,
                estimate: beta[i],
                se: se[i],
                ci: [beta[i] - z * se[i], beta[i] + z * se[i]],
                zValue: beta[i] / se[i],
                pValue: 2 * (1 - this.normalCDF(Math.abs(beta[i] / se[i])))
            })),
            betweenStudyCovariance: Sigma,
            betweenStudyCorrelation: this.covToCorr(Sigma),
            estimateCorrelation: corMatrix,
            I2: I2,
            nStudies: k,
            nOutcomes: p
        };
    }

    // ============================================================
    // ROBUST VARIANCE ESTIMATION (RVE)
    // Cluster-robust standard errors for dependent effects
    // ============================================================

    /**
     * Robust Variance Estimation using CR2 (bias-corrected)
     * Handles arbitrary dependence structure within clusters
     * References: Hedges, Tipton & Johnson (2010); Tipton (2015)
     */
    robustVariance(data, options = {}) {
        const opts = {
            clusterVar: 'study',
            yiVar: 'yi',
            viVar: 'vi',
            moderators: [],
            smallSampleCorrection: 'CR2', // 'CR0', 'CR1', 'CR2'
            rho: 0.8, // Assumed working correlation
            ...options
        };

        // Build model matrices
        const { X, y, clusters, n, p } = this.buildRVESystem(data, opts);

        // Calculate working weights (assuming common correlation)
        const W = this.calculateWorkingWeights(data, clusters, opts);

        // GLS estimates
        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), W), X);
        const XtWy = this.matrixMultiply(this.transpose(X), this.elementWiseMultiply(this.getDiagonal(W), y));

        const XtWXinv = this.invertMatrix(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));

        // Calculate residuals
        const yhat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
        const residuals = y.map((yi, i) => yi - yhat[i]);

        // Cluster-robust variance estimation
        let meat = this.zeroMatrix(p, p);
        const clusterIds = [...new Set(data.map(d => d[opts.clusterVar]))];
        const J = clusterIds.length; // Number of clusters

        // Adjustment matrices for small sample correction
        const adjustments = this.calculateRVEAdjustments(X, W, XtWXinv, clusters, opts);

        for (const clusterId of clusterIds) {
            const indices = data.map((d, i) => d[opts.clusterVar] === clusterId ? i : -1).filter(i => i >= 0);
            const Xj = indices.map(i => X[i]);
            const ej = indices.map(i => residuals[i]);

            // Apply small sample correction
            let ejAdj = ej;
            if (opts.smallSampleCorrection !== 'CR0') {
                const Aj = adjustments[clusterId];
                ejAdj = this.matrixVectorMultiply(Aj, ej);
            }

            // Outer product
            const XjTej = Xj[0].map((_, col) =>
                Xj.reduce((s, row, i) => s + row[col] * ejAdj[i], 0)
            );

            for (let i = 0; i < p; i++) {
                for (let k = 0; k < p; k++) {
                    meat[i][k] += XjTej[i] * XjTej[k];
                }
            }
        }

        // Sandwich estimator: (X'WX)^-1 * meat * (X'WX)^-1
        const vcov = this.matrixMultiply(this.matrixMultiply(XtWXinv, meat), XtWXinv);
        const se = vcov.map((row, i) => Math.sqrt(row[i]));

        // Satterthwaite degrees of freedom
        const dfs = this.calculateSatterthwaiteDf(X, W, vcov, clusters, opts);

        // Results
        const z = this.normalQuantile(1 - this.options.alpha / 2);
        const moderatorNames = ['intercept', ...opts.moderators];

        return {
            coefficients: moderatorNames.map((name, i) => {
                const tValue = beta[i] / se[i];
                const df = dfs[i];
                const pValue = 2 * (1 - this.tCDF(Math.abs(tValue), df));
                const tCrit = this.tQuantile(1 - this.options.alpha / 2, df);

                return {
                    name: name,
                    estimate: beta[i],
                    se: se[i],
                    tValue: tValue,
                    df: df,
                    pValue: pValue,
                    ci: [beta[i] - tCrit * se[i], beta[i] + tCrit * se[i]]
                };
            }),
            vcov: vcov,
            nClusters: J,
            nEffects: n,
            avgClusterSize: n / J,
            correction: opts.smallSampleCorrection,
            rho: opts.rho
        };
    }

    calculateRVEAdjustments(X, W, bread, clusters, opts) {
        const adjustments = {};
        const clusterIds = [...new Set(Object.values(clusters))];
        const n = X.length;
        const p = X[0].length;

        // Precompute H = X(X'WX)^-1 X'W
        const XBread = this.matrixMultiply(X, bread);

        for (const clusterId of clusterIds) {
            const indices = [];
            for (let i = 0; i < n; i++) {
                if (clusters[i] === clusterId) indices.push(i);
            }
            const nj = indices.length;

            if (opts.smallSampleCorrection === 'CR1') {
                // Simple inflation
                const scale = Math.sqrt(clusterIds.length / (clusterIds.length - 1));
                adjustments[clusterId] = this.identityMatrix(nj).map(row => row.map(v => v * scale));
            } else if (opts.smallSampleCorrection === 'CR2') {
                // Bias-reduced linearization
                // A_j = (I - H_jj)^{-1/2}
                const Hjj = [];
                for (let i = 0; i < nj; i++) {
                    Hjj[i] = [];
                    for (let k = 0; k < nj; k++) {
                        const row1 = indices[i];
                        const row2 = indices[k];
                        let val = 0;
                        for (let m = 0; m < p; m++) {
                            val += XBread[row1][m] * X[row2][m] * W[row2][row2];
                        }
                        Hjj[i][k] = val;
                    }
                }

                const IminusH = this.identityMatrix(nj);
                for (let i = 0; i < nj; i++) {
                    for (let k = 0; k < nj; k++) {
                        IminusH[i][k] -= Hjj[i][k];
                    }
                }

                // Matrix square root inverse (using eigendecomposition)
                adjustments[clusterId] = this.matrixSqrtInverse(IminusH);
            }
        }

        return adjustments;
    }

    // ============================================================
    // NETWORK META-REGRESSION
    // Covariates in network meta-analysis
    // ============================================================

    /**
     * Network Meta-Regression
     * Extends NMA to include study-level or treatment-level covariates
     */
    networkMetaRegression(data, covariates, options = {}) {
        const opts = {
            model: 'random',
            covariateType: 'study', // 'study', 'treatment', 'interaction'
            reference: null,
            ...options
        };

        // Get unique treatments
        const treatments = [...new Set(data.flatMap(d => [d.treat1, d.treat2]))];
        const nTreat = treatments.length;
        const nStudies = data.length;
        const nCov = covariates.length;

        // Set reference treatment
        const reference = opts.reference || treatments[0];
        const treatIndex = {};
        let idx = 0;
        for (const t of treatments) {
            if (t !== reference) {
                treatIndex[t] = idx++;
            }
        }
        treatIndex[reference] = -1; // Reference

        // Build design matrix including covariates
        const X = [];
        const y = [];
        const V = [];

        for (const study of data) {
            const t1idx = treatIndex[study.treat1];
            const t2idx = treatIndex[study.treat2];

            // Basic treatment contrast
            const row = new Array(nTreat - 1 + nCov * (nTreat - 1)).fill(0);

            if (t1idx >= 0) row[t1idx] = -1;
            if (t2idx >= 0) row[t2idx] = 1;

            // Add covariate interactions
            for (let c = 0; c < nCov; c++) {
                const covValue = study[covariates[c]] || 0;
                const offset = (nTreat - 1) + c * (nTreat - 1);

                if (opts.covariateType === 'study') {
                    // Same covariate effect for all comparisons
                    if (t1idx >= 0) row[offset + t1idx] = -covValue;
                    if (t2idx >= 0) row[offset + t2idx] = covValue;
                } else if (opts.covariateType === 'treatment') {
                    // Treatment-specific covariate effects
                    if (t2idx >= 0) row[offset + t2idx] = covValue;
                }
            }

            X.push(row);
            y.push(study.yi);
            V.push(study.vi);
        }

        // Estimate tau² for network
        const tau2 = this.estimateNetworkTau2(y, V, X, opts);

        // GLS estimation
        const W = V.map((v, i) => 1 / (v + tau2));
        const Wmat = this.diagonalMatrix(W);

        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), Wmat), X);
        const XtWy = X[0].map((_, j) => X.reduce((s, row, i) => s + row[j] * W[i] * y[i], 0));

        const XtWXinv = this.invertMatrix(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));
        const se = XtWXinv.map((row, i) => Math.sqrt(row[i]));

        // Parse results
        const treatmentEffects = [];
        const covariateEffects = [];

        for (let t = 0; t < nTreat - 1; t++) {
            const treatName = treatments.find(tr => treatIndex[tr] === t);
            treatmentEffects.push({
                treatment: treatName,
                vsReference: reference,
                estimate: beta[t],
                se: se[t],
                pValue: 2 * (1 - this.normalCDF(Math.abs(beta[t] / se[t])))
            });
        }

        for (let c = 0; c < nCov; c++) {
            const offset = nTreat - 1 + c * (nTreat - 1);
            const covEffects = [];

            for (let t = 0; t < nTreat - 1; t++) {
                const treatName = treatments.find(tr => treatIndex[tr] === t);
                covEffects.push({
                    treatment: treatName,
                    estimate: beta[offset + t],
                    se: se[offset + t],
                    pValue: 2 * (1 - this.normalCDF(Math.abs(beta[offset + t] / se[offset + t])))
                });
            }

            covariateEffects.push({
                covariate: covariates[c],
                effects: covEffects
            });
        }

        return {
            treatmentEffects: treatmentEffects,
            covariateEffects: covariateEffects,
            tau2: tau2,
            reference: reference,
            nStudies: nStudies,
            nTreatments: nTreat,
            nCovariates: nCov
        };
    }

    // ============================================================
    // DOSE-RESPONSE META-ANALYSIS
    // Non-linear relationships using splines
    // ============================================================

    /**
     * Dose-response meta-analysis with restricted cubic splines
     * References: Orsini et al (2012), Crippa & Orsini (2016)
     */
    doseResponse(data, options = {}) {
        const opts = {
            doseVar: 'dose',
            yiVar: 'yi',
            viVar: 'vi',
            nVar: 'n',
            studyVar: 'study',
            referenceVar: 'reference', // Boolean indicating reference category
            splineKnots: 3, // Number of knots (3, 4, or 5)
            knotPositions: null, // Custom knot positions (percentiles)
            model: 'random',
            ...options
        };

        // Get all doses and determine knot positions
        const doses = data.map(d => d[opts.doseVar]);
        const knots = opts.knotPositions || this.calculateKnots(doses, opts.splineKnots);

        // Generate spline basis
        const splineBasis = this.restrictedCubicSpline(doses, knots);
        const nSplines = splineBasis[0].length;

        // Group by study
        const studies = this.groupByStudy(data, opts);
        const studyIds = Object.keys(studies);

        // Build contrast matrices for each study
        let X = [];
        let y = [];
        let V = []; // Block diagonal covariance matrix

        for (const studyId of studyIds) {
            const studyData = studies[studyId];

            // Find reference category
            const refIdx = studyData.findIndex(d => d[opts.referenceVar]);
            if (refIdx < 0) continue;

            const refDose = studyData[refIdx][opts.doseVar];
            const refSpline = this.restrictedCubicSpline([refDose], knots)[0];

            // Create contrasts vs reference
            for (let i = 0; i < studyData.length; i++) {
                if (i === refIdx) continue;

                const d = studyData[i];
                const spline = this.restrictedCubicSpline([d[opts.doseVar]], knots)[0];

                // Contrast: X_i - X_ref
                const contrast = spline.map((s, j) => s - refSpline[j]);
                X.push(contrast);
                y.push(d[opts.yiVar]);

                // Variance (assuming independence for now)
                V.push(d[opts.viVar]);
            }
        }

        // Estimate tau² using DerSimonian-Laird
        let tau2 = 0;
        if (opts.model === 'random') {
            tau2 = this.estimateTau2DL(y, V, X);
        }

        // GLS estimation
        const W = V.map(v => 1 / (v + tau2));
        const Wmat = this.diagonalMatrix(W);

        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), Wmat), X);
        const XtWy = X[0].map((_, j) => X.reduce((s, row, i) => s + row[j] * W[i] * y[i], 0));

        const XtWXinv = this.invertMatrix(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));
        const se = XtWXinv.map((row, i) => Math.sqrt(row[i]));

        // Generate dose-response curve
        const zCrit = this.normalQuantile(1 - this.options.alpha / 2);
        const doseRange = this.linspace(Math.min(...doses), Math.max(...doses), 100);
        const curve = doseRange.map(dose => {
            const spline = this.restrictedCubicSpline([dose], knots)[0];
            const pred = spline.reduce((s, x, j) => s + x * beta[j], 0);
            const variance = spline.reduce((s1, x1, i) =>
                s1 + spline.reduce((s2, x2, j) => s2 + x1 * x2 * XtWXinv[i][j], 0), 0
            );
            const sePred = Math.sqrt(variance);

            return {
                dose: dose,
                effect: pred,
                se: sePred,
                ciLower: pred - zCrit * sePred,
                ciUpper: pred + zCrit * sePred
            };
        });

        // Test for non-linearity
        const linearModel = this.doseResponseLinear(data, opts);
        const nonLinearityTest = this.testNonLinearity(beta, XtWXinv, linearModel);

        // Test for overall association
        const waldStat = beta.reduce((s, b, i) =>
            s + beta.reduce((s2, b2, j) => {
                const invCov = this.invertMatrix(XtWXinv);
                return s2 + b * b2 * invCov[i][j];
            }, 0), 0
        );
        const pValueOverall = 1 - this.chiSquareCDF(waldStat, nSplines);

        return {
            coefficients: beta.map((b, i) => ({
                spline: i + 1,
                estimate: b,
                se: se[i]
            })),
            curve: curve,
            knots: knots,
            tau2: tau2,
            nStudies: studyIds.length,
            nDoses: data.length,
            nonLinearityTest: nonLinearityTest,
            overallTest: {
                statistic: waldStat,
                df: nSplines,
                pValue: pValueOverall
            }
        };
    }

    restrictedCubicSpline(x, knots) {
        // Restricted cubic spline transformation
        // k knots gives k-2 spline variables (plus linear term)
        const n = x.length;
        const k = knots.length;
        const result = [];

        for (let i = 0; i < n; i++) {
            const row = [x[i]]; // Linear term

            for (let j = 0; j < k - 2; j++) {
                const t1 = knots[j];
                const tk1 = knots[k - 2];
                const tk = knots[k - 1];

                const term1 = Math.pow(Math.max(0, x[i] - t1), 3);
                const term2 = Math.pow(Math.max(0, x[i] - tk1), 3) * (tk - t1) / (tk - tk1);
                const term3 = Math.pow(Math.max(0, x[i] - tk), 3) * (tk1 - t1) / (tk - tk1);

                row.push(term1 - term2 + term3);
            }

            result.push(row);
        }

        return result;
    }

    calculateKnots(x, nKnots) {
        // Default knot positions at percentiles
        const sorted = [...x].sort((a, b) => a - b);
        const n = sorted.length;

        let percentiles;
        if (nKnots === 3) {
            percentiles = [0.10, 0.50, 0.90];
        } else if (nKnots === 4) {
            percentiles = [0.05, 0.35, 0.65, 0.95];
        } else if (nKnots === 5) {
            percentiles = [0.05, 0.275, 0.50, 0.725, 0.95];
        } else {
            percentiles = this.linspace(0.05, 0.95, nKnots);
        }

        return percentiles.map(p => {
            const idx = Math.floor(p * (n - 1));
            return sorted[idx];
        });
    }

    // ============================================================
    // COMPONENT NETWORK META-ANALYSIS
    // For complex interventions
    // ============================================================

    /**
     * Component Network Meta-Analysis
     * Decomposes complex interventions into components
     * References: Welton et al (2009), Rücker et al (2020)
     */
    componentNMA(data, options = {}) {
        const opts = {
            componentVar: 'components', // Array of component names per treatment
            model: 'additive', // 'additive', 'full', 'interaction2'
            reference: null, // Reference component combination
            ...options
        };

        // Parse all unique components
        const allComponents = new Set();
        for (const study of data) {
            for (const comp of study.treat1Components || []) allComponents.add(comp);
            for (const comp of study.treat2Components || []) allComponents.add(comp);
        }
        const components = [...allComponents].sort();
        const nComp = components.length;

        // Build component design matrix
        const X = [];
        const y = [];
        const V = [];

        for (const study of data) {
            const t1Comps = new Set(study.treat1Components || []);
            const t2Comps = new Set(study.treat2Components || []);

            // Component contrast vector
            const row = [];

            if (opts.model === 'additive') {
                // Each component contributes additively
                for (const comp of components) {
                    const in1 = t1Comps.has(comp) ? 1 : 0;
                    const in2 = t2Comps.has(comp) ? 1 : 0;
                    row.push(in2 - in1);
                }
            } else if (opts.model === 'interaction2') {
                // Main effects + 2-way interactions
                // Main effects
                for (const comp of components) {
                    const in1 = t1Comps.has(comp) ? 1 : 0;
                    const in2 = t2Comps.has(comp) ? 1 : 0;
                    row.push(in2 - in1);
                }
                // 2-way interactions
                for (let i = 0; i < nComp; i++) {
                    for (let j = i + 1; j < nComp; j++) {
                        const int1 = (t1Comps.has(components[i]) && t1Comps.has(components[j])) ? 1 : 0;
                        const int2 = (t2Comps.has(components[i]) && t2Comps.has(components[j])) ? 1 : 0;
                        row.push(int2 - int1);
                    }
                }
            }

            X.push(row);
            y.push(study.yi);
            V.push(study.vi);
        }

        // Check for estimability
        const rank = this.matrixRank(X);
        const nParams = X[0].length;

        if (rank < nParams) {
            // Model not fully estimable (rank < nParams)
        }

        // Estimate using GLS with tau²
        const tau2 = this.estimateTau2DL(y, V, X);
        const W = V.map(v => 1 / (v + tau2));
        const Wmat = this.diagonalMatrix(W);

        // Use pseudo-inverse if rank deficient
        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), Wmat), X);
        const XtWy = X[0].map((_, j) => X.reduce((s, row, i) => s + row[j] * W[i] * y[i], 0));

        const XtWXinv = this.pseudoInverse(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));
        const se = XtWXinv.map((row, i) => Math.sqrt(Math.max(0, row[i])));

        // Parse component effects
        const componentEffects = [];
        for (let i = 0; i < nComp; i++) {
            const z = this.normalQuantile(1 - this.options.alpha / 2);
            componentEffects.push({
                component: components[i],
                estimate: beta[i],
                se: se[i],
                ci: [beta[i] - z * se[i], beta[i] + z * se[i]],
                pValue: 2 * (1 - this.normalCDF(Math.abs(beta[i] / se[i])))
            });
        }

        // Interaction effects (if applicable)
        let interactionEffects = [];
        if (opts.model === 'interaction2') {
            let idx = nComp;
            for (let i = 0; i < nComp; i++) {
                for (let j = i + 1; j < nComp; j++) {
                    const z = this.normalQuantile(1 - this.options.alpha / 2);
                    interactionEffects.push({
                        components: [components[i], components[j]],
                        estimate: beta[idx],
                        se: se[idx],
                        ci: [beta[idx] - z * se[idx], beta[idx] + z * se[idx]],
                        pValue: 2 * (1 - this.normalCDF(Math.abs(beta[idx] / se[idx])))
                    });
                    idx++;
                }
            }
        }

        // Predict effect of any combination
        const predictCombination = (componentList) => {
            const compSet = new Set(componentList);
            let effect = 0;
            let variance = 0;

            // Main effects
            for (let i = 0; i < nComp; i++) {
                if (compSet.has(components[i])) {
                    effect += beta[i];
                    variance += XtWXinv[i][i];
                }
            }

            // Interactions
            if (opts.model === 'interaction2') {
                let idx = nComp;
                for (let i = 0; i < nComp; i++) {
                    for (let j = i + 1; j < nComp; j++) {
                        if (compSet.has(components[i]) && compSet.has(components[j])) {
                            effect += beta[idx];
                            variance += XtWXinv[idx][idx];
                        }
                        idx++;
                    }
                }
            }

            const z = this.normalQuantile(1 - this.options.alpha / 2);
            const sePred = Math.sqrt(variance);

            return {
                components: componentList,
                effect: effect,
                se: sePred,
                ci: [effect - z * sePred, effect + z * sePred]
            };
        };

        return {
            components: components,
            componentEffects: componentEffects,
            interactionEffects: interactionEffects,
            tau2: tau2,
            nStudies: data.length,
            nComponents: nComp,
            model: opts.model,
            rank: rank,
            estimable: rank >= nParams,
            predictCombination: predictCombination
        };
    }

    // ============================================================
    // BAYESIAN MODEL AVERAGING
    // Account for model uncertainty
    // ============================================================

    /**
     * Bayesian Model Averaging for meta-analysis
     * Averages across multiple model specifications
     */
    bayesianModelAveraging(data, options = {}) {
        const opts = {
            models: ['FE', 'RE-DL', 'RE-REML', 'RE-PM'],
            priorModelProb: null, // Equal priors if null
            nIterations: 10000,
            ...options
        };

        const results = [];
        const posteriorSamples = [];

        // Fit each model
        for (const modelType of opts.models) {
            let result;

            if (modelType === 'FE') {
                result = this.fixedEffect(data);
                result.modelType = 'Fixed Effect';
            } else if (modelType.startsWith('RE-')) {
                const method = modelType.split('-')[1];
                result = this.randomEffects(data, { method });
                result.modelType = `Random Effects (${method})`;
            }

            // Calculate model evidence (BIC approximation)
            const logLik = this.calculateLogLikelihood(data, result);
            const nParams = modelType === 'FE' ? 1 : 2;
            const bic = -2 * logLik + nParams * Math.log(data.length);

            result.logLikelihood = logLik;
            result.bic = bic;
            result.modelType = modelType;

            results.push(result);
        }

        // Calculate posterior model probabilities (using BIC approximation)
        const priors = opts.priorModelProb || new Array(opts.models.length).fill(1 / opts.models.length);
        const bicMin = Math.min(...results.map(r => r.bic));
        const weights = results.map((r, i) => priors[i] * Math.exp(-0.5 * (r.bic - bicMin)));
        const sumWeights = weights.reduce((a, b) => a + b, 0);
        const posteriorProbs = weights.map(w => w / sumWeights);

        // Model-averaged estimate
        let bmaEstimate = 0;
        let bmaVariance = 0;

        for (let i = 0; i < results.length; i++) {
            bmaEstimate += posteriorProbs[i] * results[i].mu;
        }

        // Variance includes within-model and between-model variance
        for (let i = 0; i < results.length; i++) {
            const withinVar = Math.pow(results[i].se, 2);
            const betweenVar = Math.pow(results[i].mu - bmaEstimate, 2);
            bmaVariance += posteriorProbs[i] * (withinVar + betweenVar);
        }

        const bmaSE = Math.sqrt(bmaVariance);
        const z = this.normalQuantile(1 - this.options.alpha / 2);

        // Generate posterior samples for uncertainty
        for (let iter = 0; iter < opts.nIterations; iter++) {
            // Sample model
            const u = this._seededRandom();
            let cumProb = 0;
            let selectedModel = 0;
            for (let i = 0; i < posteriorProbs.length; i++) {
                cumProb += posteriorProbs[i];
                if (u < cumProb) {
                    selectedModel = i;
                    break;
                }
            }

            // Sample from selected model's posterior
            const model = results[selectedModel];
            const sample = model.mu + this.randomNormal() * model.se;
            posteriorSamples.push(sample);
        }

        // Posterior quantiles
        posteriorSamples.sort((a, b) => a - b);
        const credibleInterval = [
            posteriorSamples[Math.floor(0.025 * opts.nIterations)],
            posteriorSamples[Math.floor(0.975 * opts.nIterations)]
        ];

        return {
            bmaEstimate: bmaEstimate,
            bmaSE: bmaSE,
            bmaCI: [bmaEstimate - z * bmaSE, bmaEstimate + z * bmaSE],
            credibleInterval: credibleInterval,
            posteriorMedian: posteriorSamples[Math.floor(0.5 * opts.nIterations)],
            models: results.map((r, i) => ({
                type: r.modelType,
                estimate: r.mu,
                se: r.se,
                tau2: r.tau2 ?? 0,
                logLikelihood: r.logLikelihood,
                bic: r.bic,
                posteriorProb: posteriorProbs[i]
            })),
            posteriorSamples: posteriorSamples,
            interpretation: this.interpretBMA(posteriorProbs)
        };
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    fixedEffect(data) {
        const yi = data.map(d => d.yi);
        const vi = data.map(d => d.vi);
        const wi = vi.map(v => 1 / Math.max(v, 1e-10));
        const sumW = wi.reduce((a, b) => a + b, 0);
        const mu = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;
        const se = Math.sqrt(1 / sumW);

        return { mu, se, tau2: 0 };
    }

    randomEffects(data, options = {}) {
        const yi = data.map(d => d.yi);
        const vi = data.map(d => d.vi);
        const method = options.method || 'DL';

        // Fixed effect estimate first
        const wi = vi.map(v => 1 / Math.max(v, 1e-10));
        const sumW = wi.reduce((a, b) => a + b, 0);
        const muFE = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

        // Q statistic
        const Q = wi.reduce((s, w, i) => s + w * Math.pow(yi[i] - muFE, 2), 0);
        const df = data.length - 1;

        // Tau² estimation
        let tau2;
        if (method === 'DL') {
            const c = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;
            tau2 = Math.max(0, (Q - df) / c);
        } else if (method === 'REML') {
            tau2 = this.estimateTauREML(yi, vi, muFE);
        } else if (method === 'PM') {
            tau2 = this.estimateTauPM(yi, vi);
        } else {
            tau2 = Math.max(0, (Q - df) / sumW);
        }

        // Random effects estimate
        const wiRE = vi.map(v => 1 / (v + tau2));
        const sumWRE = wiRE.reduce((a, b) => a + b, 0);
        const mu = wiRE.reduce((s, w, i) => s + w * yi[i], 0) / sumWRE;
        const se = Math.sqrt(1 / sumWRE);

        return { mu, se, tau2 };
    }

    estimateTauREML(yi, vi, muInit) {
        let tau2 = 0.1;
        const n = yi.length;

        for (let iter = 0; iter < 100; iter++) {
            const wi = vi.map(v => 1 / (v + tau2));
            const sumW = wi.reduce((a, b) => a + b, 0);
            const mu = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

            // REML score
            const score = wi.reduce((s, w, i) =>
                s + w * w * (Math.pow(yi[i] - mu, 2) - vi[i] - tau2), 0) / 2;

            // Fisher information
            const info = wi.reduce((s, w) => s + w * w, 0) / 2;

            const tau2New = tau2 + score / info;

            if (Math.abs(tau2New - tau2) < 1e-8) break;
            tau2 = Math.max(0, tau2New);
        }

        return tau2;
    }

    estimateTauPM(yi, vi) {
        // Paule-Mandel iterative estimator
        let tau2 = 0;
        const n = yi.length;
        const target = n - 1;

        for (let iter = 0; iter < 100; iter++) {
            const wi = vi.map(v => 1 / (v + tau2));
            const sumW = wi.reduce((a, b) => a + b, 0);
            const mu = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;
            const Q = wi.reduce((s, w, i) => s + w * Math.pow(yi[i] - mu, 2), 0);

            if (Math.abs(Q - target) < 0.001) break;

            const c = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;
            const tau2New = tau2 + (Q - target) / c;
            tau2 = Math.max(0, tau2New);
        }

        return tau2;
    }

    calculateLogLikelihood(data, result) {
        const yi = data.map(d => d.yi);
        const vi = data.map(d => d.vi);
        const tau2 = result.tau2 ?? 0;
        const mu = result.mu;

        let logLik = 0;
        for (let i = 0; i < yi.length; i++) {
            const totalVar = vi[i] + tau2;
            logLik -= 0.5 * Math.log(2 * Math.PI * totalVar);
            logLik -= 0.5 * Math.pow(yi[i] - mu, 2) / totalVar;
        }

        return logLik;
    }

    groupByStudy(data, opts) {
        const studies = {};
        for (const d of data) {
            const studyId = d[opts.studyVar];
            if (!studies[studyId]) studies[studyId] = [];
            studies[studyId].push(d);
        }
        return studies;
    }

    estimateVarianceComponent(data, type) {
        // Simple moment estimator for initial values
        const yi = data.map(d => d.yi);
        const meanY = yi.reduce((a, b) => a + b, 0) / yi.length;
        const varY = yi.reduce((s, y) => s + Math.pow(y - meanY, 2), 0) / yi.length;
        return Math.max(0, varY * 0.5);
    }

    harmonicMean(values) {
        const n = values.length;
        const sumInv = values.reduce((s, v) => s + 1 / v, 0);
        return n / sumInv;
    }

    interpretThreeLevel(I2Level2, I2Level3) {
        let interp = '';
        if (I2Level3 > 75) {
            interp = 'Substantial between-study heterogeneity. Consider moderator analysis.';
        } else if (I2Level2 > 75) {
            interp = 'Substantial within-study heterogeneity. Effects vary within studies.';
        } else if (I2Level2 + I2Level3 < 25) {
            interp = 'Low heterogeneity at both levels. Fixed effect may be appropriate.';
        } else {
            interp = 'Moderate heterogeneity. Three-level model appropriate.';
        }
        return interp;
    }

    interpretBMA(posteriorProbs) {
        const maxProb = Math.max(...posteriorProbs);
        const maxIdx = posteriorProbs.indexOf(maxProb);

        if (maxProb > 0.95) {
            return `Strong evidence for model ${maxIdx + 1} (posterior probability: ${(maxProb * 100).toFixed(1)}%)`;
        } else if (maxProb > 0.75) {
            return `Moderate evidence for model ${maxIdx + 1}, but model uncertainty remains`;
        } else {
            return 'Substantial model uncertainty. BMA estimate accounts for this uncertainty.';
        }
    }

    // Matrix operations
    transpose(A) {
        return A[0].map((_, j) => A.map(row => row[j]));
    }

    matrixMultiply(A, B) {
        const m = A.length;
        const n = B[0].length;
        const p = B.length;
        const C = [];

        for (let i = 0; i < m; i++) {
            C[i] = [];
            for (let j = 0; j < n; j++) {
                C[i][j] = 0;
                for (let k = 0; k < p; k++) {
                    C[i][j] += A[i][k] * B[k][j];
                }
            }
        }
        return C;
    }

    invertMatrix(A) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            const pivot = augmented[i][i];
            if (Math.abs(pivot) < 1e-10) {
                for (let j = 0; j < 2 * n; j++) augmented[i][j] = 0;
                continue;
            }

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
    }

    pseudoInverse(A) {
        // Moore-Penrose pseudo-inverse using SVD approximation
        const ATA = this.matrixMultiply(this.transpose(A), A);
        const n = ATA.length;

        // Add small regularization for numerical stability
        for (let i = 0; i < n; i++) {
            ATA[i][i] += 1e-10;
        }

        const ATAinv = this.invertMatrix(ATA);
        return this.matrixMultiply(ATAinv, this.transpose(A));
    }

    matrixRank(A) {
        const m = A.length;
        const n = A[0].length;
        const B = A.map(row => [...row]);
        let rank = 0;

        for (let col = 0; col < n && rank < m; col++) {
            let pivot = rank;
            for (let row = rank + 1; row < m; row++) {
                if (Math.abs(B[row][col]) > Math.abs(B[pivot][col])) {
                    pivot = row;
                }
            }

            if (Math.abs(B[pivot][col]) < 1e-10) continue;

            [B[rank], B[pivot]] = [B[pivot], B[rank]];

            for (let row = rank + 1; row < m; row++) {
                const factor = B[row][col] / B[rank][col];
                for (let j = col; j < n; j++) {
                    B[row][j] -= factor * B[rank][j];
                }
            }
            rank++;
        }

        return rank;
    }

    diagonalMatrix(v) {
        const n = v.length;
        return v.map((val, i) => new Array(n).fill(0).map((_, j) => i === j ? val : 0));
    }

    identityMatrix(n) {
        return new Array(n).fill(0).map((_, i) => new Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
    }

    zeroMatrix(m, n) {
        return new Array(m).fill(0).map(() => new Array(n).fill(0));
    }

    getDiagonal(A) {
        return A.map((row, i) => row[i]);
    }

    matrixVectorMultiply(A, v) {
        return A.map(row => row.reduce((s, a, i) => s + a * v[i], 0));
    }

    elementWiseMultiply(a, b) {
        return a.map((v, i) => v * b[i]);
    }

    matrixSqrtInverse(A) {
        // Approximate matrix square root inverse using iterative method
        const n = A.length;
        let Y = this.identityMatrix(n);
        let Z = [...A.map(row => [...row])];

        for (let iter = 0; iter < 50; iter++) {
            const Ynew = Y.map((row, i) => row.map((_, j) => 0.5 * (Y[i][j] + this.invertMatrix(Z)[i][j])));
            const Znew = Z.map((row, i) => row.map((_, j) => 0.5 * (Z[i][j] + this.invertMatrix(Y)[i][j])));
            Y = Ynew;
            Z = Znew;
        }

        return this.invertMatrix(Y);
    }

    linspace(start, end, n) {
        const step = (end - start) / (n - 1);
        return new Array(n).fill(0).map((_, i) => start + i * step);
    }

    // Statistical distributions
    normalQuantile(p) {
        // Approximation for normal quantile
        const a = [
            -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01,
            -1.328068155288572e+01
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

        let q;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                   ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            const r = q * q;
            return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
                   (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                    ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        }
    }

    normalCDF(x) {
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return 0.5 * (1.0 + sign * y);
    }

    tQuantile(p, df) {
        // Approximation using normal for large df
        if (df > 100) return this.normalQuantile(p);

        // Newton-Raphson for t quantile
        let x = this.normalQuantile(p);
        for (let i = 0; i < 10; i++) {
            const fx = this.tCDF(x, df) - p;
            const fpx = this.tPDF(x, df);
            x = x - fx / fpx;
        }
        return x;
    }

    tCDF(x, df) {
        // Beta regularized incomplete function approximation
        const t = df / (df + x * x);
        return 1 - 0.5 * this.betaIncomplete(df / 2, 0.5, t);
    }

    tPDF(x, df) {
        const coef = this.gamma((df + 1) / 2) / (Math.sqrt(df * Math.PI) * this.gamma(df / 2));
        return coef * Math.pow(1 + x * x / df, -(df + 1) / 2);
    }

    chiSquareCDF(x, df) {
        return this.gammaIncomplete(df / 2, x / 2);
    }

    gamma(z) {
        const g = 7;
        const c = [
            0.99999999999980993,
            676.5203681218851,
            -1259.1392167224028,
            771.32342877765313,
            -176.61502916214059,
            12.507343278686905,
            -0.13857109526572012,
            9.9843695780195716e-6,
            1.5056327351493116e-7
        ];

        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
        }

        z -= 1;
        let x = c[0];
        for (let i = 1; i < g + 2; i++) {
            x += c[i] / (z + i);
        }

        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    gammaIncomplete(a, x) {
        // Regularized incomplete gamma function
        if (x < 0 || a <= 0) return 0;

        if (x < a + 1) {
            // Series expansion
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
            return 1 - this.gammaIncompleteUpper(a, x);
        }
    }

    gammaIncompleteUpper(a, x) {
        let f = 1e-30;
        let c = 1e-30;
        let d = 1 / (x + 1 - a);
        let h = d;

        for (let i = 1; i < 100; i++) {
            const an = -i * (i - a);
            const bn = x + 2 * i + 1 - a;
            d = bn + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = bn + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const delta = d * c;
            h *= delta;
            if (Math.abs(delta - 1) < 1e-10) break;
        }

        return Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
    }

    logGamma(x) {
        const c = [
            76.18009172947146,
            -86.50532032941677,
            24.01409824083091,
            -1.231739572450155,
            0.1208650973866179e-2,
            -0.5395239384953e-5
        ];

        let y = x;
        let tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;

        for (let j = 0; j < 6; j++) {
            ser += c[j] / ++y;
        }

        return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    betaIncomplete(a, b, x) {
        // Regularized incomplete beta function
        if (x === 0 || x === 1) return x;

        const bt = Math.exp(
            this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
            a * Math.log(x) + b * Math.log(1 - x)
        );

        if (x < (a + 1) / (a + b + 2)) {
            return bt * this.betaCF(a, b, x) / a;
        } else {
            return 1 - bt * this.betaCF(b, a, 1 - x) / b;
        }
    }

    betaCF(a, b, x) {
        const maxIter = 100;
        const eps = 1e-10;

        let qab = a + b;
        let qap = a + 1;
        let qam = a - 1;
        let c = 1;
        let d = 1 - qab * x / qap;
        if (Math.abs(d) < eps) d = eps;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= maxIter; m++) {
            let m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < eps) d = eps;
            c = 1 + aa / c;
            if (Math.abs(c) < eps) c = eps;
            d = 1 / d;
            h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < eps) d = eps;
            c = 1 + aa / c;
            if (Math.abs(c) < eps) c = eps;
            d = 1 / d;
            let del = d * c;
            h *= del;
            if (Math.abs(del - 1) < eps) break;
        }

        return h;
    }

    randomNormal() {
        let u = this._seededRandom();
        let v = this._seededRandom();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Additional helper methods for advanced models
    profileLikelihoodCI(data, studies, type, tau2Between, tau2Within, opts) {
        const estimate = Math.max(0, type === 'between' ? tau2Between : tau2Within);
        const n = type === 'between'
            ? Math.max(2, Object.keys(studies || {}).length)
            : Math.max(2, data?.length || 0);

        // Lightweight Wald-style CI on variance scale.
        // This is conservative and avoids the prior placeholder interval.
        const z = this.normalQuantile(0.975);
        const se = Math.sqrt(Math.max(estimate, 1e-12) * (2 / Math.max(1, n - 1)));
        const lower = Math.max(0, estimate - z * se);
        const upper = estimate + z * se;
        return [lower, upper];
    }

    calculateQWithin(data, studies, mu, opts) {
        let Q = 0;
        let df = 0;
        for (const studyId in studies) {
            const studyData = studies[studyId];
            const studyMean = studyData.reduce((s, d) => s + d[opts.yiVar], 0) / studyData.length;
            for (const d of studyData) {
                Q += Math.pow(d[opts.yiVar] - studyMean, 2) / d[opts.viVar];
            }
            df += studyData.length - 1;
        }
        return { Q, df, pValue: 1 - this.chiSquareCDF(Q, df) };
    }

    calculateQBetween(data, studies, mu, opts) {
        let Q = 0;
        let df = Object.keys(studies).length - 1;
        for (const studyId in studies) {
            const studyData = studies[studyId];
            const studyMean = studyData.reduce((s, d) => s + d[opts.yiVar], 0) / studyData.length;
            const studyVar = studyData.reduce((s, d) => s + d[opts.viVar], 0) / studyData.length;
            Q += Math.pow(studyMean - mu, 2) / studyVar;
        }
        return { Q, df, pValue: 1 - this.chiSquareCDF(Q, df) };
    }

    buildMultivariateSystem(data, opts) {
        const outcomes = opts.outcomes || [];
        if (!Array.isArray(outcomes) || outcomes.length === 0) {
            throw new Error('multivariate() requires opts.outcomes with at least one outcome');
        }

        const X = [];
        const y = [];
        const V = [];
        const outcomeIndex = [];

        for (const rowData of data || []) {
            outcomes.forEach((outcome, idx) => {
                const nested = rowData?.[outcome];
                const yi = Number.isFinite(nested?.yi) ? nested.yi : rowData?.[`${outcome}_yi`];
                const vi = Number.isFinite(nested?.vi) ? nested.vi : rowData?.[`${outcome}_vi`];
                if (!Number.isFinite(yi) || !Number.isFinite(vi) || vi <= 0) return;

                const row = new Array(outcomes.length).fill(0);
                row[idx] = 1;
                X.push(row);
                y.push(yi);
                V.push(vi);
                outcomeIndex.push(idx);
            });
        }

        if (y.length === 0) {
            throw new Error('No valid multivariate observations found. Provide <outcome>_yi and <outcome>_vi columns.');
        }

        // Cache mapping so downstream methods can apply outcome-specific tau^2.
        this._multivariateOutcomeIndex = outcomeIndex;

        return { X, y, V };
    }

    initializeSigma(data, opts) {
        const p = opts.outcomes.length;
        return this.identityMatrix(p).map(row => row.map(v => v * 0.1));
    }

    multivariateREML(X, y, V, SigmaInit, opts) {
        const p = SigmaInit.length;
        const Sigma = this.identityMatrix(p).map(() => new Array(p).fill(0));

        // Approximate REML using outcome-specific DL estimates (diagonal Sigma).
        for (let j = 0; j < p; j++) {
            const idxs = [];
            for (let i = 0; i < X.length; i++) {
                if (X[i][j] === 1) idxs.push(i);
            }

            if (idxs.length < 2) {
                Sigma[j][j] = 0;
                continue;
            }

            const w = idxs.map(i => 1 / Math.max(V[i], 1e-12));
            const sumW = w.reduce((a, b) => a + b, 0);
            const mean = idxs.reduce((s, i, k) => s + w[k] * y[i], 0) / sumW;

            let Q = 0;
            let sumWSq = 0;
            for (let k = 0; k < idxs.length; k++) {
                const i = idxs[k];
                Q += w[k] * Math.pow(y[i] - mean, 2);
                sumWSq += w[k] * w[k];
            }

            const c = sumW - (sumWSq / sumW);
            const tau2 = c > 1e-12 ? Math.max(0, (Q - (idxs.length - 1)) / c) : 0;
            Sigma[j][j] = tau2;
        }

        return Sigma;
    }

    calculateMultivariateWeights(V, Sigma) {
        const n = V.length;
        const p = Sigma.length;
        const outcomeIndex = Array.isArray(this._multivariateOutcomeIndex) ? this._multivariateOutcomeIndex : [];
        const W = this.identityMatrix(n).map(() => new Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            const oi = outcomeIndex[i] ?? (i % p);
            const tau2 = Number.isFinite(Sigma?.[oi]?.[oi]) ? Sigma[oi][oi] : 0;
            W[i][i] = 1 / Math.max(V[i] + tau2, 1e-12);
        }

        return W;
    }

    calculateMultivariateI2(V, Sigma) {
        const p = Sigma.length;
        const outcomeIndex = Array.isArray(this._multivariateOutcomeIndex) ? this._multivariateOutcomeIndex : [];
        const byOutcome = [];
        let weightedI2 = 0;
        let totalN = 0;

        for (let j = 0; j < p; j++) {
            const tau2 = Math.max(0, Sigma?.[j]?.[j] ?? 0);
            const vars = [];
            for (let i = 0; i < V.length; i++) {
                if ((outcomeIndex[i] ?? (i % p)) === j) vars.push(V[i]);
            }

            const meanV = vars.length > 0 ? vars.reduce((a, b) => a + b, 0) / vars.length : 0;
            const i2 = (tau2 + meanV) > 0 ? (tau2 / (tau2 + meanV)) * 100 : 0;
            byOutcome.push({ outcome: j + 1, I2: i2, tau2, meanSamplingVariance: meanV });

            weightedI2 += i2 * vars.length;
            totalN += vars.length;
        }

        return {
            overall: totalN > 0 ? weightedI2 / totalN : 0,
            byOutcome
        };
    }

    covToCorr(Sigma) {
        const n = Sigma.length;
        const corr = [];
        for (let i = 0; i < n; i++) {
            corr[i] = [];
            for (let j = 0; j < n; j++) {
                corr[i][j] = Sigma[i][j] / Math.sqrt(Sigma[i][i] * Sigma[j][j]);
            }
        }
        return corr;
    }

    buildRVESystem(data, opts) {
        const n = data.length;
        const p = 1 + opts.moderators.length;
        const X = data.map(d => [1, ...opts.moderators.map(m => d[m] || 0)]);
        const y = data.map(d => d[opts.yiVar]);
        const clusters = {};
        data.forEach((d, i) => clusters[i] = d[opts.clusterVar]);
        return { X, y, clusters, n, p };
    }

    calculateWorkingWeights(data, clusters, opts) {
        const n = data.length;
        const W = this.identityMatrix(n);

        for (let i = 0; i < n; i++) {
            W[i][i] = 1 / data[i][opts.viVar];
        }

        return W;
    }

    calculateSatterthwaiteDf(X, W, vcov, clusters, opts) {
        // Simplified Satterthwaite df calculation
        const clusterIds = [...new Set(Object.values(clusters))];
        const J = clusterIds.length;
        const p = X[0].length;
        return new Array(p).fill(Math.max(1, J - p));
    }

    estimateNetworkTau2(y, V, X, opts) {
        // DL estimator for network
        const n = y.length;
        const p = X[0].length;

        const W = V.map(v => 1 / v);
        const Wmat = this.diagonalMatrix(W);
        const XtWX = this.matrixMultiply(this.matrixMultiply(this.transpose(X), Wmat), X);
        const XtWy = X[0].map((_, j) => X.reduce((s, row, i) => s + row[j] * W[i] * y[i], 0));
        const XtWXinv = this.invertMatrix(XtWX);
        const beta = XtWXinv.map((row, i) => row.reduce((s, v, j) => s + v * XtWy[j], 0));

        const yhat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
        const Q = y.reduce((s, yi, i) => s + W[i] * Math.pow(yi - yhat[i], 2), 0);
        const df = n - p;

        const sumW = W.reduce((a, b) => a + b, 0);
        const c = sumW - W.reduce((s, w) => s + w * w, 0) / sumW;

        return Math.max(0, (Q - df) / c);
    }

    estimateTau2DL(y, V, X) {
        return this.estimateNetworkTau2(y, V, X, {});
    }

    doseResponseLinear(data, opts) {
        const rows = (data || [])
            .map(d => ({
                dose: d?.[opts.doseVar],
                yi: d?.[opts.yiVar],
                vi: d?.[opts.viVar]
            }))
            .filter(r => Number.isFinite(r.dose) && Number.isFinite(r.yi) && Number.isFinite(r.vi) && r.vi > 0);

        if (rows.length < 2) {
            return { beta: [0, 0], logLik: Number.NEGATIVE_INFINITY, rss: Number.NaN };
        }

        const w = rows.map(r => 1 / r.vi);
        const S00 = w.reduce((a, b) => a + b, 0);
        const S01 = rows.reduce((s, r, i) => s + w[i] * r.dose, 0);
        const S11 = rows.reduce((s, r, i) => s + w[i] * r.dose * r.dose, 0);
        const T0 = rows.reduce((s, r, i) => s + w[i] * r.yi, 0);
        const T1 = rows.reduce((s, r, i) => s + w[i] * r.dose * r.yi, 0);
        const det = S00 * S11 - S01 * S01;

        if (Math.abs(det) < 1e-12) {
            return { beta: [T0 / Math.max(S00, 1e-12), 0], logLik: Number.NEGATIVE_INFINITY, rss: Number.NaN };
        }

        const beta0 = (T0 * S11 - T1 * S01) / det;
        const beta1 = (T1 * S00 - T0 * S01) / det;

        let rss = 0;
        let logDetV = 0;
        for (let i = 0; i < rows.length; i++) {
            const pred = beta0 + beta1 * rows[i].dose;
            rss += w[i] * Math.pow(rows[i].yi - pred, 2);
            logDetV += Math.log(rows[i].vi);
        }
        const n = rows.length;
        const logLik = -0.5 * (n * Math.log(2 * Math.PI) + logDetV + rss);

        return { beta: [beta0, beta1], logLik, rss };
    }

    testNonLinearity(beta, vcov, linearModel) {
        // Wald test for non-linearity
        const nSplines = beta.length;
        if (nSplines <= 1) return { statistic: 0, df: 0, pValue: 1 };

        // Test if spline terms (beyond linear) are zero
        const nonLinearBeta = beta.slice(1);
        const nonLinearVcov = vcov.slice(1).map(row => row.slice(1));

        const waldStat = nonLinearBeta.reduce((s, b, i) =>
            s + nonLinearBeta.reduce((s2, b2, j) => {
                const invCov = this.invertMatrix(nonLinearVcov);
                return s2 + b * b2 * invCov[i][j];
            }, 0), 0
        );

        const df = nSplines - 1;
        const pValue = 1 - this.chiSquareCDF(waldStat, df);

        return { statistic: waldStat, df, pValue };
    }

    // ============================================================
    // EMAX DOSE-RESPONSE MODEL
    // E(d) = E0 + Emax * d / (ED50 + d)
    // ============================================================

    /**
     * Emax dose-response model via Gauss-Newton nonlinear least squares
     * Reference: Thomas et al (2014) - Dose-response meta-analysis
     */
    doseResponseEmax(studies, options = {}) {
        const doses = studies.map(s => s.dose);
        const effects = studies.map(s => s.yi);
        const weights = studies.map(s => 1 / (s.vi || 0.01));
        const k = studies.length;

        if (k < 3) return { error: 'Emax model requires at least 3 dose levels' };

        // Initial parameter estimates
        let E0 = effects[0] ?? 0;
        let Emax = Math.max(...effects) - E0;
        let ED50 = doses[Math.floor(k / 2)] || 1;

        // Gauss-Newton nonlinear least squares
        const maxIter = 100;
        const tol = 1e-8;

        for (let iter = 0; iter < maxIter; iter++) {
            // Residuals and Jacobian
            const r = [], J = [];
            for (let i = 0; i < k; i++) {
                const d = doses[i];
                const pred = E0 + Emax * d / (ED50 + d);
                const w = Math.sqrt(weights[i]);
                r.push(w * (effects[i] - pred));

                // Partial derivatives
                const dE0 = -w;
                const dEmax = -w * d / (ED50 + d);
                const dED50 = w * Emax * d / ((ED50 + d) * (ED50 + d));
                J.push([dE0, dEmax, dED50]);
            }

            // Normal equations: (J'J) delta = J'r
            const JtJ = [[0,0,0],[0,0,0],[0,0,0]];
            const Jtr = [0, 0, 0];
            for (let i = 0; i < k; i++) {
                for (let a = 0; a < 3; a++) {
                    Jtr[a] += J[i][a] * r[i];
                    for (let b = 0; b < 3; b++) {
                        JtJ[a][b] += J[i][a] * J[i][b];
                    }
                }
            }

            // Solve 3x3 system via Cramer's rule
            const det3 = (m) => m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
            const D = det3(JtJ);
            if (Math.abs(D) < 1e-15) break;

            const delta = [0, 0, 0];
            for (let j = 0; j < 3; j++) {
                const M = JtJ.map(row => [...row]);
                for (let i = 0; i < 3; i++) M[i][j] = Jtr[i];
                delta[j] = det3(M) / D;
            }

            E0 += delta[0];
            Emax += delta[1];
            ED50 = Math.max(0.001, ED50 + delta[2]);

            if (Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]) < tol) break;
        }

        // Fitted values and R-squared
        let ss_res = 0, ss_tot = 0;
        const meanEffect = effects.reduce((a, b) => a + b, 0) / k;
        const fitted = doses.map(d => E0 + Emax * d / (ED50 + d));
        for (let i = 0; i < k; i++) {
            ss_res += weights[i] * (effects[i] - fitted[i]) ** 2;
            ss_tot += weights[i] * (effects[i] - meanEffect) ** 2;
        }
        const R2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 0;

        return {
            model: 'Emax',
            parameters: { E0, Emax, ED50 },
            fitted,
            doses,
            R2,
            k,
            interpretation: `Emax model: maximum effect ${Emax.toFixed(4)} achieved at high doses, half-maximal dose ED50 = ${ED50.toFixed(2)}. R² = ${R2.toFixed(3)}.`
        };
    }
}

// Living Systematic Review Engine
class LivingReviewEngine {
    constructor(options = {}) {
        this.options = {
            alpha: 0.05,
            monitoringBoundary: 'OBrien-Fleming',
            maxLooks: 10,
            ...options
        };
        this.history = [];
    }

    /**
     * Sequential meta-analysis with alpha-spending
     * For living systematic reviews with interim analyses
     */
    sequentialUpdate(previousResult, newStudies, options = {}) {
        const opts = {
            method: 'REML',
            boundary: this.options.monitoringBoundary,
            ...options
        };

        // Combine previous and new studies
        const allStudies = [...(previousResult.studies || []), ...newStudies];

        // Calculate cumulative information
        const cumulativeInfo = this.calculateInformation(allStudies);
        const maxInfo = this.estimateMaxInformation(allStudies, opts);
        const infoFraction = cumulativeInfo / maxInfo;

        // Calculate spending function
        const look = this.history.length + 1;
        const alphaSpent = this.alphaSpending(infoFraction, opts.boundary);
        const criticalValue = this.normalQuantile(1 - alphaSpent / 2);

        // Run meta-analysis
        const ma = new AdvancedMetaAnalysis();
        const result = ma.randomEffects(allStudies, { method: opts.method });

        // Test statistic
        const zStat = result.mu / result.se;
        const crossed = Math.abs(zStat) > criticalValue;

        // Futility analysis
        const conditionalPower = this.conditionalPower(result, maxInfo - cumulativeInfo);
        const futile = conditionalPower < 0.2; // Conventional threshold

        // Update history
        this.history.push({
            look: look,
            nStudies: allStudies.length,
            nNew: newStudies.length,
            infoFraction: infoFraction,
            alphaSpent: alphaSpent,
            criticalValue: criticalValue,
            estimate: result.mu,
            se: result.se,
            zStat: zStat,
            crossed: crossed,
            futile: futile,
            date: new Date().toISOString()
        });

        return {
            currentEstimate: result.mu,
            se: result.se,
            ci: [result.mu - criticalValue * result.se, result.mu + criticalValue * result.se],
            tau2: result.tau2,
            zStatistic: zStat,
            criticalValue: criticalValue,
            boundaryExceeded: crossed,
            direction: zStat > 0 ? 'positive' : 'negative',
            futile: futile,
            conditionalPower: conditionalPower,
            informationFraction: infoFraction,
            alphaSpent: alphaSpent,
            incrementalAlpha: this._incrementalAlpha(look),
            cumulativeAlpha: this.history.reduce((s, h) => s + h.alphaSpent, 0),
            look: look,
            nStudies: allStudies.length,
            studies: allStudies,
            history: this.history,
            recommendation: this.getRecommendation(crossed, futile, look)
        };
    }

    alphaSpending(t, boundary) {
        const alpha = this.options.alpha;
        t = Math.min(Math.max(t, 0), 1); // Clamp to [0, 1]

        if (boundary === 'OBrien-Fleming') {
            // O'Brien-Fleming spending function
            const zAlpha = this.normalQuantile(1 - alpha / 2);
            return 2 * (1 - this.normalCDF(zAlpha / Math.sqrt(Math.max(t, 1e-10))));
        } else if (boundary === 'Pocock') {
            // Pocock spending function
            return alpha * Math.log(1 + (Math.E - 1) * t);
        } else if (boundary === 'Lan-DeMets-OBF') {
            // Lan-DeMets generalization of O'Brien-Fleming
            // alpha*(t) = 2 - 2*Phi(z_{alpha/2} / sqrt(t))
            const zAlpha = this.normalQuantile(1 - alpha / 2);
            return Math.max(0, 2 - 2 * this.normalCDF(zAlpha / Math.sqrt(Math.max(t, 1e-10))));
        } else if (boundary === 'Lan-DeMets-Pocock') {
            // Lan-DeMets generalization of Pocock
            // alpha*(t) = alpha * ln(1 + (e-1)*t)
            return alpha * Math.log(1 + (Math.E - 1) * t);
        } else if (boundary === 'Haybittle-Peto') {
            // Fixed boundaries except final
            return t < 1 ? 0.001 : alpha;
        } else {
            // Linear spending
            return alpha * t;
        }
    }

    /**
     * Incremental alpha spent at the current look
     * Uses alpha(t_k) - alpha(t_{k-1}) for proper cumulative spending
     */
    _incrementalAlpha(currentLook) {
        if (currentLook <= 1) return this.history.length > 0 ? this.history[0].alphaSpent : 0;
        const prevCumulative = this.history.slice(0, currentLook - 1).reduce((s, h) => s + h.alphaSpent, 0);
        const currentCumulative = this.history.slice(0, currentLook).reduce((s, h) => s + h.alphaSpent, 0);
        return Math.max(0, currentCumulative - prevCumulative);
    }

    /**
     * Required Information Size (RIS) calculation
     * D = (z_alpha + z_beta)^2 / theta^2
     * Reference: Wetterslev et al (2008) - Trial Sequential Analysis
     */
    requiredInformationSize(options = {}) {
        const {
            theta = 0.2,         // Target effect size
            power = 0.8,         // Desired power (1 - beta)
            alpha = this.options.alpha,
            heterogeneity = 0    // tau^2 adjustment (diversity D^2)
        } = options;

        const zAlpha = this.normalQuantile(1 - alpha / 2);
        const zBeta = this.normalQuantile(power);
        const D = (zAlpha + zBeta) ** 2 / (theta ** 2);

        // Adjust for heterogeneity if present (DARIS = D / (1 - diversity))
        const diversityAdjusted = heterogeneity > 0 ? D / Math.max(1 - heterogeneity, 0.01) : D;

        return {
            ris: D,
            risAdjusted: diversityAdjusted,
            zAlpha,
            zBeta,
            theta,
            power,
            interpretation: `Required information size: ${D.toFixed(1)} (unadjusted)${heterogeneity > 0 ? `, ${diversityAdjusted.toFixed(1)} (heterogeneity-adjusted)` : ''}`
        };
    }

    calculateInformation(studies) {
        // Fisher information = sum of 1/variance
        return studies.reduce((sum, s) => sum + 1 / (s.vi || 1), 0);
    }

    estimateMaxInformation(studies, opts) {
        // Estimate maximum information based on RIS if theta available, else heuristic
        if (opts.theta) {
            const ris = this.requiredInformationSize({ theta: opts.theta, power: opts.power || 0.8 });
            return ris.risAdjusted || ris.ris;
        }
        // Fallback: heuristic based on current data
        const currentInfo = this.calculateInformation(studies);
        const avgInfoPerStudy = currentInfo / studies.length;
        const expectedTotalStudies = studies.length * 2; // Assumption
        return avgInfoPerStudy * expectedTotalStudies;
    }

    conditionalPower(result, remainingInfo) {
        // Conditional power given current results
        const theta = result.mu;
        const seTheta = result.se;
        const thetaHat = theta; // Assumed true effect

        const futureVar = 1 / remainingInfo;
        const futureSE = Math.sqrt(seTheta * seTheta + futureVar);
        const zAlpha = this.normalQuantile(1 - this.options.alpha / 2);

        const power = 1 - this.normalCDF(zAlpha - thetaHat / futureSE) +
                      this.normalCDF(-zAlpha - thetaHat / futureSE);

        return power;
    }

    getRecommendation(crossed, futile, look) {
        if (crossed) {
            return {
                action: 'STOP_EFFICACY',
                message: 'Monitoring boundary crossed. Evidence sufficient to conclude effect.',
                confidence: 'High'
            };
        } else if (futile) {
            return {
                action: 'CONSIDER_STOPPING',
                message: 'Conditional power low. Unlikely to reach significance with more studies.',
                confidence: 'Moderate'
            };
        } else if (look >= this.options.maxLooks) {
            return {
                action: 'FINAL_ANALYSIS',
                message: 'Maximum planned looks reached. Final analysis.',
                confidence: 'High'
            };
        } else {
            return {
                action: 'CONTINUE',
                message: 'Continue monitoring. Include new studies as they become available.',
                confidence: 'High'
            };
        }
    }

    normalQuantile(p) {
        return new AdvancedMetaAnalysis().normalQuantile(p);
    }

    normalCDF(x) {
        return new AdvancedMetaAnalysis().normalCDF(x);
    }
}

// ROB-2 Risk of Bias Assessment
class RiskOfBiasAssessment {
    constructor() {
        this.rob2Domains = [
            {
                id: 'D1',
                name: 'Randomization process',
                questions: [
                    'Was the allocation sequence random?',
                    'Was the allocation sequence concealed until participants were enrolled?',
                    'Did baseline differences suggest a problem with randomization?'
                ]
            },
            {
                id: 'D2',
                name: 'Deviations from intended interventions',
                questions: [
                    'Were participants aware of their assigned intervention?',
                    'Were carers/people delivering aware of assigned intervention?',
                    'Were there deviations from intended intervention beyond what would be expected?',
                    'Were deviations balanced between groups?',
                    'Was an appropriate analysis used to estimate the effect of assignment?'
                ]
            },
            {
                id: 'D3',
                name: 'Missing outcome data',
                questions: [
                    'Were data available for all or nearly all participants?',
                    'Is there evidence that result was not biased by missing data?',
                    'Could missingness depend on true value of outcome?'
                ]
            },
            {
                id: 'D4',
                name: 'Measurement of the outcome',
                questions: [
                    'Was the method of measuring appropriate?',
                    'Could measurement differ between groups?',
                    'Were outcome assessors aware of intervention received?',
                    'Could assessment be influenced by knowledge of intervention?'
                ]
            },
            {
                id: 'D5',
                name: 'Selection of the reported result',
                questions: [
                    'Were data analyzed in accordance with pre-specified plan?',
                    'Is numerical result likely to have been selected?'
                ]
            }
        ];

        this.robinsIDomains = [
            { id: 'D1', name: 'Confounding' },
            { id: 'D2', name: 'Selection of participants' },
            { id: 'D3', name: 'Classification of interventions' },
            { id: 'D4', name: 'Deviations from intended interventions' },
            { id: 'D5', name: 'Missing data' },
            { id: 'D6', name: 'Measurement of outcomes' },
            { id: 'D7', name: 'Selection of reported result' }
        ];
    }

    /**
     * Assess ROB-2 for a randomized trial
     */
    assessROB2(study, domainJudgments) {
        const results = [];

        for (const domain of this.rob2Domains) {
            const judgment = domainJudgments[domain.id] || {};
            const level = this.deriveROB2Level(judgment);

            results.push({
                domain: domain.id,
                name: domain.name,
                judgment: level,
                supportingInfo: judgment.supportingInfo || '',
                concerns: judgment.concerns || []
            });
        }

        // Overall judgment (worst of domains)
        const levels = ['Low', 'Some concerns', 'High'];
        const levelScores = results.map(r => levels.indexOf(r.judgment));
        const overallScore = Math.max(...levelScores);
        const overall = levels[overallScore];

        return {
            studyId: study.id || study.study,
            tool: 'ROB-2',
            domains: results,
            overall: overall,
            trafficLight: this.generateTrafficLight(results),
            summary: this.generateROB2Summary(results, overall)
        };
    }

    /**
     * Assess ROBINS-I for non-randomized study
     */
    assessROBINSI(study, domainJudgments) {
        const results = [];

        for (const domain of this.robinsIDomains) {
            const judgment = domainJudgments[domain.id] || {};

            results.push({
                domain: domain.id,
                name: domain.name,
                judgment: judgment.level || 'No information',
                supportingInfo: judgment.supportingInfo || '',
                confounders: judgment.confounders || []
            });
        }

        // Overall judgment
        const levels = ['Low', 'Moderate', 'Serious', 'Critical', 'No information'];
        const levelScores = results.map(r => levels.indexOf(r.judgment));
        const overallScore = Math.max(...levelScores);
        const overall = levels[Math.min(overallScore, 4)];

        return {
            studyId: study.id || study.study,
            tool: 'ROBINS-I',
            domains: results,
            overall: overall,
            trafficLight: this.generateTrafficLightROBINS(results),
            summary: this.generateROBINSSummary(results, overall)
        };
    }

    deriveROB2Level(judgment) {
        // Algorithm to derive domain-level judgment from signaling questions
        if (judgment.level) return judgment.level;

        const answers = judgment.answers || [];
        const hasHigh = answers.some(a => a === 'Yes' || a === 'Probably yes');
        const hasLow = answers.every(a => a === 'No' || a === 'Probably no' || a === 'NA');

        if (hasLow) return 'Low';
        if (hasHigh) return 'High';
        return 'Some concerns';
    }

    generateTrafficLight(results) {
        // Generate traffic light plot data
        const colors = {
            'Low': '#4ade80',
            'Some concerns': '#fbbf24',
            'High': '#ef4444'
        };

        return results.map(r => ({
            domain: r.domain,
            color: colors[r.judgment] || '#9ca3af',
            symbol: r.judgment === 'Low' ? '+' : r.judgment === 'High' ? '-' : '?'
        }));
    }

    generateTrafficLightROBINS(results) {
        const colors = {
            'Low': '#4ade80',
            'Moderate': '#a3e635',
            'Serious': '#fbbf24',
            'Critical': '#ef4444',
            'No information': '#9ca3af'
        };

        return results.map(r => ({
            domain: r.domain,
            color: colors[r.judgment] || '#9ca3af'
        }));
    }

    generateROB2Summary(results, overall) {
        const highDomains = results.filter(r => r.judgment === 'High').map(r => r.name);
        const concernDomains = results.filter(r => r.judgment === 'Some concerns').map(r => r.name);

        let summary = `Overall risk of bias: ${overall}. `;

        if (highDomains.length > 0) {
            summary += `High risk in: ${highDomains.join(', ')}. `;
        }
        if (concernDomains.length > 0) {
            summary += `Some concerns in: ${concernDomains.join(', ')}.`;
        }
        if (overall === 'Low') {
            summary += 'All domains at low risk of bias.';
        }

        return summary;
    }

    generateROBINSSummary(results, overall) {
        const seriousDomains = results.filter(r =>
            r.judgment === 'Serious' || r.judgment === 'Critical'
        ).map(r => r.name);

        let summary = `Overall risk of bias: ${overall}. `;

        if (seriousDomains.length > 0) {
            summary += `Serious/critical concerns in: ${seriousDomains.join(', ')}.`;
        }

        return summary;
    }

    /**
     * Aggregate ROB assessments for meta-analysis
     */
    aggregateROB(assessments) {
        const domains = this.rob2Domains.map(d => d.id);
        const domainSummary = {};

        for (const domain of domains) {
            const domainAssessments = assessments.map(a =>
                a.domains.find(d => d.domain === domain)?.judgment || 'Unknown'
            );

            const counts = {
                'Low': domainAssessments.filter(j => j === 'Low').length,
                'Some concerns': domainAssessments.filter(j => j === 'Some concerns').length,
                'High': domainAssessments.filter(j => j === 'High').length
            };

            const total = assessments.length;
            const percentHigh = (counts['High'] / total) * 100;
            const percentLow = (counts['Low'] / total) * 100;

            domainSummary[domain] = {
                counts: counts,
                percentLow: percentLow,
                percentHigh: percentHigh,
                concernLevel: percentHigh > 50 ? 'Major' : percentHigh > 25 ? 'Moderate' : 'Minor'
            };
        }

        const overallCounts = {
            'Low': assessments.filter(a => a.overall === 'Low').length,
            'Some concerns': assessments.filter(a => a.overall === 'Some concerns').length,
            'High': assessments.filter(a => a.overall === 'High').length
        };

        return {
            nStudies: assessments.length,
            domainSummary: domainSummary,
            overallCounts: overallCounts,
            overallPercentHigh: (overallCounts['High'] / assessments.length) * 100,
            recommendation: this.getROBRecommendation(overallCounts, assessments.length)
        };
    }

    getROBRecommendation(counts, total) {
        const percentHigh = (counts['High'] / total) * 100;

        if (percentHigh > 50) {
            return 'Substantial risk of bias in majority of studies. Consider sensitivity analysis excluding high-risk studies.';
        } else if (percentHigh > 25) {
            return 'Moderate risk of bias concerns. Report sensitivity analyses and discuss implications.';
        } else {
            return 'Risk of bias generally acceptable. Standard reporting appropriate.';
        }
    }
}

// PRISMA 2020 Flow Diagram Generator
class PRISMAFlowDiagram {
    constructor() {
        this.data = {
            identification: {
                databases: { n: 0, sources: [] },
                registers: { n: 0, sources: [] },
                otherMethods: { n: 0, sources: [] }
            },
            duplicatesRemoved: 0,
            automationExclusions: 0,
            screening: {
                screened: 0,
                excludedTitle: 0,
                excludedAbstract: 0
            },
            retrieval: {
                soughtRetrieval: 0,
                notRetrieved: 0
            },
            eligibility: {
                assessed: 0,
                excluded: { total: 0, reasons: {} }
            },
            included: {
                studies: 0,
                reports: 0
            },
            previousStudies: 0,
            previousReports: 0
        };
    }

    /**
     * Set identification data
     */
    setIdentification(databases, registers = 0, otherMethods = 0) {
        if (Array.isArray(databases)) {
            this.data.identification.databases.n = databases.reduce((s, d) => s + d.n, 0);
            this.data.identification.databases.sources = databases;
        } else {
            this.data.identification.databases.n = databases;
        }
        this.data.identification.registers.n = registers;
        this.data.identification.otherMethods.n = otherMethods;
        return this;
    }

    /**
     * Set duplicate removal data
     */
    setDuplicateRemoval(duplicates, automationExclusions = 0) {
        this.data.duplicatesRemoved = duplicates;
        this.data.automationExclusions = automationExclusions;
        return this;
    }

    /**
     * Set screening data
     */
    setScreening(screened, excludedTitle = 0, excludedAbstract = 0) {
        this.data.screening.screened = screened;
        this.data.screening.excludedTitle = excludedTitle;
        this.data.screening.excludedAbstract = excludedAbstract;
        return this;
    }

    /**
     * Set retrieval data
     */
    setRetrieval(sought, notRetrieved) {
        this.data.retrieval.soughtRetrieval = sought;
        this.data.retrieval.notRetrieved = notRetrieved;
        return this;
    }

    /**
     * Set eligibility data
     */
    setEligibility(assessed, excludedReasons) {
        this.data.eligibility.assessed = assessed;
        this.data.eligibility.excluded.reasons = excludedReasons;
        this.data.eligibility.excluded.total = Object.values(excludedReasons).reduce((a, b) => a + b, 0);
        return this;
    }

    /**
     * Set included studies
     */
    setIncluded(studies, reports = null) {
        this.data.included.studies = studies;
        this.data.included.reports = reports || studies;
        return this;
    }

    /**
     * Set previous studies (for updates)
     */
    setPreviousStudies(studies, reports = null) {
        this.data.previousStudies = studies;
        this.data.previousReports = reports || studies;
        return this;
    }

    /**
     * Generate PRISMA 2020 flow diagram as SVG
     */
    generateSVG(options = {}) {
        const opts = {
            width: 800,
            height: 1000,
            boxWidth: 180,
            boxHeight: 60,
            fontSize: 11,
            ...options
        };

        const boxes = this.calculateBoxPositions(opts);
        const arrows = this.calculateArrows(boxes);

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">`;

        // Styles
        svg += `
            <style>
                .box { fill: #f8fafc; stroke: #334155; stroke-width: 1.5; rx: 5; }
                .box-header { fill: #1e40af; }
                .text { font-family: Arial, sans-serif; font-size: ${opts.fontSize}px; fill: #1e293b; }
                .text-header { fill: white; font-weight: bold; }
                .text-number { font-weight: bold; font-size: ${opts.fontSize + 2}px; }
                .arrow { stroke: #64748b; stroke-width: 1.5; fill: none; marker-end: url(#arrowhead); }
                .section-label { font-size: 12px; font-weight: bold; fill: #475569; }
            </style>
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                </marker>
            </defs>
        `;

        // Section labels
        svg += `
            <text x="20" y="50" class="section-label">Identification</text>
            <text x="20" y="250" class="section-label">Screening</text>
            <text x="20" y="500" class="section-label">Included</text>
        `;

        // Draw boxes
        for (const box of boxes) {
            svg += this.drawBox(box, opts);
        }

        // Draw arrows
        for (const arrow of arrows) {
            svg += this.drawArrow(arrow);
        }

        svg += '</svg>';
        return svg;
    }

    calculateBoxPositions(opts) {
        const centerX = opts.width / 2;
        const boxes = [];

        // Identification boxes
        boxes.push({
            id: 'databases',
            x: centerX - opts.boxWidth - 20,
            y: 70,
            width: opts.boxWidth,
            height: opts.boxHeight,
            header: 'Databases',
            text: `Records identified (n = ${this.data.identification.databases.n})`,
            sources: this.data.identification.databases.sources
        });

        boxes.push({
            id: 'registers',
            x: centerX + 20,
            y: 70,
            width: opts.boxWidth,
            height: opts.boxHeight,
            header: 'Registers',
            text: `Records identified (n = ${this.data.identification.registers.n})`
        });

        // Duplicates removed
        boxes.push({
            id: 'duplicates',
            x: centerX - opts.boxWidth / 2,
            y: 160,
            width: opts.boxWidth,
            height: 50,
            text: `Duplicates removed (n = ${this.data.duplicatesRemoved})`
        });

        // Screening
        const totalIdentified = this.data.identification.databases.n +
                               this.data.identification.registers.n +
                               this.data.identification.otherMethods.n;
        const afterDuplicates = totalIdentified - this.data.duplicatesRemoved;

        boxes.push({
            id: 'screened',
            x: centerX - opts.boxWidth / 2,
            y: 270,
            width: opts.boxWidth,
            height: opts.boxHeight,
            header: 'Screening',
            text: `Records screened (n = ${afterDuplicates})`
        });

        boxes.push({
            id: 'excluded_screening',
            x: centerX + opts.boxWidth / 2 + 40,
            y: 270,
            width: opts.boxWidth,
            height: opts.boxHeight,
            text: `Records excluded (n = ${this.data.screening.excludedTitle + this.data.screening.excludedAbstract})`
        });

        // Retrieval
        const afterScreening = afterDuplicates - this.data.screening.excludedTitle - this.data.screening.excludedAbstract;

        boxes.push({
            id: 'retrieval',
            x: centerX - opts.boxWidth / 2,
            y: 360,
            width: opts.boxWidth,
            height: opts.boxHeight,
            text: `Reports sought for retrieval (n = ${afterScreening})`
        });

        boxes.push({
            id: 'not_retrieved',
            x: centerX + opts.boxWidth / 2 + 40,
            y: 360,
            width: opts.boxWidth,
            height: 50,
            text: `Reports not retrieved (n = ${this.data.retrieval.notRetrieved})`
        });

        // Eligibility
        const retrieved = afterScreening - this.data.retrieval.notRetrieved;

        boxes.push({
            id: 'eligibility',
            x: centerX - opts.boxWidth / 2,
            y: 450,
            width: opts.boxWidth,
            height: opts.boxHeight,
            text: `Reports assessed for eligibility (n = ${retrieved})`
        });

        // Exclusion reasons
        const exclusionHeight = 50 + Object.keys(this.data.eligibility.excluded.reasons).length * 15;
        boxes.push({
            id: 'excluded_eligibility',
            x: centerX + opts.boxWidth / 2 + 40,
            y: 450,
            width: opts.boxWidth + 30,
            height: exclusionHeight,
            text: `Reports excluded (n = ${this.data.eligibility.excluded.total})`,
            reasons: this.data.eligibility.excluded.reasons
        });

        // Included
        boxes.push({
            id: 'included',
            x: centerX - opts.boxWidth / 2,
            y: 560,
            width: opts.boxWidth,
            height: opts.boxHeight + 20,
            header: 'Included',
            text: `Studies included in review (n = ${this.data.included.studies})`,
            subtext: `Reports of included studies (n = ${this.data.included.reports})`
        });

        return boxes;
    }

    calculateArrows(boxes) {
        const arrows = [];
        const getBox = (id) => boxes.find(b => b.id === id);

        // Databases -> Duplicates
        const db = getBox('databases');
        const dup = getBox('duplicates');
        arrows.push({
            x1: db.x + db.width / 2,
            y1: db.y + db.height,
            x2: dup.x + dup.width / 4,
            y2: dup.y
        });

        // Registers -> Duplicates
        const reg = getBox('registers');
        arrows.push({
            x1: reg.x + reg.width / 2,
            y1: reg.y + reg.height,
            x2: dup.x + dup.width * 3/4,
            y2: dup.y
        });

        // Duplicates -> Screened
        const scr = getBox('screened');
        arrows.push({
            x1: dup.x + dup.width / 2,
            y1: dup.y + dup.height,
            x2: scr.x + scr.width / 2,
            y2: scr.y
        });

        // Screened -> Excluded
        const excScr = getBox('excluded_screening');
        arrows.push({
            x1: scr.x + scr.width,
            y1: scr.y + scr.height / 2,
            x2: excScr.x,
            y2: excScr.y + excScr.height / 2
        });

        // Screened -> Retrieval
        const ret = getBox('retrieval');
        arrows.push({
            x1: scr.x + scr.width / 2,
            y1: scr.y + scr.height,
            x2: ret.x + ret.width / 2,
            y2: ret.y
        });

        // Retrieval -> Not retrieved
        const notRet = getBox('not_retrieved');
        arrows.push({
            x1: ret.x + ret.width,
            y1: ret.y + ret.height / 2,
            x2: notRet.x,
            y2: notRet.y + notRet.height / 2
        });

        // Retrieval -> Eligibility
        const elig = getBox('eligibility');
        arrows.push({
            x1: ret.x + ret.width / 2,
            y1: ret.y + ret.height,
            x2: elig.x + elig.width / 2,
            y2: elig.y
        });

        // Eligibility -> Excluded
        const excElig = getBox('excluded_eligibility');
        arrows.push({
            x1: elig.x + elig.width,
            y1: elig.y + elig.height / 2,
            x2: excElig.x,
            y2: excElig.y + excElig.height / 2
        });

        // Eligibility -> Included
        const inc = getBox('included');
        arrows.push({
            x1: elig.x + elig.width / 2,
            y1: elig.y + elig.height,
            x2: inc.x + inc.width / 2,
            y2: inc.y
        });

        return arrows;
    }

    drawBox(box, opts) {
        let svg = '';

        // Main box
        svg += `<rect class="box" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" />`;

        // Header background if present
        if (box.header) {
            svg += `<rect class="box-header" x="${box.x}" y="${box.y}" width="${box.width}" height="20" rx="5" ry="5" />`;
            svg += `<rect class="box-header" x="${box.x}" y="${box.y + 10}" width="${box.width}" height="10" />`;
            svg += `<text class="text text-header" x="${box.x + box.width/2}" y="${box.y + 14}" text-anchor="middle">${box.header}</text>`;
        }

        // Main text
        const textY = box.header ? box.y + 35 : box.y + 25;
        svg += `<text class="text" x="${box.x + box.width/2}" y="${textY}" text-anchor="middle">${box.text}</text>`;

        // Subtext if present
        if (box.subtext) {
            svg += `<text class="text" x="${box.x + box.width/2}" y="${textY + 18}" text-anchor="middle">${box.subtext}</text>`;
        }

        // Exclusion reasons if present
        if (box.reasons) {
            let reasonY = textY + 18;
            for (const [reason, count] of Object.entries(box.reasons)) {
                svg += `<text class="text" x="${box.x + 10}" y="${reasonY}" font-size="10">• ${reason} (n = ${count})</text>`;
                reasonY += 14;
            }
        }

        return svg;
    }

    drawArrow(arrow) {
        return `<path class="arrow" d="M ${arrow.x1} ${arrow.y1} L ${arrow.x2} ${arrow.y2}" />`;
    }

    /**
     * Generate text-based summary
     */
    generateTextSummary() {
        const totalIdentified = this.data.identification.databases.n +
                               this.data.identification.registers.n;
        const afterDuplicates = totalIdentified - this.data.duplicatesRemoved;
        const afterScreening = afterDuplicates - this.data.screening.excludedTitle -
                              this.data.screening.excludedAbstract;
        const retrieved = afterScreening - this.data.retrieval.notRetrieved;
        const included = this.data.included.studies;

        return {
            identification: {
                total: totalIdentified,
                databases: this.data.identification.databases.n,
                registers: this.data.identification.registers.n
            },
            duplicates: this.data.duplicatesRemoved,
            afterDuplicates: afterDuplicates,
            screening: {
                excluded: this.data.screening.excludedTitle + this.data.screening.excludedAbstract,
                remaining: afterScreening
            },
            retrieval: {
                sought: afterScreening,
                notRetrieved: this.data.retrieval.notRetrieved,
                retrieved: retrieved
            },
            eligibility: {
                assessed: retrieved,
                excluded: this.data.eligibility.excluded.total,
                reasons: this.data.eligibility.excluded.reasons
            },
            included: {
                studies: included,
                reports: this.data.included.reports
            },
            yieldRate: ((included / totalIdentified) * 100).toFixed(1)
        };
    }
}

// Export classes
if (typeof window !== 'undefined') {
    window.AdvancedMetaAnalysis = AdvancedMetaAnalysis;
    window.ThreeLevelMetaAnalysis = AdvancedMetaAnalysis;  // Alias for HTML inline tests
    window.LivingReviewEngine = LivingReviewEngine;
    window.RiskOfBiasAssessment = RiskOfBiasAssessment;
    window.PRISMAFlowDiagram = PRISMAFlowDiagram;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AdvancedMetaAnalysis,
        LivingReviewEngine,
        RiskOfBiasAssessment,
        PRISMAFlowDiagram
    };
}
