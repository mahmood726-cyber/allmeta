# Data manifest -- Pairwise truth-recovery modality

## Datasets used

This modality uses **simulated data only** for the leaderboard. No external
dataset is required to reproduce any number or figure in the simulation study. The
"data" are known-truth meta-analyses generated on the fly by `dgp.py` from a fixed
base seed (`20260611`): studies are drawn from theta_i ~ N(mu, tau^2),
y_i ~ N(theta_i, v_i) with log-uniform standard errors on [0.10, 0.70], then a
parameterised publication-selection mechanism (one-sided p-value step weights, or a
Copas latent-selection model) is applied at a **known** magnitude. Because the true
mu, tau^2 and selection fraction are known exactly, the *actual* coverage of each
method's interval can be measured -- which is impossible on real data.

| Artifact | Produced by | Role | Committed? |
|---|---|---|---|
| `results_merged.json` | `harness.py` (+ `merge_results.py` grafting NPE/PVS/PartialID/Unified) | The measured results behind the manuscript and all of `REPORT.md`; the source for the figures. | yes |
| `results_full.json` | `harness.py --profile full --reps 1000` | The incumbent-method run before the unified methods are grafted in. | yes |
| `REPORT.md` | `report.py --results results_merged.json` | Auto-generated tabular leaderboard. | yes |
| `sbi_model.pkl` | `train_sbi.py` (offline, seeded; `TRAIN_SEED` disjoint from `BASE_SEED`) | The pre-trained amortized NPE model loaded at runtime by `sbi.py`/`unified.py`. **Pre-computed artifact.** | yes |
| `sbi_diagnostics.json` | `train_sbi.py` | SBC/PIT calibration evidence + held-out exact-DGP coverage; read by the calibration-regression test. | yes |
| `paper/figures/*.png` | `tools/make_figures.py` | Figures 1-3, drawn from `results_merged.json`. | regenerated |

## The pre-computed SBI model (NPE / Unified)

`sbi_model.pkl` is a **committed, pre-computed artifact**. It is *not* rebuilt by
`run_all.py`; the benchmark loads it to score NPE/Unified just like any other
method, and the figures/tables use the committed `results_merged.json`. To retrain
it from scratch (a heavy, seeded, offline step, ~25-40 min on 4 cores):

```bash
python -m pip install -r requirements-train.txt   # scikit-learn only -- see note
python train_sbi.py --n-train 160000 --n-cal 60000 --n-val 15000 --iters 600
```

**Dependency note (important, differs from the brief's assumption).** This
benchmark's amortized SBI estimator does **not** use PyTorch or the `sbi` PyPI
package. The local `sbi.py` is a *project module*, and both the runtime estimator
and the offline trainer are implemented with **scikit-learn's
`HistGradientBoostingRegressor`** (quantile-regression backend) plus a fixed,
autodiff-free DeepSets-style feature map (`features.py`). Consequently scikit-learn
is the only extra dependency for retraining, and it is already pinned in
`requirements.txt` (needed at runtime to *load* the committed model). The runtime
NPE/Unified path therefore runs in the core environment with no torch present.

## R-reference anchor datasets (used in the correctness tests)

`tests/test_methods.py` validates the Python method ports against audited R oracles
using two small **fixture datasets embedded in the test**, plus one external
fixture file:

- **Vevea-Hedges anchor** -- a 12-study fixture (`yi`, `sei` hard-coded in the
  test) whose `metafor::selmodel(rma(method="ML"), type="stepfun", steps=0.025)`
  output (mu=0.59722923, se=0.11093960, tau2=0.02598154, delta2=0.599915) is the
  target. No external file.
- **Copas-Shi anchor** -- a 10-study fixture (`yi`, `sei` in the test) checked
  against `metasens`'s `copas.loglik.without.beta` profile MLE along the publprob
  path, read from `../../copas/tests/fixtures/copas-oracle.json` (the audited
  allmeta Copas parity oracle). This file lives outside this bench tree, in the
  sibling allmeta `copas/` parity suite.
- **REML anchor** -- self-consistency vs an in-test brute-force restricted-
  likelihood grid maximiser (no external data).

These anchors require only numpy + scipy; they run in the core environment.

## Reproduce in one command

```bash
python -m pip install -r requirements.txt
python run_all.py            # full benchmark -> regenerates everything
python run_all.py --smoke    # fast sanity check
python run_all.py --no-sim   # rebuild figures/paper/tests from committed JSON (seconds)
```
