/**
 * NMA Dose Response Studio - Statistical Utilities Unit Tests
 * Tests for core statistical utility functions
 */

import { safeDivide, safeSqrt, safeLog, safeExecute, I2ConfidenceInterval } from './stat-utils.js';

describe('StatUtils', () => {
  describe('safeDivide', () => {
    test('should return correct division result for valid inputs', () => {
      expect(safeDivide(10, 2)).toBe(5);
      expect(safeDivide(7, 3)).toBeCloseTo(2.333, 3);
    });

    test('should return fallback for division by zero', () => {
      expect(safeDivide(10, 0)).toBe(0);
      expect(safeDivide(10, 0, -1)).toBe(-1);
    });

    test('should return fallback for invalid denominator', () => {
      expect(safeDivide(10, NaN)).toBe(0);
      expect(safeDivide(10, Infinity)).toBe(0);
    });

    test('should handle negative numbers', () => {
      expect(safeDivide(-10, 2)).toBe(-5);
      expect(safeDivide(10, -2)).toBe(-5);
    });
  });

  describe('safeSqrt', () => {
    test('should return correct square root for valid inputs', () => {
      expect(safeSqrt(4)).toBe(2);
      expect(safeSqrt(9)).toBe(3);
      expect(safeSqrt(2)).toBeCloseTo(1.414, 3);
    });

    test('should return fallback for negative inputs', () => {
      expect(safeSqrt(-1)).toBe(0);
      expect(safeSqrt(-4, -1)).toBe(-1);
    });

    test('should return fallback for invalid inputs', () => {
      expect(safeSqrt(NaN)).toBe(0);
      expect(safeSqrt(Infinity)).toBe(Infinity);
    });

    test('should handle zero', () => {
      expect(safeSqrt(0)).toBe(0);
    });
  });

  describe('safeLog', () => {
    test('should return correct natural log for valid inputs', () => {
      expect(safeLog(1)).toBe(0);
      expect(safeLog(Math.E)).toBeCloseTo(1, 5);
      expect(safeLog(10)).toBeCloseTo(2.303, 3);
    });

    test('should return fallback for non-positive inputs', () => {
      expect(safeLog(0)).toBe(-Infinity);
      expect(safeLog(-1)).toBe(-Infinity);
      expect(safeLog(-1, 0)).toBe(0);
    });

    test('should return fallback for invalid inputs', () => {
      expect(safeLog(NaN)).toBe(-Infinity);
    });
  });

  describe('safeExecute', () => {
    test('should execute function and return result', () => {
      const fn = () => 42;
      expect(safeExecute(fn)).toBe(42);
    });

    test('should return fallback on error', () => {
      const fn = () => { throw new Error('Test error'); };
      expect(safeExecute(fn, 'fallback')).toBe('fallback');
      expect(safeExecute(fn)).toBe(null);
    });

    test('should execute function with context', () => {
      const obj = { value: 10 };
      const fn = function() { return this.value * 2; };
      expect(safeExecute(fn, null, obj)).toBe(20);
    });

    test('should handle function that returns undefined', () => {
      const fn = () => undefined;
      expect(safeExecute(fn, 'fallback')).toBe(undefined);
    });
  });

  describe('I2ConfidenceInterval', () => {
    test('should return zeros for k < 2', () => {
      const result = I2ConfidenceInterval(10, 1);
      expect(result.I2).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBe(0);
    });

    test('should calculate I2 correctly for valid Q and k', () => {
      const result = I2ConfidenceInterval(15, 5);
      const expectedI2 = ((15 - 4) / 15) * 100;
      expect(result.I2).toBeCloseTo(expectedI2, 2);
      expect(result.Q).toBe(15);
      expect(result.df).toBe(4);
    });

    test('should return I2 = 0 when Q <= df', () => {
      const result = I2ConfidenceInterval(3, 5);
      expect(result.I2).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBe(100);
    });

    test('should handle high heterogeneity', () => {
      const result = I2ConfidenceInterval(50, 5);
      const expectedI2 = ((50 - 4) / 50) * 100;
      expect(result.I2).toBeCloseTo(expectedI2, 2);
      expect(result.I2).toBeGreaterThan(90);
    });
  });
});

export default { safeDivide, safeSqrt, safeLog, safeExecute, I2ConfidenceInterval };
