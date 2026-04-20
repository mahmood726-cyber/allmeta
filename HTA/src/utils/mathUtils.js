/**
 * Shared Mathematical Utilities for HTA Engines
 * Consolidates statistical functions used across PSA, microsimulation, and other engines
 *
 * Reference: RFC-005 Determinism Contract
 */

/**
 * Kahan summation for numerical stability
 */
class KahanSum {
    constructor() {
        this.sum = 0;
        this.c = 0;  // Compensation for lost low-order bits
    }

    add(value) {
        const y = value - this.c;
        const t = this.sum + y;
        this.c = (t - this.sum) - y;
        this.sum = t;
    }

    total() {
        return this.sum;
    }

    reset() {
        this.sum = 0;
        this.c = 0;
    }
}

/**
 * Statistical helper functions
 */
const StatUtils = {
    /**
     * Calculate mean using Kahan summation
     */
    mean(arr) {
        if (!arr || arr.length === 0) return 0;
        const sum = new KahanSum();
        for (const v of arr) {
            sum.add(v);
        }
        return sum.total() / arr.length;
    },

    /**
     * Calculate standard deviation (sample)
     */
    sd(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = this.mean(arr);
        const sum = new KahanSum();
        for (const v of arr) {
            sum.add((v - m) * (v - m));
        }
        return Math.sqrt(sum.total() / (arr.length - 1));
    },

    /**
     * Calculate percentile from array
     */
    percentile(arr, p) {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        return this.percentileFromSorted(sorted, p);
    },

    /**
     * Calculate percentile from pre-sorted array
     */
    percentileFromSorted(sorted, p) {
        if (!sorted || sorted.length === 0) return 0;
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const fraction = index - lower;
        return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
    },

    /**
     * Log-gamma function (Lanczos approximation)
     */
    logGamma(x) {
        if (x <= 0) return Infinity;

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

        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - this.logGamma(1 - x);
        }

        x -= 1;
        let a = c[0];
        for (let i = 1; i < g + 2; i++) {
            a += c[i] / (x + i);
        }

        const t = x + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    },

    /**
     * Beta function B(a, b) = Gamma(a) * Gamma(b) / Gamma(a + b)
     */
    betaFunction(a, b) {
        return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
    },

    /**
     * Regularized incomplete beta function using continued fraction
     */
    incompleteBeta(x, a, b) {
        if (x === 0) return 0;
        if (x === 1) return 1;

        // Use symmetry for better convergence
        if (x > (a + 1) / (a + b + 2)) {
            return 1 - this.incompleteBeta(1 - x, b, a);
        }

        const bt = Math.exp(
            this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
            a * Math.log(x) + b * Math.log(1 - x)
        );

        return bt * this.betaContinuedFraction(x, a, b) / a;
    },

    /**
     * Continued fraction for incomplete beta (Lentz's method)
     */
    betaContinuedFraction(x, a, b) {
        const maxIterations = 200;
        const epsilon = 1e-14;
        const tiny = 1e-30;

        let c = 1;
        let d = 1 - (a + b) * x / (a + 1);
        if (Math.abs(d) < tiny) d = tiny;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= maxIterations; m++) {
            const m2 = 2 * m;

            // Even step
            let an = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
            d = 1 + an * d;
            if (Math.abs(d) < tiny) d = tiny;
            c = 1 + an / c;
            if (Math.abs(c) < tiny) c = tiny;
            d = 1 / d;
            h *= d * c;

            // Odd step
            an = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
            d = 1 + an * d;
            if (Math.abs(d) < tiny) d = tiny;
            c = 1 + an / c;
            if (Math.abs(c) < tiny) c = tiny;
            d = 1 / d;
            const delta = d * c;
            h *= delta;

            if (Math.abs(delta - 1) < epsilon) break;
        }

        return h;
    },

    /**
     * Beta CDF
     */
    betaCDF(x, alpha, beta) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        return this.incompleteBeta(x, alpha, beta);
    },

    /**
     * Beta PDF
     */
    betaPDF(x, alpha, beta) {
        if (x <= 0 || x >= 1) return 0;
        return Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1) / this.betaFunction(alpha, beta);
    },

    /**
     * Normal CDF (Abramowitz & Stegun approximation)
     */
    normalCDF(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return 0.5 * (1.0 + sign * y);
    },

    /**
     * Normal inverse CDF (Acklam's approximation)
     */
    normalInverseCDF(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        const a = [
            -3.969683028665376e+01,
            2.209460984245205e+02,
            -2.759285104469687e+02,
            1.383577518672690e+02,
            -3.066479806614716e+01,
            2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01,
            1.615858368580409e+02,
            -1.556989798598866e+02,
            6.680131188771972e+01,
            -1.328068155288572e+01
        ];
        const c = [
            -7.784894002430293e-03,
            -3.223964580411365e-01,
            -2.400758277161838e+00,
            -2.549732539343734e+00,
            4.374664141464968e+00,
            2.938163982698783e+00
        ];
        const d = [
            7.784695709041462e-03,
            3.224671290700398e-01,
            2.445134137142996e+00,
            3.754408661907416e+00
        ];

        const pLow = 0.02425;
        const pHigh = 1 - pLow;
        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                   ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                   (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
    }
};

/**
 * WTP threshold resolution utilities
 */
const WTPUtils = {
    /**
     * Get WTP thresholds from settings or defaults
     */
    resolveWtpThresholds(settings, OmanGuidanceRef = null) {
        if (OmanGuidanceRef?.resolveWtpThresholds) {
            return OmanGuidanceRef.resolveWtpThresholds(settings).thresholds;
        }
        const explicit = Array.isArray(settings?.wtp_thresholds) ? settings.wtp_thresholds : null;
        if (explicit && explicit.length) return explicit;
        return [20000, 30000, 50000];
    },

    /**
     * Get primary WTP threshold
     */
    resolvePrimaryWtp(settings, OmanGuidanceRef = null) {
        const thresholds = this.resolveWtpThresholds(settings, OmanGuidanceRef);
        return thresholds[0];
    },

    /**
     * Get full WTP range for CEAC
     */
    resolveWtpRange(settings, options = {}, OmanGuidanceRef = null) {
        const thresholds = this.resolveWtpThresholds(settings, OmanGuidanceRef);
        const maxThreshold = Math.max(...thresholds);
        const DEFAULT_WTP_MAX = 100000;
        const DEFAULT_WTP_STEP = 1000;

        const wtpMin = options.wtpMin ?? 0;
        let wtpMax = options.wtpMax ?? DEFAULT_WTP_MAX;
        const wtpStep = options.wtpStep ?? DEFAULT_WTP_STEP;

        if (wtpMax === DEFAULT_WTP_MAX && Number.isFinite(maxThreshold)) {
            wtpMax = Math.max(maxThreshold, Math.round(maxThreshold * 1.5));
        }

        return { wtpMin, wtpMax, wtpStep, thresholds };
    }
};

/**
 * Guidance defaults for HTA settings
 */
const GuidanceDefaults = {
    discount_rate_costs: 0.03,
    discount_rate_qalys: 0.03,
    currency: 'OMR',
    placeholder_gdp_per_capita_omr: 10000
};

/**
 * Resolve OmanGuidance reference
 */
function resolveOmanGuidance() {
    if (typeof globalThis !== 'undefined' && globalThis.OmanHTAGuidance) {
        return globalThis.OmanHTAGuidance;
    }
    if (typeof require === 'function') {
        try {
            return require('./omanGuidance');
        } catch (err) {
            return null;
        }
    }
    return null;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.KahanSum = KahanSum;
    window.StatUtils = StatUtils;
    window.WTPUtils = WTPUtils;
    window.GuidanceDefaults = GuidanceDefaults;
    window.resolveOmanGuidance = resolveOmanGuidance;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        KahanSum,
        StatUtils,
        WTPUtils,
        GuidanceDefaults,
        resolveOmanGuidance
    };
}
