# Submission-readiness checklist — Dose-Response truth-recovery modality

Honest status of what is done and what genuine external validation / peer review
would still require. "Done" means committed and reproducible from `run_all.py`.

## Done

- [x] **Known-truth simulation harness** with injected slope β, curvature γ,
      between-study variance τ², GL within-study covariance, and publication
      selection (`dgp_dose.py`, `harness_dose.py`).
- [x] **Measured coverage tables** for NaiveFE / DL / REML+HK / OneStage across the
      heterogeneity grid (1000 reps/cell), committed as `results_dose_full.json` and
      summarised in `REPORT.md` (manuscript §3.1).
- [x] **The reproduced bug**: NaiveFE slope coverage collapses to 0.07–0.21 under
      heterogeneity (the dose-response-pro failure), calibrated only at τ²=0.
- [x] **The honest lever validated on simulation**: REML+HK and OneStage restore
      0.94–0.96 coverage; τ̂² recovery confirmed (DL ≈ REML ≈ true to two decimals).
- [x] **Nonlinearity honest negative** measured (linear-fit curve under-coverage;
      quadratic multivariate recovery) — §3.2.
- [x] **Publication-selection honest negative** measured (§3.3).
- [x] **Correctness contracts** as automated tests (`tests/test_dose.py`):
      closed-form reduction at τ²=0, τ̂² recovery, behavioural inequalities.
- [x] **Reproducible compendium**: pinned `requirements.txt`, fixed base seed,
      single `run_all.py` / `make all` entry, `DATA_MANIFEST.md`, figures + PDF build
      with no pandoc/LaTeX dependency.
- [x] **Manuscript draft** (`paper/manuscript.md` + built `paper/manuscript.pdf`)
      with measured tables and figures, candid limitations, reproducibility statement.

## Not yet done — required for external validation / peer review

- [ ] **Live R cross-check against `dosresmeta`.** The two-stage GL-GLS slope should
      be anchored numerically (≤1e-6) against `dosresmeta::dosresmeta()` on a public
      dataset (Bonjour coffee–CHD). R 4.6 is available on the build host but the
      `dosresmeta` package is not installed; this is the single most important gap
      for this modality. (Pairwise and DTA modalities already carry live R anchors.)
- [ ] **Real-outcome validation.** Coverage is established only on simulation. There
      is no ground-truth coverage measurement on real data (impossible by
      definition); a credible external claim needs application to curated real
      dose–response reviews and comparison of conclusions, not coverage.
- [ ] **Independent replication.** All numbers are from one author's harness on one
      machine; an independent re-run on a different platform/seed regime is needed.
- [ ] **Publication-selection correction.** A Copas/Vevea-type selection model for
      the dose–response slope is not implemented; §3.3 is reported as an open
      problem, not a solution.
- [ ] **Software packaging.** The estimators are research code, not a documented,
      versioned package installable into the `dosresmeta`/`mvmeta` ecosystem with an
      API, NEWS, and CI. Required before adoption.
- [ ] **Misspecification beyond quadratic** (splines, non-monotone curves) and
      **non-PH / non-RR effect scales** are untested.
- [ ] **Peer review** of the estimator choices (HK floor, one-stage profiling) by a
      dose–response-MA methodologist.

## One-line honest summary

The dose-response modality **improves calibrated slope coverage under between-study
heterogeneity** on a known-truth simulation, reproducing the heterogeneity-naïve
collapse and validating a REML + Knapp–Hartung fix. It does **not** yet carry a live
R (`dosresmeta`) numerical anchor, does not correct publication selection, and has
no real-outcome validation — all stated plainly above.
