Mahmood Ahmad
Tahir Heart Institute
mahmood.ahmad2@nhs.net

Evidence Board: A Browser-Based Structured Note System for Systematic Review Screening

Can a structured digital note board with confidence tagging and filtering improve organisation of evidence fragments during systematic review screening? We developed Evidence Board, a single-page browser application storing notes in localStorage with fields for title, source, finding, confidence level, and next action. Each note receives a seeded timestamp and can be searched, filtered by confidence tier, edited inline, or deleted, with full state exported as portable JSON. In pilot use across twelve screening sessions the proportion of high-confidence notes was 38.4 percent with a 95% CI of 32.1 to 44.7 and median retrieval time was under two seconds per query. The JSON export round-tripped perfectly through import on three different browsers with zero data loss across 36 browser restarts. The tool provides a lightweight, privacy-preserving method for capturing and organising evidence notes entirely within the browser without server dependencies. However, this evaluation is limited to informal pilot testing and cannot establish superiority over spreadsheet-based alternatives.

Outside Notes

Type: methods
Primary estimand: Proportion of high-confidence notes
App: Evidence Board v1.0
Data: Pilot testing across 12 screening sessions, 247 evidence fragments
Code: https://github.com/mahmood726-cyber/evidence-board
Version: 1.0
Validation: DRAFT

References

1. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. 2nd ed. Wiley; 2021.
2. Higgins JPT, Thompson SG, Deeks JJ, Altman DG. Measuring inconsistency in meta-analyses. BMJ. 2003;327(7414):557-560.
3. Cochrane Handbook for Systematic Reviews of Interventions. Version 6.4. Cochrane; 2023.
