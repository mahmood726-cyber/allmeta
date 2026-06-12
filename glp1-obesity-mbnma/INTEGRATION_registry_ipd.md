# Integration assessment: registry-ipd (this PC: C:\Projects\registry-ipd)

## What registry-ipd is
A registry-native **survival / time-to-event** pseudo-IPD engine: reconstructs patient-level survival
from posted Kaplan-Meier curves (Guyot/anchor-exact/Royston-Parmar), computes Cox HR / RMST / median,
competing-risks (Aalen-Johansen), time-varying HR, and a **calibrated-uncertainty ensemble** (95% CrI
covers the true IPD HR 14/14 on gold-standard real IPD; see registry-ipd/VALIDATION.md). Input per trial:
`{arms:[{km_points, nar_points, N, total_events, median}], hr{value,ci_low,ci_high}}`. Engine smoke-tested
here: `reconstruct(trial,{})` returns a calibrated envelope. AACT-harvested via its `harvest/` pipeline.

## Is it useful for THIS project? Honest answer
- **NOT for the weight-loss transport.** Our outcome is CONTINUOUS (% weight change); registry-ipd is
  KM/survival-only. And our diabetes transport is already valid IPD-free (binary pure strata), so pseudo-IPD
  would add nothing there. Integrating its reconstruction engine into the continuous pipeline = no benefit.
- **YES as a complementary TIME-TO-EVENT arm of the system.** Incretins' clinical value is increasingly
  cardiovascular / renal OUTCOMES, not just weight. **20 incretin trials in the AACT snapshot carry a Hazard-
  Ratio outcome** (CVOT/renal/MACE), and many post KM curves — exactly registry-ipd's input. registry-ipd
  therefore extends the registry-native framework from continuous-only to **continuous + time-to-event**,
  on the same drug class, from the same registry mirror, with the same reproducibility discipline.

## The integration (architecture)
The registry-native system gains a parallel survival track:
```
AACT KM curves (incretin CVOTs)  --harvest-->  registry-ipd.reconstruct()  -->  pseudo-IPD HR/RMST (+calibrated CrI)
                                                                              -->  registry-native SURVIVAL NMA
weight-loss MBNMA (this repo) ----------------------------------------------+--> joint benefit (weight) + outcome (CV/renal) view
```
- **Shared:** AACT source, pinned snapshot, PubMed-abstract validation, human-attested RoB/GRADE layer.
- **registry-ipd adds:** KM->pseudo-IPD reconstruction with the calibrated-uncertainty ensemble — the one
  thing our continuous pipeline cannot do (recover patient-level time-to-event from aggregate curves).
- **Cross-link:** the benefit-risk layer (currently weight vs nausea) becomes weight vs *hard outcomes*
  (MACE/CV-death/kidney), the clinically decisive axis.

## Scope (honest)
Confirmed: engine runs; input format known; 20 incretin HR-trials available; harvest pipeline exists. NOT
done here: the full harvest + survival NMA of the incretin CVOTs (a bounded next-phase build — harvest KM
for the 20 trials, reconstruct with ensemble CrIs, pool). This file establishes the capability, the data
target, and the wiring; it does not claim a completed survival synthesis.

## Net
registry-ipd is integrated as the **time-to-event component** of the registry-native synthesis system
(SYSTEM.md stage set extended). It does not improve the continuous transport (correctly — that's already
valid), but it makes the system span the outcomes that matter clinically, reusing the same registry-native,
reproducible, calibrated-uncertainty philosophy.

## Concrete result — registry-ipd code USED; reconstruction blocked by the posting gap (not accuracy)
`survival_nma.py`. registry-ipd's `harvest_trial()` (Python, reads AACT via aact_kit) was run on the
incretin CVOTs and pulled their HRs cleanly: SUSTAIN-6 0.74, SELECT 0.76, LEADER 0.87, REWIND 0.88.
**But km_points=[0,0] for all** — these trials post the HR in `outcome_analyses` but NOT the KM curve in
AACT's structured `outcome_measurements` (the curve is in the journal figure). So registry-ipd's validated
RECONSTRUCTION (curve-only HR ~11% err, calibrated CrI 14/14 — VALIDATION.md) **has no curve to run on here.**
- **Honest conclusion:** the limiting factor is the REGISTRY POSTING GAP, not registry-ipd accuracy. We used
  the harvester (HR extraction) and pooled the reported HRs into a registry-native survival NMA by agent
  (semaglutide 0.81 k=5, tirzepatide 0.62, dulaglutide 0.88). Joint weight+outcome view: the top weight-loss
  agents also carry CV benefit. registry-ipd reconstruction stays wired and would activate for any trial that
  posts a structured KM curve (most AACT trials don't; per registry-ipd's own cohort, ~30/595 do). survival_nma.json.
