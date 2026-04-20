/**
 * Multi-State Model Engine
 * Supports arbitrary state-transition structures with time-dependent intensities.
 *
 * Features:
 * - Transition rate matrix Q construction from rate list
 * - Matrix exponential via scaling-and-squaring + Pade approximation
 * - State occupancy trace over time
 * - Half-cycle correction
 * - Discounting for costs and QALYs
 * - Steady-state distribution and mean sojourn times
 * - Kahan summation for numerical stability
 */

var KahanRef = (function resolveKahan() {
    if (typeof globalThis !== 'undefined' && globalThis.KahanSum) {
        return globalThis.KahanSum;
    }
    if (typeof require === 'function') {
        try {
            return require('../utils/kahan').KahanSum;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ============ MATRIX UTILITIES ============

/**
 * Create an n x n zero matrix
 */
function zeroMatrix(n) {
    const M = [];
    for (let i = 0; i < n; i++) {
        M.push(new Float64Array(n));
    }
    return M;
}

/**
 * Create an n x n identity matrix
 */
function identityMatrix(n) {
    const M = zeroMatrix(n);
    for (let i = 0; i < n; i++) M[i][i] = 1.0;
    return M;
}

/**
 * Matrix multiplication: A * B
 */
function matMul(A, B) {
    const n = A.length;
    const R = zeroMatrix(n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) {
                s += A[i][k] * B[k][j];
            }
            R[i][j] = s;
        }
    }
    return R;
}

/**
 * Matrix addition: A + B
 */
function matAdd(A, B) {
    const n = A.length;
    const R = zeroMatrix(n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            R[i][j] = A[i][j] + B[i][j];
        }
    }
    return R;
}

/**
 * Scalar * Matrix
 */
function matScale(s, M) {
    const n = M.length;
    const R = zeroMatrix(n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            R[i][j] = s * M[i][j];
        }
    }
    return R;
}

/**
 * Infinity-norm of a matrix (max absolute row sum)
 */
function matNormInf(M) {
    const n = M.length;
    let maxRow = 0;
    for (let i = 0; i < n; i++) {
        let rowSum = 0;
        for (let j = 0; j < n; j++) {
            rowSum += Math.abs(M[i][j]);
        }
        if (rowSum > maxRow) maxRow = rowSum;
    }
    return maxRow;
}

/**
 * Deep copy a matrix
 */
function matCopy(M) {
    const n = M.length;
    const R = [];
    for (let i = 0; i < n; i++) {
        R.push(new Float64Array(M[i]));
    }
    return R;
}

// ============ MATRIX EXPONENTIAL ============

/**
 * Matrix exponential via scaling-and-squaring with Pade(6,6) approximation.
 * Computes exp(A) for square matrix A.
 *
 * Algorithm:
 * 1. Choose s such that ||A / 2^s|| < 0.5
 * 2. Compute Pade(6,6) approximation of exp(A / 2^s)
 * 3. Square result s times
 */
function matrixExponential(A, dt) {
    const n = A.length;
    // Scale A by dt
    let M = matScale(dt, A);

    // Scaling: find s such that norm(M / 2^s) < 0.5
    const norm = matNormInf(M);
    let s = 0;
    if (norm > 0.5) {
        s = Math.ceil(Math.log2(norm / 0.5));
        M = matScale(1.0 / Math.pow(2, s), M);
    }

    // Pade(6,6) coefficients
    const c = [1, 1/2, 1/9, 1/72, 1/1008, 1/30240, 1/1209600];

    // Compute powers of M: M^2, M^3, ..., M^6
    const M2 = matMul(M, M);
    const M3 = matMul(M2, M);
    const M4 = matMul(M2, M2);
    const M5 = matMul(M4, M);
    const M6 = matMul(M4, M2);

    const I = identityMatrix(n);

    // U = M * (c[1]*I + c[3]*M^2 + c[5]*M^4) -- odd terms
    // V = c[0]*I + c[2]*M^2 + c[4]*M^4 + c[6]*M^6 -- even terms
    // But for Pade(6,6) we need a more standard formulation:
    // Numerator N = sum_{k=0}^{6} p_k * M^k
    // Denominator D = sum_{k=0}^{6} (-1)^k * p_k * M^k
    // where p_k = (2*6 - k)! * 6! / ((2*6)! * k! * (6-k)!)
    const q = 6;
    const pCoeffs = [];
    for (let k = 0; k <= q; k++) {
        pCoeffs.push(factorial(2 * q - k) * factorial(q) /
                     (factorial(2 * q) * factorial(k) * factorial(q - k)));
    }

    // Build U (odd part) and V (even part)
    // V = p0*I + p2*M^2 + p4*M^4 + p6*M^6
    // U = M * (p1*I + p3*M^2 + p5*M^4)
    let V = matAdd(
        matAdd(
            matAdd(matScale(pCoeffs[0], I), matScale(pCoeffs[2], M2)),
            matScale(pCoeffs[4], M4)
        ),
        matScale(pCoeffs[6], M6)
    );

    let Uinner = matAdd(
        matAdd(matScale(pCoeffs[1], I), matScale(pCoeffs[3], M2)),
        matScale(pCoeffs[5], M4)
    );
    let U = matMul(M, Uinner);

    // exp(M) ≈ (V - U)^{-1} * (V + U)
    const VpU = matAdd(V, U);
    const VmU = matAdd(V, matScale(-1, U));

    // Solve VmU * result = VpU via Gaussian elimination
    let result = solveLinearSystem(VmU, VpU);

    // Squaring phase
    for (let i = 0; i < s; i++) {
        result = matMul(result, result);
    }

    return result;
}

/**
 * Factorial (small n only, for Pade coefficients)
 */
function factorial(n) {
    if (n <= 1) return 1;
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
}

/**
 * Solve A * X = B for X using Gaussian elimination with partial pivoting.
 * A and B are n x n matrices. Returns X (n x n).
 */
function solveLinearSystem(A, B) {
    const n = A.length;
    // Augment [A | B]
    const aug = [];
    for (let i = 0; i < n; i++) {
        const row = new Float64Array(2 * n);
        for (let j = 0; j < n; j++) row[j] = A[i][j];
        for (let j = 0; j < n; j++) row[n + j] = B[i][j];
        aug.push(row);
    }

    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
        // Find pivot
        let maxVal = Math.abs(aug[col][col]);
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > maxVal) {
                maxVal = Math.abs(aug[row][col]);
                maxRow = row;
            }
        }
        // Swap rows
        if (maxRow !== col) {
            const tmp = aug[col];
            aug[col] = aug[maxRow];
            aug[maxRow] = tmp;
        }

        const pivot = aug[col][col];
        if (Math.abs(pivot) < 1e-30) continue; // Singular or nearly singular

        // Eliminate below
        for (let row = col + 1; row < n; row++) {
            const factor = aug[row][col] / pivot;
            for (let j = col; j < 2 * n; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }

    // Back substitution
    const X = zeroMatrix(n);
    for (let col = n - 1; col >= 0; col--) {
        const pivot = aug[col][col];
        if (Math.abs(pivot) < 1e-30) continue;
        for (let j = 0; j < n; j++) {
            let s = aug[col][n + j];
            for (let k = col + 1; k < n; k++) {
                s -= aug[col][k] * X[k][j];
            }
            X[col][j] = s / pivot;
        }
    }

    return X;
}

// ============ MULTI-STATE MODEL ENGINE ============

class MultiStateModelEngine {
    constructor(options = {}) {
        this.tolerance = options.tolerance ?? 1e-10;
    }

    /**
     * Validate model configuration.
     * Checks: rates non-negative, absorbing states exist, states referenced in transitions exist.
     */
    validate(config) {
        const errors = [];
        const warnings = [];

        if (!config.states || config.states.length === 0) {
            errors.push('No states defined');
            return { valid: false, errors, warnings };
        }

        const stateNames = new Set(config.states.map(s => s.name));

        // Check transitions reference valid states
        if (config.transitions) {
            for (const t of config.transitions) {
                if (!stateNames.has(t.from)) {
                    errors.push(`Transition references unknown state: ${t.from}`);
                }
                if (!stateNames.has(t.to)) {
                    errors.push(`Transition references unknown state: ${t.to}`);
                }
                if (t.rate < 0) {
                    errors.push(`Negative transition rate from ${t.from} to ${t.to}: ${t.rate}`);
                }
            }
        }

        // Check absorbing states
        const absorbingStates = config.states.filter(s => s.absorbing);
        if (absorbingStates.length === 0) {
            warnings.push('No absorbing states defined. Model may not converge.');
        }

        // Check initial probabilities sum to ~1
        const initSum = config.states.reduce((s, st) => s + (st.initial ?? 0), 0);
        if (Math.abs(initSum - 1.0) > 1e-6) {
            errors.push(`Initial probabilities sum to ${initSum}, expected 1.0`);
        }

        // Check for disconnected states: states with no outgoing and no incoming transitions (non-absorbing)
        if (config.transitions) {
            const hasOutgoing = new Set();
            const hasIncoming = new Set();
            for (const t of config.transitions) {
                hasOutgoing.add(t.from);
                hasIncoming.add(t.to);
            }
            for (const st of config.states) {
                if (!st.absorbing && !hasOutgoing.has(st.name) && !hasIncoming.has(st.name)) {
                    warnings.push(`State "${st.name}" is disconnected (no transitions in or out)`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Build the transition rate matrix Q from the list of transitions.
     * Q[i][j] = rate from state i to state j (i != j)
     * Q[i][i] = -sum of rates leaving state i
     *
     * Absorbing states have all-zero rows.
     */
    transitionMatrix(transitions, states) {
        const n = states.length;
        const nameToIdx = {};
        states.forEach((s, i) => { nameToIdx[s.name] = i; });

        const Q = zeroMatrix(n);

        for (const t of transitions) {
            const i = nameToIdx[t.from];
            const j = nameToIdx[t.to];
            if (i === undefined || j === undefined) continue;
            // Skip transitions from absorbing states
            if (states[i].absorbing) continue;
            Q[i][j] = t.rate;
        }

        // Set diagonal: Q[i][i] = -sum of off-diagonal entries in row i
        for (let i = 0; i < n; i++) {
            let rowSum = 0;
            for (let j = 0; j < n; j++) {
                if (j !== i) rowSum += Q[i][j];
            }
            Q[i][i] = -rowSum;
        }

        return Q;
    }

    /**
     * Compute transition probability matrix P = expm(Q * dt)
     */
    computeTransitionProbabilities(Q, dt) {
        return matrixExponential(Q, dt);
    }

    /**
     * Find stationary distribution of a transition probability matrix P.
     * For models with absorbing states, all mass ends in absorbing states.
     * Uses power iteration.
     */
    steadyState(P) {
        const n = P.length;
        let pi = new Float64Array(n);
        for (let i = 0; i < n; i++) pi[i] = 1.0 / n;

        const maxIter = 10000;
        for (let iter = 0; iter < maxIter; iter++) {
            const piNew = new Float64Array(n);
            for (let j = 0; j < n; j++) {
                let s = 0;
                for (let i = 0; i < n; i++) {
                    s += pi[i] * P[i][j];
                }
                piNew[j] = s;
            }

            // Check convergence
            let maxDiff = 0;
            for (let i = 0; i < n; i++) {
                const diff = Math.abs(piNew[i] - pi[i]);
                if (diff > maxDiff) maxDiff = diff;
            }

            pi = piNew;
            if (maxDiff < this.tolerance) break;
        }

        return Array.from(pi);
    }

    /**
     * Compute mean sojourn time in each transient state.
     * For a CTMC, the expected sojourn time in state i = -1 / Q[i][i].
     */
    meanSojournTime(Q, states) {
        const result = {};
        for (let i = 0; i < states.length; i++) {
            if (states[i].absorbing) {
                result[states[i].name] = Infinity;
            } else {
                const rate = -Q[i][i];
                result[states[i].name] = rate > 0 ? 1.0 / rate : Infinity;
            }
        }
        return result;
    }

    /**
     * Run the multi-state model simulation.
     *
     * @param {Object} config - Model configuration
     * @returns {Object} Results including state trace, costs, QALYs
     */
    run(config) {
        const validation = this.validate(config);
        if (!validation.valid) {
            throw new Error('Invalid configuration: ' + validation.errors.join('; '));
        }

        const states = config.states;
        const n = states.length;
        const transitions = config.transitions || [];
        const rewards = config.rewards || {};
        const timeHorizon = config.timeHorizon ?? 20;
        const cycleLength = config.cycleLength ?? 1;
        const discountCosts = config.discountRateCosts ?? 0.035;
        const discountOutcomes = config.discountRateOutcomes ?? 0.035;
        const halfCycleCorrection = config.halfCycleCorrection ?? false;

        const numCycles = Math.ceil(timeHorizon / cycleLength);

        // Build Q matrix
        const Q = this.transitionMatrix(transitions, states);

        // Compute P = expm(Q * dt)
        const P = this.computeTransitionProbabilities(Q, cycleLength);

        // Initial state distribution
        let occupancy = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            occupancy[i] = states[i].initial ?? 0;
        }

        // State trace: array of occupancy vectors per cycle
        const stateTrace = [Array.from(occupancy)];

        // Accumulate costs and QALYs using Kahan summation
        const KS = KahanRef || { sum: (arr) => arr.reduce((a, b) => a + b, 0) };

        const perCycle = [];
        let totalCostAccum = 0;
        let totalQalyAccum = 0;

        for (let c = 0; c < numCycles; c++) {
            // Occupancy at start of cycle
            const occStart = Array.from(occupancy);

            // Transition: multiply occupancy vector by P
            const newOcc = new Float64Array(n);
            for (let j = 0; j < n; j++) {
                let s = 0;
                for (let i = 0; i < n; i++) {
                    s += occupancy[i] * P[i][j];
                }
                newOcc[j] = s;
            }
            occupancy = newOcc;
            stateTrace.push(Array.from(occupancy));

            const occEnd = Array.from(occupancy);

            // Compute rewards for this cycle
            const time = (c + 1) * cycleLength;
            const discountFactorCosts = 1.0 / Math.pow(1 + discountCosts, time);
            const discountFactorOutcomes = 1.0 / Math.pow(1 + discountOutcomes, time);

            let cycleCost = 0;
            let cycleQaly = 0;

            for (let i = 0; i < n; i++) {
                const stateName = states[i].name;
                const reward = rewards[stateName] || { cost: 0, qaly: 0 };

                // Use occupancy: if half-cycle correction, average of start and end
                const occ = halfCycleCorrection
                    ? (occStart[i] + occEnd[i]) / 2.0
                    : occEnd[i];

                cycleCost += occ * (reward.cost ?? 0) * cycleLength;
                cycleQaly += occ * (reward.qaly ?? 0) * cycleLength;
            }

            // Apply discounting
            cycleCost *= discountFactorCosts;
            cycleQaly *= discountFactorOutcomes;

            totalCostAccum += cycleCost;
            totalQalyAccum += cycleQaly;

            perCycle.push({
                cycle: c + 1,
                time: time,
                occupancy: occEnd,
                cost: cycleCost,
                qaly: cycleQaly,
                discountFactorCosts,
                discountFactorOutcomes
            });
        }

        // Compute steady state and sojourn times
        const ss = this.steadyState(P);
        const sojourn = this.meanSojournTime(Q, states);

        return {
            stateTrace,
            totalCosts: totalCostAccum,
            totalQalys: totalQalyAccum,
            perCycle,
            sojournTimes: sojourn,
            steadyState: ss,
            transitionRateMatrix: Q,
            transitionProbMatrix: P,
            validation
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MultiStateModelEngine = MultiStateModelEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MultiStateModelEngine, matrixExponential, zeroMatrix, identityMatrix, matMul };
}
