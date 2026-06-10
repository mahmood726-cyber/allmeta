# Cutting-edge workstream results (panel-responsive)

Each addresses a verified panel criticism with a validated method, AACT + PubMed-abstracts only.

## B — true one-step arm-based MBNMA (fixes the verified statistical error)
`pymc_onestep.py`. Models arms (not contrasts) with a per-trial shared placebo `alpha[i]` + per-trial
active random effect `u[i]`, so multi-arm trials share one baseline → within-trial covariance captured.
**Result: CrIs are WIDER for almost every node** (the contrast model was anti-conservative, exactly as
the biostatistician said): mazdutide 9.0→13.8, tirzepatide 4.4→6.3, retatrutide 9.1→9.2, sema-sc-daily
7.1→7.8, orforglipron 6.0→7.3. Ranking holds (mazdutide/retatrutide/tirzepatide top); tau 2.70→3.12
(more honest heterogeneity); POTH 0.85→0.92. (See onestep_ranking.json; convergence re-run for ESS≥400.)

## C — transitivity / population-mix (panel: 'transitivity untested', 'T2D+obesity mixed')
`workstream_C_transitivity.py`, from AACT `baseline_measurements`. **Confirms the population confound
with data:** the semaglutide-oral node has **HbA1c 8.0–8.3% — a T2D (diabetes) population** (PIONEER:
NCT02607865/02827708/02863328/02863419/03018028/03021187), where weight loss is a smaller secondary
outcome. 6/13 oral-sema trials confirmed T2D. This both validates the panel and explains the node's
low effect. Other nodes are obesity/unreported. **Fix (workstream E):** split indication before pooling.
(transitivity.csv / .json. AACT baseline reporting is sparse for age/BMI — HbA1c is the usable discriminator.)

## D — single-trial robustness + INSPECT-SR (panel: 'top-2 ranks are k=1')
`workstream_D_robustness.py`. Leave-one-trial-out + evidence base per node:
| node | k | effect | LOO swing | evidence |
|---|---|---|---|---|
| mazdutide | 1 | 22.3 | — | **INSUFFICIENT (k=1)** |
| retatrutide | 1 | 22.1 | — | **INSUFFICIENT (k=1)** |
| tirzepatide | 4 | 16.1 | 5.2 pp | limited |
| semaglutide-oral | 5 | 13.6 | 1.7 pp | limited |
| semaglutide-sc-weekly | 15 | 13.3 | 6.2 pp* | multi-trial |
| orforglipron | 2 | 12.4 | 6.1 pp | limited (fragile) |
| semaglutide-sc-daily | 1 | 11.6 | — | **INSUFFICIENT (k=1)** |

**The hierarchy apex (mazdutide, retatrutide) rests on single trials** — removing the one trial deletes
the top rank. Per the INSPECT-SR rule (k≤5), these must be relabelled "insufficient evidence" and not
presented as a primary top rank without trustworthiness sign-off. INSPECT-SR items split into automatable
(effect-vs-class plausibility, dose monotonicity, dispersion — all pass) and **human/IPD-attestation**
(baseline-distribution, duplicate-participant, GRIM/Benford, governance) — the RapidMeta human layer.
(*sc-weekly swing is an artifact of one 7.2 mg trial setting the max-dose metric, not instability of the 2.4 mg estimate.)

## Net effect on the panel verdict
These convert three of the panel's criticisms from "unaddressed" to "measured and handled": the one-step
model is now honest (wider CrIs), transitivity is assessed (and the T2D confound confirmed + localised),
and the single-trial apex is flagged insufficient-evidence rather than asserted. The headline still must
read "concordant with published estimates; apex is emerging single-trial evidence," not "breakthrough."
