/**
 * Kahan Summation Algorithm
 * Provides numerically stable summation for floating-point numbers
 * Required for deterministic results in HTA models
 *
 * Reference: RFC-005 Determinism Contract
 */

class KahanSum {
    constructor() {
        this.sum = 0.0;
        this.compensation = 0.0;
    }

    /**
     * Add a value using Kahan compensated summation
     * @param {number} value - Value to add
     */
    add(value) {
        const y = value - this.compensation;
        const t = this.sum + y;
        this.compensation = (t - this.sum) - y;
        this.sum = t;
    }

    /**
     * Get the current total
     * @returns {number} The sum with compensation applied
     */
    total() {
        return this.sum;
    }

    /**
     * Reset the accumulator
     */
    reset() {
        this.sum = 0.0;
        this.compensation = 0.0;
    }

    /**
     * Static method to sum an array using Kahan summation
     * @param {number[]} values - Array of values to sum
     * @returns {number} The sum
     */
    static sum(values) {
        const ks = new KahanSum();
        for (const v of values) {
            ks.add(v);
        }
        return ks.total();
    }
}

/**
 * Kahan-Babushka-Neumaier Summation (improved stability)
 * Even more stable than standard Kahan for certain cases
 */
class NeumaierSum {
    constructor() {
        this.sum = 0.0;
        this.correction = 0.0;
    }

    add(value) {
        const t = this.sum + value;
        if (Math.abs(this.sum) >= Math.abs(value)) {
            this.correction += (this.sum - t) + value;
        } else {
            this.correction += (value - t) + this.sum;
        }
        this.sum = t;
    }

    total() {
        return this.sum + this.correction;
    }

    reset() {
        this.sum = 0.0;
        this.correction = 0.0;
    }

    static sum(values) {
        const ns = new NeumaierSum();
        for (const v of values) {
            ns.add(v);
        }
        return ns.total();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.KahanSum = KahanSum;
    window.NeumaierSum = NeumaierSum;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KahanSum, NeumaierSum };
}
