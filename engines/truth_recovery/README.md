# truth_recovery — Unified truth-recovery (honest coverage) engine

A clean, importable packaging of the **validated** unified truth-recovery estimator
(origin branch `truth-recovery-est-v3`, harness `truth-recovery-bench`). This exists so
the estimator is **actually usable from production tools**, not branch-bound.

## What it is

Headline estimate = **NPE de-biased point** + a **calibrated, gated interval**:

- **NPE** — amortized simulation-based inference (a permutation-invariant DeepSets
  feature map → gradient-boosted quantile regressors, Mondrian-conformalised for honest
  finite-sample coverage). Tight and low-bias, but under strong one-sided p-step
  selection it can dip below 0.90 coverage at large k.
- **PartialID** — Manski-style partial-identification bounds (union of CIs over a
  selection-severity ladder with δ fixed). Conservative; rock-solid exactly where NPE
  dips.
- **Gated union (frozen `mode="gated"`, `npe_scale=1.15`)** — keep NPE's tight interval,
  and widen to the PartialID union **only when PartialID disagrees about location**
  (genuine selection / domain shift). This is the width-minimal config that still holds
  the target.

### Measured validation (55-cell × 1000-rep known-truth grid)

| metric | result | target |
|---|---|---|
| coverage of true μ | **≥0.90 on every cell** (min 0.927, mean 0.989) | ≥0.90 |
| type-I at μ=0 | **≤0.054** everywhere | ≤0.07 |
| mean \|bias\| under selection | **≈0.016** (vs Vevea 0.107) | ≤ Vevea |
| k=5 RMSE | **0.16** (vs Vevea 9.18 — no small-k blow-up) | no blow-up |

The numbers the packaged engine produces are **byte-identical** to the validated
`unified.unified()` (the validated modules + the trained `sbi_model.pkl` are vendored
verbatim under `_vendor/`; `tests/test_engine.py` asserts golden reproduction).

## Use it

```python
from truth_recovery import estimate
r = estimate(y, v)          # y = effect sizes, v = sampling variances  (or se=...)
r["point"], r["ci_lo"], r["ci_hi"]                 # honest-coverage interval
r["partial_id"]["ci_lo"], r["partial_id"]["ci_hi"] # Manski partial-ID bounds
r["gate_fired"]             # PartialID widened the interval?
```

CLI:

```bash
python -m truth_recovery info
python -m truth_recovery estimate --csv studies.csv        # cols: y,v  (or effect,se)
python -m truth_recovery estimate --json '{"y":[0.1,0.3,-0.2],"v":[0.04,0.05,0.06]}'
python -m truth_recovery serve --port 8731                 # localhost bridge for browser apps
```

`serve` is the bridge the in-browser allmeta apps use to offer this as a selectable
engine — the estimator is Python + scikit-learn and **cannot** run in the browser.

## Honesty / scope

- **Inputs are on the analysis scale.** For ratio measures pass the **log** effect
  (logRR / logOR / logHR) and its variance, not the ratio.
- **Out-of-distribution caveat.** The NPE is amortized on a simulation DGP (generic
  effect scale, μ≈0.3, τ²≈0.05). On data far from that domain (large |log-OR/HR|), the
  NPE is OOD; the partial-identification backstop is what keeps the interval honest, and
  `gate_fired` / `npe.ok` flag when that is happening. Treat such results as
  **set-identified bounds**, not amortized posteriors.
- The frozen config (`mode`, `npe_scale`) is tuned **in-sample** on the design grid; the
  parameter-free `mode="lower"` union is the no-tuning fallback (min coverage 0.922).

## Files

- `__init__.py` — public `estimate()` / `info()` API + frozen config constants
- `__main__.py` — CLI (`estimate` / `info` / `serve`)
- `_vendor/` — verbatim validated source (`unified.py`, `sbi.py`, `robust_selection.py`,
  `methods.py`, `features.py`, `train_sbi.py`, `dgp.py`) + `sbi_model.pkl`
- `tests/` — golden reproduction + determinism + contract tests
