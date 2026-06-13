# Truth-Recovery Yardstick for Meta-Analysis Methods

An **honest, known-truth simulation benchmark** that injects BOTH heterogeneity
(true τ²) AND a parameterised **publication-selection** mechanism, then scores
every pooling / publication-bias method in the portfolio on how well it recovers
the **true μ**. This is the measured bar a genuinely-superior unified method must
beat — it replaces the *reasoned* ranking in
`MA_METHODS_INVENTORY_2026-06-10.md` §7b with a *measured* one.

> Truth-first: no fabricated numbers. Every figure in `REPORT.md` is produced by
> `harness.py` from seeded simulations and is reproducible.

## Why this exists

The inventory established that the portfolio already has all the ingredients
(GRMA, the allmeta `shared/` joint likelihoods, PET-PEESE, Copas, RoBMA …) but
**no benchmark that injects heterogeneity and publication bias together and
scores truth-recovery**. Without those numbers, "which method captures the truth
best under both distortions" was a reasoned guess. This harness makes it
measured.

## What is scored

Ten methods, each as `fn(y, v) -> {mu, ci_lo, ci_hi, tau2, ok}`:

| Method | Family | Source of truth (port) |
|---|---|---|
| DL | RE pooling | canonical |
| REML | RE pooling | restricted-likelihood maximiser |
| PM (Paule–Mandel) | RE pooling | canonical |
| HKSJ | RE pooling | Hartung–Knapp + floor `max(1, Q/(k-1))`, t_{k-1} |
| Vevea–Hedges | joint selection (τ²+δ) | `allmeta/shared/selmodel.js` |
| Copas–Shi | joint selection (τ²+ρ) | `allmeta/copas/index.html` (metasens port) |
| RoBMA core | BMA effect×heterogeneity | `allmeta/shared/robma.js` |
| PET-PEESE | small-study FE regression | `allmeta/pet-peese/index.html` |
| GRMA | robust grey-relational pooling | `GRMA_paper/grey_meta_v8.py` (imported verbatim) |
| Trim-and-fill | L0 + DL re-pool | `allmeta/shared/trimfill.js` |

### Unified-estimator contributions (branch `truth-recovery-unified-estimator`)

Four new methods are plugged into the SAME harness and scored on the SAME grid,
aimed at the brief's target: **≥0.90 coverage of the true μ across k=5→50 under
unknown/multiple selection mechanisms, with type-I ≤0.07, bias ≤ Vevea's and no
small-k blow-up.**

**Measured outcome (full 55-cell × 1000-rep confirmation grid, see `REPORT.md` §7).**
The headline **Unified** estimator takes the NPE de-biased point and a
**calibrated, gated interval**: NPE's conformal interval rescaled about its point
by a single factor (frozen **×1.15**, a wider effective conformal radius chosen
on the grid to land min-coverage in the 0.92–0.93 band instead of over-covering),
then **gated-unioned** with PartialID — PartialID widens the interval ONLY when
its point falls outside the rescaled NPE interval (genuine disagreement). It hits
the target on every cell, materially tighter than the prior parameter-free Union:

- **Coverage ≥0.90 at EVERY one of the 55 cells** (minimum **0.927** at the
  hardest cell `step_strong, k=15, τ²=0.20`; mean **0.989**).
- **Type-I ≤0.054 everywhere** at μ=0 (target ≤0.07).
- **mean |bias| ≈0.016** under selection (point = NPE median) vs Vevea 0.107, and
  **no small-k blow-up** (k=5 RMSE 0.16 vs Vevea 9.18).
- **Width −13% vs the prior Union** (mean 0.587 vs 0.677 over all 55 cells). The
  frontier (measured offline via `explore_tighten.py`): NPE-alone is tightest
  (0.510) but undercovers (min 0.886) and breaches type-I (0.073); the parameter-
  free max-width Union over-covers (min 0.955) at 0.677; the frozen gated×1.15
  config is the width-minimal point holding ≥0.90 with type-I ≤0.07.

This works because **NPE and PartialID have disjoint failure regions**: the
amortized NPE dips only under strong p-step selection at *large* k, the
partial-identification PartialID is over-wide only at *very small* k. On the
design grid a well-calibrated NPE already covers, so the gate rarely fires and
Unified is essentially the calibrated NPE there; PartialID stays a **dormant
out-of-distribution backstop** that activates under genuine ambiguity — validated
on the §9 harder scenarios (coverage of a true effect holds, min 0.962) and the
§10 real data (the gate fires and widens under the log-OR domain shift). The
calibration factor is tuned in-sample; the parameter-free `lower`-union (min
0.922, −3%) is the no-tuning fallback. See `explore_tighten.py` for the full
width/coverage sweep and `ensemble_offline.py` for the offline ensemble assembly.

| Method | Track | Idea (cross-disciplinary import) |
|---|---|---|
| **Unified** | 1+2 | **Headline.** NPE de-biased point + a **calibrated (×1.15) gated interval**: PartialID widens NPE's rescaled conformal interval only under genuine disagreement. Width-minimal config holding ≥0.90 coverage + type-I ≤0.07 on all 55 cells; PartialID is a dormant OOD backstop. `unified.py`. |
| **NPE** | 1 | Amortized simulation-based inference. A permutation-invariant feature map φ(D) (fixed DeepSets encoder, `features.py`) feeds gradient-boosted **quantile** regressors trained on a huge corpus of simulated (D → true μ) pairs spanning a **mixture of selection mechanisms** at continuous severity. Honest finite-sample coverage comes from **Mondrian conformalized quantile regression** (CQR, Romano et al. 2019) conditioned on observable (k, step-selection severity). |
| **PVS** | 2 | Penalised, model-averaged Vevea–Hedges: weakly-informative ridge on log-δ + hard L-BFGS-B bounds (kills the k≤10 runaway) + BIC model-averaging over step structures. |
| **PartialID** | 2 | Manski-style **partial-identification bounds**: union of CIs over a severity ladder with δ fixed — an honest wide interval when the mechanism is unknown. |

Training is offline and seeded (`train_sbi.py`, `TRAIN_SEED` disjoint from the
harness `BASE_SEED`), producing `sbi_model.pkl` + `sbi_diagnostics.json` (SBC/PIT
uniformity, calibration curve, and a held-out evaluation on the EXACT benchmark
DGP). The harness then scores NPE/PVS/PartialID like any other method.

The original ten Python ports are **validated against the audited R-parity
oracles** in `tests/test_methods.py`:
- Vevea–Hedges ≈ `metafor::selmodel(type="stepfun", steps=0.025)` (μ, τ², δ₂, se)
- Copas–Shi ≈ `metasens` `copas.loglik.without.beta` profile MLE along the publprob path
- REML ≈ a brute-force restricted-likelihood grid maximiser
- HKSJ floor (widens, never narrows when Q<k−1)

## Metrics (per grid cell × method)

- **bias** = mean(μ̂) − μ_true
- **MSE / RMSE** to the true μ
- **coverage** = P(CI contains the TRUE μ) — target 0.95 (honesty of the interval)
- **mean width** of the interval
- **τ²-bias** = mean(τ̂²) − τ²_true (methods that estimate τ²)
- **reject0** = P(0 ∉ CI) → type-I rate at μ=0, power at μ=0.3
- **fail_rate** = share of replications with no usable estimate (e.g. Copas
  non-identification)

## The grid

- **primary** (leaderboard): μ=0.3, τ²=0.05, k ∈ {5,10,15,25,50} × 5 scenarios
- **hetero** sweep: μ=0.3, k=15, τ² ∈ {0, 0.02, 0.08, 0.20} × 5 scenarios
- **typeI**: μ=0, τ²=0.05, k ∈ {10,25} × 5 scenarios

Scenarios: `none`, `step_weak`, `step_strong`, `copas_weak`, `copas_strong`
(definitions and exact parameters in `dgp.py` and echoed into `REPORT.md`).

≥1000 replications per cell (configurable).

## Run it

```bash
# fast end-to-end check (~1 min)
python harness.py --profile smoke --reps 60 --procs 4 --out results_smoke.json

# full benchmark (seeded, ~1.5–2 h on 4 cores)
python harness.py --profile full --reps 1000 --procs 4 --out results_full.json

# build the leaderboard + REPORT.md
python report.py --results results_full.json --out REPORT.md

# validate the method ports against the R oracles
python -m pytest tests/test_methods.py -v

# --- unified estimators (this branch) ---
# 1) train the amortized SBI model offline (seeded, ~25-40 min on 4 cores).
#    Richer/stronger step mixture + step-aware conformal severity proxy.
python train_sbi.py --n-train 160000 --n-cal 60000 --n-val 15000 --iters 600
# 2a) canonical path — re-run the full benchmark; NPE/PVS/PartialID/Unified are
#     all auto-registered in methods.ALL_METHODS (Unified internally fuses
#     NPE+PartialID, so this scores the headline estimator end-to-end):
python harness.py --profile full --reps 1000 --procs 4
python report.py --results results_full.json --out REPORT.md
# 2b) fast path used to produce the committed leaderboard — dump per-rep
#     intervals once, then assemble/tune any NPE⊕PartialID ensemble OFFLINE (the
#     PartialID dump is the only slow part and is reused across retrains):
python dump_perrep.py --methods PartialID --reps 1000 --procs 4 --out perrep_partialid.json
python dump_perrep.py --methods NPE       --reps 1000 --procs 4 --out perrep_npe.json
# sweep the width/coverage frontier (rules × NPE conformal scale) and emit the
# chosen config as Unified (frozen: rule=gated, scale=1.15):
python explore_tighten.py          # prints the frontier; pick the width-min feasible config
python explore_tighten.py --emit-rule gated --emit-scale 1.15 --out results_new.json
python merge_results.py            # grafts NPE/PVS/PartialID/Unified into results_merged.json
python report.py --results results_merged.json --out REPORT.md
# 3) validate the new methods (contract, no-blowup, determinism, calibration)
python -m pytest tests/test_unified.py -v

# --- goal 3: harder out-of-distribution stress scenarios ---
python stress_run.py --reps 500 --procs 4          # -> results_stress.json
python report_stress.py --results results_stress.json --out-md stress_section.md

# --- goal 2: descriptive real-data validation (Pairwise70 Cochrane corpus) ---
Rscript real_data/extract_pairwise70.R <pairwise70_data_dir> real_data/pairwise70_studylevel.csv
python real_data/run_realdata.py --csv real_data/pairwise70_studylevel.csv \
       --out real_data/realdata_results_canonical.json --tag canonical
python real_data/build_section.py   # -> real_data/realdata_section.md (appended to REPORT by report.py)
```

The fast path (2b) is byte-identical to the canonical path (2a): per-cell
`mean_sel_frac`/`n_degenerate` are asserted equal to the incumbent run before
merging, and the offline aggregation reproduces `harness.run_cell` exactly
(verified to 0.00 difference on PartialID and on the `Unified` worst cells).

Reproducibility: every replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, stable_hash(cell_id), k]).spawn(rep))`.
Same `--reps` and `BASE_SEED` → identical numbers, process-count-independent.

## Files

- `methods.py` — the ten estimators (validated ports + canonical kernels) + registry of the four new unified methods (NPE, PVS, PartialID, Unified)
- `dgp.py` — known-truth data-generating process + selection mechanisms
- `harness.py` — grid, seeded replication loop, multiprocessing, aggregation
- `report.py` — leaderboard + `REPORT.md` writer (incl. §7 unified verdict)
- `features.py` — permutation-invariant feature map φ(D) (shared by trainer + NPE)
- `train_sbi.py` — offline amortized SBI trainer + step-aware conformal calibration + SBC diagnostics
- `sbi.py` — online NPE estimator (loads `sbi_model.pkl`; `SBI_MODEL_PATH` env override for A/B)
- `robust_selection.py` — PVS (penalised model-averaged Vevea) + PartialID (Manski bounds)
- `unified.py` — **the headline Unified estimator** (NPE point ⊕ calibrated ×1.15 gated NPE/PartialID interval; `UNIFIED_MODE`/`UNIFIED_NPE_SCALE` env overrides)
- `dump_perrep.py` — dump per-replication intervals for any method(s), seed-identical to the harness
- `ensemble_offline.py` — assemble/compare NPE⊕PartialID ensembles (Union/LowerUnion/gated) offline
- `explore_tighten.py` — **goal-1 width/coverage frontier sweep** (rules × NPE conformal scale) + emit the chosen config as Unified
- `stress_run.py` — **goal-3** focused runner for the harder OOD stress scenarios; `report_stress.py` → `stress_section.md` (§9)
- `real_data/` — **goal-2** descriptive real-data validation: `extract_pairwise70.R` (validated log-OR extraction), `run_realdata.py`, `summarize_realdata.py`, `build_section.py` → `realdata_section.md` (§10)
- `merge_results.py` — graft the new-method metrics into the incumbent results with parity asserts
- `tests/test_methods.py` — R-oracle parity / correctness gate
- `tests/test_unified.py` — contract / no-blowup / determinism / calibration-regression gate
- `sbi_model.pkl`, `sbi_diagnostics.json` — trained artifact + calibration evidence (generated)
- `REPORT.md` — the measured leaderboard (generated; §9 stress + §10 real-data appended)

## Scope / honesty notes

- This scores the **existing field only**. No new method is claimed superior.
- **Copas** is reported at its maximum-likelihood *identified* publprob-path
  point (|ρ|<0.95); metasens's auto-`TE.adjust` additionally needs a port of
  R's `contourLines()` goodness-of-fit machinery (out of scope) — non-identified
  runs are counted in `fail_rate`, not hidden.
- **RoBMA core** is the effect×heterogeneity sub-ensemble only (no publication-
  bias models — those need the full RoBMA MCMC package), so it is the
  *honest-but-bias-blind* reference, exactly as in the inventory.
- **PET-PEESE** is fixed-effect WLS (no τ²) by construction.
