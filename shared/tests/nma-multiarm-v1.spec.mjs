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

test('multi-arm study with an incomplete clique is refused and named, as netmeta does', () => {
  // drop one pairwise contrast of the 3-arm S6 → its arm covariance cannot be recovered. Until allmeta
  // 76d3e9d the engine dropped S6 and fitted the rest (with a warning); netmeta refuses such a network
  // ("Study ... has an incomplete set of comparisons"), so a different network is not analysed silently.
  const rows = rowsFor(FIX1).filter((r) => !(r.study === 'S6' && ((r.t1 === 'B' && r.t2 === 'C') || (r.t1 === 'C' && r.t2 === 'B'))));
  const fit = NM.fit(rows, { ref: 'A', model: 'fe' });
  assert.ok(!fit.ok);
  assert.ok(/'S6' has an incomplete set of comparisons/.test(fit.error), fit.error);
  // a duplicated comparison and inconsistent multi-arm estimates are refused too
  const full = rowsFor(FIX1);
  assert.ok(!NM.fit(full.concat([full[0]]), { model: 'fe' }).ok);
  const bad = full.map((r) => (r.study === 'S6' && r.t1 === 'B' && r.t2 === 'C') || (r.study === 'S6' && r.t1 === 'C' && r.t2 === 'B') ? { ...r, est: r.est + 0.5 } : r);
  assert.ok(/inconsistent treatment effects/.test(NM.fit(bad, { model: 'fe' }).error));
});

// --- Multi-arm variance audit: rounding of supplied SEs vs genuine incompatibility (PR #120) ---
// Oracle: tests/fixtures/nma-multiarm-rounding-reference.R (R 4.6.0, netmeta 3.6.1).
import { readFileSync } from 'node:fs';
const ROUND = JSON.parse(readFileSync(new URL('../../tests/fixtures/nma-multiarm-rounding-oracle.json', import.meta.url), 'utf8'));
const leagueAgree = (got, want) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) assert.ok(Math.abs(got[i][j] - want[i][j]) <= TOL, `[${i}][${j}] ${got[i][j]} vs ${want[i][j]}`); };

for (const dp of ['dp3', 'dp4', 'dp6']) {
  test(`four-arm study with SEs rounded to ${dp.slice(2)} dp FITS and matches netmeta to 1e-6 (common + random)`, () => {
    const o = ROUND[dp], a = NM.analyse(o.rows);
    assert.strictEqual(a.ok, true, a.error);
    assert.deepStrictEqual(a.treatments, ['A', 'B', 'C', 'D']);
    leagueAgree(a.common.TE, o.TE_common); leagueAgree(a.common.seTE, o.seTE_common);
    leagueAgree(a.random.TE, o.TE_random); leagueAgree(a.random.seTE, o.seTE_random);
    assert.ok(Math.abs(a.tau2 - o.tau2) <= TOL && Math.abs(a.Q - o.Q) <= TOL);
    // the supplied SEs enter unchanged (as netmeta): without the two-arm study the fitted
    // contrast SEs of the four-arm study reproduce every supplied SE
    const solo = NM.analyse(o.rows.filter(r => r.study === 'Four'));
    assert.strictEqual(solo.ok, true, solo.error);
    for (const r of o.rows.slice(0, 6)) assert.ok(Math.abs(solo.common.seTE[solo.treatments.indexOf(r.t1)][solo.treatments.indexOf(r.t2)] - r.se) <= 1e-12);
    // the rounding discrepancy is DISCLOSED, with the per-contrast SE an independent-arm projection would give
    assert.strictEqual(a.varianceDisclosures.length, 1);
    const d = a.varianceDisclosures[0];
    assert.strictEqual(d.study, 'Four'); assert.strictEqual(d.decimals, dp.slice(2));
    assert.ok(d.worstRatio > 0 && d.worstRatio <= 1);
    assert.strictEqual(d.changes.length, 6);
    assert.match(d.message, /within what that rounding can explain/);
    assert.match(d.message, /supplied SEs unchanged, as netmeta's multiarm\(\) does/);
  });
}

test('PR counterexample (SE 0.2 would be projected to 0.1414) is still REFUSED at full precision; netmeta keeps 0.2', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) rows.push({ study: 'S', t1: 'ABCD'[i], t2: 'ABCD'[j], est: .3 * (j - i), se: .2 });
  rows[5].se = Math.sqrt(.10);
  const a = NM.analyse(rows);
  assert.strictEqual(a.ok, false);
  assert.match(a.error, /independent-arm covariance model beyond what rounding of the supplied SEs can explain/);
  assert.match(a.error, /no network has been fitted/);
  for (const model of ['fe', 're']) assert.strictEqual(NM.fit(rows, { model }).ok, false);
  // the netmeta reference that the old engine silently departed from (SE 0.2, not 0.1414213562)
  assert.ok(Math.abs(ROUND.counterexample.seTE_BA - 0.2) <= TOL);
  assert.ok(Math.abs(ROUND.counterexample.lower_BA - (-0.0919928)) <= 1e-6 && Math.abs(ROUND.counterexample.upper_BA - 0.6919928) <= 1e-6);
  // three-decimal transcription of the same inconsistency is also refused
  const r3 = rows.map((r, k) => ({ ...r, se: k === 5 ? 0.316 : r.se }));
  assert.strictEqual(NM.analyse(r3).ok, false);
});

test('borderline: just outside the 3-dp rounding bound is refused, just inside fits', () => {
  const base = ROUND.dp3.rows.filter(r => r.study === 'Four');
  const withCD = se => base.map((r, k) => ({ ...r, se: k === 5 ? se : r.se }));
  const out = NM.auditStudies(withCD(0.278)), ins = NM.auditStudies(withCD(0.281));
  assert.ok(out.varianceAudit.Four.worstRatio > 1 && out.varianceAudit.Four.worstRatio < 1.01, String(out.varianceAudit.Four.worstRatio));
  assert.strictEqual(out.problems.length, 1);
  assert.match(out.problems[0], /exceeds the rounding allowance/);
  assert.ok(ins.varianceAudit.Four.worstRatio < 1);
  assert.deepStrictEqual(ins.problems, []);
  // stating a higher precision than the values carry tightens the bound: 3-dp data stated as 6 dp is refused
  assert.strictEqual(NM.analyse(ROUND.dp3.rows, { seDecimals: 6 }).ok, false);
  assert.strictEqual(NM.analyse(ROUND.dp3.rows, { seDecimals: 3 }).ok, true);
});

test('exactly independent-arm four-arm data: no disclosure and results unchanged by the audit', () => {
  const v = [.011, .023, .031, .047], rows = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) rows.push({ study: 'Four', t1: 'ABCD'[i], t2: 'ABCD'[j], est: [0, .3, .5, .8][j] - [0, .3, .5, .8][i], se: Math.sqrt(v[i] + v[j]) });
  const a = NM.analyse(rows);
  assert.strictEqual(a.ok, true);
  assert.deepStrictEqual(a.varianceDisclosures, []);
  for (const r of rows) assert.ok(Math.abs(a.common.seTE[a.treatments.indexOf(r.t1)][a.treatments.indexOf(r.t2)] - r.se) <= 1e-12);
});

test('decimal-place inference', () => {
  assert.strictEqual(NM._decimalsOf(0.184), 3);
  assert.strictEqual(NM._decimalsOf(0.15), 2);
  assert.strictEqual(NM._decimalsOf(2), 0);
  assert.strictEqual(NM._decimalsOf(1e-7), 7);
  assert.strictEqual(NM._decimalsOf(1.5e-7), 8);
  assert.strictEqual(NM._decimalsOf(Math.sqrt(0.1)), 17);
});
