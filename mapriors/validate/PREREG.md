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
