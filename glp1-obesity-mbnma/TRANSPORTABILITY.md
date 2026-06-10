# Transportability — the methodologically-valid design (and where it can't go)

Goal: estimate what the incretin weight-loss effect would be in a defined real-world TARGET
population, not just the trial-eligible one — using AACT placebo-arm baseline distributions as the
SOURCE and authoritative external sources (NHANES / WHO / NCD-RisC / World Bank) for the TARGET.
The user's concern is exactly right: done loosely, transportability invites criticism. Below is the
valid framework, each validity requirement paired with the criticism it pre-empts, and the HARD
constraint our data imposes.

## Framework & estimand
Estimand: the average treatment effect in the target population, E[Y(1)-Y(0) | target]. Validated
methods: Westreich et al. 2017 (IOSW); Dahabreh et al. 2020 (transportability estimators); Pearl &
Bareinboim 2014 (selection diagrams); for networks, Phillippo et al. 2020 (multilevel network
meta-regression, ML-NMR). Transport is over EFFECT MODIFIERS only, under the assumptions below.

## Five validity requirements (each pre-empts a specific criticism)
1. **Pre-specified, justified effect modifiers.** Transport over modifiers of the effect (baseline
   BMI/weight, diabetes status/HbA1c, age, sex), NOT all covariates. Justify each is a modifier via
   interaction/meta-regression evidence. → pre-empts "you transported on non-modifiers / missed one."
2. **Positivity / overlap.** Target covariate support must lie within the trial support; restrict to
   the overlap region or flag extrapolation. AACT placebo-arm baselines define the source support. →
   pre-empts "you extrapolated beyond trial eligibility."
3. **Authoritative target with the JOINT distribution.** Effect modifiers are correlated, so marginals
   + independence is wrong. Use **NHANES microdata** (individual-level joint of BMI/weight/age/sex/HbA1c)
   for a US target; **NCD-RisC / WHO GHO** (the authoritative pooled BMI source) for global marginals;
   **World Bank** for age structure. → pre-empts "marginals-with-independence" and "non-authoritative source."
4. **A valid estimator for the data we actually have.** See the HARD CONSTRAINT below.
5. **Sensitivity to unmeasured modifiers.** Report a bias-function / E-value-style sensitivity. →
   pre-empts "unmeasured effect-modifier bias."

## THE HARD CONSTRAINT (be honest or get criticised)
The rigorous estimators (ML-NMR, MAIC, STC, IOSW) need **individual patient data (IPD)** for at least
one trial. We have **aggregate registry + abstract data only — no IPD.** With aggregate-only data:
- A trial-level meta-regression of effect on a covariate, predicted at the target's covariate value,
  suffers **aggregation bias / ecological fallacy** — the across-trial slope ≠ the within-person slope.
  This is the #1 criticism of aggregate covariate adjustment and **cannot be claimed as a primary
  effect**.
- VALID paths with our data:
  (a) **Within-trial subgroup data where reported** (some incretin trials report weight loss by
      baseline-BMI band or by diabetes status — AACT `result_groups` / outcomes). Within-trial
      interactions are NOT subject to ecological fallacy → use these as the modifier evidence.
  (b) A meta-regression transport reported EXPLICITLY as an **external-validity SENSITIVITY analysis**
      with the ecological-fallacy limitation stated, never as "the effect in the real world."
  (c) **Positivity/representativeness assessment** alone (compare AACT placebo-arm baselines vs the
      NHANES/WHO target distribution) — this is fully valid and criticism-proof, and is the honest
      first deliverable: "how representative are the trials of the target population?"

## What we will / won't claim
- **WILL (valid):** (i) a positivity/representativeness map — trial vs target covariate distributions
  (AACT placebo baselines vs NHANES/WHO); (ii) within-trial-subgroup-informed effect-modifier estimates
  where trials report them; (iii) a transported estimate as a labelled SENSITIVITY analysis with
  aggregation-bias and unmeasured-modifier caveats.
- **WON'T (invalid without IPD):** a primary "real-world effect" claim from aggregate meta-regression;
  ML-NMR/MAIC (need IPD); any transport that ignores positivity or uses marginal-independence target.

## Data sources (user invited external authoritative sources)
- SOURCE (trial-eligible): AACT `baseline_measurements` placebo-arm distributions (already partly in
  transitivity.csv).
- TARGET: NHANES (CDC, US joint microdata) · NCD-RisC / WHO GHO (global BMI, authoritative) · World Bank
  (demographics). All authoritative; abstracts/registry policy unaffected (these are reference distributions).

## Honest bottom line
Transportability here is a legitimate, valuable EXTERNAL-VALIDITY layer — but with aggregate data its
rigorous form is a **representativeness assessment + a clearly-labelled sensitivity analysis**, not a
primary real-world effect. Claiming more without IPD is exactly what would draw criticism. Framed this
way it strengthens the work; framed as a definitive real-world estimate it would weaken it.

## Workstream I result — representativeness map (US / NHANES 2017-2020)
`workstream_I_representativeness.py`. Trial-eligible population (AACT placebo-arm baselines) vs US
adults-with-obesity (NHANES 2017-2020, CDC NCHS). Descriptive only — NO transport estimator.

| modifier | trial (n) | NHANES target | diff |
|---|---|---|---|
| mean age (yr) | 51.8 (52) | 49.5 | +2.3 |
| % female | 55.8 (57) | 52.0 | +3.8 |
| mean BMI | 37.2 (2) | 36.0 | +1.2 |
| baseline weight (kg) | 104.8 (10) | 102.0 | +2.8 |
| **% with diabetes (proxy)** | **15.8** | **26.0** | **-10.2** |

**Headline (valid, criticism-proof):** incretin obesity trials are reasonably representative of US
obese adults on age, BMI, weight, and sex (all within ~4 of target), but **UNDER-represent diabetes
(~16% vs ~26%)** because obesity-primary trials exclude it — and the **registry-native capture of the
T2D-secondary trials partially restores that missing stratum**, tying transportability to the
registry-native advantage. Coverage caveat: AACT baseline reporting is sparse (BMI n=2, weight n=10);
%female (n=57) and age (n=52) are solid; diabetes is an HbA1c/population proxy. A fuller positivity
check would abstract-supplement baselines (PubMed abstracts, allowed). This is a representativeness
MAP; a transported effect would need IPD (see hard constraint above).

Source: NHANES 2017-March 2020 prepandemic, CDC/NCHS — Obesity & Severe Obesity Prevalence (DB508);
NHANES prepandemic file development (NBK606854). Obesity prevalence 41.9%; adult diabetes 14.8%
(higher in the obese subset).
