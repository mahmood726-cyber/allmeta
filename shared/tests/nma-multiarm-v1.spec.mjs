/*
 * nma-multiarm-v1.spec.mjs — netmeta-gated parity for the multi-arm /
 * shared-control correction in shared/nma-multiarm-v1.js.
 *
 * Ground truth was generated with R netmeta::netmeta() on arm-level binary
 * data (see /tmp benchmark scripts in the commit message). The contrast rows
 * fed to fit() are produced by the REAL bus path
 * (MaComparisons.buildEnvelope → toContrasts), so this also exercises the
 * end-to-end extract→NMA wiring numerically.
 *
 * Run: node --test shared/tests/nma-multiarm-v1.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MC = require('../ma-comparisons-v1.js');
const NM = require('../nma-multiarm-v1.js');

const TOL = 1e-6;

// Arm-level fixture → ma-comparisons studies (one has a genuine 3-arm trial).
function studiesFrom(arms) {
  const byStudy = {};
  for (const a of arms) {
    (byStudy[a.study] = byStudy[a.study] || { id: a.study, arms: [] }).arms.push({ treatment: a.treatment, events: a.event, n: a.n });
  }
  return Object.values(byStudy);
}

// --- Fixture 1: consistent network, netmeta τ²=0 -------------------------
const FIX1 = [
  { study: 'S1', treatment: 'A', event: 10, n: 100 }, { study: 'S1', treatment: 'B', event: 20, n: 100 },
  { study: 'S2', treatment: 'A', event: 12, n: 120 }, { study: 'S2', treatment: 'B', event: 18, n: 110 },
  { study: 'S3', treatment: 'A', event: 8, n: 90 },   { study: 'S3', treatment: 'C', event: 15, n: 95 },
  { study: 'S4', treatment: 'A', event: 11, n: 100 }, { study: 'S4', treatment: 'C', event: 14, n: 100 },
  { study: 'S5', treatment: 'B', event: 9, n: 80 },   { study: 'S5', treatment: 'C', event: 13, n: 85 },
  { study: 'S6', treatment: 'A', event: 15, n: 150 }, { study: 'S6', treatment: 'B', event: 25, n: 150 }, { study: 'S6', treatment: 'C', event: 20, n: 150 },
];
const EXP1_FE = { B: { TE: 0.5925559659, se: 0.2043271463 }, C: { TE: 0.4841298055, se: 0.2155057123 } };

// --- Fixture 2: heterogeneous network, netmeta τ²>0 ----------------------
const FIX2 = [
  { study: 'S1', treatment: 'A', event: 10, n: 100 }, { study: 'S1', treatment: 'B', event: 30, n: 100 },
  { study: 'S2', treatment: 'A', event: 25, n: 120 }, { study: 'S2', treatment: 'B', event: 18, n: 110 },
  { study: 'S3', treatment: 'A', event: 8, n: 90 },   { study: 'S3', treatment: 'C', event: 25, n: 95 },
  { study: 'S4', treatment: 'A', event: 22, n: 100 }, { study: 'S4', treatment: 'C', event: 14, n: 100 },
  { study: 'S5', treatment: 'B', event: 9, n: 80 },   { study: 'S5', treatment: 'C', event: 30, n: 85 },
  { study: 'S6', treatment: 'A', event: 15, n: 150 }, { study: 'S6', treatment: 'B', event: 25, n: 150 }, { study: 'S6', treatment: 'C', event: 12, n: 150 },
  { study: 'S7', treatment: 'A', event: 40, n: 200 }, { study: 'S7', treatment: 'B', event: 20, n: 180 },
];
const EXP2_FE = { B: { TE: 0.0038784945, se: 0.1604752859 }, C: { TE: 0.2341504618, se: 0.2056420348 } };
const EXP2_RE = { tau2: 0.8921998165, Q: 45.1375162628, df: 6, B: { TE: 0.0805775134, se: 0.4660587911 }, C: { TE: 0.3584933242, se: 0.5262952049 } };

function rowsFor(fixture) {
  const env = MC.buildEnvelope(studiesFrom(fixture), 'OR');
  // toContrasts emits {study, treatment1, treatment2, te, se, design}; map to fit() shape.
  return MC.toContrasts(env).map((c) => ({ study: c.study, t1: c.treatment2, t2: c.treatment1, est: c.te, se: c.se }));
  // note: toContrasts te is (treatment1 - treatment2); our fit wants est = t2 - t1, so t1<-treatment2, t2<-treatment1 keeps est = treatment1 - treatment2 ✓
}

function dOf(fit, t) { const k = fit.nonref.indexOf(t); return { TE: fit.d[k], se: Math.sqrt(fit.cov[k][k]) }; }

test('FE matches netmeta to 1e-6 (consistent multi-arm network)', () => {
  const fit = NM.fit(rowsFor(FIX1), { ref: 'A', model: 'fe' });
  assert.ok(fit.ok, fit.error);
  assert.deepEqual(fit.multiArmStudies, ['S6']);
  for (const t of ['B', 'C']) {
    const got = dOf(fit, t);
    assert.ok(Math.abs(got.TE - EXP1_FE[t].TE) < TOL, `${t} TE ${got.TE} vs ${EXP1_FE[t].TE}`);
    assert.ok(Math.abs(got.se - EXP1_FE[t].se) < TOL, `${t} se ${got.se} vs ${EXP1_FE[t].se}`);
  }
});

test('FE matches netmeta to 1e-6 (heterogeneous network)', () => {
  const fit = NM.fit(rowsFor(FIX2), { ref: 'A', model: 'fe' });
  assert.ok(fit.ok, fit.error);
  for (const t of ['B', 'C']) {
    const got = dOf(fit, t);
    assert.ok(Math.abs(got.TE - EXP2_FE[t].TE) < TOL, `${t} TE ${got.TE} vs ${EXP2_FE[t].TE}`);
    assert.ok(Math.abs(got.se - EXP2_FE[t].se) < TOL, `${t} se ${got.se} vs ${EXP2_FE[t].se}`);
  }
});

test('RE τ² (generalised DL), Q, df, point and SE match netmeta to 1e-6', () => {
  const fit = NM.fit(rowsFor(FIX2), { ref: 'A', model: 're' });
  assert.ok(fit.ok, fit.error);
  assert.ok(Math.abs(fit.Q - EXP2_RE.Q) < 1e-5, `Q ${fit.Q} vs ${EXP2_RE.Q}`);
  assert.equal(fit.df, EXP2_RE.df);
  assert.ok(Math.abs(fit.tau2 - EXP2_RE.tau2) < 1e-6, `tau2 ${fit.tau2} vs ${EXP2_RE.tau2}`);
  for (const t of ['B', 'C']) {
    const got = dOf(fit, t);
    assert.ok(Math.abs(got.TE - EXP2_RE[t].TE) < TOL, `${t} TE ${got.TE} vs ${EXP2_RE[t].TE}`);
    assert.ok(Math.abs(got.se - EXP2_RE[t].se) < TOL, `${t} se ${got.se} vs ${EXP2_RE[t].se}`);
  }
});

test('multi-arm study with an incomplete clique is reported, not silently mis-fit', () => {
  // drop one pairwise contrast of the 3-arm S6 → cannot recover arm covariance
  const rows = rowsFor(FIX1).filter((r) => !(r.study === 'S6' && ((r.t1 === 'B' && r.t2 === 'C') || (r.t1 === 'C' && r.t2 === 'B'))));
  const fit = NM.fit(rows, { ref: 'A', model: 'fe' });
  // S6 is dropped from the fit but the other studies still fit; warning recorded
  assert.ok(fit.ok, fit.error);
  assert.ok(fit.warnings.some((w) => w.includes('S6')), 'S6 incompleteness warned');
  assert.ok(!fit.multiArmStudies.includes('S6'));
});
