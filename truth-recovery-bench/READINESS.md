# Submission-readiness checklist -- Pairwise truth-recovery modality

Honest status of what is done and what genuine external validation / peer review
would still require. "Done" means committed and reproducible from `run_all.py`.

## Done

- [x] **Known-truth simulation harness** injecting a true mu, between-study variance
      tau^2, and a parameterised publication-selection mechanism (Vevea-Hedges p-step
      weights and a Copas latent-selection model) at known magnitude, with k as the
      *published* count (`dgp.py`, `harness.py`).
- [x] **Measured leaderboard** for ten established methods (DL, REML, PM, HKSJ,
      Vevea-Hedges, Copas-Shi, RoBMA-core, PET-PEESE, trim-and-fill, GRMA) plus four
      selection-aware contributions (NPE, PVS, PartialID, Unified) across the 55-cell
      grid (1000 reps/cell), committed as `results_merged.json` and summarised in
      `REPORT.md` (manuscript §3).
- [x] **The reproduced pathology**: under strong p-step selection, naive RE coverage
      of the true mu collapses *as k grows* (DL 0.56 -> 0.00 from k=5 -> k=50; HKSJ
      0.83 -> 0.00) -- the fixed selection bias with a narrowing interval.
- [x] **The honest levers validated on simulation**: PartialID 0.96-0.99 and Unified
      0.99-1.00 coverage on the joint selection condition (k>=15), |bias| 0.010
      (Unified) vs 0.104 (incumbents), type-I <=0.036 everywhere, no small-k blow-up.
- [x] **R-reference correctness anchors** as automated tests (`tests/test_methods.py`):
      Vevea-Hedges == `metafor::selmodel(type="stepfun", steps=0.025)` on
      (mu, tau^2, delta_2, se) to <=5e-3/1e-2; Copas-Shi == `metasens`
      `copas.loglik.without.beta` profile MLE along the publprob path (>=5 points,
      mu<2e-3, tau<5e-3); REML == brute-force restricted-likelihood grid; HKSJ floor
      widens-never-narrows. **7/7 passing.**
- [x] **Unified-estimator contract / calibration gate** (`tests/test_unified.py`):
      feature parity, Track-2 contracts, PVS no-small-k-blowup, NPE/Unified
      determinism + permutation-invariance + union-dominance, and a calibration-
      regression tripwire on `sbi_diagnostics.json`. **9/9 passing** (runs in the core
      environment; this benchmark's NPE is scikit-learn-based, no torch needed).
- [x] **Reproducible compendium**: pinned `requirements.txt`, fixed base seed, single
      `run_all.py` / `make all` entry, `--smoke` and `--no-sim` paths,
      `DATA_MANIFEST.md`, three figures + a reportlab PDF build with no pandoc/LaTeX
      dependency.
- [x] **Manuscript draft** (`paper/manuscript.md` + built `paper/manuscript.pdf`) with
      measured tables copied verbatim from `REPORT.md`, figures, the worked example,
      candid limitations and a reproducibility statement.

## Not yet done -- required for external validation / peer review

- [ ] **Live R round-trip for the anchors.** The Vevea-Hedges (`metafor::selmodel`)
      and Copas (`metasens`) numbers are validated against *recorded* reference
      values fixed in the tests. Re-running those R packages on the build host at test
      time to refresh the recorded anchors against the current releases is the single
      most important remaining correctness step. (R is available on the host; a
      scripted `Rscript` round-trip writing the oracle JSON is the concrete task.)
- [ ] **Real-outcome validation.** Coverage is established only on simulation; there
      is no ground-truth coverage measurement on real data (impossible by definition).
      A credible external claim needs application to curated real meta-analyses
      (e.g. Cochrane reviews with known later large trials) and comparison of
      conclusions, not coverage.
- [ ] **SBI amortization re-train + diagnostics refresh.** `sbi_model.pkl` is a
      committed pre-computed artifact. A clean retrain (`python train_sbi.py`, seeded,
      scikit-learn only) with regenerated SBC/PIT and held-out exact-DGP coverage, on
      a second machine, is needed to confirm the amortized model is reproducible and
      not over-fit to one training draw.
- [ ] **Publication-selection only handled for the modelled mechanisms.** The Unified
      interval targets coverage under the p-step + Copas mixture it was bounded/trained
      over; an unknown or adversarial mechanism outside that support is uncovered. The
      general publication-bias problem remains open (flagged identically across all
      modalities of this bench).
- [ ] **Independent replication.** All numbers are from one author's harness on one
      machine; an independent re-run on a different platform/seed regime is needed.
- [ ] **Software packaging.** The estimators are research code, not a documented,
      versioned package installable into the `metafor`/`metasens` ecosystem with an
      API, NEWS, and CI. Required before adoption.
- [ ] **Peer review** of the estimator choices (the NPE training mixture, the
      conformal severity proxy, the PartialID severity ladder, the union rule) by a
      meta-analysis methodologist.

## One-line honest summary

The pairwise modality **reproduces the joint heterogeneity-plus-selection coverage
collapse** of the incumbent field on a known-truth simulation and **validates a
selection-aware partial-identification interval (Unified)** that restores calibrated
coverage under the modelled mechanisms, with R-reference correctness anchors for the
ten base ports. It does **not** carry a *live* R round-trip (only recorded
metafor/metasens anchors), does not solve unmodelled publication selection, and has
no real-outcome validation -- all stated plainly above.
