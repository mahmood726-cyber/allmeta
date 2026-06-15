# Data manifest — Dose-Response truth-recovery modality

## Datasets used

This modality uses **simulated data only**. No external dataset is required to
reproduce any number or figure. The "data" are known-truth dose–response datasets
generated on the fly by `dgp_dose.py` from a fixed base seed (20260615), so the
ground truth (true slope β, curvature γ, between-study variance τ², selection
fraction) is known exactly and coverage can be measured.

| Artifact | Produced by | Role |
|---|---|---|
| `results_dose_full.json` | `harness_dose.py --profile full --reps 1000` | The measured results behind §3 of the manuscript and all of `REPORT.md`. Committed. |
| `results_dose_full.json.partial.jsonl` | same (checkpoint) | Per-cell append-only checkpoint for resumable / pollable runs. |
| `REPORT.md` | `report_dose.py` | Auto-generated tabular summary of the results JSON. |
| `paper/figures/*.png` | `tools/make_figures.py` | Figures 1–3, drawn from the results JSON. |

## Canonical real datasets — for the external-validation step (not yet run here)

The real-data correctness cross-check described in `READINESS.md` would use a public
dose–response dataset shipped with the R reference implementation:

- **`dosresmeta::coffee_cohort` / Bonjour-type coffee–CHD cohort data** — the worked
  example distributed with the `dosresmeta` package (Crippa & Orsini, *J Stat Softw*
  2016). Used to anchor the two-stage GL-GLS slope against `dosresmeta` output.

This dataset is *not* bundled here because the cross-check has not yet been run on
the build host (R is installed; the `dosresmeta` package is not). The simulation
study (§3) and the correctness contracts (§4) require no external data.

## Reproduce in one command

```bash
python -m pip install -r requirements.txt
python run_all.py            # full (~9 min, 4 cores) -> regenerates everything
python run_all.py --smoke    # fast sanity check (~1 min)
```
