/**
 * PCG32 Random Number Generator
 * Permuted Congruential Generator with 64-bit state and 32-bit output
 *
 * Provides deterministic, reproducible random sequences for PSA
 * Reference: RFC-005 Determinism Contract
 *
 * Based on: https://www.pcg-random.org/
 */

class PCG32 {
    // PCG32 constants
    static MULTIPLIER = 6364136223846793005n;
    static INCREMENT = 1442695040888963407n;
    static MASK_32 = 0xFFFFFFFFn;
    static MASK_64 = 0xFFFFFFFFFFFFFFFFn;

    /**
     * Create a new PCG32 generator
     * @param {number|bigint} seed - Initial seed value
     */
    constructor(seed = 12345) {
        this.state = 0n;
        this.inc = PCG32.INCREMENT;
        this.seed(BigInt(seed));
    }

    /**
     * Seed the generator
     * @param {bigint} initState - Initial state
     * @param {bigint} initSeq - Sequence selector (optional)
     */
    seed(initState, initSeq = 1n) {
        this.state = 0n;
        this.inc = ((initSeq << 1n) | 1n) & PCG32.MASK_64;
        this.nextU32(); // Advance once
        this.state = (this.state + initState) & PCG32.MASK_64;
        this.nextU32(); // Advance again
    }

    /**
     * Generate next 32-bit unsigned integer
     * @returns {number} Random 32-bit unsigned integer
     */
    nextU32() {
        const oldState = this.state;

        // Advance internal state
        this.state = ((oldState * PCG32.MULTIPLIER) + this.inc) & PCG32.MASK_64;

        // Calculate output function (XSH RR)
        const xorshifted = Number(((oldState >> 18n) ^ oldState) >> 27n);
        const rot = Number(oldState >> 59n);

        return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
    }

    /**
     * Generate random float in [0, 1)
     * @returns {number} Random float
     */
    nextFloat() {
        return this.nextU32() / 4294967296.0;
    }

    /**
     * Generate random float in [0, 1) using 53-bit precision
     * More uniform distribution
     * @returns {number} Random double
     */
    nextDouble() {
        const a = this.nextU32() >>> 5;  // 27 bits
        const b = this.nextU32() >>> 6;  // 26 bits
        return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
    }

    /**
     * Generate random integer in [min, max] inclusive
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random integer
     */
    nextInt(min, max) {
        const range = max - min + 1;
        return min + (this.nextU32() % range);
    }

    /**
     * Generate random value from uniform distribution
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random value
     */
    uniform(min = 0, max = 1) {
        return min + this.nextDouble() * (max - min);
    }

    /**
     * Generate random value from normal distribution using Box-Muller transform
     * @param {number} mean - Mean of the distribution
     * @param {number} sd - Standard deviation
     * @returns {number} Random value from normal distribution
     */
    normal(mean = 0, sd = 1) {
        let u1, u2;
        do {
            u1 = this.nextDouble();
        } while (u1 === 0);
        u2 = this.nextDouble();

        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return mean + z0 * sd;
    }

    /**
     * Generate random value from log-normal distribution
     * @param {number} meanlog - Mean of the log
     * @param {number} sdlog - SD of the log
     * @returns {number} Random value from log-normal distribution
     */
    lognormal(meanlog, sdlog) {
        return Math.exp(this.normal(meanlog, sdlog));
    }

    /**
     * Generate random value from gamma distribution using Marsaglia-Tsang method
     * @param {number} shape - Shape parameter (alpha)
     * @param {number} scale - Scale parameter (beta)
     * @returns {number} Random value from gamma distribution
     */
    gamma(shape, scale = 1) {
        if (shape < 1) {
            // Use transformation for shape < 1
            const u = this.nextDouble();
            return this.gamma(shape + 1, scale) * Math.pow(u, 1.0 / shape);
        }

        const d = shape - 1.0 / 3.0;
        const c = 1.0 / Math.sqrt(9.0 * d);

        while (true) {
            let x, v;
            do {
                x = this.normal(0, 1);
                v = 1.0 + c * x;
            } while (v <= 0);

            v = v * v * v;
            const u = this.nextDouble();

            if (u < 1.0 - 0.0331 * (x * x) * (x * x)) {
                return d * v * scale;
            }

            if (Math.log(u) < 0.5 * x * x + d * (1.0 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    }

    /**
     * Generate random value from beta distribution
     * @param {number} alpha - Alpha parameter
     * @param {number} beta - Beta parameter
     * @returns {number} Random value from beta distribution
     */
    beta(alpha, beta) {
        const x = this.gamma(alpha, 1);
        const y = this.gamma(beta, 1);
        return x / (x + y);
    }

    /**
     * Generate random value from exponential distribution
     * @param {number} rate - Rate parameter (lambda)
     * @returns {number} Random value from exponential distribution
     */
    exponential(rate = 1) {
        let u;
        do {
            u = this.nextDouble();
        } while (u === 0);
        return -Math.log(u) / rate;
    }

    /**
     * Generate random value from Weibull distribution
     * @param {number} shape - Shape parameter (k)
     * @param {number} scale - Scale parameter (lambda)
     * @returns {number} Random value from Weibull distribution
     */
    weibull(shape, scale = 1) {
        const u = this.nextDouble();
        return scale * Math.pow(-Math.log(1 - u), 1 / shape);
    }

    /**
     * Sample from a categorical distribution
     * @param {number[]} probabilities - Array of probabilities (must sum to 1)
     * @returns {number} Index of selected category
     */
    categorical(probabilities) {
        const u = this.nextDouble();
        let cumulative = 0;
        for (let i = 0; i < probabilities.length; i++) {
            cumulative += probabilities[i];
            if (u < cumulative) {
                return i;
            }
        }
        return probabilities.length - 1;
    }

    /**
     * Generate random value from triangular distribution
     * @param {number} min - Minimum value
     * @param {number} mode - Mode (most likely value)
     * @param {number} max - Maximum value
     * @returns {number} Random value from triangular distribution
     */
    triangular(min, mode, max) {
        const u = this.nextDouble();
        const fc = (mode - min) / (max - min);

        if (u < fc) {
            return min + Math.sqrt(u * (max - min) * (mode - min));
        } else {
            return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        }
    }

    /**
     * Sample from distribution based on specification
     * @param {Object} dist - Distribution specification
     * @returns {number} Sampled value
     */
    sample(dist) {
        if (!dist || !dist.type) {
            throw new Error('Invalid distribution specification');
        }

        switch (dist.type.toLowerCase()) {
            case 'fixed':
            case 'constant':
                return dist.value;

            case 'normal':
            case 'gaussian':
                return this.normal(dist.mean, dist.sd);

            case 'lognormal':
                return this.lognormal(dist.meanlog, dist.sdlog);

            case 'beta':
                return this.beta(dist.alpha, dist.beta);

            case 'gamma':
                return this.gamma(dist.shape, dist.scale);

            case 'uniform':
                return this.uniform(dist.min, dist.max);

            case 'triangular':
                return this.triangular(dist.min, dist.mode, dist.max);

            case 'exponential':
                return this.exponential(dist.rate);

            case 'weibull':
                return this.weibull(dist.shape, dist.scale);

            default:
                throw new Error(`Unknown distribution type: ${dist.type}`);
        }
    }

    /**
     * Get current state for reproducibility verification
     * @returns {Object} State object
     */
    getState() {
        return {
            state: this.state.toString(),
            inc: this.inc.toString()
        };
    }

    /**
     * Set state (for resuming a sequence)
     * @param {Object} stateObj - State object from getState()
     */
    setState(stateObj) {
        this.state = BigInt(stateObj.state);
        this.inc = BigInt(stateObj.inc);
    }
}

// Golden sequence verification (seed=12345, first 10 values)
PCG32.GOLDEN_SEQUENCE = [
    0.5309738010,
    0.5041090831,
    0.2835282705,
    0.0740482539,
    0.5390257853,
    0.8621436283,
    0.9612861098,
    0.8404628392,
    0.2653242634,
    0.4007845776
];

/**
 * Verify determinism by checking against golden sequence
 * @returns {boolean} True if generator produces correct sequence
 */
PCG32.verifyDeterminism = function() {
    const rng = new PCG32(12345);
    const tolerance = 1e-9;

    for (let i = 0; i < PCG32.GOLDEN_SEQUENCE.length; i++) {
        const value = rng.nextDouble();
        if (Math.abs(value - PCG32.GOLDEN_SEQUENCE[i]) > tolerance) {
            console.error(`PCG32 verification failed at index ${i}: got ${value}, expected ${PCG32.GOLDEN_SEQUENCE[i]}`);
            return false;
        }
    }
    return true;
};

// Export
if (typeof window !== 'undefined') {
    window.PCG32 = PCG32;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PCG32 };
}
