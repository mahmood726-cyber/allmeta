# Submission-readiness checklist — DTA truth-recovery modality

Honest status of what is done and what genuine external validation / peer review
would still require. "Done" means committed and reproducible from `run_all.py`.

## Done

- [x] **Known-truth DTA simulation harness** with injected summary operating point
      (Se0=0.85, Sp0=0.80), bivariate between-study heterogeneity (τ_Se, τ_Sp) with
      a Se–Sp correlation ρ, a latent **threshold shift** (the SROC mechanism), and
      publication selection (`dgp_dta.py`, `harness_dta.py`).
- [x] **Measured coverage tables** for NaiveFE / UnivDL / Bivariate / BivarHK across
      the heterogeneity, threshold, few-studies and selection blocks (600 reps/cell),
      committed as `results_dta_full.json` and summarised in `REPORT.md`
      (manuscript §3.1–§3.4).
- [x] **The reproduced bug** (archaic-dta): independent fixed-effect pooling joint
      coverage collapses from 0.942 (τ=0) to 0.088 (τ=0.8) at k=8 — calibrated only
      at τ=0; the worst-hit number is the *joint* point, because the Se–Sp
      correlation is ignored.
- [x] **The honest lever validated on simulation**: the bivariate Reitsma MLE +
      Hartung–Knapp widening (BivarHK) restores 0.91–0.96 joint coverage across the
      heterogeneity grid and 0.92–0.94 Se coverage across the threshold grid; SROC
      AUC recovered to 0.011 at strong threshold spread.
- [x] **Partial-identification honest negative** measured: the off-summary operating
      point is only weakly identified; the partial-ID bracket improves on the
      over-confident plug-in by +0.04 to +0.11 coverage but does **not** reach
      nominal (`partialid_dta.py`, `results_partialid.json`, manuscript §3.5).
- [x] **Publication-selection honest negative** measured (§3.4); Deeks' funnel test
      reported as the detector, not a fix.
- [x] **R reference anchor embedded**: the bivariate ML fit matches
      `mada::reitsma(method="ml")` on the public 14-study **AuditC** dataset to
      tolerance **1e-3** (μ=[2.07625908, −1.26244709], Σ=[[1.22384177, 0.58323292],
      [0.58323292, 0.37488242]]); AuditC counts and anchor values are
      version-controlled inline in `tests/test_dta.py`.
- [x] **Correctness contracts** as automated tests (`tests/test_dta.py`, 8 passing):
      mada anchor, closed-form FE reduction + truth recovery at τ=0, joint-region
      calibration, FE-collapse / bivariate-HK recovery, threshold-Spearman rise,
      partial-ID improvement, selection-collapse honest negative.
- [x] **Reproducible compendium**: pinned `requirements.txt`, fixed base seed,
      single `run_all.py` / `make all` entry (with `--smoke` and `--no-sim`),
      `DATA_MANIFEST.md`, figures + PDF build with no pandoc/LaTeX dependency.
- [x] **Manuscript draft** (`paper/manuscript.md` + built `paper/manuscript.pdf`)
      with measured tables and figures, candid limitations, reproducibility statement.

## Not yet done — required for external validation / peer review

- [ ] **Live R re-run of the `mada::reitsma` anchor.** The AuditC anchor in
      `tests/test_dta.py` is an offline-validated *hardcoded* reference; `mada` is
      **not installed on this build host**, so the anchor has not been re-confirmed
      live this session. Installing `mada` (and `mvmeta`) and re-running
      `reitsma(method="ml")` to re-confirm the five anchored values is the single
      most important remaining external-validation step.
- [ ] **Real-outcome validation.** Coverage is established only on simulation. There
      is no ground-truth coverage measurement on real data (impossible by
      definition); a credible external claim needs application to curated real DTA
      reviews and comparison of conclusions, not coverage.
- [ ] **Independent replication.** All numbers are from one author's harness on one
      machine; an independent re-run on a different platform/seed regime is needed.
- [ ] **Publication-selection correction.** A Copas/Vevea-type selection model for
      the bivariate DTA operating point is not implemented; §3.4 is reported as an
      open problem, not a solution.
- [ ] **Software packaging.** The estimators are research code, not a documented,
      versioned package installable into the `mada` / `mvmeta` ecosystem with an API,
      NEWS, and CI. Required before adoption.
- [ ] **Beyond the single-threshold / diagonal-within-study assumption.**
      Multiple-threshold and comparative (head-to-head) designs add off-diagonal
      within-study covariance and are untested here. HSROC (Rutter–Gatsonis)
      parameterisation and explicit covariate meta-regression are also out of scope.
- [ ] **Peer review** of the estimator choices (HK widening, the partial-ID bracket
      construction) by a DTA-MA methodologist.

## One-line honest summary

The DTA modality **improves calibrated coverage of the summary operating point and
its joint region under between-study heterogeneity and threshold variation** on a
known-truth simulation, reproducing the correlation-naïve collapse and validating a
bivariate Reitsma + Knapp–Hartung fix anchored against `mada::reitsma`. It does
**not** carry a *live* (re-run) R anchor on this host, does not make an arbitrary
off-summary operating point fully identified, does not correct publication
selection, and has no real-outcome validation — all stated plainly above.
