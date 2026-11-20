/**
 * BayesianDecisionAnalysis: the normal CDF behind the real-options (Black-Scholes) value.
 * The class's _erf kept only the first two terms of the Numerical Recipes erfc series
 * (Phi(0) = 0.617). Reference values: R 4.6.0 pnorm and the Black-Scholes formula in R.
 */

'use strict';

const { BayesianDecisionAnalysis } = require('../../src/engine/frontierMeta');

describe('BayesianDecisionAnalysis normal CDF', () => {
    const bda = new BayesianDecisionAnalysis();
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

    test('_normalCDF matches R pnorm', () => {
        expect(Math.abs(bda._normalCDF(0) - 0.5)).toBeLessThan(1e-7);
        expect(rel(bda._normalCDF(0.35), 0.63683065117561899)).toBeLessThan(1e-6);
        expect(rel(bda._normalCDF(-1.96), 0.024997895148220428)).toBeLessThan(1e-6);
    });

    test('Black-Scholes call and put match R', () => {
        expect(rel(bda._blackScholesOption(100, 100, 1, 0.05, 0.2, 'call'), 10.450583572185565)).toBeLessThan(1e-6);
        expect(rel(bda._blackScholesOption(100, 100, 1, 0.05, 0.2, 'put'), 5.5735260222569707)).toBeLessThan(1e-6);
        expect(rel(bda._blackScholesOption(250000, 300000, 3, 0.035, 0.3, 'call'), 43833.742160854075)).toBeLessThan(1e-6);
    });
});
