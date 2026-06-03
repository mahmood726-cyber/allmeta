/**
 * nma-inconsistency-re.spec.mjs — netmeta RANDOM-effects R-parity (V12).
 *
 * Companion to nma-inconsistency-parity.spec.mjs (which covers the FE path).
 * The app's RE option fits contrast NMA with a shared τ² (DL or PM) and
 * inflated weights w_i = 1/(SE² + τ²). Parity target:
 *   netmeta(common=FALSE, random=TRUE, method.tau=...) + netsplit(random=TRUE)
 * Oracle: nma-inconsistency/tests/fixtures/inco-re-oracle.json (netmeta).
 *
 * Fixture is OVER-dispersed (inco-het.csv, Q≫df) so τ²>0 genuinely exercises
 * the estimators — in particular the generalized DerSimonian-Laird moment
 * denominator tr(W)−tr((XᵀWX)⁻¹XᵀW²X), which differs ~16 % from the
 * intercept-only form once the network has >1 basic parameter.
 *
 * Orientation note (as in the FE spec): the app keys node-splits by sorted
 * pair ("A vs B") while netmeta uses "B:A"; SE/p/|effect| are
 * orientation-invariant and asserted on |·|.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/nma-inconsistency/';
const O = JSON.parse(readFileSync(
  new URL('../../../nma-inconsistency/tests/fixtures/inco-re-oracle.json', import.meta.url), 'utf-8'));
const FIXTURE = [
  'A, B, 0.10, 0.08', 'A, B, 0.60, 0.08', 'A, B, 0.35, 0.08',
  'A, C, 0.90, 0.10', 'A, C, 0.30, 0.10',
  'B, C, 0.05, 0.09', 'B, C, 0.55, 0.09',
].join('\n');
const TOL = 1e-4;

const pairKey = (s) => s.split(/\s*(?:vs|:)\s*/).map(x => x.trim()).sort().join('|');

async function runModel(page, model) {
  await page.goto(APP_URL);
  await page.waitForFunction(
    () => typeof window.__almIncoLoad === 'function', { timeout: 10_000 });
  await page.selectOption('#f-model', model);
  await page.evaluate((t) => window.__almIncoLoad(t), FIXTURE);
  return page.evaluate(() => window._almLastInco());
}

// --- DL: full netmeta(method.tau="DL", random=TRUE) R-parity. This is the
// quantity that exposed the generalized-denominator fix. ---
test('netmeta RE R-parity (DL): τ² + network + node-split', async ({ page }) => {
  const r = await runModel(page, 'DL');
  const o = O.DL;
  expect(r, 'engine state not exposed').toBeTruthy();
  expect(o, 'no DL oracle').toBeTruthy();
  expect(r.model, 'selected model').toBe('DL');

  const near = (g, e, n) =>
    expect(Math.abs(g - e), `DL ${n}: js=${g} R=${e}`).toBeLessThan(TOL);

  // Shared τ² — the generalized DerSimonian-Laird denominator fix.
  // Old intercept-only form gave 0.0617; netmeta DL gives 0.0735 (~16% off).
  near(r.tau2, o.tau2, 'tau2');
  expect(r.tau2, 'DL tau2 must be >0 on over-dispersed fixture').toBeGreaterThan(1e-4);

  // RE network treatment estimates vs reference A (netmeta TE.random[,A]).
  for (const t of Object.keys(o.TE)) {
    near(r.estimatesRandom[t].est, o.TE[t], `TE.random[${t}] vs A`);
    near(r.estimatesRandom[t].se, o.seTE[t], `seTE.random[${t}]`);
  }

  // RE node-splitting — match by unordered pair; SE/p/|effect| invariant.
  const oByPair = Object.fromEntries(o.netsplit.map(x => [pairKey(x.comparison), x]));
  expect(r.nodeSplit.length, 'node-split count').toBe(o.netsplit.length);
  for (const js of r.nodeSplit) {
    const x = oByPair[pairKey(js.comparison)];
    expect(x, `no oracle for ${js.comparison}`).toBeTruthy();
    near(Math.abs(js.direct.mean), Math.abs(x.direct_TE), `${js.comparison} |direct|`);
    near(js.direct.se, x.direct_se, `${js.comparison} direct.se`);
    near(Math.abs(js.indirect.mean), Math.abs(x.indir_TE), `${js.comparison} |indirect|`);
    near(js.indirect.se, x.indir_se, `${js.comparison} indirect.se`);
    near(Math.abs(js.diff), Math.abs(x.diff), `${js.comparison} |diff|`);
    near(js.p, x.p, `${js.comparison} p`);
  }
});

// --- PM: netmeta has no Paule-Mandel for networks, so PM is validated by its
// DEFINING moment condition Q_random(τ²) = df (generalized PM), plus the
// invariant that RE inflates SEs relative to FE. ---
test('generalized Paule-Mandel (PM): moment condition Q(τ²)=df + RE inflation', async ({ page }) => {
  const fe = await runModel(page, 'FE');
  const pm = await runModel(page, 'PM');
  expect(pm.model).toBe('PM');
  // PM is defined by Q(τ²)=df; the fixture is over-dispersed so τ²>0.
  expect(pm.tau2, 'PM tau2 > 0 on over-dispersed fixture').toBeGreaterThan(1e-4);
  expect(Math.abs(pm.Qrandom - pm.df),
    `PM moment condition Q(τ²)=df: Q=${pm.Qrandom} df=${pm.df}`).toBeLessThan(1e-6);
  // Random-effects weights must widen every network SE vs fixed-effect.
  for (const t of pm.trts.filter(t => t !== pm.trts[0])) {
    expect(pm.estimatesRandom[t].se, `PM RE SE wider than FE for ${t}`)
      .toBeGreaterThan(fe.estimates[t].se);
  }
});

test('RE collapses to FE when τ²=0 (under-dispersed fixture)', async ({ page }) => {
  // inco-tiny is under-dispersed (Q<df): PM/DL must both clamp τ² to 0,
  // so the RE estimates equal the FE estimates exactly.
  const tiny = [
    'A, B, 0.20, 0.10', 'A, B, 0.35, 0.12', 'A, B, 0.28, 0.09',
    'A, C, 0.50, 0.11', 'A, C, 0.42, 0.13',
    'B, C, 0.18, 0.10', 'B, C, 0.25, 0.14',
  ].join('\n');
  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof window.__almIncoLoad === 'function', { timeout: 10_000 });
  for (const m of ['DL', 'PM']) {
    await page.selectOption('#f-model', m);
    await page.evaluate((t) => window.__almIncoLoad(t), tiny);
    const r = await page.evaluate(() => window._almLastInco());
    expect(r.tau2, `${m} τ² on under-dispersed data`).toBeLessThan(1e-9);
    for (const t of r.trts) {
      expect(Math.abs(r.estimatesRandom[t].est - r.estimates[t].est),
        `${m} RE==FE est for ${t}`).toBeLessThan(1e-9);
    }
  }
});
