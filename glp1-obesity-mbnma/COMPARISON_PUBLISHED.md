# How this dose-response NMA compares to published meta-analyses

Source: PubMed (permitted). My values = NUTS-certified placebo-adjusted % weight loss at the
max studied dose (95% CrI). Published values = pooled % weight loss vs placebo from the cited NMAs.

## Head-to-head vs the most comparable published NMA
**Xie et al. 2024, *Metabolism* 161:156038 — doi:10.1016/j.metabol.2024.156038** (PubMed):
7 GLP-1 RAs / polyagonists, primary outcome = % body-weight change, frequentist RE-NMA,
**27 RCTs / 15,584 patients**. The closest published analogue to this project.

| Agent (dose) | Published (Xie 2024) | This repo (NUTS) | Δ |
|---|---|---|---|
| tirzepatide 15 mg | **−16.53%** | 16.6 pp (14.5, 18.9) | ~0.1 — essentially identical |
| retatrutide 12 mg | **−22.10%** | 20.4 pp (16.0, 25.1) | ~1.7 (my ≥36-wk landmark + pinned estimand) |
| retatrutide 8 mg | −20.70% | (8 mg not a separate node) | — |

**Ranking agreement:** Xie's top tier = retatrutide (both doses) + tirzepatide 15 mg; "dual/triple
receptor agonists more effective than GLP-1 RAs." My hierarchy: retatrutide > mazdutide > tirzepatide
> semaglutide-SC > orforglipron — **same top tier, same conclusion** (triple/dual agonists on top).

## Corroborating NMAs (PubMed)
- **Karakasis et al. 2024, *Metabolism* 164:156113 — doi:10.1016/j.metabol.2024.156113**: 22 RCTs;
  "tirzepatide 15 mg and semaglutide 2.4 mg most effective for weight/fat-mass reduction." Matches my ordering.
- **Nunns et al. 2025, *Health Technol Assess* — doi:10.3310/SKHT8119** (NIHR scoping review of 22 NMAs):
  at 6 mo, SC tirzepatide 9 kg (5 mg) → 12 kg (15 mg); SC semaglutide 2.4 mg 11.5–12.5 kg; tirzepatide
  + semaglutide "stand out." 8/22 reviews were low/critically-low AMSTAR-2 quality.

## Where this project is AT or AHEAD of the published NMAs
The NIHR HTA scoping review (Nunns 2025) names the **central methodological weakness of the existing
literature**: *"The tendency to combine multiple doses of drugs, and to merge findings from multiple
time points, limits our understanding of dose and time effects."* This project directly fixes both:
- **Dose-response (MBNMA)** — doses are modelled as a surface per agent, not merged.
- **Timepoint landmark (≥36 wk)** — not merged across 6/12/18-mo follow-ups.
- **POTH** — rank-uncertainty quantified (0.85); most published NMAs quote SUCRA without it.
- **Extraction externally validated** vs the *NEJM* primaries (validate_pubmed.md).

## Where the published NMAs are AHEAD
- **Scale/search:** Xie 27 RCTs / 15,584 pts via Medline+Embase+Cochrane; mine 29–57 trials, AACT-results-posted only.
- **Full SR apparatus:** dual screening, AMSTAR-2, RoB-2, GRADE, publication-bias tests, PROSPERO registration.
- **Peer review.**

## Verdict
On the numbers, this project **reproduces the published gold-standard NMA** (tirzepatide 15 mg 16.6 vs
16.53; retatrutide top; triple/dual > mono). On method, it is **ahead** on the exact axis the NIHR HTA
review flags as the field's weakness (dose- and time-resolution). It trails on SR *process* (search
breadth, RoB/GRADE/peer-review) — which is the RapidMeta-wrapper / human-attestation work, not the synthesis.
