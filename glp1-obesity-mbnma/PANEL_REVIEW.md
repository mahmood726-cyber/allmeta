# Multi-persona adversarial review — "is this a breakthrough / a better meta?"

5 independent expert personas (NMA methodologist, Bayesian biostatistician, evidence-integrity/
AMSTAR expert, methods-journal editor, hostile red-team) + a panel chair who independently
verified load-bearing claims in code. Unanimous.

## Verdict: breakthrough = NO · better-than-published = NO
Genuine contribution is **engineering / reproducibility, NOT clinical or statistical**.
- **Clinical novelty:** none — it reproduces the published hierarchy (Xie 2024: tirzepatide 15 mg 16.6 vs 16.53; retatrutide top).
- **Statistical novelty:** none — MBNMA (Pedder), Emax, POTH (Wigle 2025), NUTS are all pre-existing.
- **Engineering novelty:** real but incremental — zero-manual-entry, registry-native (AACT-only), seeded,
  end-to-end-reproducible CT.gov-to-ranking pipeline with estimand-pinned, externally-cross-checked extraction.

## Load-bearing problems the chair VERIFIED in code
1. **The dose-response model is decorative for the headline.** Ranking uses the *observed* IVW effect at
   each node's max dose (fit_network.py L99-103); the Emax surface is "shape only." So the result is
   effectively a max-dose placebo-star pairwise NMA, not a dose-response NMA output.
2. **The "one-step Bayesian" claim is FALSE.** 38 of 54 contrasts share a placebo arm within 13 multi-arm
   trials, but the likelihood treats all contrasts as independent Normals — ignores within-trial multi-arm
   covariance → anti-conservative CrIs. (Real statistical error.)
3. **Top-2 ranks rest on single phase-2 trials** (mazdutide, retatrutide, sema-sc-daily each k=1). Wide CrIs
   are prior-imposed (partial pooling), not data-driven. INSPECT-SR not run.
4. **"Validated EXACT" = 3 of 57 trials** — the same marquee NEJM trials that drive the ranks (near-circular).
5. **Star network → no consistency check possible; transitivity never assessed.**
6. **Population-mixing confound:** the oral-semaglutide node pools PIONEER T2D glucose trials with OASIS
   obesity trials under one Emax curve; cross-scale pooling shares hyperpriors across oral-mg/day and SC-mg/week.
7. **"57 trials" headline vs 29-trial / 7-node / 54-contrast actual primary analysis.**
8. **Not a systematic review** — no dual screening / PROSPERO / RoB-2 / GRADE / publication-bias. AMSTAR-2 critically low.

## Strengths the panel credited
Unusually honest in-repo disclosure (caveats pre-empt most objections); NUTS correctly executed
(non-centred, estimated variances, Rhat 1.0000, ESS 603); POTH cross-checked EXACT vs CRAN poth.js;
genuine reproducibility (pinned snapshot, seeds, real data matches prose); sound extraction discipline.
> Chair: "The in-repo self-criticism is excellent; the failure is that the EXTERNAL framing (breakthrough,
> better, ahead, reproduces-gold-standard) overclaims far beyond what the honest internal docs support."

## The genuinely publishable claim (path forward)
The novel, defensible contribution is **the registry-native-vs-literature-based delta**, not the obesity ranking:
1. Run BOTH a registry-native and a literature-based NMA on the same question; quantify how much
   registry-only sourcing changes effects/ranks/POTH vs Xie 2024. **That divergence is the paper.**
2. Add the reporting-bias machinery the registry-only design demands: results-posted-vs-registered
   denominator (CT.gov↔PubMed linkage), ROB-ME, comparison-adjusted funnel.
3. Fit a TRUE one-step arm-based MBNMA carrying multi-arm covariance; make the dose-response surface
   actually drive the ranking and beat max-dose pairwise on held-out arm prediction.
4. Separate diabetes from obesity before pooling; don't share Emax/ED50 hyperpriors across oral/SC.
5. Drop or relabel single-trial nodes as "insufficient evidence (k=1)"; run INSPECT-SR + leave-one-out.
6. Validate extraction on 20-30 random held-out arms with Wilson CIs (not 3 marquee trials).
7. Pre-register the ranking estimand; compute POTH per draw with a CrI; 4+ chains, divergences reported.

Honest home: a **methods/automation note on registry-native synthesis**, not a clinical NMA or a breakthrough.
