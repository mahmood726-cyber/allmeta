# Submission-readiness checklist — NMA truth-recovery modality

Honest status of what is done and what genuine external validation / peer review
would still require. "Done" means committed and reproducible from `run_all.py`.

## Done

- [x] **Known-truth network simulation harness** with injected relative-effect
      structure, between-study variance τ², loop **inconsistency** δ (on loop-closing
      edges only, so the consistency truth stays identified), and publication/
      small-study selection, over four geometries (star, loop, ladder, dense)
      (`dgp_nma.py`, `harness_nma.py`).
- [x] **Measured coverage tables** for NaiveFE / RE / NetHK across the geometry ×
      studies-per-edge × τ² × spread grid (500 reps/cell), committed as
      `results_nma_full.json` and summarised in `REPORT.md` §1 (manuscript §3.1).
- [x] **The reproduced FE-CI bug**: NaiveFE network coverage collapses to 0.51–0.59
      at τ²=0.15 (the LivingNMA / enma-snma fixed-effect-CI failure), calibrated only
      at τ²=0.
- [x] **The honest-coverage lever validated on simulation**: RE recovers most of the
      deficit and NetHK (network Hartung–Knapp) restores 0.94–0.96 coverage across the
      heterogeneity grid; network DL τ̂² recovers the injected τ² (test contract).
- [x] **Inconsistency-test calibration measured** (manuscript §3.2): the naive
      (τ²-ignoring) design-by-treatment test over-rejects to type-I 0.24–0.79; the
      honest (common-τ² RE) test holds 0.03–0.05 with retained power (the reproduced
      sheaf-nma / enma-snma over-detector and its fix).
- [x] **Ranking over-confidence measured** (manuscript §3.3): FE SUCRA/P-score
      over-claims P(best) by up to +0.39 with spurious-best ≥0.9 up to ~22% of the
      time on tight-spread cells; the calibrated covariance halves the residual gap
      and cuts spurious-best to ~1–3%. The **Bayesian** posterior P(best) is itself
      over-confident — an honest negative.
- [x] **Publication-selection honest negative** measured (§3.4): step/Copas selection
      collapses coverage for every interval.
- [x] **Partial-identification bounds** (`partialid_nma.py`): NetHK ± c·ω̂ restores
      coverage of the consistency truth under genuine inconsistency (loop, δ=0.4:
      0.76→0.88) and collapses *exactly* to NetHK (zero width cost) on consistent /
      indirect-only (star) networks; committed as `results_partialid.json`
      (manuscript §3.5).
- [x] **Correctness contracts** as automated tests (`tests/test_nma.py`):
      unbiasedness + RE→FE reduction at τ²=0, network DL τ² recovery, honest-vs-naive
      test calibration + power, FE under-coverage / RE+NetHK recovery, ranking
      concentration, partial-ID collapse-and-restore.
- [x] **Reproducible compendium**: pinned `requirements.txt`, fixed base seed, single
      `run_all.py` / `make all` entry, `DATA_MANIFEST.md`, figures + PDF build with no
      pandoc/LaTeX dependency.
- [x] **Manuscript draft** (`paper/manuscript.md` + built `paper/manuscript.pdf`) with
      measured tables and figures, the worked example, candid limitations, and a
      reproducibility statement.

## Not yet done — required for external validation / peer review

- [ ] **Live R cross-check against `netmeta`.** The contrast-synthesis (Lu–Ades)
      point estimates and the network DerSimonian–Laird τ̂² should be anchored
      numerically (≤1e-6) against `netmeta::netmeta()` on a public dataset
      (`netmeta::Senn2013` or `netmeta::smokingcessation`). Rscript is available on the
      build host but the `netmeta` package is **not** installed, so the NMA modality
      currently has **no live R anchor** — its correctness contracts are internal
      (closed-form reductions + simulated truth) only. This is the single most
      important gap for this modality. (The pairwise and DTA modalities already carry
      live R anchors.)
- [ ] **Real-outcome validation.** Coverage / calibration are established only on
      simulation. There is no ground-truth coverage measurement on real data
      (impossible by definition); a credible external claim needs application to
      curated real network reviews and comparison of conclusions, not coverage.
- [ ] **Independent replication.** All numbers are from one author's harness on one
      machine; an independent re-run on a different platform/seed regime is needed.
- [ ] **Publication-selection correction.** A Copas/Vevea-type selection model for the
      network is not implemented; §3.4 is reported as an open problem, not a solution.
- [ ] **Multi-arm trials.** Two-arm studies only (v1). The within-study shared-control
      sampling covariance (off-diagonal τ²/2, the `platformtrialma` failure mode) is
      not modelled; required before the bench covers real multi-arm networks.
- [ ] **Software packaging.** The estimators are research code, not a documented,
      versioned package installable into the `netmeta` / `gemtc` / `multinma`
      ecosystem with an API, NEWS, and CI. Required before adoption.
- [ ] **Consistency-assumption scope.** The whole compendium targets the consistency
      estimand; node-splitting / side-splitting per-loop diagnostics and the
      disconnected-network precondition are out of scope here and would need their own
      validation.
- [ ] **Peer review** of the estimator choices (network HK floor, calibrated-ranking
      inflation factor, the c=2.0 partial-ID multiplier) by an NMA methodologist.

## One-line honest summary

The NMA modality **improves calibrated relative-effect coverage, inconsistency-test
calibration, and honest ranking uncertainty** on a known-truth network simulation,
reproducing the fixed-effect-CI collapse, the τ²-ignoring inconsistency over-detector,
and the SUCRA/P(best) over-confidence, and validating network-HK, an honest test, a
calibrated ranking covariance, and a data-driven partial-identification bound. It does
**not** yet carry a live R (`netmeta`) numerical anchor, does not correct publication
selection, does not model multi-arm covariance, and has no real-outcome validation —
all stated plainly above.
