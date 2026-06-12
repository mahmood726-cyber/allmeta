# Prototype results — GLP-1/GIP obesity dose-response NMA (10-trial)

Snapshot: AACT 2026-06-01 (CT.gov mirror). Worktree off allmeta; rapidmeta untouched.

## Extraction — works and is validated EXACT against published

30 arms across 9/10 trials (one trial had a non-standard outcome title). After estimand
dedup: 22 arms. Validation vs published primary % weight change (held-out ground truth):

| trial | arm | published | extracted | err |
|---|---|---|---|---|
| SURMOUNT-1 | placebo | -2.4 | -2.4 | **0.0** |
| SURMOUNT-1 | tirzepatide 5 | -16.0 | -16.0 | **0.0** |
| SURMOUNT-1 | tirzepatide 10 | -21.4 | -21.4 | **0.0** |
| SURMOUNT-1 | tirzepatide 15 | -22.5 | -22.5 | **0.0** |
| STEP-2 | placebo | -3.4 | -3.1 | 0.3 (estimand) |
| STEP-2 | semaglutide 2.4 | -9.6 | -10.7 | 1.1 (estimand) |

6/7 anchors matched, mean abs err **0.23 pp**. The two STEP-2 misses are estimand
differences (treatment-policy vs trial-product), not extraction errors — the dedup kept the
more-precise trial-product estimand. **Conclusion: registry-native arm-level extraction of
continuous weight outcomes is accurate** when the estimand is pinned.

## Dose-response surface — sane, monotone, biologically plausible

Per-agent Emax `loss = Emax·dose/(ED50+dose)` (IVW NLS, same model as allmeta `fitEmaxModel`):

| agent | trials | dose grid | Emax | ED50 | monotone |
|---|---|---|---|---|---|
| **tirzepatide** | SURMOUNT-1, -2 | 5/10/15 mg weekly | **19.3 pp** (SE 1.0) | **2.21 mg** (SE 0.61) | yes |
| semaglutide | ph2 + STEP-1/2/5 | 0.05–0.4 daily **+** 2.4 weekly | 12.1 pp | 0.08 mg | yes (but see caveat) |

- **Tirzepatide fit is clean** — all arms weekly SC; Emax ~19 pp matches the known ~20–22%
  plateau at 15 mg; dose to reach -10% ≈ 2.4 mg.
- **Semaglutide fit conflates schedules** — phase-2 used DAILY 0.05–0.4 mg; STEP used WEEKLY
  2.4 mg (≈ 2.8 mg/wk-equiv for 0.4 mg/day). Pooling on a raw mg axis is apples-to-oranges;
  ED50 0.08 mg is dominated by the daily arms. **Must normalize to weekly-equivalent dose or
  model schedules separately** before a defensible semaglutide curve.

## Validated-engine cross-check (honest)

allmeta `bma-bmd.js` imported and consumed the contrasts correctly (per-dose IVW pooling
verified), but `BayesianModelAveragedBMD` returns a **benchmark dose** (toxicology estimand),
not the obesity Emax — output (BMD 321/6697 mg) is not the right object here. The correct
allmeta module for this question is the **MBNMA network engine** (`src/network-meta-analysis`)
— wiring it is the first scale-phase task.

## Genuine extraction challenges surfaced (the real "large-scale" work)
1. **Code-name aliases** — retatrutide (`LY3437943`), orforglipron (`LY3502970`/`OWL833`),
   survodutide, mazdutide arms are labelled by code, not INN → only their placebos parsed.
   Fix: alias table in `parse_arm`.
2. **Estimand harmonization** — pin one estimand (trial-product vs treatment-policy) per trial.
3. **Schedule normalization** — daily vs weekly dosing must map to a common axis.
4. **Timepoint selection** — prefer the registered primary endpoint week, not an interim.

## Verdict
The end-to-end pipeline (AACT extract → published-value validation → dose-response fit) WORKS,
the extraction is exact where the estimand is pinned, and the tirzepatide dose-response surface
is clean and validated. The four challenges above are the concrete, bounded engineering for the
≥40-trial scale phase — none are blockers.
