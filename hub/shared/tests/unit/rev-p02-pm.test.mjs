import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { tolerance } from '../_dr_parity_check.mjs';

const require = createRequire(import.meta.url);
const core = require('../../../../shared/ma-core.js');
const dr = require('../../../../shared/dose-response.js');

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual} (absolute tolerance ${tolerance})`);
}

function generalisedQ(yi, vi, tau2) {
  const weights = vi.map(v => 1 / (v + tau2));
  const mean = weights.reduce((s, w, i) => s + w * yi[i], 0)
    / weights.reduce((s, w) => s + w, 0);
  return weights.reduce((s, w, i) => s + w * (yi[i] - mean) ** 2, 0);
}

function doseFit(scale) {
  // One non-reference dose per study: GLS slope = logRR / dose,
  // variance = SE^2 / dose^2, independently of covariance reconstruction.
  const studies = [-1, 0, 1].map(logrr => [
    { dose: 0, cases: 100, n: 1000, logrr: 0, se: null },
    { dose: scale, cases: 100, n: 1000, logrr, se: 0.1 },
  ]);
  const fit = dr.fit(studies, { method: 'PM' });
  assert.equal(fit.k, 3);
  return fit;
}

test('control P02-R1: ordinary-dose PM solves the Q equation', () => {
  const fit = doseFit(1);
  close(fit.tau2, 1 - 0.1 ** 2);
  close(fit.se, Math.sqrt(1 / 3));
  close(generalisedQ(fit.perStudy.map(p => p.beta),
    fit.perStudy.map(p => p.varBeta), fit.tau2), 2);
});

test('plant P02-R1: changing dose units preserves prediction uncertainty', () => {
  const ordinary = doseFit(1);
  const scale = 1e-5;
  const scaled = doseFit(scale);
  // The app predicts at the corresponding physical dose: abs(dose) * slope SE.
  close(scale * scaled.se, ordinary.se);
  close(scale * scaled.slope, ordinary.slope);
  close(scale * scaled.ciLo, ordinary.ciLo);
  close(scale * scaled.ciHi, ordinary.ciHi);
});

test('plant P02-R1: small-dose PM solves Q rather than returning the search cap', () => {
  const fit = doseFit(1e-5);
  const q = generalisedQ(fit.perStudy.map(p => p.beta),
    fit.perStudy.map(p => p.varBeta), fit.tau2);
  close(q, fit.k - 1);
  close(fit.tau2 * 1e-10, 1 - 0.1 ** 2);
});

const yi = [0.10, 0.30, 0.50, 0.20, 0.90, 0.40, 1.10, 0.05];
const vi = [0.20, 0.25, 0.18, 0.30, 0.22, 0.28, 0.35, 0.15].map(s => s * s);

test('control P02-R1: unequal-variance PM solves the Q equation', () => {
  const fit = core.pool(yi, vi, { method: 'PM' });
  assert.ok(fit.tau2 > 0);
  close(generalisedQ(yi, vi, fit.tau2), yi.length - 1);
});

for (const scale of [1e6, 1e-40]) {
  test(`plant P02-R1: unequal-variance PM is equivariant at effect scale ${scale}`, () => {
    const ordinary = core.pool(yi, vi, { method: 'PM' });
    const y = yi.map(v => v * scale), v = vi.map(v => v * scale * scale);
    const scaled = core.pool(y, v, { method: 'PM' });
    close(scaled.tau2 / scale / scale, ordinary.tau2);
    close(scaled.mu / scale, ordinary.mu);
    close(scaled.se / scale, ordinary.se);
    close(generalisedQ(y, v, scaled.tau2), yi.length - 1);
  });
}

test('plant P02-R1: PM refuses an unrepresentable finite bracket', () => {
  // Finite inputs, but the variance needed to solve Q = 2 exceeds Number.MAX_VALUE.
  assert.throws(() => core.tau2PM([-1e308, 0, 1e308], [1, 1, 1]),
    { name: 'RangeError', message: /PM.*bracket/ });
});

test('control P02-R1: PM retains zero heterogeneity and single-study boundaries', () => {
  assert.equal(core.tau2PM([0.2, 0.21, 0.19], [0.04, 0.04, 0.04]), 0);
  assert.equal(core.tau2PM([0.2], [0.04]), 0);
  assert.equal(core.tau2PM([], []), 0);
});

// Actual stdout from rev-p02-pm-reference.R in pass 1, including R/package versions.
const reference = JSON.parse(readFileSync(new URL('./rev-p02-pm-reference.json', import.meta.url), 'utf8'));
for (const ref of reference.cases.filter(c => c.id.startsWith('dose-'))) {
  const role = ref.doseScale === 1 ? 'control' : 'plant';
  test(`${role} P02-R1: dose prediction matches metafor at dose scale ${ref.doseScale}`, () => {
    const fit = doseFit(ref.doseScale);
    // Same prediction error metric and unchanged PM tolerance as the parity helper.
    const error = Math.abs(ref.doseScale * fit.slope - ref.doseScale * ref.mu)
      + Math.abs(ref.doseScale * fit.se - ref.predictionSE);
    close(error / ref.predictionSE, 0, tolerance({ method: 'PM', proc: '2stage' }).pred);
  });
}

test('control P02-R1: unequal-variance PM matches recorded metafor', () => {
  const ref = reference.cases.find(c => c.id === 'unequal-variance');
  const fit = core.pool(ref.yi, ref.vi, { method: 'PM' });
  // Existing ma-core-parity.spec.mjs PM limits: toBeCloseTo(..., 4/5/5).
  // R's default uniroot tolerance leaves Q slightly above df in this case;
  // the exact Q-equation assertion above independently checks our root.
  close(fit.tau2, ref.tau2, 5e-5);
  close(fit.mu, ref.mu, 5e-6);
  close(fit.se, ref.se, 5e-6);
});
