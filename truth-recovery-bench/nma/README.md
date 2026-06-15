# NMA Truth-Recovery Bench

The **network** extension of the truth-recovery yardstick (the pairwise bench
lives one directory up). A known-truth network simulation harness that injects
heterogeneity (τ²), loop **inconsistency**, and publication selection at known
magnitude, then measures how well the standard NMA toolbox — and a truth-recovery
approach — recovers the true relative effects, controls the inconsistency test,
and states ranking certainty **honestly**.

> Truth-first: every number in `REPORT.md` is produced by `harness_nma.py` /
> `partialid_nma.py` from seeded simulations and is reproducible. Nothing is
> hand-entered. Honest negatives are reported, not hidden.

## Why this exists

The wave-2 sweep characterised the NMA repos one at a time (`LivingNMA` /
`enma-snma` fixed-effect-CI bug, `sheaf-nma`'s τ²-ignoring inconsistency
over-detection, `nmaconsistent`'s well-calibrated design-by-treatment test,
`platformtrialma`'s shared-control covariance bug). This bench turns those
scattered findings into one **measured** known-truth comparison: a single harness
where the bug, the fix, and the honest-coverage / partial-identification /
calibrated-ranking levers are all scored on the same seeded grid.

## What is measured (three stories + two bounds)

1. **Coverage of the true relative effects** — `NaiveFE` (the reproduced
   fixed-effect-CI bug, τ² ignored → coverage collapses to ~0.5 under
   heterogeneity), `RE` (proper random-effects network CI), `NetHK`
   (Hartung-Knapp honest-coverage lever, the network analogue of the HKSJ fix
   that repaired the pairwise track → back to/above nominal).
2. **Inconsistency test** type-I and power — `honest` (common RE τ², calibrated
   at ~0.05 under heterogeneity) vs `naive` (τ²-ignoring, over-rejects to
   0.24–0.79: the sheaf-nma / enma-snma failure, reproduced).
3. **Ranking over-confidence** — the headline. Claimed P(best treatment) vs the
   rate the claimed-best IS the true best. Fixed-effect SUCRA/P-score is wildly
   over-confident under heterogeneity (claims 0.81, right 0.46; declares a *wrong*
   treatment best with ≥90% confidence ~21% of the time). The **calibrated**
   covariance (NetHK × detected-inconsistency inflation) roughly halves the
   residual over-confidence and cuts the spurious-best rate to ~1–3%. The
   **Bayesian** posterior P(best) is *also* over-confident — a Bayesian framing
   does not by itself fix it.
4. **Partial-identification bounds** (`partialid_nma.py`) — for under-determined
   networks, the consistency estimand's NetHK CI widened by ±c·ω̂ where ω̂ is the
   data-driven inconsistency SD (0 when none detected). Restores coverage under
   genuine inconsistency (loop, δ=0.4: 0.68 → 0.88) while collapsing to NetHK —
   zero width cost — on consistent / indirect-only (star) networks.

## The grid

- **coverage** block: geometry {loop, ladder, dense} × studies/edge {2, 5} × τ²
  {0, 0.05, 0.15} × effect-spread {sep, tight}. (`tight` = closely-spaced top
  treatments, where "which is best?" is genuinely hard.)
- **inconsistency** block: geometry × τ² {0.05, 0.15} × true inconsistency
  {0 (type-I), 0.2, 0.5 (power)}.
- **selection** block: dense × {none, step_strong, copas_strong}.
- Partial-ID is a separate seeded experiment (loop/dense inconsistency ladder +
  star indirect-only).

Two-arm studies only (v1). Multi-arm trials add a within-study shared-control
sampling covariance (the platformtrialma failure mode) and are out of scope —
flagged honestly rather than approximated.

## Run it

```bash
# fast end-to-end check (~15 s)
python harness_nma.py --profile smoke --reps 100 --bayes-reps 30 --bayes-blocks smoke --procs 1

# full benchmark (seeded; ~5 min on 4 cores) — frequentist + Bayesian on coverage block
python harness_nma.py --profile full --reps 500 --bayes-reps 120 --bayes-blocks coverage --procs 4

# partial-identification experiment
python partialid_nma.py

# build REPORT.md
python report_nma.py

# validation gate (correctness contracts, ~6 s)
python -m pytest tests/test_nma.py -q
```

A long run checkpoints each finished cell to `results_nma_full.json.partial.jsonl`
(tail it to watch progress / resume), so it is pollable and never idle-waited.
Reproducibility: each replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, hash(cell_id)]).spawn(rep))` —
same `--reps` and `BASE_SEED` reproduce every number, process-count-independent.

## Files

- `dgp_nma.py` — known-truth network DGP (geometry, τ², injectable inconsistency, selection)
- `methods_nma.py` — frequentist consistency NMA (FE/RE + network DL τ²), network Hartung-Knapp, honest/naive inconsistency test, P-score + sampled SUCRA/P(best)
- `bayes_nma.py` — bounded BUGS-style Gibbs Bayesian NMA (CrI coverage + posterior P(best))
- `partialid_nma.py` — partial-identification bounds + measured experiment
- `harness_nma.py` — grid, seeded replication loop, per-cell checkpointing, aggregation
- `report_nma.py` — `REPORT.md` writer
- `tests/test_nma.py` — correctness gate (unbiasedness, τ² recovery, FE-bug reproduction, test calibration, ranking concentration, partial-ID contracts)
- `REPORT.md`, `results_nma_full.json`, `results_partialid.json` — measured output (generated)

## Next modalities

This is the NMA stage of the modality roll-out; **DTA** and **dose-response** are
the following two, reusing the same known-truth → measure → honest-lever recipe.
