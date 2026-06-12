> **STATUS: class7_dta was REVERTED (2026-06-12).** This file is the record of *why*. The diagnostic-test-
> accuracy (cancer imaging) class was off-topic for this project — a GLP-1 / incretin dose-response NMA for
> **obesity** — and the panel review below found it was also a poorly-scoped keyword dragnet (non-oncologic
> studies pulled in, fabricated n1=n0 2×2 cells, a modality misclassification). The class and its wiring,
> tests, and concordance entry were removed; the repo is back to its GLP-1/obesity core plus the established
> drug-class generality repoints (PCSK9/SGLT2/psoriasis/asthma/RA). Kept only as a lesson on scope discipline.

# Multi-persona adversarial review — class7_dta (DTA), vs published meta-analyses

Three independent expert personas (DTA biostatistician, academic radiologist / nuclear-medicine
physician, research-integrity / AMSTAR-PRISMA-DTA reviewer) + a chair who **independently verified
every load-bearing claim in the data**. Convergent and damning.

## Verdict
- **"Largest meta ever on this topic": FALSE / MISLEADING.** Larger than published comparative imaging
  DTA metas only by *study count* (66 vs Alabousi 2022's 47), and only by abandoning the single-question
  discipline that makes a DTA meta-analysis valid. By patient/observation count it is **smaller**
  (~25,453 patient-units vs Alabousi's 31,942). There is no published comparator that pools across
  cancers — because pooling across target conditions is a transitivity violation, not a scope record.
- **The cohort is not oncologic and not a coherent topic.** The harvest is an unfiltered AACT Se/Sp
  dragnet; ~13+ of 66 included studies are demonstrably non-cancer (Alzheimer's amyloid PET, coronary
  CAD / myocardial perfusion, carotid & peripheral MR angiography, DVT, prosthetic-joint infection).
  The "oncologic imaging modalities" / "which scan finds cancer most accurately?" framing is unsupported.
- **Engineering/honesty layer is genuinely good; the framing overclaims far beyond it.** Same pattern
  as the incretin PANEL_REVIEW.md: the in-repo machinery and disclaimers are sound, the external framing
  ("oncologic", "largest") is not earned.

## Chair-verified facts (checked in `dta_trials.json`, not taken on trust)
| Claim | Verified? | Evidence |
|---|---|---|
| n1 == n0 (fabricated diseased/non-diseased split) | **YES — 51/66 (77%)** | single AACT "Participants" N copied to both arms |
| Non-oncologic studies included | **YES — ≥13** | 4× florbetaben amyloid-PET (Alzheimer's), 4× cardiac CAD/perfusion, 3× MR angiography, DVT GUARD, PJI |
| Modality misclassification | **YES** | NCT03824535 "18F-FSPG PET/CT, lung cancer" tagged `ultrasound` |
| 62% unclassified target | **YES — 41/66 `other`** | target regex defaults to 'other' |
| ~25,453 patient-units < Alabousi 31,942 | **YES** | sum(n1+n0); and the count is itself inflated by the n1==n0 double-use |

## Load-bearing problems (all chair-verified)
1. **No oncology filter — the premise fails at the data layer [FATAL].** `dta_harvest.py:41-44`:
   `cancer_ncts` = studies whose title contains "sensitivity" AND "specificity" AND percent units. The
   variable name is aspirational; there is no cancer restriction. CT's "lead" (Youden J 0.73, k=7) is
   driven by non-cancer records (a gonorrhoea point-of-care device NCT03852316, a CAD study, myocardial
   perfusion). The pooled per-modality Se/Sp answers no clinical question.
2. **Fabricated 2×2 cell counts [HIGH].** `dta_harvest.py:51,54,88-89`: a single `nmap` (median value,
   max Participants) is mapped to BOTH `n1` (Se denominator) and `n0` (Sp denominator). Real DTA 2×2s
   almost never have n1==n0; 77% do here. The Se/Sp *point estimates* survive (rate×N preserves the
   proportion), but the binomial effective sample sizes — which the bivariate likelihood uses to weight
   studies and size every CrI — are invented. DOR variances and all P(superiority) values understate
   uncertainty.
3. **Index-test buckets conflate biologically unrelated tests [HIGH].** Modality regex
   (`dta_harvest.py:22-23`) collapses FDG-PET, PSMA-PET, DOTATOC, choline, and **amyloid (florbetaben)**
   PET into one "PET"; contrast/non-contrast/PET-CT/colonography into one "CT"; B-mode/EUS/CEUS into one
   "ultrasound". These have opposite performance profiles by target — pooling them is not a valid index test.
4. **No reference standard extracted [HIGH for DTA].** Se/Sp are pulled straight from AACT; the reference
   standard (histopathology vs follow-up vs **autopsy** — NCT01447719 is literally autopsy follow-up) is
   never recorded. QUADAS-2 is impossible; differential verification bias is unbounded.
5. **Youden-J ranking is the wrong summary [MED].** Ranking modalities by J at each modality's own pooled
   operating point compares points on different SROC curves at different thresholds; the right object is
   the HSROC/AUC. Every pairwise J-difference CrI crosses 0, yet the league still prints `lead: "CT"` and
   P(superiority) up to 0.92 — a coin-flip dressed as a probability.
6. **"trials" is the wrong noun [MED].** DTA primary studies are diagnostic-accuracy cohort/cross-sectional
   studies, not RCTs. Every artifact says "trials"; this misrepresents design and inflates apparent rigor.
7. **Shared LKJ covariance across all four modalities [MED].** One between-study 2×2 covariance is pooled
   across PET/MRI/CT/US (`dta_league_bayes.py:60-64`); ultrasound's wild heterogeneity is forced to share
   τ²/ρ with PET. Pragmatic at k=7 (CT) but an unflagged structural assumption that narrows the thin arms.

## What the panel credited (genuine strengths)
- The **bivariate Reitsma machinery** is the right model family; **R̂=1.0000 is real** (non-centred, 4000×4
  draws, target_accept 0.99 — chair concurs it is not masking a degenerate parameter).
- The **PPV/NPV transport math is textbook-correct** and propagates posterior uncertainty; the
  prevalence-dependence teaching point is sound.
- The **threshold-effect Spearman check is implemented correctly** and correctly does not fire.
- **Continuity correction is conditional** (0.5 only on a zero cell) — matches the unconditional-bias rule.
- The **screening funnel reconciles**; fail-closed plausibility gates are honest hygiene.
- **DOR labeling discipline** ("diagnostic OR, NOT a hazard ratio", test-asserted) is conscientious.
- The **Kim-2021 concordance is honestly narrow** — matched only at the "complementary roles / no uniform
  winner" level, with thyroid-specificity and the reconstruction gap openly disclosed.

## Path forward (what would make it defensible)
The bivariate engine is fine; the *cohort definition and framing* are the failure. To rescue it, pick ONE:
- **(A) Make it a real DTA meta.** Add a cancer-positive harvest filter (target ∈ named oncologic sites;
  drop amyloid/cardiac/vascular/infection), and **pool within ONE target** (e.g. prostate nodal staging,
  k≈11) so the comparison is transitive. Recover separate n1/n0 from AACT where posted; otherwise label the
  cell counts as approximate. Rank by HSROC/AUC, not J. Re-do the Kim concordance against a matched-target
  meta. This shrinks the class but makes it true.
- **(B) Relabel honestly as a methods demo.** Keep the broad cohort but rename throughout: not "oncologic
  imaging", but *"a deliberately broad registry-reconstructed DTA stress-test of the bivariate engine across
  mixed diagnostic indications (predominantly but not exclusively oncologic)"*; drop "cancer"/"which scan
  finds cancer"; drop any "largest" language; lead the GENERALITY_MATRIX/dashboard cell with the limitation;
  fix the NCT03824535 modality and the n1==n0 disclosure.

> Chair: "The model code is honest and competent. The defect is that the data definition was a keyword
> dragnet, and the public labels ('oncologic', 'cancer', and the user's 'largest meta ever') describe a
> cohort that does not exist. Bigger is not the achievement here — and this isn't even bigger by patients.
> Fix the cohort or fix the words; do not ship both 'oncologic' and an Alzheimer's amyloid-PET study."
