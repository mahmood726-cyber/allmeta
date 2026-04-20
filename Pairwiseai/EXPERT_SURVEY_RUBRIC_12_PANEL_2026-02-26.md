# Expert Survey Rubric (12-Panel)

Date: 2026-02-26

## Instructions
- Score each domain from 1 to 5.
- Use anchors exactly as written.
- Provide one adoption decision and top blockers.

Score anchors:
- 1 = inadequate
- 2 = weak
- 3 = acceptable
- 4 = strong
- 5 = excellent

## Domain scores
1. Statistical correctness (weight 20)
- Numerical agreement with trusted references.

2. Pooling and estimator coverage (weight 15)
- Availability and correctness of random-effects estimators.

3. Bias diagnostics coverage (weight 10)
- Egger/Begg/Peters/trim-and-fill/PET-PEESE/TES depth.

4. Advanced methods (weight 10)
- Meta-regression, subgroup, influence, rare-event handling, GLMM depth.

5. Reproducibility and auditability (weight 15)
- Clear method trace, exportable artifacts, deterministic reruns.

6. Usability and workflow efficiency (weight 10)
- Speed and clarity for production analyses.

7. Reporting and publication readiness (weight 10)
- Manuscript/supplement readiness and method transparency.

8. Regulatory or HTA decision readiness (weight 10)
- Suitability for high-stakes decision support.

Total weighted score formula:
- Weighted total (0-100) = sum(domain_score * domain_weight / 5)

## Critical blocker flags (yes/no)
Mark yes if any apply:
1. Numerical correctness concern in core estimates.
2. Insufficient method transparency for reproduction.
3. Missing required method family for your workflow.
4. No adequate audit trail for submission context.

## Adoption decision
Select one:
1. Adopt now
2. Pilot first
3. Not now

Recommended vote mapping:
- Adopt now: weighted total >= 85 and no critical blocker.
- Pilot first: weighted total 70 to 84, or blocker fixable in <= 4 weeks.
- Not now: weighted total < 70, or major unresolved blocker.

## Required qualitative fields
1. Top 3 strengths.
2. Top 3 blockers.
3. Minimum changes needed for Adopt now.
4. Any concern that a fix could reduce existing functionality.

## Guardrail confirmation
Reviewer confirms recommendation is add-only:
- Improvements should add capabilities or validation.
- Existing functionality should not be removed.
