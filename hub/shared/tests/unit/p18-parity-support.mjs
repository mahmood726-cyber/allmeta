import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const inputURL = new URL('../r/p18-input.json', import.meta.url);
export const scriptURL = new URL('../r/p18-reference.R', import.meta.url);
export const inputBytes = readFileSync(inputURL);
export const input = JSON.parse(inputBytes);
export const fixtureURL = new URL('../r/p18-reference.json', import.meta.url);
export const originalReference = JSON.parse(readFileSync(fixtureURL, 'utf8'));
export const supplementScriptURL = new URL('../r/p18-reference-bfgs.R', import.meta.url);
const supplementURL = new URL('../r/p18-reference-bfgs.json', import.meta.url);
// Exact bytes retained from the successful native-R run; no temporary-file dependency.
export const supplement = JSON.parse(readFileSync(supplementURL, 'utf8'));
// Never replace a numerical reference. The original errors remain in the fixture.
export function resolveReference(original, extra) {
  return original.status === 'ok' ? original : extra;
}
export const reference = { ...originalReference,
  cases: originalReference.cases.map(c => ({ ...c, multivariate: resolveReference(c.multivariate,
    supplement.cases.find(s => s.id === c.id).multivariate) })),
  sweep: originalReference.sweep.map(s => ({ ...s, multivariate: resolveReference(s.multivariate,
    supplement.sweep.find(x => x.rhoW === s.rhoW).multivariate) }))
};
export const source = readFileSync(new URL('../../../../shared/multivariate-ma.js', import.meta.url), 'utf8');
export const plusSource = readFileSync(new URL('../../../../multivariate-ma/plus.js', import.meta.url), 'utf8');
export const tolerance = 1e-6; // Absolute for every numerical field, including iterative estimates.
export function load(engineText = source, panelText = plusSource) {
  const ctx = vm.createContext({});
  vm.runInContext(engineText, ctx);
  vm.runInContext(panelText, ctx);
  return { engine: ctx.AlmMultivariate, plus: ctx.AlmMvPlus };
}
export const app = load();
export function parsed(studies) {
  return { mode: 'cov', rhoW: null, outcomes: ['A', 'B'], omitted: [],
    rows: studies.map((s, i) => ({ line: i + 1, label: `s${i + 1}`, y: s.y.slice(),
      v: [s.S[0][0], s.S[1][1]], cov: s.S[0][1] })) };
}
export function multivariate(f, api = app) {
  const tests = f.mu.map((m, j) => api.engine.zTest(m, f.muSE[j]));
  return { ...f, z: tests.map(t => t.z), p: tests.map(t => t.p),
    // The engine exposes means/SEs; the panel's exported Z is the actual CI multiplier.
    // Oracle endpoints below are taken directly from metafor's ci.lb / ci.ub.
    ciLo: f.mu.map((m, j) => m - api.plus.Z * f.muSE[j]),
    ciHi: f.mu.map((m, j) => m + api.plus.Z * f.muSE[j]) };
}
export function univariate(u, api = app) {
  const t = api.engine.zTest(u.mu, u.se);
  return { ...u, z: t.z, p: t.p, ciLo: u.mu - api.plus.Z * u.se, ciHi: u.mu + api.plus.Z * u.se };
}
export function differences(actual, expected, label = '') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return [{ label, actual, expected, reason: 'shape' }];
    return expected.flatMap((x, i) => differences(actual[i], x, `${label}[${i}]`));
  }
  const diff = typeof actual === 'number' && typeof expected === 'number' ? Math.abs(actual - expected) : Infinity;
  return Number.isFinite(actual) && Number.isFinite(expected) && diff <= tolerance
    ? [] : [{ label, actual, expected, diff }];
}
export function compare(actual, expected, keys, label) {
  const failures = keys.flatMap(k => differences(actual[k], expected[k], `${label}.${k}`));
  assert.deepEqual(failures, [], `${label}: absolute R-parity tolerance ${tolerance}`);
}
export const groups = {
  estimates: ['mu', 'muSE', 'muVcov'], covariance: ['G'], likelihood: ['logLik'],
  statistics: ['z', 'p'], intervals: ['ciLo', 'ciHi']
};
export function refFor(id) {
  const r = reference.cases.find(c => c.id === id);
  assert.ok(r, `Missing R case ${id}`);
  return r;
}
export function replaceOnce(text, old, replacement) {
  assert.equal(text.split(old).length, 2, `Mutation anchor must be unique: ${old}`);
  return text.replace(old, replacement);
}
