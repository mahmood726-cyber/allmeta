import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const fixture = JSON.parse(readFileSync(new URL('../fixtures/p03-dta-reference.json', import.meta.url), 'utf8'));
export const source = readFileSync(new URL('../../../../shared/dta-bivariate.js', import.meta.url), 'utf8');
export function engine(code = source) {
  const context = vm.createContext({});
  vm.runInContext(code, context);
  return context.AlmDTABivariate;
}
export const B = engine();
export function fit(ref, api = B) {
  return api.fit(ref.rows, { method: ref.method, correctionControl: ref.correction,
    ...(ref.regression ? { X: ref.X } : {}) });
}
// Absolute 1e-6 everywhere. Fail closed on missing keys, shape, null and NaN.
export function differences(actual, expected, path = '') {
  if (typeof expected === 'number') {
    return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-6
      ? [] : [{ path, actual: Number.isFinite(actual) ? actual : String(actual), expected,
        absoluteDifference: Number.isFinite(actual) ? Math.abs(actual - expected) : null }];
  }
  if (expected === null) return actual === null ? [] : [{ path, actual: String(actual), expected }];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length)
      return [{ path, actual: 'wrong array shape', expected: expected.length }];
    return expected.flatMap((v, i) => differences(actual[i], v, `${path}[${i}]`));
  }
  if (expected && typeof expected === 'object')
    return Object.entries(expected).flatMap(([k, v]) => differences(actual?.[k], v, path ? `${path}.${k}` : k));
  return actual === expected ? [] : [{ path, actual, expected }];
}
export function compare(actual, expected) { assert.deepEqual(differences(actual, expected), []); }
export function regionErrors(f, ref, api = B) {
  const result = {};
  for (const kind of ['confidence', 'prediction']) {
    const c = ref.regions[kind].covariance;
    const own = f.covMu.map((row, i) => row.map((v, j) => v + (kind === 'prediction' ? f.Psi[i][j] : 0)));
    const quadratic = (point, cov, mu) => {
      const x = Math.log(point.tpr / (1 - point.tpr)) - mu[0];
      const y = Math.log(point.fpr / (1 - point.fpr)) - mu[1];
      return (cov[1][1]*x*x - 2*cov[0][1]*x*y + cov[0][0]*y*y) /
        (cov[0][0]*cov[1][1] - cov[0][1]*cov[1][0]);
    };
    const radius = 5.991464547107979;
    result[`${kind}AppOnR`] = Math.max(...api.regionEllipse(f, kind, 100).map(p =>
      Math.abs(quadratic(p, c, ref.coef) - radius)));
    result[`${kind}ROnApp`] = Math.max(...ref.regions[kind].points.map(p =>
      Math.abs(quadratic(p, own, f.coef) - radius)));
  }
  return result;
}
export const zeroRegionErrors = { confidenceAppOnR: 0, confidenceROnApp: 0, predictionAppOnR: 0, predictionROnApp: 0 };
export function jobs(api = B) {
  const checks = [];
  for (const ref of fixture.fits.filter(f => !/^k[123]$/.test(f.dataset))) {
    if (!ref.ok) {
      checks.push({ id: `refusal/${ref.id}`, run: () => assert.throws(() => fit(ref, api), /zero cell/) });
      continue;
    }
    // Separate groups prevent a coefficient failure from hiding a ratio or region discrepancy.
    checks.push({ id: `inference/${ref.id}`, run: () => compare(fit(ref, api).coefTable, ref.coefTable) });
    if (!ref.regression) checks.push({ id: `ratios/${ref.id}`, run: () => compare(fit(ref, api), ref.ratios) });
    if (ref.dataset === 'homogeneous' || (ref.dataset === 'AuditC' && ref.method === 'fixed')) {
      checks.push({ id: `boundary/${ref.id}`, run: () => {
        const f = fit(ref, api);
        compare(f, { coef: ref.coef, vcov: ref.vcov, Psi: ref.Psi, ...ref.summary });
        compare(regionErrors(f, ref, api), zeroRegionErrors);
      } });
    }
  }
  for (const [id, ref] of Object.entries(fixture.deeks))
    checks.push({ id: `deeks/${id}`, run: () => compare(api.deeksTest(ref.rows), ref.values) });
  for (const ref of fixture.spearman)
    checks.push({ id: `spearman/${ref.id}`, run: () => compare(api.thresholdSpearman(ref.rows, { correctionControl: ref.correction }), ref.rho) });
  for (const ref of fixture.fagan)
    checks.push({ id: `fagan/${ref.pre}`, run: () => compare(api.fagan(ref.lrPos, ref.lrNeg, ref.pre), ref.values) });
  return checks;
}
