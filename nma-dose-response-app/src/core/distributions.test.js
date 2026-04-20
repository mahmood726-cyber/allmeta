/**
 * NMA Dose Response Studio - Distributions Unit Tests
 * Tests for probability distribution functions
 */

import {
  normalCDF, normalPDF, normalQuantile,
  tCDF, tQuantile,
  chiSquareCDF, chiSquareQuantile,
  logGamma, gamma, beta, betaInc
} from './distributions.js';

describe('Normal Distribution', () => {
  describe('normalCDF', () => {
    test('should return 0.5 at x = 0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 7);
    });

    test('should return values close to 0 for large negative x', () => {
      expect(normalCDF(-5)).toBeLessThan(0.000001);
      expect(normalCDF(-3)).toBeCloseTo(0.00135, 5);
    });

    test('should return values close to 1 for large positive x', () => {
      expect(normalCDF(5)).toBeGreaterThan(0.999999);
      expect(normalCDF(3)).toBeCloseTo(0.99865, 5);
    });

    test('should handle special values', () => {
      expect(normalCDF(Infinity)).toBe(1);
      expect(normalCDF(-Infinity)).toBe(0);
      expect(normalCDF(NaN)).toBeNaN();
    });
  });

  describe('normalPDF', () => {
    test('should return maximum at x = 0', () => {
      expect(normalPDF(0)).toBeCloseTo(0.39894228, 8);
    });

    test('should be symmetric around 0', () => {
      expect(normalPDF(1)).toBeCloseTo(normalPDF(-1), 10);
      expect(normalPDF(2)).toBeCloseTo(normalPDF(-2), 10);
    });

    test('should decrease as |x| increases', () => {
      expect(normalPDF(0)).toBeGreaterThan(normalPDF(1));
      expect(normalPDF(1)).toBeGreaterThan(normalPDF(2));
    });

    test('should handle special values', () => {
      expect(normalPDF(Infinity)).toBe(0);
      expect(normalPDF(-Infinity)).toBe(0);
      expect(normalPDF(NaN)).toBe(0);
    });
  });

  describe('normalQuantile', () => {
    test('should return 0 for p = 0.5', () => {
      expect(normalQuantile(0.5)).toBeCloseTo(0, 10);
    });

    test('should return negative values for p < 0.5', () => {
      expect(normalQuantile(0.25)).toBeLessThan(0);
      expect(normalQuantile(0.1)).toBeLessThan(0);
    });

    test('should return positive values for p > 0.5', () => {
      expect(normalQuantile(0.75)).toBeGreaterThan(0);
      expect(normalQuantile(0.9)).toBeGreaterThan(0);
    });

    test('should be symmetric around 0.5', () => {
      const q1 = normalQuantile(0.1);
      const q2 = normalQuantile(0.9);
      expect(q1).toBeCloseTo(-q2, 10);
    });

    test('should match CDF inverse', () => {
      const p = 0.95;
      const x = normalQuantile(p);
      expect(normalCDF(x)).toBeCloseTo(p, 7);
    });

    test('should handle boundary values', () => {
      expect(normalQuantile(0)).toBe(-Infinity);
      expect(normalQuantile(1)).toBe(Infinity);
    });
  });
});

describe('t-Distribution', () => {
  describe('tCDF', () => {
    test('should return 0.5 at t = 0 for any df', () => {
      expect(tCDF(0, 1)).toBeCloseTo(0.5, 10);
      expect(tCDF(0, 5)).toBeCloseTo(0.5, 10);
      expect(tCDF(0, 30)).toBeCloseTo(0.5, 10);
    });

    test('should approach normal CDF as df increases', () => {
      const t = 2;
      const cdf20 = tCDF(t, 20);
      const cdf100 = tCDF(t, 100);
      const normal = normalCDF(t);
      expect(Math.abs(cdf100 - normal)).toBeLessThan(Math.abs(cdf20 - normal));
    });

    test('should handle invalid df', () => {
      expect(tCDF(0, 0)).toBe(0.5);
      expect(tCDF(0, -1)).toBe(0.5);
    });

    test('should handle special t values', () => {
      expect(tCDF(Infinity, 5)).toBe(1);
      expect(tCDF(-Infinity, 5)).toBe(0);
    });
  });

  describe('tQuantile', () => {
    test('should return 0 for p = 0.5', () => {
      expect(tQuantile(0.5, 5)).toBeCloseTo(0, 10);
    });

    test('should match CDF inverse', () => {
      const p = 0.95;
      const df = 10;
      const t = tQuantile(p, df);
      expect(tCDF(t, df)).toBeCloseTo(p, 5);
    });

    test('should use normal approximation for large df', () => {
      const p = 0.975;
      const t300 = tQuantile(p, 300);
      const normal = normalQuantile(p);
      expect(t300).toBeCloseTo(normal, 2);
    });

    test('should handle boundary values', () => {
      expect(tQuantile(0, 5)).toBe(-Infinity);
      expect(tQuantile(1, 5)).toBe(Infinity);
    });
  });
});

describe('Chi-Square Distribution', () => {
  describe('chiSquareCDF', () => {
    test('should return 0 for x <= 0', () => {
      expect(chiSquareCDF(0, 5)).toBe(0);
      expect(chiSquareCDF(-1, 5)).toBe(0);
    });

    test('should increase as x increases', () => {
      expect(chiSquareCDF(1, 5)).toBeLessThan(chiSquareCDF(5, 5));
      expect(chiSquareCDF(5, 5)).toBeLessThan(chiSquareCDF(10, 5));
    });

    test('should handle invalid df', () => {
      expect(chiSquareCDF(5, 0)).toBe(0);
      expect(chiSquareCDF(5, -1)).toBe(0);
    });
  });

  describe('chiSquareQuantile', () => {
    test('should return 0 for p <= 0', () => {
      expect(chiSquareQuantile(0, 5)).toBe(0);
      expect(chiSquareQuantile(-0.1, 5)).toBe(0);
    });

    test('should return Infinity for p >= 1', () => {
      expect(chiSquareQuantile(1, 5)).toBe(Infinity);
    });

    test('should match CDF inverse', () => {
      const p = 0.95;
      const df = 5;
      const x = chiSquareQuantile(p, df);
      expect(chiSquareCDF(x, df)).toBeCloseTo(p, 3);
    });

    test('should handle invalid df', () => {
      expect(chiSquareQuantile(0.5, 0)).toBe(0);
      expect(chiSquareQuantile(0.5, -1)).toBe(0);
    });
  });
});

describe('Special Functions', () => {
  describe('logGamma', () => {
    test('should return Infinity for non-positive values', () => {
      expect(logGamma(0)).toBe(Infinity);
      expect(logGamma(-1)).toBe(Infinity);
    });

    test('should return correct values for positive inputs', () => {
      expect(logGamma(1)).toBeCloseTo(0, 10);
      expect(logGamma(2)).toBeCloseTo(0, 10);
      expect(logGamma(3)).toBeCloseTo(Math.log(2), 10);
      expect(logGamma(6)).toBeCloseTo(Math.log(120), 10);
    });

    test('should handle large values', () => {
      expect(logGamma(10)).toBeCloseTo(12.8018, 4);
      expect(logGamma(100)).toBeGreaterThan(0);
    });
  });

  describe('gamma', () => {
    test('should return correct values for positive integers', () => {
      expect(gamma(1)).toBeCloseTo(1, 10);
      expect(gamma(2)).toBeCloseTo(1, 10);
      expect(gamma(3)).toBeCloseTo(2, 10);
      expect(gamma(5)).toBeCloseTo(24, 10);
      expect(gamma(6)).toBeCloseTo(120, 10);
    });

    test('should return correct values for half-integers', () => {
      expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 8);
      expect(gamma(1.5)).toBeCloseTo(0.5 * Math.sqrt(Math.PI), 8);
    });
  });

  describe('beta', () => {
    test('should return correct values', () => {
      expect(beta(1, 1)).toBeCloseTo(1, 10);
      expect(beta(1, 2)).toBeCloseTo(0.5, 10);
      expect(beta(2, 2)).toBeCloseTo(1/6, 5);
    });

    test('should be symmetric', () => {
      expect(beta(2, 5)).toBeCloseTo(beta(5, 2), 10);
    });
  });

  describe('betaInc', () => {
    test('should return 0 for x <= 0', () => {
      expect(betaInc(1, 1, 0)).toBe(0);
      expect(betaInc(1, 1, -1)).toBe(0);
    });

    test('should return 1 for x >= 1', () => {
      expect(betaInc(1, 1, 1)).toBe(1);
      expect(betaInc(1, 1, 2)).toBe(1);
    });

    test('should return 0.5 for symmetric case at x = 0.5', () => {
      expect(betaInc(1, 1, 0.5)).toBeCloseTo(0.5, 10);
      expect(betaInc(2, 2, 0.5)).toBeCloseTo(0.5, 10);
    });

    test('should handle invalid parameters', () => {
      expect(betaInc(0, 1, 0.5)).toBeNaN();
      expect(betaInc(1, 0, 0.5)).toBeNaN();
    });

    test('should increase with x', () => {
      expect(betaInc(2, 3, 0.2)).toBeLessThan(betaInc(2, 3, 0.5));
      expect(betaInc(2, 3, 0.5)).toBeLessThan(betaInc(2, 3, 0.8));
    });
  });
});

export default {
  normalCDF, normalPDF, normalQuantile,
  tCDF, tQuantile,
  chiSquareCDF, chiSquareQuantile,
  logGamma, gamma, beta, betaInc
};
