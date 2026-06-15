# Data manifest — DTA (diagnostic test accuracy) truth-recovery modality

## Datasets used

The **simulation study** (manuscript §3) uses **simulated data only**. No external
dataset is required to reproduce any coverage number or figure. The "data" are
known-truth diagnostic 2×2 tables generated on the fly by `dgp_dta.py` from a fixed
base seed (20260615), so the ground truth (summary operating point Se0=0.85,
Sp0=0.80, between-study covariance Σ_b, threshold spread, selection fraction) is
known exactly and coverage of the true point can be measured.

| Artifact | Produced by | Role |
|---|---|---|
| `results_dta_full.json` | `harness_dta.py --profile full --reps 600` | The measured results behind §3 of the manuscript and §1–§4 of `REPORT.md`. Committed. |
| `results_dta_full.json.partial.jsonl` | same (checkpoint) | Per-cell append-only checkpoint for resumable / pollable runs. |
| `results_partialid.json` | `partialid_dta.py` | The SROC operating-point partial-identification experiment (§3.5 / `REPORT.md` §5). Committed. |
| `REPORT.md` | `report_dta.py` | Auto-generated tabular summary of both results JSON files. |
| `paper/figures/*.png` | `tools/make_figures.py` | Figures 1–3, drawn from the results JSON. |

## Real dataset — the live R correctness anchor (mada::reitsma AuditC)

The real-data **correctness** cross-check (manuscript §4) uses one public dataset,
embedded directly in the test gate `tests/test_dta.py` as the 14-study **AuditC**
data shipped with the R package **`mada`** (Doebler & Holling):

- **AuditC** — 14 diagnostic 2×2 tables (TP, FP, FN, TN) for the AUDIT-C alcohol
  screening questionnaire. Two studies have FN=0, triggering mada's default
  continuity correction (`correction.control = "all"`, +0.5 to all cells when any
  cell is zero). The bivariate ML fit (`methods_dta.fit_bivariate`) is anchored
  against `mada::reitsma(method = "ml")` on this dataset:

  | parameter | matched value | tolerance |
  |---|---|---|
  | μ (logit Se) | 2.07625908 | 1e-3 |
  | μ (logit FPR) | −1.26244709 | 1e-3 |
  | Σ₁₁ | 1.22384177 | 1e-3 |
  | Σ₁₂ | 0.58323292 | 1e-3 |
  | Σ₂₂ | 0.37488242 | 1e-3 |

The AuditC counts are version-controlled inline in `tests/test_dta.py` (no download
needed). The anchor values above are **offline-validated hardcoded reference
numbers** from a prior `mada::reitsma` run; `mada` is *not* installed on this build
host, so a **live R re-run is a TODO** (tracked in `READINESS.md`). The simulation
study (§3) and the behavioural correctness contracts (§4) require no external data.

## Reproduce in one command

```bash
python -m pip install -r requirements.txt
python run_all.py            # full (~7 min, 4 cores) -> regenerates everything
python run_all.py --smoke    # fast sanity check (~1 min)
python run_all.py --no-sim   # rebuild report/figures/paper from committed JSON (seconds)
```
