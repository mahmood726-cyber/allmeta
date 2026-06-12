/*
 * survival-reconstruction-parity.spec.mjs
 * ----------------------------------------------------------------------------
 * Numerical-baseline / parity regression for shared/survival-reconstruction.js,
 * vendored VERBATIM from the registry-ipd engine (R-validated, upstream 22/22;
 * goldstandard benchmarked vs ~55 real IPD datasets).
 *
 * This corpus IS the numerical-baseline contract for the survival-reconstruction
 * module: it pins the deterministic Tier-A outputs (Guyot exact death schedule,
 * event-count conservation, median, RMST, anchor fidelity C2, monotonicity C5,
 * conservation C7) so any future edit that perturbs the math fails here.
 *
 * Tolerance policy (matches registry-ipd/test/engine.spec.js):
 *   - deterministic estimators (Tier-A inversion, KM death schedule, conservation): tight
 *   - median vs true KM median: ≤5% (the engine's own Tier-A tolerance)
 * No stochastic (Tier-B/ensemble) paths are exercised here, so every assertion is exact.
 *
 * Run: node --test shared/tests/survival-reconstruction-parity.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Load the vendored UMD module via its CommonJS export (factory()).
const RIPD = require('../survival-reconstruction.js');

const fx = (n) => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'));

test('module exposes the registry-ipd public surface', () => {
  for (const fn of ['reconstruct', 'reconstructEnsemble', 'classifyTier', 'piecewiseHR']) {
    assert.strictEqual(typeof RIPD[fn], 'function', `${fn} exported`);
  }
  assert.ok(RIPD._ && typeof RIPD._.medianFromKM === 'function', 'test internals exposed');
  assert.ok(typeof RIPD.selfAudit === 'function' || typeof RIPD._.selfAudit === 'function',
    'selfAudit available (C1-C9)');
});

test('Guyot round-trip: exact death schedule reproduced (deterministic parity)', () => {
  const t = fx('fixture_guyot_roundtrip.json');
  assert.strictEqual(RIPD.classifyTier(t), 'A');
  const r = RIPD.reconstruct(t, { method: 'guyot' });
  const rec = r.arms[0];
  const byT = {};
  for (const row of rec.ipd) if (row.status === 1) byT[row.time] = (byT[row.time] || 0) + 1;
  const reconD = [1, 2, 3, 4, 5, 6].map((tt) => byT[tt] || 0);
  // baseline = registry-ipd goldstandard truth: [2,3,1,4,2,1]
  assert.deepStrictEqual(reconD, t._truth.d_schedule,
    `death schedule parity: ${JSON.stringify(reconD)} vs ${JSON.stringify(t._truth.d_schedule)}`);
  assert.strictEqual(rec.ipd.filter((x) => x.status === 1).length, t._truth.total_events,
    'total events conserved');
  assert.strictEqual(rec.ipd.length, t._truth.N, 'population conserved');
});

test('Tier-A exp_known: events/N conserved, anchors honoured (C2/C5/C7), median within 5%', () => {
  const t = fx('fixture_exp_known.json');
  assert.strictEqual(RIPD.classifyTier(t), 'A');
  const r = RIPD.reconstruct(t);
  assert.strictEqual(r.tier, 'A');

  // ---- conservation: exact event counts + population per arm (numerical baseline)
  for (const a of t.arms) {
    const rec = r.arms.find((x) => x.arm_id === a.arm_id);
    const ev = rec.ipd.filter((x) => x.status === 1).length;
    assert.strictEqual(ev, a.total_events, `events exact for ${a.arm_id} (baseline ${a.total_events})`);
    assert.strictEqual(rec.ipd.length, a.N, `population conserved for ${a.arm_id} (baseline ${a.N})`);
  }

  // ---- self-audit checks reproduce upstream (anchor fidelity ~0, monotone, conserved)
  assert.ok(r.audit.checks.C2_anchor_fidelity.maxDiff <= 1e-3,
    `C2 anchor maxDiff ${r.audit.checks.C2_anchor_fidelity.maxDiff} (baseline ~0)`);
  assert.ok(r.audit.checks.C5_monotonic.pass, 'C5 monotone');
  assert.ok(r.audit.checks.C7_conservation.pass, 'C7 conservation');

  // ---- median vs the goldstandard true KM median, the engine's own Tier-A tolerance (5%)
  const ctl = r.arms.find((x) => x.arm_id === 'ctl');
  const mCtl = RIPD._.medianFromKM(RIPD._.kmFromIPD(ctl.ipd));
  assert.ok(Math.abs(mCtl - t._truth.ctl_median) / t._truth.ctl_median <= 0.05,
    `ctl median ${mCtl} vs truth ${t._truth.ctl_median} (>5%)`);
  const exp = r.arms.find((x) => x.arm_id === 'exp');
  const mExp = RIPD._.medianFromKM(RIPD._.kmFromIPD(exp.ipd));
  assert.ok(Math.abs(mExp - t._truth.exp_median) / t._truth.exp_median <= 0.05,
    `exp median ${mExp} vs truth ${t._truth.exp_median} (>5%)`);

  // ---- RMST(tau=24) tight numerical baselines pinned from the vendored engine
  const rmstCtl = RIPD._.rmst(RIPD._.kmFromIPD(ctl.ipd), 24);
  const rmstExp = RIPD._.rmst(RIPD._.kmFromIPD(exp.ipd), 24);
  assert.ok(Math.abs(rmstCtl - 13.0757) < 1e-2, `ctl RMST(24) ${rmstCtl} vs baseline 13.0757`);
  assert.ok(Math.abs(rmstExp - 15.0800) < 1e-2, `exp RMST(24) ${rmstExp} vs baseline 15.0800`);
});

test('never-invert HR guard: C9 hard-fails a contradictory registry HR (no silent inversion)', () => {
  // experimental arm clearly worse, but registry HR claims it is favoured => contradiction.
  const mk = (S) => ({ km_points: [0, 6, 12, 18, 24].map((t, i) => ({ t, S: i === 0 ? 1 : S[i - 1] })), nar_points: [] });
  const t = {
    nct_id: 'PARITY-CONTRA', time_unit: 'months',
    arms: [
      Object.assign({ arm_id: 'exp', label: 'Drug', role: 'experimental', N: 100, total_events: 70, follow_up_max: 24 }, mk([0.7, 0.5, 0.35, 0.25])),
      Object.assign({ arm_id: 'ctl', label: 'Placebo', role: 'comparator', N: 100, total_events: 35, follow_up_max: 24 }, mk([0.9, 0.8, 0.72, 0.65])),
    ],
    hr: { value: 0.5, ci_low: 0.35, ci_high: 0.72, method: 'Cox', favors_arm_id: 'exp' },
  };
  const r = RIPD.reconstruct(t);
  assert.strictEqual(r.audit.checks.C9_direction.pass, false, 'C9 catches the contradiction');
  assert.strictEqual(r.audit.badge, 'none', 'hard C9 fail => badge none');
});
