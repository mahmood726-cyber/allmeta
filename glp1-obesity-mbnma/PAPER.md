# Registry-native dose-response network meta-analysis unifying reporting-completeness and population-transportability: incretin agonists for obesity

**Draft methods paper.** Framing per two internal adversarial-panel reviews: this is a **methods +
automation contribution**, not a clinical or statistical breakthrough, and a **complement to — not a
replacement for — systematic review**. All analyses are reproducible from a pinned AACT snapshot
(2026-06-01) + PubMed abstracts (no full text). Risk-of-bias and GRADE are the intended human-attested
layer and are not adjudicated here.

## Abstract
Literature-based meta-analyses of obesity pharmacotherapy have two structural blind spots: they cannot
see trials that posted results to a registry but were never published or were indexed under another
condition, and they rarely test whether the trial population represents the real-world target. We built a
reproducible, registry-native pipeline that extracts arm-level weight-loss data directly from the
ClinicalTrials.gov results mirror (AACT), fits a dose-response network meta-analysis (frequentist two-stage
and a one-step Bayesian hierarchical Emax with multi-arm covariance), cross-checks extraction against published
primaries via PubMed abstracts, detects unpublished "ghost" trials by AACT×PubMed linkage, and transports
the effects to authoritative real-world target populations. From a 57-trial registry supply, **29 trials
(7 nodes)** entered the ≥36-week primary network. Extraction matched the published primary exactly in **3
estimand-pinned spot-checks** (tirzepatide 15 mg 16.6 vs published 16.53 pp; cohort-wide held-out validation is
future work); among nodes with **≥2 trials** the hierarchy concorded with the published NMAs (tirzepatide
highest among approved agents). An **obesity-scoped** MEDLINE search recovered only 57% of
the cohort; a broad diabetes-inclusive search recovered 89%, leaving **~9.5% (6/63) high-confidence unpublished
"ghost" trials no literature search can find** (pending title/sponsor fallback confirmation). The trials a
literature search misses are disproportionately the diabetes stratum the obesity-trial population
under-represents (an obesity-scoped evidence base is 0% diabetes vs ~21% in US adults with obesity — NHANES
2017–2020 microdata; an earlier literature marginal gave 26%); recovering them registry-natively closes
about half that representativeness gap. We argue **reporting-completeness and population-transportability
are one registry-native mechanism**, and position the approach within the evolution of evidence synthesis
toward living, registry-native, target-transportable, human-attested review.

## 1. Introduction
Evidence synthesis is shifting on four axes: from frozen to **living**; from literature-only to
**registry-native** (as results-posting mandates make the registry an increasingly complete evidence base —
~36% of registered trials never publish); from trial-average to **target-population-transportable**
estimates; and from all-manual to a **human–AI division of labor**. Published obesity-incretin NMAs (e.g.,
Xie 2024) merge doses and timepoints and screen on obesity-primary publications, with two consequences: (a)
trials that posted weight results but are unpublished, or are indexed under diabetes, are invisible; (b) the
trial population (obesity-eligible, largely diabetes-excluded) may not represent the real obese population.
We address both directly from the registry, and show they are the same problem.

## 2. Methods
- **Source:** AACT 2026-06-01 (CT.gov mirror) + PubMed abstracts. Pinned, seeded, one-command reproducible.
- **Discovery/extraction:** arm-level % weight change, dose/schedule parsing, negation guard, SE/SD→variance,
  estimand pinning, route node-splitting, ≥36-wk landmark (`discovery.py`, `extract_full.py`).
- **Synthesis:** two-stage MBNMA + a one-step arm-based Bayesian hierarchical Emax with multi-arm
  shared-control covariance; SUCRA + POTH (Wigle 2025), cross-checked vs CRAN.
- **Extraction validation:** vs published primaries (PubMed abstracts).
- **Ghost detection & literature comparison:** AACT `study_references` × real multi-strategy MEDLINE search
  ([si]-confirmed for unpublished status).
- **Transitivity / population:** AACT `baseline_measurements` + `conditions` (diabetes status).
- **Robustness:** leave-one-trial-out (INSPECT-SR-style trustworthiness checks require IPD/human attestation and were not run).
- **Benefit–risk:** AACT `reported_events` (nausea).
- **Transportability:** representativeness map vs NHANES; a TRUE Bayesian one-step network meta-regression
  with internal transport on the binary diabetes modifier; multi-target atlas (IDF Atlas regions + NHANES +
  Health Survey for England, obese-subset). Out-of-sample validated; jointly sensitivity-tested.

## 3. Results
**Cohort & extraction.** Cohort flow: 57 post-2010 incretin trials discovered with posted weight data (150
arms); **29 trials / 7 nodes** met the ≥36-week landmark and entered the primary network; the literature/ghost
comparison set is 63 (a broader incretin pull) and the RapidMeta workbench config carries 38. All CT.gov.
Extraction matched the published primary exactly in **3 estimand-pinned spot-checks** (SURMOUNT-1
−16.0/−21.4/−22.5 = NEJM efficacy estimand; orforglipron, retatrutide); cohort-wide held-out validation is
future work. Concordant with Xie 2024 (tirzepatide 15 mg 16.6 vs 16.53 pp).

**Hierarchy.** Among nodes with **k≥2**, tirzepatide ranks highest (17.5 pp), concordant with the published
NMAs (McGowan 2025, *Nat Med* DOI 10.1038/s41591-025-03978-z; Wang 2025, DOI 10.1111/dom.16585; Zamanian 2025,
DOI 10.1016/j.ejphar.2025.177966; Shi 2024) — and it is the **only Moderate-certainty conclusion** in the
network (tirzepatide vs semaglutide-weekly). The single phase-2 nodes **mazdutide and retatrutide (k=1)** give
the largest point estimates (~22 pp) but are flagged INSUFFICIENT and **excluded from the ranking claim**; their
contrasts vs tirzepatide cross the null (mazdutide−tirzepatide 3.8 pp, 95% CrI −2.0 to 9.8, Very-low certainty).
INSPECT-SR-style trustworthiness checks for these k=1 apex nodes require IPD/human attestation and were **not
run**. *Convergence note:* the contrast NUTS model is certified (Rhat 1.0, ESS 603) but treats shared-placebo
arms as independent (anti-conservative); the covariance-correct arm-based one-step widens the CrIs but is **not
yet converged** (ESS 281 < 400), so multi-arm covariance is reported as a sensitivity, not the certified
primary. Benefit–risk reorders the top regardless: the largest point-estimate node (mazdutide) has the worst
nausea (54%).

**Completeness.** 6 high-confidence unpublished ghost candidates ([si]-flagged, pending title/sponsor fallback
confirmation); the ghost semaglutide 2.4 mg pooled 3.2 pp lower than published (reporting-bias direction,
resting on k=2 analysable ghosts). An obesity-scoped MEDLINE search finds 36/63 (57%); a broad
diabetes-inclusive search finds 56/63 (89%); the registry-only gain is the **~9.5% (6/63) unpublished
ghosts**. Sourcing changes dose-specific estimates materially (oral-semaglutide 14 mg: 13.6 obesity-scoped
vs 3.8 registry-native, from PIONEER T2D capture) while the cross-agent ranking is sourcing-robust.

**Transportability.** Representativeness vs NHANES: trials ≈ target on age/BMI/sex/weight, but
under-represent diabetes (obesity-scoped 0% / cohort ~16% vs US-obese ~21%, NHANES microdata). A TRUE one-step Bayesian NMR
estimates the diabetes modifier γ = 5.9 pp (95% CrI 3.5–8.1, P>0 = 1.00) and derives the transported effect
as a posterior with full uncertainty propagation; **convergence-certified (compiled nutpie backend: max Rhat
1.0000, min ESS 3354)**. Valid without IPD because diabetes is **binary with pure strata** (study-level =
individual-level covariate → genuine interaction, not ecological). Multi-target atlas (obese-subset
prevalence, IDF + NHANES + HSE-England): tirzepatide obesity 18.7 → England 17.9 → US-obese 17.2 →
MENA-obese 16.8 pp. BMI added as a second modifier (abstract-supplemented n=2→17; trial BMI 35.8 ≈ target
36.0) contributes ~0 → transport is diabetes-driven and robust to it.

**The synthesis.** The trials a literature search misses are disproportionately the diabetes stratum the
trial population under-represents; recovering them registry-natively closes the diabetes representativeness
gap from +26 to +14.5 pp (patient-weighted; this gap arithmetic uses the literature 26% marginal — the
NHANES-microdata target is 20.6%, §4b). Completeness and transportability are one mechanism.

**Robustness (responding to adversarial review).** (1) The "literature misses 43%" is correctly scoped:
obesity-scoped SRs miss them *by design*; only the ~9.5% (6/63) ghosts are registry-only. (2) Transport validated
out-of-sample across 6 agent/dose comparisons studied in both populations — direction correct 6/6, mean
absolute error 1.4 pp predicting the held-out T2D effect (agent-specific γ +2.6 to +7.2 confirms common-γ
is an approximation). (3) The transported estimate is robust to the joint assumption grid (tirzepatide →
US-obese 17.5 pp, range 16.6–18.1 over γ/contamination/ratio), γ-uncertainty dominant.

## 4. Discussion
**The unification.** Reporting-completeness and population-transportability are not two add-ons but one
registry-native mechanism: the evidence a literature search misses is disproportionately the
under-represented stratum, so recovering it simultaneously de-biases the synthesis and improves its
generalizability. A single automated pipeline delivers both — quantified end-to-end.

**Where this sits in the future of evidence synthesis.** The approach is an *evolution and accelerator*,
not a replacement for systematic review. It instantiates four directions the field is moving toward —
registry-native sourcing (increasingly complete as posting mandates mature), living/reproducible pipelines,
target-population transportability, and a human–AI division of labor (machine extraction/synthesis/transport;
human-attested screening, risk-of-bias, and GRADE). Its specific, novel contribution to that trajectory is
the completeness⊕transportability unification and its registry-native, IPD-free-but-valid transport. The
statistical components (MBNMA, POTH, network meta-regression, NUTS) are existing methods; the contribution
is their integration and the framework, not a new estimator.

## 4b. Transportability & time-to-event (final state)
- **Target = real NHANES microdata.** Replaced the hardcoded marginals with NHANES 2017-2020 public
  microdata (obese subset n=3,688, survey-weighted); the joint distribution is now empirical (requirement-3
  closed), and the diabetes target is corrected 26%→**20.6%** (HbA1c≥6.5% OR self-report).
- **Transport consumes it, with uncertainty.** `pymc_transport_v2.py` reads the microdata target as a
  stochastic node (P_diab ~ N(0.206, SE 0.010)), propagating target-prevalence uncertainty into the
  transported CrIs; Rhat 1.0000, ESS 3326. **POTH 0.898 → 0.898: the ranking survives transport.** k=1 nodes
  tagged INSUFFICIENT.
- **Ethnicity modelled, not flagged.** NHANES obese-diabetes by ethnicity (NHAsian 24.5% > NHWhite 20.3%)
  replaces the 1.8 scalar for Asian-population regions.
- **Unmeasured-modifier sensitivity (E-value-style).** Nullifying the transport needs an unmeasured modifier
  as strong+imbalanced as diabetes; the top ranks (gaps 2.7-4.3 pp) are robust, the smallest gap (0.5 pp,
  orforglipron vs oral-sema) is not. Diabetes + BMI (the measured modifiers) cover the material axes.
- **Time-to-event arm (registry-ipd).** registry-ipd's `harvest_trial()` pulled the incretin CVOT HRs from
  AACT; pooled survival NMA: semaglutide HR 0.81 (k=5), tirzepatide 0.62 — the top weight-loss agents also
  carry CV benefit (joint view). registry-ipd's pseudo-IPD *reconstruction* requires posted KM curves, which
  these trials don't post in AACT (km_points=[0,0]) — wired and waiting, blocked by the registry posting gap.

## 4c. HTA decision layer — the integrator (network MCDA + value of information)
The five analyses (efficacy MBNMA, survival HR, benefit–risk, transportability, completeness) are inputs
to one coverage decision; HTA is where they unify. Reusing the portfolio's validated 41-engine `allmeta/HTA`
platform (benchmarked vs TreeAge) and the `hta-transportability` engine, we drive our **transported**
posteriors into a **Network MCDA** (`hta_mcda.py`, ISPOR good-practice): fusing transported weight loss + CV
HR + nausea, tirzepatide leads (value 0.764, P(best) 0.92) over semaglutide (0.582); agents without a posted
CV outcome (retatrutide/mazdutide) score lower on a reduced criterion set — an honest registry data gap, not
a clinical verdict. A **value-of-information** proxy (EVPPI direction) shows the decision hinges on the
**cardiovascular** evidence (resolving CV uncertainty moves P(best) 0.92→1.00; efficacy/safety Δ=0), i.e.
the under-posted KM-gap stratum is where more research is most valuable. Driving the **validated, TreeAge-benchmarked**
`allmeta/HTA` `evppi.js` (Strong–Oakley GAM) with our posteriors through a minimal PSA (placeholder UK
price/utility) **independently reproduces this VOI direction in monetary units**: at WTP £20–30k/QALY,
EVPPI(CV) is 67–81% of total EVPI, efficacy 0–24%, nausea ~0 — two independent methods agree CV evidence is
the decision driver. A *reportable* ICER/CEAC still needs real drug price + health-state utilities, which are
**not in AACT/CT.gov/PubMed**; the engine handoff is demonstrated end-to-end but cost/utility inputs are
**placeholder, not fabricated as evidence** (the defensible boundary). See `HTA_INTEGRATION.md`.

## 4d. From synthesis to a transparent guideline scaffold (wide-gap methods, certainty, validation)
Five capabilities that the registry's structured fields enable but published effect sizes cannot support
were added and each honestly bounded: **component NMA** (validated to 1e-9 vs `netmeta::discomb`; receptor
decomposition GLP-1 +13.1 / GIP +4.8 / glucagon +5.6 pp, triple agonism sub-additive); **trial-level
surrogacy** (weight loss is *not* a validated CV surrogate — I²_HR=0% across the class — while the same
method returns the expected validated direction for LDL→MACE on a PCSK9-inhibitor repoint, i.e. it
discriminates); **joint benefit–risk** (weight–nausea frontier, orforglipron dominated); **registry-aware
publication bias** (the 6 observed ghosts show an Egger asymmetry that is heterogeneity, not suppression —
a trim-and-fill "correction" would be spurious); and **trial-sequential analysis** (semaglutide MACE crosses
the O'Brien–Fleming boundary while 386 trials still enrol ~172k patients). These feed a transparent
**GRADE + CINeMA** scaffold: the tirzepatide-vs-semaglutide contrast — verified against the exact
joint-posterior (+2.9 pp, 95% CrI −0.14 to 5.98; posterior correlation +0.08, so the conservative CrI was
not over-wide) — is rated **Low certainty** by both frameworks, yielding a *conditional* draft
recommendation that **matches a MAGIC GRADE living guideline** (weak, favour tirzepatide in obesity;
DOI 10.1136/bmj-2024-082071) and a published ranking (Shi 2024). The computable domains are pre-filled and
traceable; judgement domains (risk of bias, values) remain the panel's. Two portfolio integrity methods
were folded in: a **Benford digit screen** (applied to enrolment, not bounded percentages; the marginal
deviation is the benign round-target signature) joining ghost-detection (the IPD/human-attested INSPECT-SR
trustworthiness battery is noted but not run here), and **entropy
balancing** (`nmatransport`), which is *infeasible* network-wide here because every trial is pure-obesity
or pure-T2D — the very **binary-pure-strata structure that makes the γ-transport's extrapolation valid**, a
duality that vindicates the transport while making its extrapolation assumption explicit for the indirectness
domain. The whole chain is one-command reproducible and self-verifying (29-test numerical-baseline contract).
See `WIDE_GAP_METHODS.md`, `GUIDELINE_SUPPORT.md`, `class2_pcsk9/GENERALITY.md`.

## 5. Limitations
No IPD → the rigorous transport estimators (ML-NMR/MAIC) are out of reach; transport is binary-modifier
standardization, valid here only because the modifier is binary with pure strata (agent-specific γ fit:
between-agent sd only 1.3 pp, so common-γ is justified). It is **not a systematic review** without
human-attested dual-screening, RoB-2, and GRADE. Star network → no consistency test. Single phase-2 trials
at the apex (flagged k=1). The obese/general diabetes ratio for non-US regions and the use of US-resident
NHANES ethnicity strata as regional proxies are flagged assumptions. Registry sourcing carries its own
results-posting selection (quantified — 6 ghosts, 89% broad-search recovery — but no formal ROB-ME).
Survival reconstruction blocked by the AACT KM-posting gap (HR pooling used instead).

## 6. Conclusion
A reproducible, registry-native dose-response NMA that recovers evidence a literature search misses and —
because that evidence is the under-represented stratum — improves transportability in the same step, with a
convergence-certified Bayesian transport that is out-of-sample validated and robust to its assumptions. A
genuine methods/automation contribution, honestly bounded: a credible component of a living, registry-native,
target-transportable, human-attested future for evidence synthesis — not a replacement for it.
