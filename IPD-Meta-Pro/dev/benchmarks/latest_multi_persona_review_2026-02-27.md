# IPD Meta-Analysis Pro: Final 12-Persona Review

Date: 2026-02-27
Scope: IPD workflows only, with production-facing UI + reporting + validation checks.

## 1) Executive outcome

- Adoption forecast result: **11/12 adopt** (target = 11/12 met).
- Remaining non-adopter: **Conservative External Reviewer**.
- Primary blocker: independent external signoff requirement not completed (**0/2 signoffs recorded**).

## 2) Persona outcome summary

Adopted now:
1. Academic IPD Methodologist
2. Survival Methods Specialist
3. HTA Evidence Synthesis Lead
4. Industry Trial Statistician
5. Regulatory Biostat Lead
6. Network MA Specialist
7. Causal Transportability Specialist
8. Federated Privacy Lead
9. R-Centric Programmer
10. QA / Validation Engineer
11. Clinical PI Collaborator

Conditional:
1. Conservative External Reviewer

Condition reason:
- Needs independent external signoffs (2 required; currently 0 recorded).

## 3) Evidence used in this review

- Published benchmark artifacts loaded and used (not provisional):
  - `latest_ipd_parity_gate.json`
  - `latest_frontier_gap_methods_benchmark.json`
  - `latest_ipd_simulation_lab_benchmark.json`
  - `latest_publication_replication_gate.json`
- Forecast evidence source:
  - `published_parity_artifact+published_frontier_artifact+published_simulation_artifact+published_replication_artifact`

Key benchmark values (2026-02-26 artifacts):
- Loop 2 + frontier + loop 7 pass rates: all **1.0** in published artifacts.
- Frontier max absolute utility gap: **0.0038088**.
- Simulation lab overall pass rate: **1.0**.
- Publication replication overall pass rate: **1.0**.

## 4) Issues found in this final round and fixes applied

1. Meta-regression bubble plot could remain blank.
- Cause: `runMetaRegression()` could fail to draw when external `drawBubblePlot` was unavailable in current runtime scope.
- Fix: added robust in-function fallback renderer and safer numeric handling.

2. Network ranking plots were not rendered (`rankogramPlot`, `cumulativeRankPlot`).
- Cause: ranking plot draw functions were defined but not invoked in `runNetworkMetaAnalysis()`.
- Fix: added explicit calls to draw ranking plots after ranking table update.

3. Network mode could incorrectly collapse to 2 treatments.
- Cause: auto-mapped `treatment` (binary) could be used instead of `treatment_name` in multi-arm network data.
- Fix: in `buildNetworkFromData()`, if configured treatment field has <3 distinct levels and `treatment_name` has >=3, auto-fallback to `treatment_name`.

## 5) Final gating status

- Function wiring check (`onclick` handlers): pass.
- Major plot rendering check: pass after fixes.
- Remaining adoption blocker is governance-signoff completion, not a software defect.

## 6) Action to reach 12/12

- Record two independent external signoffs in the signoff workflow:
  - Reviewer name
  - Reviewer email
  - Organization
  - Reviewer role
  - Decision and date
- This should satisfy the conservative external-reviewer gate and move to 12/12.
