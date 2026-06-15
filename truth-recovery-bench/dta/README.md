# DTA Truth-Recovery Bench

The **diagnostic-test-accuracy** extension of the truth-recovery yardstick (the
pairwise bench lives two directories up; the NMA bench is its sibling). A
known-truth DTA simulation harness that injects between-study heterogeneity
(τ_Se, τ_Sp), the Se–Sp **threshold effect**, and publication selection at known
magnitude, then measures how well the standard DTA toolbox — and a truth-recovery
approach — recovers the true summary operating point and its joint uncertainty
**honestly**.

> Truth-first: every number in `REPORT.md` is produced by `harness_dta.py` /
> `partialid_dta.py` from seeded simulations and is reproducible. Nothing is
> hand-entered. Honest negatives are reported, not hidden.

## Why this exists

The wave-2 sweep found the `archaic-dta` failure mode: **naive independent
fixed-effect pooling of Se and Sp** has no τ² and ignores the Se–Sp correlation,
so its intervals collapse to within-study width and under-cover catastrophically
(75% → 20–25%) as heterogeneity rises. A bivariate random-effects (Reitsma) fix
was shipped. This bench turns that finding into a **measured** known-truth
comparison: a single harness where the bug, the bivariate fix, and the
honest-coverage / partial-identification levers are scored on one seeded grid.

The bivariate MLE here is a pure-numpy/scipy port of the audited
`shared/dta-bivariate.js` and matches `mada::reitsma(method="ml")` on the AuditC
dataset to ~1e-6 (anchored in the test gate).

## What is measured

1. **Coverage as heterogeneity rises** — marginal coverage of true Se and true Sp,
   and **joint** coverage of the true (Se,Sp) point by the 2-D region, for
   `NaiveFE` (the reproduced bug), `UnivDL` (per-margin DerSimonian–Laird τ²),
   `Bivariate` (Reitsma RE), and `BivarHK` (bivariate + Hartung-Knapp honest
   coverage, the lever). The naive joint coverage is the worst-hit number —
   ignoring the Se–Sp correlation mis-shapes the whole region.
2. **Threshold variation** — as the per-study positivity threshold varies, Se and
   Sp trade off (the Se–Sp negative correlation), the operating points spread
   along an SROC curve, and the threshold-effect Spearman climbs. Measured: the
   under-coverage of the naive point, the bivariate recovery, and SROC-AUC
   recovery (AUC via the normal CDF, not the logistic).
3. **Few-studies regime** — small k stresses the bivariate MLE; convergence rate
   and the honest width cost are reported.
4. **Publication / small-study selection** — step/Copas selection on the log-DOR;
   coverage collapses for every method (the honest boundary), with Deeks' funnel
   test as the detector.
5. **Partial-identification of the SROC operating point** (`partialid_dta.py`) —
   the summary point is identified, but Se at a *target* specificity needs the
   SROC slope, which is weakly identified at small k / little threshold spread.
   The partial-ID bracket (union of the two SROC regression-direction predictions)
   **materially improves** on the badly over-confident plug-in interval (+0.05–0.11
   coverage) but, honestly, does **not** reach nominal — extrapolating the SROC away
   from the summary mean is genuinely only partially identified from aggregate data.
   The object the lever fully recovers is the summary operating point (Section 1).

## The grid

- **coverage** block: k {8, 20} × (τ_Se, τ_Sp) {0, 0.25, 0.5, 0.8}, ρ=−0.3.
- **threshold** block: k=15 × threshold spread {0, 0.3, 0.6, 1.0}.
- **fewstudies** block: k {4, 5, 6, 10} at moderate heterogeneity.
- **selection** block: k=15 × {none, step_strong, copas_strong}.
- Partial-ID is a separate seeded experiment (k ladder + threshold-spread ladder).

True summary point Se0 = 0.85, Sp0 = 0.80. Working scale (logit Se, logit FPR),
FPR = 1 − Sp.

## Run it

```bash
# fast end-to-end check (~1 min)
python harness_dta.py --profile smoke --reps 200 --procs 1

# full benchmark (seeded; ~few min on 4 cores)
python harness_dta.py --profile full --reps 600 --procs 4

# partial-identification experiment
python partialid_dta.py

# build REPORT.md
python report_dta.py

# validation gate (correctness contracts + mada anchor, ~3 min)
python -m pytest tests/test_dta.py -q
```

A long run checkpoints each finished cell to `results_dta_full.json.partial.jsonl`
(tail it to watch progress / resume), so it is pollable and never idle-waited.
Reproducibility: each replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, hash(cell_id)]).spawn(rep))` —
same `--reps` and `BASE_SEED` reproduce every number, process-count-independent.

## Files

- `dgp_dta.py` — known-truth DTA DGP (τ_Se/τ_Sp, Se–Sp correlation, threshold variation, selection)
- `methods_dta.py` — naive FE pool (the bug), univariate DL, bivariate Reitsma MLE (+ Hartung-Knapp), SROC/AUC, threshold Spearman, Deeks' test
- `partialid_dta.py` — SROC operating-point partial-identification bracket + measured experiment
- `harness_dta.py` — grid, seeded replication loop, per-cell checkpointing, aggregation
- `report_dta.py` — `REPORT.md` writer
- `tests/test_dta.py` — correctness gate (mada AuditC anchor, FE-bug reproduction, joint-region calibration, threshold detection, partial-ID contract)
- `REPORT.md`, `results_dta_full.json`, `results_partialid.json` — measured output (generated)

## Reproduce in one command

The whole compendium — simulation, report, figures, manuscript PDF and the
correctness/anchor test gate — rebuilds from one entry point (`run_all.py`, mirrored
by the `Makefile`). No pandoc or LaTeX is needed; the PDF is built with reportlab.

```bash
python -m pip install -r requirements.txt   # numpy/scipy/matplotlib/reportlab/pytest, pinned

python run_all.py            # full: harness (600 reps) -> partial-ID -> report
                             #       -> figures -> worked example -> PDF -> pytest (~7 min)
python run_all.py --smoke    # fast end-to-end sanity check (200 reps, ~1 min)
python run_all.py --no-sim   # skip the simulation; rebuild report/figures/paper
                             # from the committed results JSON (seconds)

# or, equivalently, with GNU make:
make all      # full reproduction        make smoke   # fast check
make figures  # figures only             make paper   # build paper/manuscript.pdf
make test     # correctness + mada anchor gate
```

Determinism: base seed 20260615; the same `--reps` reproduce every number regardless
of `--procs`, and the full profile reproduces the committed `results_dta_full.json`
and `results_partialid.json` exactly. Pinned environment in `requirements.txt`; data
description in `DATA_MANIFEST.md`; submission status and remaining gaps (including the
live `mada` R re-run) in `READINESS.md`; the publication-grade write-up with the
measured tables and figures in `paper/manuscript.md` (`paper/manuscript.pdf`).

## Next modality

This is the DTA stage of the modality roll-out; **dose-response** is the last one,
reusing the same known-truth → measure → honest-lever recipe.
