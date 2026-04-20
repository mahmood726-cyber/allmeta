/**
 * Node.js Test Suite for NMA Dose-Response App
 * Tests JavaScript functions directly without browser
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';

console.log('='.repeat(70));
console.log('NMA DOSE-RESPONSE APP - NODE.JS TEST SUITE');
console.log('='.repeat(70));

// Read the app.js file
const appCode = fs.readFileSync('app.js', 'utf8');

// Create a mock DOM environment
const mockDOM = {
  getElementById: () => ({
    textContent: '',
    value: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild: () => {} }),
  body: { appendChild: () => {} }
};

// Create sandbox context
const sandbox = {
  console,
  Math,
  Number,
  Array,
  Object,
  JSON,
  Date,
  Error,
  TypeError,
  RangeError,
  Infinity,
  NaN,
  isNaN,
  isFinite,
  parseInt,
  parseFloat,
  setTimeout: () => {},
  setInterval: () => {},
  clearTimeout: () => {},
  clearInterval: () => {},
  document: mockDOM,
  window: {},
  navigator: { userAgent: 'Node.js' },
  location: { hash: '' },
  history: { pushState: () => {} },
  fetch: () => Promise.resolve({ ok: false }),
  WebAssembly: { instantiate: () => Promise.reject('No WASM in Node') },
  Worker: function() { this.postMessage = () => {}; this.terminate = () => {}; },
  Blob: function() {},
  URL: { createObjectURL: () => '' },
  Intl: globalThis.Intl,
  atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
  btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
  requestAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '' })
};

// Make window reference itself
sandbox.window = sandbox;

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    errors.push({ name, error: e.message });
    failed++;
  }
}

function assertEqual(actual, expected, tolerance = 0.001) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  } else if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertExists(obj, name) {
  if (typeof obj === 'undefined') {
    throw new Error(`${name} is undefined`);
  }
}

try {
  // Execute app code in sandbox
  console.log('\nLoading app.js...');
  vm.createContext(sandbox);
  vm.runInContext(appCode, sandbox, {
    timeout: 10000,
    importModuleDynamically: async (specifier) => import(specifier)
  });
  console.log('App loaded successfully!\n');

  // Test 1: Core Classes Exist
  console.log('--- Test 1: Core Classes ---');
  const classesToTest = [
    'StatUtils', 'ValidationSuite', 'BootstrapCI', 'InfluenceDiagnostics',
    'ModelFitStatistics', 'EdgeCaseHandler', 'TrimAndFill', 'EggerTest',
    'REMLEstimator', 'BeggMazumdarTest', 'PetersTest', 'PETPEESE'
  ];

  for (const cls of classesToTest) {
    test(`${cls} exists`, () => assertExists(sandbox.window[cls], cls));
  }

  // Test 2: StatUtils Functions
  console.log('\n--- Test 2: StatUtils Functions ---');
  const StatUtils = sandbox.window.StatUtils;

  if (StatUtils) {
    test('normalCDF(0) = 0.5', () => assertEqual(StatUtils.normalCDF(0), 0.5));
    test('normalCDF(1.96) ≈ 0.975', () => assertEqual(StatUtils.normalCDF(1.96), 0.975, 0.01));
    test('normalQuantile(0.5) = 0', () => assertEqual(StatUtils.normalQuantile(0.5), 0, 0.001));
    test('normalQuantile(0.975) ≈ 1.96', () => assertEqual(StatUtils.normalQuantile(0.975), 1.96, 0.01));

    if (StatUtils.tCDF) {
      test('tCDF(0, 10) = 0.5', () => assertEqual(StatUtils.tCDF(0, 10), 0.5, 0.001));
    }

    if (StatUtils.chiSquareCDF) {
      test('chiSquareCDF(10, 5) ≈ 0.925', () => assertEqual(StatUtils.chiSquareCDF(10, 5), 0.925, 0.05));
    }

    if (StatUtils.safeDivide) {
      test('safeDivide(10, 2) = 5', () => assertEqual(StatUtils.safeDivide(10, 2), 5));
      test('safeDivide(10, 0) = 0', () => assertEqual(StatUtils.safeDivide(10, 0), 0));
    }
  }

  // Test 3: Meta-Analysis Classes
  console.log('\n--- Test 3: Meta-Analysis Classes ---');

  const effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
  const ses = [0.1, 0.15, 0.12, 0.11, 0.13];

  // Test BootstrapCI
  if (sandbox.window.BootstrapCI) {
    test('BootstrapCI runs', () => {
      const boot = new sandbox.window.BootstrapCI(effects, ses, { nBoot: 50 });
      const result = boot.run();
      assertExists(result.effect, 'effect');
      assertExists(result.ci, 'ci');
    });
  }

  // Test InfluenceDiagnostics
  if (sandbox.window.InfluenceDiagnostics) {
    test('InfluenceDiagnostics runs', () => {
      const infl = new sandbox.window.InfluenceDiagnostics(effects, ses);
      const result = infl.run();
      assertExists(result.cooksDistance, 'cooksDistance');
    });
  }

  // Test ModelFitStatistics
  if (sandbox.window.ModelFitStatistics) {
    test('ModelFitStatistics runs', () => {
      const mfs = new sandbox.window.ModelFitStatistics(effects, ses);
      const result = mfs.run();
      assertExists(result.fixed, 'fixed');
      assertExists(result.random, 'random');
    });
  }

  // Test TrimAndFill
  if (sandbox.window.TrimAndFill) {
    test('TrimAndFill runs', () => {
      const tf = new sandbox.window.TrimAndFill(effects, ses);
      const result = tf.run();
      assertExists(result, 'result');
    });
  }

  // Test EggerTest
  if (sandbox.window.EggerTest) {
    test('EggerTest runs', () => {
      const egger = new sandbox.window.EggerTest(effects, ses);
      const result = egger.run();
      assertExists(result.intercept, 'intercept');
    });
  }

  // Test 4: ValidationSuite
  console.log('\n--- Test 4: ValidationSuite ---');
  if (sandbox.window.ValidationSuite) {
    test('ValidationSuite.validateDL passes', () => {
      const result = sandbox.window.ValidationSuite.validateDL();
      if (!result.passed) {
        throw new Error(`Validation failed: computed=${JSON.stringify(result.computed)}`);
      }
    });
  }

  // Test 5: EdgeCaseHandler
  console.log('\n--- Test 5: EdgeCaseHandler ---');
  if (sandbox.window.EdgeCaseHandler) {
    test('EdgeCaseHandler.validatePaired works', () => {
      const result = sandbox.window.EdgeCaseHandler.validatePaired(effects, ses);
      if (!result.valid) {
        throw new Error(result.error);
      }
    });

    test('EdgeCaseHandler rejects invalid input', () => {
      const result = sandbox.window.EdgeCaseHandler.validatePaired([1], [0.1]);
      if (result.valid) {
        throw new Error('Should reject single study');
      }
    });
  }

} catch (e) {
  console.log(`\nFATAL ERROR: ${e.message}`);
  if (e.stack) {
    console.log(e.stack.split('\n').slice(0, 5).join('\n'));
  }
  failed++;
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`\nPASSED: ${passed}`);
console.log(`FAILED: ${failed}`);

if (errors.length > 0) {
  console.log('\nERRORS:');
  errors.forEach(e => console.log(`  X ${e.name}: ${e.error}`));
}

console.log('\n' + '='.repeat(70));
if (failed === 0) {
  console.log('RESULT: ALL TESTS PASSED!');
} else {
  console.log(`RESULT: ${failed} TESTS FAILED`);
}
console.log('='.repeat(70));

// Save results
fs.writeFileSync('node_test_results.json', JSON.stringify({ passed, failed, errors }, null, 2));
