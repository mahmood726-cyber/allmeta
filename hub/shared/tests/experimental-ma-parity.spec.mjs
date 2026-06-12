/**
 * Reference-parity for shared/experimental-ma.js — the author's OWN experimental
 * meta-analysis estimators (surfaced in the review studio behind an "experimental"
 * label). Each function was ported to JS from its Python source and verified to
 * <1e-6; this spec locks those Python-derived reference numbers so a later edit to
 * the engine can't silently drift them. Truth values come from the Python sources,
 * NOT from re-running the JS (a self-referential snapshot would protect nothing).
 *
 * Sources (per-method):
 *   grma               grma/grey_meta_v8.py::GRMA._core
 *   conformalPI        conformal-ma/pipeline.py
 *   specCollapse       spec-collapse-atlas/spec_collapse/aggregators.py::weighted_likelihood
 *   egger              MAFI/R/mafi.R  (classic Egger 1997 asymmetry intercept)
 *   precisionEffectCor MAFI/R/mafi.R  (corr(yi, 1/sei))
 *   knappHartungMod .. sampleSizeWeighted
 *                      experimental-meta-analysis (core_framework.py +
 *                      methods/experimental_methods_part2.py) — the DL-base
 *                      estimators that BEAT DerSimonian-Laird in the author's
 *                      299-method / 12-scenario / 1000-sim benchmark. Verified
 *                      against the framework's own Python output (no R oracle).
 *
 * Shared 6-study fixture (also the egger/precision fixture):
 *   yi  = [-0.15,-0.10,-0.20, 0.02,-0.30,-0.05]
 *   sei = [ 0.05, 0.06, 0.07, 0.09, 0.08, 0.10]   (vi = sei^2)
 *
 * Host: review-project/index.html (loads ../shared/experimental-ma.js → window.ExperimentalMA).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/review-project/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon/;

const YI = [-0.15, -0.10, -0.20, 0.02, -0.30, -0.05];
const SEI = [0.05, 0.06, 0.07, 0.09, 0.08, 0.10];
const VI = SEI.map(s => s * s);
const SPECS = [
  { theta: -0.15, var: 0.0025, k: 6 },
  { theta: -0.12, var: 0.0030, k: 6 },
  { theta: -0.18, var: 0.0040, k: 6 },
  { theta: -0.10, var: 0.0035, k: 6 },
];

test('experimental-ma engine matches its Python reference values (<1e-6)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.ExperimentalMA, { timeout: 10000 });

  const got = await page.evaluate(({ yi, sei, vi, specs }) => {
    const E = window.ExperimentalMA;
    return {
      grma: E.grma(yi, vi),
      conf: E.conformalPI(yi, sei, 0.05),
      spec: E.specCollapse(specs, 0.95),
      egg: E.egger(yi, sei),
      pec: E.precisionEffectCor(yi, sei),
    };
  }, { yi: YI, sei: SEI, vi: VI, specs: SPECS });

  // GRMA — grey-relational robust pool (grey_meta_v8.py)
  expect(got.grma.estimate).toBeCloseTo(-0.12826963, 6);
  expect(got.grma.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8); // weights normalised

  // conformal-MA — distribution-free prediction interval (pipeline.py)
  expect(got.conf.theta).toBeCloseTo(-0.13796647, 6);
  expect(got.conf.lo).toBeCloseTo(-0.35241823, 6);
  expect(got.conf.hi).toBeCloseTo(0.07648528, 6);

  // spec-collapse — multiverse weighted-likelihood aggregator (aggregators.py)
  expect(got.spec.theta).toBeCloseTo(-0.13750000, 6);
  expect(got.spec.ciLo).toBeCloseTo(-0.29694236, 6);
  expect(got.spec.ciHi).toBeCloseTo(0.01844405, 6);

  // Egger 1997 small-study asymmetry intercept (mafi.R)
  expect(got.egg.intercept).toBeCloseTo(1.14529617, 6);
  expect(got.egg.se).toBeCloseTo(2.56863781, 6);
  expect(got.egg.t).toBeCloseTo(0.44587686, 6);
  expect(got.egg.df).toBe(4);

  // precision–effect correlation corr(yi, 1/sei) (mafi.R)
  expect(got.pec).toBeCloseTo(-0.26428749, 6);

  expect(errs, 'no console errors on the host page').toEqual([]);
});

test('experimental-ma guards: sub-threshold k returns null; spec-collapse never narrows below a single spec', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.ExperimentalMA, { timeout: 10000 });

  const got = await page.evaluate(({ specs }) => {
    const E = window.ExperimentalMA;
    // The whole point of spec-collapse: its CI must NOT be narrower than the
    // tightest single spec's own 95% normal CI (the collapse it exists to avoid).
    const s = E.specCollapse(specs, 0.95);
    const z = 1.959963984540054;
    const singleWidths = specs.map(sp => 2 * z * Math.sqrt(sp.var));
    const tightestSingle = Math.min(...singleWidths);
    return {
      grma1: E.grma([0.1], [0.01]),                 // n<2
      conf3: E.conformalPI([0.1, 0.2, 0.15], [0.05, 0.06, 0.07], 0.05), // k<4
      egger2: E.egger([0.1, 0.2], [0.05, 0.06]),    // k<3
      specWidth: s.ciHi - s.ciLo,
      tightestSingle,
    };
  }, { specs: SPECS });

  expect(got.grma1).toBeNull();
  expect(got.conf3).toBeNull();
  expect(got.egger2).toBeNull();
  expect(got.specWidth).toBeGreaterThan(got.tightestSingle);
});

test('benchmark-superior estimators match their Python reference values (<1e-6)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.ExperimentalMA, { timeout: 10000 });

  // Homogeneous fixture where the Knapp-Hartung q-adjustment is < 1, so the
  // truncTrue branch genuinely diverges from truncFalse (floors q-adj at 1).
  const HOM_YI = [0.10, 0.11, 0.09, 0.105, 0.095];
  const HOM_VI = [0.20, 0.22, 0.18, 0.25, 0.21].map(s => s * s);

  const got = await page.evaluate(({ yi, vi, homYi, homVi }) => {
    const E = window.ExperimentalMA;
    return {
      khF: E.knappHartungMod(yi, vi, false),
      khT: E.knappHartungMod(yi, vi, true),
      satt: E.satterthwaiteDF(yi, vi),
      ivp: E.ivPlus(yi, vi, 0.1),
      ridge: E.ridge(yi, vi, 0.01),
      tik: E.tikhonov(yi, vi, 0.0, 0.1),
      qual: E.qualityEffects(yi, vi, 0.5),
      ssw: E.sampleSizeWeighted(yi, vi, 0.5),
      homF: E.knappHartungMod(homYi, homVi, false),
      homT: E.knappHartungMod(homYi, homVi, true),
      kh1: E.knappHartungMod([0.1], [0.04], false), // k<2 guard
    };
  }, { yi: YI, vi: VI, homYi: HOM_YI, homVi: HOM_VI });

  // #1 winner (75% win rate): modified Knapp-Hartung. On this fixture q-adj>1 so
  // truncTrue == truncFalse.
  expect(got.khF.estimate).toBeCloseTo(-0.13796647, 6);
  expect(got.khF.se).toBeCloseTo(0.04234053, 6);
  expect(got.khF.ciLo).toBeCloseTo(-0.24680627, 6);
  expect(got.khF.ciHi).toBeCloseTo(-0.02912667, 6);
  expect(got.khT.se).toBeCloseTo(0.04234053, 6);

  // Satterthwaite-df interval
  expect(got.satt.estimate).toBeCloseTo(-0.13796647, 6);
  expect(got.satt.ciLo).toBeCloseTo(-0.24000748, 6);
  expect(got.satt.ciHi).toBeCloseTo(-0.03592546, 6);

  // IVPlus (regularized inverse variance)
  expect(got.ivp.estimate).toBeCloseTo(-0.13765986, 6);
  expect(got.ivp.se).toBeCloseTo(0.04093611, 6);

  // Ridge-regularized pool
  expect(got.ridge.estimate).toBeCloseTo(-0.13795343, 6);

  // Tikhonov-regularized pool with prior
  expect(got.tik.estimate).toBeCloseTo(-0.13794474, 6);
  expect(got.tik.se).toBeCloseTo(0.03969256, 6);

  // Quality-effects pool
  expect(got.qual.estimate).toBeCloseTo(-0.14204562, 6);
  expect(got.qual.se).toBeCloseTo(0.04588898, 6);

  // Sample-size-weighted pool (precision proxy)
  expect(got.ssw.estimate).toBeCloseTo(-0.14204562, 6);
  expect(got.ssw.se).toBeCloseTo(0.03907357, 6);

  // Truncation branch genuinely binds on the homogeneous fixture
  expect(got.homF.se).toBeCloseTo(0.00359645, 6);
  expect(got.homT.se).toBeCloseTo(0.09316906, 6);
  expect(Math.abs(got.homF.se - got.homT.se)).toBeGreaterThan(0.01);

  // Sub-threshold k guard
  expect(got.kh1).toBeNull();

  expect(errs, 'no console errors on the host page').toEqual([]);
});
