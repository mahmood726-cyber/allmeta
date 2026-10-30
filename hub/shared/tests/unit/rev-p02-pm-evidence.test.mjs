// Replay the unchanged assertion bodies with only the PM implementation replaced.
// The saved PM body was captured from the supplied head; the capped solver is a deliberate
// defect injection, NOT a claim to possess the unavailable pre-PR source tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { tolerance } from '../_dr_parity_check.mjs';

const root = new URL('../../../../', import.meta.url);
const read = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const engine = read(new URL('shared/ma-core.js', root));
const doseEngine = read(new URL('shared/dose-response.js', root));
const saved = JSON.parse(read(new URL('./rev-p02-pm-head.json', import.meta.url)));
const savedSource = saved.source.replace(/\r\n/g, '\n');

function withPM(source) {
  const start = engine.indexOf('  function tau2PM(yi, vi) {');
  const end = engine.indexOf('  // (Restricted) profile log-likelihood', start);
  assert.ok(start >= 0 && end > start, 'PM replacement boundaries must exist');
  return engine.slice(0, start) + source + engine.slice(end);
}

function replay(source, testFile) {
  const outcomes = [];
  const context = vm.createContext({ assert, readFileSync, URL, tolerance,
    test(name, body) {
      try { body(); outcomes.push({ name, passed: true }); }
      catch (error) { outcomes.push({ name, passed: false, error: error.name + ': ' + error.message }); }
    },
    createRequire() {
      return name => {
        if (name === '../../../../shared/ma-core.js') return context.AlmMaCore;
        if (name === '../../../../shared/dose-response.js') return context.AlmDoseResponse;
        throw new Error('Unexpected replay import: ' + name);
      };
    },
  });
  vm.runInContext(source, context, { filename: 'shared/ma-core.js' });
  vm.runInContext(doseEngine, context, { filename: 'shared/dose-response.js' });
  const testURL = new URL(testFile, import.meta.url);
  // These two synchronous suites have only single-line static imports. Supply
  // their original dependencies above and keep every assertion body untouched.
  const assertions = read(testURL).replace(/^import .*;\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(testURL.href));
  vm.runInContext(assertions, context, { filename: testFile });
  return outcomes;
}

function expectOutcomes(t, outcomes, count, expectedFailures) {
  for (const result of outcomes) t.diagnostic(
    (result.passed ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ' | ' + result.error : ''));
  assert.equal(outcomes.length, count, 'every unchanged assertion body must run');
  assert.deepEqual(outcomes.filter(r => !r.passed).map(r => r.name), expectedFailures);
}

test('evidence P02-R2: saved PR-head LF hash and four observed overflow failures', t => {
  assert.equal(createHash('sha256').update(savedSource).digest('hex'), saved.sha256);
  expectOutcomes(t, replay(withPM(savedSource), './rev-p02-pm-overflow.test.mjs'), 8, [
    'plant P02-R2: PM preserves a representable root when initial weighted effects overflow',
    'plant P02-R2: EB preserves a representable root when initial weighted effects overflow',
    'plant P02-R2: PM preserves a zero root when weighted products overflow',
    'plant P02-R2: PM evaluates an overflowing upper-endpoint variance sum',
  ]);
});

// Reintroduce the documented source defect: start at unit variance, stop growth
// at a fixed cap, and return an endpoint without establishing a Q bracket.
const cappedPlant = `  function tau2PM(yi, vi) {
    var df = yi.length - 1; if (df < 1) return 0;
    if (_wsums(yi, vi, 0).Q <= df) return 0;
    var lo = 0, hi = 1;
    while (_wsums(yi, vi, hi).Q > df && hi < 1e6) hi *= 2;
    for (var i = 0; i < 80; i++) {
      var m = (lo + hi) / 2;
      if (_wsums(yi, vi, m).Q > df) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

`;

test('evidence P02-R1: capped-search plant fails all six regressions including small-dose R parity', t => {
  expectOutcomes(t, replay(withPM(cappedPlant), './rev-p02-pm.test.mjs'), 11, [
    'plant P02-R1: changing dose units preserves prediction uncertainty',
    'plant P02-R1: small-dose PM solves Q rather than returning the search cap',
    'plant P02-R1: unequal-variance PM is equivariant at effect scale 1000000',
    'plant P02-R1: unequal-variance PM is equivariant at effect scale 1e-40',
    'plant P02-R1: PM refuses an unrepresentable finite bracket',
    'plant P02-R1: dose prediction matches metafor at dose scale 0.00001',
  ]);
});

test('evidence P02-R1/R2: current engine passes the same 19 assertion bodies', t => {
  expectOutcomes(t, replay(engine, './rev-p02-pm.test.mjs'), 11, []);
  expectOutcomes(t, replay(engine, './rev-p02-pm-overflow.test.mjs'), 8, []);
});
