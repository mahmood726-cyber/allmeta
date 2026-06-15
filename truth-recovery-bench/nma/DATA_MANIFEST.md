# Data manifest — NMA truth-recovery modality

## Datasets used

This modality uses **simulated data only**. No external dataset is required to
reproduce any number or figure. The "data" are known-truth networks generated on
the fly by `dgp_nma.py` from a fixed base seed (20260615), so the ground truth
(the true basic parameters d, the true relative-effect matrix D, the true best
treatment, the between-study variance τ², the injected loop inconsistency δ, and
the selection fraction) is known exactly and coverage of the true relative effects
can be measured directly.

| Artifact | Produced by | Role |
|---|---|---|
| `results_nma_full.json` | `harness_nma.py --profile full --reps 500 --bayes-reps 120 --bayes-blocks coverage` | The measured results behind §3 of the manuscript and §§1–4 of `REPORT.md` (coverage, inconsistency type-I/power, ranking over-confidence, selection). Committed. |
| `results_nma_full.json.partial.jsonl` | same (checkpoint) | Per-cell append-only checkpoint for resumable / pollable runs. |
| `results_partialid.json` | `partialid_nma.py` | The partial-identification experiment behind §3.5 of the manuscript and §5 of `REPORT.md`. Committed. |
| `REPORT.md` | `report_nma.py` | Auto-generated tabular summary of the results JSON. |
| `paper/figures/*.png` | `tools/make_figures.py` | Figures 1–3, drawn from the results JSON. |

## Canonical real datasets — for the external-validation step (not yet run here)

The real-data correctness cross-check described in `READINESS.md` would anchor the
frequentist consistency-model fit (FE / RE point estimates and the network DL τ²)
against the R reference implementation `netmeta` on a public network-meta-analysis
dataset:

- **`netmeta::Senn2013` / `netmeta::smokingcessation` / `netmeta::Linde2015`** —
  the worked-example network datasets distributed with the `netmeta` package
  (Rücker, Schwarzer et al.). Used to anchor the contrast-synthesis (Lu–Ades)
  point estimates and the network DerSimonian–Laird τ² against `netmeta()` output.

This dataset is *not* bundled here because the cross-check has not yet been run on
the build host (Rscript is installed; the `netmeta` package is not). The simulation
study (§3) and the correctness contracts (§4) require no external data and have no
R dependency.

## Reproduce in one command

```bash
python -m pip install -r requirements.txt
python run_all.py            # full (~5 min, 4 cores) -> regenerates everything
python run_all.py --smoke    # fast sanity check (~15-30 s)
python run_all.py --no-sim   # rebuild report/figures/paper from committed JSON
```
