/**
 * Expected Value of Partial Perfect Information (EVPPI) Calculator
 * Using Generalized Additive Model (GAM) Metamodeling
 *
 * Reference:
 * - Strong M, Oakley JE, Brennan A. "Estimating Multiparameter EVPPI"
 * - Jalal H, Alarid-Escudero F. "A General Gaussian Approximation Approach"
 * - TreeAge Pro EVPPI double-loop simulation equivalent
 *
 * Features:
 * - Single parameter EVPPI
 * - Multi-parameter EVPPI (grouped)
 * - GAM metamodeling for computational efficiency
 * - Spline regression for non-linear relationships
 * - Standard error estimation
 */

class EVPPICalculator {
    constructor(options = {}) {
        this.options = {
            numSplines: 10,        // Number of basis functions for GAM
            bootstrapIterations: 100,  // For SE estimation
            ...options
        };
        this._rngState = options.seed || 12345;
    }

    /**
     * LCG seeded PRNG for reproducible bootstrap sampling
     */
    _seededRandom() {
        this._rngState = (this._rngState * 1103515245 + 12345) & 0x7fffffff;
        return this._rngState / 0x7fffffff || 1e-10;
    }

    /**
     * Calculate EVPPI for a single parameter or group of parameters
     *
     * @param {Object} psaResults - Results from PSA run
     * @param {Array} parametersOfInterest - Parameter IDs to calculate EVPPI for
     * @param {number} wtp - Willingness-to-pay threshold
     * @param {Object} parameterSamples - Matrix of parameter samples from PSA
     * @returns {Object} EVPPI results
     */
    calculate(psaResults, parametersOfInterest, wtp, parameterSamples) {
        if (!psaResults?.scatter || !parameterSamples) {
            throw new Error('PSA results with parameter samples required');
        }

        const n = psaResults.scatter.incremental_qalys.length;

        // Calculate Net Monetary Benefit for each iteration
        const nmb = [];
        for (let i = 0; i < n; i++) {
            const incQaly = psaResults.scatter.incremental_qalys[i];
            const incCost = psaResults.scatter.incremental_costs[i];
            nmb.push(incQaly * wtp - incCost);
        }

        // Extract parameter values for parameters of interest
        const X = this.extractParameterMatrix(parameterSamples, parametersOfInterest, n);

        // Fit GAM model: E[NMB | parameters of interest]
        const fittedValues = this.fitGAM(X, nmb);

        // Calculate EVPPI
        // EVPPI = E[max(0, E[NMB|theta])] - max(0, E[NMB])

        // Overall expected NMB
        const meanNMB = nmb.reduce((a, b) => a + b, 0) / n;
        const baselineValue = Math.max(0, meanNMB);

        // Expected value given perfect information on parameters of interest
        // This is the expected maximum of fitted values
        let sumMaxFitted = 0;
        for (let i = 0; i < n; i++) {
            sumMaxFitted += Math.max(0, fittedValues[i]);
        }
        const expectedWithInfo = sumMaxFitted / n;

        const evppiPerPatient = expectedWithInfo - baselineValue;

        // Standard error estimation via bootstrap
        const seEstimate = this.bootstrapSE(X, nmb, wtp);

        return {
            parameters: parametersOfInterest,
            wtp: wtp,
            evppiPerPatient: Math.max(0, evppiPerPatient),
            standardError: seEstimate,
            ci_lower: Math.max(0, evppiPerPatient - StatUtils.normalInverseCDF(0.975) * seEstimate),
            ci_upper: evppiPerPatient + StatUtils.normalInverseCDF(0.975) * seEstimate,
            baselineNMB: meanNMB,
            optimalWithCurrentInfo: meanNMB > 0 ? 'Intervention' : 'Comparator',
            rSquared: this.calculateRSquared(nmb, fittedValues),
            iterations: n
        };
    }

    /**
     * Calculate EVPPI for all parameters individually
     */
    calculateAll(psaResults, wtp, parameterSamples) {
        const results = {
            wtp: wtp,
            parameters: [],
            totalEVPI: null
        };

        // First calculate total EVPI
        if (psaResults.scatter) {
            const evpiCalc = typeof EVPICalculator !== 'undefined' ?
                new EVPICalculator() : this;

            // Simple EVPI calculation
            const n = psaResults.scatter.incremental_qalys.length;
            const nmb = [];
            for (let i = 0; i < n; i++) {
                const incQaly = psaResults.scatter.incremental_qalys[i];
                const incCost = psaResults.scatter.incremental_costs[i];
                nmb.push(incQaly * wtp - incCost);
            }

            const meanNMB = nmb.reduce((a, b) => a + b, 0) / n;
            let sumMax = 0;
            for (let i = 0; i < n; i++) {
                sumMax += Math.max(0, nmb[i]);
            }
            const evpi = sumMax / n - Math.max(0, meanNMB);
            results.totalEVPI = Math.max(0, evpi);
        }

        // Calculate EVPPI for each parameter
        const paramIds = Object.keys(parameterSamples);

        for (const paramId of paramIds) {
            try {
                const evppi = this.calculate(
                    psaResults,
                    [paramId],
                    wtp,
                    parameterSamples
                );

                results.parameters.push({
                    parameter: paramId,
                    evppi: evppi.evppiPerPatient,
                    se: evppi.standardError,
                    percentOfEVPI: results.totalEVPI > 0 ?
                        (evppi.evppiPerPatient / results.totalEVPI * 100) : 0
                });
            } catch (e) {
                // Skip parameters that can't be calculated
                console.warn(`Could not calculate EVPPI for ${paramId}: ${e.message}`);
            }
        }

        // Sort by EVPPI value
        results.parameters.sort((a, b) => b.evppi - a.evppi);

        return results;
    }

    /**
     * Extract parameter matrix for specified parameters
     */
    extractParameterMatrix(parameterSamples, parameterIds, n) {
        const matrix = [];

        for (let i = 0; i < n; i++) {
            const row = [];
            for (const paramId of parameterIds) {
                if (parameterSamples[paramId] && parameterSamples[paramId][i] !== undefined) {
                    row.push(parameterSamples[paramId][i]);
                } else {
                    row.push(0);
                }
            }
            matrix.push(row);
        }

        return matrix;
    }

    /**
     * Fit Generalized Additive Model using natural cubic splines
     * Simplified GAM: Y = sum(f_j(X_j)) where f_j are smooth functions
     */
    fitGAM(X, Y) {
        const n = Y.length;
        const p = X[0]?.length || 1;

        if (p === 0 || n === 0) {
            return Y.slice();
        }

        // For single parameter, use cubic spline regression
        if (p === 1) {
            return this.fitSpline(X.map(row => row[0]), Y);
        }

        // For multiple parameters, use additive model with backfitting
        return this.fitAdditiveModel(X, Y);
    }

    /**
     * Fit cubic spline regression for single variable
     */
    fitSpline(x, y) {
        const n = x.length;
        const numKnots = Math.min(this.options.numSplines, Math.floor(n / 10));

        // Get knot positions (quantiles of x)
        const sortedX = [...x].sort((a, b) => a - b);
        const knots = [];
        for (let i = 1; i <= numKnots; i++) {
            const idx = Math.floor(i * n / (numKnots + 1));
            knots.push(sortedX[idx]);
        }

        // Create basis functions (truncated power basis)
        const B = this.createSplineBasis(x, knots);

        // Fit linear regression: y = B * beta
        const beta = this.fitLinearRegression(B, y);

        // Calculate fitted values
        const fitted = [];
        for (let i = 0; i < n; i++) {
            let yHat = beta[0];  // Intercept
            yHat += beta[1] * x[i];  // Linear term
            for (let k = 0; k < knots.length; k++) {
                const basis = Math.pow(Math.max(0, x[i] - knots[k]), 3);
                yHat += beta[k + 2] * basis;
            }
            fitted.push(yHat);
        }

        return fitted;
    }

    /**
     * Create spline basis matrix
     */
    createSplineBasis(x, knots) {
        const n = x.length;
        const k = knots.length;
        const B = [];

        for (let i = 0; i < n; i++) {
            const row = [1, x[i]];  // Intercept and linear term
            for (let j = 0; j < k; j++) {
                row.push(Math.pow(Math.max(0, x[i] - knots[j]), 3));
            }
            B.push(row);
        }

        return B;
    }

    /**
     * Fit additive model using backfitting algorithm
     */
    fitAdditiveModel(X, Y) {
        const n = Y.length;
        const p = X[0].length;
        const maxIter = 20;
        const tol = 1e-6;

        // Initialize with mean
        const meanY = Y.reduce((a, b) => a + b, 0) / n;
        let fitted = new Array(n).fill(meanY);

        // Store partial residuals and component functions
        const components = [];
        for (let j = 0; j < p; j++) {
            components.push(new Array(n).fill(0));
        }

        // Backfitting iterations
        for (let iter = 0; iter < maxIter; iter++) {
            let maxChange = 0;

            for (let j = 0; j < p; j++) {
                // Calculate partial residuals
                const residuals = [];
                for (let i = 0; i < n; i++) {
                    let partialFit = meanY;
                    for (let k = 0; k < p; k++) {
                        if (k !== j) partialFit += components[k][i];
                    }
                    residuals.push(Y[i] - partialFit);
                }

                // Fit smooth function to partial residuals
                const xj = X.map(row => row[j]);
                const newComponent = this.fitSpline(xj, residuals);

                // Center the component
                const compMean = newComponent.reduce((a, b) => a + b, 0) / n;
                for (let i = 0; i < n; i++) {
                    newComponent[i] -= compMean;
                }

                // Check convergence
                for (let i = 0; i < n; i++) {
                    maxChange = Math.max(maxChange, Math.abs(newComponent[i] - components[j][i]));
                }

                components[j] = newComponent;
            }

            if (maxChange < tol) break;
        }

        // Calculate final fitted values
        for (let i = 0; i < n; i++) {
            fitted[i] = meanY;
            for (let j = 0; j < p; j++) {
                fitted[i] += components[j][i];
            }
        }

        return fitted;
    }

    /**
     * Fit linear regression using normal equations
     * beta = (X'X)^-1 X'y
     */
    fitLinearRegression(X, y) {
        const n = X.length;
        const p = X[0].length;

        // X'X
        const XtX = [];
        for (let i = 0; i < p; i++) {
            XtX.push(new Array(p).fill(0));
            for (let j = 0; j < p; j++) {
                for (let k = 0; k < n; k++) {
                    XtX[i][j] += X[k][i] * X[k][j];
                }
            }
        }

        // Add ridge penalty for numerical stability
        const lambda = 0.001;
        for (let i = 0; i < p; i++) {
            XtX[i][i] += lambda;
        }

        // X'y
        const Xty = new Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            for (let k = 0; k < n; k++) {
                Xty[i] += X[k][i] * y[k];
            }
        }

        // Solve via Cholesky decomposition
        const L = this.choleskyDecomposition(XtX);
        const beta = this.choleskySolve(L, Xty);

        return beta;
    }

    /**
     * Cholesky decomposition
     */
    choleskyDecomposition(A) {
        const n = A.length;
        const L = [];
        for (let i = 0; i < n; i++) {
            L.push(new Array(n).fill(0));
        }

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i][k] * L[j][k];
                }

                if (i === j) {
                    const val = A[i][i] - sum;
                    L[i][j] = val > 0 ? Math.sqrt(val) : 1e-10;
                } else {
                    L[i][j] = (A[i][j] - sum) / L[j][j];
                }
            }
        }

        return L;
    }

    /**
     * Solve L L' x = b using forward/backward substitution
     */
    choleskySolve(L, b) {
        const n = L.length;

        // Forward substitution: L y = b
        const y = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let j = 0; j < i; j++) {
                sum += L[i][j] * y[j];
            }
            y[i] = (b[i] - sum) / L[i][i];
        }

        // Backward substitution: L' x = y
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < n; j++) {
                sum += L[j][i] * x[j];
            }
            x[i] = (y[i] - sum) / L[i][i];
        }

        return x;
    }

    /**
     * Bootstrap standard error estimation
     */
    bootstrapSE(X, Y, wtp) {
        const n = Y.length;
        const bootstrapIterations = Math.min(this.options.bootstrapIterations, 50);
        const evppiValues = [];

        for (let b = 0; b < bootstrapIterations; b++) {
            // Bootstrap sample
            const indices = [];
            for (let i = 0; i < n; i++) {
                indices.push(Math.floor(this._seededRandom() * n));
            }

            const Xb = indices.map(i => X[i]);
            const Yb = indices.map(i => Y[i]);

            // Fit GAM on bootstrap sample
            const fitted = this.fitGAM(Xb, Yb);

            // Calculate EVPPI
            const meanY = Yb.reduce((a, b) => a + b, 0) / n;
            let sumMax = 0;
            for (let i = 0; i < n; i++) {
                sumMax += Math.max(0, fitted[i]);
            }
            const evppi = sumMax / n - Math.max(0, meanY);
            evppiValues.push(evppi);
        }

        // Standard deviation of bootstrap EVPPIs
        const meanEvppi = evppiValues.reduce((a, b) => a + b, 0) / bootstrapIterations;
        let sumSq = 0;
        for (const val of evppiValues) {
            sumSq += (val - meanEvppi) ** 2;
        }

        return Math.sqrt(sumSq / (bootstrapIterations - 1));
    }

    /**
     * Calculate R-squared for model fit
     */
    calculateRSquared(observed, fitted) {
        const n = observed.length;
        const meanObs = observed.reduce((a, b) => a + b, 0) / n;

        let ssRes = 0, ssTot = 0;
        for (let i = 0; i < n; i++) {
            ssRes += (observed[i] - fitted[i]) ** 2;
            ssTot += (observed[i] - meanObs) ** 2;
        }

        return ssTot > 0 ? 1 - ssRes / ssTot : 0;
    }

    /**
     * Generate EVPPI curve across WTP thresholds
     */
    generateEVPPICurve(psaResults, parametersOfInterest, parameterSamples, wtpRange = null) {
        const range = wtpRange || {
            min: 0,
            max: 100000,
            step: 5000
        };

        const curve = [];

        for (let wtp = range.min; wtp <= range.max; wtp += range.step) {
            try {
                const evppi = this.calculate(psaResults, parametersOfInterest, wtp, parameterSamples);
                curve.push({
                    wtp: wtp,
                    evppi: evppi.evppiPerPatient,
                    se: evppi.standardError
                });
            } catch (e) {
                curve.push({
                    wtp: wtp,
                    evppi: 0,
                    se: 0
                });
            }
        }

        return curve;
    }

    /**
     * Calculate population EVPPI
     */
    calculatePopulationEVPPI(evppiPerPatient, population, years, discountRate = 0.035) {
        // Discount factor for population
        let totalDiscountedPop = 0;
        for (let t = 0; t < years; t++) {
            totalDiscountedPop += population / Math.pow(1 + discountRate, t);
        }

        return evppiPerPatient * totalDiscountedPop;
    }
}

/**
 * Expected Value of Sample Information (EVSI) Calculator
 * Estimates value of conducting a new study
 */
class EVSICalculator {
    constructor() {
        this.evppiCalc = new EVPPICalculator();
    }

    /**
     * Calculate EVSI for a proposed study
     *
     * @param {Object} psaResults - PSA results
     * @param {Array} parametersOfInterest - Parameters the study would inform
     * @param {number} wtp - Willingness-to-pay
     * @param {Object} parameterSamples - Parameter samples from PSA
     * @param {Object} studyDesign - Study design parameters
     */
    calculate(psaResults, parametersOfInterest, wtp, parameterSamples, studyDesign) {
        const {
            sampleSize,
            studyCost,
            expectedReduction = 0.5  // Expected reduction in variance
        } = studyDesign;

        // First get EVPPI for these parameters
        const evppi = this.evppiCalc.calculate(
            psaResults,
            parametersOfInterest,
            wtp,
            parameterSamples
        );

        // EVSI is typically a fraction of EVPPI depending on sample size
        // Using simplified relationship: EVSI ≈ EVPPI * (1 - 1/(1 + n/n0))
        // where n0 is a characteristic sample size

        const n0 = 100;  // Characteristic sample size
        const reductionFactor = 1 - 1 / (1 + sampleSize / n0);
        const evsiPerPatient = evppi.evppiPerPatient * reductionFactor * expectedReduction;

        return {
            parameters: parametersOfInterest,
            wtp: wtp,
            evppiPerPatient: evppi.evppiPerPatient,
            evsiPerPatient: Math.max(0, evsiPerPatient),
            sampleSize: sampleSize,
            studyCost: studyCost,
            netValueOfStudy: evsiPerPatient - studyCost,
            worthConducting: evsiPerPatient > studyCost,
            optimalSampleSize: this.findOptimalSampleSize(
                evppi.evppiPerPatient,
                studyCost,
                expectedReduction,
                sampleSize
            )
        };
    }

    /**
     * Find optimal sample size that maximizes EVSI - study cost
     */
    findOptimalSampleSize(evppiPerPatient, costPerPatient, expectedReduction, maxN = 10000) {
        let bestN = 0;
        let bestNetValue = 0;
        const n0 = 100;

        for (let n = 10; n <= maxN; n += 10) {
            const reductionFactor = 1 - 1 / (1 + n / n0);
            const evsi = evppiPerPatient * reductionFactor * expectedReduction;
            const cost = n * costPerPatient;
            const netValue = evsi - cost;

            if (netValue > bestNetValue) {
                bestNetValue = netValue;
                bestN = n;
            }
        }

        return {
            optimalN: bestN,
            netValue: bestNetValue
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.EVPPICalculator = EVPPICalculator;
    window.EVSICalculator = EVSICalculator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EVPPICalculator, EVSICalculator };
}
