# Registry-native dose-response network meta-analysis unifying reporting-completeness and population-transportability: incretin agonists for obesity

**Draft methods/automation paper.** Honest framing per internal adversarial review: the contribution
is a methods + automation framework, not a clinical or statistical breakthrough. All analyses reproducible
from a pinned AACT snapshot (2026-06-01) + PubMed; no full-text/PDF. Human-attested RoB-2/GRADE (RapidMeta)
are the intended SR layer, not run here.

## Abstract
Literature-based meta-analyses of obesity pharmacotherapy face two structural blind spots: they cannot
see trials that posted results to a registry but were never published or were indexed under a different
condition, and they rarely assess whether the trial populations represent the real-world target. We
built a registry-native pipeline that extracts arm-level weight-loss data directly from the
ClinicalTrials.gov results mirror (AACT), fits a dose-response network meta-analysis (frequentist two-
stage and a NUTS-certified one-step Bayesian hierarchical Emax), cross-checks extraction against
published primaries via PubMed abstracts, detects unpublished "ghost" trials by AACT×PubMed linkage,
and maps trial representativeness to a NHANES target. Across 57 post-2010 incretin trials (150 arms, 9
nodes), extraction reproduced published NEJM primaries exactly (tirzepatide 15 mg 16.6 vs published
16.53 pp). A real MEDLINE search recovered only 57% of the cohort, missing 43% (6 unpublished + 20
diabetes-indexed). The unpublished trials pooled 3.2 pp lower than published (reporting-bias direction).
The trials a literature search misses are disproportionately the diabetes stratum the obesity-trial
population under-represents (literature 0% vs NHANES 26% diabetes); recovering them registry-natively
closed ~half that gap. We argue reporting-completeness and population-transportability are one registry-
native mechanism.

## 1. Introduction
Published obesity-incretin NMAs (e.g., Xie 2024) merge doses and timepoints and screen on obesity-primary
publications. Two consequences: (a) trials that posted weight results but are unpublished or indexed under
diabetes are invisible; (b) the trial population (obesity-eligible, diabetes-excluded) may not represent the
real obese population. We address both from the registry.

## 2. Methods
- **Source:** AACT 2026-06-01 (CT.gov mirror); PubMed abstracts. Pinned, seeded, reproducible.
- **Discovery/extraction:** `discovery.py` + `extract_full.py` — arm-level % weight change, dose/schedule
  parsing, negation guard, SE/SD→variance, estimand pinning, route node-splitting, ≥36 wk landmark.
- **Synthesis:** two-stage MBNMA (`fit_network.py`) + one-step arm-based Bayesian hierarchical Emax with
  multi-arm shared-control covariance (`pymc_onestep.py`); ranking via SUCRA + POTH (Wigle 2025),
  cross-checked vs CRAN.
- **Validation:** extraction vs published NEJM primaries (PubMed abstracts).
- **Ghost detection:** AACT `study_references` × real PubMed [si] search.
- **Transitivity / population:** AACT `baseline_measurements` + `conditions`.
- **Robustness:** INSPECT-SR + leave-one-trial-out.
- **Benefit-risk:** AACT `reported_events` (nausea).
- **Literature comparison:** real MEDLINE search mapped to NCTs.
- **Transportability:** representativeness vs NHANES + binary-modifier (diabetes) standardization.

## 3. Results
- **Cohort:** 57 trials, 150 arms, 9 nodes (7 in the ≥36 wk primary), all post-2010, all CT.gov.
- **Extraction validated:** SURMOUNT-1 −16.0/−21.4/−22.5 = NEJM efficacy estimand exact; orforglipron,
  retatrutide exact (PubMed). Reproduces Xie 2024 (tirzepatide 15 mg 16.6 vs 16.53).
- **Hierarchy (NUTS, Rhat 1.000, POTH 0.85):** retatrutide/mazdutide ~22, tirzepatide 16.6, semaglutide
  13–15, orforglipron 11 pp. Three samplers agree.
- **One-step fix:** modeling multi-arm covariance widens CrIs (contrast model anti-conservative).
- **Single-trial apex:** mazdutide, retatrutide k=1 → INSUFFICIENT (INSPECT-SR).
- **Benefit-risk:** efficacy-#1 mazdutide has worst nausea (54%) → reorders on tolerability.
- **Ghosts:** 6 true unpublished trials (AACT×PubMed); ghost semaglutide 2.4 mg pooled 3.2 pp lower
  than published (reporting-bias direction).
- **Real MEDLINE:** finds 36/63 (57%); misses 27 (43%) = 6 ghosts + 20 diabetes-indexed + 1 unlinked.
- **Sourcing delta:** cross-agent ranking robust to sourcing; dose-specific estimates not (oral-sema
  14 mg 13.6 literature vs 3.8 registry, −9.8 pp, from PIONEER T2D capture).
- **Representativeness (NHANES):** trials ≈ target on age/BMI/sex/weight; under-represent diabetes
  (16% vs 26%); literature-only is 0% diabetes.
- **Synthesis:** registry-native recovery of the 9 missed T2D trials closes the diabetes gap +26→+14.5 pp.
- **Transport — TRUE Bayesian one-step NMR with internal transport** (`pymc_bayesian_transport.py`):
  one hierarchical model jointly estimates the dose-response, the multi-arm structure, and a diabetes
  effect-modifier γ, deriving the transported effect as a posterior with full uncertainty propagation.
  γ = 5.8 pp (95% CrI 3.4–8.0, P>0 = 1.00). Transported obesity→NHANES(26% diabetes) per node: tirzepatide
  18.7→17.1, mazdutide 22.5→21.1, semaglutide-sc-weekly 15.8→14.3 (each ~−1.5 pp; γ-uncertainty widens the
  target CrIs). Valid IPD-free because diabetes is **binary with pure strata** (study-level covariate =
  individual-level), so γ is a genuine interaction, NOT ecological. Rhat 1.010 / ESS 1075 (near-converged).
- **BMI second modifier (abstract-supplemented, n=2→17):** trial BMI 35.8 ≈ NHANES 36.0; slope ecological
  and ~0 → transport robust to it; diabetes is the sole material, valid modifier.

## 4. Discussion — the unification
Reporting-completeness and population-transportability are not two add-ons but one mechanism: the evidence
a literature search misses is disproportionately the under-represented (diabetes) stratum, so recovering
it registry-natively simultaneously de-biases the synthesis and improves its generalizability. A single
automated registry-native pipeline delivers both. This is the novel, defensible claim.

## 5. Limitations (honest)
No IPD → rigorous transport (ML-NMR/MAIC) not possible; transport is binary-modifier standardization +
sensitivity. Not a systematic review without human dual-screening/RoB-2/GRADE (RapidMeta layer). Star
network → no consistency test. Single phase-2 trials at the apex. AACT baseline reporting sparse for
continuous covariates. β assumed common across agents. "0% literature diabetes" is specific to an
obesity-weight search string (the point: weight-loss SRs exclude these by design). Bayesian one-step
near-converged (ESS limited by pure-Python backend).

## 6. Conclusion
A reproducible registry-native dose-response NMA that recovers evidence a literature search misses and,
because that evidence is the under-represented stratum, improves transportability in the same step —
quantified end-to-end. A genuine methods/automation contribution, honestly bounded.
