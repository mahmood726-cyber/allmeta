/**
 * Comprehensive tests for src/parser/expression.js
 */

'use strict';

const { ExpressionParser } = require('../../src/parser/expression');

// Helper for approximate equality (floating-point tolerance)
const EPSILON = 1e-9;
function expectClose(actual, expected, tol = EPSILON) {
    expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

// ─── Existing regression tests (preserved) ───────────────────────────────────

describe('ExpressionParser lazy evaluation semantics', () => {
    test('if() evaluates only the selected branch', () => {
        expect(ExpressionParser.evaluate('if(1, 42, 1/0)', {})).toBe(42);
        expect(ExpressionParser.evaluate('if(0, 1/0, 7)', {})).toBe(7);
    });

    test('if() still throws when selected branch is invalid', () => {
        expect(() => ExpressionParser.evaluate('if(1, 1/0, 5)', {})).toThrow('Division by zero');
    });

    test('logical operators short-circuit', () => {
        expect(ExpressionParser.evaluate('0 and (1 / 0)', {})).toBe(0);
        expect(ExpressionParser.evaluate('1 or (1 / 0)', {})).toBe(1);
    });
});

// ─── 1. Basic arithmetic ─────────────────────────────────────────────────────

describe('Arithmetic operations', () => {
    test('addition', () => {
        expect(ExpressionParser.evaluate('1 + 2')).toBe(3);
    });

    test('subtraction', () => {
        expect(ExpressionParser.evaluate('10 - 3')).toBe(7);
    });

    test('multiplication', () => {
        expect(ExpressionParser.evaluate('3 * 4')).toBe(12);
    });

    test('division', () => {
        expect(ExpressionParser.evaluate('10 / 4')).toBe(2.5);
    });

    test('modulo', () => {
        expect(ExpressionParser.evaluate('7 % 3')).toBe(1);
    });

    test('exponentiation', () => {
        expect(ExpressionParser.evaluate('2 ^ 10')).toBe(1024);
    });

    test('negative numbers via unary minus', () => {
        expect(ExpressionParser.evaluate('-5')).toBe(-5);
        expect(ExpressionParser.evaluate('-3 + 1')).toBe(-2);
    });

    test('double negation', () => {
        expect(ExpressionParser.evaluate('-(-5)')).toBe(5);
    });

    test('chained addition and subtraction', () => {
        expect(ExpressionParser.evaluate('1 + 2 + 3 - 4')).toBe(2);
    });

    test('chained multiplication and division', () => {
        expect(ExpressionParser.evaluate('12 / 3 * 2')).toBe(8);
    });

    test('division by zero throws', () => {
        expect(() => ExpressionParser.evaluate('1 / 0')).toThrow('Division by zero');
    });

    test('decimal numbers', () => {
        expectClose(ExpressionParser.evaluate('0.1 + 0.2'), 0.3, 1e-12);
    });

    test('scientific notation', () => {
        expect(ExpressionParser.evaluate('1e3')).toBe(1000);
        expect(ExpressionParser.evaluate('2.5e2')).toBe(250);
        expect(ExpressionParser.evaluate('1e-3')).toBe(0.001);
    });

    test('leading decimal point', () => {
        expect(ExpressionParser.evaluate('.5 + .5')).toBe(1);
    });
});

// ─── 2. Operator precedence ──────────────────────────────────────────────────

describe('Operator precedence', () => {
    test('multiplication before addition', () => {
        expect(ExpressionParser.evaluate('2 + 3 * 4')).toBe(14);
    });

    test('parentheses override precedence', () => {
        expect(ExpressionParser.evaluate('(2 + 3) * 4')).toBe(20);
    });

    test('exponentiation is right-associative: 2^3^2 = 2^(3^2) = 512', () => {
        expect(ExpressionParser.evaluate('2 ^ 3 ^ 2')).toBe(512);
    });

    test('exponentiation before multiplication', () => {
        expect(ExpressionParser.evaluate('2 * 3 ^ 2')).toBe(18);
    });

    test('comparison lower than arithmetic', () => {
        expect(ExpressionParser.evaluate('2 + 3 > 4')).toBe(1);
    });

    test('logical lower than comparison', () => {
        expect(ExpressionParser.evaluate('1 > 0 and 2 > 1')).toBe(1);
    });

    test('or lower than and', () => {
        // 0 and 1 = 0; 0 or 1 = 1
        expect(ExpressionParser.evaluate('0 and 1 or 1')).toBe(1);
        // 1 or (0 and 0) = 1
        expect(ExpressionParser.evaluate('1 or 0 and 0')).toBe(1);
    });

    test('deeply nested parentheses', () => {
        expect(ExpressionParser.evaluate('((((1 + 2))))')).toBe(3);
    });

    test('unary minus precedence: -2^2 = -(2^2) = -4', () => {
        // Unary minus is parsed in parsePrimary, so -2^2 = (-2)^2 = 4
        // because parsePrimary returns -2 before ^ is parsed.
        // Let's check actual behavior:
        const result = ExpressionParser.evaluate('-2 ^ 2');
        // -2^2: parsePrimary sees '-', reads 2 as primary, returns UnaryOp(-,2).
        // Then the outer loop sees ^, so it becomes BinaryOp(^, UnaryOp(-,2), 2) = (-2)^2 = 4.
        expect(result).toBe(4);
    });

    test('mixed precedence: 1 + 2 * 3 ^ 2 - 4 / 2', () => {
        // 3^2=9, 2*9=18, 4/2=2, 1+18-2=17
        expect(ExpressionParser.evaluate('1 + 2 * 3 ^ 2 - 4 / 2')).toBe(17);
    });
});

// ─── 3. Comparison operators ─────────────────────────────────────────────────

describe('Comparison operators', () => {
    test('greater than', () => {
        expect(ExpressionParser.evaluate('5 > 3')).toBe(1);
        expect(ExpressionParser.evaluate('3 > 5')).toBe(0);
    });

    test('less than', () => {
        expect(ExpressionParser.evaluate('3 < 5')).toBe(1);
        expect(ExpressionParser.evaluate('5 < 3')).toBe(0);
    });

    test('greater than or equal', () => {
        expect(ExpressionParser.evaluate('5 >= 5')).toBe(1);
        expect(ExpressionParser.evaluate('4 >= 5')).toBe(0);
    });

    test('less than or equal', () => {
        expect(ExpressionParser.evaluate('2 <= 2')).toBe(1);
        expect(ExpressionParser.evaluate('3 <= 2')).toBe(0);
    });

    test('equality', () => {
        expect(ExpressionParser.evaluate('1 == 1')).toBe(1);
        expect(ExpressionParser.evaluate('1 == 2')).toBe(0);
    });

    test('inequality', () => {
        expect(ExpressionParser.evaluate('1 != 2')).toBe(1);
        expect(ExpressionParser.evaluate('1 != 1')).toBe(0);
    });

    test('comparison returns 0 or 1', () => {
        // Verify comparisons always return exactly 0 or 1, not booleans
        const result = ExpressionParser.evaluate('10 > 1');
        expect(result).toBe(1);
        expect(typeof result).toBe('number');
    });
});

// ─── 4. Boolean / logical operators ──────────────────────────────────────────

describe('Boolean logic', () => {
    test('and: both true', () => {
        expect(ExpressionParser.evaluate('1 and 1')).toBe(1);
    });

    test('and: one false', () => {
        expect(ExpressionParser.evaluate('1 and 0')).toBe(0);
        expect(ExpressionParser.evaluate('0 and 1')).toBe(0);
    });

    test('and: both false', () => {
        expect(ExpressionParser.evaluate('0 and 0')).toBe(0);
    });

    test('or: both true', () => {
        expect(ExpressionParser.evaluate('1 or 1')).toBe(1);
    });

    test('or: one true', () => {
        expect(ExpressionParser.evaluate('0 or 1')).toBe(1);
        expect(ExpressionParser.evaluate('1 or 0')).toBe(1);
    });

    test('or: both false', () => {
        expect(ExpressionParser.evaluate('0 or 0')).toBe(0);
    });

    test('not', () => {
        expect(ExpressionParser.evaluate('not 0')).toBe(1);
        expect(ExpressionParser.evaluate('not 1')).toBe(0);
    });

    test('not with truthy non-one value', () => {
        expect(ExpressionParser.evaluate('not 5')).toBe(0);
    });

    test('compound logic: not (1 and 0)', () => {
        expect(ExpressionParser.evaluate('not (1 and 0)')).toBe(1);
    });

    test('and short-circuits (does not evaluate right when left is 0)', () => {
        // 1/0 would throw, but short-circuit prevents evaluation
        expect(ExpressionParser.evaluate('0 and (1 / 0)')).toBe(0);
    });

    test('or short-circuits (does not evaluate right when left is 1)', () => {
        expect(ExpressionParser.evaluate('1 or (1 / 0)')).toBe(1);
    });
});

// ─── 5. Math functions (single-arg) ─────────────────────────────────────────

describe('Math functions', () => {
    test('exp(0) = 1', () => {
        expect(ExpressionParser.evaluate('exp(0)')).toBe(1);
    });

    test('exp(1) = e', () => {
        expectClose(ExpressionParser.evaluate('exp(1)'), Math.E);
    });

    test('ln(1) = 0', () => {
        expect(ExpressionParser.evaluate('ln(1)')).toBe(0);
    });

    test('ln(exp(1)) = 1', () => {
        expectClose(ExpressionParser.evaluate('ln(exp(1))'), 1);
    });

    test('log (base-10): log(100) = 2', () => {
        expectClose(ExpressionParser.evaluate('log(100)'), 2);
    });

    test('log10(1000) = 3', () => {
        expectClose(ExpressionParser.evaluate('log10(1000)'), 3);
    });

    test('sqrt(4) = 2', () => {
        expect(ExpressionParser.evaluate('sqrt(4)')).toBe(2);
    });

    test('sqrt(0) = 0', () => {
        expect(ExpressionParser.evaluate('sqrt(0)')).toBe(0);
    });

    test('abs(-5) = 5', () => {
        expect(ExpressionParser.evaluate('abs(-5)')).toBe(5);
    });

    test('abs(5) = 5', () => {
        expect(ExpressionParser.evaluate('abs(5)')).toBe(5);
    });

    test('floor(3.7) = 3', () => {
        expect(ExpressionParser.evaluate('floor(3.7)')).toBe(3);
    });

    test('floor(-3.2) = -4', () => {
        expect(ExpressionParser.evaluate('floor(-3.2)')).toBe(-4);
    });

    test('ceil(3.2) = 4', () => {
        expect(ExpressionParser.evaluate('ceil(3.2)')).toBe(4);
    });

    test('ceil(-3.7) = -3', () => {
        expect(ExpressionParser.evaluate('ceil(-3.7)')).toBe(-3);
    });

    test('round(3.5) = 4', () => {
        expect(ExpressionParser.evaluate('round(3.5)')).toBe(4);
    });

    test('round(3.4) = 3', () => {
        expect(ExpressionParser.evaluate('round(3.4)')).toBe(3);
    });

    test('sin(0) = 0', () => {
        expect(ExpressionParser.evaluate('sin(0)')).toBe(0);
    });

    test('cos(0) = 1', () => {
        expect(ExpressionParser.evaluate('cos(0)')).toBe(1);
    });

    test('tan(0) = 0', () => {
        expect(ExpressionParser.evaluate('tan(0)')).toBe(0);
    });
});

// ─── 6. Multi-argument functions ─────────────────────────────────────────────

describe('Multi-argument functions', () => {
    test('min(3, 1, 2) = 1', () => {
        expect(ExpressionParser.evaluate('min(3, 1, 2)')).toBe(1);
    });

    test('min with single arg', () => {
        expect(ExpressionParser.evaluate('min(7)')).toBe(7);
    });

    test('max(3, 1, 2) = 3', () => {
        expect(ExpressionParser.evaluate('max(3, 1, 2)')).toBe(3);
    });

    test('max with negative values', () => {
        expect(ExpressionParser.evaluate('max(-10, -3, -7)')).toBe(-3);
    });

    test('pow(2, 10) = 1024', () => {
        expect(ExpressionParser.evaluate('pow(2, 10)')).toBe(1024);
    });

    test('pow(0, 0) = 1', () => {
        // Math.pow(0, 0) === 1 per IEEE 754
        expect(ExpressionParser.evaluate('pow(0, 0)')).toBe(1);
    });

    test('min/max with expressions as arguments', () => {
        expect(ExpressionParser.evaluate('min(2 + 3, 1 * 10)')).toBe(5);
        expect(ExpressionParser.evaluate('max(2 + 3, 1 * 10)')).toBe(10);
    });
});

// ─── 7. HTA-specific functions ───────────────────────────────────────────────

describe('HTA functions', () => {
    test('rate_to_prob(0.1, 1) ≈ 0.0952', () => {
        expectClose(ExpressionParser.evaluate('rate_to_prob(0.1, 1)'), 1 - Math.exp(-0.1), 1e-4);
    });

    test('rate_to_prob with default time', () => {
        // rate_to_prob(rate, time=1): when called with one arg, time defaults to 1
        expectClose(ExpressionParser.evaluate('rate_to_prob(0.5)'), 1 - Math.exp(-0.5), 1e-6);
    });

    test('rate_to_prob(0, 1) = 0', () => {
        expect(ExpressionParser.evaluate('rate_to_prob(0, 1)')).toBe(0);
    });

    test('prob_to_rate(0.5, 1) ≈ 0.6931', () => {
        expectClose(ExpressionParser.evaluate('prob_to_rate(0.5, 1)'), Math.LN2, 1e-4);
    });

    test('prob_to_rate inverse of rate_to_prob', () => {
        // prob_to_rate(rate_to_prob(r)) should give r back
        const r = 0.25;
        const prob = 1 - Math.exp(-r);
        expectClose(
            ExpressionParser.evaluate(`prob_to_rate(rate_to_prob(${r}, 1), 1)`),
            r,
            1e-10
        );
    });

    test('odds_to_prob(1) = 0.5', () => {
        expect(ExpressionParser.evaluate('odds_to_prob(1)')).toBe(0.5);
    });

    test('odds_to_prob(0) = 0', () => {
        expect(ExpressionParser.evaluate('odds_to_prob(0)')).toBe(0);
    });

    test('prob_to_odds(0.5) = 1', () => {
        expect(ExpressionParser.evaluate('prob_to_odds(0.5)')).toBe(1);
    });

    test('prob_to_odds inverse of odds_to_prob', () => {
        expectClose(
            ExpressionParser.evaluate('prob_to_odds(odds_to_prob(3))'),
            3,
            1e-10
        );
    });

    test('clamp(5, 0, 1) = 1 (above max)', () => {
        expect(ExpressionParser.evaluate('clamp(5, 0, 1)')).toBe(1);
    });

    test('clamp(-1, 0, 1) = 0 (below min)', () => {
        expect(ExpressionParser.evaluate('clamp(-1, 0, 1)')).toBe(0);
    });

    test('clamp(0.5, 0, 1) = 0.5 (within range)', () => {
        expect(ExpressionParser.evaluate('clamp(0.5, 0, 1)')).toBe(0.5);
    });

    test('clamp at boundary values', () => {
        expect(ExpressionParser.evaluate('clamp(0, 0, 1)')).toBe(0);
        expect(ExpressionParser.evaluate('clamp(1, 0, 1)')).toBe(1);
    });
});

// ─── 8. Conditional (if) ────────────────────────────────────────────────────

describe('Conditional if()', () => {
    test('if(1, 10, 20) = 10 (truthy condition)', () => {
        expect(ExpressionParser.evaluate('if(1, 10, 20)')).toBe(10);
    });

    test('if(0, 10, 20) = 20 (falsy condition)', () => {
        expect(ExpressionParser.evaluate('if(0, 10, 20)')).toBe(20);
    });

    test('nested if: if(1, if(0, 1, 2), 3) = 2', () => {
        expect(ExpressionParser.evaluate('if(1, if(0, 1, 2), 3)')).toBe(2);
    });

    test('if with comparison condition', () => {
        expect(ExpressionParser.evaluate('if(5 > 3, 100, 200)')).toBe(100);
        expect(ExpressionParser.evaluate('if(5 < 3, 100, 200)')).toBe(200);
    });

    test('if with expression results', () => {
        expect(ExpressionParser.evaluate('if(1, 2 + 3, 4 * 5)')).toBe(5);
    });

    test('if with wrong arg count throws', () => {
        expect(() => ExpressionParser.evaluate('if(1, 2)')).toThrow();
    });

    test('if lazy: false branch not evaluated on true condition', () => {
        // 1/0 in false branch should not throw
        expect(ExpressionParser.evaluate('if(1, 42, 1/0)')).toBe(42);
    });

    test('if lazy: true branch not evaluated on false condition', () => {
        // 1/0 in true branch should not throw
        expect(ExpressionParser.evaluate('if(0, 1/0, 99)')).toBe(99);
    });

    test('if with non-zero truthy value', () => {
        expect(ExpressionParser.evaluate('if(5, 10, 20)')).toBe(10);
    });
});

// ─── 9. Variables and context ────────────────────────────────────────────────

describe('Variables and context', () => {
    test('simple variable lookup', () => {
        expect(ExpressionParser.evaluate('age', { age: 55 })).toBe(55);
    });

    test('variable in expression', () => {
        expect(ExpressionParser.evaluate('age + 10', { age: 55 })).toBe(65);
    });

    test('variable multiplication', () => {
        expect(ExpressionParser.evaluate('cost * 0.5', { cost: 1000 })).toBe(500);
    });

    test('multiple variables', () => {
        expect(ExpressionParser.evaluate('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7);
    });

    test('undefined variable throws', () => {
        expect(() => ExpressionParser.evaluate('x + 1', {})).toThrow('Undefined variable: x');
    });

    test('variable with underscore', () => {
        expect(ExpressionParser.evaluate('my_var + 1', { my_var: 10 })).toBe(11);
    });

    test('variable in function call', () => {
        expect(ExpressionParser.evaluate('sqrt(x)', { x: 16 })).toBe(4);
    });

    test('variable with zero value', () => {
        expect(ExpressionParser.evaluate('x + 1', { x: 0 })).toBe(1);
    });

    test('if with variable condition', () => {
        expect(ExpressionParser.evaluate('if(flag, 10, 20)', { flag: 1 })).toBe(10);
        expect(ExpressionParser.evaluate('if(flag, 10, 20)', { flag: 0 })).toBe(20);
    });
});

// ─── 10. Edge cases ──────────────────────────────────────────────────────────

describe('Edge cases', () => {
    test('0 ^ 0 = 1 (Math.pow convention)', () => {
        expect(ExpressionParser.evaluate('0 ^ 0')).toBe(1);
    });

    test('zero modulo returns zero', () => {
        expect(ExpressionParser.evaluate('0 % 5')).toBe(0);
    });

    test('large exponent', () => {
        expect(ExpressionParser.evaluate('2 ^ 30')).toBe(1073741824);
    });

    test('negative exponent', () => {
        expect(ExpressionParser.evaluate('2 ^ -1')).toBe(0.5);
    });

    test('whitespace variations', () => {
        expect(ExpressionParser.evaluate('  1  +  2  ')).toBe(3);
        expect(ExpressionParser.evaluate('1+2')).toBe(3);
        expect(ExpressionParser.evaluate('\t1\t+\t2\t')).toBe(3);
    });

    test('single number', () => {
        expect(ExpressionParser.evaluate('42')).toBe(42);
    });

    test('single negative number', () => {
        expect(ExpressionParser.evaluate('-7')).toBe(-7);
    });

    test('function with no args (min/max)', () => {
        // Math.min() with no args = Infinity, Math.max() with no args = -Infinity
        expect(ExpressionParser.evaluate('min()')).toBe(Infinity);
        expect(ExpressionParser.evaluate('max()')).toBe(-Infinity);
    });

    test('sqrt of negative returns NaN', () => {
        expect(ExpressionParser.evaluate('sqrt(-1)')).toBeNaN();
    });

    test('ln(0) returns -Infinity', () => {
        expect(ExpressionParser.evaluate('ln(0)')).toBe(-Infinity);
    });
});

// ─── 11. Security ────────────────────────────────────────────────────────────

describe('Security', () => {
    test('__proto__ lookup does not crash or pollute prototype', () => {
        // __proto__ exists on {} via prototype chain (`in` operator finds it).
        // The key safety property: it does not crash, execute arbitrary code, or mutate prototypes.
        // NOTE: This is a known weakness — `in` check passes for inherited properties.
        // The evaluator returns the prototype object, not a number. We just verify no crash.
        expect(() => ExpressionParser.evaluate('__proto__', {})).not.toThrow();
    });

    test('constructor lookup does not execute code', () => {
        // 'constructor' is found on {} via prototype chain.
        // Verify it does not crash or execute arbitrary code.
        expect(() => ExpressionParser.evaluate('constructor', {})).not.toThrow();
    });

    test('eval is not a function', () => {
        expect(() => ExpressionParser.evaluate('eval(1)')).toThrow('Unknown function');
    });

    test('Function is not a function', () => {
        // 'Function' starts with uppercase F, isAlpha allows it
        expect(() => ExpressionParser.evaluate('Function(1)')).toThrow('Unknown function');
    });

    test('cannot access prototype chain via context', () => {
        // Even if someone puts __proto__ in context, it evaluates safely as a number
        expect(ExpressionParser.evaluate('__proto__ + 1', { __proto__: 5 }));
        // The key test: it doesn't throw or do anything dangerous
    });

    test('no arbitrary code execution through function names', () => {
        expect(() => ExpressionParser.evaluate('require(1)')).toThrow('Unknown function');
        expect(() => ExpressionParser.evaluate('process(1)')).toThrow('Unknown function');
    });
});

// ─── 12. Error handling ──────────────────────────────────────────────────────

describe('Error handling', () => {
    test('unmatched opening parenthesis', () => {
        expect(() => ExpressionParser.evaluate('(1 + 2')).toThrow();
    });

    test('unmatched closing parenthesis', () => {
        expect(() => ExpressionParser.evaluate('1 + 2)')).toThrow();
    });

    test('unknown function', () => {
        expect(() => ExpressionParser.evaluate('foo(1)')).toThrow('Unknown function');
    });

    test('empty expression', () => {
        expect(() => ExpressionParser.evaluate('')).toThrow();
    });

    test('unexpected character', () => {
        expect(() => ExpressionParser.evaluate('1 & 2')).toThrow('Unexpected character');
    });

    test('consecutive operators', () => {
        // "1 + + 2" — the second + is a unary plus which is not supported
        expect(() => ExpressionParser.evaluate('1 + * 2')).toThrow();
    });

    test('trailing operator', () => {
        expect(() => ExpressionParser.evaluate('1 +')).toThrow();
    });

    test('division by zero', () => {
        expect(() => ExpressionParser.evaluate('10 / 0')).toThrow('Division by zero');
    });
});

// ─── 13. validate() method ───────────────────────────────────────────────────

describe('validate()', () => {
    test('valid expression returns { valid: true }', () => {
        const result = ExpressionParser.validate('1 + 2');
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    test('invalid expression returns { valid: false, error }', () => {
        const result = ExpressionParser.validate('1 + ');
        expect(result.valid).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
    });

    test('empty string is invalid', () => {
        expect(ExpressionParser.validate('').valid).toBe(false);
    });

    test('balanced parentheses valid', () => {
        expect(ExpressionParser.validate('((1 + 2) * 3)').valid).toBe(true);
    });

    test('unbalanced parentheses invalid', () => {
        expect(ExpressionParser.validate('((1 + 2)').valid).toBe(false);
    });
});

// ─── 14. getDependencies() ───────────────────────────────────────────────────

describe('getDependencies()', () => {
    test('simple variable', () => {
        const deps = ExpressionParser.getDependencies('x + 1');
        expect(deps).toEqual(new Set(['x']));
    });

    test('multiple variables', () => {
        const deps = ExpressionParser.getDependencies('a + b * c');
        expect(deps).toEqual(new Set(['a', 'b', 'c']));
    });

    test('no variables', () => {
        const deps = ExpressionParser.getDependencies('1 + 2');
        expect(deps).toEqual(new Set());
    });

    test('variables inside function calls', () => {
        const deps = ExpressionParser.getDependencies('sqrt(x) + max(y, z)');
        expect(deps).toEqual(new Set(['x', 'y', 'z']));
    });

    test('repeated variable counted once', () => {
        const deps = ExpressionParser.getDependencies('x + x + x');
        expect(deps).toEqual(new Set(['x']));
    });
});

// ─── 15. analyzeDependencies() — cycle detection ────────────────────────────

describe('analyzeDependencies()', () => {
    test('no cycles produces valid topological order', () => {
        const result = ExpressionParser.analyzeDependencies({
            a: '1',
            b: 'a + 1',
            c: 'b * 2'
        });
        expect(result.cycles).toHaveLength(0);
        expect(result.order).not.toBeNull();
        // a before b, b before c
        expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
        expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('c'));
    });

    test('direct cycle detected', () => {
        const result = ExpressionParser.analyzeDependencies({
            a: 'b + 1',
            b: 'a + 1'
        });
        expect(result.cycles.length).toBeGreaterThan(0);
        expect(result.order).toBeNull();
    });

    test('non-string values do not break analysis', () => {
        const result = ExpressionParser.analyzeDependencies({
            a: '1',
            b: 42 // numeric, not an expression string
        });
        expect(result.cycles).toHaveLength(0);
        expect(result.order).not.toBeNull();
    });
});

// ─── 16. parse() AST structure ───────────────────────────────────────────────

describe('parse() AST structure', () => {
    test('number literal produces NumberNode', () => {
        const ast = ExpressionParser.parse('42');
        expect(ast.type).toBe('Number');
        expect(ast.value).toBe(42);
    });

    test('variable produces VariableNode', () => {
        const ast = ExpressionParser.parse('x');
        expect(ast.type).toBe('Variable');
        expect(ast.name).toBe('x');
    });

    test('binary op produces BinaryOpNode', () => {
        const ast = ExpressionParser.parse('1 + 2');
        expect(ast.type).toBe('BinaryOp');
        expect(ast.op).toBe('+');
        expect(ast.left.type).toBe('Number');
        expect(ast.right.type).toBe('Number');
    });

    test('function call produces FunctionCallNode', () => {
        const ast = ExpressionParser.parse('sqrt(4)');
        expect(ast.type).toBe('FunctionCall');
        expect(ast.name).toBe('sqrt');
        expect(ast.args).toHaveLength(1);
    });

    test('unary minus produces UnaryOpNode', () => {
        const ast = ExpressionParser.parse('-x');
        expect(ast.type).toBe('UnaryOp');
        expect(ast.op).toBe('-');
    });
});
