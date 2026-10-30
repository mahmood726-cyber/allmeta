import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import M from '../../../../shared/multivariate-ma.js';

const fixture = () => JSON.parse(readFileSync(new URL('./p18-r5-reference.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../../../shared/multivariate-ma.js', import.meta.url), 'utf8');
const zeroStudies = v => Array.from({ length: 3 }, () => ({ y: [0, 0], S: [[v, 0], [0, v]] }));
const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} versus ${expected}; tolerance ${tolerance}`);
// The recorded generator ran with LF bytes; checkout line endings are not provenance.
const scriptHash = script => createHash('md5').update(script.toString().replace(/\r\n/g, '\n')).digest('hex');

test('control: P18-R5 reference records the executed R script and package version', () => {
  const ref = fixture();
  assert.ok(ref.provenance.R);
  assert.ok(ref.provenance.metafor);
  const script = readFileSync(new URL('./p18-r5-reference.R', import.meta.url));
  assert.equal(ref.provenance.script_md5, scriptHash(script));
  assert.equal(ref.cases.length, 10);
});

test('plant P18-R5 review: R provenance survives a CRLF checkout', () => {
  const lf = readFileSync(new URL('./p18-r5-reference.R', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(scriptHash(lf.replace(/\n/g, '\r\n')), fixture().provenance.script_md5);
});

test('control: LF R provenance matches and a changed calculation is detected', () => {
  const lf = readFileSync(new URL('./p18-r5-reference.R', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(scriptHash(lf), fixture().provenance.script_md5);
  const changed = lf.replace('scales <- c(1,', 'scales <- c(2,');
  assert.notEqual(changed, lf);
  assert.notEqual(scriptHash(changed), fixture().provenance.script_md5);
});

for (const v of [1, 1e-100, 1e100, 1e-200, 1e200]) {
  const kind = v === 1e-200 || v === 1e200 ? 'plant P18-R5' : 'control';
  test(`${kind}: zero-effect bivariate objective remains finite at variance ${v}`, () => {
    const studies = zeroStudies(v);
    const analytic = 2 * Math.log(v) + Math.log(3);
    near(M._objG(studies, [[0, 0], [0, 0]]), analytic, 1e-11, 'generic objective');
    near(M._obj2(studies, 0, 0, 0), analytic, 1e-11, 'bivariate objective');
  });
  test(`${kind}: correlated bivariate objective matches fresh R at scale ${v}`, () => {
    const c = fixture().cases.find(c => c.scale === v && c.shape === 'correlated');
    near(M._objG(c.studies, c.G), c.expected.objective, 1e-11, 'generic versus R');
    near(M._obj2(c.studies, c.G[0][0], c.G[0][1], c.G[1][1]), c.expected.objective, 1e-11, 'bivariate versus R');
  });
  test(`${kind}: full zero-effect fit reaches G=0 at variance ${v}`, () => {
    const fit = M.fit(zeroStudies(v));
    const ref = fixture().cases.find(c => c.scale === v && c.shape === 'zero').expected;
    assert.deepEqual(fit.G, [[0, 0], [0, 0]]);
    assert.deepEqual(fit.mu, [0, 0]);
    assert.equal(fit.optimizer.boundary, 'zero');
    assert.equal(fit.diagnostic.verdict, 'boundary maximum');
    assert.equal(fit.rho, null);
    near(fit.logLik, ref.logLik, 1e-11, 'full-fit logLik');
    for (let j = 0; j < 2; j++) {
      near(fit.muSE[j] / ref.muSE[j], 1, 1e-12, 'relative SE');
      near(fit.muVcov[j][j] / ref.muVcov[j][j], 1, 1e-12, 'relative mean variance');
    }
    assert.equal(fit.muVcov[0][1], 0);
    assert.equal(fit.muVcov[1][0], 0);
  });
}

test('control: non-positive-definite bivariate covariances remain rejected', () => {
  for (const v of [1, 1e-200, 1e200]) for (const rho of [1, 1.5]) {
    const studies = zeroStudies(v).map(s => ({ ...s, S: [[v, rho * v], [rho * v, v]] }));
    assert.equal(M._obj2(studies, 0, 0, 0), Infinity);
    assert.throws(() => M.fit(studies), /positive definite/);
  }
});

test('plant P18-R5: rank polish tolerates a failed numerical profile', () => {
  // Inject the documented _profile failure contract only in the optional rank
  // polish. The public fit must still evaluate its valid zero boundary.
  const context = { profileFailures: 0 };
  const marker = 'function _profile(studies, G) {';
  const optimizer = 'function _nelderMead(f, x0, step, maxit) {';
  assert.ok(source.includes(marker));
  assert.ok(source.includes(optimizer));
  // Force a rank-one starting point; the ordinary zero-effect optimizer can
  // otherwise skip this optional branch, making the injected failure vacuous.
  const ranked = source.replace(optimizer, `${optimizer}
    return { x: [1e-50, 1e-50, 0], f: f([1e-50, 1e-50, 0]) };`);
  runInNewContext(ranked.replace(marker, `${marker}
    if (new Error().stack.includes('rankGradient')) { globalThis.profileFailures++; return null; }`), context);
  const fit = context.AlmMultivariate.fit(zeroStudies(1e-100));
  assert.ok(context.profileFailures > 0, 'rank-profile failure was actually exercised');
  assert.deepEqual(Array.from(fit.G, r => Array.from(r)), [[0, 0], [0, 0]]);
  near(fit.logLik, -2 * Math.log(1e-100) - 2 * Math.log(2 * Math.PI), 1e-11, 'fallback fit');
});

for (const failAt of [0, 2, 3, 6]) test(`${failAt ? 'plant P18-R5' : 'control'}: rank profile failure at call ${failAt}`, () => {
  const context = { rankCalls: 0, profileFailures: 0 };
  const optimizer = 'function _nelderMead(f, x0, step, maxit) {';
  const profile = 'function _profile(studies, G) {';
  assert.ok(source.includes(optimizer) && source.includes(profile));
  // Calls 2/3 are the left/right Hessian probes; call 6 is the line search.
  const injected = source.replace(optimizer, `${optimizer}
    return { x: [0.1, 0.1, 0], f: f([0.1, 0.1, 0]) };`).replace(profile, `${profile}
    if (new Error().stack.includes('rankGradient')) {
      globalThis.rankCalls++;
      if (globalThis.rankCalls === ${failAt}) { globalThis.profileFailures++; return null; }
    }`);
  runInNewContext(injected, context);
  const fit = context.AlmMultivariate.fit(zeroStudies(1));
  assert.ok(context.rankCalls > 0, 'rank polish was exercised');
  assert.equal(context.profileFailures, failAt ? 1 : 0, 'requested profile failure was exercised');
  assert.deepEqual(Array.from(fit.G, r => Array.from(r)), [[0, 0], [0, 0]]);
  near(fit.logLik, -2 * Math.log(2 * Math.PI), 1e-11, 'fallback fit');
});

test('control: ordinary Berkey fit retains fresh metafor parity', () => {
  const ref = fixture().berkey, fit = M.fit(ref.studies);
  for (let j = 0; j < 2; j++) {
    near(fit.mu[j], ref.mu[j], 1e-6, 'Berkey mean');
    near(fit.muSE[j], ref.muSE[j], 1e-6, 'Berkey SE');
    // metafor names these matrix columns; the immutable R fixture retains them.
    for (let k = 0; k < 2; k++) near(fit.G[j][k], ref.G[j][['AL', 'PD'][k]], 1e-6, 'Berkey G');
  }
  near(fit.rho, ref.rho, 1e-6, 'Berkey rho');
  near(fit.logLik, ref.logLik, 1e-6, 'Berkey logLik');
});
