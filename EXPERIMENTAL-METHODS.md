# Experimental Methods Catalog — no-external-oracle advanced engines

**Status: EXPERIMENTAL.** Every method below is a research-grade engine that has **no external R
oracle** to validate against. Each is validated **only against its own output** — internal Monte-Carlo
convergence diagnostics (split-Rhat / ESS), an independent in-language re-fit of the same likelihood, or
a step-for-step reproduction of a published algorithm. **None has been bit-checked against metafor / meta
/ mada / flexsurv** (the portfolio's usual 1e-6 R cross-validation), because no R implementation of the
method exists on disk.

> Consequence: these are valid for **sensitivity / exploratory / robustness** reasoning, but their point
> estimates and intervals **must not be used as primary published estimates without independent
> confirmation** (a second engine, an R reference implementation, or peer methods review).

**All of these are SERVER-SIDE Python/Node analyses — NOT in-browser.** They run emcee / PyMC (NUTS) /
numpy IRLS at the command line. A hand-ported in-browser MCMC at this stage would be unverifiable, so
**no JS/browser port is offered.** Any dashboard that surfaces any of these results MUST label them
**"Experimental"** at the point of display, and must not present them as the primary/headline estimate.

Each engine file now carries a one-line `EXPERIMENTAL — no external R oracle …` banner in its top
docstring/header.

---

## G1 — Hierarchical Emax dose-response MBNMA (emcee)

- **File:** `glp1-obesity-mbnma/bayes_mbnma.py`
- **Method:** One-step Bayesian hierarchical Emax dose-response network meta-analysis on the contrast
  scale; partial pooling of log-Emax / log-ED50 across agents with **fixed** between-agent shrinkage
  scales (the variance hyperparameter is weakly identified with ~7 agents and creates an unclearable
  funnel if estimated). Sampler: emcee affine-invariant ensemble, over-dispersed init.
- **What validation backs it:** Its **own** internal MC coverage only — split-Rhat (per raw param AND per
  reported predicted-effect) and ESS, with the published convergence rules Rhat < 1.01 and ESS ≥ 400. No
  R oracle.
- **Honest caveat:** The fixed shrinkage scales are a modelling choice, not estimated from data; SUCRA /
  POTH hierarchy is posterior-derived and depends on that choice. Single-trial agents get honestly wide
  CrIs by design. Not metafor-cross-checked.
- **Run status (this session):** ran-smoke (400 steps; full run uses 8000 steps × 120 walkers, >90s). The
  sampler initialises, the log-posterior is finite, and the model produces output; convergence requires
  the full step budget.

## G2 — One-step arm-based MBNMA, shared-control covariance (PyMC/NUTS)

- **File:** `glp1-obesity-mbnma/pymc_onestep.py`
- **Method:** TRUE one-step arm-based MBNMA. Models at the **arm** level with a per-trial shared baseline
  `alpha[i]` and a per-trial active random effect `u[i]`, so every arm of a multi-arm trial shares one
  placebo level and one trial deviation — the shared-control covariance structure (advanced-stats rule:
  multi-arm trials share a control, so within-trial covariance must be modelled or CrIs are
  anti-conservative). This corrects the earlier contrast-model error that treated 54 contrasts as
  independent when 38/54 share a placebo arm.
- **What validation backs it:** Its **own** NUTS convergence (max Rhat, min ESS) and an internal width
  comparison against the contrast-based fit (one-step CrIs come out appropriately wider where multi-arm
  covariance bites). No R oracle.
- **Honest caveat:** Posterior-derived ranking; convergence-gated. Not cross-checked against an R MBNMA
  package (e.g. `MBNMAdose`).
- **Run status (this session):** ran-smoke (60 draws / 60 tune; full run is 2500 draws / 1500 tune × 2
  chains). Model compiled and sampled end-to-end, produced a sensible node hierarchy.

## G3 — One-step Bayesian NMR with transportability (PyMC/NUTS)

- **File:** `glp1-obesity-mbnma/pymc_bayesian_transport.py`
- **Method:** One hierarchical model jointly estimates per-trial placebo level, study random effects,
  per-node Emax dose-response, AND a diabetes effect-modifier `gamma`, then derives the **transported**
  effect (to a target diabetes prevalence, NHANES p=0.26) as a posterior — propagating all uncertainty
  (no two-step plug-in).
- **What validation backs it:** Its **own** NUTS convergence; the transported CrIs come out wider than the
  source-population CrIs because `gamma` uncertainty is propagated inside the single model (an internal
  consistency check). No R oracle.
- **BINARY-ONLY BOUNDARY (critical):** Transportability validity holds **only because diabetes is BINARY
  and trials are PURE strata** (AACT condition flags), so the study-level covariate equals the
  individual-level covariate and `gamma` is a genuine individual-level interaction, not ecological. This
  is the legitimate IPD-free case. A full ML-NMR with **continuous** modifiers or joint covariate
  distributions would still require IPD — do NOT extend this engine to continuous effect modifiers and
  claim the same validity.
- **Honest caveat:** Posterior-derived, convergence-gated, bounded to the binary pure-strata case. Not
  R-cross-checked.
- **Run status (this session):** ran-smoke (60 draws / 60 tune, default NUTS in place of `nutpie` for
  speed; full run is 2000 draws / 2000 tune × 4 chains with nutpie). Model compiled and sampled
  end-to-end, produced source-vs-transported effects with propagated uncertainty.

## G5 — Grey-relational robust pooling (numpy)

- **File:** `glp1-obesity-mbnma/grma_robust_pool.py`
- **Method:** GRMA (Grey Relational Meta-Analysis) robust pooling on the headline incretin node. Weights
  studies by grey-relational similarity in a 2-feature space (effect, log-precision) with a redescending
  Tukey bisquare guard against effect outliers, instead of pure inverse-variance. Bootstrap CI.
- **What validation backs it:** Its **own** output — a step-for-step Python reproduction of the published
  GRMA algorithm from `C:/Projects/grma/grma_meta.R` (R not available here). **GRMA is not in metafor**, so
  no 1e-6 metafor cross-validation is possible; this is stated honestly in the engine.
- **SENSITIVITY-ONLY BOUNDARY:** This is a robustness/sensitivity check, **not** a replacement estimator.
  The IV/DL/REML pool stays primary. GRMA does **not** estimate tau^2. It is reported as a robustness pair
  to the IV pool (does the conclusion survive a pooling rule that downweights low-precision/outlying
  trials?), never as the headline number.
- **Run status (this session):** ran-full (no MCMC; deterministic + 999-bootstrap, completed under 90s).

---

## R2 / R7 — live in `registry-ipd` (not this repo)

These two experimental engines live in the **`C:/Projects/registry-ipd`** repo and are cataloged here for
completeness; their EXPERIMENTAL banners are in their own files.

### R2 — Survival ML-NMR (piecewise-exponential / Poisson, numpy-only)

- **File:** `C:/Projects/registry-ipd/validate/survival_mlnmr.py`
- **Method:** Native survival-likelihood ML-NMR — a piecewise-exponential (PWE ↔ Poisson) network
  meta-regression with study×interval baselines, treatment effects, a prognostic covariate, and a
  treatment-by-covariate effect-modifier interaction. Fit by maximum Poisson likelihood (IRLS);
  covariance = (XᵀWX)⁻¹. IPD and AD (reconstructed-curve) trials enter as the same (study, interval,
  treatment, x, events, person_time) tuples at different granularity.
- **What validation backs it:** Its **own** output — cross-validated against an **independent
  `scipy.optimize` fit of the same Poisson log-likelihood** in
  `registry-ipd/harvest/test_phase3c_step5.py` (3 tests; the in-language oracle). No external
  R/flexsurv oracle.
- **Run status (this session):** ran-full — `pytest harvest/test_phase3c_step5.py` → **3 passed**
  (including the scipy cross-validation test).

### R7 — Royston–Parmar flexible parametric survival (inside `engine.js`)

- **File:** `C:/Projects/registry-ipd/src/engine.js` — `fitRoystonParmar` (section "5b").
- **Method:** Royston–Parmar flexible parametric (restricted cubic spline) survival fit. Because the input
  is EXACT registry (t, S) anchors, the RP model log H(t) = s(log t; γ) is fit by **OLS on (x = log t,
  y = cloglog S)** — no IPD/MLE. Yields a smooth, monotone, extrapolatable S(t).
- **What validation backs it:** Its **own** output — reproduces a known Weibull curve and stays monotone
  in `registry-ipd/test/engine.spec.js` (the in-language oracle). **No flexsurv oracle on disk.**
- **Experimental-extrapolation caveat:** This is an OLS spline through registry anchors and an
  **extrapolation**, not an MLE on patient-level data; treat extrapolated tail behaviour with caution.
- **Run status (this session):** ran-full — `node --test test/engine.spec.js` → **22 passed** (including
  the Royston–Parmar Weibull-reproduction test).

---

### Pointer / surfacing rule

If any dashboard, report, or HTML capsule surfaces G1/G2/G3/G5/R2/R7 results, it must:
1. Label them **"Experimental"** at the point of display.
2. Not present them as the primary/headline estimate.
3. Carry the relevant boundary (G3 = binary-modifier-only; G5 = sensitivity-only; R7 =
   extrapolation-from-anchors) in the surfacing copy.

These are server-side analyses; there is intentionally **no in-browser port** of the MCMC engines.
