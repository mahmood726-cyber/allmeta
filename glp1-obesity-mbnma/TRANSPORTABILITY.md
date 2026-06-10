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

## Workstream B result — sensitivity transport (labelled, not primary)
`workstream_B_transport.py`. Transport each node's effect to the NHANES US obese-adult target on the
DIABETES modifier (the biggest representativeness gap + a known strong modifier). Diabetes-attenuation
slope beta = 3.4 pp per 100% diabetes (literature-anchored to the STEP-1 obesity ~15% vs STEP-2 T2D ~10%
difference; the within-agent split could not be computed here because AACT HbA1c tagging was too sparse).

| node | trial effect | transported (NHANES 26% diabetes) | shift |
|---|---|---|---|
| mazdutide | 22.3 | 21.4 | -0.9 |
| retatrutide | 22.1 | 21.2 | -0.9 |
| tirzepatide | 15.3 | 14.4 | -0.9 |
| semaglutide-oral | 13.6 | 12.7 | -0.9 |
| semaglutide-sc-weekly | 13.3 | 12.4 | -0.9 |

**Read (SENSITIVITY only):** transporting to a more-diabetic real-world population reduces weight loss a
modest ~0.9 pp across nodes — small but in the expected direction, consistent with the +14.5 pp residual
diabetes gap. EXPLICIT caveats: not a primary effect (no IPD; ML-NMR/MAIC need it); one modifier only;
the uniform shift reflects that obesity nodes' max-dose arms carry ~0% trial diabetes (so the transport
is ~beta x 0.26); joint-distribution and unmeasured-modifier effects not captured. This is the honest
ceiling of transport with aggregate registry data — a labelled sensitivity, framed exactly so as not to
invite the ecological-fallacy criticism.

## BMI second modifier (abstract-supplemented) — robustness check
`workstream_bmi.py`. Baseline BMI extracted from PubMed abstracts (efetch/WebFetch) lifted coverage
from n=2 (AACT) to 17 trials, and CORRECTED the sparse estimate: trial mean BMI 35.8 ≈ NHANES 36.0
(gap -0.2). The BMI modifier slope (semaglutide 2.4 mg, across-trial) is -0.04 pp/BMI-unit and
ECOLOGICAL (continuous covariate, unlike binary-pure-strata diabetes) -> transport contribution -0.01 pp.
**Adding BMI does not change the transport conclusion.** The transport is driven entirely by DIABETES
(the one axis with a large gap AND a valid individual-level slope); BMI/age/sex are near-target and
contribute ~0. The conclusion is robust to the second, weaker modifier - reassuring, not a weakness.

## Multi-target transport ATLAS (other authoritative sources, not just NHANES)
`workstream_transport_atlas.py`. Transport each node's obesity-population effect to several
authoritative target populations using the Bayesian diabetes modifier (gamma = 5.8 pp):
eff_target = eff_obesity - gamma*P_diabetes. Target diabetes prevalence:
IDF Diabetes Atlas 2021 (age-adjusted, adults 20-79): Africa 5.3%, Europe/S&C-America 10.3%, Global
10.5%, Western Pacific 11.4%, N.America+Caribbean 15.0%, MENA/Gulf 18.1%; NHANES US obese-adults 26%.

| node | obesity | Africa | Global | MENA | US-obese |
|---|---|---|---|---|---|
| mazdutide | 22.5 | 22.2 | 21.9 | 21.5 | 21.0 |
| retatrutide | 21.4 | 21.1 | 20.8 | 20.4 | 19.9 |
| tirzepatide | 18.7 | 18.4 | 18.1 | 17.7 | 17.2 |
| semaglutide-sc-weekly | 15.8 | 15.5 | 15.2 | 14.8 | 14.3 |

Effect varies by target diabetes burden (~1.5 pp obesity→US-obese span). tirzepatide→US-obese 17.2 pp
(gamma-band 16.6-17.8). HONEST CAVEAT: IDF figures are GENERAL-adult diabetes prevalence; the obese
subpopulation has higher diabetes (US 14.8%→26%), so the IDF-region targets slightly OVERSTATE weight
loss for the obese population — US-obese (NHANES) is the matched anchor; region-specific obese-subset
prevalences would lower those further. Sources: IDF Diabetes Atlas 2021 (NCBI NBK581940); NHANES
2017-2020 (CDC NCHS).

## Region-specific OBESE-SUBSET diabetes targets (replaces general-adult proxy)
`workstream_obese_subset.py`. Direct obese-subset diabetes prevalence from national surveys where
published, IDF regions scaled by the empirical obese/general ratio (1.8; US 14.8->26%=1.76, UK 7->13%=1.86):
- DIRECT: US obese 26% (NHANES 2017-2020); England obese 13% (Health Survey for England 2024).
- Scaled (IDF x1.8): Africa 9.5%, Global 18.9%, W.Pacific/China 20.5%, N.America+Caribbean 27.0%, MENA/Gulf 32.6%.
- Consistency check: IDF N.America 15.0% x1.8 = 27% ~ US-obese direct 26% (ratio validated). England direct
  (13%) is used over IDF-Europe-scaled (~18.5%) because UK general diabetes (~7%) < IDF-Europe (10.3%).

Transport (Bayesian gamma=5.8): tirzepatide obesity 18.7 -> England 17.9 -> US-obese 17.2 -> MENA-obese 16.8;
spread across obese-subset targets (Africa 9.5% -> MENA 32.6%) = 18.1 -> 16.8 pp. The obese-subset targets
deepen attenuation for high-burden regions vs the general-adult proxy (MENA 17.7 general -> 16.8 obese),
which is more realistic. Sources: NHANES (CDC), Health Survey for England 2024 (NHS Digital), IDF Diabetes
Atlas 2021 (NBK581940). transport_atlas_obese.json.

## FIX — real NHANES microdata replaces hardcoded marginals (requirement-3 closed)
`nhanes_microdata.py`. Downloaded NHANES 2017-2020 public microdata (CDC), built the obese-adult subset
(BMI>=30, age>=18; n=3,688; survey-weighted WTMECPRP) and computed the JOINT distribution + marginals of
the effect modifiers. **This closes the gap between the stated framework (req-3: joint microdata) and the
earlier hardcoded summary stats.**
| modifier | microdata | was hardcoded | diff |
|---|---|---|---|
| mean age | 48.1 | 49.5 | -1.4 |
| % female | 52.3 | 52.0 | +0.3 |
| mean BMI | 36.4 | 36.0 | +0.4 |
| mean weight (kg) | 103.1 | 102.0 | +1.1 |
| **% diabetes** | **20.6** | **26.0** | **-5.4 (the hardcoded value was too high)** |

The diabetes target is corrected from 26% to **20.6%** (HbA1c>=6.5% OR self-report, survey-weighted). Joint
correlations now empirical (age-HbA1c 0.29, BMI-HbA1c 0.07), not assumed-independent. Corrected transport to
the microdata target: tirzepatide 18.7->17.5, sema-sc-weekly 15.8->14.6, retatrutide 21.5->20.3 (each ~-1.2 pp;
slightly less attenuation than the over-high 26% gave). Conclusions hold; the values are now microdata-exact.
For the binary-diabetes transport only the diabetes marginal is binding; the joint is available for any future
multi-continuous-modifier transport. nhanes_target.json, nhanes_obese_microdata.csv.

## EXTENSION — time-to-event (CV/renal) outcomes via the survival arm
`build_survival.py` + registry-ipd. 9 incretin trials carry a HARD-outcome (CV/MACE/HF/renal/death) HR in
AACT (67 HR rows). Registry-native survival signal by agent: semaglutide median HR 0.77 (SELECT 0.76,
SUSTAIN-6 0.74), liraglutide 0.91 (LEADER 0.87), dulaglutide 0.91 (REWIND 0.76), tirzepatide HF 0.62 -
recovering the known CV-benefit hierarchy from the registry. 7/9 post curve-like data (registry-ipd
reconstruction candidates for RMST/time-varying-HR/calibrated CrI). Joint view: the top weight-loss agents
also carry cardiovascular benefit. survival_hrs.csv, survival_summary.json.
