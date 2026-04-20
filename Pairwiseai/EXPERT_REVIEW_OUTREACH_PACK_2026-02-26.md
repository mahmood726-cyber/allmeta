# 12-Expert Outreach Pack (Real-World Review)

Date: 2026-02-26
Project: TruthCert-PairwisePro
Working folder: C:\HTML apps\Truthcert1_work

## Guardrail
This process is add-only for the product roadmap:
- Do not remove existing features.
- Do not reduce current functionality.
- Improve by adding validation, documentation, or optional capabilities.

## Objective
Obtain structured feedback from 12 independent meta-analysis experts and estimate:
1. How many would adopt immediately.
2. What specific blockers prevent immediate adoption.
3. Which improvements most efficiently increase adoption count.

## Target panel composition (12 total)
1. Cochrane or guideline methodologist
2. Academic biostatistician (metafor-focused)
3. HTA/payer method lead
4. Clinical epidemiologist
5. Journal statistical reviewer
6. Pharma evidence synthesis lead
7. Regulatory biostatistics reviewer
8. Sparse-event specialist
9. Publication-bias specialist
10. Reproducibility/open-science lead
11. Consultant meta-analyst (high throughput)
12. Clinician-investigator (non-coding)

## Eligibility criteria
- Minimum 5 years in evidence synthesis or advanced meta-analysis.
- At least 5 peer-reviewed publications or equivalent regulatory/HTA submissions.
- Active use of one or more: R metafor/meta, Stata meta, RevMan, or equivalent.
- No direct conflict of interest with core claims under review.

## Review package sent to experts
- App file and run instructions.
- Current benchmark memo and parity summary.
- Structured survey rubric and scoring sheet.
- Optional 30-minute demo link.
- Deadline and contact details.

Recommended attachment set:
- PAIRWISE_BENCHMARK_2026-02-26.md
- METAFOR_COMPARISON.md
- MULTI_EXPERT_REVIEW_2026-02-26.md (label as simulated baseline)
- EXPERT_SURVEY_RUBRIC_12_PANEL_2026-02-26.md

## Outreach workflow
1. Build candidate list of 18 to 24 experts to secure 12 completed reviews.
2. Send Wave 1 invitations to 12 primary candidates.
3. Send Wave 2 invitations to alternates after day 4 if completion rate is low.
4. Run optional 20-minute onboarding calls for non-responders.
5. Lock responses at deadline and compute adoption metrics.

## Timeline (recommended)
- Day 0: Finalize materials and candidate list.
- Day 1: Send initial invitations.
- Day 4: Send follow-up reminder and alternates.
- Day 8: Close data collection.
- Day 9: Run scoring summary and adjudicate blockers.
- Day 10: Publish final external expert review memo.

## Response and quality controls
- Minimum completion: 12 responses with all required scoring fields.
- Require explicit adoption vote: Adopt now / Pilot first / Not now.
- Flag responses with missing critical criteria for manual follow-up.
- Keep original free-text comments for traceability.

## Data capture artifacts
- EXPERT_REVIEW_TRACKER_TEMPLATE.csv
- EXPERT_SCORING_SHEET_TEMPLATE.csv
- summarize_expert_reviews.py

## Success criteria
- Primary: Immediate adoption >= 8/12.
- Secondary: No more than 2 unresolved critical blockers.
- Stretch: Immediate adoption >= 10/12 after remediation pass.

## Communication cadence
- Weekly status note while outreach is active.
- Final report includes:
  - Adoption counts
  - Mean scores by domain
  - Top 5 blocker themes
  - Ranked improvement backlog

## Risk register
1. Low response rate
- Mitigation: over-recruit by 50 percent and use alternates.

2. Biased sample (too many similar experts)
- Mitigation: enforce panel composition slots.

3. Ambiguous scoring
- Mitigation: provide anchored rubric and weighted scoring rules.

4. Feature regression pressure
- Mitigation: enforce add-only guardrail in all action items.
