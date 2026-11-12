# PREREG — paper 36 (MAPriors) validation against RBesT 1.12-0
Written 2026-10-25 by Claude (manager), BEFORE any comparison result was produced. Any later change is appended
under "Amendments" with date and reason; nothing above that line is edited after the first gate run.

## 0. Pre-registration findings that shape the design (from reading the app, MAPriors master @ 85a66681)
The original page (`map-priors.html`) does NOT fit the RBesT model. Its "MAP prior" is a plug-in empirical-Bayes normal
approximation: DerSimonian-Laird start + REML Fisher scoring on logit(r/n) (binary, 0.5 correction) or on the raw means
(continuous), MAP = N(mu_hat, tau2_hat + se(mu_hat)^2). Its robust prior uses a vague N(0, 100) (binary, logit scale) or
N(0, (10*rms(se))^2) (continuous) component that is centred at 0 and is not RBesT's unit-information `robustify()`; its
binary ESS is a logit-normal curvature divided by p(1-p), not RBesT's beta-mixture ESS. Its exported "RBesT equivalent"
R code therefore does not reproduce the page's own numbers. These are recorded as app defects D1-D4:
- D1 MAP predictive ignores uncertainty in tau and the HalfNormal tau prior / normal beta prior of `gMAP()`.
- D2 robust (vague) component differs from `robustify()` (centre and scale).
- D3 robust mixture summarised by a single moment-matched normal for intervals.
- D4 ESS (binary) not on RBesT's beta-mixture scale; no `moment` / `elir` ESS.
Fix plan (Codex, failing tests first): add to the page an RBesT-model engine (deterministic quadrature posterior of the
gMAP model; beta / normal mixture utilities: density, cdf, quantile, summary, `robustify`, `postmix`, `ess`
(morita, moment, elir); EM mixture fitting of the MAP predictive) and make the UI use it. The legacy REML engine is kept
as a labelled "quick normal approximation" and is validated against metafor (scope A1).

## 1. Oracle and pins (fail-closed: validate.R stops if any version differs)
R 4.6.0; RBesT 1.12-0; rstan / StanHeaders as installed with RBesT 1.12-0 (versions recorded in the archive);
metafor 5.2-1; jsonlite 2.0.0. Lane-local library `Rlib`. Seeds fixed: `set.seed(36)` and gMAP `seed` per configuration =
36000 + configuration index. MCMC: 4 chains, warmup 2,000, 20,000 post-warmup iterations per chain, thin 1
(options RBesT.MC.chains / RBesT.MC.warmup / RBesT.MC.iter / RBesT.MC.thin). Divergent transitions or Rhat > 1.01 on
beta, tau or the predictive => that configuration is reported as an ORACLE failure (not silently re-run).

## 2. Corpus (fixed now; the manifest `corpus/manifest.json` lists every configuration and its hash)
### 2a. RBesT package examples (priors as in the RBesT vignettes / help pages)
- AS (binary, 8 studies): binomial, tau ~ HalfNormal(1), beta ~ N(0, 2).
- colitis (binary): binomial, tau ~ HalfNormal(1), beta ~ N(0, 2).
- transplant (binary): binomial, tau ~ HalfNormal(1), beta ~ N(0, 2).
- crohn (continuous, y and y.se): gaussian, sigma = 88, tau ~ HalfNormal(sigma/2), beta ~ N(0, sigma).
### 2b. Pre-registered grid of historical-control sets (generated deterministically, no RNG)
Study i of k gets z_i = qnorm((i - 0.5)/k) (z = 0 when k = 1).
- Binary: k in {1, 2, 3, 5, 10}; base rate p0 in {0.05, 0.20, 0.50}; heterogeneity s in {0 (homogeneous), 0.3 (moderate),
  1.5 (extreme)} on the logit scale; n_i = 100; r_i = round(n_i * expit(logit(p0) + s * z_i)). Priors tau ~ HN(1),
  beta ~ N(0, 2). 5 x 3 x 3 = 45 configurations.
- Continuous: k in {1, 2, 3, 5, 10}; sigma = 1; n_i = 50, se_i = sigma/sqrt(n_i); level m0 in {0, 5}; heterogeneity
  s in {0, 0.2, 1.0} (units of sigma); y_i = m0 + s * z_i. Priors tau ~ HN(sigma/2), beta ~ N(0, 10*sigma).
  5 x 2 x 3 = 30 configurations.
### 2c. Probes
P1 binary all-zero events (r = 0, n = 50, k = 3); P2 binary all events (r = n = 50, k = 3); P3 binary with one tiny study
(r = (1, 12, 15), n = (5, 60, 70)); P4 binary k = 10 extreme heterogeneity with tau ~ HN(0.5); P5 continuous k = 1 with
large se (y = 2, se = 3); P6 continuous k = 10, s = 3 (beyond the grid). k = 1 and extreme heterogeneity are also in 2b.
Robust weights: w_vague in {0.1, 0.2, 0.5}; binary robustify mean = 0.5; continuous robustify mean = MAP mean, sigma as
the configuration's sigma (crohn: 88). New-trial data for `postmix`: binary (r, n) = (round(0.3 n), n) with n = 40;
continuous mean = MAP mean + 0.5 sigma, n = 40.

## 3. Quantities and tolerances
Relative error is |app - R| / max(1, |R|).
### Scope A — deterministic (no Monte Carlo)
- A1 legacy quick engine vs `metafor::rma(yi, vi, method = "REML", control = list(threshold = 1e-12, maxiter = 1000))`
  on the page's own yi / vi: mu, se(mu), tau2, Q. mu / se / tau2 are iterative (Fisher scoring, both sides converged
  to <= 1e-10 in the step): tolerance 1e-8. Q is closed form: 1e-9. (Run for every 2a/2b/2c configuration with k >= 2.)
- A2 mixture arithmetic, with the app given the IDENTICAL mixture that RBesT produced (`automixfit` result exported to
  JSON, so mixture fitting is not part of A2): for the MAP mixture and each robustified mixture —
  `robustify()` component weights and parameters: 1e-9; density at 21 fixed grid points (binary: p = 0.025..0.975 step
  0.0475; continuous: MAP mean +/- 3 MAP sd, 21 points): 1e-9; cdf at the same points: 1e-9 (incomplete-beta / normal cdf,
  closed-form series to machine precision); `summary` mean and sd: 1e-9; quantiles 2.5 / 50 / 97.5 %: iterative root
  finding, tolerance 1e-7; `postmix` component weights and parameters: 1e-9;
  `ess(method = "moment")`: 1e-9; `ess(method = "morita")`: mode found by numerical optimisation on both sides, the
  curvature error is O(mode error^2): tolerance 1e-4; `ess(method = "elir")`: numerical integration: tolerance 1e-6.
### Scope B — Monte Carlo (RBesT `gMAP` is MCMC; the app's RBesT-model engine is deterministic quadrature)
- B1 per configuration: MAP predictive on the response scale (mean, sd, 2.5 / 50 / 97.5 % quantiles), tau posterior
  (mean, median), beta posterior (mean, sd). Tolerance |app - R| <= 4 * MCSE_R + 1e-6 * max(1, |R|), MCSE from
  `posterior::mcse_mean / mcse_sd / mcse_quantile` on the pooled post-warmup draws. Justification: the app value is a
  deterministic quadrature estimate of the same posterior functional; 4 MCSE gives a per-check false-failure rate of
  about 6e-5 under normality of the MC error; the 1e-6 floor covers quadrature error.
- B2 mixture fitting: the app's fitted MAP mixture (EM on its own predictive) vs RBesT `automixfit` on the draws:
  mixture mean |diff| <= 4 * MCSE_R(mean) + 0.01 * sd_R; mixture sd |ratio - 1| <= 0.05; ESS (morita, robustified at
  w_vague = 0.2) |ratio - 1| <= 0.10. Justification: two different finite-mixture approximations of the same predictive
  are compared; these are approximation tolerances, stated before any result.
### Gate
The gate prints N/N over all A and B checks plus the configuration count (must equal the manifest: 4 + 45 + 30 + 6 = 85).
A missing configuration, a missing quantity, a non-finite value, or a version mismatch is a FAIL (fail-closed).
Counts are reported separately for scope A and scope B. Original page (85a66681) vs fixed page counts are both reported;
quantities the original page cannot produce count as failures for the original page.

## 4. Planted defects (each must turn the gate to FAIL; recorded in the archive)
PD1 multiply one app scope-A value (density of the AS MAP mixture at the 11th grid point) by (1 + 1e-8).
PD2 drop one configuration (grid binary k = 3, p0 = 0.20, s = 0.3) from the app output.
PD3 (scope B) shift the app's AS MAP predictive mean by 5 MCSE.

## 5. Worked example (paper + figures)
AS placebo data (8 historical trials; Neuenschwander et al. 2010 Clin Trials; used in Schmidli et al. 2014 Biometrics and
the RBesT paper, Weber et al. 2021 J Stat Softw): MAP prior, robust MAP (w_vague = 0.2), ESS, captured from the real page.

## Amendments
- A1 (2026-10-25, before any R reference or gate result existed): PD1 moved from "grid point 11" to "the grid point with
  the largest MAP-mixture density". Reason (manager review of the gate, C3): grid point 11 is p = 0.5, where the AS MAP
  density is near 0, so a (1 + 1e-8) perturbation is ~1e-13 absolute and cannot exceed the 1e-9 x max(1, |R|) tolerance;
  the plant would be undetectable by construction. At the density peak (density > 1) a 1e-8 relative change exceeds the
  tolerance. No tolerance or quantity changed.
- A2 (2026-10-31, written after the R API smoke and BEFORE any reference value, app-vs-R comparison or gate result existed;
  the smoke stopped at the API, see validation/evidence/R_smoke_api.json): RBesT 1.12-0 (CRAN, released 2026-09-18) changed
  the gMAP interface the oracle scripts were drafted against: (i) `gMAP()` has no `seed` argument ("unused argument (seed =
  36001)"); rstan's seed is drawn from R's RNG, so the per-configuration seed 36000 + index is applied by `set.seed()`
  immediately before each `gMAP()` call (probe tools/probe_api.R: identical draws for the same set.seed, different draws for
  another seed); (ii) the result holds no stanfit (`fit$fit` is NULL); post-warmup draws are read from `fit$draws`
  (posterior draws_array; variables beta[1], tau[1], theta_resp_pred) and divergences from `fit$draws_diag[,, "divergent__"]`.
  The model, priors, chains, warmup, iterations, thinning, seeds' values, quantities, tolerances and corpus are unchanged.
  Also recorded (no change): for crohn, `weights = n` enters gMAP only through the reference scale sigma_ref and the
  sampler's initial/scale guesses, not the likelihood, so the target posterior is the same with or without weights; the
  vignette call (with weights) is kept and the mixture sigma is set to 88 explicitly. Windows binary note: R warns
  "package RBesT was built under R version 4.6.1"; R itself is 4.6.0 as pinned.
- A3 (2026-10-31, written AFTER the full reference run and the gate results; disclosed as POST-RESULT). Nothing in
  sections 0-5 is edited; tolerances, quantities, corpus, seeds and MCMC settings are unchanged. Recorded:
  (i) Planted defects. The fixed page does not pass every check (gate/fixed_summary.json 27098/28874; 3 ORACLE_FAILURE
  configurations), so "each must turn the gate to FAIL" (section 4) is vacuous and gate/plant.js reports
  BLOCKED_OR_FAILED for all three. Detection is evaluated instead as: the target check passes in the baseline ledger
  and fails in the plant ledger, with no other status change (analysis/post_result/plant_delta.py,
  evidence/P36_plant_delta.json). PD1 and PD2 are detected. PD3 as preregistered (+5 MCSE) is NOT detected: the
  baseline AS difference is -1.68 MCSE, so the shifted value lies +3.32 MCSE from R, inside the 4 MCSE tolerance.
  A post-result PD3b (-5 MCSE) is detected; PD3 is still reported as not detected.
  (ii) An independent arbiter (mpmath, analysis/post_result/arbiter.py, evidence/P36_arbiter.json) recomputes every
  failing A2 quantile / Morita / ELIR check on the 82 oracle-OK configurations; it is a secondary analysis and does not
  change any gate count.
  (iii) The archive's validate.R checks that the recorded result is reproduced exactly (fresh MCMC equal, every gate
  count equal to expected/paper_values.json); it no longer requires the fixed page to pass every check or zero
  oracle failures, because the reviewed result does not.
  (iv) Engine changes made after results: allmeta d026077 (robustify Beta(1,1), RBesT Morita and response-scale ELIR;
  made after the R smoke comparison, before the full reference) and 949eb84, b25290f, df84d18 (ELIR numerical
  integration; made after the first gate runs and the arbiter). Each implements RBesT 1.12-0's ess()/robustify()
  definitions as planned in section 0, with failing tests first. Test T3 was rewritten because it asserted the page's
  Beta(0.5,0.5) robust component rather than RBesT's Beta(1,1).
- A4 (2026-11-02, POST-RESULT; this design paragraph was committed BEFORE the sample below was drawn and before any
  third-computation value existed). Third, independent high-precision computation for the 962 failing A2 quantile /
  Morita / ELIR checks that A3(ii) attributed to RBesT ("R less accurate"). Population: the 962 rows of
  evidence/P36_arbiter.json (sha256 d428922e0cfcc76db7a0005c7a2480b53cbde8edaf4daf2c58c0bb1c2db3e019; derived from
  gate/fixed_ledger.csv sha256 214218baf100d50c5e8bfe14a57375f0da091ed4da96508b5a5558f83fd061e8, archive 1c31e27).
  Third computation: analysis/post_result/third.R (R 4.6.0 + Rmpfr 1.1-3 / gmp 0.7-5.1 / GNU MPFR, 128-bit), on the
  identical RBesT mixture, with RBesT 1.12-0's definitions of the quantities but its own algorithms: beta CDF by the
  continued fraction (modified Lentz) in MPFR, quantiles by safeguarded Newton in MPFR, Morita mode by a double grid
  plus MPFR Newton, ELIR by adaptive Gauss-Legendre (30 vs 61 nodes, bisection) with MPFR integrand evaluation on the
  logit scale (beta; tails |logit| > 50 via e = +/-exp(v)) or the response scale (normal). It shares no code with the
  page, RBesT or the mpmath arbiter.
  Sample design: (S) a simple random sample of n = 60 rows without replacement, drawn by
  analysis/post_result/third_sample.py as `random.Random(36004).sample(rows, 60)` with rows sorted by (config, quantity);
  seed 36004 is declared here before the draw. (X) every extreme case, added to S: per quantity class (q2.5, q50,
  q97.5, ELIR, Morita) the 5 rows with the largest |app - R| / tolerance and the 5 with the largest |app - R|; every row
  of the boundary-data probes P1 (all r = 0) and P2 (all r = n); every row whose RBesT mixture has a beta component
  with a or b < 1.001 (boundary parameters, mostly RBesT's constrain_gt1 floor a = 1 + 1e-8). (C) all remaining rows
  are then computed as well (census), reported separately from S and X.
  Rule (fixed now): a row keeps "R less accurate" only if |app - third| <= tolerance and |R - third| > tolerance.
  Otherwise: |app - third| > tol and |R - third| <= tol -> app defect; both > tol -> neither within tolerance
  (spec ambiguity / unresolved, examined case by case); both <= tol -> tolerance-limited (neither side wrong). No
  tolerance changes. Gate counts are not changed by this analysis.
- A5 (2026-11-02, POST-RESULT; app engine changed after results, disclosed). The 37 failing B2 robust-Morita checks
  of the 31 Oct pin (allmeta 84e5c56) were traced to the page's mixture-fitting step. Root cause, from the RBesT
  1.12-0 source (automixfit, EM_bmm_ab, EM_mnmm, EM_msmm, knn, gMAP formals; evidence/P36_rbest_source.txt): the
  page's fitMixture was not RBesT's automixfit. automixfit chooses Nc = 1..4 by AIC with penalty k = 6 (page: 2);
  EM_bmm_ab uses constrain_gt1 = TRUE, so every beta a, b > 1 (page allowed e.g. b = 0.956); RBesT starts EM from
  knn (beta) or a Student-t EM (normal) and stops when the parameters of the last 5 iterations move < 0.005; and
  gMAP's default draw count is 4 chains x (6000 - 2000) / thin 4 = 4000 (page assumed 16,000). Check before the fix:
  RBesT automixfit applied to 80,000 stratified pseudo-draws of the PAGE's own predictive gave 9.026 / 9.022 (two
  draw orders) for bin_k1_p0.05_s0.0 against the oracle's 9.032 and the page's 12.956, and RBesT's own
  ess(method = "morita") on the page's fitted mixture equalled the page's value (12.95659 vs 12.95608), so neither
  the predictive nor the ESS arithmetic was at fault. Fix, failing tests first, on allmeta branch f1000/p36-mapriors:
  aa3db97 adds T14 (beta: default 4000 draws, every a, b > 1, AIC = -2 logLik + 6 df, Morita within 10 % of R on
  bin_k1_p0.05_s0.0) and T15 (normal: same AIC rule, Morita within 10 % of R on cont_k10_m0_s0.2): 13/15 on the
  84e5c56 page; ebd8d10 ports automixfit (EM_bmm_ab, EM_msmm + EM_mnmm, knn, k = 6) and applies it to N
  deterministic stratified draws of the page's predictive (exact CDF/density table, cubic Hermite inversion, fixed
  xoshiro128** order, seed 36): 15/15 (evidence/P36_tests_before_fix5_20261102.txt, _after_fix5_). The M-step is
  solved exactly (Newton) instead of RBesT's Nelder-Mead; boundary solutions take RBesT's floor 1 + 1e-8. New app
  pin: allmeta ebd8d10, page sha256 d57e8ad039137b1ab05655c26dde4523c414c1f764a03cb8619c0d53ffd6f590.
  Harness change (disclosed): harness/run_engine.js passes N = chains x retained_per_chain from
  reference/session.json (4 x 20,000 = 80,000) so the page fits the same number of draws as the oracle's automixfit
  (fail-closed when the session is absent). No tolerance, quantity, corpus, seed or MCMC setting changed. The 31 Oct
  pin is kept and re-gated: app/fixed_20261031/index.html, app/fix_20261031.patch, app_out/fixed_20261031/,
  gate/fixed_20261031_*; validate.R gates original, fixed_20261031 and fixed against the fresh reference.
- A6 (2026-11-02, POST-RESULT; analysis design written before E3 was run and before the E2 runs for the 5 configurations
  named below). (i) E2 (analysis/post_result/e2.R + tables.js): RBesT 1.12-0 automixfit on 80,000 stratified draws
  of the page's own predictive, in two draw orders (set.seed 1 and 2), for the 37 configurations, 8 passing controls
  (AS, bin_k10_p0.20_s0.3, bin_k5_p0.50_s0.0, bin_k1_p0.20_s0.0, cont_k5_m0_s0.0, cont_k3_m5_s0.2, P3, P6) and the 5
  configurations whose B2 check passed on 84e5c56 but fails on ebd8d10 (bin_k10_p0.50_s0.0, cont_k10_m5_s0.0,
  cont_k10_m5_s1.0, cont_k1_m5_s0.0, cont_k5_m0_s0.2). (ii) E3 (analysis/post_result/e3.R): RBesT's own seed-to-seed
  spread of the B2 quantity with the preregistered MCMC settings, replicate 0 = the preregistered seed (must
  reproduce reference/ exactly) and replicates 1-5 = seed + 1000 j, for every configuration whose B2 check fails on
  ebd8d10 (11). (iii) Classes for the 37 (analysis/post_result/classify37.py, rule fixed here): APP_DEFECT_FIXED =
  fails on 84e5c56, passes on ebd8d10 and E2 (first order) is within the B2 tolerance of R; APP_DEFECT_OPEN = E2
  within tolerance of R but ebd8d10 still fails; SPEC_AMBIGUITY = E2 outside the tolerance of R or the two E2 orders
  differ by more than the tolerance (RBesT's own algorithm on the same predictive does not determine the quantity to
  10 %); R_LIMITATION = R shown wrong by an independent computation of the same quantity (none expected for B2,
  because B2 compares two fits rather than one computation). E3 is reported beside each row: whether the page value
  lies inside R's own replicate range widened by the B2 tolerance. Planted defects on ebd8d10: plant.js +
  plant_delta.py (the A3 target-flip rule) and PD3b, reported with and without PD3b. Gate counts are not changed
  by any of these analyses.
- A7 (2026-11-02, results of A4 and fresh-copy validation; post-result, disclosed). (i) A4 third computation
  (evidence/P36_third.json, P36_third_summary.json): all 962 rows computed; by the A4 rule 962/962 keep "R less
  accurate" (|app - third| <= tolerance and |R - third| > tolerance): random sample S 60/60, extreme set X 597/597
  (largest |app-R|/tol 24/24, largest |app-R| 24/24, probes P1/P2 30/30, boundary-parameter rows 589/589), census
  remainder C 341/341; by quantity q2.5 301/301, q50 228/228, q97.5 280/280, ELIR 149/149, Morita 4/4. Largest
  |app - third| / tolerance 1.1e-6; smallest |R - third| / tolerance 1.007; largest |mpmath - third| 2.3e-13. No row
  became "app defect" or "spec ambiguity" under the rule. Flagged sub-group (not a reclassification): for 25 of the
  149 ELIR rows R's value equals, within tolerance, the integral restricted to |logit p| <= 745, i.e. the whole
  app-R difference is integrand mass at p or 1 - p below the smallest positive double, carried by components at
  RBesT's constrain_gt1 floor (a or b = 1 + 1e-8); the page, mpmath and MPFR integrate the definition over (0, 1),
  RBesT cannot represent that region. Whether ELIR "should" include it is a definitional question for the paper
  (evidence/P36_third_elir_split.json). The other 124 ELIR rows (e.g. P1 MAP: page 108.729, MPFR 108.729, R
  140.287) are RBesT integration error not explained by that tail. (ii) Fresh copy: `git archive` of 2be263b to
  C:\Users\User\p36-validate-2be263b (outside the lane), `Rscript --no-environ validate.R --rerun-app` with
  R_LIBS = lane Rlib: verify PASS (436 hashes), fresh reference 85/85 exact (82 OK, same 3 ORACLE_FAILURE), ORIGINAL
  1770/28874, FIXED_20261031 27098/28874, FIXED 27124/28874 (expected counts match), fixed page replay 85/85 exact,
  exit 0, 20:45:56-22:42:01 (evidence/P36_validate_fresh_2be263b.txt).
- A8 (2026-11-03, POST-RESULT; second engine change after results, disclosed). The A6 classification of ebd8d10
  returned APP_DEFECT_OPEN for 2 rows (cont_k10_m5_s0.2, cont_k1_m5_s0.2: RBesT automixfit on the page's predictive
  agreed with R, the page did not). Root cause, by feeding the identical 4000 draws to RBesT 1.12-0 EM_msmm/mixfit and
  to the port (analysis/post_result/port_vs_rbest.R + dbg_port.js; evidence/P36_port_vs_rbest_identical_draws.txt):
  the port's knn start read x[floor(ind + k - 1) - 1] with a 0-based k, one draw position before RBesT's
  x[ind + k - 1] (k = 1..Nc), and x[-1] (undefined, NaN) for the first component. Failing tests first: allmeta 67f1281
  (T16 cont_k1_m5_s0.2, T17 cont_k10_m5_s0.2, R parity within the B2 10 %): 15/17 on ebd8d10; fix 9c76449: 17/17
  (validation/evidence/P36_tests_*_fix6_20261103.txt). With identical draws the port now equals RBesT EM_msmm and
  mixfit for Nc = 1..4 (log-likelihoods to 6 decimals, same components, same iteration counts). New app pin
  9c76449, page sha256 d7a5c398f5d4a5e323af5333822f41c5eea8ea76ece91f477079a2f9c64dee72. Gate on 9c76449 against the
  archived reference: 27126/28874 (A 26124/27854, B 1002/1020; B2 robust Morita 73/82 oracle-OK). The intermediate
  pin ebd8d10 (27124/28874, fresh-validated at archive 2be263b) is superseded and kept only in git history
  (commits d9b5277..cbf0c81). No tolerance changed. Planned before running (this paragraph is committed first): the
  two configurations that passed on 84e5c56 and fail only on 9c76449 and have no E2/E3 record, cont_k3_m0_s0.0 and
  cont_k3_m5_s0.0, get E2 (2 orders) and E3 (6 replicates) exactly as in A6; every B2 failure on 9c76449 is then
  classified with the A6 rule (E2 outside R's tolerance or the two E2 orders apart by more than it -> SPEC_AMBIGUITY;
  E2 within tolerance of R and the page not -> APP_DEFECT_OPEN).
- A9 (2026-11-03, results of A6 and A8; post-result, disclosed). (i) The 37 B2 disagreements of the 31 Oct pin,
  classified with the A6 rule against the current pin 9c76449 (evidence/P36_b2_classification.json): APP_DEFECT_FIXED
  32 (31 Oct page off by up to +81 %; RBesT automixfit on the page's predictive within 10 % of R; 9c76449 passes),
  SPEC_AMBIGUITY 5 (bin_k10_p0.50_s1.5, bin_k3_p0.50_s0.0, bin_k5_p0.50_s0.3, cont_k1_m0_s0.2, cont_k5_m5_s0.2:
  RBesT's own automixfit on the same predictive is itself 16-27 % from the R reference), APP_DEFECT_OPEN 0,
  R_LIMITATION 0. (ii) Every B2 failure of 9c76449 (9 of 82 oracle-OK; evidence/P36_b2_current.json): SPEC_AMBIGUITY 8,
  APP_DEFECT_OPEN 1 (cont_k10_m5_s0.0: page 297.22, RBesT automixfit on the page's predictive 305.31 / 305.37, R
  335.19, tolerance 33.52; the port equals RBesT on identical draws (A8), so the remaining page-vs-E2 gap of 0.24
  tolerance comes from the draw sample / order; recorded as open, not tuned). (iii) E3 (evidence/P36_e3.json,
  P36_e3_summary.json; 13 configurations x 6 replicates): replicate 0 reproduces reference/ to the 15 stored digits in
  13/13; RBesT's own seed-to-seed spread of the B2 quantity exceeds the 10 % tolerance in 12/13 and at least one
  replicate falls outside the tolerance of the R reference in 10/13; the 9c76449 page value lies within R's own
  replicate range widened by the tolerance in 13/13. The preregistered B2 Morita tolerance is therefore below RBesT's
  own reproducibility for these configurations; the tolerance is not changed. (iv) Planted defects on 9c76449
  (evidence/P36_plant_delta_20261103.json): PD1 detected, PD2 detected, PD3 NOT detected (as preregistered; the
  preregistered "gate turns to FAIL" cannot be met because the baseline is not all-pass); with the post-hoc PD3b:
  PD3b detected. Without PD3b 2/3 preregistered plants detected; with PD3b 3/4 plants detected.
- A10 (2026-11-03, record only). Fresh copy of the final evidence commit b7819f0: `git archive` to
  C:\Users\User\p36-validate-b7819f0 (outside the lane), `Rscript --no-environ validate.R --rerun-app` with R_LIBS = lane
  Rlib, under the shared heavy-job lock: verify PASS (460 hashes), fresh reference 85/85 exact (82 OK, the same 3
  ORACLE_FAILURE), ORIGINAL 1770/28874, FIXED_20261031 27098/28874, FIXED 27126/28874 (expected counts match), fixed
  page (9c76449) replay 85/85 exact, exit 0, 02:02:59-03:30:03 (evidence/P36_validate_fresh_b7819f0.txt). This commit
  adds only that record; app, reference, gate and expected counts are as validated.
- A11 (2026-11-07, POST-RESULT; analysis only: no engine, harness, seed, tolerance, rule, quantity, corpus or gate change,
  and the page pin stays 9c76449). Root cause of the one APP_DEFECT_OPEN row, cont_k10_m5_s0.0 (page 297.22, R 335.19,
  tolerance 33.52, so the passing band is 301.68 to 368.71; E2 305.31 / 305.37). Instruments:
  analysis/post_result/rootcause_order.js + rootcause_order.R; evidence/P36_k10m5_rootcause.json, _log.txt.
  (i) Identical draws, N = 80,000 (A8 tested N = 4,000 on another configuration): RBesT 1.12-0 mixfit (Nc = 1..4) and
  automixfit on the page's exact draws in the page's order give K = 4 and 297.2230 (page 297.2230), the same EM iteration
  counts for every Nc and log-likelihoods within 1.5e-5. The port on the two E2 draw orders gives 305.3095 / 305.3724
  (RBesT 305.3095 / 305.3724), same iterations, log-likelihoods within 1.3e-5. (ii) The page's and E2's sorted draws
  differ by at most 1.7e-6, so the two sets hold the same values and differ in order. (iii) The page's own draws
  re-ordered by 17 shuffle seeds (36 and 1 to 16): 11 orders stop at 296.77-297.27 (88-96 EM iterations for Nc = 4,
  log-likelihood about 98017), 6 stop at 305.25-305.40 (136-141 iterations, about 98036); 6 of 17 lie inside the
  passing band. Conclusion: the gap to E2 is the draw order, which selects one of two EM stopping paths; no computation
  defect was found in the page and none was fixed. Seed 36 (fixed in A5) is kept, because choosing an order that passes
  would be tuning. The row stays recorded as APP_DEFECT_OPEN under the A6 rule, whose label is mechanical here, and the
  check stays failed. The rule and the B2 tolerance are unchanged.
  (iv) Review of the other failure groups. The 9 B2 failures: 5 of the 8 SPEC_AMBIGUITY rows (bin_k10_p0.50_s1.5,
  bin_k3_p0.50_s0.0, bin_k5_p0.50_s0.3, cont_k1_m0_s0.2, cont_k5_m5_s0.2) were also run on identical draws
  (analysis/post_result/identical_draws.js + .R; evidence/P36_identical_draws_20261107.json): same K and EM iteration
  counts, Morita ESS within 3.2e-5 relative (the beta M-step is exact Newton in the port and Nelder-Mead in RBesT; the
  largest log-likelihood difference is 0.21, on a binary row). The beta path had not been checked on identical draws
  before. The other 3 rows were not run; their page-minus-E2 gap is at most 0.09 tolerance. The 777 failures in the 3
  ORACLE_FAILURE configurations (259 each): 705 have no R value to compare and 72 are gate rows that require one; the
  43 other rows of those configurations (B1 27, A1 4, gate 12) pass. No page defect can be read from them and nothing
  was changed. Not a failure group, left as is: the literal "?" in the page's displayed text "beta ~ N(0, 2?)".
  (v) Figure 1 re-captured from the final pin in Edge 155 (figures/; 2026-11-07), with the page's default fit of 4,000
  draws, not the gate's 80,000 (AS: K = 2 in the figure). check_figures.py was therefore run against an AS engine output
  at 4,000 draws (made outside the archive; evidence/P36_figure_check_20261107.txt): 28 of 40 displayed numbers match
  exactly; the other 12 are mixture component parameters differing by at most 6.5e-11 between Edge and Node. The 31 Oct
  record stays in evidence/P36_capture_record.json and the 31 Oct TIFFs in git history (566fe9f). Whether the AS trial
  data may be shown remains unconfirmed.
- A12 (2026-11-07, record only). Fresh copy of evidence commit acb8d36: `git archive` to C:\Users\User\p36-validate-acb8d36
  (outside the lane; the tar's own commit id is printed in the log), `Rscript --no-environ validate.R` with R_LIBS = lane
  Rlib, under the shared heavy-job lock (evidence/P36_validate_fresh_acb8d36.txt): verify PASS (471 hashes), fresh reference 85/85
  exact (82 OK, the same 3 ORACLE_FAILURE), ORIGINAL 1770/28874, FIXED_20261031 27098/28874, FIXED 27126/28874 (expected
  counts match), exit 0, 10:53:07.68-11:52:48.79. Run without --rerun-app: the page file is byte-identical to the one replayed in A10.
  This commit adds only that record; app, reference, gate and expected counts are as validated.
