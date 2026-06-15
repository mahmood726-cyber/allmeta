# Dose-Response Truth-Recovery Bench

The **dose-response** extension of the truth-recovery yardstick — the final
modality in the roll-out (pairwise → NMA → DTA → dose-response). A known-truth
dose-response simulation harness that injects a true dose-response curve, the
Greenland-Longnecker within-study correlation, between-study slope heterogeneity
(τ²), and publication selection at known magnitude, then measures how well the
standard one-stage and two-stage dose-response MA toolbox — and a truth-recovery
approach — recovers the true slope / curve **honestly**.

> Truth-first: every number in `REPORT.md` is produced by `harness_dose.py` from
> seeded simulations and is reproducible. Nothing is hand-entered. Honest negatives
> are reported, not hidden.

## Why this exists

The wave-2 sweep found the `dose-response-pro` failure: the two-stage pool's
heterogeneity handling collapses the slope interval — in its starkest form a
fixed-effect / τ²-ignored pool covers the true slope only ~6–17% of the time once
the slope is heterogeneous. A REML fix was indicated. This bench turns that finding
into a **measured** known-truth comparison: the bug, the DL partial-fix, the
REML + Knapp-Hartung honest lever, and the one-stage comparator all scored on one
seeded grid, plus the nonlinearity honest negative.

## What is measured

1. **Slope coverage as heterogeneity rises** — coverage of the true slope β for
   `NaiveFE` (fixed-effect, τ² ignored — the reproduced collapse to ~0.07),
   `DL` (DerSimonian-Laird RE + z; recovers most but under-covers at small k),
   `REML_HK` (REML τ² + Knapp-Hartung t with the HKSJ floor — the honest lever),
   and `OneStage` (one-stage random-slope mixed model, REML). Plus τ² recovery
   (DL vs REML) and interval widths.
2. **Nonlinearity** — under a quadratic truth g(d)=βd+γd², a pooled LINEAR fit is
   misspecified (biased slope, under-covered curve at the test doses); the
   QUADRATIC multivariate random-effects pool of the [β₁,β₂] coefficients recovers
   the curve. The honest negative: it needs studies with ≥2 distinct non-reference
   doses to identify the second coefficient.
3. **Publication / small-study selection** — step/Copas selection on the study
   slope biases the pool and collapses coverage for every method (the boundary).

## Model

Per study: non-reference log-RRs y vs a shared reference, with the
Greenland-Longnecker within-study covariance (Var = 1/a_j + 1/a₀, off-diagonal =
1/a₀ from the shared reference cases). Stage 1 = per-study GLS slope (linear) or
[β₁,β₂] (quadratic). Stage 2 = pool across studies. One-stage = marginal
random-slope model y_i ~ MVN(B·d_i, C_i + τ²·d_i d_iᵀ), profile REML over τ².

## The grid

- **slope** block: k {6, 10, 20} × τ² {0, 0.05, 0.15, 0.30}, true β=0.30.
- **nonlinear** block: curvature γ {−0.03, −0.06} × k {10, 20}, quadratic truth.
- **selection** block: k=12 × {none, step_strong, copas_strong}.

## Run it

```bash
# fast end-to-end check (~1 min)
python harness_dose.py --profile smoke --reps 300 --procs 1

# full benchmark (seeded; ~few min on 4 cores)
python harness_dose.py --profile full --reps 1000 --procs 4

# build REPORT.md
python report_dose.py

# validation gate (correctness contracts, ~40 s)
python -m pytest tests/test_dose.py -q
```

A long run checkpoints each finished cell to `results_dose_full.json.partial.jsonl`
(tail it to watch progress / resume), so it is pollable and never idle-waited.
Reproducibility: each replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, hash(cell_id)]).spawn(rep))` —
same `--reps` and `BASE_SEED` reproduce every number, process-count-independent.

## Files

- `dgp_dose.py` — known-truth dose-response DGP (linear/quadratic curve, GL covariance, slope τ², selection)
- `methods_dose.py` — stage-1 GLS (linear + quadratic), two-stage poolers (FE bug / DL / REML+HK), one-stage random-slope REML, multivariate curve pool
- `harness_dose.py` — grid, seeded replication loop, per-cell checkpointing, aggregation
- `report_dose.py` — `REPORT.md` writer
- `tests/test_dose.py` — correctness gate (slope recovery, FE collapse / REML recovery, τ² recovery, nonlinearity, selection negative)
- `REPORT.md`, `results_dose_full.json` — measured output (generated)

## Modality set complete

This is the last of the planned modalities. The truth-recovery yardstick now spans
**pairwise → NMA → DTA → dose-response**, each with the same known-truth → measure
standard toolbox → develop + validate honest lever → report honest negatives recipe.
