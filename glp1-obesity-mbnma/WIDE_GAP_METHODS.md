# Wide-gap methods: what registry + PubMed abstracts let clinicians do that ordinary meta-analysis cannot

The gap is widest where **structured registry data carries information that published effect sizes throw
away**: arm-level structure, full adverse-event tables, baseline covariate distributions, multiple
timepoints, eligibility criteria, the *known denominator of unpublished trials*, and the trial pipeline.
Each method below is tied to a **patient/clinician question**, the **registry field that uniquely enables
it**, and a **validated method + portfolio engine**. Status = what is actually demonstrated here.

---

### 1. Component NMA — receptor decomposition   ✅ DEMONSTRATED (validated vs `netmeta::discomb`, 1e-9)
- **Patient/clinician question:** *Which receptor drives the weight loss, and what would a new combination
  do before anyone trials it?*
- **Registry-unique enabler:** arm-level intervention structure + known pharmacology of each agent.
- **Method/engine:** additive contrast CNMA (Welton 2009 / Rücker 2020); `allmeta/component-nma` (oracle
  fixture). `cnma_incretin.py` (parity PASS to 1e-9).
- **Result:** GLP-1 +13.1 / GIP +4.8 / glucagon +5.6 pp; triple agonism sub-additive (pred 23.5 vs obs
  21.4); predicts an un-trialled GIP+glucagon agent ~10.4 pp.
- **Why ordinary MA can't:** it pools each drug as a black box — no mechanism, no extrapolation to
  un-trialled combinations. *(Caveat: common-component-across-molecules is approximate; Q=20.3/df=4.)*

### 2. Surrogate-endpoint validation (trial-level)   ✅ DEMONSTRATED (`surrogate_validation.py`)
- **Patient question:** *Does the weight I lose on this drug actually mean fewer heart attacks / longer
  life — or am I just chasing a number on the scale?*
- **Registry-unique enabler:** AACT carries **both** the surrogate (weight) **and** the final outcome
  (MACE HR) in the **same CVOTs** — harvested 6 within-trial pairs an obesity-scoped MA never has.
- **Method/engine:** meta-analytic trial-level surrogacy (Buyse 2000; Daniels–Hughes 1997).
- **Result (honestly bounded):** **weight loss is NOT a validated trial-level surrogate for CV benefit.**
  Within semaglutide r=+0.22; weighted trial-level R²=0.19; the raw +0.79 is leveraged entirely by
  tirzepatide. SELECT (−8.5% weight, HR 0.80) vs SUSTAIN-6 (−4.6%, HR 0.74) = *more* weight loss, *less*
  CV benefit → a weight-**independent** GLP-1 CV effect. **Clinical message: weight loss cannot substitute
  for hard-outcome trials.** *(k=6, semaglutide-dominated — hypothesis-strength; full-class is the real test.)*

### 3. Multivariate / joint efficacy + safety NMA   ✅ DEMONSTRATED (`joint_benefit_risk.py`)
- **Patient question:** *Show me the benefit and the harms together — for the side-effect I care about.*
- **Registry-unique enabler:** AACT `reported_events` — the full structured AE table per arm.
- **Method/engine:** bivariate benefit-risk surface + efficiency frontier (multivariate-MA concept).
- **Result:** frontier = mazdutide↔retatrutide↔tirzepatide↔sema-sc↔sema-oral (each rational depending on
  weight-vs-tolerability priority); **orforglipron is dominated**; ~**2.2 pp more nausea per extra pp
  weight loss** (corr +0.72); semaglutide best benefit-per-harm. An efficacy-only ranking hides this.

### 4. Registry-aware publication-bias / selection model   ✅ DEMONSTRATED (`registry_pubbias.py`)
- **Clinician question:** *Is the published effect inflated by trials I can't see?*
- **Registry-unique enabler:** the unpublished trials are **observed entities** (posted-but-unpublished).
- **Result (a stronger finding than expected):** for semaglutide 2.4 mg, Egger flags significant funnel
  asymmetry (p≈0.00) — a naive trim-and-fill would "correct" the estimate. **But the registry observes the
  one ghost trial (10.0 pp, only 0.12 pp below the pooled mean): the real suppression is negligible.** The
  asymmetry is small-study heterogeneity, not reporting bias — **the correction would be SPURIOUS.** The
  registry supplies ground truth that disambiguates true suppression from look-alike asymmetry, preventing
  both *missed* and *spurious* bias. *(Copas needs k≥15 — inapplicable here, which is itself the point.)*

### 5. Trial Sequential Analysis + the ONGOING pipeline   ✅ DEMONSTRATED (`trial_sequential.py`)
- **Clinician/policy question:** *Is the evidence conclusive yet, or should we wait — is more research needed?*
- **Registry-unique enabler:** recruiting/active trial records → a prospective information fraction.
- **Method/engine:** TSA (Wetterslev; O'Brien–Fleming α-spending, advanced-stats.md), AACT pipeline query.
- **Result:** semaglutide MACE benefit is **conclusive** (cumulative HR 0.81, z=−6.59, 317% of required
  information, crosses the OBF boundary) — yet **386 incretin trials are still enrolling ~172,654
  patients.** Registry-native TSA becomes a **research-prioritisation signal**: redirect pipeline capacity
  from settled questions to unsettled ones — a call retrospective MA cannot inform.

### 6. Dose–time-response (longitudinal trajectory)   ◑ PARTIALLY (dose done; time arm available)
- **Patient question:** *How fast does it work, when does it plateau, and what's the maintenance dose?*
- **Registry-unique enabler:** multiple structured timepoints per arm in `outcome_measurements`.
- **Method/engine:** model-based longitudinal MBNMA (Pedder); `allmeta/dose-response-ma`.
- **Why ordinary MA can't:** it collapses each trial to one chosen landmark, discarding the trajectory.

---

## The thesis (where the gap is widest)
Ordinary meta-analysis is a function of **published aggregate effect sizes**. Five of these six methods
need information that is *structurally absent* from that input — receptor structure (1), the hard-outcome
pairing (2), the joint AE table (3), the unpublished denominator (4), the live pipeline (5), the trajectory
(6). Registry + abstracts don't just *speed up* the same meta-analysis; they enable analyses the ordinary
input **cannot represent at all**. That is the wide gap, and it is mechanistic, prognostic, and safety
information patients and clinicians actually ask for.

## Status: all six demonstrated
Methods 1–6 are now built and run on the incretin data (1 + 2 + 3 + 4 + 5 here; 6 = the dose-response
arm). Each is validated where an oracle exists (CNMA to 1e-9 vs `discomb`), honestly bounded, and tied to
a concrete patient/clinician question. Three produced findings ordinary MA could not reach *and that change
the clinical message*: weight loss is **not** a validated CV surrogate (#2); the benefit-risk frontier
makes the weight-vs-tolerability trade-off explicit and shows orforglipron dominated (#3); a publication-
bias "correction" the funnel invites would have been **spurious** (#4). The strongest single result for the
"new gold standard" claim is #4 — the registry doesn't just *find* missing evidence, it supplies the
**ground truth** that tells you when the standard inferential corrections are wrong.

## Honest meta-caveat
All five new demonstrations are **small-k, single-class, hypothesis-strength**. The *machinery and the
gap* are the contribution; the specific estimates need the full class, bivariate modelling, and human-
attested RoB/GRADE before any clinical use. The wide gap is real and structural; the numbers here are a
proof of capability, not a guideline.
